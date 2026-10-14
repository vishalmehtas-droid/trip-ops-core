import { createServerFn } from "@tanstack/react-start";

import { requireActiveUser, requirePermission } from "./authz-middleware";
import {
  CUSTOMER_QUOTE_TRANSITIONS,
  customerQuoteCreateSchema,
  customerQuoteIdSchema,
  customerQuoteLineAddSchema,
  customerQuoteLineRemoveSchema,
  customerQuoteLineUpdateSchema,
  customerQuoteListSchema,
  customerQuotePricingSchema,
  customerQuoteStatusSchema,
  customerQuoteUpdateSchema,
  type CustomerQuoteStatus,
} from "./customer-quote-schemas";

/**
 * Numbering, client, status rules, cost snapshots, pricing totals, draft-only
 * locks and audit entries are all enforced by database triggers; these
 * functions validate input, check permissions and pass raw values through.
 */

const HEADER_SELECT =
  "id, quote_number, lead_id, requirement_id, client_id, revision_no, previous_quote_id, status, valid_until, notes, created_at, updated_at, client:clients(id, name), booking:sales!sales_customer_quote_id_fkey(id)";
const LINE_SELECT =
  "id, customer_quote_id, source_supplier_quote_line_id, purchase_type, description, quantity, currency, expected_cost_inr, sort_order";
const PRICING_SELECT =
  "billing_type, markup_type, markup_value, markup_amount, discount_amount, selling_value, service_charge_amount, gst_rate, gst_amount, tcs_applicable, tcs_rate, tcs_amount, customer_payable, expected_cost, expected_gross_profit";

const str = (v: unknown) => (v === null || v === undefined ? null : String(v));

export const listCustomerQuotes = createServerFn({ method: "POST" })
  .middleware([requireActiveUser])
  .inputValidator((input: unknown) => customerQuoteListSchema.parse(input))
  .handler(async ({ data, context }) => {
    requirePermission(context, "leads.read");
    const { data: rows, error } = await context.supabase
      .from("customer_quotes")
      .select(`${HEADER_SELECT}, pricing:customer_quote_pricing(customer_payable)`)
      .eq("requirement_id", data.requirement_id)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return (rows ?? []).map(({ pricing, ...row }) => {
      const p = Array.isArray(pricing) ? pricing[0] : pricing;
      return { ...row, customer_payable: str(p?.customer_payable) ?? "0" };
    });
  });

export const getCustomerQuote = createServerFn({ method: "POST" })
  .middleware([requireActiveUser])
  .inputValidator((input: unknown) => customerQuoteIdSchema.parse(input))
  .handler(async ({ data, context }) => {
    requirePermission(context, "leads.read");
    const [header, lines, pricing] = await Promise.all([
      context.supabase
        .from("customer_quotes")
        .select(HEADER_SELECT)
        .eq("id", data.id)
        .maybeSingle(),
      context.supabase
        .from("customer_quote_lines")
        .select(LINE_SELECT)
        .eq("customer_quote_id", data.id)
        .order("sort_order"),
      context.supabase
        .from("customer_quote_pricing")
        .select(PRICING_SELECT)
        .eq("customer_quote_id", data.id)
        .maybeSingle(),
    ]);
    if (header.error) throw new Error(header.error.message);
    if (lines.error) throw new Error(lines.error.message);
    if (pricing.error) throw new Error(pricing.error.message);
    if (!header.data) throw new Error("Customer quote not found");

    const p = pricing.data;
    return {
      quote: header.data,
      lines: (lines.data ?? []).map((l) => ({
        ...l,
        expected_cost_inr: String(l.expected_cost_inr),
      })),
      pricing: p
        ? {
            billing_type: p.billing_type,
            markup_type: p.markup_type,
            tcs_applicable: p.tcs_applicable,
            markup_value: String(p.markup_value),
            markup_amount: String(p.markup_amount),
            discount_amount: String(p.discount_amount),
            selling_value: String(p.selling_value),
            service_charge_amount: String(p.service_charge_amount),
            gst_rate: String(p.gst_rate),
            gst_amount: String(p.gst_amount),
            tcs_rate: str(p.tcs_rate),
            tcs_amount: String(p.tcs_amount),
            customer_payable: String(p.customer_payable),
            expected_cost: String(p.expected_cost),
            expected_gross_profit: String(p.expected_gross_profit),
          }
        : null,
    };
  });

