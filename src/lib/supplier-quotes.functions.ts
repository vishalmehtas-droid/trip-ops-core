import { createServerFn } from "@tanstack/react-start";

import { requireActiveUser, requirePermission } from "./authz-middleware";
import {
  listQuotesSchema,
  quoteCreateSchema,
  quoteLineAddSchema,
  quoteLineRemoveSchema,
  quoteLineUpdateSchema,
  quoteRevisionSchema,
  quoteUpdateSchema,
  SUPPLIER_QUOTE_TRANSITIONS,
  type SupplierQuoteStatus,
} from "./supplier-quote-schemas";

const QUOTE_SELECT =
  "id, quote_number, lead_id, requirement_id, vendor_id, status, valid_until, notes, revision_number, previous_quote_id, is_superseded, created_at, previous:supplier_quotes!supplier_quotes_previous_quote_id_fkey(quote_number, revision_number), updated_at, vendor:vendors(id, name, is_active), lines:supplier_quote_lines(id, is_package, purchase_type, description, quantity, currency, unit_amount, exchange_rate, amount_inr, sort_order)";

export const listSupplierQuotes = createServerFn({ method: "POST" })
  .middleware([requireActiveUser])
  .inputValidator((input: unknown) => listQuotesSchema.parse(input))
  .handler(async ({ data, context }) => {
    requirePermission(context, "leads.read");
    const { data: rows, error } = await context.supabase
      .from("supplier_quotes")
      .select(QUOTE_SELECT)
      .eq("requirement_id", data.requirement_id)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return (rows ?? []).map((row) => ({
      ...row,
      previous: (Array.isArray(row.previous) ? (row.previous[0] ?? null) : row.previous) as {
        quote_number: string;
        revision_number: number;
      } | null,
      lines: [...(row.lines ?? [])]
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((line) => ({
          ...line,
          unit_amount: String(line.unit_amount),
          exchange_rate: String(line.exchange_rate),
          amount_inr: String(line.amount_inr),
        })),
    }));
  });

export const createSupplierQuote = createServerFn({ method: "POST" })
  .middleware([requireActiveUser])
  .inputValidator((input: unknown) => quoteCreateSchema.parse(input))
  .handler(async ({ data, context }) => {
    requirePermission(context, "leads.manage");
    const { data: row, error } = await context.supabase
      .from("supplier_quotes")
      .insert({
        lead_id: data.lead_id,
        requirement_id: data.requirement_id,
        vendor_id: data.values.vendor_id,
        valid_until: data.values.valid_until,
        notes: data.values.notes,
        // Number, status and timestamps are always set by the database.
        quote_number: "pending",
        created_by: context.userId,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id };
  });

export const updateSupplierQuote = createServerFn({ method: "POST" })
  .middleware([requireActiveUser])
  .inputValidator((input: unknown) => quoteUpdateSchema.parse(input))
  .handler(async ({ data, context }) => {
    requirePermission(context, "leads.manage");
    const { data: existing, error: readError } = await context.supabase
      .from("supplier_quotes")
      .select("id, status, is_superseded")
      .eq("id", data.id)
      .maybeSingle();
    if (readError) throw new Error(readError.message);
    if (!existing) throw new Error("Supplier quote not found");
    if (existing.is_superseded) throw new Error("A superseded quote is read-only");

    const patch: {
      valid_until?: string | null;
      notes?: string | null;
      status?: SupplierQuoteStatus;
    } = {};
    if (data.values) Object.assign(patch, data.values);
    if (data.status && data.status !== existing.status) {
      if (
        !SUPPLIER_QUOTE_TRANSITIONS[existing.status as SupplierQuoteStatus].includes(data.status)
      ) {
        throw new Error(`Cannot change status from ${existing.status} to ${data.status}`);
      }
      patch.status = data.status;
    }
    if (Object.keys(patch).length === 0) return { id: data.id };

    const { error } = await context.supabase
      .from("supplier_quotes")
      .update(patch)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { id: data.id };
  });

export const addSupplierQuoteLine = createServerFn({ method: "POST" })
  .middleware([requireActiveUser])
  .inputValidator((input: unknown) => quoteLineAddSchema.parse(input))
  .handler(async ({ data, context }) => {
    requirePermission(context, "leads.manage");
    const { count } = await context.supabase
      .from("supplier_quote_lines")
      .select("id", { count: "exact", head: true })
      .eq("supplier_quote_id", data.supplier_quote_id);
    const { data: row, error } = await context.supabase
      .from("supplier_quote_lines")
      .insert({
        supplier_quote_id: data.supplier_quote_id,
        ...data.values,
        sort_order: count ?? 0,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id };
  });

export const updateSupplierQuoteLine = createServerFn({ method: "POST" })
  .middleware([requireActiveUser])
  .inputValidator((input: unknown) => quoteLineUpdateSchema.parse(input))
  .handler(async ({ data, context }) => {
    requirePermission(context, "leads.manage");
    const { data: rows, error } = await context.supabase
      .from("supplier_quote_lines")
      .update(data.values)
      .eq("id", data.id)
      .select("id");
    if (error) throw new Error(error.message);
    if (!rows?.length) throw new Error("Line not found");
    return { id: data.id };
  });

export const removeSupplierQuoteLine = createServerFn({ method: "POST" })
  .middleware([requireActiveUser])
  .inputValidator((input: unknown) => quoteLineRemoveSchema.parse(input))
  .handler(async ({ data, context }) => {
    requirePermission(context, "leads.manage");
    const { data: rows, error } = await context.supabase
      .from("supplier_quote_lines")
      .delete()
      .eq("id", data.id)
      .select("id");
    if (error) throw new Error(error.message);
    if (!rows?.length) throw new Error("Line not found");
    return { id: data.id };
  });

export const createSupplierQuoteRevision = createServerFn({ method: "POST" })
  .middleware([requireActiveUser])
  .inputValidator((input: unknown) => quoteRevisionSchema.parse(input))
  .handler(async ({ data, context }) => {
    requirePermission(context, "leads.manage");
    const { data: id, error } = await context.supabase.rpc("create_supplier_quote_revision", {
      _quote_id: data.id,
    });
    if (error) throw new Error(error.message);
    return { id: id as string };
  });
