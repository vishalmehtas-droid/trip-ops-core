import { createFileRoute } from "@tanstack/react-router";

import { PlaceholderPage } from "@/components/app/placeholder-page";

export const Route = createFileRoute("/_authenticated/reports/client-ledger")({
  head: () => ({
    meta: [
      { title: "Client Ledger — Triptastic Ops" },
      { name: "description", content: "Statement of client invoices and receipts." },
      { property: "og:title", content: "Client Ledger — Triptastic Ops" },
      { property: "og:description", content: "Statement of client invoices and receipts." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ReportsClientLedgerPage,
});

function ReportsClientLedgerPage() {
  return (
    <PlaceholderPage
      title="Client Ledger"
      description="Statement of client invoices and receipts."
      phase={4}
      scope={["Opening", "Movements", "Closing"]}
    />
  );
}
