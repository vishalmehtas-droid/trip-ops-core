import { createServerFn } from "@tanstack/react-start";

import { requireActiveUser, requirePermission } from "./authz-middleware";
import {
  bookingVarianceSchema,
  purchaseCancelSchema,
  purchaseCreateSchema,
  purchaseIdSchema,
  purchaseListSchema,
  purchaseUpdateSchema,
  type PurchaseStatus,
} from "./purchase-schemas";
import { assertSaleEditable, assertVendorSelectable } from "./sales-items.helpers";

/**
 * Purchase numbers, creators, timestamps, INR amounts and status rules are all
 * enforced by database triggers; these functions only validate and pass through.
 * Money is read as text so totals are aggregated exactly (paise), never as floats.
 */

const PURCHASE_SELECT =
  "id, purchase_number, sale_id, vendor_id, vendor_invoice_number, invoice_date, currency_code, exchange_rate::text, amount::text, amount_inr::text, notes, status, cancel_reason, created_by, created_at, updated_at, vendor:vendors(id, name, is_active), sale:sales(id, booking_number, status, client:clients(id, name))";

export type PurchaseRow = {
  id: string;
  purchase_number: string;
  sale_id: string;
  vendor_id: string;
  vendor_invoice_number: string | null;
  invoice_date: string;
  currency_code: string;
  exchange_rate: string;
  amount: string;
  amount_inr: string;
  notes: string | null;
  status: PurchaseStatus;
  cancel_reason: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  vendor: { id: string; name: string; is_active: boolean } | null;
  sale: {
    id: string;
    booking_number: string;
    status: string;
    client: { id: string; name: string } | null;
  } | null;
};

export const listPurchases = createServerFn({ method: "POST" })
  .middleware([requireActiveUser])
  .inputValidator((input: unknown) => purchaseListSchema.parse(input))
  .handler(async ({ data, context }) => {
    requirePermission(context, "purchases.read");
    let query = context.supabase
      .from("purchases")
      .select(PURCHASE_SELECT)
      .order("invoice_date", { ascending: false })
      .order("created_at", { ascending: false });
    if (data.sale_id) query = query.eq("sale_id", data.sale_id);
    if (data.vendor_id) query = query.eq("vendor_id", data.vendor_id);
    if (data.status) query = query.eq("status", data.status);
    if (data.from) query = query.gte("invoice_date", data.from);
    if (data.to) query = query.lte("invoice_date", data.to);
    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);
    return (rows ?? []) as unknown as PurchaseRow[];
  });

export const getPurchase = createServerFn({ method: "POST" })
  .middleware([requireActiveUser])
  .inputValidator((input: unknown) => purchaseIdSchema.parse(input))
  .handler(async ({ data, context }) => {
    requirePermission(context, "purchases.read");
    const { data: row, error } = await context.supabase
      .from("purchases")
      .select(PURCHASE_SELECT)
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Purchase not found");
    return row as unknown as PurchaseRow;
  });

