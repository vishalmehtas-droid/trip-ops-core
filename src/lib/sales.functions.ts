import { createServerFn } from "@tanstack/react-start";

import { requireActiveUser, requirePermission } from "./authz-middleware";
import { saleCreateSchema, saleStatusChangeSchema, saleUpdateSchema } from "./sales-schemas";
import { assertDestinationSelectable, assertClientSelectable } from "./sales.helpers";

export const createSale = createServerFn({ method: "POST" })
  .middleware([requireActiveUser])
  .inputValidator((input: unknown) => saleCreateSchema.parse(input))
  .handler(async ({ data, context }) => {
    requirePermission(context, "sales.manage");

    await assertClientSelectable(context.supabase, data.client_id);
    await assertDestinationSelectable(context.supabase, data.destination_id);

    const { data: row, error } = await context.supabase
      .from("sales")
      .insert({
        client_id: data.client_id,
        destination_id: data.destination_id,
        booking_date: data.booking_date,
        travel_date: data.travel_date,
        notes: data.notes,
        status: "pending",
        created_by: context.userId,
      })
      .select("id")
      .single();

    if (error) throw new Error(error.message);
    return { id: row.id };
  });

export const updateSale = createServerFn({ method: "POST" })
  .middleware([requireActiveUser])
  .inputValidator((input: unknown) => saleUpdateSchema.parse(input))
  .handler(async ({ data, context }) => {
    requirePermission(context, "sales.manage");

    const { data: existing, error: readError } = await context.supabase
      .from("sales")
      .select("id, client_id, destination_id, booking_date, status")
      .eq("id", data.id)
      .maybeSingle();

    if (readError) throw new Error(readError.message);
    if (!existing) throw new Error("Booking not found");
    if (existing.status === "completed" || existing.status === "cancelled") {
      throw new Error(`A ${existing.status} booking can no longer be edited`);
    }

    if (data.values.client_id !== existing.client_id) {
      await assertClientSelectable(context.supabase, data.values.client_id);
    }
    if (data.values.destination_id !== existing.destination_id) {
      await assertDestinationSelectable(context.supabase, data.values.destination_id);
    }
    if (data.values.travel_date && data.values.travel_date < existing.booking_date) {
      throw new Error("Travel date cannot be before the booking date");
    }

    // booking_date, created_by and id are immutable and deliberately not updated.
    const { error } = await context.supabase
      .from("sales")
      .update({
        client_id: data.values.client_id,
        destination_id: data.values.destination_id,
        travel_date: data.values.travel_date,
        notes: data.values.notes,
      })
      .eq("id", data.id);

    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const changeSaleStatus = createServerFn({ method: "POST" })
  .middleware([requireActiveUser])
  .inputValidator((input: unknown) => saleStatusChangeSchema.parse(input))
  .handler(async ({ data, context }) => {
    requirePermission(context, "sales.manage");

    const { data: existing, error: readError } = await context.supabase
      .from("sales")
      .select("id, status")
      .eq("id", data.id)
      .maybeSingle();

    if (readError) throw new Error(readError.message);
    if (!existing) throw new Error("Booking not found");

    const { canTransition } = await import("./sales-schemas");
    if (!canTransition(existing.status, data.status)) {
      throw new Error(`Status change from ${existing.status} to ${data.status} is not allowed`);
    }

    const { error } = await context.supabase
      .from("sales")
      .update({ status: data.status })
      .eq("id", data.id);

    if (error) throw new Error(error.message);
    return { ok: true as const };
  });
