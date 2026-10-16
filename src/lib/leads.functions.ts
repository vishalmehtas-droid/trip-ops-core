import { createServerFn } from "@tanstack/react-start";

import { requireActiveUser, requirePermission } from "./authz-middleware";
import {
  canTransitionLead,
  canTransitionRequirement,
  leadCreateSchema,
  leadStatusChangeSchema,
  leadUpdateSchema,
  requirementCreateSchema,
  requirementStatusChangeSchema,
  requirementUpdateSchema,
} from "./leads-schemas";
import { assertClientSelectable } from "./sales.helpers";
import {
  assertActiveDestinations,
  assertAssigneeSelectable,
  replaceRequirementDestinations,
} from "./leads.helpers";

/* --------------------------------- LEADS --------------------------------- */

export const createLead = createServerFn({ method: "POST" })
  .middleware([requireActiveUser])
  .inputValidator((input: unknown) => leadCreateSchema.parse(input))
  .handler(async ({ data, context }) => {
    requirePermission(context, "leads.manage");

    await assertClientSelectable(context.supabase, data.client_id);
    await assertAssigneeSelectable(context.supabase, data.assigned_to);

    const { data: row, error } = await context.supabase
      .from("leads")
      .insert({
        client_id: data.client_id,
        enquiry_date: data.enquiry_date,
        assigned_to: data.assigned_to,
        source: data.source,
        follow_up_date: data.follow_up_date,
        notes: data.notes,
        status: "new",
        // The database generates the real number; this value is always discarded.
        lead_number: "pending",
        created_by: context.userId,
      })
      .select("id")
      .single();

    if (error) throw new Error(error.message);
    return { id: row.id };
  });

export const updateLead = createServerFn({ method: "POST" })
  .middleware([requireActiveUser])
  .inputValidator((input: unknown) => leadUpdateSchema.parse(input))
  .handler(async ({ data, context }) => {
    requirePermission(context, "leads.manage");

    const { data: existing, error: readError } = await context.supabase
      .from("leads")
      .select("id, client_id, assigned_to, status")
      .eq("id", data.id)
      .maybeSingle();

    if (readError) throw new Error(readError.message);
    if (!existing) throw new Error("Lead not found");
    if (existing.status === "won" || existing.status === "lost") {
      throw new Error(`A ${existing.status} lead can no longer be edited`);
    }

    if (data.values.client_id !== existing.client_id) {
      await assertClientSelectable(context.supabase, data.values.client_id);
    }
    if (data.values.assigned_to !== existing.assigned_to) {
      await assertAssigneeSelectable(context.supabase, data.values.assigned_to);
    }

    // lead_number, created_by, created_at and status are not editable here.
    const { error } = await context.supabase
      .from("leads")
      .update({
        client_id: data.values.client_id,
        enquiry_date: data.values.enquiry_date,
        assigned_to: data.values.assigned_to,
        source: data.values.source,
        follow_up_date: data.values.follow_up_date,
        notes: data.values.notes,
      })
      .eq("id", data.id);

    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const changeLeadStatus = createServerFn({ method: "POST" })
  .middleware([requireActiveUser])
  .inputValidator((input: unknown) => leadStatusChangeSchema.parse(input))
  .handler(async ({ data, context }) => {
    requirePermission(context, "leads.manage");

    const { data: existing, error: readError } = await context.supabase
      .from("leads")
      .select("id, status")
      .eq("id", data.id)
      .maybeSingle();

    if (readError) throw new Error(readError.message);
    if (!existing) throw new Error("Lead not found");
    if (!canTransitionLead(existing.status, data.status)) {
      throw new Error(`Status change from ${existing.status} to ${data.status} is not allowed`);
    }

    const { error } = await context.supabase
      .from("leads")
      .update({ status: data.status })
      .eq("id", data.id);

    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

/* --------------------------- TRAVEL REQUIREMENTS -------------------------- */

export const createRequirement = createServerFn({ method: "POST" })
  .middleware([requireActiveUser])
  .inputValidator((input: unknown) => requirementCreateSchema.parse(input))
  .handler(async ({ data, context }) => {
    requirePermission(context, "leads.manage");

    const { data: lead, error: leadError } = await context.supabase
      .from("leads")
      .select("id, status")
      .eq("id", data.lead_id)
      .maybeSingle();

    if (leadError) throw new Error(leadError.message);
    if (!lead) throw new Error("Lead not found");
    if (lead.status === "won" || lead.status === "lost") {
      throw new Error("Requirements can only be added while the lead is open");
    }

    await assertActiveDestinations(context.supabase, data.values.destination_ids);

    const { data: row, error } = await context.supabase
      .from("travel_requirements")
      .insert({
        lead_id: data.lead_id,
        travel_start_date: data.values.travel_start_date,
        travel_end_date: data.values.travel_end_date,
        adults: data.values.adults,
        children: data.values.children,
        rooms: data.values.rooms,
        trip_type: data.values.trip_type,
        budget: data.values.budget,
        notes: data.values.notes,
        status: "active",
        requirement_number: "pending",
        created_by: context.userId,
      })
      .select("id")
      .single();

    if (error) throw new Error(error.message);

    await replaceRequirementDestinations(
      context.supabase,
      row.id,
      data.values.destination_ids,
      false,
    );

    return { id: row.id };
  });

export const updateRequirement = createServerFn({ method: "POST" })
  .middleware([requireActiveUser])
  .inputValidator((input: unknown) => requirementUpdateSchema.parse(input))
  .handler(async ({ data, context }) => {
    requirePermission(context, "leads.manage");

    const { data: existing, error: readError } = await context.supabase
      .from("travel_requirements")
      .select("id, lead_id, status")
      .eq("id", data.id)
      .maybeSingle();

    if (readError) throw new Error(readError.message);
    if (!existing) throw new Error("Requirement not found");
    if (existing.status === "superseded" || existing.status === "closed") {
      throw new Error(`A ${existing.status} requirement can no longer be edited`);
    }

    await assertActiveDestinations(context.supabase, data.values.destination_ids);

    const { error } = await context.supabase
      .from("travel_requirements")
      .update({
        travel_start_date: data.values.travel_start_date,
        travel_end_date: data.values.travel_end_date,
        adults: data.values.adults,
        children: data.values.children,
        rooms: data.values.rooms,
        trip_type: data.values.trip_type,
        budget: data.values.budget,
        notes: data.values.notes,
      })
      .eq("id", data.id);

    if (error) throw new Error(error.message);

    await replaceRequirementDestinations(
      context.supabase,
      data.id,
      data.values.destination_ids,
      true,
    );

    return { ok: true as const };
  });

export const changeRequirementStatus = createServerFn({ method: "POST" })
  .middleware([requireActiveUser])
  .inputValidator((input: unknown) => requirementStatusChangeSchema.parse(input))
  .handler(async ({ data, context }) => {
    requirePermission(context, "leads.manage");

    const { data: existing, error: readError } = await context.supabase
      .from("travel_requirements")
      .select("id, status")
      .eq("id", data.id)
      .maybeSingle();

    if (readError) throw new Error(readError.message);
    if (!existing) throw new Error("Requirement not found");
    if (!canTransitionRequirement(existing.status, data.status)) {
      throw new Error(`Status change from ${existing.status} to ${data.status} is not allowed`);
    }

    const { error } = await context.supabase
      .from("travel_requirements")
      .update({ status: data.status })
      .eq("id", data.id);

    if (error) throw new Error(error.message);
    return { ok: true as const };
  });
