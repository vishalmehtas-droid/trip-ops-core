import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import type { VendorTypeRow } from "@/lib/master-schemas";

/**
 * Vendor types master list. Vendor forms only offer active types, while
 * listings and detail views resolve names for historical (possibly inactive)
 * references.
 */
export function useVendorTypes(options?: { enabled?: boolean; activeOnly?: boolean }) {
  const activeOnly = options?.activeOnly ?? false;
  return useQuery({
    queryKey: ["vendor-types", activeOnly ? "active" : "all"],
    enabled: options?.enabled ?? true,
    queryFn: async () => {
      let query = supabase.from("vendor_types").select("*").order("name");
      if (activeOnly) query = query.eq("is_active", true);
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as VendorTypeRow[];
    },
  });
}
