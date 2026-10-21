import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Plus } from "lucide-react";

import { AccountFormDialog, formatAccountBalance, ReasonNote } from "@/components/app/accounts";
import { accountLabel } from "@/components/app/account-select";
import { formatDate, StatusBadge } from "@/components/app/master-data";
import { PageHeader } from "@/components/app/page-header";
import { MONEY_HEAD } from "@/components/app/payments";
import { EmptyState, ErrorState, TableSkeleton, UnauthorizedState } from "@/components/app/states";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAuth } from "@/hooks/use-auth";
import { ACCOUNT_TYPE_LABELS, UNASSIGNED_ACCOUNT_ID } from "@/lib/account-schemas";
import { listAccounts, type AccountRow } from "@/lib/accounts.functions";
import { formatMoney } from "@/lib/sale-costing-schemas";
import { cn } from "@/lib/utils";

const DESCRIPTION = "Bank accounts, cards, cash and wallets, with their current balances.";
const MANAGE_REASON = "Only Admin and Accounts can add or edit accounts.";

export const Route = createFileRoute("/_authenticated/accounts/")({
  head: () => ({
    meta: [
      { title: "Accounts — Triptastic Ops" },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: "Accounts — Triptastic Ops" },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AccountsPage,
});

function AccountsPage() {
  const { hasPermission } = useAuth();
  const canRead = hasPermission("accounts.read");
  const canManage = hasPermission("accounts.manage");
  const [editing, setEditing] = useState<AccountRow | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  const listFn = useServerFn(listAccounts);
  const accounts = useQuery({
    queryKey: ["accounts", "list"],
    enabled: canRead,
    queryFn: () => listFn(),
  });

  if (!canRead) {
    return (
      <div className="space-y-6">
        <PageHeader title="Accounts" description={DESCRIPTION} />
        <UnauthorizedState />
      </div>
    );
  }

  function openForm(account: AccountRow | null) {
    setEditing(account);
    setFormOpen(true);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Accounts"
        description={DESCRIPTION}
        actions={
          <div className="flex flex-col items-end gap-1">
            <Button size="sm" onClick={() => openForm(null)} disabled={!canManage}>
              <Plus className="size-3.5" />
              Add account
            </Button>
            <ReasonNote reason={canManage ? null : MANAGE_REASON} />
          </div>
        }
      />

      {accounts.isPending ? (
        <TableSkeleton />
      ) : accounts.isError ? (
        <ErrorState description={accounts.error.message} onRetry={() => accounts.refetch()} />
      ) : accounts.data.length === 0 ? (
        <EmptyState
          title="No accounts yet"
          description="Add your bank accounts, cards, cash and wallets to start the daily money log."
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border bg-surface">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className={MONEY_HEAD}>Account</TableHead>
                <TableHead className={MONEY_HEAD}>Type</TableHead>
                <TableHead className={cn(MONEY_HEAD, "text-right")}>Opening</TableHead>
                <TableHead className={cn(MONEY_HEAD, "text-right")}>Balance now</TableHead>
                <TableHead className={MONEY_HEAD}>Status</TableHead>
                <TableHead className={MONEY_HEAD} />
              </TableRow>
            </TableHeader>
            <TableBody>
              {accounts.data.map((a) => {
                const unassigned = a.id === UNASSIGNED_ACCOUNT_ID;
                const reason = !canManage
                  ? MANAGE_REASON
                  : unassigned
                    ? "Holds older entries saved before accounts existed; it can't be changed."
                    : null;
                return (
                  <TableRow key={a.id}>
                    <TableCell>
                      <Link
                        to="/accounts/$accountId"
                        params={{ accountId: a.id }}
                        className="font-medium text-brand hover:underline"
                      >
                        {accountLabel(a)}
                      </Link>
                    </TableCell>
                    <TableCell className="text-sm">{ACCOUNT_TYPE_LABELS[a.account_type]}</TableCell>
                    <TableCell className="whitespace-nowrap text-right tabular-nums">
                      <div>{formatMoney(a.opening_balance)}</div>
                      <div className="text-xs text-muted-foreground">
                        as on {formatDate(a.opening_balance_date)}
                      </div>
                    </TableCell>
                    <TableCell
                      className={cn(
                        "whitespace-nowrap text-right font-semibold tabular-nums",
                        a.balance.startsWith("-") ? "text-destructive" : "",
                      )}
                    >
                      {formatAccountBalance(a)}
                    </TableCell>
                    <TableCell>
                      <StatusBadge active={a.is_active} />
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex flex-col items-end gap-1">
                        <div className="flex gap-2">
                          <Button asChild size="sm" variant="outline">
                            <Link to="/accounts/$accountId" params={{ accountId: a.id }}>
                              Statement
                            </Link>
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={reason !== null}
                            onClick={() => openForm(a)}
                          >
                            Edit
                          </Button>
                        </div>
                        {canManage ? <ReasonNote reason={reason} /> : null}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <AccountFormDialog open={formOpen} onOpenChange={setFormOpen} account={editing} />
    </div>
  );
}
