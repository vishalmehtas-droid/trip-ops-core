import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { DetailRow, Field, formatDate, formatDateTime } from "@/components/app/master-data";
import { QuickReceiptDialog } from "@/components/app/money-shortcuts";
import { MONEY_HEAD, MoneyStatusBadge, SummaryStat, todayIso } from "@/components/app/payments";
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
import { fromPaise, isMoneyString, toPaise } from "@/lib/money";
import {
  MONEY_TYPES,
  MONEY_TYPE_LABELS,
  PAYMENT_METHODS,
  PAYMENT_METHOD_LABELS,
  RECEIPT_PAYMENT_STATUS_LABELS,
  cancelSchema,
  receiptValuesSchema,
  type MoneyType,
  type PaymentMethod,
  type ReceiptPaymentStatus,
} from "@/lib/payment-schemas";
import { quoteFieldErrors } from "@/lib/quotation-display";
import {
  cancelReceipt,
  createReceipt,
  getBookingReceivable,
  getReceivables,
  listReceipts,
  updateReceipt,
  type ReceiptRow,
} from "@/lib/receipts.functions";
import { formatMoney } from "@/lib/sale-costing-schemas";
import { cn } from "@/lib/utils";

export function ReceiptPaymentBadge({ status }: { status: ReceiptPaymentStatus }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "text-[10px] uppercase",
        status === "paid" && "border-success/40 text-success",
        status === "partly_paid" && "border-warning/40 text-warning",
        status === "unpaid" && "text-muted-foreground",
      )}
    >
      {RECEIPT_PAYMENT_STATUS_LABELS[status]}
    </Badge>
  );
}

export type ReceiptFilters = {
  sale_id?: string;
  payment_type?: string;
  status?: string;
  from?: string;
  to?: string;
};

export function useReceipts(filters: ReceiptFilters, enabled = true) {
  const listFn = useServerFn(listReceipts);
  return useQuery({
    queryKey: ["receipts", "list", filters],
    enabled,
    queryFn: () => listFn({ data: filters }),
  });
}

export function useReceivables(enabled = true) {
  const fn = useServerFn(getReceivables);
  return useQuery({ queryKey: ["receipts", "receivables"], enabled, queryFn: () => fn() });
}

async function invalidateReceipts(queryClient: ReturnType<typeof useQueryClient>) {
  await queryClient.invalidateQueries({ queryKey: ["receipts"] });
  await queryClient.invalidateQueries({ queryKey: ["audit-log"] });
}

