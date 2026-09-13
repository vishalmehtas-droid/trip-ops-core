import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";

type Client = SupabaseClient<Database>;

/** A lead may only be assigned to an existing, active application user. */
export async function assertAssigneeSelectable(supabase: Client, userId: string): Promise<void> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, is_active")
    .eq("id", userId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error("The selected user does not exist");
  if (!data.is_active) throw new Error("The selected user is deactivated");
}

/** Never trust destination IDs supplied by the browser. */
export async function assertActiveDestinations(
  supabase: Client,
  destinationIds: string[],
): Promise<void> {
  if (destinationIds.length === 0) return;

  const unique = Array.from(new Set(destinationIds));
  if (unique.length !== destinationIds.length) {
    throw new Error("The same destination cannot be added twice");
  }

  const { data, error } = await supabase
    .from("destinations")
    .select("id, is_active")
    .in("id", unique);

  if (error) throw new Error(error.message);
  if ((data ?? []).length !== unique.length) {
    throw new Error("One of the selected destinations does not exist");
  }
  if ((data ?? []).some((row) => !row.is_active)) {
    throw new Error("One of the selected destinations is inactive");
  }
}

/**
 * Stores the ordered itinerary legs of a requirement. The order is taken from
 * the array position, so multi-destination trips keep their sequence.
 */
export async function replaceRequirementDestinations(
  supabase: Client,
  requirementId: string,
  destinationIds: string[],
  clearExisting: boolean,
): Promise<void> {
  if (clearExisting) {
    const { error } = await supabase
      .from("travel_requirement_destinations")
      .delete()
      .eq("requirement_id", requirementId);
    if (error) throw new Error(error.message);
  }

  if (destinationIds.length === 0) return;

  const { error } = await supabase.from("travel_requirement_destinations").insert(
    destinationIds.map((destinationId, index) => ({
      requirement_id: requirementId,
      destination_id: destinationId,
      sequence_order: index + 1,
    })),
  );
  if (error) throw new Error(error.message);
}
