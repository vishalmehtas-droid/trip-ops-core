import { createFileRoute } from "@tanstack/react-router";

import { ClientLedgerReport } from "@/components/app/ledgers";
import { PageHeader } from "@/components/app/page-header";
import { UnauthorizedState } from "@/components/app/states";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_authenticated/reports/client-ledger")({
  head: () => ({
    meta: [
      { title: "Client Ledger — Triptastic Ops" },
      { name: "description", content: "Statement of client invoices and receipts." },
      { property: "og:title", content: "Client Ledger — Triptastic Ops" },
      { property: "og:description", content: "Statement of client invoices and receipts." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ReportsClientLedgerPage,
});

function ReportsClientLedgerPage() {
  const { roles, isAdmin, user } = useAuth();
  const allowed =
    isAdmin || roles.some((role) => role === "accounts" || role === "sales" || role === "operations");
  if (!allowed) {
    return (
      <div className="space-y-6">
        <PageHeader title="Client Ledger" description="Statement of client invoices and receipts." />
        <UnauthorizedState description="Ledger reports are available to Admin, Accounts, Sales and Operations." />
      </div>
    );
  }
  return (
    <ClientLedgerReport scoped={!isAdmin && !roles.includes("accounts")} userId={user?.id ?? ""} />
  );
}
