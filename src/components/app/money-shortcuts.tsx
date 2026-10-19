import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Field } from "@/components/app/master-data";
import { todayIso } from "@/components/app/payments";
import { TableSkeleton } from "@/components/app/states";
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
import { fromPaise, isMoneyString, toPaise } from "@/lib/money";
import { receiptType, vendorPaymentType } from "@/lib/money-shortcuts";
import {
  MONEY_TYPE_LABELS,
  PAYMENT_METHODS,
  PAYMENT_METHOD_LABELS,
  type PaymentMethod,
} from "@/lib/payment-schemas";
import { saveVendorPayment } from "@/lib/payments.functions";
import type { PurchaseRow } from "@/lib/purchases.functions";
import { createReceipt, getBookingReceivable, listReceipts } from "@/lib/receipts.functions";
import { formatMoney } from "@/lib/sale-costing-schemas";

export type QuickMoneyForm = {
  amount_inr: string;
  date: string;
  method: PaymentMethod | "";
  reference: string;
};

export function emptyQuickMoney(amount = ""): QuickMoneyForm {
  return { amount_inr: amount, date: todayIso(), method: "", reference: "" };
}

/** Validates the compact form; `max` caps the amount in paise. */
export function quickMoneyErrors(form: QuickMoneyForm, max: bigint | null) {
  const errors: Record<string, string> = {};
  if (!isMoneyString(form.amount_inr) || toPaise(form.amount_inr) <= 0n) {
    errors["amount_inr"] = "Enter an amount with at most 2 decimals";
  } else if (max !== null && toPaise(form.amount_inr) > max) {
    errors["amount_inr"] = `Can't exceed the outstanding ${formatMoney(fromPaise(max))}`;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(form.date)) errors["date"] = "Enter a valid date";
  if (!form.method) errors["method"] = "Select a method";
  if (form.reference.trim().length > 200) errors["reference"] = "Reference is too long";
  return errors;
}

/** Amount, date, method and reference inputs shared by the compact money dialogs. */
export function QuickMoneyFields({
  idPrefix,
  form,
  onChange,
  errors,
  typeLabel,
}: {
  idPrefix: string;
  form: QuickMoneyForm;
  onChange: (form: QuickMoneyForm) => void;
  errors: Record<string, string>;
  typeLabel?: string | undefined;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field
        label="Amount (INR)"
        htmlFor={`${idPrefix}-amount`}
        required
        error={errors["amount_inr"]}
      >
        <Input
          id={`${idPrefix}-amount`}
          inputMode="decimal"
          value={form.amount_inr}
          onChange={(event) => onChange({ ...form, amount_inr: event.target.value })}
        />
        {typeLabel ? (
          <p className="mt-1 text-xs text-muted-foreground">Recorded as: {typeLabel}</p>
        ) : null}
      </Field>
      <Field label="Date" htmlFor={`${idPrefix}-date`} error={errors["date"]}>
        <Input
          id={`${idPrefix}-date`}
          type="date"
          value={form.date}
          onChange={(event) => onChange({ ...form, date: event.target.value })}
        />
      </Field>
      <Field label="Method" htmlFor={`${idPrefix}-method`} required error={errors["method"]}>
        <Select
          value={form.method}
          onValueChange={(value) => onChange({ ...form, method: value as PaymentMethod })}
        >
          <SelectTrigger id={`${idPrefix}-method`}>
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
      <Field label="Reference" htmlFor={`${idPrefix}-reference`} error={errors["reference"]}>
        <Input
          id={`${idPrefix}-reference`}
          placeholder="UTR or cheque number"
          value={form.reference}
          onChange={(event) => onChange({ ...form, reference: event.target.value })}
        />
      </Field>
    </div>
  );
}

function ReadOnlyRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase text-muted-foreground">{label}</div>
      <div className="text-sm font-semibold tabular-nums">{value}</div>
    </div>
  );
}

async function invalidateMoney(queryClient: ReturnType<typeof useQueryClient>) {
  for (const key of ["vendor-payments", "purchases", "booking-variance", "receipts", "audit-log"]) {
    await queryClient.invalidateQueries({ queryKey: [key] });
  }
}

