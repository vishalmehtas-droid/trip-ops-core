import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Plus } from "lucide-react";

import { PageHeader } from "@/components/app/page-header";
import { SummaryStat } from "@/components/app/payments";
import {
  ReceiptFormDialog,
  ReceiptSheet,
  ReceiptsTable,
  useReceipts,
  useReceivables,
  type ReceiptFilters,
} from "@/components/app/receipts";
import { RecordCombobox, type RecordOption } from "@/components/app/sales-ui";
import { EmptyState, ErrorState, TableSkeleton, UnauthorizedState } from "@/components/app/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/hooks/use-auth";
import { MONEY_TYPES, MONEY_TYPE_LABELS } from "@/lib/payment-schemas";
import type { ReceiptRow } from "@/lib/receipts.functions";
import { formatMoney } from "@/lib/sale-costing-schemas";

const DESCRIPTION = "Money received from clients against their bookings.";

export const Route = createFileRoute("/_authenticated/receipts")({
  head: () => ({
    meta: [
      { title: "Receipts — Triptastic Ops" },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: "Receipts — Triptastic Ops" },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ReceiptsPage,
});

function ReceiptsPage() {
  const { hasPermission } = useAuth();
  const canRead = hasPermission("receipts.read");
  const canManage = hasPermission("receipts.manage");
  const [filters, setFilters] = useState<ReceiptFilters>({ status: "all", payment_type: "all" });
  const [createOpen, setCreateOpen] = useState(false);
  const [selected, setSelected] = useState<ReceiptRow | null>(null);

  const receipts = useReceipts(filters, canRead);
  const receivables = useReceivables(canRead && hasPermission("sales.read"));

  const bookingOptions: RecordOption[] = useMemo(
    () =>
      (receivables.data?.bookings ?? []).map((row) => ({
        id: row.sale_id,
        label: `${row.booking_number} · ${row.client_name ?? "—"}`,
      })),
    [receivables.data],
  );

  const current = selected
    ? (receipts.data?.find((row) => row.id === selected.id) ?? selected)
    : null;

  if (!canRead) {
    return (
      <div className="space-y-6">
        <PageHeader title="Receipts" description={DESCRIPTION} />
        <UnauthorizedState />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Receipts"
        description={DESCRIPTION}
        {...(canManage
          ? {
              actions: (
                <Button size="sm" onClick={() => setCreateOpen(true)}>
                  <Plus className="size-3.5" />
                  New Receipt
                </Button>
              ),
            }
          : {})}
      />

      <div className="grid gap-3 sm:grid-cols-2">
        <SummaryStat
          label="Total receivable outstanding"
          value={receivables.data ? formatMoney(receivables.data.total_outstanding) : "—"}
        />
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <div className="w-64">
          <RecordCombobox
            options={bookingOptions}
            value={filters.sale_id ?? ""}
            onChange={(value) => setFilters({ ...filters, sale_id: value })}
            placeholder="All bookings"
            searchPlaceholder="Search booking number or client"
            emptyText="No bookings found"
            allowClear
          />
        </div>
        <Select
          value={filters.payment_type ?? "all"}
          onValueChange={(value) => setFilters({ ...filters, payment_type: value })}
        >
          <SelectTrigger className="w-[130px]" aria-label="Type filter">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            {MONEY_TYPES.map((type) => (
              <SelectItem key={type} value={type}>
                {MONEY_TYPE_LABELS[type]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={filters.status ?? "all"}
          onValueChange={(value) => setFilters({ ...filters, status: value })}
        >
          <SelectTrigger className="w-[140px]" aria-label="Status filter">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="recorded">Recorded</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>
        <Input
          type="date"
          className="w-[150px]"
          aria-label="Receipt date from"
          value={filters.from ?? ""}
          onChange={(event) => setFilters({ ...filters, from: event.target.value })}
        />
        <Input
          type="date"
          className="w-[150px]"
          aria-label="Receipt date to"
          value={filters.to ?? ""}
          onChange={(event) => setFilters({ ...filters, to: event.target.value })}
        />
      </div>

      {receipts.isPending ? (
        <TableSkeleton />
      ) : receipts.isError ? (
        <ErrorState onRetry={() => receipts.refetch()} />
      ) : receipts.data.length === 0 ? (
        <EmptyState
          title="No receipts found"
          description="Record money received from a client, or adjust the filters."
        />
      ) : (
        <ReceiptsTable rows={receipts.data} onOpen={setSelected} />
      )}

      <ReceiptFormDialog open={createOpen} onOpenChange={setCreateOpen} />
      <ReceiptSheet receipt={current} onOpenChange={(open) => !open && setSelected(null)} />
    </div>
  );
}
