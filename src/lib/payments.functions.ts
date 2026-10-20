import { createServerFn } from "@tanstack/react-start";

import { requireActiveUser, requirePermission } from "./authz-middleware";
import { fromPaise, toPaise } from "./money";
import {
  cancelSchema,
  idSchema,
  openPurchasesSchema,
  paymentListSchema,
  paymentSaveSchema,
  saleIdSchema,
  type MoneyStatus,
  type MoneyType,
  type PaymentMethod,
} from "./payment-schemas";
import { assertSaleNotCancelled, assertVendorSelectable } from "./sales-items.helpers";

/**
 * Payment numbers, creators, timestamps and every allocation limit are enforced
 * by database triggers. Totals are aggregated here in exact paise from text.
 */

const PAYMENT_SELECT =
  "id, payment_number, vendor_id, sale_id, payment_type, payment_date, amount_inr::text, method, reference, notes, status, cancel_reason, created_by, created_at, updated_at, account_id, cleared, account:accounts(id, name), vendor:vendors(id, name, is_active), sale:sales(id, booking_number, status, client:clients(name)), allocations:vendor_payment_allocations(id, purchase_id, amount_inr::text, purchase:purchases(id, purchase_number, status, sale_id, vendor_invoice_number, amount_inr::text, sale:sales(booking_number)))";

type AllocationRaw = {
  id: string;
  purchase_id: string;
  amount_inr: string;
  purchase: {
    id: string;
    purchase_number: string;
    status: string;
    sale_id: string;
    vendor_invoice_number: string | null;
    amount_inr: string;
    sale: { booking_number: string } | null;
  } | null;
};

type PaymentRaw = {
  id: string;
  payment_number: string;
  vendor_id: string;
  sale_id: string | null;
  payment_type: MoneyType;
  payment_date: string;
  amount_inr: string;
  method: PaymentMethod;
  reference: string | null;
  notes: string | null;
  status: MoneyStatus;
  cancel_reason: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  account_id: string;
  cleared: boolean;
  account: { id: string; name: string } | null;
  vendor: { id: string; name: string; is_active: boolean } | null;
  sale: {
    id: string;
    booking_number: string;
    status: string;
    client: { name: string } | null;
  } | null;
  allocations: AllocationRaw[];
};

export type PaymentRow = PaymentRaw & { allocated: string; unallocated: string };

function shape(row: PaymentRaw): PaymentRow {
  const live = row.allocations.filter((a) => a.purchase?.status === "recorded");
  const allocated = live.reduce((sum, a) => sum + toPaise(a.amount_inr), 0n);
  return {
    ...row,
    allocated: fromPaise(row.status === "recorded" ? allocated : 0n),
    unallocated: fromPaise(row.status === "recorded" ? toPaise(row.amount_inr) - allocated : 0n),
  };
}

export const listVendorPayments = createServerFn({ method: "POST" })
  .middleware([requireActiveUser])
  .inputValidator((input: unknown) => paymentListSchema.parse(input))
  .handler(async ({ data, context }) => {
    requirePermission(context, "payments.read");
    let query = context.supabase
      .from("vendor_payments")
      .select(PAYMENT_SELECT)
      .order("payment_date", { ascending: false })
      .order("created_at", { ascending: false });
    if (data.vendor_id) query = query.eq("vendor_id", data.vendor_id);
    if (data.sale_id) query = query.eq("sale_id", data.sale_id);
    if (data.payment_type) query = query.eq("payment_type", data.payment_type);
    if (data.status) query = query.eq("status", data.status);
    if (data.from) query = query.gte("payment_date", data.from);
    if (data.to) query = query.lte("payment_date", data.to);
    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);
    return ((rows ?? []) as unknown as PaymentRaw[]).map(shape);
  });

export const getVendorPayment = createServerFn({ method: "POST" })
  .middleware([requireActiveUser])
  .inputValidator((input: unknown) => idSchema.parse(input))
  .handler(async ({ data, context }) => {
    requirePermission(context, "payments.read");
    const { data: row, error } = await context.supabase
      .from("vendor_payments")
      .select(PAYMENT_SELECT)
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Payment not found");
    return shape(row as unknown as PaymentRaw);
  });

