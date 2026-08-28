import { createFileRoute } from "@tanstack/react-router";

import { PlaceholderPage } from "@/components/app/placeholder-page";

export const Route = createFileRoute("/_authenticated/reports/gst")({
  head: () => ({
    meta: [
      { title: "GST — Triptastic Ops" },
      { name: "description", content: "GST summaries and return-ready extracts." },
      { property: "og:title", content: "GST — Triptastic Ops" },
      { property: "og:description", content: "GST summaries and return-ready extracts." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ReportsGstPage,
});

function ReportsGstPage() {
  return (
    <PlaceholderPage
      title="GST"
      description="GST summaries and return-ready extracts."
      phase={4}
      scope={["Output Tax", "Input Tax", "Returns"]}
    />
  );
}
