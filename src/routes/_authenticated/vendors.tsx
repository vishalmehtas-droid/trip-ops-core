import { createFileRoute } from "@tanstack/react-router";

import { PlaceholderPage } from "@/components/app/placeholder-page";

export const Route = createFileRoute("/_authenticated/vendors")({
  head: () => ({
    meta: [
      { title: "Vendors — Triptastic Ops" },
      { name: "description", content: "Vendor master with service and settlement details." },
      { property: "og:title", content: "Vendors — Triptastic Ops" },
      { property: "og:description", content: "Vendor master with service and settlement details." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: VendorsPage,
});

function VendorsPage() {
  return (
    <PlaceholderPage
      title="Vendors"
      description="Vendor master with service and settlement details."
      phase={2}
      scope={["Contacts", "Services", "Settlement"]}
    />
  );
}
