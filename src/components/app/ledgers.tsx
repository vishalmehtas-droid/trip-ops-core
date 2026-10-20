import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Download, Printer } from "lucide-react";

import { formatDate } from "./master-data";
import { PageHeader } from "./page-header";
import { SummaryStat } from "./payments";
import { RecordCombobox, type RecordOption } from "./sales-ui";
import { EmptyState, ErrorState, TableSkeleton } from "./states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import {
  getClientLedger,
  getVendorLedger,
  type LedgerResult,
  type LedgerRow,
} from "@/lib/reports.functions";
import { formatMoney } from "@/lib/sale-costing-schemas";

const KIND_LABELS: Record<LedgerRow["kind"], string> = {
  booking: "Booking",
  receipt: "Receipt",
  purchase: "Purchase",
  payment: "Payment",
};

type Party = { id: string; name: string };

function usePartyOptions(table: "clients" | "vendors") {
  return useQuery({
    queryKey: [table, "ledger-options"],
    queryFn: async () => {
      const { data, error } = await supabase.from(table).select("id, name").order("name");
      if (error) throw error;
      return (data ?? []) as Party[];
    },
  });
}

/** Client ledger: Sales/Operations only see clients that have their bookings. */
export function ClientLedgerReport({ scoped, userId }: { scoped: boolean; userId: string }) {
  const clients = usePartyOptions("clients");
  const ownClientIds = useQuery({
    enabled: scoped && Boolean(userId),
    queryKey: ["sales", "own-client-ids", userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales")
        .select("client_id")
        .eq("created_by", userId);
      if (error) throw error;
      return new Set(((data ?? []) as { client_id: string }[]).map((row) => row.client_id));
    },
  });
  const fetcher = useServerFn(getClientLedger);
  const options: RecordOption[] = useMemo(
    () =>
      (clients.data ?? [])
        .filter((party) => !scoped || (ownClientIds.data?.has(party.id) ?? false))
        .map((party) => ({ id: party.id, label: party.name })),
    [clients.data, ownClientIds.data, scoped],
  );
  return (
    <LedgerView
      kind="client"
      title="Client Ledger"
      description="Statement of client invoices and receipts."
      partyLabel="client"
      options={options}
      optionsPending={clients.isPending || (scoped && ownClientIds.isPending)}
      fetcher={(input) =>
        fetcher({
          data: {
            client_id: input.partyId,
            ...(input.from ? { from: input.from } : {}),
            ...(input.to ? { to: input.to } : {}),
          },
        })
      }
    />
  );
}

export function VendorLedgerReport() {
  const vendors = usePartyOptions("vendors");
  const fetcher = useServerFn(getVendorLedger);
  const options: RecordOption[] = useMemo(
    () => (vendors.data ?? []).map((party) => ({ id: party.id, label: party.name })),
    [vendors.data],
  );
  return (
    <LedgerView
      kind="vendor"
      title="Vendor Ledger"
      description="Statement of vendor bills and payments."
      partyLabel="vendor"
      options={options}
      optionsPending={vendors.isPending}
      fetcher={(input) =>
        fetcher({
          data: {
            vendor_id: input.partyId,
            ...(input.from ? { from: input.from } : {}),
            ...(input.to ? { to: input.to } : {}),
          },
        })
      }
    />
  );
}

