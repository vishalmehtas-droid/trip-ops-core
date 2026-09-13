import { createServerFn } from "@tanstack/react-start";

import { requireActiveUser, requirePermission } from "./authz-middleware";
import {
  saleCostCreateSchema,
  saleCostDeleteSchema,
  saleCostUpdateSchema,
  salePricingRecalculateSchema,
  salePricingUpdateSchema,
} from "./sale-costing-schemas";
import { assertSaleEditable, assertVendorSelectable } from "./sales-items.helpers";

/**
 * Financial mutations only ever send raw inputs. Every derived amount
 * (line totals, selling value, GST, TCS, customer payable, gross profit) is
 * calculated by trusted database code, so forged browser totals are impossible.
 */

export const createSaleCost = createServerFn({ method: "POST" })
  .middleware([requireActiveUser])
  .inputValidator((input: unknown) => saleCostCreateSchema.parse(input))
  .handler(async ({ data, context }) => {
    requirePermission(context, "sales.manage");

    await assertSaleEditable(context.supabase, data.sale_id);
    await assertVendorSelectable(context.supabase, data.values.vendor_id);

    const { data: last } = await context.supabase
      .from("sale_costs")
      .select("sort_order")
      .eq("sale_id", data.sale_id)
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data: row, error } = await context.supabase
      .from("sale_costs")
      .insert({
        sale_id: data.sale_id,
        vendor_id: data.values.vendor_id,
        cost_type: data.values.cost_type,

        description: data.values.description,
        quantity: data.values.quantity,
        unit_cost: data.values.unit_cost,
        currency_code: data.values.currency_code,
        exchange_rate: data.values.exchange_rate,
        notes: data.values.notes,
        sort_order: (last?.sort_order ?? 0) + 1,
      })
      .select("id")
      .single();

    if (error) throw new Error(error.message);
    return { id: row.id };
  });

export const updateSaleCost = createServerFn({ method: "POST" })
  .middleware([requireActiveUser])
  .inputValidator((input: unknown) => saleCostUpdateSchema.parse(input))
  .handler(async ({ data, context }) => {
    requirePermission(context, "sales.manage");

    const { data: existing, error: readError } = await context.supabase
      .from("sale_costs")
      .select("id, sale_id, vendor_id")
      .eq("id", data.id)
      .maybeSingle();

    if (readError) throw new Error(readError.message);
    if (!existing) throw new Error("Cost entry not found");

    await assertSaleEditable(context.supabase, existing.sale_id);

    // Only a newly associated vendor must be active; a historical vendor stays.
    if (data.values.vendor_id !== existing.vendor_id) {
      await assertVendorSelectable(context.supabase, data.values.vendor_id);
    }

    const { error } = await context.supabase
      .from("sale_costs")
      .update({
        vendor_id: data.values.vendor_id,
        cost_type: data.values.cost_type,

        description: data.values.description,
        quantity: data.values.quantity,
        unit_cost: data.values.unit_cost,
        currency_code: data.values.currency_code,
        exchange_rate: data.values.exchange_rate,
        notes: data.values.notes,
      })
      .eq("id", data.id);

    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const deleteSaleCost = createServerFn({ method: "POST" })
  .middleware([requireActiveUser])
  .inputValidator((input: unknown) => saleCostDeleteSchema.parse(input))
  .handler(async ({ data, context }) => {
    requirePermission(context, "sales.manage");

    const { data: existing, error: readError } = await context.supabase
      .from("sale_costs")
      .select("id, sale_id")
      .eq("id", data.id)
      .maybeSingle();

    if (readError) throw new Error(readError.message);
    if (!existing) throw new Error("Cost entry not found");

    await assertSaleEditable(context.supabase, existing.sale_id);

    const { error } = await context.supabase.from("sale_costs").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const updateSalePricing = createServerFn({ method: "POST" })
  .middleware([requireActiveUser])
  .inputValidator((input: unknown) => salePricingUpdateSchema.parse(input))
  .handler(async ({ data, context }) => {
    requirePermission(context, "sales.manage");

    await assertSaleEditable(context.supabase, data.sale_id);

    const { error } = await context.supabase
      .from("sale_pricing")
      .update({
        markup_type: data.values.markup_type,
        markup_value: data.values.markup_type === "none" ? 0 : data.values.markup_value,
        discount_amount: data.values.discount_amount,
        tcs_applicable: data.values.tcs_applicable,
        tcs_rate: data.values.tcs_applicable ? data.values.tcs_rate : null,
      })
      .eq("sale_id", data.sale_id);

    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const recalculateSalePricing = createServerFn({ method: "POST" })
  .middleware([requireActiveUser])
  .inputValidator((input: unknown) => salePricingRecalculateSchema.parse(input))
  .handler(async ({ data, context }) => {
    requirePermission(context, "sales.manage");

    await assertSaleEditable(context.supabase, data.sale_id);

    const { data: existing, error: readError } = await context.supabase
      .from("sale_pricing")
      .select("sale_id, markup_type")
      .eq("sale_id", data.sale_id)
      .maybeSingle();

    if (readError) throw new Error(readError.message);
    if (!existing) throw new Error("Pricing record not found");

    // Writing the unchanged input back re-runs the authoritative calculation.
    const { error } = await context.supabase
      .from("sale_pricing")
      .update({ markup_type: existing.markup_type })
      .eq("sale_id", data.sale_id);

    if (error) throw new Error(error.message);
    return { ok: true as const };
  });