export type OpenPurchaseRow = {
  id: string;
  purchase_number: string;
  sale_id: string;
  booking_number: string | null;
  vendor_invoice_number: string | null;
  invoice_date: string;
  amount_inr: string;
  /** Outstanding excluding the payment being edited. */
  outstanding: string;
  current_allocation: string;
};

/** Recorded purchases of a vendor with their outstanding balance, oldest first. */
export const listOpenPurchases = createServerFn({ method: "POST" })
  .middleware([requireActiveUser])
  .inputValidator((input: unknown) => openPurchasesSchema.parse(input))
  .handler(async ({ data, context }) => {
    requirePermission(context, "payments.read");
    requirePermission(context, "purchases.read");
    let query = context.supabase
      .from("purchases")
      .select(
        "id, purchase_number, sale_id, vendor_invoice_number, invoice_date, amount_inr::text, created_at, sale:sales(booking_number), allocations:vendor_payment_allocations(payment_id, amount_inr::text, payment:vendor_payments(status))",
      )
      .eq("vendor_id", data.vendor_id)
      .eq("status", "recorded")
      .order("invoice_date", { ascending: true })
      .order("created_at", { ascending: true });
    if (data.sale_id) query = query.eq("sale_id", data.sale_id);
    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);
    const result: OpenPurchaseRow[] = [];
    for (const row of (rows ?? []) as unknown as {
      id: string;
      purchase_number: string;
      sale_id: string;
      vendor_invoice_number: string | null;
      invoice_date: string;
      amount_inr: string;
      sale: { booking_number: string } | null;
      allocations: { payment_id: string; amount_inr: string; payment: { status: string } | null }[];
    }[]) {
      let other = 0n;
      let mine = 0n;
      for (const a of row.allocations) {
        if (a.payment?.status !== "recorded") continue;
        if (data.payment_id && a.payment_id === data.payment_id) mine += toPaise(a.amount_inr);
        else other += toPaise(a.amount_inr);
      }
      const outstanding = toPaise(row.amount_inr) - other;
      if (outstanding <= 0n && mine === 0n) continue;
      result.push({
        id: row.id,
        purchase_number: row.purchase_number,
        sale_id: row.sale_id,
        booking_number: row.sale?.booking_number ?? null,
        vendor_invoice_number: row.vendor_invoice_number,
        invoice_date: row.invoice_date,
        amount_inr: row.amount_inr,
        outstanding: fromPaise(outstanding),
        current_allocation: fromPaise(mine),
      });
    }
    return result;
  });

export const saveVendorPayment = createServerFn({ method: "POST" })
  .middleware([requireActiveUser])
  .inputValidator((input: unknown) => paymentSaveSchema.parse(input))
  .handler(async ({ data, context }) => {
    // Operations may enter new payments from the daily entry screen.
    if (data.id || (!context.isAdmin && !context.permissions.includes("payments.enter"))) {
      requirePermission(context, "payments.manage");
    }
    const { values } = data;
    if (data.id) {
      const { data: existing, error } = await context.supabase
        .from("vendor_payments")
        .select("id, status, vendor_id, sale_id")
        .eq("id", data.id)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!existing) throw new Error("Payment not found");
      if (existing.status === "cancelled") throw new Error("A cancelled payment can't be changed");
      if (values.vendor_id !== existing.vendor_id) {
        await assertVendorSelectable(context.supabase, values.vendor_id);
      }
      if (values.sale_id && values.sale_id !== existing.sale_id) {
        await assertSaleNotCancelled(context.supabase, values.sale_id);
      }
    } else {
      await assertVendorSelectable(context.supabase, values.vendor_id);
      if (values.sale_id) await assertSaleNotCancelled(context.supabase, values.sale_id);
    }
    const ids = new Set<string>();
    let total = 0n;
    for (const a of data.allocations) {
      if (ids.has(a.purchase_id)) throw new Error("A purchase can only be allocated once");
      ids.add(a.purchase_id);
      total += toPaise(a.amount_inr);
    }
    if (total > toPaise(values.amount_inr)) {
      throw new Error("Allocations can't exceed the payment amount");
    }
    const { data: result, error } = await context.supabase.rpc("save_vendor_payment", {
      _id: (data.id ?? null) as unknown as string,
      _values: values,
      _allocations: data.allocations,
    });
    if (error) throw new Error(error.message);
    return result as { id: string; payment_number: string };
  });

