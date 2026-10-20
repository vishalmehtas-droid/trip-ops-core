import { createFileRoute } from "@tanstack/react-router";

import { VendorLedgerReport } from "@/components/app/ledgers";
import { PageHeader } from "@/components/app/page-header";
import { UnauthorizedState } from "@/components/app/states";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_authenticated/reports/vendor-ledger")({
  head: () => ({
    meta: [
      { title: "Vendor Ledger — Triptastic Ops" },
      { name: "description", content: "Statement of vendor bills and payments." },
      { property: "og:title", content: "Vendor Ledger — Triptastic Ops" },
      { property: "og:description", content: "Statement of vendor bills and payments." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ReportsVendorLedgerPage,
});

function ReportsVendorLedgerPage() {
  const { roles, isAdmin } = useAuth();
  if (!isAdmin && !roles.includes("accounts")) {
    return (
      <div className="space-y-6">
        <PageHeader title="Vendor Ledger" description="Statement of vendor bills and payments." />
        <UnauthorizedState description="The vendor ledger is available to Admin and Accounts only." />
      </div>
    );
  }
  return <VendorLedgerReport />;
}
