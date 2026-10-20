import { createServerFn } from "@tanstack/react-start";

import { requireActiveUser } from "./authz-middleware";
import { fromPaise, toPaise } from "./money";
import { clientLedgerSchema, vendorLedgerSchema } from "./report-schemas";

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
    const fullAccess = isAdmin || roles.includes("accounts");
    if (!fullAccess && !roles.includes("sales") && !roles.includes("operations")) {
      throw new Error("Forbidden: ledger reports are not available for your role");
    }
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
        "id, receipt_number, receipt_date, amount_inr::text, sale_id, created_at, sale:sales!inner(client_id)",
      )
      .eq("sale.client_id", data.client_id)
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
      sale_id: string;
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
        detail: null,
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
    if (!isAdmin && !roles.includes("accounts")) {
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
    const result = toResult((vendor as { name: string }).name, entries);
    return {
      ...result,
      rows: result.rows.map((row) => ({ ...row, balance: invert(row.balance) })),
      closing_balance: invert(result.closing_balance),
    };
  });

function invert(value: string): string {
  return value.startsWith("-") ? value.slice(1) : `-${value}`;
}
