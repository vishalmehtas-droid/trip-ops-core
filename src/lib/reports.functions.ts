import { createServerFn } from "@tanstack/react-start";

import { requireActiveUser } from "./authz-middleware";
import { fromPaise, toPaise } from "./money";
import {
  canAccessLedger,
  canAccessReport,
  clientLedgerSchema,
  dateRangeSchema,
  profitabilitySchema,
  vendorLedgerSchema,
} from "./report-schemas";

/**
 * Ledger reports are read-only aggregations over existing tables. All queries
 * run as the caller, so existing RLS applies; the role rules below are the
 * additional gate (Admin/Accounts: everything, Sales/Operations: client
 * ledger for clients with their own bookings only, Viewer: no access).
 */

export type LedgerRow = {
  id: string;
  date: string;
  kind: "booking" | "receipt" | "purchase" | "payment";
  reference: string;
  detail: string | null;
  debit: string;
  credit: string;
  balance: string;
  sale_id: string | null;
};

export type LedgerResult = {
  party_name: string;
  rows: LedgerRow[];
  total_debit: string;
  total_credit: string;
  closing_balance: string;
};

type Entry = {
  id: string;
  date: string;
  sort: string;
  kind: LedgerRow["kind"];
  reference: string;
  detail: string | null;
  debit: bigint;
  credit: bigint;
  sale_id: string | null;
};

function toResult(partyName: string, entries: Entry[], sign: 1n | -1n): LedgerResult {
  entries.sort((a, b) =>
    a.date === b.date ? a.sort.localeCompare(b.sort) : a.date.localeCompare(b.date),
  );
  let balance = 0n;
  let totalDebit = 0n;
  let totalCredit = 0n;
  const rows: LedgerRow[] = entries.map((entry) => {
    balance += (entry.debit - entry.credit) * sign;
    totalDebit += entry.debit;
    totalCredit += entry.credit;
    return {
      id: entry.id,
      date: entry.date,
      kind: entry.kind,
      reference: entry.reference,
      detail: entry.detail,
      debit: fromPaise(entry.debit),
      credit: fromPaise(entry.credit),
      balance: fromPaise(balance),
      sale_id: entry.sale_id,
    };
  });
  return {
    party_name: partyName,
    rows,
    total_debit: fromPaise(totalDebit),
    total_credit: fromPaise(totalCredit),
    closing_balance: fromPaise(balance),
  };
}

