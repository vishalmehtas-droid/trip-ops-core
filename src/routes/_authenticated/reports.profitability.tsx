import { createFileRoute } from "@tanstack/react-router";

import { PlaceholderPage } from "@/components/app/placeholder-page";

export const Route = createFileRoute("/_authenticated/reports/profitability")({
  head: () => ({
    meta: [
      { title: "Profitability — Triptastic Ops" },
      { name: "description", content: "Booking-level and period-level margin analysis." },
      { property: "og:title", content: "Profitability — Triptastic Ops" },
      { property: "og:description", content: "Booking-level and period-level margin analysis." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ReportsProfitabilityPage,
});

function ReportsProfitabilityPage() {
  return (
    <PlaceholderPage
      title="Profitability"
      description="Booking-level and period-level margin analysis."
      phase={4}
      scope={["Revenue", "Cost", "Margin"]}
    />
  );
}
