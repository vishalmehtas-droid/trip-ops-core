import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Plus } from "lucide-react";

import { PageHeader } from "@/components/app/page-header";
import {
  PaymentFormDialog,
  PaymentSheet,
  PaymentsTable,
  SummaryStat,
  useVendorPayments,
  type PaymentFilters,
} from "@/components/app/payments";
import { useBookingOptions } from "@/components/app/purchases";
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
import { supabase } from "@/integrations/supabase/client";
import { MONEY_TYPES, MONEY_TYPE_LABELS } from "@/lib/payment-schemas";
import { getVendorPaymentSummary, type PaymentRow } from "@/lib/payments.functions";
import { formatMoney } from "@/lib/sale-costing-schemas";

const DESCRIPTION = "Money paid to vendors and allocated against their purchases.";

export const Route = createFileRoute("/_authenticated/payments")({
  head: () => ({
    meta: [
      { title: "Payments — Triptastic Ops" },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: "Payments — Triptastic Ops" },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PaymentsPage,
});

function PaymentsPage() {
  const { hasPermission } = useAuth();
  const canRead = hasPermission("payments.read");
  const canManage = hasPermission("payments.manage");
  const [filters, setFilters] = useState<PaymentFilters>({ status: "all", payment_type: "all" });
  const [createOpen, setCreateOpen] = useState(false);
  const [selected, setSelected] = useState<PaymentRow | null>(null);

  const payments = useVendorPayments(filters, canRead);
  const summaryFn = useServerFn(getVendorPaymentSummary);
  const summary = useQuery({
    queryKey: ["vendor-payments", "summary"],
    enabled: canRead && hasPermission("purchases.read"),
    queryFn: () => summaryFn(),
  });
  const bookings = useBookingOptions(canRead);
  const vendors = useQuery({
    queryKey: ["vendors", "all-names"],
    enabled: canRead,
    queryFn: async () => {
      const { data, error } = await supabase.from("vendors").select("id, name").order("name");
      if (error) throw error;
      return (data ?? []) as { id: string; name: string }[];
    },
  });

  const bookingOptions: RecordOption[] = useMemo(
    () =>
      (bookings.data ?? []).map((row) => ({
        id: row.id,
        label: `${row.booking_number} · ${row.client?.name ?? "—"}`,
      })),
    [bookings.data],
  );
  const vendorOptions: RecordOption[] = useMemo(
    () => (vendors.data ?? []).map((row) => ({ id: row.id, label: row.name })),
    [vendors.data],
  );

  const current = selected
    ? (payments.data?.find((row) => row.id === selected.id) ?? selected)
    : null;

  if (!canRead) {
    return (
      <div className="space-y-6">
        <PageHeader title="Payments" description={DESCRIPTION} />
        <UnauthorizedState />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Payments"
        description={DESCRIPTION}
        {...(canManage
          ? {
              actions: (
                <Button size="sm" onClick={() => setCreateOpen(true)}>
                  <Plus className="size-3.5" />
                  New Payment
                </Button>
              ),
            }
          : {})}
      />

      <div className="grid gap-3 sm:grid-cols-2">
        <SummaryStat
          label="Total outstanding to vendors"
          value={summary.data ? formatMoney(summary.data.outstanding_to_vendors) : "—"}
        />
        <SummaryStat
          label="Unallocated vendor payments"
          value={summary.data ? formatMoney(summary.data.unallocated_payments) : "—"}
        />
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <div className="w-56">
          <RecordCombobox
            options={vendorOptions}
            value={filters.vendor_id ?? ""}
            onChange={(value) => setFilters({ ...filters, vendor_id: value })}
            placeholder="All vendors"
            searchPlaceholder="Search vendors"
            emptyText="No vendors found"
            allowClear
          />
        </div>
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
          aria-label="Payment date from"
          value={filters.from ?? ""}
          onChange={(event) => setFilters({ ...filters, from: event.target.value })}
        />
        <Input
          type="date"
          className="w-[150px]"
          aria-label="Payment date to"
          value={filters.to ?? ""}
          onChange={(event) => setFilters({ ...filters, to: event.target.value })}
        />
      </div>

      {payments.isPending ? (
        <TableSkeleton />
      ) : payments.isError ? (
        <ErrorState onRetry={() => payments.refetch()} />
      ) : payments.data.length === 0 ? (
        <EmptyState
          title="No payments found"
          description="Record money paid to a vendor, or adjust the filters."
        />
      ) : (
        <PaymentsTable rows={payments.data} onOpen={setSelected} />
      )}

      <PaymentFormDialog open={createOpen} onOpenChange={setCreateOpen} />
      <PaymentSheet payment={current} onOpenChange={(open) => !open && setSelected(null)} />
    </div>
  );
}
