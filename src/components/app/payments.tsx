import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { AccountSelect } from "@/components/app/account-select";
import { DetailRow, Field, formatDate, formatDateTime } from "@/components/app/master-data";
import { useBookingOptions, VendorTermsNote } from "@/components/app/purchases";
import { useQuickAdd } from "@/components/app/quick-add";
import { RecordCombobox, type RecordOption } from "@/components/app/sales-ui";
import { ErrorState, TableSkeleton } from "@/components/app/states";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { fromPaise, isMoneyString, toPaise } from "@/lib/money";
import {
  MONEY_TYPES,
  MONEY_TYPE_LABELS,
  PAYMENT_METHODS,
  PAYMENT_METHOD_LABELS,
  cancelSchema,
  paymentValuesSchema,
  type MoneyStatus,
  type MoneyType,
  type PaymentMethod,
} from "@/lib/payment-schemas";
import { getBookingVariance } from "@/lib/purchases.functions";
import {
  cancelVendorPayment,
  getBookingVendorPaid,
  listOpenPurchases,
  listVendorPayments,
  saveVendorPayment,
  type PaymentRow,
} from "@/lib/payments.functions";
import { quoteFieldErrors } from "@/lib/quotation-display";
import { formatMoney } from "@/lib/sale-costing-schemas";
import { cn } from "@/lib/utils";

export const MONEY_HEAD = "text-[10px] uppercase tracking-wider";

export function MoneyStatusBadge({ status }: { status: MoneyStatus }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "text-[10px] uppercase",
        status === "cancelled" ? "border-destructive/30 text-destructive" : "",
      )}
    >
      {status === "cancelled" ? "Cancelled" : "Recorded"}
    </Badge>
  );
}

export function SummaryStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface px-4 py-3">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 text-lg font-semibold tabular-nums">{value}</div>
    </div>
  );
}

