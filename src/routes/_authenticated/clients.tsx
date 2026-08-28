import { createFileRoute } from "@tanstack/react-router";

import { PlaceholderPage } from "@/components/app/placeholder-page";

export const Route = createFileRoute("/_authenticated/clients")({
  head: () => ({
    meta: [
      { title: "Clients — Triptastic Ops" },
      { name: "description", content: "Client master with contact and billing details." },
      { property: "og:title", content: "Clients — Triptastic Ops" },
      { property: "og:description", content: "Client master with contact and billing details." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ClientsPage,
});

function ClientsPage() {
  return (
    <PlaceholderPage
      title="Clients"
      description="Client master with contact and billing details."
      phase={2}
      scope={["Contacts", "GSTIN", "Billing"]}
    />
  );
}
