import { createFileRoute } from "@tanstack/react-router";

import { PlaceholderPage } from "@/components/app/placeholder-page";

export const Route = createFileRoute("/_authenticated/reports/cashflow")({
  head: () => ({
    meta: [
      { title: "Cashflow — Triptastic Ops" },
      { name: "description", content: "Inflow and outflow across periods." },
      { property: "og:title", content: "Cashflow — Triptastic Ops" },
      { property: "og:description", content: "Inflow and outflow across periods." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ReportsCashflowPage,
});

function ReportsCashflowPage() {
  return (
    <PlaceholderPage
      title="Cashflow"
      description="Inflow and outflow across periods."
      phase={4}
      scope={["Inflow", "Outflow", "Net"]}
    />
  );
}
