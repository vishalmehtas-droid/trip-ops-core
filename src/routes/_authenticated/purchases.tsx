import { createFileRoute } from "@tanstack/react-router";

import { PlaceholderPage } from "@/components/app/placeholder-page";

export const Route = createFileRoute("/_authenticated/purchases")({
  head: () => ({
    meta: [
      { title: "Purchases — Triptastic Ops" },
      { name: "description", content: "Vendor purchases, bills and cost capture." },
      { property: "og:title", content: "Purchases — Triptastic Ops" },
      { property: "og:description", content: "Vendor purchases, bills and cost capture." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PurchasesPage,
});

function PurchasesPage() {
  return (
    <PlaceholderPage
      title="Purchases"
      description="Vendor purchases, bills and cost capture."
      phase={2}
      scope={["Purchase Orders", "Vendor Bills", "Purchase Items"]}
    />
  );
}