export const getClientLedger = createServerFn({ method: "POST" })
  .middleware([requireActiveUser])
  .inputValidator((input: unknown) => clientLedgerSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId, roles, isAdmin } = context;
    if (!canAccessLedger("client", roles, isAdmin)) {
      throw new Error("Forbidden: ledger reports are not available for your role");
    }
    const fullAccess = isAdmin || roles.includes("accounts");
    if (!fullAccess) {
      const { data: own, error } = await supabase
        .from("sales")
        .select("id")
        .eq("client_id", data.client_id)
        .eq("created_by", userId)
        .limit(1);
      if (error) throw new Error(error.message);
      if (!own || own.length === 0) {
        throw new Error("Forbidden: you can only view ledgers for clients with your bookings");
      }
    }

    const { data: client, error: clientError } = await supabase
      .from("clients")
      .select("name")
      .eq("id", data.client_id)
      .maybeSingle();
    if (clientError) throw new Error(clientError.message);
    if (!client) throw new Error("Client not found");

    let salesQuery = supabase
      .from("sales")
      .select(
        "id, booking_number, booking_date, status, created_at, pricing:sale_pricing(customer_payable::text)",
      )
      .eq("client_id", data.client_id);
    if (data.from) salesQuery = salesQuery.gte("booking_date", data.from);
    if (data.to) salesQuery = salesQuery.lte("booking_date", data.to);
    const { data: salesRows, error: salesError } = await salesQuery;
    if (salesError) throw new Error(salesError.message);

    // All recorded receipts for the client; the date range is applied locally
    // so cancelled bookings with receipts outside the range are still shown.
    const { data: receiptRows, error: receiptsError } = await supabase
      .from("customer_receipts")
      .select(
        "id, receipt_number, receipt_date, amount_inr::text, sale_id, created_at",
      )
      .eq("client_id", data.client_id)
      .eq("status", "recorded");
    if (receiptsError) throw new Error(receiptsError.message);

    type SaleRow = {
      id: string;
      booking_number: string;
      booking_date: string;
      status: string;
      created_at: string;
      pricing: { customer_payable: string } | { customer_payable: string }[] | null;
    };
    type ReceiptRow = {
      id: string;
      receipt_number: string;
      receipt_date: string;
      amount_inr: string;
      sale_id: string | null;
      created_at: string;
    };

    const receipts = (receiptRows ?? []) as unknown as ReceiptRow[];
    const receiptSaleIds = new Set(receipts.map((r) => r.sale_id));
    const inRange = (date: string) =>
      (!data.from || date >= data.from) && (!data.to || date <= data.to);

    const entries: Entry[] = [];
    for (const sale of (salesRows ?? []) as unknown as SaleRow[]) {
      if (sale.status === "cancelled" && !receiptSaleIds.has(sale.id)) continue;
      const pricing = Array.isArray(sale.pricing) ? sale.pricing[0] : sale.pricing;
      entries.push({
        id: sale.id,
        date: sale.booking_date,
        sort: sale.created_at,
        kind: "booking",
        reference: sale.booking_number,
        detail: sale.status === "cancelled" ? "Cancelled booking" : null,
        debit: toPaise(pricing?.customer_payable ?? "0"),
        credit: 0n,
        sale_id: sale.id,
      });
    }
    for (const receipt of receipts) {
      if (!inRange(receipt.receipt_date)) continue;
      entries.push({
        id: receipt.id,
        date: receipt.receipt_date,
        sort: receipt.created_at,
        kind: "receipt",
        reference: receipt.receipt_number,
        detail: receipt.sale_id ? null : "Advance",
        debit: 0n,
        credit: toPaise(receipt.amount_inr),
        sale_id: receipt.sale_id,
      });
    }
    return toResult((client as { name: string }).name, entries, 1n);
  });

export const getVendorLedger = createServerFn({ method: "POST" })
  .middleware([requireActiveUser])
  .inputValidator((input: unknown) => vendorLedgerSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, roles, isAdmin } = context;
    if (!canAccessLedger("vendor", roles, isAdmin)) {
      throw new Error("Forbidden: the vendor ledger is available to Admin and Accounts only");
    }

    const { data: vendor, error: vendorError } = await supabase
      .from("vendors")
      .select("name")
      .eq("id", data.vendor_id)
      .maybeSingle();
    if (vendorError) throw new Error(vendorError.message);
    if (!vendor) throw new Error("Vendor not found");

    let purchasesQuery = supabase
      .from("purchases")
      .select(
        "id, purchase_number, invoice_date, amount_inr::text, sale_id, created_at, sale:sales(booking_number)",
      )
      .eq("vendor_id", data.vendor_id)
      .neq("status", "cancelled");
    if (data.from) purchasesQuery = purchasesQuery.gte("invoice_date", data.from);
    if (data.to) purchasesQuery = purchasesQuery.lte("invoice_date", data.to);

    let paymentsQuery = supabase
      .from("vendor_payments")
      .select(
        "id, payment_number, payment_date, amount_inr::text, sale_id, created_at, sale:sales(booking_number)",
      )
      .eq("vendor_id", data.vendor_id)
      .eq("status", "recorded");
    if (data.from) paymentsQuery = paymentsQuery.gte("payment_date", data.from);
    if (data.to) paymentsQuery = paymentsQuery.lte("payment_date", data.to);

    const [purchasesResult, paymentsResult] = await Promise.all([purchasesQuery, paymentsQuery]);
    if (purchasesResult.error) throw new Error(purchasesResult.error.message);
    if (paymentsResult.error) throw new Error(paymentsResult.error.message);

    type PurchaseRow = {
      id: string;
      purchase_number: string;
      invoice_date: string;
      amount_inr: string;
      sale_id: string;
      created_at: string;
      sale: { booking_number: string } | null;
    };
    type PaymentRow = {
      id: string;
      payment_number: string;
      payment_date: string;
      amount_inr: string;
      sale_id: string | null;
      created_at: string;
      sale: { booking_number: string } | null;
    };

    const entries: Entry[] = [];
    for (const purchase of (purchasesResult.data ?? []) as unknown as PurchaseRow[]) {
      entries.push({
        id: purchase.id,
        date: purchase.invoice_date,
        sort: purchase.created_at,
        kind: "purchase",
        reference: purchase.purchase_number,
        detail: purchase.sale?.booking_number ?? null,
        debit: 0n,
        credit: toPaise(purchase.amount_inr),
        sale_id: purchase.sale_id,
      });
    }
    for (const payment of (paymentsResult.data ?? []) as unknown as PaymentRow[]) {
      entries.push({
        id: payment.id,
        date: payment.payment_date,
        sort: payment.created_at,
        kind: "payment",
        reference: payment.payment_number,
        detail: payment.sale?.booking_number ?? null,
        debit: toPaise(payment.amount_inr),
        credit: 0n,
        sale_id: payment.sale_id,
      });
    }
    // Balance is "what we owe the vendor": purchases raise it, payments lower it.
    return toResult((vendor as { name: string }).name, entries, -1n);
  });

