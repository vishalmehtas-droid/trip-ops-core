import { createFileRoute } from "@tanstack/react-router";

import { PageHeader } from "@/components/app/page-header";
import { GstSummaryReport } from "@/components/app/period-reports";
import { UnauthorizedState } from "@/components/app/states";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_authenticated/reports/gst")({
  head: () => ({
    meta: [
      { title: "GST — Triptastic Ops" },
      { name: "description", content: "GST summaries and return-ready extracts." },
      { property: "og:title", content: "GST — Triptastic Ops" },
      { property: "og:description", content: "GST summaries and return-ready extracts." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ReportsGstPage,
});

function ReportsGstPage() {
  const { roles, isAdmin } = useAuth();
  if (!isAdmin && !roles.includes("accounts")) {
    return (
      <div className="space-y-6">
        <PageHeader title="GST Summary" description="Output GST and TCS by month." />
        <UnauthorizedState description="Reports are available to Admin and Accounts only." />
      </div>
    );
  }
  return <GstSummaryReport />;
}
