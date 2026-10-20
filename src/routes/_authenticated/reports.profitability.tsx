import { createFileRoute } from "@tanstack/react-router";

import { PageHeader } from "@/components/app/page-header";
import { ProfitabilityReport } from "@/components/app/period-reports";
import { UnauthorizedState } from "@/components/app/states";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_authenticated/reports/profitability")({
  head: () => ({
    meta: [
      { title: "Profitability — Triptastic Ops" },
      { name: "description", content: "Booking-level and period-level margin analysis." },
      { property: "og:title", content: "Profitability — Triptastic Ops" },
      { property: "og:description", content: "Booking-level and period-level margin analysis." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ReportsProfitabilityPage,
});

function ReportsProfitabilityPage() {
  const { roles, isAdmin } = useAuth();
  if (!isAdmin && !roles.includes("accounts")) {
    return (
      <div className="space-y-6">
        <PageHeader title="Profitability" description="Margin per booking." />
        <UnauthorizedState description="Reports are available to Admin and Accounts only." />
      </div>
    );
  }
  return <ProfitabilityReport />;
}