/* ------------------------------------------------------------------ */
/* Period reports: cashflow, profitability, GST. Admin/Accounts only. */
/* ------------------------------------------------------------------ */

const MONTH_NAMES = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/** "2026-04" -> "Apr 2026" */
function monthLabel(month: string): string {
  const [year = "", mon = ""] = month.split("-");
  return `${MONTH_NAMES[Number(mon) - 1] ?? mon} ${year}`;
}

/** Percent with one decimal, computed in exact integer arithmetic. */
function percentString(part: bigint, whole: bigint): string {
  if (whole === 0n) return "0.0";
  const tenths = (part * 1000n) / whole;
  const sign = tenths < 0n ? "-" : "";
  const absolute = tenths < 0n ? -tenths : tenths;
  return `${sign}${absolute / 10n}.${absolute % 10n}`;
}

export type CashflowMonth = {
  month: string;
  label: string;
  money_in: string;
  money_out: string;
  net: string;
  cumulative: string;
};

export type CashflowResult = {
  receivable: string;
  payable: string;
  months: CashflowMonth[];
};

export const getCashflow = createServerFn({ method: "POST" })
  .middleware([requireActiveUser])
  .inputValidator((input: unknown) => dateRangeSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, roles, isAdmin } = context;
    if (!canAccessReport(roles, isAdmin)) {
      throw new Error("Forbidden: reports are available to Admin and Accounts only");
    }

    let receiptsQuery = supabase
      .from("customer_receipts")
      .select("receipt_date, amount_inr::text")
      .eq("status", "recorded");
    if (data.from) receiptsQuery = receiptsQuery.gte("receipt_date", data.from);
    if (data.to) receiptsQuery = receiptsQuery.lte("receipt_date", data.to);

    let paymentsQuery = supabase
      .from("vendor_payments")
      .select("payment_date, amount_inr::text")
      .eq("status", "recorded");
    if (data.from) paymentsQuery = paymentsQuery.gte("payment_date", data.from);
    if (data.to) paymentsQuery = paymentsQuery.lte("payment_date", data.to);

    // Outstanding totals are as-of-now figures, independent of the range.
    const [
      receiptsResult,
      paymentsResult,
      openSalesResult,
      allReceiptsResult,
      linkedAdvancesResult,
      purchasesResult,
      allPaymentsResult,
    ] = await Promise.all([
      receiptsQuery,
      paymentsQuery,
      supabase
        .from("sales")
        .select("id, pricing:sale_pricing(customer_payable::text)")
        .neq("status", "cancelled"),
      supabase
        .from("customer_receipts")
        .select("sale_id, amount_inr::text")
        .eq("status", "recorded"),
      // Client advances later linked to bookings also reduce what the customer owes.
      supabase
        .from("customer_receipt_allocations")
        .select("sale_id, amount_inr::text, receipt:customer_receipts!inner(status)")
        .eq("receipt.status", "recorded"),
      supabase.from("purchases").select("amount_inr::text").neq("status", "cancelled"),
      supabase.from("vendor_payments").select("amount_inr::text").eq("status", "recorded"),
    ]);
    for (const result of [
      receiptsResult,
      paymentsResult,
      openSalesResult,
      allReceiptsResult,
      linkedAdvancesResult,
      purchasesResult,
      allPaymentsResult,
    ]) {
      if (result.error) throw new Error(result.error.message);
    }

    const months = new Map<string, { moneyIn: bigint; moneyOut: bigint }>();
    const bucket = (date: string) => {
      const key = date.slice(0, 7);
      let entry = months.get(key);
      if (!entry) {
        entry = { moneyIn: 0n, moneyOut: 0n };
        months.set(key, entry);
      }
      return entry;
    };
    for (const row of (receiptsResult.data ?? []) as {
      receipt_date: string;
      amount_inr: string;
    }[]) {
      bucket(row.receipt_date).moneyIn += toPaise(row.amount_inr);
    }
    for (const row of (paymentsResult.data ?? []) as {
      payment_date: string;
      amount_inr: string;
    }[]) {
      bucket(row.payment_date).moneyOut += toPaise(row.amount_inr);
    }

    let cumulative = 0n;
    const monthRows: CashflowMonth[] = [...months.keys()].sort().map((month) => {
      const entry = months.get(month)!;
      const net = entry.moneyIn - entry.moneyOut;
      cumulative += net;
      return {
        month,
        label: monthLabel(month),
        money_in: fromPaise(entry.moneyIn),
        money_out: fromPaise(entry.moneyOut),
        net: fromPaise(net),
        cumulative: fromPaise(cumulative),
      };
    });

    // Receivable: customer payable on non-cancelled bookings minus their recorded receipts
    // and the recorded advances linked to them.
    const openSaleIds = new Set(
      ((openSalesResult.data ?? []) as { id: string }[]).map((row) => row.id),
    );
    let receivable = 0n;
    for (const row of (openSalesResult.data ?? []) as {
      id: string;
      pricing: { customer_payable: string } | { customer_payable: string }[] | null;
    }[]) {
      const pricing = Array.isArray(row.pricing) ? row.pricing[0] : row.pricing;
      receivable += toPaise(pricing?.customer_payable ?? "0");
    }
    for (const row of (allReceiptsResult.data ?? []) as { sale_id: string; amount_inr: string }[]) {
      if (openSaleIds.has(row.sale_id)) receivable -= toPaise(row.amount_inr);
    }
    for (const row of (linkedAdvancesResult.data ?? []) as {
      sale_id: string;
      amount_inr: string;
    }[]) {
      if (openSaleIds.has(row.sale_id)) receivable -= toPaise(row.amount_inr);
    }

    // Payable: non-cancelled purchases minus all recorded vendor payments.
    let payable = 0n;
    for (const row of (purchasesResult.data ?? []) as { amount_inr: string }[]) {
      payable += toPaise(row.amount_inr);
    }
    for (const row of (allPaymentsResult.data ?? []) as { amount_inr: string }[]) {
      payable -= toPaise(row.amount_inr);
    }

    return { receivable: fromPaise(receivable), payable: fromPaise(payable), months: monthRows };
  });

