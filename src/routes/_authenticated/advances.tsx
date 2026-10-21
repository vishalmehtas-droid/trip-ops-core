import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { ReasonNote } from "@/components/app/accounts";
import { formatDate } from "@/components/app/master-data";
import { PageHeader } from "@/components/app/page-header";
import {
  MONEY_HEAD,
  PaymentFormDialog,
  SummaryStat,
  useVendorPayments,
} from "@/components/app/payments";
import { LinkReceiptDialog } from "@/components/app/receipt-link";
import { RecordCombobox, type RecordOption } from "@/components/app/sales-ui";
import { EmptyState, ErrorState, TableSkeleton, UnauthorizedState } from "@/components/app/states";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { listUnallocatedAdvances, type AdvanceRow } from "@/lib/accounts.functions";
import { fromPaise, toPaise } from "@/lib/money";
import { formatMoney } from "@/lib/sale-costing-schemas";
import { cn } from "@/lib/utils";

const DESCRIPTION =
  "Money paid to vendors or received from clients that is not yet linked to a purchase or booking.";

type Kind = "all" | "payment" | "receipt";

export const Route = createFileRoute("/_authenticated/advances")({
  head: () => ({
    meta: [
      { title: "Advances — Triptastic Ops" },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: "Advances — Triptastic Ops" },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdvancesPage,
});

function useNames(table: "vendors" | "clients", enabled: boolean) {
  return useQuery({
    queryKey: [table, "all-names"],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase.from(table).select("id, name").order("name");
      if (error) throw error;
      return (data ?? []) as { id: string; name: string }[];
    },
  });
}

function AdvancesPage() {
  const { hasPermission } = useAuth();
  const canRead = hasPermission("accounts.read");
  const canLinkPayment = hasPermission("payments.manage");
  const canLinkReceipt = hasPermission("receipts.manage");
  const [kind, setKind] = useState<Kind>("all");
  const [vendorId, setVendorId] = useState("");
  const [clientId, setClientId] = useState("");
  const [paymentId, setPaymentId] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<AdvanceRow | null>(null);

  const listFn = useServerFn(listUnallocatedAdvances);
  const filters = {
    kind: vendorId ? ("payment" as const) : clientId ? ("receipt" as const) : kind,
    vendor_id: vendorId || null,
    client_id: clientId || null,
  };
  const advances = useQuery({
    queryKey: ["advances", filters],
    enabled: canRead,
    queryFn: () => listFn({ data: filters }),
  });
  const vendors = useNames("vendors", canRead);
  const clients = useNames("clients", canRead);
  // Full payment records, needed by the existing allocate dialog.
  const payments = useVendorPayments({ status: "recorded" }, canRead && canLinkPayment);
  const payment = paymentId ? (payments.data?.find((p) => p.id === paymentId) ?? null) : null;

  const vendorOptions: RecordOption[] = useMemo(
    () => (vendors.data ?? []).map((r) => ({ id: r.id, label: r.name })),
    [vendors.data],
  );
  const clientOptions: RecordOption[] = useMemo(
    () => (clients.data ?? []).map((r) => ({ id: r.id, label: r.name })),
    [clients.data],
  );

  const totals = useMemo(() => {
    let paid = 0n;
    let received = 0n;
    for (const r of advances.data ?? []) {
      if (r.kind === "payment") paid += toPaise(r.unallocated);
      else received += toPaise(r.unallocated);
    }
    return { paid: fromPaise(paid), received: fromPaise(received) };
  }, [advances.data]);

  if (!canRead) {
    return (
      <div className="space-y-6">
        <PageHeader title="Advances" description={DESCRIPTION} />
        <UnauthorizedState />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Unallocated advances" description={DESCRIPTION} />

      <div className="grid gap-3 sm:grid-cols-2">
        <SummaryStat label="Paid to vendors, not linked" value={formatMoney(totals.paid)} />
        <SummaryStat
          label="Received from clients, not linked"
          value={formatMoney(totals.received)}
        />
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <Select
          value={kind}
          onValueChange={(v) => {
            setKind(v as Kind);
            if (v === "payment") setClientId("");
            if (v === "receipt") setVendorId("");
          }}
        >
          <SelectTrigger className="w-[170px]" aria-label="Type filter">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Vendors and clients</SelectItem>
            <SelectItem value="payment">Vendor payments</SelectItem>
            <SelectItem value="receipt">Client receipts</SelectItem>
          </SelectContent>
        </Select>
        {kind !== "receipt" ? (
          <div className="w-56">
            <RecordCombobox
              options={vendorOptions}
              value={vendorId}
              onChange={(v) => {
                setVendorId(v);
                if (v) setClientId("");
              }}
              placeholder="All vendors"
              searchPlaceholder="Search vendors"
              emptyText="No vendors found"
              allowClear
            />
          </div>
        ) : null}
        {kind !== "payment" ? (
          <div className="w-56">
            <RecordCombobox
              options={clientOptions}
              value={clientId}
              onChange={(v) => {
                setClientId(v);
                if (v) setVendorId("");
              }}
              placeholder="All clients"
              searchPlaceholder="Search clients"
              emptyText="No clients found"
              allowClear
            />
          </div>
        ) : null}
      </div>

      {advances.isPending ? (
        <TableSkeleton />
      ) : advances.isError ? (
        <ErrorState description={advances.error.message} onRetry={() => advances.refetch()} />
      ) : advances.data.length === 0 ? (
        <EmptyState
          title="Nothing unallocated"
          description="Every advance matching these filters is linked to a purchase or booking."
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border bg-surface">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className={MONEY_HEAD}>Date</TableHead>
                <TableHead className={MONEY_HEAD}>Number</TableHead>
                <TableHead className={MONEY_HEAD}>Vendor / client</TableHead>
                <TableHead className={cn(MONEY_HEAD, "text-right")}>Amount</TableHead>
                <TableHead className={cn(MONEY_HEAD, "text-right")}>Not linked</TableHead>
                <TableHead className={MONEY_HEAD} />
              </TableRow>
            </TableHeader>
            <TableBody>
              {advances.data.map((r) => {
                const isPayment = r.kind === "payment";
                const reason = isPayment
                  ? canLinkPayment
                    ? payments.isPending
                      ? "Loading…"
                      : null
                    : "Only Admin and Accounts can link vendor payments."
                  : canLinkReceipt
                    ? null
                    : "Only Admin and Accounts can link client receipts.";
                return (
                  <TableRow key={`${r.kind}-${r.id}`}>
                    <TableCell className="whitespace-nowrap">{formatDate(r.date)}</TableCell>
                    <TableCell className="whitespace-nowrap">
                      <div className="font-mono text-xs font-semibold">{r.number}</div>
                      <div className="text-xs text-muted-foreground">
                        {isPayment ? "Paid to vendor" : "Received from client"}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">{r.party_name}</TableCell>
                    <TableCell className="whitespace-nowrap text-right tabular-nums">
                      {formatMoney(r.amount)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-right font-semibold tabular-nums">
                      {formatMoney(r.unallocated)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex flex-col items-end gap-1">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={reason !== null}
                          onClick={() => (isPayment ? setPaymentId(r.id) : setReceipt(r))}
                        >
                          {isPayment ? "Link to purchase" : "Link to booking"}
                        </Button>
                        <ReasonNote reason={reason === "Loading…" ? null : reason} />
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <PaymentFormDialog
        open={payment !== null}
        onOpenChange={(open) => {
          if (!open) {
            setPaymentId(null);
            void advances.refetch();
          }
        }}
        payment={payment}
      />
      <LinkReceiptDialog
        receipt={
          receipt
            ? {
                id: receipt.id,
                receipt_number: receipt.number,
                client_id: receipt.party_id,
                amount_inr: receipt.amount,
              }
            : null
        }
        onOpenChange={(open) => {
          if (!open) setReceipt(null);
        }}
      />
    </div>
  );
}
