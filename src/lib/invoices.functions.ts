import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireActiveUser } from "./authz-middleware";
import { canCancelInvoices, canIssueInvoices, canReadInvoices } from "./invoice-helpers";

/** Invoice numbers, snapshots and immutability are enforced by the database. */

export type InvoiceSnapshot = {
  company: {
    legal_name: string | null;
    trade_name: string | null;
    gstin: string | null;
    address: string | null;
    state: string | null;
    phone: string | null;
    email: string | null;
    bank_name: string | null;
    bank_account_name: string | null;
    bank_account_number: string | null;
    bank_ifsc: string | null;
    upi_id: string | null;
    logo_path: string | null;
  };
  client: { name: string; address: string | null; gstin: string | null; state: string | null };
  booking_number: string;
  destination: string | null;
  travel_start: string | null;
  travel_end: string | null;
  adults: number | null;
  children: number | null;
  description: string;
  taxable_value: string;
  gst_rate: string;
  gst_amount: string;
  tax_mode: "cgst_sgst" | "igst";
  place_of_supply: string | null;
  cgst: string;
  sgst: string;
  igst: string;
  tcs_rate: string | null;
  tcs_amount: string;
  total_payable: string;
  amount_received: string;
  balance_due: string;
};

export type InvoiceRow = {
  id: string;
  invoice_number: string;
  invoice_date: string;
  sale_id: string;
  client_name: string;
  total_payable: string;
  status: "issued" | "cancelled";
  cancel_reason: string | null;
  cancelled_at: string | null;
  booking_number: string;
};

export type InvoiceDetail = InvoiceRow & { snapshot: InvoiceSnapshot };

const LIST_SELECT =
  "id, invoice_number, invoice_date, sale_id, client_name, total_payable::text, status, cancel_reason, cancelled_at, snapshot";

type Ctx = { roles: ("admin" | "sales" | "operations" | "accounts" | "viewer")[] };

function assertRead(context: Ctx) {
  if (!canReadInvoices(context.roles)) throw new Error("Forbidden: you cannot view invoices");
}

function toRow(raw: Record<string, unknown>): InvoiceDetail {
  const snapshot = raw["snapshot"] as InvoiceSnapshot;
  return {
    id: raw["id"] as string,
    invoice_number: raw["invoice_number"] as string,
    invoice_date: raw["invoice_date"] as string,
    sale_id: raw["sale_id"] as string,
    client_name: raw["client_name"] as string,
    total_payable: raw["total_payable"] as string,
    status: raw["status"] as "issued" | "cancelled",
    cancel_reason: (raw["cancel_reason"] as string | null) ?? null,
    cancelled_at: (raw["cancelled_at"] as string | null) ?? null,
    booking_number: snapshot.booking_number,
    snapshot,
  };
}

export const listInvoices = createServerFn({ method: "POST" })
  .middleware([requireActiveUser])
  .inputValidator((input: unknown) =>
    z.object({ saleId: z.string().uuid().optional() }).parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    assertRead(context);
    let query = context.supabase
      .from("invoices")
      .select(LIST_SELECT)
      .order("invoice_date", { ascending: false })
      .order("created_at", { ascending: false });
    if (data.saleId) query = query.eq("sale_id", data.saleId);
    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);
    return (rows ?? []).map((r) => {
      const { snapshot: _s, ...rest } = toRow(r as unknown as Record<string, unknown>);
      return rest as InvoiceRow;
    });
  });

export const getInvoice = createServerFn({ method: "POST" })
  .middleware([requireActiveUser])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    assertRead(context);
    const { data: row, error } = await context.supabase
      .from("invoices")
      .select(LIST_SELECT)
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) return null;
    const detail = toRow(row as unknown as Record<string, unknown>);
    let logoUrl: string | null = null;
    if (detail.snapshot.company.logo_path) {
      const { data: signed } = await context.supabase.storage
        .from("company-assets")
        .createSignedUrl(detail.snapshot.company.logo_path, 3600);
      logoUrl = signed?.signedUrl ?? null;
    }
    return { ...detail, logoUrl };
  });

export const issueInvoice = createServerFn({ method: "POST" })
  .middleware([requireActiveUser])
  .inputValidator((input: unknown) => z.object({ saleId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    if (!canIssueInvoices(context.roles))
      throw new Error("Forbidden: only Admin or Accounts can issue invoices");
    const { data: id, error } = await context.supabase.rpc("issue_invoice", {
      _sale_id: data.saleId,
    });
    if (error) throw new Error(error.message);
    return { id: id as string };
  });

export const cancelInvoice = createServerFn({ method: "POST" })
  .middleware([requireActiveUser])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        reason: z.string().trim().min(3, "Enter a reason").max(500),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    if (!canCancelInvoices(context.roles))
      throw new Error("Forbidden: only Admin can cancel invoices");
    const { error } = await context.supabase.rpc("cancel_invoice", {
      _invoice_id: data.id,
      _reason: data.reason,
    });
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

const optional = (max: number) =>
  z
    .string()
    .trim()
    .max(max, "Value is too long")
    .nullish()
    .transform((v) => (v ? v : null));

export const companySettingsSchema = z.object({
  legal_name: optional(200),
  trade_name: optional(200),
  gstin: optional(20),
  address: optional(600),
  state: optional(80),
  phone: optional(40),
  email: optional(200),
  bank_name: optional(120),
  bank_account_name: optional(160),
  bank_account_number: optional(40),
  bank_ifsc: optional(20),
  upi_id: optional(100),
  logo_path: optional(300),
  invoice_prefix: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9-]{1,10}$/, "Use up to 10 letters, digits or dashes"),
});

export const updateCompanySettings = createServerFn({ method: "POST" })
  .middleware([requireActiveUser])
  .inputValidator((input: unknown) => companySettingsSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (!context.isAdmin) throw new Error("Forbidden: administrator access is required");
    const { error } = await context.supabase.from("company_settings").update(data).eq("id", true);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });
