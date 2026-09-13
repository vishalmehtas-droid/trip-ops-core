import { createServerFn } from "@tanstack/react-start";

import { requireActiveUser, requirePermission } from "./authz-middleware";
import {
  clientInputSchema,
  clientUpdateSchema,
  destinationInputSchema,
  destinationUpdateSchema,
  setActiveSchema,
  vendorInputSchema,
  vendorUpdateSchema,
} from "./master-schemas";

/* ------------------------------- CLIENTS -------------------------------- */

export const createClient = createServerFn({ method: "POST" })
  .middleware([requireActiveUser])
  .inputValidator((input: unknown) => clientInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    requirePermission(context, "clients.manage");
    const { data: row, error } = await context.supabase
      .from("clients")
      .insert(data)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id };
  });

export const updateClient = createServerFn({ method: "POST" })
  .middleware([requireActiveUser])
  .inputValidator((input: unknown) => clientUpdateSchema.parse(input))
  .handler(async ({ data, context }) => {
    requirePermission(context, "clients.manage");
    const { error } = await context.supabase.from("clients").update(data.values).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const setClientActive = createServerFn({ method: "POST" })
  .middleware([requireActiveUser])
  .inputValidator((input: unknown) => setActiveSchema.parse(input))
  .handler(async ({ data, context }) => {
    requirePermission(context, "clients.manage");
    const { error } = await context.supabase
      .from("clients")
      .update({ is_active: data.isActive })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

/* ------------------------------- VENDORS -------------------------------- */

export const createVendor = createServerFn({ method: "POST" })
  .middleware([requireActiveUser])
  .inputValidator((input: unknown) => vendorInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    requirePermission(context, "vendors.manage");
    const { data: row, error } = await context.supabase
      .from("vendors")
      .insert(data)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id };
  });

export const updateVendor = createServerFn({ method: "POST" })
  .middleware([requireActiveUser])
  .inputValidator((input: unknown) => vendorUpdateSchema.parse(input))
  .handler(async ({ data, context }) => {
    requirePermission(context, "vendors.manage");
    const { error } = await context.supabase.from("vendors").update(data.values).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const setVendorActive = createServerFn({ method: "POST" })
  .middleware([requireActiveUser])
  .inputValidator((input: unknown) => setActiveSchema.parse(input))
  .handler(async ({ data, context }) => {
    requirePermission(context, "vendors.manage");
    const { error } = await context.supabase
      .from("vendors")
      .update({ is_active: data.isActive })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

/* ----------------------------- DESTINATIONS ----------------------------- */

export const createDestination = createServerFn({ method: "POST" })
  .middleware([requireActiveUser])
  .inputValidator((input: unknown) => destinationInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    requirePermission(context, "destinations.manage");
    const { data: row, error } = await context.supabase
      .from("destinations")
      .insert(data)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id };
  });

export const updateDestination = createServerFn({ method: "POST" })
  .middleware([requireActiveUser])
  .inputValidator((input: unknown) => destinationUpdateSchema.parse(input))
  .handler(async ({ data, context }) => {
    requirePermission(context, "destinations.manage");
    const { error } = await context.supabase
      .from("destinations")
      .update(data.values)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const setDestinationActive = createServerFn({ method: "POST" })
  .middleware([requireActiveUser])
  .inputValidator((input: unknown) => setActiveSchema.parse(input))
  .handler(async ({ data, context }) => {
    requirePermission(context, "destinations.manage");
    const { error } = await context.supabase
      .from("destinations")
      .update({ is_active: data.isActive })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });
