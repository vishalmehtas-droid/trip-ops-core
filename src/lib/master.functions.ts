import { createServerFn } from "@tanstack/react-start";

import { requireActiveUser, requirePermission } from "./authz-middleware";
import { checkRows } from "./csv-import";
import { IMPORT_ROLES } from "./csv-import.functions";
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
    if (context.isAdmin || context.permissions.includes("clients.manage")) {
      const { data: row, error } = await context.supabase
        .from("clients")
        .insert(data)
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      return { id: row.id };
    }
    // Roles that may import clients (Operations) can add one at a time through the same
    // create-only database function and duplicate rules as CSV import; they still can't edit.
    if (!context.roles.some((r) => (IMPORT_ROLES.clients as string[]).includes(r))) {
      throw new Error("Forbidden: missing permission clients.manage");
    }
    if (data.address || data.markup_percent_override !== null) {
      throw new Error("Only Admin and Sales can set the address or special markup");
    }
    const { supabase } = context;
    const { data: existing, error: existingError } = await supabase
      .from("clients")
      .select("name, phone, email");
    if (existingError) throw new Error(existingError.message);
    const [checked] = checkRows(
      "clients",
      [
        {
          name: data.name,
          phone: data.phone ?? "",
          email: data.email ?? "",
          city: data.city ?? "",
          state: data.state ?? "",
          gstin: data.gst_number ?? "",
          source: data.source ?? "",
          referred_by: data.referred_by ?? "",
          notes: data.notes ?? "",
        },
      ],
      existing ?? [],
    );
    if (!checked || checked.status !== "new") throw new Error(checked?.reason ?? "Invalid client");
    const { error } = await supabase.rpc("import_clients", { _rows: [checked.values] });
    if (error) throw new Error(error.message);
    const { data: row, error: rowError } = await supabase
      .from("clients")
      .select("id")
      .eq("created_by", context.userId)
      .eq("name", checked.values["name"]!)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();
    if (rowError) throw new Error(rowError.message);
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