/** Compact "Pay this purchase": vendor, booking and purchase fixed; capped at outstanding. */
export function PayPurchaseDialog({
  purchase,
  onOpenChange,
  onOpenFullForm,
}: {
  purchase: PurchaseRow | null;
  onOpenChange: (open: boolean) => void;
  onOpenFullForm?: ((purchase: PurchaseRow) => void) | undefined;
}) {
  const queryClient = useQueryClient();
  const saveFn = useServerFn(saveVendorPayment);
  const [form, setForm] = useState<QuickMoneyForm>(emptyQuickMoney());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [lastId, setLastId] = useState<string | null>(null);
  const currentId = purchase?.id ?? null;
  if (currentId !== lastId) {
    setLastId(currentId);
    if (purchase) {
      setErrors({});
      setForm(emptyQuickMoney(purchase.outstanding));
    }
  }
  const outstanding = purchase ? toPaise(purchase.outstanding) : 0n;
  const amountPaise = isMoneyString(form.amount_inr) ? toPaise(form.amount_inr) : 0n;
  const type = vendorPaymentType(amountPaise, outstanding);

  const save = useMutation({
    mutationFn: () =>
      saveFn({
        data: {
          id: null,
          values: {
            vendor_id: purchase!.vendor_id,
            sale_id: purchase!.sale_id,
            payment_type: type,
            payment_date: form.date,
            amount_inr: form.amount_inr.trim(),
            method: form.method as PaymentMethod,
            reference: form.reference,
            notes: null,
          },
          allocations: [{ purchase_id: purchase!.id, amount_inr: form.amount_inr.trim() }],
        },
      }),
    onSuccess: async (result) => {
      await invalidateMoney(queryClient);
      toast.success(`Payment ${result.payment_number} recorded`);
      onOpenChange(false);
    },
    onError: (error: Error) => toast.error("Request rejected", { description: error.message }),
  });

  function submit() {
    const next = quickMoneyErrors(form, outstanding);
    setErrors(next);
    if (Object.keys(next).length === 0) save.mutate();
  }

  return (
    <Dialog open={purchase !== null} onOpenChange={onOpenChange}>
      <DialogContent className="quote-dialog max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Pay this purchase</DialogTitle>
          <DialogDescription>
            The payment is allocated to this purchase and can't exceed its outstanding amount.
          </DialogDescription>
        </DialogHeader>
        {purchase ? (
          <div className="grid gap-4">
            <div className="grid grid-cols-2 gap-3 rounded-md border border-border p-3 sm:grid-cols-4">
              <ReadOnlyRow label="Vendor" value={purchase.vendor?.name ?? "—"} />
              <ReadOnlyRow label="Booking" value={purchase.sale?.booking_number ?? "—"} />
              <ReadOnlyRow label="Purchase" value={purchase.purchase_number} />
              <ReadOnlyRow label="Outstanding" value={formatMoney(purchase.outstanding)} />
            </div>
            <QuickMoneyFields
              idPrefix="pay-purchase"
              form={form}
              onChange={setForm}
              errors={errors}
              typeLabel={MONEY_TYPE_LABELS[type]}
            />
            {onOpenFullForm ? (
              <Button
                variant="link"
                size="sm"
                className="h-auto justify-start p-0 text-xs"
                onClick={() => onOpenFullForm(purchase)}
              >
                Open full payment form
              </Button>
            ) : null}
          </div>
        ) : null}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={save.isPending}>
            {save.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
            Record payment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Compact customer receipt for one booking; type is set automatically. */
export function QuickReceiptDialog({
  saleId,
  open,
  onOpenChange,
  onOpenFullForm,
}: {
  saleId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenFullForm?: (() => void) | undefined;
}) {
  const queryClient = useQueryClient();
  const createFn = useServerFn(createReceipt);
  const summaryFn = useServerFn(getBookingReceivable);
  const listFn = useServerFn(listReceipts);
  const summary = useQuery({
    queryKey: ["receipts", "booking", saleId],
    enabled: open,
    queryFn: () => summaryFn({ data: { sale_id: saleId } }),
  });
  const receipts = useQuery({
    queryKey: ["receipts", "list", { sale_id: saleId }],
    enabled: open,
    queryFn: () => listFn({ data: { sale_id: saleId } }),
  });
  const [form, setForm] = useState<QuickMoneyForm>(emptyQuickMoney());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [filledFor, setFilledFor] = useState<string | null>(null);

  const s = summary.data;
  const fillKey = open && s ? `${saleId}:${s.outstanding}` : null;
  if (fillKey !== filledFor) {
    setFilledFor(fillKey);
    if (fillKey && s) {
      setErrors({});
      setForm(emptyQuickMoney(toPaise(s.outstanding) > 0n ? s.outstanding : ""));
    }
  }

  const outstanding = s ? toPaise(s.outstanding) : null;
  const isFirst = (receipts.data ?? []).every((row) => row.status !== "recorded");
  const amountPaise = isMoneyString(form.amount_inr) ? toPaise(form.amount_inr) : 0n;
  const type = receiptType(amountPaise, outstanding ?? 0n, isFirst);

  const save = useMutation({
    mutationFn: () =>
      createFn({
        data: {
          sale_id: saleId,
          values: {
            payment_type: type,
            receipt_date: form.date,
            amount_inr: form.amount_inr.trim(),
            method: form.method as PaymentMethod,
            reference: form.reference,
            notes: null,
          },
        },
      }),
    onSuccess: async (result) => {
      await invalidateMoney(queryClient);
      toast.success(
        `Receipt ${(result as { receipt_number?: string }).receipt_number ?? ""} recorded`,
      );
      onOpenChange(false);
    },
    onError: (error: Error) => toast.error("Request rejected", { description: error.message }),
  });

  function submit() {
    const next = quickMoneyErrors(form, outstanding);
    setErrors(next);
    if (Object.keys(next).length === 0) save.mutate();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="quote-dialog max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New receipt</DialogTitle>
          <DialogDescription>
            Money received from the client for this booking. It can't exceed the outstanding amount.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          {summary.isPending || receipts.isPending ? (
            <TableSkeleton rows={1} />
          ) : s ? (
            <div className="grid grid-cols-3 gap-3 rounded-md border border-border p-3">
              <ReadOnlyRow label="Customer payable" value={formatMoney(s.customer_payable)} />
              <ReadOnlyRow label="Received" value={formatMoney(s.received)} />
              <ReadOnlyRow label="Outstanding" value={formatMoney(s.outstanding)} />
            </div>
          ) : null}
          <QuickMoneyFields
            idPrefix="quick-receipt"
            form={form}
            onChange={setForm}
            errors={errors}
            typeLabel={MONEY_TYPE_LABELS[type]}
          />
          {onOpenFullForm ? (
            <Button
              variant="link"
              size="sm"
              className="h-auto justify-start p-0 text-xs"
              onClick={onOpenFullForm}
            >
              Open full receipt form
            </Button>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={save.isPending || summary.isPending}>
            {save.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
            Record receipt
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
