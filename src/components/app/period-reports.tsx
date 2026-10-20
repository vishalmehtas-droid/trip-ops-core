import { useMemo, useState, type ReactNode } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
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
  getCashflow,
  getGstSummary,
  getProfitability,
  type CashflowResult,
  type GstSummaryResult,
  type ProfitabilityResult,
} from "@/lib/reports.functions";
import { formatMoney } from "@/lib/sale-costing-schemas";

/** Current Indian financial year (April to March) as YYYY-MM-DD bounds. */
function currentFinancialYear(): { from: string; to: string } {
  const now = new Date();
  const startYear = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  return { from: `${startYear}-04-01`, to: `${startYear + 1}-03-31` };
}

function csvCell(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function downloadCsv(filename: string, header: string[], rows: string[][]) {
  const lines = [header, ...rows].map((cells) => cells.map(csvCell).join(","));
  const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function useNameOptions(table: "profiles" | "destinations") {
  return useQuery({
    queryKey: [table, "report-options"],
    queryFn: async () => {
      const { data, error } = await supabase.from(table).select("id, name").order("name");
      if (error) throw error;
      return (data ?? []) as { id: string; name: string }[];
    },
  });
}

function ReportShell({
  title,
  description,
  hasData,
  onExport,
  from,
  to,
  onFromChange,
  onToChange,
  filters,
  children,
}: {
  title: string;
  description: string;
  hasData: boolean;
  onExport: () => void;
  from: string;
  to: string;
  onFromChange: (value: string) => void;
  onToChange: (value: string) => void;
  filters?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="space-y-6">
      <PageHeader
        title={title}
        description={description}
        {...(hasData
          ? {
              actions: (
                <div className="no-print flex items-center gap-2">
                  <Button size="sm" variant="outline" onClick={onExport}>
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
          value={from}
          onChange={(event) => onFromChange(event.target.value)}
        />
        <Input
          type="date"
          className="w-[150px]"
          aria-label="To date"
          value={to}
          onChange={(event) => onToChange(event.target.value)}
        />
        {filters}
      </div>
      <p className="text-sm text-muted-foreground">
        {from || "…"} to {to || "…"}
      </p>
      {children}
    </div>
  );
}

function reportRangeInput(from: string, to: string) {
  return {
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
  };
}

/* ---------------------------------- */
/* Cashflow                           */
/* ---------------------------------- */

export function CashflowReport() {
  const [range, setRange] = useState(currentFinancialYear);
  const fetcher = useServerFn(getCashflow);
  const report: UseQueryResult<CashflowResult> = useQuery({
    queryKey: ["cashflow", range.from, range.to],
    queryFn: () => fetcher({ data: reportRangeInput(range.from, range.to) }),
  });

  const onExport = () => {
    const data = report.data;
    if (!data) return;
    downloadCsv(
      "cashflow.csv",
      ["Month", "Money in (INR)", "Money out (INR)", "Net (INR)", "Cumulative (INR)"],
      data.months.map((month) => [
        month.label,
        month.money_in,
        month.money_out,
        month.net,
        month.cumulative,
      ]),
    );
  };

  return (
    <ReportShell
      title="Cashflow"
      description="Money in and money out by month."
      hasData={Boolean(report.data && report.data.months.length > 0)}
      onExport={onExport}
      from={range.from}
      to={range.to}
      onFromChange={(from) => setRange((prev) => ({ ...prev, from }))}
      onToChange={(to) => setRange((prev) => ({ ...prev, to }))}
    >
      {report.isPending ? (
        <TableSkeleton />
      ) : report.isError ? (
        <ErrorState
          description={
            report.error instanceof Error
              ? report.error.message
              : "The request could not be completed. Please retry."
          }
          onRetry={() => report.refetch()}
        />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <SummaryStat
              label="Receivable (customers owe us)"
              value={formatMoney(report.data.receivable)}
            />
            <SummaryStat
              label="Payable (we owe vendors)"
              value={formatMoney(report.data.payable)}
            />
          </div>
          {report.data.months.length === 0 ? (
            <EmptyState title="No transactions in this period" />
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border bg-surface">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-3 py-2 font-medium">Month</th>
                    <th className="px-3 py-2 text-right font-medium">Money in</th>
                    <th className="px-3 py-2 text-right font-medium">Money out</th>
                    <th className="px-3 py-2 text-right font-medium">Net</th>
                    <th className="px-3 py-2 text-right font-medium">Cumulative</th>
                  </tr>
                </thead>
                <tbody>
                  {report.data.months.map((month) => (
                    <tr key={month.month} className="border-b border-border last:border-0">
                      <td className="whitespace-nowrap px-3 py-2 font-medium">{month.label}</td>
                      <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
                        {formatMoney(month.money_in)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
                        {formatMoney(month.money_out)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
                        {formatMoney(month.net)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-right font-medium tabular-nums">
                        {formatMoney(month.cumulative)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </ReportShell>
  );
}

/* ---------------------------------- */
/* Profitability                      */
/* ---------------------------------- */

export function ProfitabilityReport() {
  const [range, setRange] = useState(currentFinancialYear);
  const [salespersonId, setSalespersonId] = useState("");
  const [destinationId, setDestinationId] = useState("");
  const navigate = useNavigate();
  const salespeople = useNameOptions("profiles");
  const destinations = useNameOptions("destinations");
  const fetcher = useServerFn(getProfitability);
  const report: UseQueryResult<ProfitabilityResult> = useQuery({
    queryKey: ["profitability", range.from, range.to, salespersonId, destinationId],
    queryFn: () =>
      fetcher({
        data: {
          ...reportRangeInput(range.from, range.to),
          ...(salespersonId ? { salesperson_id: salespersonId } : {}),
          ...(destinationId ? { destination_id: destinationId } : {}),
        },
      }),
  });

  const salespersonOptions: RecordOption[] = useMemo(
    () => (salespeople.data ?? []).map((row) => ({ id: row.id, label: row.name })),
    [salespeople.data],
  );
  const destinationOptions: RecordOption[] = useMemo(
    () => (destinations.data ?? []).map((row) => ({ id: row.id, label: row.name })),
    [destinations.data],
  );

  const onExport = () => {
    const data = report.data;
    if (!data) return;
    downloadCsv(
      "profitability.csv",
      [
        "Booking",
        "Date",
        "Client",
        "Destination",
        "Salesperson",
        "Selling excl. GST (INR)",
        "Expected cost (INR)",
        "Purchase cost (INR)",
        "Cost basis",
        "Variance (INR)",
        "Profit (INR)",
        "Margin %",
      ],
      [
        ...data.rows.map((row) => [
          row.booking_number,
          row.booking_date,
          row.client,
          row.destination ?? "",
          row.salesperson,
          row.selling,
          row.expected_cost,
          row.actual_cost,
          row.cost_kind === "expected" ? "Expected" : "Actual",
          row.variance,
          row.profit,
          row.margin_percent,
        ]),
        [
          "Totals",
          "",
          "",
          "",
          "",
          data.total_selling,
          data.total_expected_cost,
          data.total_actual_cost,
          "",
          data.total_variance,
          data.total_profit,
          data.total_margin_percent,
        ],
      ],
    );
  };

  return (
    <ReportShell
      title="Profitability"
      description="Margin per booking."
      hasData={Boolean(report.data && report.data.rows.length > 0)}
      onExport={onExport}
      from={range.from}
      to={range.to}
      onFromChange={(from) => setRange((prev) => ({ ...prev, from }))}
      onToChange={(to) => setRange((prev) => ({ ...prev, to }))}
      filters={
        <>
          <div className="w-56">
            <RecordCombobox
              options={salespersonOptions}
              value={salespersonId}
              onChange={setSalespersonId}
              placeholder={salespeople.isPending ? "Loading…" : "All salespeople"}
              searchPlaceholder="Search team members"
              emptyText="No team members found"
              allowClear
            />
          </div>
          <div className="w-56">
            <RecordCombobox
              options={destinationOptions}
              value={destinationId}
              onChange={setDestinationId}
              placeholder={destinations.isPending ? "Loading…" : "All destinations"}
              searchPlaceholder="Search destinations"
              emptyText="No destinations found"
              allowClear
            />
          </div>
        </>
      }
    >
      {report.isPending ? (
        <TableSkeleton />
      ) : report.isError ? (
        <ErrorState
          description={
            report.error instanceof Error
              ? report.error.message
              : "The request could not be completed. Please retry."
          }
          onRetry={() => report.refetch()}
        />
      ) : report.data.rows.length === 0 ? (
        <EmptyState title="No transactions in this period" />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border bg-surface">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-3 py-2 font-medium">Booking</th>
                <th className="px-3 py-2 font-medium">Date</th>
                <th className="px-3 py-2 font-medium">Client</th>
                <th className="px-3 py-2 font-medium">Destination</th>
                <th className="px-3 py-2 font-medium">Salesperson</th>
                <th className="px-3 py-2 text-right font-medium">Selling excl. GST</th>
                <th className="px-3 py-2 text-right font-medium">Expected cost</th>
                <th className="px-3 py-2 text-right font-medium">Purchase cost</th>
                <th className="px-3 py-2 text-right font-medium">Variance</th>
                <th className="px-3 py-2 text-right font-medium">Profit</th>
                <th className="px-3 py-2 text-right font-medium">Margin</th>
              </tr>
            </thead>
            <tbody>
              {report.data.rows.map((row) => (
                <tr
                  key={row.sale_id}
                  className="cursor-pointer border-b border-border last:border-0 hover:bg-muted/40"
                  onClick={() =>
                    navigate({ to: "/sales/$saleId", params: { saleId: row.sale_id } })
                  }
                >
                  <td className="whitespace-nowrap px-3 py-2 font-medium">
                    <Link
                      to="/sales/$saleId"
                      params={{ saleId: row.sale_id }}
                      className="text-brand hover:underline"
                      onClick={(event) => event.stopPropagation()}
                    >
                      {row.booking_number}
                    </Link>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2">{formatDate(row.booking_date)}</td>
                  <td className="px-3 py-2">{row.client}</td>
                  <td className="px-3 py-2">{row.destination ?? "—"}</td>
                  <td className="px-3 py-2">{row.salesperson}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
                    {formatMoney(row.selling)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
                    {formatMoney(row.expected_cost)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
                    {formatMoney(row.actual_cost)}
                    {row.cost_kind === "expected" ? (
                      <span className="ml-1 text-xs text-muted-foreground">(Expected)</span>
                    ) : null}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
                    {formatMoney(row.variance)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right font-medium tabular-nums">
                    {formatMoney(row.profit)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
                    {row.margin_percent}%
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-border bg-muted/40 text-sm font-medium">
                <td className="px-3 py-2" colSpan={5}>
                  Totals
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
                  {formatMoney(report.data.total_selling)}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
                  {formatMoney(report.data.total_expected_cost)}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
                  {formatMoney(report.data.total_actual_cost)}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
                  {formatMoney(report.data.total_variance)}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
                  {formatMoney(report.data.total_profit)}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
                  {report.data.total_margin_percent}%
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </ReportShell>
  );
}

/* ---------------------------------- */
/* GST summary                        */
/* ---------------------------------- */

export function GstSummaryReport() {
  const [range, setRange] = useState(currentFinancialYear);
  const fetcher = useServerFn(getGstSummary);
  const report: UseQueryResult<GstSummaryResult> = useQuery({
    queryKey: ["gst-summary", range.from, range.to],
    queryFn: () => fetcher({ data: reportRangeInput(range.from, range.to) }),
  });

  const onExport = () => {
    const data = report.data;
    if (!data) return;
    const header = [
      "Month",
      "Taxable value (INR)",
      "GST 5% (INR)",
      "GST 18% (INR)",
      ...(data.has_other_gst ? ["GST other rates (INR)"] : []),
      "TCS collected (INR)",
      "Total invoiced (INR)",
    ];
    downloadCsv("gst-summary.csv", header, [
      ...data.months.map((month) => [
        month.label,
        month.taxable,
        month.gst_5,
        month.gst_18,
        ...(data.has_other_gst ? [month.gst_other] : []),
        month.tcs,
        month.total_invoiced,
      ]),
      [
        "Totals",
        data.totals.taxable,
        data.totals.gst_5,
        data.totals.gst_18,
        ...(data.has_other_gst ? [data.totals.gst_other] : []),
        data.totals.tcs,
        data.totals.total_invoiced,
      ],
    ]);
  };

  const otherGst = report.data?.has_other_gst ?? false;

  return (
    <ReportShell
      title="GST Summary"
      description="Output GST and TCS by month."
      hasData={Boolean(report.data && report.data.months.length > 0)}
      onExport={onExport}
      from={range.from}
      to={range.to}
      onFromChange={(from) => setRange((prev) => ({ ...prev, from }))}
      onToChange={(to) => setRange((prev) => ({ ...prev, to }))}
    >
      {report.isPending ? (
        <TableSkeleton />
      ) : report.isError ? (
        <ErrorState
          description={
            report.error instanceof Error
              ? report.error.message
              : "The request could not be completed. Please retry."
          }
          onRetry={() => report.refetch()}
        />
      ) : report.data.months.length === 0 ? (
        <EmptyState title="No transactions in this period" />
      ) : (
        <>
          <div className="overflow-x-auto rounded-lg border border-border bg-surface">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-3 py-2 font-medium">Month</th>
                  <th className="px-3 py-2 text-right font-medium">Taxable value</th>
                  <th className="px-3 py-2 text-right font-medium">GST 5%</th>
                  <th className="px-3 py-2 text-right font-medium">GST 18%</th>
                  {otherGst ? (
                    <th className="px-3 py-2 text-right font-medium">GST other</th>
                  ) : null}
                  <th className="px-3 py-2 text-right font-medium">TCS collected</th>
                  <th className="px-3 py-2 text-right font-medium">Total invoiced</th>
                </tr>
              </thead>
              <tbody>
                {report.data.months.map((month) => (
                  <tr key={month.month} className="border-b border-border last:border-0">
                    <td className="whitespace-nowrap px-3 py-2 font-medium">{month.label}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
                      {formatMoney(month.taxable)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
                      {formatMoney(month.gst_5)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
                      {formatMoney(month.gst_18)}
                    </td>
                    {otherGst ? (
                      <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
                        {formatMoney(month.gst_other)}
                      </td>
                    ) : null}
                    <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
                      {formatMoney(month.tcs)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right font-medium tabular-nums">
                      {formatMoney(month.total_invoiced)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-border bg-muted/40 text-sm font-medium">
                  <td className="px-3 py-2">Totals</td>
                  <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
                    {formatMoney(report.data.totals.taxable)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
                    {formatMoney(report.data.totals.gst_5)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
                    {formatMoney(report.data.totals.gst_18)}
                  </td>
                  {otherGst ? (
                    <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
                      {formatMoney(report.data.totals.gst_other)}
                    </td>
                  ) : null}
                  <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
                    {formatMoney(report.data.totals.tcs)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
                    {formatMoney(report.data.totals.total_invoiced)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
          <p className="text-xs text-muted-foreground">
            Based on bookings, not tax invoices. Confirm with your CA before filing.
          </p>
        </>
      )}
    </ReportShell>
  );
}
