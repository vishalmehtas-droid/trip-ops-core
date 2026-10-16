import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";

import { DetailRow, Field, formatDate, formatDateTime } from "@/components/app/master-data";
import { useQuickAdd } from "@/components/app/quick-add";
import { RecordCombobox, type RecordOption } from "@/components/app/sales-ui";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/app/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { quoteFieldErrors } from "@/lib/quotation-display";
import { formatMoney } from "@/lib/sale-costing-schemas";
import { toPaise } from "@/lib/money";
import {
  PURCHASE_STATUS_LABELS,
  purchaseCancelSchema,
  purchaseValuesSchema,
  type PurchaseStatus,
} from "@/lib/purchase-schemas";
import {
  cancelPurchase,
  createPurchase,
  getBookingVariance,
  listPurchases,
  updatePurchase,
  type PurchaseRow,
} from "@/lib/purchases.functions";

export type PurchaseFilters = {
  sale_id?: string;
  vendor_id?: string;
  status?: string;
  from?: string;
  to?: string;
};

const HEAD = "text-[10px] uppercase tracking-wider";

export function PurchaseStatusBadge({ status }: { status: PurchaseStatus }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "text-[10px] uppercase",
        status === "cancelled" ? "border-destructive/30 text-destructive" : "",
      )}
    >
      {PURCHASE_STATUS_LABELS[status]}
    </Badge>
  );
}

/** Unpaid / Partly paid / Paid, derived from exact paise amounts. */
export function PurchasePaymentBadge({
  row,
}: {
  row: Pick<PurchaseRow, "status" | "paid" | "outstanding">;
}) {
  if (row.status !== "recorded") return null;
  const paid = toPaise(row.paid);
  const outstanding = toPaise(row.outstanding);
  const label = outstanding <= 0n && paid > 0n ? "Paid" : paid <= 0n ? "Unpaid" : "Partly paid";
  return (
    <Badge
      variant="outline"
      className={cn(
        "text-[10px] uppercase",
        label === "Paid"
          ? "border-success/40 text-success"
          : label === "Partly paid"
            ? "border-warning/40 text-warning"
            : "border-destructive/40 text-destructive",
      )}
    >
      {label}
    </Badge>
  );
}

/** Vendor payment terms shown inside payment/purchase dialogs. */
export function VendorTermsNote({
  vendor,
}: {
  vendor?: { payment_terms: string | null; advance_rule: string | null } | null;
}) {
  if (!vendor || (!vendor.payment_terms && !vendor.advance_rule)) return null;
  return (
    <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
      {vendor.payment_terms ? (
        <p>
          <span className="font-semibold text-foreground">Payment terms: </span>
          {vendor.payment_terms}
        </p>
      ) : null}
      {vendor.advance_rule ? (
        <p className={vendor.payment_terms ? "mt-0.5" : ""}>
          <span className="font-semibold text-foreground">Advance: </span>
          {vendor.advance_rule}
        </p>
      ) : null}
    </div>
  );
}

export function usePurchases(filters: PurchaseFilters, enabled = true) {
  const listFn = useServerFn(listPurchases);
  return useQuery({
    queryKey: ["purchases", filters],
    enabled,
    queryFn: () => listFn({ data: filters }),
  });
}

/** Options for selects: bookings still open for purchases, and active vendors. */
export function useBookingOptions(enabled: boolean) {
  return useQuery({
    queryKey: ["sales", "purchase-options"],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales")
        .select("id, booking_number, status, client:clients(name)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as {
        id: string;
        booking_number: string;
        status: string;
        client: { name: string } | null;
      }[];
    },
  });
}

function useActiveVendors(enabled: boolean) {
  return useQuery({
    queryKey: ["vendors", "active"],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vendors")
        .select("id, name, phone, payment_terms, advance_rule")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return (data ?? []) as {
        id: string;
        name: string;
        phone: string | null;
        payment_terms: string | null;
        advance_rule: string | null;
      }[];
    },
  });
}

