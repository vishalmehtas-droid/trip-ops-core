import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";

type Client = SupabaseClient<Database>;

/** The parent booking must exist and still be in an editable status. */
export async function assertSaleEditable(supabase: Client, saleId: string): Promise<void> {
  const { data, error } = await supabase
    .from("sales")
    .select("id, status")
    .eq("id", saleId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error("Booking not found");
  if (data.status === "completed" || data.status === "cancelled") {
    throw new Error(`A ${data.status} booking can no longer be changed`);
  }
}

/** Never trust vendor IDs supplied by the browser. */
export async function assertVendorSelectable(
  supabase: Client,
  vendorId: string | null,
): Promise<void> {
  if (!vendorId) return;

  const { data, error } = await supabase
    .from("vendors")
    .select("id, is_active")
    .eq("id", vendorId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error("The selected vendor does not exist");
  if (!data.is_active) throw new Error("The selected vendor is inactive");
}

/** Money records (purchases, payments, receipts) are blocked only on cancelled bookings. */
export async function assertSaleNotCancelled(supabase: Client, saleId: string): Promise<void> {
  const { data, error } = await supabase
    .from("sales")
    .select("id, status")
    .eq("id", saleId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error("Booking not found");
  if (data.status === "cancelled") throw new Error("A cancelled booking can no longer be changed");
}
