import { createFileRoute } from "@tanstack/react-router";

import { PlaceholderPage } from "@/components/app/placeholder-page";

export const Route = createFileRoute("/_authenticated/receipts")({
  head: () => ({
    meta: [
      { title: "Receipts — Triptastic Ops" },
      { name: "description", content: "Money received from clients against invoices." },
      { property: "og:title", content: "Receipts — Triptastic Ops" },
      { property: "og:description", content: "Money received from clients against invoices." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ReceiptsPage,
});

function ReceiptsPage() {
  return (
    <PlaceholderPage
      title="Receipts"
      description="Money received from clients against invoices."
      phase={3}
      scope={["Client Receipts", "Allocation", "Modes"]}
    />
  );
}
