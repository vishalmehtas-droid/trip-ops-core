import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";

import { PageHeader } from "@/components/app/page-header";
import {
  PurchaseFormDialog,
  PurchaseSheet,
  PurchasesTable,
  useBookingOptions,
  usePurchases,
  type PurchaseFilters,
} from "@/components/app/purchases";
import { PayPurchaseDialog } from "@/components/app/money-shortcuts";
import { PaymentFormDialog } from "@/components/app/payments";
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
import { PURCHASE_STATUSES, PURCHASE_STATUS_LABELS } from "@/lib/purchase-schemas";
import type { PurchaseRow } from "@/lib/purchases.functions";

export const Route = createFileRoute("/_authenticated/purchases")({
  head: () => ({
    meta: [
      { title: "Purchases — Triptastic Ops" },
      { name: "description", content: "Supplier invoices recorded against bookings." },
      { property: "og:title", content: "Purchases — Triptastic Ops" },
      { property: "og:description", content: "Supplier invoices recorded against bookings." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PurchasesPage,
});

function PurchasesPage() {
  const { hasPermission } = useAuth();
  const canRead = hasPermission("purchases.read");
  const canManage = hasPermission("purchases.manage");
  const canRecordPayment = hasPermission("payments.manage");
  const [filters, setFilters] = useState<PurchaseFilters>({ status: "all" });
  const [createOpen, setCreateOpen] = useState(false);
  const [selected, setSelected] = useState<PurchaseRow | null>(null);
  const [paymentPreset, setPaymentPreset] = useState<{ saleId: string; vendorId: string } | null>(
    null,
  );

  const [payPurchase, setPayPurchase] = useState<PurchaseRow | null>(null);

  const recordPayment = canRecordPayment ? (row: PurchaseRow) => setPayPurchase(row) : undefined;

  const purchases = usePurchases(filters, canRead);
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

  // Keep the side panel in sync with refreshed rows after edits.
  const current = selected
    ? (purchases.data?.find((row) => row.id === selected.id) ?? selected)
    : null;

  if (!canRead) {
    return (
      <div className="space-y-6">
        <PageHeader title="Purchases" description="Supplier invoices recorded against bookings." />
        <UnauthorizedState />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Purchases"
        description="Supplier invoices recorded against bookings."
        {...(canManage
          ? {
              actions: (
                <Button size="sm" onClick={() => setCreateOpen(true)}>
                  <Plus className="size-3.5" />
                  New Purchase
                </Button>
              ),
            }
          : {})}
      />

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
        <Select
          value={filters.status ?? "all"}
          onValueChange={(value) => setFilters({ ...filters, status: value })}
        >
          <SelectTrigger className="w-[150px]" aria-label="Status filter">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {PURCHASE_STATUSES.map((status) => (
              <SelectItem key={status} value={status}>
                {PURCHASE_STATUS_LABELS[status]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          type="date"
          className="w-[150px]"
          aria-label="Invoice date from"
          value={filters.from ?? ""}
          onChange={(event) => setFilters({ ...filters, from: event.target.value })}
        />
        <Input
          type="date"
          className="w-[150px]"
          aria-label="Invoice date to"
          value={filters.to ?? ""}
          onChange={(event) => setFilters({ ...filters, to: event.target.value })}
        />
      </div>

      {purchases.isPending ? (
        <TableSkeleton />
      ) : purchases.isError ? (
        <ErrorState onRetry={() => purchases.refetch()} />
      ) : purchases.data.length === 0 ? (
        <EmptyState
          title="No purchases found"
          description="Record a supplier invoice against a booking, or adjust the filters."
        />
      ) : (
        <PurchasesTable
          rows={purchases.data}
          onOpen={setSelected}
          onRecordPayment={recordPayment}
        />
      )}

      <PurchaseFormDialog open={createOpen} onOpenChange={setCreateOpen} />
      <PurchaseSheet
        purchase={current}
        onOpenChange={(open) => !open && setSelected(null)}
        onRecordPayment={recordPayment}
      />
      <PayPurchaseDialog
        purchase={payPurchase}
        onOpenChange={(open) => !open && setPayPurchase(null)}
        onOpenFullForm={(row) => {
          setPayPurchase(null);
          setPaymentPreset({ saleId: row.sale_id, vendorId: row.vendor_id });
        }}
      />
      <PaymentFormDialog
        open={paymentPreset !== null}
        onOpenChange={(open) => !open && setPaymentPreset(null)}
        presetSaleId={paymentPreset?.saleId}
        presetVendorId={paymentPreset?.vendorId}
      />
    </div>
  );
}
