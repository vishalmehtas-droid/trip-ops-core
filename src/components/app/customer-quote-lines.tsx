import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { QuoteCurrencyField, QuoteLinePreview } from "./quote-entry-fields";
import { lineEntryTotal } from "@/lib/quote-entry-preview";
import { PRICE_BASES, PRICE_BASIS_LABELS, type PriceBasis } from "@/lib/supplier-quote-schemas";
import { Field } from "./master-data";
import { EmptyState, ErrorState, LoadingState } from "./states";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  addCustomerQuoteLine,
  updateCustomerQuoteLine,
  removeCustomerQuoteLine,
  getCustomerQuote,
} from "@/lib/customer-quotes.functions";
import { manualLineValuesSchema } from "@/lib/customer-quote-schemas";
import { listSupplierQuotes } from "@/lib/supplier-quotes.functions";
import { SUPPLIER_QUOTE_STATUS_LABELS } from "@/lib/supplier-quote-schemas";
import { latestSupplierQuotes, quoteFieldErrors } from "@/lib/quotation-display";
import { formatMoney } from "@/lib/sale-costing-schemas";
import {
  PURCHASE_TYPE_HINTS,
  QUOTE_LINE_TYPES,
  SALE_ITEM_TYPES,
  SALE_ITEM_TYPE_LABELS,
  type SaleItemType,
} from "@/lib/sales-item-schemas";

type Line = Awaited<ReturnType<typeof getCustomerQuote>>["lines"][number];
const emptyForm = {
  purchase_type: "hotel" as SaleItemType,
  description: "",
  quantity: "1",
  currency: "INR",
  expected_cost_inr: "0",
};

