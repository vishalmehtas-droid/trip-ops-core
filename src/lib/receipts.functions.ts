import { createServerFn } from "@tanstack/react-start";

import { requireActiveUser, requirePermission } from "./authz-middleware";
import { fromPaise, toPaise } from "./money";
import {
  cancelSchema,
  idSchema,
  receiptCreateSchema,
  receiptListSchema,
  receiptUpdateSchema,
  saleIdSchema,
  type MoneyStatus,
  type MoneyType,
  type PaymentMethod,
  type ReceiptPaymentStatus,
} from "./payment-schemas";
import { assertSaleNotCancelled } from "./sales-items.helpers";

/** Receipt numbers, creators and the customer-payable cap are enforced by DB triggers. */

const RECEIPT_SELECT =
  "id, receipt_number, sale_id, payment_type, receipt_date, amount_inr::text, method, reference, notes, status, cancel_reason, created_by, created_at, updated_at, account_id, cleared, client_id, client:clients(id, name), account:accounts(id, name), sale:sales(id, booking_number, status, client:clients(id, name)), allocations:customer_receipt_allocations(sale_id, amount_inr::text, sale:sales(booking_number))";

export type ReceiptRow = {
  id: string;
  receipt_number: string;
  sale_id: string | null;
  client_id: string;
  account_id: string;
  cleared: boolean;
  client: { id: string; name: string } | null;
  account: { id: string; name: string } | null;
  allocations: { sale_id: string; amount_inr: string; sale: { booking_number: string } | null }[];
  payment_type: MoneyType;
  receipt_date: string;
  amount_inr: string;
  method: PaymentMethod;
  reference: string | null;
  notes: string | null;
  status: MoneyStatus;
  cancel_reason: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  sale: {
    id: string;
    booking_number: string;
    status: string;
    client: { id: string; name: string } | null;
  } | null;
};

export type BookingReceivable = {
  sale_id: string;
  booking_number: string;
  client_name: string | null;
  sale_status: string;
  customer_payable: string;
  received: string;
  advance_received: string;
  outstanding: string;
  payment_status: ReceiptPaymentStatus;
};

/** Client advances linked to bookings, from recorded receipts only. */
async function linkedAdvances(
  supabase: { from: (t: "customer_receipt_allocations") => any }, // eslint-disable-line @typescript-eslint/no-explicit-any
  saleId: string | null,
): Promise<{ sale_id: string; amount_inr: string }[]> {
  let q = supabase
    .from("customer_receipt_allocations")
    .select("sale_id, amount_inr::text, receipt:customer_receipts!inner(status)")
    .eq("receipt.status", "recorded");
  if (saleId) q = q.eq("sale_id", saleId);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as { sale_id: string; amount_inr: string }[];
}

function paymentStatus(payable: bigint, received: bigint): ReceiptPaymentStatus {
  if (received <= 0n) return "unpaid";
  if (received >= payable) return "paid";
  return "partly_paid";
}

export const listReceipts = createServerFn({ method: "POST" })
  .middleware([requireActiveUser])
  .inputValidator((input: unknown) => receiptListSchema.parse(input))
  .handler(async ({ data, context }) => {
    requirePermission(context, "receipts.read");
    let query = context.supabase
      .from("customer_receipts")
      .select(RECEIPT_SELECT)
      .order("receipt_date", { ascending: false })
      .order("created_at", { ascending: false });
    if (data.sale_id) query = query.eq("sale_id", data.sale_id);
    if (data.client_id) query = query.eq("client_id", data.client_id);
    if (data.payment_type) query = query.eq("payment_type", data.payment_type);
    if (data.status) query = query.eq("status", data.status);
    if (data.from) query = query.gte("receipt_date", data.from);
    if (data.to) query = query.lte("receipt_date", data.to);
    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);
    return (rows ?? []) as unknown as ReceiptRow[];
  });

export const getReceipt = createServerFn({ method: "POST" })
  .middleware([requireActiveUser])
  .inputValidator((input: unknown) => idSchema.parse(input))
  .handler(async ({ data, context }) => {
    requirePermission(context, "receipts.read");
    const { data: row, error } = await context.supabase
      .from("customer_receipts")
      .select(RECEIPT_SELECT)
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Receipt not found");
    return row as unknown as ReceiptRow;
  });

