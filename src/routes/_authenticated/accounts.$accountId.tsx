import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Download, Printer } from "lucide-react";

import { accountLabel } from "@/components/app/account-select";
import { formatDate } from "@/components/app/master-data";
import { PageHeader } from "@/components/app/page-header";
import { SummaryStat } from "@/components/app/payments";
import { currentFinancialYear, downloadCsv } from "@/components/app/period-reports";
import { EmptyState, ErrorState, TableSkeleton, UnauthorizedState } from "@/components/app/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/use-auth";
import { ACCOUNT_TYPE_LABELS, type AccountType } from "@/lib/account-schemas";
import { getAccountStatement, type MoneyEntry } from "@/lib/accounts.functions";
import { fromPaise, toPaise } from "@/lib/money";
import { formatMoney } from "@/lib/sale-costing-schemas";

const DESCRIPTION = "Every entry in date order with a running balance.";

export const Route = createFileRoute("/_authenticated/accounts/$accountId")({
  head: () => ({
    meta: [
      { title: "Account statement — Triptastic Ops" },
      { name: "description", content: DESCRIPTION },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AccountStatementPage,
});

type StatementRow = MoneyEntry & { balance: string };

const KIND_LABEL: Record<MoneyEntry["kind"], string> = {
  payment: "Paid",
  receipt: "Received",
  other: "Other",
};

/** Money in / money out columns from the signed amount. */
function split(amount: string) {
  const p = toPaise(amount);
  return p >= 0n ? { in: fromPaise(p), out: "" } : { in: "", out: fromPaise(-p) };
}

function details(r: StatementRow) {
  return [r.label, r.booking_number ?? r.detail, r.reference ? `Ref ${r.reference}` : null]
    .filter(Boolean)
    .join(" · ");
}

function AccountStatementPage() {
  const { accountId } = Route.useParams();
  const { hasPermission } = useAuth();
  const canRead = hasPermission("accounts.read");
  const [range, setRange] = useState(currentFinancialYear);

  const statementFn = useServerFn(getAccountStatement);
  const statement = useQuery({
    queryKey: ["account-statement", accountId, range.from, range.to],
    enabled: canRead,
    queryFn: () => statementFn({ data: { account_id: accountId, from: range.from, to: range.to } }),
  });

  if (!canRead) {
    return (
      <div className="space-y-6">
        <PageHeader title="Account statement" description={DESCRIPTION} />
        <UnauthorizedState />
      </div>
    );
  }

  const data = statement.data;
  const name = data ? accountLabel(data.account) : "Account statement";
  const isCard = (data?.account.account_type as AccountType | undefined) === "credit_card";

  function exportCsv() {
    if (!data) return;
    const slug = data.account.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
    downloadCsv(
      `statement-${slug}-${range.from || "start"}-to-${range.to || "today"}.csv`,
      ["Date", "Type", "Number", "Details", "Money in (INR)", "Money out (INR)", "Balance (INR)"],
      [
        [range.from, "", "", "Opening balance", "", "", data.opening],
        ...data.rows.map((r) => {
          const m = split(r.amount);
          return [r.date, KIND_LABEL[r.kind], r.number, details(r), m.in, m.out, r.balance];
        }),
        [range.to, "", "", "Closing balance", data.money_in, data.money_out, data.closing],
      ],
    );
  }

  return (
    <div className="space-y-6">
      <div className="no-print">
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link to="/accounts">
            <ArrowLeft className="size-3.5" />
            All accounts
          </Link>
        </Button>
      </div>
      <PageHeader
        title={name}
        description={
          data
            ? `${ACCOUNT_TYPE_LABELS[data.account.account_type as AccountType]} · statement from ${range.from ? formatDate(range.from) : "the start"} to ${range.to ? formatDate(range.to) : "today"}`
            : DESCRIPTION
        }
        {...(data
          ? {
              actions: (
                <div className="no-print flex items-center gap-2">
                  <Button size="sm" variant="outline" onClick={exportCsv}>
                    <Download className="size-3.5" />
                    CSV
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => window.print()}>
                    <Printer className="size-3.5" />
                    Print
                  </Button>
                </div>
              ),
            }
          : {})}
      />

      <div className="no-print flex flex-wrap items-end gap-2">
        <Input
          type="date"
          className="w-[150px]"
          aria-label="From date"
          value={range.from}
          onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))}
        />
        <Input
          type="date"
          className="w-[150px]"
          aria-label="To date"
          value={range.to}
          onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))}
        />
      </div>

      {statement.isPending ? (
        <TableSkeleton />
      ) : statement.isError ? (
        <ErrorState description={statement.error.message} onRetry={() => statement.refetch()} />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <SummaryStat label="Opening balance" value={formatMoney(data!.opening)} />
            <SummaryStat label="Money in" value={formatMoney(data!.money_in)} />
            <SummaryStat label="Money out" value={formatMoney(data!.money_out)} />
            <SummaryStat label="Closing balance" value={formatMoney(data!.closing)} />
          </div>
          {isCard ? (
            <p className="text-xs text-muted-foreground">
              Credit card: a minus balance is the amount owed on the card.
            </p>
          ) : null}
          {data!.rows.length === 0 ? (
            <EmptyState
              title="No entries in this period"
              description="Opening and closing balance are the same."
            />
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border bg-surface">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-3 py-2 font-medium">Date</th>
                    <th className="px-3 py-2 font-medium">Number</th>
                    <th className="px-3 py-2 font-medium">Details</th>
                    <th className="px-3 py-2 text-right font-medium">Money in</th>
                    <th className="px-3 py-2 text-right font-medium">Money out</th>
                    <th className="px-3 py-2 text-right font-medium">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-border bg-secondary/40">
                    <td className="whitespace-nowrap px-3 py-2">{formatDate(range.from)}</td>
                    <td className="px-3 py-2" />
                    <td className="px-3 py-2 font-medium">Opening balance</td>
                    <td className="px-3 py-2" />
                    <td className="px-3 py-2" />
                    <td className="whitespace-nowrap px-3 py-2 text-right font-medium tabular-nums">
                      {formatMoney(data!.opening)}
                    </td>
                  </tr>
                  {data!.rows.map((r) => {
                    const m = split(r.amount);
                    return (
                      <tr key={`${r.kind}-${r.id}-${r.amount}`} className="border-b border-border">
                        <td className="whitespace-nowrap px-3 py-2">{formatDate(r.date)}</td>
                        <td className="whitespace-nowrap px-3 py-2">
                          <div className="font-mono text-xs font-semibold">{r.number}</div>
                          <div className="text-xs text-muted-foreground">{KIND_LABEL[r.kind]}</div>
                        </td>
                        <td className="px-3 py-2">
                          <div>{r.label}</div>
                          <div className="text-xs text-muted-foreground">
                            {r.sale_id && r.booking_number ? (
                              <Link
                                to="/sales/$saleId"
                                params={{ saleId: r.sale_id }}
                                className="font-mono text-brand hover:underline"
                              >
                                {r.booking_number}
                              </Link>
                            ) : (
                              r.detail
                            )}
                            {r.reference ? ` · Ref ${r.reference}` : ""}
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
                          {m.in ? formatMoney(m.in) : "—"}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
                          {m.out ? formatMoney(m.out) : "—"}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-right font-medium tabular-nums">
                          {formatMoney(r.balance)}
                        </td>
                      </tr>
                    );
                  })}
                  <tr className="bg-secondary/40 font-semibold">
                    <td className="whitespace-nowrap px-3 py-2">{formatDate(range.to)}</td>
                    <td className="px-3 py-2" />
                    <td className="px-3 py-2">Closing balance</td>
                    <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
                      {formatMoney(data!.money_in)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
                      {formatMoney(data!.money_out)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
                      {formatMoney(data!.closing)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