export const createPurchase = createServerFn({ method: "POST" })
  .middleware([requireActiveUser])
  .inputValidator((input: unknown) => purchaseCreateSchema.parse(input))
  .handler(async ({ data, context }) => {
    requirePermission(context, "purchases.manage");
    await assertSaleEditable(context.supabase, data.sale_id);
    await assertVendorSelectable(context.supabase, data.values.vendor_id);
    const { data: row, error } = await context.supabase
      .from("purchases")
      .insert({
        sale_id: data.sale_id,
        vendor_id: data.values.vendor_id,
        vendor_invoice_number: data.values.vendor_invoice_number,
        ...(data.values.invoice_date ? { invoice_date: data.values.invoice_date } : {}),
        currency_code: data.values.currency_code,
        exchange_rate: data.values.exchange_rate,
        amount: data.values.amount,
        notes: data.values.notes,
      })
      .select("id, purchase_number")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const updatePurchase = createServerFn({ method: "POST" })
  .middleware([requireActiveUser])
  .inputValidator((input: unknown) => purchaseUpdateSchema.parse(input))
  .handler(async ({ data, context }) => {
    requirePermission(context, "purchases.manage");
    const { data: existing, error: readError } = await context.supabase
      .from("purchases")
      .select("id, sale_id, vendor_id, status")
      .eq("id", data.id)
      .maybeSingle();
    if (readError) throw new Error(readError.message);
    if (!existing) throw new Error("Purchase not found");
    if (existing.status === "cancelled") throw new Error("A cancelled purchase can't be changed");
    await assertSaleEditable(context.supabase, existing.sale_id);
    if (data.values.vendor_id !== existing.vendor_id) {
      await assertVendorSelectable(context.supabase, data.values.vendor_id);
    }
    const { error } = await context.supabase
      .from("purchases")
      .update({
        vendor_id: data.values.vendor_id,
        vendor_invoice_number: data.values.vendor_invoice_number,
        ...(data.values.invoice_date ? { invoice_date: data.values.invoice_date } : {}),
        currency_code: data.values.currency_code,
        exchange_rate: data.values.exchange_rate,
        amount: data.values.amount,
        notes: data.values.notes,
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const cancelPurchase = createServerFn({ method: "POST" })
  .middleware([requireActiveUser])
  .inputValidator((input: unknown) => purchaseCancelSchema.parse(input))
  .handler(async ({ data, context }) => {
    requirePermission(context, "purchases.manage");
    const { data: existing, error: readError } = await context.supabase
      .from("purchases")
      .select("id, sale_id, status")
      .eq("id", data.id)
      .maybeSingle();
    if (readError) throw new Error(readError.message);
    if (!existing) throw new Error("Purchase not found");
    if (existing.status === "cancelled") throw new Error("This purchase is already cancelled");
    await assertSaleEditable(context.supabase, existing.sale_id);
    const { error } = await context.supabase
      .from("purchases")
      .update({ status: "cancelled", cancel_reason: data.reason })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

function paise(value: string | null | undefined): bigint {
  if (!value) return 0n;
  const negative = value.startsWith("-");
  const [whole = "0", fraction = ""] = (negative ? value.slice(1) : value).split(".");
  const absolute = BigInt(whole || "0") * 100n + BigInt(fraction.padEnd(2, "0").slice(0, 2) || "0");
  return negative ? -absolute : absolute;
}

function toDecimal(value: bigint) {
  const sign = value < 0n ? "-" : "";
  const absolute = value < 0n ? -value : value;
  return `${sign}${absolute / 100n}.${String(absolute % 100n).padStart(2, "0")}`;
}

/** Percentage of `part` over `base`, to two decimals, computed in integers. */
function percent(part: bigint, base: bigint): string | null {
  if (base === 0n) return null;
  const negative = part < 0n;
  const absolute = negative ? -part : part;
  const scaled = (absolute * 20000n + base) / (base * 2n);
  return toDecimal(negative ? -scaled : scaled);
}

export type VendorVarianceRow = {
  vendor_id: string | null;
  vendor_name: string;
  expected: string;
  actual: string;
  variance: string;
  has_expected: boolean;
  has_purchase: boolean;
};

export const getBookingVariance = createServerFn({ method: "POST" })
  .middleware([requireActiveUser])
  .inputValidator((input: unknown) => bookingVarianceSchema.parse(input))
  .handler(async ({ data, context }) => {
    requirePermission(context, "sales.read");
    requirePermission(context, "purchases.read");

    const [costs, purchases, pricing] = await Promise.all([
      context.supabase
        .from("sale_costs")
        .select("vendor_id, base_currency_cost::text, vendor:vendors(name)")
        .eq("sale_id", data.sale_id),
      context.supabase
        .from("purchases")
        .select("vendor_id, amount_inr::text, vendor:vendors(name)")
        .eq("sale_id", data.sale_id)
        .eq("status", "recorded"),
      context.supabase
        .from("sale_pricing")
        .select("expected_gross_profit::text")
        .eq("sale_id", data.sale_id)
        .maybeSingle(),
    ]);
    if (costs.error) throw new Error(costs.error.message);
    if (purchases.error) throw new Error(purchases.error.message);
    if (pricing.error) throw new Error(pricing.error.message);

    type Bucket = {
      name: string;
      expected: bigint;
      actual: bigint;
      hasExpected: boolean;
      hasPurchase: boolean;
    };
    const buckets = new Map<string, Bucket>();
    const bucket = (vendorId: string | null, name: string | undefined) => {
      const key = vendorId ?? "none";
      let entry = buckets.get(key);
      if (!entry) {
        entry = {
          name: name ?? (vendorId ? "Unknown vendor" : "No vendor"),
          expected: 0n,
          actual: 0n,
          hasExpected: false,
          hasPurchase: false,
        };
        buckets.set(key, entry);
      }
      return entry;
    };

    let expectedTotal = 0n;
    for (const row of (costs.data ?? []) as unknown as {
      vendor_id: string | null;
      base_currency_cost: string;
      vendor: { name: string } | null;
    }[]) {
      const amount = paise(row.base_currency_cost);
      expectedTotal += amount;
      const entry = bucket(row.vendor_id, row.vendor?.name);
      entry.expected += amount;
      entry.hasExpected = true;
    }

    let actualTotal = 0n;
    for (const row of (purchases.data ?? []) as unknown as {
      vendor_id: string;
      amount_inr: string;
      vendor: { name: string } | null;
    }[]) {
      const amount = paise(row.amount_inr);
      actualTotal += amount;
      const entry = bucket(row.vendor_id, row.vendor?.name);
      entry.actual += amount;
      entry.hasPurchase = true;
    }

    const difference = actualTotal - expectedTotal;
    const expectedProfit = paise(
      (pricing.data as unknown as { expected_gross_profit: string } | null)
        ?.expected_gross_profit ?? "0",
    );
    const actualProfit = expectedProfit - difference;

    const vendors: VendorVarianceRow[] = [...buckets.entries()]
      .map(([key, entry]) => ({
        vendor_id: key === "none" ? null : key,
        vendor_name: entry.name,
        expected: toDecimal(entry.expected),
        actual: toDecimal(entry.actual),
        variance: toDecimal(entry.actual - entry.expected),
        has_expected: entry.hasExpected,
        has_purchase: entry.hasPurchase,
      }))
      .sort((a, b) => a.vendor_name.localeCompare(b.vendor_name));

    return {
      expected_cost: toDecimal(expectedTotal),
      actual_cost: toDecimal(actualTotal),
      difference: toDecimal(difference),
      difference_percent: percent(difference, expectedTotal),
      expected_profit: toDecimal(expectedProfit),
      actual_profit: toDecimal(actualProfit),
      vendors,
    };
  });