export const cancelVendorPayment = createServerFn({ method: "POST" })
  .middleware([requireActiveUser])
  .inputValidator((input: unknown) => cancelSchema.parse(input))
  .handler(async ({ data, context }) => {
    requirePermission(context, "payments.manage");
    const { data: existing, error: readError } = await context.supabase
      .from("vendor_payments")
      .select("id, status")
      .eq("id", data.id)
      .maybeSingle();
    if (readError) throw new Error(readError.message);
    if (!existing) throw new Error("Payment not found");
    if (existing.status === "cancelled") throw new Error("This payment is already cancelled");
    const { error } = await context.supabase
      .from("vendor_payments")
      .update({ status: "cancelled", cancel_reason: data.reason })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

/** Totals for the Payments page header. */
export const getVendorPaymentSummary = createServerFn({ method: "POST" })
  .middleware([requireActiveUser])
  .handler(async ({ context }) => {
    requirePermission(context, "payments.read");
    requirePermission(context, "purchases.read");
    const [purchases, payments, allocations] = await Promise.all([
      context.supabase.from("purchases").select("id, amount_inr::text").eq("status", "recorded"),
      context.supabase
        .from("vendor_payments")
        .select("id, amount_inr::text")
        .eq("status", "recorded"),
      context.supabase
        .from("vendor_payment_allocations")
        .select("payment_id, purchase_id, amount_inr::text"),
    ]);
    if (purchases.error) throw new Error(purchases.error.message);
    if (payments.error) throw new Error(payments.error.message);
    if (allocations.error) throw new Error(allocations.error.message);
    const livePurchases = new Set((purchases.data ?? []).map((p) => p.id));
    const livePayments = new Set((payments.data ?? []).map((p) => p.id));
    let purchaseTotal = 0n;
    for (const p of (purchases.data ?? []) as unknown as { amount_inr: string }[]) {
      purchaseTotal += toPaise(p.amount_inr);
    }
    let paymentTotal = 0n;
    for (const p of (payments.data ?? []) as unknown as { amount_inr: string }[]) {
      paymentTotal += toPaise(p.amount_inr);
    }
    let allocated = 0n;
    for (const a of (allocations.data ?? []) as unknown as {
      payment_id: string;
      purchase_id: string;
      amount_inr: string;
    }[]) {
      if (livePayments.has(a.payment_id) && livePurchases.has(a.purchase_id)) {
        allocated += toPaise(a.amount_inr);
      }
    }
    return {
      outstanding_to_vendors: fromPaise(purchaseTotal - allocated),
      unallocated_payments: fromPaise(paymentTotal - allocated),
    };
  });

/**
 * Paid to vendors for a booking: payments linked to it, plus allocations to its
 * purchases from payments not linked to any booking (no double counting).
 */
export const getBookingVendorPaid = createServerFn({ method: "POST" })
  .middleware([requireActiveUser])
  .inputValidator((input: unknown) => saleIdSchema.parse(input))
  .handler(async ({ data, context }) => {
    requirePermission(context, "payments.read");
    const [linked, purchases] = await Promise.all([
      context.supabase
        .from("vendor_payments")
        .select("amount_inr::text")
        .eq("sale_id", data.sale_id)
        .eq("status", "recorded"),
      context.supabase
        .from("purchases")
        .select(
          "id, allocations:vendor_payment_allocations(amount_inr::text, payment:vendor_payments(status, sale_id))",
        )
        .eq("sale_id", data.sale_id)
        .eq("status", "recorded"),
    ]);
    if (linked.error) throw new Error(linked.error.message);
    if (purchases.error) throw new Error(purchases.error.message);
    let total = 0n;
    for (const p of (linked.data ?? []) as unknown as { amount_inr: string }[]) {
      total += toPaise(p.amount_inr);
    }
    for (const p of (purchases.data ?? []) as unknown as {
      allocations: {
        amount_inr: string;
        payment: { status: string; sale_id: string | null } | null;
      }[];
    }[]) {
      for (const a of p.allocations) {
        if (a.payment?.status === "recorded" && a.payment.sale_id === null) {
          total += toPaise(a.amount_inr);
        }
      }
    }
    return { paid_to_vendors: fromPaise(total) };
  });