export const createReceipt = createServerFn({ method: "POST" })
  .middleware([requireActiveUser])
  .inputValidator((input: unknown) => receiptCreateSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (!context.isAdmin && !context.permissions.includes("receipts.enter_own")) {
      requirePermission(context, "receipts.manage");
    }
    if (data.sale_id) await assertSaleNotCancelled(context.supabase, data.sale_id);
    const { values } = data;
    const { data: row, error } = await context.supabase
      .from("customer_receipts")
      .insert({
        sale_id: data.sale_id,
        // The database fills the client from the booking when one is linked.
        ...(data.sale_id ? {} : { client_id: data.client_id }),
        account_id: values.account_id,
        payment_type: values.payment_type,
        ...(values.receipt_date ? { receipt_date: values.receipt_date } : {}),
        amount_inr: values.amount_inr as unknown as number,
        method: values.method,
        reference: values.reference,
        notes: values.notes,
      })
      .select("id, receipt_number")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const updateReceipt = createServerFn({ method: "POST" })
  .middleware([requireActiveUser])
  .inputValidator((input: unknown) => receiptUpdateSchema.parse(input))
  .handler(async ({ data, context }) => {
    requirePermission(context, "receipts.manage");
    const { data: existing, error: readError } = await context.supabase
      .from("customer_receipts")
      .select("id, sale_id, status")
      .eq("id", data.id)
      .maybeSingle();
    if (readError) throw new Error(readError.message);
    if (!existing) throw new Error("Receipt not found");
    if (existing.status === "cancelled") throw new Error("A cancelled receipt can't be changed");
    if (existing.sale_id) await assertSaleNotCancelled(context.supabase, existing.sale_id);
    const { values } = data;
    const { error } = await context.supabase
      .from("customer_receipts")
      .update({
        account_id: values.account_id,
        payment_type: values.payment_type,
        ...(values.receipt_date ? { receipt_date: values.receipt_date } : {}),
        amount_inr: values.amount_inr as unknown as number,
        method: values.method,
        reference: values.reference,
        notes: values.notes,
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const cancelReceipt = createServerFn({ method: "POST" })
  .middleware([requireActiveUser])
  .inputValidator((input: unknown) => cancelSchema.parse(input))
  .handler(async ({ data, context }) => {
    requirePermission(context, "receipts.manage");
    const { data: existing, error: readError } = await context.supabase
      .from("customer_receipts")
      .select("id, status")
      .eq("id", data.id)
      .maybeSingle();
    if (readError) throw new Error(readError.message);
    if (!existing) throw new Error("Receipt not found");
    if (existing.status === "cancelled") throw new Error("This receipt is already cancelled");
    const { error } = await context.supabase
      .from("customer_receipts")
      .update({ status: "cancelled", cancel_reason: data.reason })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

/** Per-booking payable / received / outstanding, plus the overall receivable. */
export const getReceivables = createServerFn({ method: "POST" })
  .middleware([requireActiveUser])
  .handler(async ({ context }) => {
    requirePermission(context, "receipts.read");
    requirePermission(context, "sales.read");
    const [sales, receipts, links] = await Promise.all([
      context.supabase
        .from("sales")
        .select(
          "id, booking_number, status, client:clients(name), pricing:sale_pricing(customer_payable::text)",
        ),
      context.supabase
        .from("customer_receipts")
        .select("sale_id, payment_type, amount_inr::text")
        .eq("status", "recorded")
        .not("sale_id", "is", null),
      linkedAdvances(context.supabase, null),
    ]);
    if (sales.error) throw new Error(sales.error.message);
    if (receipts.error) throw new Error(receipts.error.message);
    for (const l of links) {
      (receipts.data as unknown as { sale_id: string; payment_type: string; amount_inr: string }[]).push({
        sale_id: l.sale_id,
        payment_type: "advance",
        amount_inr: l.amount_inr,
      });
    }

    const received = new Map<string, { total: bigint; advance: bigint }>();
    for (const r of (receipts.data ?? []) as unknown as {
      sale_id: string;
      payment_type: string;
      amount_inr: string;
    }[]) {
      const entry = received.get(r.sale_id) ?? { total: 0n, advance: 0n };
      const amount = toPaise(r.amount_inr);
      entry.total += amount;
      if (r.payment_type === "advance") entry.advance += amount;
      received.set(r.sale_id, entry);
    }

    let totalOutstanding = 0n;
    const bookings: BookingReceivable[] = [];
    for (const s of (sales.data ?? []) as unknown as {
      id: string;
      booking_number: string;
      status: string;
      client: { name: string } | null;
      pricing: { customer_payable: string } | { customer_payable: string }[] | null;
    }[]) {
      const pricing = Array.isArray(s.pricing) ? s.pricing[0] : s.pricing;
      const payable = toPaise(pricing?.customer_payable ?? "0");
      const got = received.get(s.id) ?? { total: 0n, advance: 0n };
      const outstanding = payable - got.total;
      if (s.status !== "cancelled") totalOutstanding += outstanding;
      bookings.push({
        sale_id: s.id,
        booking_number: s.booking_number,
        client_name: s.client?.name ?? null,
        sale_status: s.status,
        customer_payable: fromPaise(payable),
        received: fromPaise(got.total),
        advance_received: fromPaise(got.advance),
        outstanding: fromPaise(outstanding),
        payment_status: paymentStatus(payable, got.total),
      });
    }
    return { total_outstanding: fromPaise(totalOutstanding), bookings };
  });

export const getBookingReceivable = createServerFn({ method: "POST" })
  .middleware([requireActiveUser])
  .inputValidator((input: unknown) => saleIdSchema.parse(input))
  .handler(async ({ data, context }) => {
    requirePermission(context, "receipts.read");
    const [pricing, receipts, links] = await Promise.all([
      context.supabase
        .from("sale_pricing")
        .select("customer_payable::text")
        .eq("sale_id", data.sale_id)
        .maybeSingle(),
      context.supabase
        .from("customer_receipts")
        .select("payment_type, amount_inr::text")
        .eq("sale_id", data.sale_id)
        .eq("status", "recorded"),
      linkedAdvances(context.supabase, data.sale_id),
    ]);
    if (pricing.error) throw new Error(pricing.error.message);
    if (receipts.error) throw new Error(receipts.error.message);
    for (const l of links) {
      (receipts.data as unknown as { payment_type: string; amount_inr: string }[]).push({
        payment_type: "advance",
        amount_inr: l.amount_inr,
      });
    }
    const payable = toPaise(
      (pricing.data as unknown as { customer_payable: string } | null)?.customer_payable ?? "0",
    );
    let total = 0n;
    let advance = 0n;
    for (const r of (receipts.data ?? []) as unknown as {
      payment_type: string;
      amount_inr: string;
    }[]) {
      const amount = toPaise(r.amount_inr);
      total += amount;
      if (r.payment_type === "advance") advance += amount;
    }
    return {
      customer_payable: fromPaise(payable),
      received: fromPaise(total),
      advance_received: fromPaise(advance),
      outstanding: fromPaise(payable - total),
      payment_status: paymentStatus(payable, total),
    };
  });
