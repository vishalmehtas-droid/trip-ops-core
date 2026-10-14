import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Triptastic Ops — Travel operations" },
      {
        name: "description",
        content: "Triptastic Holidays travel operations, bookings and quotations.",
      },
      { property: "og:title", content: "Triptastic Ops — Travel operations" },
      {
        property: "og:description",
        content: "Triptastic Holidays travel operations, bookings and quotations.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  ssr: false,
  beforeLoad: async () => {
    const { supabase } = await import("@/integrations/supabase/client");
    const { data } = await supabase.auth.getUser();
    throw redirect({ to: data.user ? "/dashboard" : "/auth", replace: true });
  },
  component: () => null,
});
