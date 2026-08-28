import { createServerFn } from "@tanstack/react-start";

import { requireActiveUser, requirePermission } from "./authz-middleware";
import {
  saleItemCreateSchema,
  saleItemDeleteSchema,
  saleItemUpdateSchema,
} from "./sales-item-schemas";
import { assertSaleEditable, assertVendorSelectable } from "./sales-items.helpers";

export const createSaleItem = createServerFn({ method: "POST" })
  .middleware([requireActiveUser])
  .inputValidator((input: unknown) => saleItemCreateSchema.parse(input))
  .handler(async ({ data, context }) => {
    requirePermission(context, "sales.manage");

    await assertSaleEditable(context.supabase, data.sale_id);
    await assertVendorSelectable(context.supabase, data.values.vendor_id);

    const { data: last } = await context.supabase
      .from("sales_items")
      .select("sort_order")
      .eq("sale_id", data.sale_id)
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data: row, error } = await context.supabase
      .from("sales_items")
      .insert({
        sale_id: data.sale_id,
        item_type: data.values.item_type,
        description: data.values.description,
        vendor_id: data.values.vendor_id,
        quantity: data.values.quantity,
        sort_order: (last?.sort_order ?? 0) + 1,
      })
      .select("id")
      .single();

    if (error) throw new Error(error.message);
    return { id: row.id };
  });

export const updateSaleItem = createServerFn({ method: "POST" })
  .middleware([requireActiveUser])
  .inputValidator((input: unknown) => saleItemUpdateSchema.parse(input))
  .handler(async ({ data, context }) => {
    requirePermission(context, "sales.manage");

    const { data: existing, error: readError } = await context.supabase
      .from("sales_items")
      .select("id, sale_id, vendor_id")
      .eq("id", data.id)
      .maybeSingle();

    if (readError) throw new Error(readError.message);
    if (!existing) throw new Error("Component not found");

    await assertSaleEditable(context.supabase, existing.sale_id);

    // Only a newly associated vendor must be active; an unchanged historical
    // vendor stays on the component even when it is now inactive.
    if (data.values.vendor_id !== existing.vendor_id) {
      await assertVendorSelectable(context.supabase, data.values.vendor_id);
    }

    // id, sale_id and created_at are immutable and deliberately not updated.
    const { error } = await context.supabase
      .from("sales_items")
      .update({
        item_type: data.values.item_type,
        description: data.values.description,
        vendor_id: data.values.vendor_id,
        quantity: data.values.quantity,
      })
      .eq("id", data.id);

    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const deleteSaleItem = createServerFn({ method: "POST" })
  .middleware([requireActiveUser])
  .inputValidator((input: unknown) => saleItemDeleteSchema.parse(input))
  .handler(async ({ data, context }) => {
    requirePermission(context, "sales.manage");

    const { data: existing, error: readError } = await context.supabase
      .from("sales_items")
      .select("id, sale_id")
      .eq("id", data.id)
      .maybeSingle();

    if (readError) throw new Error(readError.message);
    if (!existing) throw new Error("Component not found");

    await assertSaleEditable(context.supabase, existing.sale_id);

    const { error } = await context.supabase.from("sales_items").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });
