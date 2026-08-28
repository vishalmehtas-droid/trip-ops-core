import { createFileRoute } from "@tanstack/react-router";

import { PlaceholderPage } from "@/components/app/placeholder-page";

export const Route = createFileRoute("/_authenticated/sales")({
  head: () => ({
    meta: [
      { title: "Sales — Triptastic Ops" },
      { name: "description", content: "Client sales bookings, invoices and sales items." },
      { property: "og:title", content: "Sales — Triptastic Ops" },
      { property: "og:description", content: "Client sales bookings, invoices and sales items." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: SalesPage,
});

function SalesPage() {
  return (
    <PlaceholderPage
      title="Sales"
      description="Client sales bookings, invoices and sales items."
      phase={2}
      scope={["Bookings", "Invoices", "Sales Items"]}
    />
  );
}
