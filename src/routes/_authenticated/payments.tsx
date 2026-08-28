import { createFileRoute } from "@tanstack/react-router";

import { PlaceholderPage } from "@/components/app/placeholder-page";

export const Route = createFileRoute("/_authenticated/payments")({
  head: () => ({
    meta: [
      { title: "Payments — Triptastic Ops" },
      { name: "description", content: "Money paid to vendors against bills." },
      { property: "og:title", content: "Payments — Triptastic Ops" },
      { property: "og:description", content: "Money paid to vendors against bills." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PaymentsPage,
});

function PaymentsPage() {
  return (
    <PlaceholderPage
      title="Payments"
      description="Money paid to vendors against bills."
      phase={3}
      scope={["Vendor Payments", "Allocation", "Modes"]}
    />
  );
}
