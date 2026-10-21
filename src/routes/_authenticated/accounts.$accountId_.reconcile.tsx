import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

import { ReasonNote } from "@/components/app/accounts";
import { accountLabel } from "@/components/app/account-select";
import { Field, formatDate } from "@/components/app/master-data";
import { PageHeader } from "@/components/app/page-header";
import { SummaryStat, todayIso } from "@/components/app/payments";
import { EmptyState, ErrorState, TableSkeleton, UnauthorizedState } from "@/components/app/states";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/hooks/use-auth";
import { getReconciliation, setEntryCleared, type MoneyEntry } from "@/lib/accounts.functions";
import { fromPaise, toPaise } from "@/lib/money";
import { formatMoney } from "@/lib/sale-costing-schemas";
import { cn } from "@/lib/utils";

const DESCRIPTION = "Tick the entries that appear on the bank statement and compare balances.";

export const Route = createFileRoute("/_authenticated/accounts/$accountId_/reconcile")({
  head: () => ({
    meta: [
      { title: "Reconcile — Triptastic Ops" },
      { name: "description", content: DESCRIPTION },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ReconcilePage,
});

type Reconciliation = Awaited<ReturnType<typeof getReconciliation>>;

const KIND_LABEL: Record<MoneyEntry["kind"], string> = {
  payment: "Paid",
  receipt: "Received",
  other: "Other",
};

/** Statement date and balance are only remembered in this browser, per account. */
function rememberedInputs(accountId: string): { as_of: string; balance: string } {
  try {
    const saved = JSON.parse(localStorage.getItem(`reconcile:${accountId}`) ?? "null");
    if (saved && typeof saved.as_of === "string" && typeof saved.balance === "string") return saved;
  } catch {
    // Storage unavailable; start fresh.
  }
  return { as_of: todayIso(), balance: "" };
}

function ReconcilePage() {
  const { accountId } = Route.useParams();
  const { hasPermission } = useAuth();
  const canRead = hasPermission("accounts.read");
  const canTick = hasPermission("accounts.manage");
  const queryClient = useQueryClient();
  const [inputs, setInputs] = useState(() => ({ as_of: todayIso(), balance: "" }));
  const [onlyOpen, setOnlyOpen] = useState(false);

  // Read browser storage after mount so server and client render the same first.
  useEffect(() => setInputs(rememberedInputs(accountId)), [accountId]);
  useEffect(() => {
    try {
      localStorage.setItem(`reconcile:${accountId}`, JSON.stringify(inputs));
    } catch {
      // Not remembered; nothing else depends on it.
    }
  }, [accountId, inputs]);

  const validDate = /^\d{4}-\d{2}-\d{2}$/.test(inputs.as_of);
  const queryKey = ["reconcile", accountId, inputs.as_of];
  const reconcileFn = useServerFn(getReconciliation);
  const report = useQuery({
    queryKey,
    enabled: canRead && validDate,
    queryFn: () => reconcileFn({ data: { account_id: accountId, as_of: inputs.as_of } }),
  });

  const tickFn = useServerFn(setEntryCleared);
  const tick = useMutation({
    mutationFn: (v: { kind: MoneyEntry["kind"]; id: string; cleared: boolean }) =>
      tickFn({ data: { ...v, cleared_on: inputs.as_of } }),
    onMutate: async (v) => {
      // Show the tick straight away; the totals are recalculated from the server after.
      await queryClient.cancelQueries({ queryKey });
      queryClient.setQueryData<Reconciliation>(queryKey, (old) =>
        old
          ? {
              ...old,
              rows: old.rows.map((r) =>
                r.kind === v.kind && r.id === v.id ? { ...r, cleared: v.cleared } : r,
              ),
            }
          : old,
      );
    },
    onError: (e: Error) => toast.error("Couldn't save the tick", { description: e.message }),
    onSettled: async () => {
      for (const k of ["reconcile", "account-statement", "money-log"]) {
        await queryClient.invalidateQueries({ queryKey: [k] });
      }
    },
  });

  const data = report.data;
  const isCard = data?.account.account_type === "credit_card";

  // Totals follow the ticks on screen, so they move the moment a box is ticked.
  const totals = useMemo(() => {
    if (!data) return null;
    let cleared = toPaise(data.opening);
    let openIn = 0n;
    let openOut = 0n;
    for (const r of data.rows) {
      const amt = toPaise(r.amount);
      if (r.cleared) cleared += amt;
      else if (amt >= 0n) openIn += amt;
      else openOut -= amt;
    }
    return { cleared, openIn, openOut };
  }, [data]);

  const balanceText = inputs.balance.trim();
  const balanceValid = /^-?\d{1,12}(\.\d{1,2})?$/.test(balanceText);
  // Credit cards: the card statement shows the amount owed, which is a minus balance here.
  const statementPaise = balanceValid
    ? isCard
      ? -(toPaise(balanceText) < 0n ? -toPaise(balanceText) : toPaise(balanceText))
      : toPaise(balanceText)
    : null;
  const difference = statementPaise !== null && totals ? statementPaise - totals.cleared : null;

  if (!canRead) {
    return (
      <div className="space-y-6">
        <PageHeader title="Reconcile" description={DESCRIPTION} />
        <UnauthorizedState />
      </div>
    );
  }

  const rows = (data?.rows ?? []).filter((r) => !onlyOpen || !r.cleared);

  return (
    <div className="space-y-6">
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link to="/accounts/$accountId" params={{ accountId }}>
            <ArrowLeft className="size-3.5" />
            Statement
          </Link>
        </Button>
      </div>
      <PageHeader
        title={data ? `Reconcile ${accountLabel(data.account)}` : "Reconcile"}
        description={DESCRIPTION}
      />

      <div className="grid gap-4 rounded-lg border border-border bg-surface p-4 sm:grid-cols-2">
        <Field label="Bank statement date" htmlFor="rec-date">
          <Input
            id="rec-date"
            type="date"
            value={inputs.as_of}
            onChange={(e) => setInputs((v) => ({ ...v, as_of: e.target.value }))}
          />
        </Field>
        <Field
          label={
            isCard ? "Amount owed on card statement (INR)" : "Closing balance on statement (INR)"
          }
          htmlFor="rec-balance"
          error={
            balanceText && !balanceValid ? "Enter an amount with at most 2 decimals" : undefined
          }
        >
          <Input
            id="rec-balance"
            inputMode="decimal"
            placeholder="As printed on the statement"
            value={inputs.balance}
            onChange={(e) => setInputs((v) => ({ ...v, balance: e.target.value }))}
          />
        </Field>
        <p className="text-xs text-muted-foreground sm:col-span-2">
          Tick every entry that appears on the statement up to this date. When the difference is
          zero, this account matches the bank.
        </p>
      </div>

      {!validDate ? (
        <EmptyState title="Enter the statement date" />
      ) : report.isPending ? (
        <TableSkeleton />
      ) : report.isError ? (
        <ErrorState description={report.error.message} onRetry={() => report.refetch()} />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <SummaryStat
              label="Statement balance"
              value={statementPaise === null ? "—" : formatMoney(fromPaise(statementPaise))}
            />
            <SummaryStat
              label="Cleared balance (ticked)"
              value={formatMoney(fromPaise(totals!.cleared))}
            />
            <div
              className={cn(
                "rounded-lg border px-4 py-3",
                difference === 0n
                  ? "border-success/40 bg-success/10"
                  : difference !== null
                    ? "border-destructive/40 bg-destructive/5"
                    : "border-border bg-surface",
              )}
            >
              <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Difference
              </div>
              <div className="mt-1 flex items-center gap-1.5 text-lg font-semibold tabular-nums">
                {difference === null ? (
                  "Enter balance"
                ) : difference === 0n ? (
                  <>
                    <CheckCircle2 className="size-4 text-success" />
                    Matches
                  </>
                ) : (
                  formatMoney(fromPaise(difference))
                )}
              </div>
            </div>
            <SummaryStat
              label="Not yet cleared"
              value={`+${formatMoney(fromPaise(totals!.openIn))} / −${formatMoney(fromPaise(totals!.openOut))}`}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Balance in our books up to {formatDate(inputs.as_of)}: {formatMoney(data!.book_balance)}{" "}
            (opening {formatMoney(data!.opening)}).
            {isCard ? " For credit cards a minus balance is the amount owed." : ""}
          </p>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={onlyOpen} onCheckedChange={setOnlyOpen} />
              Show only entries not yet cleared
            </label>
            <ReasonNote
              reason={canTick ? null : "Only Admin and Accounts can tick entries as cleared."}
            />
          </div>

          {rows.length === 0 ? (
            <EmptyState title={onlyOpen ? "Everything is cleared" : "No entries up to this date"} />
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border bg-surface">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="w-12 px-3 py-2 font-medium">Cleared</th>
                    <th className="px-3 py-2 font-medium">Date</th>
                    <th className="px-3 py-2 font-medium">Details</th>
                    <th className="px-3 py-2 text-right font-medium">Money in</th>
                    <th className="px-3 py-2 text-right font-medium">Money out</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const amt = toPaise(r.amount);
                    const boxId = `cleared-${r.kind}-${r.id}`;
                    return (
                      <tr
                        key={`${r.kind}-${r.id}`}
                        className={cn(
                          "border-b border-border last:border-0",
                          r.cleared && "bg-secondary/40",
                        )}
                      >
                        <td className="px-3 py-2">
                          <Checkbox
                            id={boxId}
                            className="size-5"
                            checked={r.cleared}
                            disabled={!canTick}
                            aria-label={`Cleared ${r.number}`}
                            onCheckedChange={(v) =>
                              tick.mutate({ kind: r.kind, id: r.id, cleared: v === true })
                            }
                          />
                        </td>
                        <td className="whitespace-nowrap px-3 py-2">
                          <label htmlFor={boxId}>{formatDate(r.date)}</label>
                        </td>
                        <td className="px-3 py-2">
                          <label htmlFor={boxId} className="block">
                            <span className="font-mono text-xs font-semibold">{r.number}</span>{" "}
                            <span className="text-xs text-muted-foreground">
                              {KIND_LABEL[r.kind]}
                            </span>
                            <span className="block">{r.label}</span>
                            <span className="block text-xs text-muted-foreground">
                              {[
                                r.booking_number ?? r.detail,
                                r.reference ? `Ref ${r.reference}` : null,
                              ]
                                .filter(Boolean)
                                .join(" · ")}
                              {r.cleared && r.cleared_on
                                ? ` · cleared ${formatDate(r.cleared_on)}`
                                : ""}
                            </span>
                          </label>
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
                          {amt >= 0n ? formatMoney(r.amount) : "—"}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
                          {amt < 0n ? formatMoney(fromPaise(-amt)) : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