export const createCustomerQuote = createServerFn({ method: "POST" })
  .middleware([requireActiveUser])
  .inputValidator((input: unknown) => customerQuoteCreateSchema.parse(input))
  .handler(async ({ data, context }) => {
    requirePermission(context, "leads.manage");
    const { data: req, error: reqError } = await context.supabase
      .from("travel_requirements")
      .select("id, lead_id, status")
      .eq("id", data.requirement_id)
      .maybeSingle();
    if (reqError) throw new Error(reqError.message);
    if (!req) throw new Error("Travel requirement not found");
    const { data: lead, error: leadError } = await context.supabase
      .from("leads")
      .select("client_id")
      .eq("id", req.lead_id)
      .maybeSingle();
    if (leadError) throw new Error(leadError.message);
    if (!lead) throw new Error("Lead not found");

    const { data: row, error } = await context.supabase
      .from("customer_quotes")
      .insert({
        lead_id: req.lead_id,
        requirement_id: req.id,
        valid_until: data.values.valid_until,
        notes: data.values.notes,
        // Number and status are always set; the client is re-derived from the lead by the database.
        quote_number: "pending",
        client_id: lead.client_id,
        created_by: context.userId,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id };
  });

export const updateCustomerQuote = createServerFn({ method: "POST" })
  .middleware([requireActiveUser])
  .inputValidator((input: unknown) => customerQuoteUpdateSchema.parse(input))
  .handler(async ({ data, context }) => {
    requirePermission(context, "leads.manage");
    const { data: rows, error } = await context.supabase
      .from("customer_quotes")
      .update({ valid_until: data.values.valid_until, notes: data.values.notes })
      .eq("id", data.id)
      .select("id");
    if (error) throw new Error(error.message);
    if (!rows?.length) throw new Error("Customer quote not found");
    return { id: data.id };
  });

export const changeCustomerQuoteStatus = createServerFn({ method: "POST" })
  .middleware([requireActiveUser])
  .inputValidator((input: unknown) => customerQuoteStatusSchema.parse(input))
  .handler(async ({ data, context }) => {
    requirePermission(context, "leads.manage");
    const { data: existing, error: readError } = await context.supabase
      .from("customer_quotes")
      .select("id, status")
      .eq("id", data.id)
      .maybeSingle();
    if (readError) throw new Error(readError.message);
    if (!existing) throw new Error("Customer quote not found");
    const from = existing.status as CustomerQuoteStatus;
    if (!CUSTOMER_QUOTE_TRANSITIONS[from].includes(data.status)) {
      throw new Error(`Cannot change status from ${from} to ${data.status}`);
    }
    const { error } = await context.supabase
      .from("customer_quotes")
      .update({ status: data.status })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { id: data.id };
  });

export const createCustomerQuoteRevision = createServerFn({ method: "POST" })
  .middleware([requireActiveUser])
  .inputValidator((input: unknown) => customerQuoteIdSchema.parse(input))
  .handler(async ({ data, context }) => {
    requirePermission(context, "leads.manage");
    const { data: id, error } = await context.supabase.rpc("create_customer_quote_revision", {
      _quote_id: data.id,
    });
    if (error) throw new Error(error.message);
    return { id: id as string };
  });

/** One authenticated RPC executes the whole conversion atomically in the database. */
export const convertCustomerQuoteToBooking = createServerFn({ method: "POST" })
  .middleware([requireActiveUser])
  .inputValidator((input: unknown) => customerQuoteIdSchema.parse(input))
  .handler(async ({ data, context }) => {
    requirePermission(context, "leads.manage");
    requirePermission(context, "sales.manage");
    if (!context.roles.some((role) => role === "admin" || role === "sales")) {
      throw new Error("Forbidden: Admin or Sales access is required");
    }
    const { data: id, error } = await context.supabase.rpc("convert_customer_quote_to_booking", {
      _quote_id: data.id,
    });
    if (error) throw new Error(error.message);
    if (!id) throw new Error("Booking conversion returned no booking");
    return { id };
  });

export const addCustomerQuoteLine = createServerFn({ method: "POST" })
  .middleware([requireActiveUser])
  .inputValidator((input: unknown) => customerQuoteLineAddSchema.parse(input))
  .handler(async ({ data, context }) => {
    requirePermission(context, "leads.manage");

    const { data: last } = await context.supabase
      .from("customer_quote_lines")
      .select("sort_order")
      .eq("customer_quote_id", data.customer_quote_id)
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle();
    const sort_order = (last?.sort_order ?? -1) + 1;

    let insert;
    if (data.source === "supplier") {
      const { data: src, error: srcError } = await context.supabase
        .from("supplier_quote_lines")
        .select("id, purchase_type, description, quantity, currency")
        .eq("id", data.supplier_quote_line_id)
        .maybeSingle();
      if (srcError) throw new Error(srcError.message);
      if (!src) throw new Error("Supplier quote line not found");
      insert = {
        customer_quote_id: data.customer_quote_id,
        source_supplier_quote_line_id: src.id,
        purchase_type: src.purchase_type,
        description: src.description,
        quantity: src.quantity,
        currency: src.currency,
        // Replaced by the database with the supplier line's INR amount (snapshot).
        expected_cost_inr: 0,
        sort_order,
      };
    } else {
      insert = { customer_quote_id: data.customer_quote_id, ...data.values, sort_order };
    }

    const { data: row, error } = await context.supabase
      .from("customer_quote_lines")
      .insert(insert)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id };
  });

