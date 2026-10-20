import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";
import { sharedQuoteTokenSchema } from "./customer-quote-schemas";

export type SharedQuote = {
  quote_number: string;
  revision_no: number;
  status: string;
  is_latest: boolean;
  client_name: string | null;
  destinations: { name: string; country: string | null; nights: number | null }[];
  travel_start_date: string | null;
  travel_end_date: string | null;
  adults: number | null;
  children: number | null;
  public_title: string | null;
  summary: string | null;
  itinerary: string | null;
  inclusions: string | null;
  exclusions: string | null;
  terms: string | null;
  valid_until: string | null;
  total: string;
  gst_rate: string;
  gst_amount: string;
  tcs_rate: string | null;
  tcs_amount: string;
  customer_payable: string;
};

/**
 * Public, token-scoped read. The database function returns only customer-safe
 * fields (never vendors, costs, markup, margin or internal notes) and records the view.
 */
export const getSharedQuote = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => {
    const parsed = sharedQuoteTokenSchema.safeParse(input);
    return parsed.success ? parsed.data : null;
  })
  .handler(async ({ data }): Promise<SharedQuote | null> => {
    if (!data) return null;
    const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
    const client = createClient<Database>(process.env["SUPABASE_URL"]!, key, {
      auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
      global: {
        fetch: (input, init) => {
          const h = new Headers(init?.headers);
          if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`)
            h.delete("Authorization");
          h.set("apikey", key);
          return fetch(input, { ...init, headers: h });
        },
      },
    });
    const { data: row, error } = await client.rpc("get_shared_customer_quote", {
      _token: data.token,
      _track: data.track,
    });
    if (error) {
      console.error("shared quote read failed", error.message);
      return null;
    }
    return (row as unknown as SharedQuote | null) ?? null;
  });