export type ProfitabilityRow = {
  sale_id: string;
  booking_number: string;
  booking_date: string;
  client: string;
  destination: string | null;
  salesperson: string;
  selling: string;
  expected_cost: string;
  actual_cost: string;
  cost_kind: "actual" | "expected";
  variance: string;
  profit: string;
  margin_percent: string;
};

export type ProfitabilityResult = {
  rows: ProfitabilityRow[];
  total_selling: string;
  total_expected_cost: string;
  total_actual_cost: string;
  total_variance: string;
  total_profit: string;
  total_margin_percent: string;
};

export const getProfitability = createServerFn({ method: "POST" })
  .middleware([requireActiveUser])
  .inputValidator((input: unknown) => profitabilitySchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, roles, isAdmin } = context;
    if (!canAccessReport(roles, isAdmin)) {
      throw new Error("Forbidden: reports are available to Admin and Accounts only");
    }

    let salesQuery = supabase
      .from("sales")
      .select(
        "id, booking_number, booking_date, client_id, destination_id, created_by, created_at, pricing:sale_pricing(selling_value::text, expected_cost::text)",
      )
      .neq("status", "cancelled");
    if (data.from) salesQuery = salesQuery.gte("booking_date", data.from);
    if (data.to) salesQuery = salesQuery.lte("booking_date", data.to);
    if (data.salesperson_id) salesQuery = salesQuery.eq("created_by", data.salesperson_id);
    if (data.destination_id) salesQuery = salesQuery.eq("destination_id", data.destination_id);

    const [salesResult, purchasesResult, clientsResult, destinationsResult, profilesResult] =
      await Promise.all([
        salesQuery,
        supabase.from("purchases").select("sale_id, amount_inr::text").neq("status", "cancelled"),
        supabase.from("clients").select("id, name"),
        supabase.from("destinations").select("id, name"),
        supabase.from("profiles").select("id, name"),
      ]);
    for (const result of [
      salesResult,
      purchasesResult,
      clientsResult,
      destinationsResult,
      profilesResult,
    ]) {
      if (result.error) throw new Error(result.error.message);
    }

    const clientNames = new Map(
      ((clientsResult.data ?? []) as { id: string; name: string }[]).map((row) => [
        row.id,
        row.name,
      ]),
    );
    const destinationNames = new Map(
      ((destinationsResult.data ?? []) as { id: string; name: string }[]).map((row) => [
        row.id,
        row.name,
      ]),
    );
    const profileNames = new Map(
      ((profilesResult.data ?? []) as { id: string; name: string }[]).map((row) => [
        row.id,
        row.name,
      ]),
    );

    const purchaseTotals = new Map<string, bigint>();
    for (const row of (purchasesResult.data ?? []) as { sale_id: string; amount_inr: string }[]) {
      purchaseTotals.set(
        row.sale_id,
        (purchaseTotals.get(row.sale_id) ?? 0n) + toPaise(row.amount_inr),
      );
    }

    type SaleRow = {
      id: string;
      booking_number: string;
      booking_date: string;
      client_id: string;
      destination_id: string | null;
      created_by: string;
      created_at: string;
      pricing:
        | { selling_value: string; expected_cost: string }
        | { selling_value: string; expected_cost: string }[]
        | null;
    };

    const rows: ProfitabilityRow[] = [];
    let totalSelling = 0n;
    let totalExpected = 0n;
    let totalActual = 0n;
    let totalVariance = 0n;
    let totalProfit = 0n;
    const sorted = ((salesResult.data ?? []) as unknown as SaleRow[]).sort((a, b) =>
      a.booking_date === b.booking_date
        ? a.created_at.localeCompare(b.created_at)
        : a.booking_date.localeCompare(b.booking_date),
    );
    for (const sale of sorted) {
      const pricing = Array.isArray(sale.pricing) ? sale.pricing[0] : sale.pricing;
      const selling = toPaise(pricing?.selling_value ?? "0");
      const expected = toPaise(pricing?.expected_cost ?? "0");
      const actual = purchaseTotals.get(sale.id);
      const hasPurchases = actual !== undefined;
      const cost = hasPurchases ? actual : expected;
      const variance = (actual ?? 0n) - expected;
      const profit = selling - cost;
      totalSelling += selling;
      totalExpected += expected;
      totalActual += actual ?? 0n;
      totalVariance += variance;
      totalProfit += profit;
      rows.push({
        sale_id: sale.id,
        booking_number: sale.booking_number,
        booking_date: sale.booking_date,
        client: clientNames.get(sale.client_id) ?? "—",
        destination: sale.destination_id
          ? (destinationNames.get(sale.destination_id) ?? null)
          : null,
        salesperson: profileNames.get(sale.created_by) ?? "—",
        selling: fromPaise(selling),
        expected_cost: fromPaise(expected),
        actual_cost: fromPaise(cost),
        cost_kind: hasPurchases ? "actual" : "expected",
        variance: fromPaise(variance),
        profit: fromPaise(profit),
        margin_percent: percentString(profit, selling),
      });
    }

    return {
      rows,
      total_selling: fromPaise(totalSelling),
      total_expected_cost: fromPaise(totalExpected),
      total_actual_cost: fromPaise(totalActual),
      total_variance: fromPaise(totalVariance),
      total_profit: fromPaise(totalProfit),
      total_margin_percent: percentString(totalProfit, totalSelling),
    };
  });