function csvCell(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function exportCsv(result: LedgerResult, kind: "client" | "vendor") {
  const lines = [
    ["Date", "Type", "Reference", "Details", "Debit (INR)", "Credit (INR)", "Balance (INR)"].join(
      ",",
    ),
  ];
  for (const row of result.rows) {
    lines.push(
      [
        row.date,
        KIND_LABELS[row.kind],
        row.reference,
        row.detail ?? "",
        row.debit,
        row.credit,
        row.balance,
      ]
        .map(csvCell)
        .join(","),
    );
  }
  lines.push(
    ["", "", "Totals", "", result.total_debit, result.total_credit, result.closing_balance]
      .map(csvCell)
      .join(","),
  );
  const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${kind}-ledger-${result.party_name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function LedgerView({
  kind,
  title,
  description,
  partyLabel,
  options,
  optionsPending,
  fetcher,
}: {
  kind: "client" | "vendor";
  title: string;
  description: string;
  partyLabel: string;
  options: RecordOption[];
  optionsPending: boolean;
  fetcher: (input: { partyId: string; from: string; to: string }) => Promise<LedgerResult>;
}) {
  const [partyId, setPartyId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const ledger: UseQueryResult<LedgerResult> = useQuery({
    queryKey: ["ledger", kind, partyId, from, to],
    enabled: Boolean(partyId),
    queryFn: () => fetcher({ partyId, from, to }),
  });

  const debitLabel = kind === "client" ? "Total billed" : "Total paid";
  const creditLabel = kind === "client" ? "Total received" : "Total purchased";
  const balanceLabel = kind === "client" ? "Balance (receivable)" : "Balance (owed to vendor)";

  return (
    <div className="space-y-6">
      <PageHeader
        title={title}
        description={description}
        {...(ledger.data
          ? {
              actions: (
                <div className="no-print flex items-center gap-2">
                  <Button size="sm" variant="outline" onClick={() => exportCsv(ledger.data, kind)}>
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
        <div className="w-64">
          <RecordCombobox
            options={options}
            value={partyId}
            onChange={setPartyId}
            placeholder={optionsPending ? "Loading…" : `Select a ${partyLabel}`}
            searchPlaceholder={`Search ${partyLabel}s`}
            emptyText={`No ${partyLabel}s found`}
            allowClear
          />
        </div>
        <Input
          type="date"
          className="w-[150px]"
          aria-label="From date"
          value={from}
          onChange={(event) => setFrom(event.target.value)}
        />
        <Input
          type="date"
          className="w-[150px]"
          aria-label="To date"
          value={to}
          onChange={(event) => setTo(event.target.value)}
        />
      </div>

      {!partyId ? (
        <EmptyState
          title={`Select a ${partyLabel}`}
          description={`Choose a ${partyLabel} to see their statement.`}
        />
      ) : ledger.isPending ? (
        <TableSkeleton />
      ) : ledger.isError ? (
        <ErrorState
          description={
            ledger.error instanceof Error
              ? ledger.error.message
              : "The request could not be completed. Please retry."
          }
          onRetry={() => ledger.refetch()}
        />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <SummaryStat label={debitLabel} value={formatMoney(ledger.data.total_debit)} />
            <SummaryStat label={creditLabel} value={formatMoney(ledger.data.total_credit)} />
            <SummaryStat label={balanceLabel} value={formatMoney(ledger.data.closing_balance)} />
          </div>
          <p className="text-sm text-muted-foreground">
            {ledger.data.party_name}
            {from || to ? ` · ${from || "…"} to ${to || "…"}` : ""}
          </p>
          {ledger.data.rows.length === 0 ? (
            <EmptyState title="No transactions in this period" />
          ) : (
            <LedgerTable rows={ledger.data.rows} kind={kind} />
          )}
        </>
      )}
    </div>
  );
}

function LedgerTable({ rows, kind }: { rows: LedgerRow[]; kind: "client" | "vendor" }) {
  const debitHeading = kind === "client" ? "Billed (Dr)" : "Paid (Dr)";
  const creditHeading = kind === "client" ? "Received (Cr)" : "Purchased (Cr)";
  const zero = (value: string) => value === "0.00" || value === "-0.00";
  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-surface">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
            <th className="px-3 py-2 font-medium">Date</th>
            <th className="px-3 py-2 font-medium">Type</th>
            <th className="px-3 py-2 font-medium">Reference</th>
            <th className="px-3 py-2 font-medium">Details</th>
            <th className="px-3 py-2 text-right font-medium">{debitHeading}</th>
            <th className="px-3 py-2 text-right font-medium">{creditHeading}</th>
            <th className="px-3 py-2 text-right font-medium">Balance</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={`${row.kind}-${row.id}`} className="border-b border-border last:border-0">
              <td className="whitespace-nowrap px-3 py-2">{formatDate(row.date)}</td>
              <td className="px-3 py-2">{KIND_LABELS[row.kind]}</td>
              <td className="whitespace-nowrap px-3 py-2 font-medium">
                {row.sale_id ? (
                  <Link
                    to="/sales/$saleId"
                    params={{ saleId: row.sale_id }}
                    className="text-brand hover:underline"
                  >
                    {row.reference}
                  </Link>
                ) : (
                  row.reference
                )}
              </td>
              <td className="px-3 py-2 text-muted-foreground">{row.detail ?? "—"}</td>
              <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
                {zero(row.debit) ? "—" : formatMoney(row.debit)}
              </td>
              <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
                {zero(row.credit) ? "—" : formatMoney(row.credit)}
              </td>
              <td className="whitespace-nowrap px-3 py-2 text-right font-medium tabular-nums">
                {formatMoney(row.balance)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
