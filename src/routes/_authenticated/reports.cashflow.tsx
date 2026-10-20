import { createFileRoute } from "@tanstack/react-router";

import { PageHeader } from "@/components/app/page-header";
import { CashflowReport } from "@/components/app/period-reports";
import { UnauthorizedState } from "@/components/app/states";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_authenticated/reports/cashflow")({
  head: () => ({
    meta: [
      { title: "Cashflow — Triptastic Ops" },
      { name: "description", content: "Inflow and outflow across periods." },
      { property: "og:title", content: "Cashflow — Triptastic Ops" },
      { property: "og:description", content: "Inflow and outflow across periods." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ReportsCashflowPage,
});

function ReportsCashflowPage() {
  const { roles, isAdmin } = useAuth();
  if (!isAdmin && !roles.includes("accounts")) {
    return (
      <div className="space-y-6">
        <PageHeader title="Cashflow" description="Money in and money out by month." />
        <UnauthorizedState description="Reports are available to Admin and Accounts only." />
      </div>
    );
  }
  return <CashflowReport />;
}
