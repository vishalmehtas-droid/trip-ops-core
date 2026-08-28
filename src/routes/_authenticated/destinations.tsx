import { createFileRoute } from "@tanstack/react-router";

import { PlaceholderPage } from "@/components/app/placeholder-page";

export const Route = createFileRoute("/_authenticated/destinations")({
  head: () => ({
    meta: [
      { title: "Destinations — Triptastic Ops" },
      { name: "description", content: "Destination master used across bookings." },
      { property: "og:title", content: "Destinations — Triptastic Ops" },
      { property: "og:description", content: "Destination master used across bookings." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: DestinationsPage,
});

function DestinationsPage() {
  return (
    <PlaceholderPage
      title="Destinations"
      description="Destination master used across bookings."
      phase={2}
      scope={["Regions", "Countries", "Seasons"]}
    />
  );
}
