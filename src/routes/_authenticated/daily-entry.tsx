import { createFileRoute } from "@tanstack/react-router";

import { DailyEntry } from "@/components/app/finance-daily";
import { PageHeader } from "@/components/app/page-header";
import { UnauthorizedState } from "@/components/app/states";
import { useAuth } from "@/hooks/use-auth";

const DESCRIPTION = "Record money paid, received, expenses and transfers as they happen.";

export const Route = createFileRoute("/_authenticated/daily-entry")({
  head: () => ({
    meta: [
      { title: "Daily entry — Triptastic Ops" },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: "Daily entry — Triptastic Ops" },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: DailyEntryPage,
});

function DailyEntryPage() {
  const { hasPermission } = useAuth();
  // Same rules as the entry tabs inside DailyEntry.
  const canEnter = [
    "accounts.manage",
    "payments.manage",
    "payments.enter",
    "receipts.manage",
    "receipts.enter_own",
  ].some((p) => hasPermission(p));

  return (
    <div className="space-y-6">
      <PageHeader title="Daily entry" description={DESCRIPTION} />
      {canEnter ? <DailyEntry /> : <UnauthorizedState />}
    </div>
  );
}