export function ReceiptsTable({
  rows,
  onOpen,
  showBooking = true,
}: {
  rows: ReceiptRow[];
  onOpen: (row: ReceiptRow) => void;
  showBooking?: boolean;
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-surface">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className={MONEY_HEAD}>Receipt</TableHead>
            {showBooking ? <TableHead className={MONEY_HEAD}>Booking</TableHead> : null}
            <TableHead className={MONEY_HEAD}>Type</TableHead>
            <TableHead className={MONEY_HEAD}>Date</TableHead>
            <TableHead className={cn(MONEY_HEAD, "text-right")}>Amount</TableHead>
            <TableHead className={MONEY_HEAD}>Method</TableHead>
            <TableHead className={MONEY_HEAD}>Reference</TableHead>
            <TableHead className={MONEY_HEAD}>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.id} className="cursor-pointer" onClick={() => onOpen(row)}>
              <TableCell className="font-mono text-xs font-semibold">
                {row.receipt_number}
              </TableCell>
              {showBooking ? (
                <TableCell>
                  <div className="font-mono text-xs">{row.sale?.booking_number ?? "—"}</div>
                  <div className="text-xs text-muted-foreground">
                    {row.sale?.client?.name ?? "—"}
                  </div>
                </TableCell>
              ) : null}
              <TableCell className="text-xs">{MONEY_TYPE_LABELS[row.payment_type]}</TableCell>
              <TableCell className="text-xs">{formatDate(row.receipt_date)}</TableCell>
              <TableCell className="text-right tabular-nums">
                {formatMoney(row.amount_inr)}
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

type ReceiptForm = {
  sale_id: string;
  payment_type: MoneyType;
  receipt_date: string;
  amount_inr: string;
  method: PaymentMethod | "";
  reference: string;
  notes: string;
};

function emptyReceiptForm(saleId = ""): ReceiptForm {
  return {
    sale_id: saleId,
    payment_type: "part",
    receipt_date: todayIso(),
    amount_inr: "",
    method: "",
    reference: "",
    notes: "",
  };
}

/** Create (no `receipt`) or edit a customer receipt. */
export function ReceiptFormDialog({
  open,
  onOpenChange,
  receipt,
  presetSaleId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  receipt?: ReceiptRow | null;
  presetSaleId?: string;
}) {
  const queryClient = useQueryClient();
  const createFn = useServerFn(createReceipt);
  const updateFn = useServerFn(updateReceipt);
  const [form, setForm] = useState<ReceiptForm>(emptyReceiptForm(presetSaleId));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [lastOpen, setLastOpen] = useState(false);

  if (open !== lastOpen) {
    setLastOpen(open);
    if (open) {
      setErrors({});
      setForm(
        receipt
          ? {
              sale_id: receipt.sale_id,
              payment_type: receipt.payment_type,
              receipt_date: receipt.receipt_date,
              amount_inr: receipt.amount_inr,
              method: receipt.method,
              reference: receipt.reference ?? "",
              notes: receipt.notes ?? "",
            }
          : emptyReceiptForm(presetSaleId),
      );
    }
  }

  const receivables = useReceivables(open);
  const bookingOptions: RecordOption[] = useMemo(
    () =>
      (receivables.data?.bookings ?? [])
        .filter((row) => row.sale_status !== "cancelled")
        .map((row) => ({
          id: row.sale_id,
          label: `${row.booking_number} · ${row.client_name ?? "—"}`,
          hint: `Outstanding ${formatMoney(row.outstanding)}`,
        })),
    [receivables.data],
  );
  const chosen = receivables.data?.bookings.find((row) => row.sale_id === form.sale_id);
  // When editing, this receipt's own amount is already counted as received.
  const ownPaise = receipt && receipt.status === "recorded" ? toPaise(receipt.amount_inr) : 0n;
  const available = chosen ? toPaise(chosen.outstanding) + ownPaise : null;

  const save = useMutation({
    mutationFn: async () => {
      const values = receiptValuesSchema.parse(form);
      if (receipt) return updateFn({ data: { id: receipt.id, values } });
      return createFn({ data: { sale_id: form.sale_id, values } });
    },
    onSuccess: async (result) => {
      await invalidateReceipts(queryClient);
      toast.success(
        receipt
          ? "Receipt updated"
          : `Receipt ${(result as { receipt_number?: string }).receipt_number ?? ""} recorded`,
      );
      onOpenChange(false);
    },
    onError: (error: Error) => toast.error("Request rejected", { description: error.message }),
  });

  function submit() {
    const next: Record<string, string> = {};
    if (!form.sale_id) next["sale_id"] = "Select a booking";
    const parsed = receiptValuesSchema.safeParse(form);
    if (!parsed.success) Object.assign(next, quoteFieldErrors(parsed.error.issues));
    if (
      !next["amount_inr"] &&
      available !== null &&
      isMoneyString(form.amount_inr) &&
      toPaise(form.amount_inr) > available
    ) {
      next["amount_inr"] = `Can't exceed the outstanding ${formatMoney(fromPaise(available))}`;
    }
    if (Object.keys(next).length > 0) {
      setErrors(next);
      return;
    }
    setErrors({});
    save.mutate();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{receipt ? `Edit ${receipt.receipt_number}` : "New receipt"}</DialogTitle>
          <DialogDescription>
            Record money received from the client in INR. Receipts can't exceed the booking's
            customer payable.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          {!receipt && !presetSaleId ? (
            <Field label="Booking" htmlFor="receipt-booking" required error={errors["sale_id"]}>
              <RecordCombobox
                id="receipt-booking"
                options={bookingOptions}
                value={form.sale_id}
                onChange={(value) => setForm({ ...form, sale_id: value })}
                placeholder="Select a booking"
                searchPlaceholder="Search booking number or client"
                emptyText="No open bookings found"
              />
            </Field>
          ) : null}
          {receivables.isPending && form.sale_id ? (
            <TableSkeleton rows={1} />
          ) : chosen ? (
            <div className="grid grid-cols-3 gap-2 rounded-md border border-border p-3 text-sm">
              <div>
                <div className="text-[10px] uppercase text-muted-foreground">Customer payable</div>
                <div className="font-semibold tabular-nums">
                  {formatMoney(chosen.customer_payable)}
                </div>
              </div>
              <div>
                <div className="text-[10px] uppercase text-muted-foreground">Received</div>
                <div className="font-semibold tabular-nums">{formatMoney(chosen.received)}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase text-muted-foreground">Outstanding</div>
                <div className="font-semibold tabular-nums">{formatMoney(chosen.outstanding)}</div>
              </div>
            </div>
          ) : null}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Type" htmlFor="receipt-type">
              <Select
                value={form.payment_type}
                onValueChange={(value) => setForm({ ...form, payment_type: value as MoneyType })}
              >
                <SelectTrigger id="receipt-type">
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
            <Field label="Date" htmlFor="receipt-date" error={errors["receipt_date"]}>
              <Input
                id="receipt-date"
                type="date"
                value={form.receipt_date}
                onChange={(event) => setForm({ ...form, receipt_date: event.target.value })}
              />
            </Field>
            <Field
              label="Amount (INR)"
              htmlFor="receipt-amount"
              required
              error={errors["amount_inr"]}
            >
              <Input
                id="receipt-amount"
                inputMode="decimal"
                value={form.amount_inr}
                onChange={(event) => setForm({ ...form, amount_inr: event.target.value })}
              />
            </Field>
            <Field label="Method" htmlFor="receipt-method" required error={errors["method"]}>
              <Select
                value={form.method}
                onValueChange={(value) => setForm({ ...form, method: value as PaymentMethod })}
              >
                <SelectTrigger id="receipt-method">
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
          <Field label="Reference" htmlFor="receipt-reference" error={errors["reference"]}>
            <Input
              id="receipt-reference"
              placeholder="UTR or cheque number"
              value={form.reference}
              onChange={(event) => setForm({ ...form, reference: event.target.value })}
            />
          </Field>
          <Field label="Notes" htmlFor="receipt-notes" error={errors["notes"]}>
            <Textarea
              id="receipt-notes"
              rows={2}
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
            {receipt ? "Save changes" : "Record receipt"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ReceiptSheet({
  receipt,
  onOpenChange,
}: {
  receipt: ReceiptRow | null;
  onOpenChange: (open: boolean) => void;
}) {
  const { hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const cancelFn = useServerFn(cancelReceipt);
  const [editOpen, setEditOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState<string | undefined>();

  const canManage = hasPermission("receipts.manage") && receipt?.status === "recorded";
  const bookingOpen = receipt?.sale?.status !== "cancelled";

  const cancel = useMutation({
    mutationFn: () => cancelFn({ data: { id: receipt!.id, reason } }),
    onSuccess: async () => {
      await invalidateReceipts(queryClient);
      toast.success("Receipt cancelled");
      setCancelOpen(false);
      onOpenChange(false);
    },
    onError: (error: Error) => toast.error("Request rejected", { description: error.message }),
  });

  function confirmCancel() {
    const parsed = cancelSchema.safeParse({ id: receipt?.id, reason });
    if (!parsed.success) {
      setReasonError(quoteFieldErrors(parsed.error.issues)["reason"] ?? "A reason is required");
      return;
    }
    setReasonError(undefined);
    cancel.mutate();
  }

  return (
    <>
      <Sheet open={receipt !== null} onOpenChange={onOpenChange}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
          {receipt ? (
            <>
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2 font-mono">
                  {receipt.receipt_number}
                  <MoneyStatusBadge status={receipt.status} />
                </SheetTitle>
              </SheetHeader>
              <dl className="mt-4">
                <DetailRow
                  label="Booking"
                  value={
                    receipt.sale ? (
                      <Button asChild variant="link" size="sm" className="h-auto p-0">
                        <Link to="/sales/$saleId" params={{ saleId: receipt.sale.id }}>
                          {receipt.sale.booking_number} · {receipt.sale.client?.name ?? "—"}
                        </Link>
                      </Button>
                    ) : null
                  }
                />
                <DetailRow label="Type" value={MONEY_TYPE_LABELS[receipt.payment_type]} />
                <DetailRow label="Date" value={formatDate(receipt.receipt_date)} />
                <DetailRow label="Amount" value={formatMoney(receipt.amount_inr)} />
                <DetailRow label="Method" value={PAYMENT_METHOD_LABELS[receipt.method]} />
                <DetailRow label="Reference" value={receipt.reference} />
                <DetailRow
                  label="Notes"
                  value={
                    receipt.notes ? (
                      <span className="whitespace-pre-wrap break-words">{receipt.notes}</span>
                    ) : null
                  }
                />
                {receipt.status === "cancelled" ? (
                  <DetailRow label="Cancel reason" value={receipt.cancel_reason} />
                ) : null}
                <DetailRow label="Recorded" value={formatDateTime(receipt.created_at)} />
                <DetailRow label="Last updated" value={formatDateTime(receipt.updated_at)} />
              </dl>
              {canManage ? (
                <div className="mt-4 flex gap-2">
                  {bookingOpen ? (
                    <Button size="sm" variant="outline" onClick={() => setEditOpen(true)}>
                      Edit
                    </Button>
                  ) : null}
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
                    Cancel receipt
                  </Button>
                </div>
              ) : null}
            </>
          ) : null}
        </SheetContent>
      </Sheet>

      <ReceiptFormDialog open={editOpen} onOpenChange={setEditOpen} receipt={receipt} />

      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Cancel {receipt?.receipt_number}?</DialogTitle>
            <DialogDescription>
              The receipt stays on record but no longer counts toward totals. This can't be undone.
            </DialogDescription>
          </DialogHeader>
          <Field label="Reason" htmlFor="receipt-cancel-reason" required error={reasonError}>
            <Textarea
              id="receipt-cancel-reason"
              rows={3}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          </Field>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelOpen(false)}>
              Keep receipt
            </Button>
            <Button variant="destructive" onClick={confirmCancel} disabled={cancel.isPending}>
              {cancel.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
              Cancel receipt
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Booking page: payable / received / outstanding, receipts list and New Receipt shortcut. */
export function BookingReceipts({ saleId, bookingOpen }: { saleId: string; bookingOpen: boolean }) {
  const { hasPermission } = useAuth();
  const canManage = hasPermission("receipts.manage") && bookingOpen;
  const summaryFn = useServerFn(getBookingReceivable);
  const summary = useQuery({
    queryKey: ["receipts", "booking", saleId],
    queryFn: () => summaryFn({ data: { sale_id: saleId } }),
  });
  const receipts = useReceipts({ sale_id: saleId });
  const [createOpen, setCreateOpen] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);
  const [selected, setSelected] = useState<ReceiptRow | null>(null);
  const current = selected
    ? (receipts.data?.find((row) => row.id === selected.id) ?? selected)
    : null;
  const s = summary.data;

  return (
    <section className="space-y-4 rounded-lg border border-border bg-surface p-4">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Receipts
          {s ? <ReceiptPaymentBadge status={s.payment_status} /> : null}
        </h2>
        {canManage ? (
          <div className="flex gap-2">
            {s && toPaise(s.outstanding) > 0n ? (
              <Button size="sm" variant="outline" onClick={() => setQuickOpen(true)}>
                Mark paid in full
              </Button>
            ) : null}
            <Button size="sm" onClick={() => setQuickOpen(true)}>
              New Receipt
            </Button>
          </div>
        ) : null}
      </div>
      {summary.isPending ? (
        <TableSkeleton rows={1} />
      ) : summary.isError || !s ? (
        <ErrorState onRetry={() => summary.refetch()} />
      ) : (
        <div className="grid gap-2 sm:grid-cols-4">
          <SummaryStat label="Customer payable" value={formatMoney(s.customer_payable)} />
          <SummaryStat label="Received" value={formatMoney(s.received)} />
          <SummaryStat label="Outstanding" value={formatMoney(s.outstanding)} />
          <SummaryStat label="Advance received" value={formatMoney(s.advance_received)} />
        </div>
      )}
      {receipts.isPending ? (
        <TableSkeleton rows={2} />
      ) : receipts.isError ? (
        <ErrorState onRetry={() => receipts.refetch()} />
      ) : receipts.data.length === 0 ? (
        <EmptyState
          title="No receipts yet"
          description="Money received from the client for this booking appears here."
        />
      ) : (
        <ReceiptsTable rows={receipts.data} onOpen={setSelected} showBooking={false} />
      )}
      <QuickReceiptDialog
        saleId={saleId}
        open={quickOpen}
        onOpenChange={setQuickOpen}
        onOpenFullForm={() => {
          setQuickOpen(false);
          setCreateOpen(true);
        }}
      />
      <ReceiptFormDialog open={createOpen} onOpenChange={setCreateOpen} presetSaleId={saleId} />
      <ReceiptSheet receipt={current} onOpenChange={(open) => !open && setSelected(null)} />
    </section>
  );
}
