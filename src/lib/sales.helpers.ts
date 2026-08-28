import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";

type Client = SupabaseClient<Database>;

/** Never trust master-record IDs supplied by the browser. */
export async function assertClientSelectable(supabase: Client, clientId: string): Promise<void> {
  const { data, error } = await supabase
    .from("clients")
    .select("id, is_active")
    .eq("id", clientId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error("The selected client does not exist");
  if (!data.is_active) throw new Error("The selected client is inactive");
}

export async function assertDestinationSelectable(
  supabase: Client,
  destinationId: string | null,
): Promise<void> {
  if (!destinationId) return;

  const { data, error } = await supabase
    .from("destinations")
    .select("id, is_active")
    .eq("id", destinationId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error("The selected destination does not exist");
  if (!data.is_active) throw new Error("The selected destination is inactive");
}