export type GstMonth = {
  month: string;
  label: string;
  taxable: string;
  gst_5: string;
  gst_18: string;
  gst_other: string;
  tcs: string;
  total_invoiced: string;
};

export type GstSummaryResult = {
  months: GstMonth[];
  has_other_gst: boolean;
  totals: Omit<GstMonth, "month" | "label">;
};

export const getGstSummary = createServerFn({ method: "POST" })
  .middleware([requireActiveUser])
  .inputValidator((input: unknown) => dateRangeSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, roles, isAdmin } = context;
    if (!canAccessReport(roles, isAdmin)) {
      throw new Error("Forbidden: reports are available to Admin and Accounts only");
    }

    let salesQuery = supabase
      .from("sales")
      .select(
        "booking_date, pricing:sale_pricing(selling_value::text, gst_rate::text, gst_amount::text, tcs_amount::text, customer_payable::text)",
      )
      .neq("status", "cancelled");
    if (data.from) salesQuery = salesQuery.gte("booking_date", data.from);
    if (data.to) salesQuery = salesQuery.lte("booking_date", data.to);
    const { data: salesRows, error } = await salesQuery;
    if (error) throw new Error(error.message);

    type PricingRow = {
      selling_value: string;
      gst_rate: string;
      gst_amount: string;
      tcs_amount: string;
      customer_payable: string;
    };
    type SaleRow = { booking_date: string; pricing: PricingRow | PricingRow[] | null };

    type Bucket = {
      taxable: bigint;
      gst5: bigint;
      gst18: bigint;
      gstOther: bigint;
      tcs: bigint;
      invoiced: bigint;
    };
    const months = new Map<string, Bucket>();
    const totals: Bucket = {
      taxable: 0n,
      gst5: 0n,
      gst18: 0n,
      gstOther: 0n,
      tcs: 0n,
      invoiced: 0n,
    };
    for (const sale of (salesRows ?? []) as unknown as SaleRow[]) {
      const pricing = Array.isArray(sale.pricing) ? sale.pricing[0] : sale.pricing;
      if (!pricing) continue;
      const key = sale.booking_date.slice(0, 7);
      let bucket = months.get(key);
      if (!bucket) {
        bucket = { taxable: 0n, gst5: 0n, gst18: 0n, gstOther: 0n, tcs: 0n, invoiced: 0n };
        months.set(key, bucket);
      }
      const gstAmount = toPaise(pricing.gst_amount);
      const rate = Number(pricing.gst_rate);
      bucket.taxable += toPaise(pricing.selling_value);
      if (rate === 5) bucket.gst5 += gstAmount;
      else if (rate === 18) bucket.gst18 += gstAmount;
      else bucket.gstOther += gstAmount;
      bucket.tcs += toPaise(pricing.tcs_amount);
      bucket.invoiced += toPaise(pricing.customer_payable);
      totals.taxable += toPaise(pricing.selling_value);
      if (rate === 5) totals.gst5 += gstAmount;
      else if (rate === 18) totals.gst18 += gstAmount;
      else totals.gstOther += gstAmount;
      totals.tcs += toPaise(pricing.tcs_amount);
      totals.invoiced += toPaise(pricing.customer_payable);
    }

    return {
      months: [...months.keys()].sort().map((month) => {
        const bucket = months.get(month)!;
        return {
          month,
          label: monthLabel(month),
          taxable: fromPaise(bucket.taxable),
          gst_5: fromPaise(bucket.gst5),
          gst_18: fromPaise(bucket.gst18),
          gst_other: fromPaise(bucket.gstOther),
          tcs: fromPaise(bucket.tcs),
          total_invoiced: fromPaise(bucket.invoiced),
        };
      }),
      has_other_gst: totals.gstOther !== 0n,
      totals: {
        taxable: fromPaise(totals.taxable),
        gst_5: fromPaise(totals.gst5),
        gst_18: fromPaise(totals.gst18),
        gst_other: fromPaise(totals.gstOther),
        tcs: fromPaise(totals.tcs),
        total_invoiced: fromPaise(totals.invoiced),
      },
    };
  });
