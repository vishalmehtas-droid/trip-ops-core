import { createFileRoute } from "@tanstack/react-router";

import { PlaceholderPage } from "@/components/app/placeholder-page";

export const Route = createFileRoute("/_authenticated/reports/vendor-ledger")({
  head: () => ({
    meta: [
      { title: "Vendor Ledger — Triptastic Ops" },
      { name: "description", content: "Statement of vendor bills and payments." },
      { property: "og:title", content: "Vendor Ledger — Triptastic Ops" },
      { property: "og:description", content: "Statement of vendor bills and payments." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ReportsVendorLedgerPage,
});

function ReportsVendorLedgerPage() {
  return (
    <PlaceholderPage
      title="Vendor Ledger"
      description="Statement of vendor bills and payments."
      phase={4}
      scope={["Opening", "Movements", "Closing"]}
    />
  );
}