export const updateCustomerQuoteLine = createServerFn({ method: "POST" })
  .middleware([requireActiveUser])
  .inputValidator((input: unknown) => customerQuoteLineUpdateSchema.parse(input))
  .handler(async ({ data, context }) => {
    requirePermission(context, "leads.manage");
    const { data: rows, error } = await context.supabase
      .from("customer_quote_lines")
      .update(data.values)
      .eq("id", data.id)
      .select("id");
    if (error) throw new Error(error.message);
    if (!rows?.length) throw new Error("Line not found");
    return { id: data.id };
  });

export const removeCustomerQuoteLine = createServerFn({ method: "POST" })
  .middleware([requireActiveUser])
  .inputValidator((input: unknown) => customerQuoteLineRemoveSchema.parse(input))
  .handler(async ({ data, context }) => {
    requirePermission(context, "leads.manage");
    const { data: rows, error } = await context.supabase
      .from("customer_quote_lines")
      .delete()
      .eq("id", data.id)
      .select("id");
    if (error) throw new Error(error.message);
    if (!rows?.length) throw new Error("Line not found");
    return { id: data.id };
  });

export const setCustomerQuotePricing = createServerFn({ method: "POST" })
  .middleware([requireActiveUser])
  .inputValidator((input: unknown) => customerQuotePricingSchema.parse(input))
  .handler(async ({ data, context }) => {
    requirePermission(context, "leads.manage");
    const v = data.values;
    // Totals are recalculated by the shared database pricing calculation.
    const { data: rows, error } = await context.supabase
      .from("customer_quote_pricing")
      .update({
        billing_type: data.billing_type,
        markup_type: v.markup_type,
        markup_value: v.markup_type === "none" ? 0 : v.markup_value,
        discount_amount: v.discount_amount,
        tcs_applicable: v.tcs_applicable,
        tcs_rate: v.tcs_applicable ? v.tcs_rate : null,
      })
      .eq("customer_quote_id", data.customer_quote_id)
      .select("customer_quote_id");
    if (error) throw new Error(error.message);
    if (!rows?.length) throw new Error("Pricing record not found");
    return { id: data.customer_quote_id };
  });