export function todayIso() {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

export type PaymentFilters = {
  vendor_id?: string;
  sale_id?: string;
  payment_type?: string;
  status?: string;
  from?: string;
  to?: string;
};

export function useVendorPayments(filters: PaymentFilters, enabled = true) {
  const listFn = useServerFn(listVendorPayments);
  return useQuery({
    queryKey: ["vendor-payments", "list", filters],
    enabled,
    queryFn: () => listFn({ data: filters }),
  });
}

async function invalidatePayments(queryClient: ReturnType<typeof useQueryClient>) {
  await queryClient.invalidateQueries({ queryKey: ["vendor-payments"] });
  await queryClient.invalidateQueries({ queryKey: ["purchases"] });
  await queryClient.invalidateQueries({ queryKey: ["audit-log"] });
}

export function PaymentsTable({
  rows,
  onOpen,
  showBooking = true,
}: {
  rows: PaymentRow[];
  onOpen: (row: PaymentRow) => void;
  showBooking?: boolean;
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-surface">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className={MONEY_HEAD}>Payment</TableHead>
            <TableHead className={MONEY_HEAD}>Vendor</TableHead>
            {showBooking ? <TableHead className={MONEY_HEAD}>Booking</TableHead> : null}
            <TableHead className={MONEY_HEAD}>Type</TableHead>
            <TableHead className={MONEY_HEAD}>Date</TableHead>
            <TableHead className={cn(MONEY_HEAD, "text-right")}>Amount</TableHead>
            <TableHead className={cn(MONEY_HEAD, "text-right")}>Allocated</TableHead>
            <TableHead className={cn(MONEY_HEAD, "text-right")}>Unallocated</TableHead>
            <TableHead className={MONEY_HEAD}>Method</TableHead>
            <TableHead className={MONEY_HEAD}>Reference</TableHead>
            <TableHead className={MONEY_HEAD}>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.id} className="cursor-pointer" onClick={() => onOpen(row)}>
              <TableCell className="font-mono text-xs font-semibold">
                {row.payment_number}
              </TableCell>
              <TableCell>{row.vendor?.name ?? "—"}</TableCell>
              {showBooking ? (
                <TableCell className="font-mono text-xs">
                  {row.sale?.booking_number ?? "—"}
                </TableCell>
              ) : null}
              <TableCell className="text-xs">{MONEY_TYPE_LABELS[row.payment_type]}</TableCell>
              <TableCell className="text-xs">{formatDate(row.payment_date)}</TableCell>
              <TableCell className="text-right tabular-nums">
                {formatMoney(row.amount_inr)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {row.status === "recorded" ? formatMoney(row.allocated) : "—"}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {row.status === "recorded" ? formatMoney(row.unallocated) : "—"}
              </TableCell>
              <TableCell className="text-xs">{PAYMENT_METHOD_LABELS[row.method]}</TableCell>
              <TableCell className="text-xs">{row.reference ?? "—"}</TableCell>
              <TableCell>
                <MoneyStatusBadge status={row.status} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

type PaymentForm = {
  vendor_id: string;
  sale_id: string;
  account_id: string;
  payment_type: MoneyType;
  payment_date: string;
  amount_inr: string;
  method: PaymentMethod | "";
  reference: string;
  notes: string;
};

function emptyPaymentForm(saleId = "", vendorId = ""): PaymentForm {
  return {
    vendor_id: vendorId,
    sale_id: saleId,
    account_id: "",
    payment_type: "part",
    payment_date: todayIso(),
    amount_inr: "",
    method: "",
    reference: "",
    notes: "",
  };
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

/** Create (no `payment`) or edit a vendor payment with its allocations. */
export function PaymentFormDialog({
  open,
  onOpenChange,
  payment,
  presetSaleId,
  presetVendorId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  payment?: PaymentRow | null;
  presetSaleId?: string | undefined;
  presetVendorId?: string | undefined;
}) {
  const queryClient = useQueryClient();
  const saveFn = useServerFn(saveVendorPayment);
  const openFn = useServerFn(listOpenPurchases);
  const [form, setForm] = useState<PaymentForm>(emptyPaymentForm(presetSaleId, presetVendorId));
  const [alloc, setAlloc] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [lastOpen, setLastOpen] = useState(false);

  if (open !== lastOpen) {
    setLastOpen(open);
    if (open) {
      setErrors({});
      if (payment) {
        setForm({
          vendor_id: payment.vendor_id,
          sale_id: payment.sale_id ?? "",
          account_id: payment.account_id,
          payment_type: payment.payment_type,
          payment_date: payment.payment_date,
          amount_inr: payment.amount_inr,
          method: payment.method,
          reference: payment.reference ?? "",
          notes: payment.notes ?? "",
        });
        const initial: Record<string, string> = {};
        for (const a of payment.allocations) {
          if (a.purchase?.status === "recorded") initial[a.purchase_id] = a.amount_inr;
        }
        setAlloc(initial);
      } else {
        setForm(emptyPaymentForm(presetSaleId, presetVendorId));
        setAlloc({});
      }
    }
  }

  const bookings = useBookingOptions(open);
  const vendors = useActiveVendors(open);
  const vendorQuickAdd = useQuickAdd("vendor", (id) => {
    setForm((current) => ({ ...current, vendor_id: id }));
    setAlloc({});
  });

  const openPurchases = useQuery({
    queryKey: ["vendor-payments", "open-purchases", form.vendor_id, form.sale_id, payment?.id],
    enabled: open && Boolean(form.vendor_id),
    queryFn: () =>
      openFn({
        data: {
          vendor_id: form.vendor_id,
          sale_id: form.sale_id || null,
          payment_id: payment?.id ?? null,
        },
      }),
  });

  const bookingOptions: RecordOption[] = useMemo(
    () =>
      (bookings.data ?? [])
        .filter((row) => row.status !== "cancelled" || row.id === payment?.sale_id)
        .map((row) => ({
          id: row.id,
          label: `${row.booking_number} · ${row.client?.name ?? "—"}`,
          hint: row.status,
        })),
    [bookings.data, payment?.sale_id],
  );

  const vendorOptions: RecordOption[] = useMemo(() => {
    const options = (vendors.data ?? []).map((row) => ({
      id: row.id,
      label: row.name,
      hint: row.phone,
    }));
    if (payment?.vendor && !options.some((option) => option.id === payment.vendor_id)) {
      options.unshift({
        id: payment.vendor_id,
        label: `${payment.vendor.name} (inactive)`,
        hint: null,
      });
    }
    return options;
  }, [vendors.data, payment]);

  const rows = openPurchases.data ?? [];
  const amountPaise = isMoneyString(form.amount_inr) ? toPaise(form.amount_inr) : 0n;
  const allocatedPaise = rows.reduce(
    (sum, row) => sum + (isMoneyString(alloc[row.id] ?? "") ? toPaise(alloc[row.id]!) : 0n),
    0n,
  );
  const remainder = amountPaise - allocatedPaise;

  function autoAllocate() {
    let left = amountPaise;
    const next: Record<string, string> = {};
    for (const row of rows) {
      if (left <= 0n) break;
      const due = toPaise(row.outstanding);
      if (due <= 0n) continue;
      const take = due < left ? due : left;
      next[row.id] = fromPaise(take);
      left -= take;
    }
    setAlloc(next);
  }

  const save = useMutation({
    mutationFn: async () => {
      const values = paymentValuesSchema.parse(form);
      const allocations = rows
        .filter((row) => isMoneyString(alloc[row.id] ?? "") && toPaise(alloc[row.id]!) > 0n)
        .map((row) => ({ purchase_id: row.id, amount_inr: alloc[row.id]!.trim() }));
      return saveFn({ data: { id: payment?.id ?? null, values, allocations } });
    },
    onSuccess: async (result) => {
      await invalidatePayments(queryClient);
      toast.success(payment ? "Payment updated" : `Payment ${result.payment_number} recorded`);
      onOpenChange(false);
    },
    onError: (error: Error) => toast.error("Request rejected", { description: error.message }),
  });

  function submit() {
    const next: Record<string, string> = {};
    const parsed = paymentValuesSchema.safeParse(form);
    if (!parsed.success) Object.assign(next, quoteFieldErrors(parsed.error.issues));
    for (const row of rows) {
      const value = (alloc[row.id] ?? "").trim();
      if (!value) continue;
      if (!isMoneyString(value)) {
        next[`alloc-${row.id}`] = "Invalid amount";
      } else if (toPaise(value) > toPaise(row.outstanding)) {
        next[`alloc-${row.id}`] = "More than outstanding";
      }
    }
    if (remainder < 0n) next["allocations"] = "Allocations exceed the payment amount";
    if (Object.keys(next).length > 0) {
      setErrors(next);
      return;
    }
    setErrors({});
    save.mutate();
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{payment ? `Edit ${payment.payment_number}` : "New payment"}</DialogTitle>
            <DialogDescription>
              Record money paid to a vendor in INR and allocate it to their purchases. Any amount
              left unallocated can be allocated later.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Vendor" htmlFor="payment-vendor" required error={errors["vendor_id"]}>
                <RecordCombobox
                  id="payment-vendor"
                  options={vendorOptions}
                  value={form.vendor_id}
                  onChange={(value) => {
                    setForm({ ...form, vendor_id: value });
                    setAlloc({});
                  }}
                  placeholder="Select a vendor"
                  searchPlaceholder="Search vendors"
                  emptyText="No active vendors found"
                  onCreateNew={vendorQuickAdd.openQuickAdd}
                  createLabel="Add new vendor"
                />
              </Field>
              <div className="sm:col-span-2">
                <VendorTermsNote
                  vendor={(vendors.data ?? []).find((row) => row.id === form.vendor_id)}
                />
              </div>
              <Field
                label="Paid from account"
                htmlFor="payment-account"
                required
                error={errors["account_id"]}
              >
                <AccountSelect
                  id="payment-account"
                  value={form.account_id}
                  onChange={(value) => setForm((current) => ({ ...current, account_id: value }))}
                  currentName={payment?.account?.name}
                  autoDefault={!payment}
                />
              </Field>
              <Field label="Booking (optional)" htmlFor="payment-booking" error={errors["sale_id"]}>
                <RecordCombobox
                  id="payment-booking"
                  options={bookingOptions}
                  value={form.sale_id}
                  onChange={(value) => {
                    setForm({ ...form, sale_id: value });
                    setAlloc({});
                  }}
                  placeholder="Not linked to a booking"
                  searchPlaceholder="Search booking number or client"
                  emptyText="No bookings found"
                  allowClear
                />
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-4">
              <Field label="Type" htmlFor="payment-type">
                <Select
                  value={form.payment_type}
                  onValueChange={(value) => setForm({ ...form, payment_type: value as MoneyType })}
                >
                  <SelectTrigger id="payment-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MONEY_TYPES.map((type) => (
                      <SelectItem key={type} value={type}>
                        {MONEY_TYPE_LABELS[type]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Date" htmlFor="payment-date" error={errors["payment_date"]}>
                <Input
                  id="payment-date"
                  type="date"
                  value={form.payment_date}
                  onChange={(event) => setForm({ ...form, payment_date: event.target.value })}
                />
              </Field>
              <Field
                label="Amount (INR)"
                htmlFor="payment-amount"
                required
                error={errors["amount_inr"]}
              >
                <Input
                  id="payment-amount"
                  inputMode="decimal"
                  value={form.amount_inr}
                  onChange={(event) => setForm({ ...form, amount_inr: event.target.value })}
                />
              </Field>
              <Field label="Method" htmlFor="payment-method" required error={errors["method"]}>
                <Select
                  value={form.method}
                  onValueChange={(value) => setForm({ ...form, method: value as PaymentMethod })}
                >
                  <SelectTrigger id="payment-method">
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent>
                    {PAYMENT_METHODS.map((method) => (
                      <SelectItem key={method} value={method}>
                        {PAYMENT_METHOD_LABELS[method]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Reference" htmlFor="payment-reference" error={errors["reference"]}>
                <Input
                  id="payment-reference"
                  placeholder="UTR or cheque number"
                  value={form.reference}
                  onChange={(event) => setForm({ ...form, reference: event.target.value })}
                />
              </Field>
              <Field label="Notes" htmlFor="payment-notes" error={errors["notes"]}>
                <Textarea
                  id="payment-notes"
                  rows={1}
                  value={form.notes}
                  onChange={(event) => setForm({ ...form, notes: event.target.value })}
                />
              </Field>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Allocate to open purchases
                </h3>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={autoAllocate}
                  disabled={rows.length === 0 || amountPaise <= 0n}
                >
                  Auto-allocate oldest first
                </Button>
              </div>
              {!form.vendor_id ? (
                <p className="text-xs text-muted-foreground">
                  Select a vendor to see open purchases.
                </p>
              ) : openPurchases.isPending ? (
                <TableSkeleton rows={2} />
              ) : openPurchases.isError ? (
                <ErrorState onRetry={() => openPurchases.refetch()} />
              ) : rows.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No open purchases for this vendor{form.sale_id ? " on this booking" : ""}. The
                  payment will stay unallocated.
                </p>
              ) : (
                <div className="overflow-x-auto rounded-lg border border-border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className={MONEY_HEAD}>Purchase</TableHead>
                        <TableHead className={MONEY_HEAD}>Booking</TableHead>
                        <TableHead className={MONEY_HEAD}>Invoice</TableHead>
                        <TableHead className={cn(MONEY_HEAD, "text-right")}>Outstanding</TableHead>
                        <TableHead className={cn(MONEY_HEAD, "w-40 text-right")}>
                          Allocate
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.map((row) => (
                        <TableRow key={row.id}>
                          <TableCell className="font-mono text-xs">{row.purchase_number}</TableCell>
                          <TableCell className="font-mono text-xs">
                            {row.booking_number ?? "—"}
                          </TableCell>
                          <TableCell className="text-xs">
                            {row.vendor_invoice_number ?? "—"}
                            <div className="text-muted-foreground">
                              {formatDate(row.invoice_date)}
                            </div>
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {formatMoney(row.outstanding)}
                          </TableCell>
                          <TableCell className="text-right">
                            <Input
                              aria-label={`Allocate to ${row.purchase_number}`}
                              inputMode="decimal"
                              className="h-8 text-right"
                              value={alloc[row.id] ?? ""}
                              onChange={(event) =>
                                setAlloc({ ...alloc, [row.id]: event.target.value })
                              }
                            />
                            {errors[`alloc-${row.id}`] ? (
                              <p className="mt-1 text-[11px] text-destructive">
                                {errors[`alloc-${row.id}`]}
                              </p>
                            ) : null}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
              <div className="flex justify-end gap-6 text-sm">
                <span className="text-muted-foreground">
                  Allocated{" "}
                  <span className="font-semibold tabular-nums text-foreground">
                    {formatMoney(fromPaise(allocatedPaise))}
                  </span>
                </span>
                <span className="text-muted-foreground">
                  Unallocated{" "}
                  <span
                    className={cn(
                      "font-semibold tabular-nums",
                      remainder < 0n ? "text-destructive" : "text-foreground",
                    )}
                  >
                    {formatMoney(fromPaise(remainder))}
                  </span>
                </span>
              </div>
              {errors["allocations"] ? (
                <p className="text-right text-xs font-medium text-destructive">
                  {errors["allocations"]}
                </p>
              ) : null}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={save.isPending}>
              {save.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
              {payment ? "Save changes" : "Record payment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {vendorQuickAdd.quickAddDialog}
    </>
  );
}

/** Side panel: payment detail, allocations, edit and cancel. */
export function PaymentSheet({
  payment,
  onOpenChange,
}: {
  payment: PaymentRow | null;
  onOpenChange: (open: boolean) => void;
}) {
  const { hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const cancelFn = useServerFn(cancelVendorPayment);
  const [editOpen, setEditOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState<string | undefined>();

  const canChange = hasPermission("payments.manage") && payment?.status === "recorded";

  const cancel = useMutation({
    mutationFn: () => cancelFn({ data: { id: payment!.id, reason } }),
    onSuccess: async () => {
      await invalidatePayments(queryClient);
      toast.success("Payment cancelled");
      setCancelOpen(false);
      onOpenChange(false);
    },
    onError: (error: Error) => toast.error("Request rejected", { description: error.message }),
  });

  function confirmCancel() {
    const parsed = cancelSchema.safeParse({ id: payment?.id, reason });
    if (!parsed.success) {
      setReasonError(quoteFieldErrors(parsed.error.issues)["reason"] ?? "A reason is required");
      return;
    }
    setReasonError(undefined);
    cancel.mutate();
  }

  return (
    <>
      <Sheet open={payment !== null} onOpenChange={onOpenChange}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
          {payment ? (
            <>
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2 font-mono">
                  {payment.payment_number}
                  <MoneyStatusBadge status={payment.status} />
                </SheetTitle>
              </SheetHeader>
              <dl className="mt-4">
                <DetailRow label="Vendor" value={payment.vendor?.name ?? "—"} />
                <DetailRow
                  label="Booking"
                  value={
                    payment.sale ? (
                      <Button asChild variant="link" size="sm" className="h-auto p-0">
                        <Link to="/sales/$saleId" params={{ saleId: payment.sale.id }}>
                          {payment.sale.booking_number} · {payment.sale.client?.name ?? "—"}
                        </Link>
                      </Button>
                    ) : null
                  }
                />
                <DetailRow label="Type" value={MONEY_TYPE_LABELS[payment.payment_type]} />
                <DetailRow label="Date" value={formatDate(payment.payment_date)} />
                <DetailRow label="Amount" value={formatMoney(payment.amount_inr)} />
                <DetailRow label="Allocated" value={formatMoney(payment.allocated)} />
                <DetailRow label="Unallocated" value={formatMoney(payment.unallocated)} />
                <DetailRow label="Method" value={PAYMENT_METHOD_LABELS[payment.method]} />
                <DetailRow label="Account" value={payment.account?.name ?? "—"} />
                <DetailRow label="Reference" value={payment.reference} />
                <DetailRow
                  label="Notes"
                  value={
                    payment.notes ? (
                      <span className="whitespace-pre-wrap break-words">{payment.notes}</span>
                    ) : null
                  }
                />
                {payment.status === "cancelled" ? (
                  <DetailRow label="Cancel reason" value={payment.cancel_reason} />
                ) : null}
                <DetailRow label="Recorded" value={formatDateTime(payment.created_at)} />
                <DetailRow label="Last updated" value={formatDateTime(payment.updated_at)} />
              </dl>

              <h3 className="mt-6 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Allocations
              </h3>
              {payment.allocations.length === 0 ? (
                <p className="mt-2 text-xs text-muted-foreground">Not allocated to any purchase.</p>
              ) : (
                <div className="mt-2 overflow-x-auto rounded-lg border border-border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className={MONEY_HEAD}>Purchase</TableHead>
                        <TableHead className={MONEY_HEAD}>Booking</TableHead>
                        <TableHead className={cn(MONEY_HEAD, "text-right")}>Amount</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {payment.allocations.map((a) => (
                        <TableRow key={a.id}>
                          <TableCell className="font-mono text-xs">
                            {a.purchase?.purchase_number ?? "—"}
                            {a.purchase?.status === "cancelled" ? (
                              <span className="ml-2 text-destructive">(purchase cancelled)</span>
                            ) : null}
                          </TableCell>
                          <TableCell className="font-mono text-xs">
                            {a.purchase?.sale?.booking_number ?? "—"}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {formatMoney(a.amount_inr)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
              {payment.status === "cancelled" && payment.allocations.length > 0 ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  This payment is cancelled, so these allocations no longer count.
                </p>
              ) : null}

              {canChange ? (
                <div className="mt-4 flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => setEditOpen(true)}>
                    Edit / allocate
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
                    Cancel payment
                  </Button>
                </div>
              ) : null}
            </>
          ) : null}
        </SheetContent>
      </Sheet>

      <PaymentFormDialog open={editOpen} onOpenChange={setEditOpen} payment={payment} />

      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Cancel {payment?.payment_number}?</DialogTitle>
            <DialogDescription>
              The payment stays on record, its allocations are released and it no longer counts
              toward totals. This can't be undone.
            </DialogDescription>
          </DialogHeader>
          <Field label="Reason" htmlFor="payment-cancel-reason" required error={reasonError}>
            <Textarea
              id="payment-cancel-reason"
              rows={3}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          </Field>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelOpen(false)}>
              Keep payment
            </Button>
            <Button variant="destructive" onClick={confirmCancel} disabled={cancel.isPending}>
              {cancel.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
              Cancel payment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Booking page: paid to vendors next to expected/actual cost, with a Record Payment shortcut. */
export function BookingVendorPayments({
  saleId,
  bookingOpen,
}: {
  saleId: string;
  bookingOpen: boolean;
}) {
  const { hasPermission } = useAuth();
  const canManage = hasPermission("payments.manage") && bookingOpen;
  const paidFn = useServerFn(getBookingVendorPaid);
  const varianceFn = useServerFn(getBookingVariance);
  const paid = useQuery({
    queryKey: ["vendor-payments", "booking-paid", saleId],
    queryFn: () => paidFn({ data: { sale_id: saleId } }),
  });
  const variance = useQuery({
    queryKey: ["booking-variance", saleId],
    enabled: hasPermission("purchases.read") && hasPermission("sales.read"),
    queryFn: () => varianceFn({ data: { sale_id: saleId } }),
  });
  const payments = useVendorPayments({ sale_id: saleId });
  const [createOpen, setCreateOpen] = useState(false);
  const [selected, setSelected] = useState<PaymentRow | null>(null);
  const current = selected
    ? (payments.data?.find((row) => row.id === selected.id) ?? selected)
    : null;

  return (
    <section className="space-y-4 rounded-lg border border-border bg-surface p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Vendor payments
        </h2>
        {canManage ? (
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            Record Payment
          </Button>
        ) : null}
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        <SummaryStat
          label="Expected cost"
          value={variance.data ? formatMoney(variance.data.expected_cost) : "—"}
        />
        <SummaryStat
          label="Actual cost"
          value={variance.data ? formatMoney(variance.data.actual_cost) : "—"}
        />
        <SummaryStat
          label="Paid to vendors"
          value={paid.data ? formatMoney(paid.data.paid_to_vendors) : "—"}
        />
      </div>
      <p className="text-xs text-muted-foreground">
        Paid to vendors counts payments linked to this booking plus allocations to its purchases
        from payments not linked to any booking.
      </p>
      {payments.isPending ? (
        <TableSkeleton rows={2} />
      ) : payments.isError ? (
        <ErrorState onRetry={() => payments.refetch()} />
      ) : payments.data.length === 0 ? (
        <p className="text-xs text-muted-foreground">No payments linked to this booking yet.</p>
      ) : (
        <PaymentsTable rows={payments.data} onOpen={setSelected} showBooking={false} />
      )}
      <PaymentFormDialog open={createOpen} onOpenChange={setCreateOpen} presetSaleId={saleId} />
      <PaymentSheet payment={current} onOpenChange={(open) => !open && setSelected(null)} />
    </section>
  );
}