export function CustomerQuoteLines({
  defaultPersons,
  quoteId,
  requirementId,
  lines,
  editable,
  onChanged,
  onViewSupplierQuotes,
}: {
  defaultPersons: number;
  quoteId: string;
  requirementId: string;
  lines: Line[];
  editable: boolean;
  onChanged: () => Promise<void>;
  onViewSupplierQuotes: () => void;
}) {
  const addFn = useServerFn(addCustomerQuoteLine);
  const updateFn = useServerFn(updateCustomerQuoteLine);
  const removeFn = useServerFn(removeCustomerQuoteLine);
  const supplierFn = useServerFn(listSupplierQuotes);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [editing, setEditing] = useState<Line | "new" | null>(null);
  const [remove, setRemove] = useState<Line | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [entry, setEntry] = useState({ basis: "per_person" as PriceBasis, amount: "", rate: "1" });
  const [entryDirty, setEntryDirty] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const suppliers = useQuery({
    queryKey: ["supplier-quotes", requirementId],
    queryFn: () => supplierFn({ data: { requirement_id: requirementId } }),
    enabled: pickerOpen,
  });
  const onError = (error: Error) => toast.error("Request rejected", { description: error.message });
  const save = useMutation({
    mutationFn: async () => {
      const values = manualLineValuesSchema.parse(submissionForm());
      if (editing === "new")
        return addFn({ data: { source: "manual", customer_quote_id: quoteId, values } });
      if (!editing) throw new Error("Select a line");
      return updateFn({ data: { id: editing.id, values } });
    },
    onSuccess: async () => {
      await onChanged();
      setEditing(null);
      toast.success("Line saved");
    },
    onError,
  });
  const addSupplier = useMutation({
    mutationFn: (id: string) =>
      addFn({
        data: { source: "supplier", customer_quote_id: quoteId, supplier_quote_line_id: id },
      }),
    onSuccess: async () => {
      await onChanged();
      toast.success("Supplier line added");
    },
    onError,
  });
  const deleteLine = useMutation({
    mutationFn: (id: string) => removeFn({ data: { id } }),
    onSuccess: async () => {
      await onChanged();
      setRemove(null);
      toast.success("Line removed");
    },
    onError,
  });
  function edit(line: Line | "new") {
    setErrors({});
    setEditing(line);
    setEntry({
      basis: line === "new" ? "per_person" : "total",
      amount: line === "new" ? "" : line.currency === "INR" ? line.expected_cost_inr : "",
      rate: line === "new" || line.currency === "INR" ? "1" : "",
    });
    setEntryDirty(line === "new");
    setForm(
      line === "new"
        ? { ...emptyForm, quantity: String(Math.max(defaultPersons, 1)) }
        : {
            purchase_type: line.purchase_type,
            description: line.description,
            quantity: String(line.quantity),
            currency: line.currency,
            expected_cost_inr: line.expected_cost_inr,
          },
    );
  }
  function submissionForm() {
    if (!entryDirty) return form;
    const total = lineEntryTotal(
      entry.basis === "total" ? "1" : form.quantity,
      entry.amount,
      form.currency === "INR" ? "1" : entry.rate,
    );
    return { ...form, expected_cost_inr: total ?? "invalid" };
  }
  function submit() {
    if (
      entryDirty &&
      form.currency !== "INR" &&
      (!/^\d+(\.\d+)?$/.test(entry.rate) || Number(entry.rate) <= 0)
    ) {
      setErrors({ exchange_rate: "Enter a rate greater than zero" });
      return;
    }
    const parsed = manualLineValuesSchema.safeParse(submissionForm());
    if (!parsed.success) {
      setErrors(quoteFieldErrors(parsed.error.issues));
      return;
    }
    setErrors({});
    save.mutate();
  }
  const sourced =
    editing !== null && editing !== "new" && Boolean(editing.source_supplier_quote_line_id);
  return (
    <section className="space-y-3 border-t border-border pt-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">Quote lines</h3>
        {editable ? (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => setPickerOpen(true)}>
              <Plus className="size-4" />
              Add from supplier quotes
            </Button>
            <Button size="sm" variant="outline" onClick={() => edit("new")}>
              <Plus className="size-4" />
              Manual line
            </Button>
          </div>
        ) : null}
      </div>
      {lines.length === 0 ? (
        <EmptyState title="No quote lines" />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted/40 text-xs text-muted-foreground">
              <tr>
                <th className="p-2">Purchase type / description</th>
                <th className="p-2">Qty</th>
                <th className="p-2">Currency</th>
                <th className="p-2 text-right">INR cost</th>
                {editable ? (
                  <th className="p-2">
                    <span className="sr-only">Actions</span>
                  </th>
                ) : null}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {lines.map((line) => (
                <tr key={line.id}>
                  <td className="p-2">
                    <div className="text-xs text-muted-foreground">
                      {SALE_ITEM_TYPE_LABELS[line.purchase_type]} ·{" "}
                      {line.source_supplier_quote_line_id ? "Supplier snapshot" : "Manual"}
                    </div>
                    <div className="min-w-40 break-words">{line.description}</div>
                  </td>
                  <td className="p-2 tabular-nums">{line.quantity}</td>
                  <td className="p-2">{line.currency}</td>
                  <td className="whitespace-nowrap p-2 text-right tabular-nums">
                    {formatMoney(line.expected_cost_inr)}
                  </td>
                  {editable ? (
                    <td className="p-2">
                      <div className="flex">
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Edit line"
                          aria-label={`Edit ${line.description}`}
                          onClick={() => edit(line)}
                        >
                          <Pencil className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Remove line"
                          aria-label={`Remove ${line.description}`}
                          onClick={() => setRemove(line)}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Dialog open={pickerOpen && editable} onOpenChange={setPickerOpen}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] w-[calc(100%-1rem)] overflow-y-auto overscroll-contain sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Add from supplier quotes</DialogTitle>
            <DialogDescription>
              Latest eligible quotes for this travel requirement.
            </DialogDescription>
          </DialogHeader>
          {suppliers.isPending ? (
            <LoadingState label="Loading supplier lines" />
          ) : suppliers.isError ? (
            <ErrorState
              description={suppliers.error.message}
              onRetry={() => void suppliers.refetch()}
            />
          ) : latestSupplierQuotes(suppliers.data ?? []).every(
              (quote) => quote.lines.length === 0,
            ) ? (
            <div className="space-y-2 py-4">
              <p className="text-sm text-muted-foreground">
                {latestSupplierQuotes(suppliers.data ?? []).length === 0
                  ? "Supplier lines must belong to a Requested, Received or Selected quote that is not superseded. No such quote is available for this requirement."
                  : "The latest Requested, Received or Selected supplier quotes have no lines. Add a line to a Requested or Received quote first."}
              </p>
              <Button asChild variant="link" className="h-auto p-0">
                <a
                  href={`#supplier-quotes-${requirementId}`}
                  onClick={() => {
                    setPickerOpen(false);
                    onViewSupplierQuotes();
                  }}
                >
                  View supplier quotes for this requirement
                </a>
              </Button>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {latestSupplierQuotes(suppliers.data ?? []).flatMap((quote) =>
                quote.lines.map((line) => {
                  const added = lines.some(
                    (item) => item.source_supplier_quote_line_id === line.id,
                  );
                  return (
                    <div
                      key={line.id}
                      className="flex flex-wrap items-center justify-between gap-3 py-3"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                          <span>
                            {quote.vendor?.name ?? "—"} · {quote.quote_number} · Rev{" "}
                            {quote.revision_number}
                          </span>
                          <Badge variant="secondary">
                            {SUPPLIER_QUOTE_STATUS_LABELS[quote.status]}
                          </Badge>
                        </div>
                        <div className="mt-1 break-words text-sm">
                          {line.description}
                          {line.option_label ? (
                            <span className="text-muted-foreground"> · {line.option_label}</span>
                          ) : null}
                          {line.not_in_total ? (
                            <Badge variant="outline" className="ml-2">
                              Not in quote total
                            </Badge>
                          ) : null}
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          {SALE_ITEM_TYPE_LABELS[line.purchase_type]} · Qty {line.quantity} ·{" "}
                          {formatMoney(line.amount_inr)}
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={addSupplier.isPending || added}
                        onClick={() => addSupplier.mutate(line.id)}
                      >
                        {added ? "Added" : "Add line"}
                      </Button>
                    </div>
                  );
                }),
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
      <Dialog
        open={editing !== null && editable}
        onOpenChange={(open) => !open && setEditing(null)}
      >
        <DialogContent className="quote-dialog sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing === "new" ? "Manual quote line" : "Edit quote line"}</DialogTitle>
            <DialogDescription>
              {sourced
                ? "Supplier source and INR cost remain fixed."
                : "Only the total INR cost is saved; price basis, unit amount and rate are entry aids."}
            </DialogDescription>
          </DialogHeader>
          <fieldset
            disabled={save.isPending}
            className="quote-dialog-body grid gap-4 sm:grid-cols-2"
          >
            <Field label="Purchase type" htmlFor="cq-line-type" error={errors["purchase_type"]}>
              <Select
                value={form.purchase_type}
                onValueChange={(value) =>
                  setForm({ ...form, purchase_type: value as SaleItemType })
                }
              >
                <SelectTrigger id="cq-line-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SALE_ITEM_TYPES.filter(
                    (type) =>
                      (QUOTE_LINE_TYPES as readonly string[]).includes(type) ||
                      type === form.purchase_type,
                  ).map((type) => (
                    <SelectItem key={type} value={type}>
                      {SALE_ITEM_TYPE_LABELS[type]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {PURCHASE_TYPE_HINTS[form.purchase_type] ? (
                <p className="text-xs text-muted-foreground">
                  {PURCHASE_TYPE_HINTS[form.purchase_type]}
                </p>
              ) : null}
            </Field>
            {!sourced ? (
              <Field label="Price basis" htmlFor="cq-line-basis">
                <Select
                  value={entry.basis}
                  onValueChange={(value) => {
                    const basis = value as PriceBasis;
                    setEntry({ ...entry, basis });
                    setEntryDirty(true);
                    if (basis === "per_person")
                      setForm({ ...form, quantity: String(Math.max(defaultPersons, 1)) });
                  }}
                >
                  <SelectTrigger id="cq-line-basis">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PRICE_BASES.map((basis) => (
                      <SelectItem key={basis} value={basis}>
                        {PRICE_BASIS_LABELS[basis]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            ) : null}
            <Field
              label={!sourced && entry.basis === "per_person" ? "No. of persons" : "Quantity"}
              htmlFor="cq-line-qty"
              error={errors["quantity"]}
            >
              <Input
                id="cq-line-qty"
                type="number"
                min="1"
                step="1"
                value={form.quantity}
                onChange={(event) => {
                  setForm({ ...form, quantity: event.target.value });
                  if (!sourced) setEntryDirty(true);
                }}
              />
            </Field>
            <div className="sm:col-span-2">
              <Field
                label="Description"
                htmlFor="cq-line-description"
                error={errors["description"]}
              >
                <Input
                  id="cq-line-description"
                  value={form.description}
                  onChange={(event) => setForm({ ...form, description: event.target.value })}
                />
              </Field>
            </div>
            <QuoteCurrencyField
              key={editing === "new" ? "new" : editing?.id}
              id="cq-line-currency"
              value={form.currency}
              disabled={sourced}
              error={errors["currency"]}
              onChange={(currency) => {
                setForm({ ...form, currency });
                setEntry({ ...entry, rate: currency === "INR" ? "1" : entry.rate });
                setEntryDirty(true);
              }}
            />
            {!sourced ? (
              <>
                <Field
                  label={entry.basis === "total" ? "Amount in currency" : "Unit amount"}
                  htmlFor="cq-line-unit"
                >
                  <Input
                    id="cq-line-unit"
                    type="number"
                    min="0"
                    step="0.01"
                    value={entry.amount}
                    onChange={(event) => {
                      setEntry({ ...entry, amount: event.target.value });
                      setEntryDirty(true);
                    }}
                  />
                </Field>
                <Field
                  label={`Rate to INR (₹ per 1 ${form.currency || "currency"})`}
                  htmlFor="cq-line-rate"
                  error={errors["exchange_rate"]}
                >
                  <Input
                    id="cq-line-rate"
                    type="number"
                    min="0"
                    step="0.0001"
                    readOnly={form.currency === "INR"}
                    value={form.currency === "INR" ? "1" : entry.rate}
                    onChange={(event) => {
                      setEntry({ ...entry, rate: event.target.value });
                      setEntryDirty(true);
                    }}
                  />
                </Field>
                <div className="sm:col-span-2">
                  <QuoteLinePreview
                    quantity={entry.basis === "total" ? "1" : form.quantity}
                    currency={form.currency}
                    amount={entry.amount}
                    rate={form.currency === "INR" ? "1" : entry.rate}
                  />
                </div>
              </>
            ) : null}
            <Field
              label="Expected cost INR"
              htmlFor="cq-line-cost"
              error={errors["expected_cost_inr"]}
            >
              <Input
                id="cq-line-cost"
                type="number"
                min="0"
                step="0.01"
                readOnly
                value={
                  entryDirty && !sourced
                    ? (lineEntryTotal(
                        entry.basis === "total" ? "1" : form.quantity,
                        entry.amount,
                        form.currency === "INR" ? "1" : entry.rate,
                      ) ?? "")
                    : form.expected_cost_inr
                }
                onChange={(event) => setForm({ ...form, expected_cost_inr: event.target.value })}
              />
            </Field>
          </fieldset>
          <DialogFooter>
            <Button variant="outline" disabled={save.isPending} onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button disabled={save.isPending} onClick={submit}>
              {save.isPending ? <Loader2 className="size-4 animate-spin" /> : null}Save line
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <AlertDialog
        open={remove !== null && editable}
        onOpenChange={(open) => !open && setRemove(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove quote line?</AlertDialogTitle>
            <AlertDialogDescription>{remove?.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteLine.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleteLine.isPending}
              onClick={(event) => {
                event.preventDefault();
                if (remove) deleteLine.mutate(remove.id);
              }}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