export function PurchasesTable({
  rows,
  onOpen,
  showBooking = true,
  onRecordPayment,
}: {
  rows: PurchaseRow[];
  onOpen: (row: PurchaseRow) => void;
  showBooking?: boolean;
  onRecordPayment?: (row: PurchaseRow) => void;
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-surface">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className={HEAD}>Purchase</TableHead>
            {showBooking ? <TableHead className={HEAD}>Booking</TableHead> : null}
            <TableHead className={HEAD}>Vendor</TableHead>
            <TableHead className={HEAD}>Invoice</TableHead>
            <TableHead className={cn(HEAD, "text-right")}>Amount</TableHead>
            <TableHead className={cn(HEAD, "text-right")}>INR</TableHead>
            <TableHead className={cn(HEAD, "text-right")}>Paid</TableHead>
            <TableHead className={cn(HEAD, "text-right")}>Outstanding</TableHead>
            <TableHead className={HEAD}>Status</TableHead>
            <TableHead className={HEAD}>Payment</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.id} className="cursor-pointer" onClick={() => onOpen(row)}>
              <TableCell className="font-mono text-xs font-semibold">
                {row.purchase_number}
              </TableCell>
              {showBooking ? (
                <TableCell>
                  <div className="font-mono text-xs">{row.sale?.booking_number ?? "—"}</div>
                  <div className="text-xs text-muted-foreground">
                    {row.sale?.client?.name ?? "—"}
                  </div>
                </TableCell>
              ) : null}
              <TableCell>{row.vendor?.name ?? "—"}</TableCell>
              <TableCell>
                <div className="text-xs">{row.vendor_invoice_number ?? "—"}</div>
                <div className="text-xs text-muted-foreground">{formatDate(row.invoice_date)}</div>
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatMoney(row.amount, row.currency_code)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatMoney(row.amount_inr)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {row.status === "recorded" ? formatMoney(row.paid) : "—"}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {row.status === "recorded" ? formatMoney(row.outstanding) : "—"}
              </TableCell>
              <TableCell>
                <PurchaseStatusBadge status={row.status} />
              </TableCell>
              <TableCell>
                {row.status === "recorded" ? (
                  <div className="flex items-center gap-2">
                    <PurchasePaymentBadge row={row} />
                    {onRecordPayment && toPaise(row.outstanding) > 0n ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs"
                        onClick={(event) => {
                          event.stopPropagation();
                          onRecordPayment(row);
                        }}
                      >
                        Record Payment
                      </Button>
                    ) : null}
                  </div>
                ) : (
                  "—"
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

type FormState = {
  sale_id: string;
  vendor_id: string;
  vendor_invoice_number: string;
  invoice_date: string;
  currency_code: string;
  exchange_rate: string;
  amount: string;
  notes: string;
};

function today() {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

function emptyForm(saleId = ""): FormState {
  return {
    sale_id: saleId,
    vendor_id: "",
    vendor_invoice_number: "",
    invoice_date: today(),
    currency_code: "INR",
    exchange_rate: "1",
    amount: "",
    notes: "",
  };
}

async function invalidatePurchases(queryClient: ReturnType<typeof useQueryClient>) {
  await queryClient.invalidateQueries({ queryKey: ["purchases"] });
  await queryClient.invalidateQueries({ queryKey: ["booking-variance"] });
  await queryClient.invalidateQueries({ queryKey: ["vendor-payments"] });
  await queryClient.invalidateQueries({ queryKey: ["audit-log"] });
}

/** Create (no `purchase`) or edit an existing purchase. */
export function PurchaseFormDialog({
  open,
  onOpenChange,
  purchase,
  presetSaleId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  purchase?: PurchaseRow | null;
  presetSaleId?: string;
}) {
  const queryClient = useQueryClient();
  const createFn = useServerFn(createPurchase);
  const updateFn = useServerFn(updatePurchase);
  const [form, setForm] = useState<FormState>(emptyForm(presetSaleId));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [lastOpen, setLastOpen] = useState(false);

  if (open !== lastOpen) {
    setLastOpen(open);
    if (open) {
      setErrors({});
      setForm(
        purchase
          ? {
              sale_id: purchase.sale_id,
              vendor_id: purchase.vendor_id,
              vendor_invoice_number: purchase.vendor_invoice_number ?? "",
              invoice_date: purchase.invoice_date,
              currency_code: purchase.currency_code,
              exchange_rate: purchase.exchange_rate,
              amount: purchase.amount,
              notes: purchase.notes ?? "",
            }
          : emptyForm(presetSaleId),
      );
    }
  }

  const bookings = useBookingOptions(open && !purchase && !presetSaleId);
  const vendors = useActiveVendors(open);
  const vendorQuickAdd = useQuickAdd("vendor", (id) =>
    setForm((current) => ({ ...current, vendor_id: id })),
  );

  const bookingOptions: RecordOption[] = useMemo(
    () =>
      (bookings.data ?? [])
        .filter((row) => row.status !== "cancelled")
        .map((row) => ({
          id: row.id,
          label: `${row.booking_number} · ${row.client?.name ?? "—"}`,
          hint: row.status,
        })),
    [bookings.data],
  );

  const vendorOptions: RecordOption[] = useMemo(() => {
    const options = (vendors.data ?? []).map((row) => ({
      id: row.id,
      label: row.name,
      hint: row.phone,
    }));
    if (purchase?.vendor && !options.some((option) => option.id === purchase.vendor_id)) {
      options.unshift({
        id: purchase.vendor_id,
        label: `${purchase.vendor.name} (inactive)`,
        hint: null,
      });
    }
    return options;
  }, [vendors.data, purchase]);

  const save = useMutation({
    mutationFn: async () => {
      const values = purchaseValuesSchema.parse(form);
      if (purchase) return updateFn({ data: { id: purchase.id, values } });
      return createFn({ data: { sale_id: form.sale_id, values } });
    },
    onSuccess: async (result) => {
      await invalidatePurchases(queryClient);
      toast.success(
        purchase
          ? "Purchase updated"
          : `Purchase ${(result as { purchase_number?: string }).purchase_number ?? ""} recorded`,
      );
      onOpenChange(false);
    },
    onError: (error: Error) => toast.error("Request rejected", { description: error.message }),
  });

  function submit() {
    const next: Record<string, string> = {};
    if (!purchase && !form.sale_id) next["sale_id"] = "Select a booking";
    const parsed = purchaseValuesSchema.safeParse(form);
    if (!parsed.success) Object.assign(next, quoteFieldErrors(parsed.error.issues));
    if (Object.keys(next).length > 0) {
      setErrors(next);
      return;
    }
    setErrors({});
    save.mutate();
  }

  const isInr = form.currency_code.trim().toUpperCase() === "INR";

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {purchase ? `Edit ${purchase.purchase_number}` : "New purchase"}
            </DialogTitle>
            <DialogDescription>
              Record the final amount on the supplier invoice. The INR amount is calculated by the
              system.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            {!purchase && !presetSaleId ? (
              <Field label="Booking" htmlFor="purchase-booking" required error={errors["sale_id"]}>
                <RecordCombobox
                  id="purchase-booking"
                  options={bookingOptions}
                  value={form.sale_id}
                  onChange={(value) => setForm({ ...form, sale_id: value })}
                  placeholder="Select a booking"
                  searchPlaceholder="Search booking number or client"
                  emptyText="No open bookings found"
                />
              </Field>
            ) : null}
            <Field label="Vendor" htmlFor="purchase-vendor" required error={errors["vendor_id"]}>
              <RecordCombobox
                id="purchase-vendor"
                options={vendorOptions}
                value={form.vendor_id}
                onChange={(value) => setForm({ ...form, vendor_id: value })}
                placeholder="Select a vendor"
                searchPlaceholder="Search vendors"
                emptyText="No active vendors found"
                onCreateNew={vendorQuickAdd.openQuickAdd}
                createLabel="Add new vendor"
              />
            </Field>
            <VendorTermsNote
              vendor={(vendors.data ?? []).find((row) => row.id === form.vendor_id)}
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Invoice number"
                htmlFor="purchase-invoice"
                error={errors["vendor_invoice_number"]}
              >
                <Input
                  id="purchase-invoice"
                  value={form.vendor_invoice_number}
                  onChange={(event) =>
                    setForm({ ...form, vendor_invoice_number: event.target.value })
                  }
                />
              </Field>
              <Field label="Invoice date" htmlFor="purchase-date" error={errors["invoice_date"]}>
                <Input
                  id="purchase-date"
                  type="date"
                  value={form.invoice_date}
                  onChange={(event) => setForm({ ...form, invoice_date: event.target.value })}
                />
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field
                label="Currency"
                htmlFor="purchase-currency"
                required
                error={errors["currency_code"]}
              >
                <Input
                  id="purchase-currency"
                  maxLength={3}
                  value={form.currency_code}
                  onChange={(event) => {
                    const code = event.target.value.toUpperCase();
                    setForm({
                      ...form,
                      currency_code: code,
                      exchange_rate: code === "INR" ? "1" : form.exchange_rate,
                    });
                  }}
                />
              </Field>
              <Field
                label="Rate to INR"
                htmlFor="purchase-rate"
                required
                error={errors["exchange_rate"]}
              >
                <Input
                  id="purchase-rate"
                  inputMode="decimal"
                  disabled={isInr}
                  value={form.exchange_rate}
                  onChange={(event) => setForm({ ...form, exchange_rate: event.target.value })}
                />
              </Field>
              <Field label="Amount" htmlFor="purchase-amount" required error={errors["amount"]}>
                <Input
                  id="purchase-amount"
                  inputMode="decimal"
                  value={form.amount}
                  onChange={(event) => setForm({ ...form, amount: event.target.value })}
                />
              </Field>
            </div>
            <Field label="Notes" htmlFor="purchase-notes" error={errors["notes"]}>
              <Textarea
                id="purchase-notes"
                rows={3}
                value={form.notes}
                onChange={(event) => setForm({ ...form, notes: event.target.value })}
              />
            </Field>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={save.isPending}>
              {save.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
              {purchase ? "Save changes" : "Record purchase"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {vendorQuickAdd.quickAddDialog}
    </>
  );
}

/** Side panel: purchase detail with edit and cancel actions. */
export function PurchaseSheet({
  purchase,
  onOpenChange,
  onRecordPayment,
}: {
  purchase: PurchaseRow | null;
  onOpenChange: (open: boolean) => void;
  onRecordPayment?: (row: PurchaseRow) => void;
}) {
  const { hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const cancelFn = useServerFn(cancelPurchase);
  const [editOpen, setEditOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState<string | undefined>();

  const bookingOpen = Boolean(purchase?.sale) && purchase?.sale?.status !== "cancelled";
  const canChange =
    hasPermission("purchases.manage") && purchase?.status === "recorded" && bookingOpen;
  const canRecordPayment =
    onRecordPayment !== undefined &&
    hasPermission("payments.manage") &&
    purchase?.status === "recorded" &&
    bookingOpen &&
    toPaise(purchase.outstanding) > 0n;

  const cancel = useMutation({
    mutationFn: () => cancelFn({ data: { id: purchase!.id, reason } }),
    onSuccess: async () => {
      await invalidatePurchases(queryClient);
      toast.success("Purchase cancelled");
      setCancelOpen(false);
      onOpenChange(false);
    },
    onError: (error: Error) => toast.error("Request rejected", { description: error.message }),
  });

  function confirmCancel() {
    const parsed = purchaseCancelSchema.safeParse({ id: purchase?.id, reason });
    if (!parsed.success) {
      setReasonError(quoteFieldErrors(parsed.error.issues)["reason"] ?? "A reason is required");
      return;
    }
    setReasonError(undefined);
    cancel.mutate();
  }

  return (
    <>
      <Sheet open={purchase !== null} onOpenChange={onOpenChange}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
          {purchase ? (
            <>
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2 font-mono">
                  {purchase.purchase_number}
                  <PurchaseStatusBadge status={purchase.status} />
                </SheetTitle>
              </SheetHeader>
              <dl className="mt-4">
                <DetailRow
                  label="Booking"
                  value={
                    purchase.sale ? (
                      <Button asChild variant="link" size="sm" className="h-auto p-0">
                        <Link to="/sales/$saleId" params={{ saleId: purchase.sale.id }}>
                          {purchase.sale.booking_number} · {purchase.sale.client?.name ?? "—"}
                        </Link>
                      </Button>
                    ) : (
                      "—"
                    )
                  }
                />
                <DetailRow label="Vendor" value={purchase.vendor?.name ?? "—"} />
                <DetailRow label="Invoice number" value={purchase.vendor_invoice_number} />
                <DetailRow label="Invoice date" value={formatDate(purchase.invoice_date)} />
                <DetailRow
                  label="Amount"
                  value={formatMoney(purchase.amount, purchase.currency_code)}
                />
                <DetailRow label="Rate to INR" value={purchase.exchange_rate} />
                <DetailRow label="Amount (INR)" value={formatMoney(purchase.amount_inr)} />
                {purchase.status === "recorded" ? (
                  <>
                    <DetailRow label="Paid to vendor" value={formatMoney(purchase.paid)} />
                    <DetailRow label="Outstanding" value={formatMoney(purchase.outstanding)} />
                  </>
                ) : null}
                <DetailRow
                  label="Notes"
                  value={
                    purchase.notes ? (
                      <span className="whitespace-pre-wrap break-words">{purchase.notes}</span>
                    ) : null
                  }
                />
                {purchase.status === "cancelled" ? (
                  <DetailRow label="Cancel reason" value={purchase.cancel_reason} />
                ) : null}
                <DetailRow label="Recorded" value={formatDateTime(purchase.created_at)} />
                <DetailRow label="Last updated" value={formatDateTime(purchase.updated_at)} />
              </dl>
              {canChange ? (
                <div className="mt-4 flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => setEditOpen(true)}>
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-destructive"
                    onClick={() => {
                      setReason("");
                      setReasonError(undefined);
                      setCancelOpen(true);
                    }}
                  >
                    Cancel purchase
                  </Button>
                </div>
              ) : purchase.status === "recorded" && !bookingOpen ? (
                <p className="mt-4 text-xs text-muted-foreground">
                  The booking is {purchase.sale?.status}, so this purchase is read-only.
                </p>
              ) : null}
            </>
          ) : null}
        </SheetContent>
      </Sheet>

      <PurchaseFormDialog open={editOpen} onOpenChange={setEditOpen} purchase={purchase} />

      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Cancel {purchase?.purchase_number}?</DialogTitle>
            <DialogDescription>
              The purchase stays on record but no longer counts toward totals. This can't be undone.
            </DialogDescription>
          </DialogHeader>
          <Field label="Reason" htmlFor="purchase-cancel-reason" required error={reasonError}>
            <Textarea
              id="purchase-cancel-reason"
              rows={3}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          </Field>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelOpen(false)}>
              Keep purchase
            </Button>
            <Button variant="destructive" onClick={confirmCancel} disabled={cancel.isPending}>
              {cancel.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
              Cancel purchase
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function toneFor(value: string) {
  if (value.startsWith("-")) return "text-success";
  if (/^0\.00$/.test(value)) return "";
  return "text-destructive";
}

function profitTone(actual: string, expected: string) {
  const a = Number(actual);
  const e = Number(expected);
  if (a < e) return "text-destructive";
  if (a > e) return "text-success";
  return "";
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-md border border-border px-3 py-2">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className={cn("mt-1 text-sm font-semibold tabular-nums", tone)}>{value}</div>
    </div>
  );
}

/** Booking detail: purchases list, New Purchase shortcut and cost variance. */
export function BookingPurchases({
  saleId,
  bookingOpen,
}: {
  saleId: string;
  bookingOpen: boolean;
}) {
  const { hasPermission } = useAuth();
  const canManage = hasPermission("purchases.manage") && bookingOpen;
  const purchases = usePurchases({ sale_id: saleId });
  const varianceFn = useServerFn(getBookingVariance);
  const variance = useQuery({
    queryKey: ["booking-variance", saleId],
    queryFn: () => varianceFn({ data: { sale_id: saleId } }),
  });
  const [createOpen, setCreateOpen] = useState(false);
  const [selected, setSelected] = useState<PurchaseRow | null>(null);

  const v = variance.data;

  return (
    <section className="space-y-4 rounded-lg border border-border bg-surface p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Purchases
        </h2>
        {canManage ? (
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="size-3.5" />
            New Purchase
          </Button>
        ) : null}
      </div>

      {purchases.isPending ? (
        <TableSkeleton rows={2} />
      ) : purchases.isError ? (
        <ErrorState onRetry={() => purchases.refetch()} />
      ) : purchases.data.length === 0 ? (
        <EmptyState
          title="No purchases yet"
          description="Supplier invoices recorded against this booking appear here."
        />
      ) : (
        <PurchasesTable rows={purchases.data} onOpen={setSelected} showBooking={false} />
      )}

      <div className="space-y-3">
        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Cost variance
        </h3>
        {variance.isPending ? (
          <TableSkeleton rows={2} />
        ) : variance.isError || !v ? (
          <ErrorState onRetry={() => variance.refetch()} />
        ) : (
          <>
            <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
              <Stat label="Expected cost" value={formatMoney(v.expected_cost)} />
              <Stat label="Actual cost" value={formatMoney(v.actual_cost)} />
              <Stat
                label="Difference"
                value={formatMoney(v.difference)}
                tone={toneFor(v.difference)}
              />
              <Stat
                label="Difference %"
                value={v.difference_percent === null ? "—" : `${v.difference_percent}%`}
                tone={toneFor(v.difference)}
              />
              <Stat label="Expected profit" value={formatMoney(v.expected_profit)} />
              <Stat
                label="Actual profit"
                value={formatMoney(v.actual_profit)}
                tone={profitTone(v.actual_profit, v.expected_profit)}
              />
            </div>
            {v.vendors.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No expected costs or purchases for this booking yet.
              </p>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className={HEAD}>Vendor</TableHead>
                      <TableHead className={cn(HEAD, "text-right")}>Expected</TableHead>
                      <TableHead className={cn(HEAD, "text-right")}>Actual</TableHead>
                      <TableHead className={cn(HEAD, "text-right")}>Variance</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {v.vendors.map((row) => (
                      <TableRow key={row.vendor_id ?? "none"}>
                        <TableCell>
                          {row.vendor_name}
                          {!row.has_expected ? (
                            <Badge variant="outline" className="ml-2 text-[10px] uppercase">
                              No expected cost
                            </Badge>
                          ) : null}
                          {!row.has_purchase ? (
                            <Badge variant="outline" className="ml-2 text-[10px] uppercase">
                              No purchase yet
                            </Badge>
                          ) : null}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatMoney(row.expected)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatMoney(row.actual)}
                        </TableCell>
                        <TableCell className={cn("text-right tabular-nums", toneFor(row.variance))}>
                          {formatMoney(row.variance)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </>
        )}
      </div>

      <PurchaseFormDialog open={createOpen} onOpenChange={setCreateOpen} presetSaleId={saleId} />
      <PurchaseSheet purchase={selected} onOpenChange={(open) => !open && setSelected(null)} />
    </section>
  );
}
