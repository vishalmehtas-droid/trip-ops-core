import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { DetailRow, Field, formatDate } from "@/components/app/master-data";
import { RecordCombobox, type RecordOption } from "@/components/app/sales-ui";
import { useQuickAdd } from "@/components/app/quick-add";
import { EmptyState, ErrorState, LoadingState } from "@/components/app/states";
import { SupplierQuoteComparison } from "@/components/app/supplier-quote-comparison";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import {
  SALE_ITEM_TYPES,
  SALE_ITEM_TYPE_LABELS,
  type SaleItemType,
} from "@/lib/sales-item-schemas";
import {
  isQuoteLocked,
  quoteHeaderSchema,
  quoteLineValuesSchema,
  SUPPLIER_QUOTE_STATUS_LABELS,
  SUPPLIER_QUOTE_TRANSITIONS,
  type SupplierQuoteStatus,
} from "@/lib/supplier-quote-schemas";
import {
  addSupplierQuoteLine,
  createSupplierQuote,
  createSupplierQuoteRevision,
  listSupplierQuotes,
  removeSupplierQuoteLine,
  updateSupplierQuote,
  updateSupplierQuoteLine,
} from "@/lib/supplier-quotes.functions";

type Quote = Awaited<ReturnType<typeof listSupplierQuotes>>[number];
type Line = Quote["lines"][number];

const inr = (value: number) =>
  value.toLocaleString("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 });

/** Sums database-calculated INR amounts in paise to avoid float drift. */
const quoteTotal = (quote: Quote) =>
  quote.lines.reduce((sum, line) => sum + Math.round(Number(line.amount_inr) * 100), 0) / 100;

function QuoteStatusBadge({
  status,
  superseded,
}: {
  status: SupplierQuoteStatus;
  superseded?: boolean;
}) {
  if (superseded) return <Badge variant="outline">Superseded</Badge>;
  const variant =
    status === "selected" ? "default" : status === "rejected" ? "destructive" : "secondary";
  return <Badge variant={variant}>{SUPPLIER_QUOTE_STATUS_LABELS[status]}</Badge>;
}

function issuesToErrors(issues: { path: PropertyKey[]; message: string }[]) {
  const next: Record<string, string> = {};
  for (const issue of issues) {
    const key = String(issue.path[0] ?? "form");
    if (!next[key]) next[key] = issue.message;
  }
  return next;
}

export function SupplierQuotes({
  leadId,
  requirementId,
  canManage,
  canCreate,
}: {
  leadId: string;
  requirementId: string;
  canManage: boolean;
  canCreate: boolean;
}) {
  const queryClient = useQueryClient();
  const listFn = useServerFn(listSupplierQuotes);
  const createFn = useServerFn(createSupplierQuote);
  const queryKey = ["supplier-quotes", requirementId];

  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ vendor_id: "", valid_until: "", notes: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [openId, setOpenId] = useState<string | null>(null);

  const quotesQuery = useQuery({
    queryKey,
    queryFn: () => listFn({ data: { requirement_id: requirementId } }),
  });

  const vendorsQuery = useQuery({
    queryKey: ["vendors", "active"],
    enabled: canManage,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vendors")
        .select("id, name, is_active")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });
  const vendorOptions: RecordOption[] = useMemo(
    () => (vendorsQuery.data ?? []).map((v) => ({ id: v.id, label: v.name })),
    [vendorsQuery.data],
  );
  const vendorQuickAdd = useQuickAdd("vendor", (id) => setForm((f) => ({ ...f, vendor_id: id })));

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey });
    await queryClient.invalidateQueries({ queryKey: ["audit-log"] });
  };

  const create = useMutation({
    mutationFn: (values: ReturnType<typeof quoteHeaderSchema.parse>) =>
      createFn({ data: { lead_id: leadId, requirement_id: requirementId, values } }),
    onSuccess: async () => {
      await invalidate();
      toast.success("Supplier quote created");
      setCreateOpen(false);
    },
    onError: (error: Error) => toast.error("Request rejected", { description: error.message }),
  });

  function submitCreate() {
    const parsed = quoteHeaderSchema.safeParse(form);
    if (!parsed.success) {
      setErrors(issuesToErrors(parsed.error.issues));
      return;
    }
    setErrors({});
    create.mutate(parsed.data);
  }

  const quotes = quotesQuery.data ?? [];
  const openQuote = quotes.find((q) => q.id === openId) ?? null;

  return (
    <div className="mt-3 rounded-md border border-border">
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Supplier quotes
        </h3>
        <div className="flex flex-wrap items-center gap-2">
          <SupplierQuoteComparison quotes={quotes} />
          {canManage && canCreate ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setForm({ vendor_id: "", valid_until: "", notes: "" });
                setErrors({});
                setCreateOpen(true);
              }}
            >
              <Plus className="size-4" />
              New Supplier Quote
            </Button>
          ) : null}
        </div>
      </div>

      {quotesQuery.isPending ? (
        <LoadingState label="Loading supplier quotes" />
      ) : quotesQuery.isError ? (
        <ErrorState
          description={quotesQuery.error.message}
          onRetry={() => void quotesQuery.refetch()}
        />
      ) : quotes.length === 0 ? (
        <EmptyState
          title="No supplier quotes yet"
          description="Request prices from vendors for this requirement."
        />
      ) : (
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">Number</th>
              <th className="px-3 py-2 font-medium">Vendor</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">Valid until</th>
              <th className="px-3 py-2 text-right font-medium">Total INR</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {quotes.map((quote) => (
              <tr
                key={quote.id}
                className="cursor-pointer hover:bg-muted/40"
                onClick={() => setOpenId(quote.id)}
              >
                <td className="px-3 py-2 font-mono text-xs font-semibold">
                  {quote.quote_number}
                  <span className="ml-1 font-sans font-normal text-muted-foreground">
                    Rev {quote.revision_number}
                  </span>
                </td>
                <td className="px-3 py-2">{quote.vendor?.name ?? "—"}</td>
                <td className="px-3 py-2">
                  <QuoteStatusBadge status={quote.status} superseded={quote.is_superseded} />
                </td>
                <td className="px-3 py-2">{formatDate(quote.valid_until)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{inr(quoteTotal(quote))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New Supplier Quote</DialogTitle>
            <DialogDescription>The quote number is assigned automatically.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <Field label="Vendor" htmlFor="sq-vendor" required error={errors["vendor_id"]}>
              <RecordCombobox
                id="sq-vendor"
                options={vendorOptions}
                value={form.vendor_id}
                onChange={(value) => setForm({ ...form, vendor_id: value })}
                placeholder="Select vendor"
                searchPlaceholder="Search vendors"
                emptyText="No active vendors found"
                onCreateNew={vendorQuickAdd.openQuickAdd}
                createLabel="Add new vendor"
              />
            </Field>
            <Field label="Valid until" htmlFor="sq-valid" error={errors["valid_until"]}>
              <Input
                id="sq-valid"
                type="date"
                value={form.valid_until}
                onChange={(e) => setForm({ ...form, valid_until: e.target.value })}
              />
            </Field>
            <Field label="Notes" htmlFor="sq-notes" error={errors["notes"]}>
              <Textarea
                id="sq-notes"
                rows={3}
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </Field>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setCreateOpen(false)}
              disabled={create.isPending}
            >
              Cancel
            </Button>
            <Button onClick={submitCreate} disabled={create.isPending}>
              {create.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
              Create quote
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Sheet open={openQuote !== null} onOpenChange={(open) => !open && setOpenId(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-3xl">
          {openQuote ? (
            <QuoteSheetBody quote={openQuote} canManage={canManage} onChanged={invalidate} />
          ) : null}
        </SheetContent>
      </Sheet>

      {vendorQuickAdd.quickAddDialog}
    </div>
  );
}

type LineForm = {
  is_package: boolean;
  purchase_type: SaleItemType;
  description: string;
  quantity: string;
  currency: string;
  unit_amount: string;
  exchange_rate: string;
};
const EMPTY_LINE: LineForm = {
  is_package: false,
  purchase_type: "hotel",
  description: "",
  quantity: "1",
  currency: "INR",
  unit_amount: "",
  exchange_rate: "1",
};

function QuoteSheetBody({
  quote,
  canManage,
  onChanged,
}: {
  quote: Quote;
  canManage: boolean;
  onChanged: () => Promise<void>;
}) {
  const updateFn = useServerFn(updateSupplierQuote);
  const addLineFn = useServerFn(addSupplierQuoteLine);
  const updateLineFn = useServerFn(updateSupplierQuoteLine);
  const removeLineFn = useServerFn(removeSupplierQuoteLine);

  const reviseFn = useServerFn(createSupplierQuoteRevision);
  const locked = isQuoteLocked(quote.status) || quote.is_superseded;
  const editable = canManage && !locked;
  const transitions = quote.is_superseded ? [] : SUPPLIER_QUOTE_TRANSITIONS[quote.status];
  const [headerOpen, setHeaderOpen] = useState(false);
  const [header, setHeader] = useState({ valid_until: "", notes: "" });
  const [confirmRevise, setConfirmRevise] = useState(false);

  const [pendingStatus, setPendingStatus] = useState<SupplierQuoteStatus | null>(null);
  const [editingLineId, setEditingLineId] = useState<string | "new" | null>(null);
  const [lineForm, setLineForm] = useState<LineForm>(EMPTY_LINE);
  const [lineErrors, setLineErrors] = useState<Record<string, string>>({});
  const [removeLine, setRemoveLine] = useState<Line | null>(null);

  const onError = (error: Error) => toast.error("Request rejected", { description: error.message });

  const statusMutation = useMutation({
    mutationFn: (status: SupplierQuoteStatus) => updateFn({ data: { id: quote.id, status } }),
    onSuccess: async (_d, status) => {
      await onChanged();
      toast.success(`Quote marked ${SUPPLIER_QUOTE_STATUS_LABELS[status]}`);
      setPendingStatus(null);
    },
    onError: (e: Error) => {
      onError(e);
      setPendingStatus(null);
    },
  });

  const saveHeader = useMutation({
    mutationFn: () =>
      updateFn({
        data: { id: quote.id, values: { valid_until: header.valid_until, notes: header.notes } },
      }),
    onSuccess: async () => {
      await onChanged();
      toast.success("Quote updated");
      setHeaderOpen(false);
    },
    onError,
  });

  const revise = useMutation({
    mutationFn: () => reviseFn({ data: { id: quote.id } }),
    onSuccess: async () => {
      await onChanged();
      toast.success("Revision created");
      setConfirmRevise(false);
    },
    onError: (e: Error) => {
      onError(e);
      setConfirmRevise(false);
    },
  });

  const saveLine = useMutation({
    mutationFn: (values: ReturnType<typeof quoteLineValuesSchema.parse>) =>
      editingLineId === "new"
        ? addLineFn({ data: { supplier_quote_id: quote.id, values } })
        : updateLineFn({ data: { id: editingLineId!, values } }),
    onSuccess: async () => {
      await onChanged();
      toast.success("Line saved");
      setEditingLineId(null);
    },
    onError,
  });

  const deleteLine = useMutation({
    mutationFn: (id: string) => removeLineFn({ data: { id } }),
    onSuccess: async () => {
      await onChanged();
      toast.success("Line removed");
      setRemoveLine(null);
    },
    onError: (e: Error) => {
      onError(e);
      setRemoveLine(null);
    },
  });

  function startEdit(line: Line | null) {
    setLineErrors({});
    if (!line) {
      setLineForm(EMPTY_LINE);
      setEditingLineId("new");
      return;
    }
    setLineForm({
      is_package: line.is_package,
      purchase_type: line.purchase_type,
      description: line.description,
      quantity: String(line.quantity),
      currency: line.currency,
      unit_amount: line.unit_amount,
      exchange_rate: line.exchange_rate,
    });
    setEditingLineId(line.id);
  }

  function submitLine() {
    const parsed = quoteLineValuesSchema.safeParse(lineForm);
    if (!parsed.success) {
      setLineErrors(issuesToErrors(parsed.error.issues));
      return;
    }
    setLineErrors({});
    saveLine.mutate(parsed.data);
  }

  const isInr = lineForm.currency.trim().toUpperCase() === "INR";

  return (
    <>
      <SheetHeader>
        <SheetTitle className="flex items-center gap-2">
          <span className="font-mono">{quote.quote_number}</span>
          <span className="text-sm font-normal text-muted-foreground">
            Rev {quote.revision_number}
          </span>
          <QuoteStatusBadge status={quote.status} superseded={quote.is_superseded} />
        </SheetTitle>
        <SheetDescription>
          {quote.is_superseded
            ? "A newer revision replaces this quote. It is read-only."
            : locked
              ? "This quote is final. Lines can no longer be changed."
              : "Lines are converted to INR by the database."}
        </SheetDescription>
      </SheetHeader>

      <div className="mt-4 grid gap-1 px-4">
        <DetailRow label="Vendor" value={quote.vendor?.name ?? "—"} />
        <DetailRow label="Valid until" value={formatDate(quote.valid_until)} />
        <DetailRow label="Notes" value={quote.notes ?? "—"} />
        {quote.previous ? (
          <DetailRow
            label="Revises"
            value={`${quote.previous.quote_number} · Rev ${quote.previous.revision_number}`}
          />
        ) : null}
        {editable ? (
          <div className="flex gap-2 pt-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setHeader({ valid_until: quote.valid_until ?? "", notes: quote.notes ?? "" });
                setHeaderOpen(true);
              }}
            >
              <Pencil className="size-3.5" />
              Edit details
            </Button>
            {quote.status === "received" ? (
              <Button size="sm" variant="outline" onClick={() => setConfirmRevise(true)}>
                Create revision
              </Button>
            ) : null}
          </div>
        ) : null}
        <DetailRow
          label="Status"
          value={
            canManage && transitions.length > 0 ? (
              <Select
                value={quote.status}
                onValueChange={(v) =>
                  v !== quote.status && setPendingStatus(v as SupplierQuoteStatus)
                }
              >
                <SelectTrigger className="h-8 w-44" aria-label="Quote status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={quote.status}>
                    {SUPPLIER_QUOTE_STATUS_LABELS[quote.status]}
                  </SelectItem>
                  {transitions.map((s) => (
                    <SelectItem key={s} value={s}>
                      {SUPPLIER_QUOTE_STATUS_LABELS[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              SUPPLIER_QUOTE_STATUS_LABELS[quote.status]
            )
          }
        />
      </div>

      <div className="mt-6 px-4 pb-6">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Lines
          </h3>
          {editable ? (
            <Button size="sm" variant="outline" onClick={() => startEdit(null)}>
              <Plus className="size-4" />
              Add line
            </Button>
          ) : null}
        </div>
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-2 py-2 font-medium">Type</th>
                <th className="px-2 py-2 font-medium">Description</th>
                <th className="px-2 py-2 text-right font-medium">Qty</th>
                <th className="px-2 py-2 text-right font-medium">Unit</th>
                <th className="px-2 py-2 text-right font-medium">Rate</th>
                <th className="px-2 py-2 text-right font-medium">INR</th>
                {editable ? <th className="w-20" /> : null}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {quote.lines.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-2 py-6 text-center text-muted-foreground">
                    No lines yet.
                  </td>
                </tr>
              ) : (
                quote.lines.map((line) => (
                  <tr key={line.id}>
                    <td className="px-2 py-2">
                      {SALE_ITEM_TYPE_LABELS[line.purchase_type]}
                      {line.is_package ? (
                        <Badge variant="outline" className="ml-1">
                          Package
                        </Badge>
                      ) : null}
                    </td>
                    <td className="px-2 py-2">{line.description}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{line.quantity}</td>
                    <td className="px-2 py-2 text-right tabular-nums">
                      {line.currency} {Number(line.unit_amount).toLocaleString("en-IN")}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums">{line.exchange_rate}</td>
                    <td className="px-2 py-2 text-right tabular-nums">
                      {inr(Number(line.amount_inr))}
                    </td>
                    {editable ? (
                      <td className="px-2 py-2 text-right">
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label="Edit line"
                          onClick={() => startEdit(line)}
                        >
                          <Pencil className="size-3.5" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label="Remove line"
                          onClick={() => setRemoveLine(line)}
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </td>
                    ) : null}
                  </tr>
                ))
              )}
            </tbody>
            <tfoot>
              <tr className="border-t border-border font-semibold">
                <td colSpan={5} className="px-2 py-2 text-right">
                  Total INR
                </td>
                <td className="px-2 py-2 text-right tabular-nums">{inr(quoteTotal(quote))}</td>
                {editable ? <td /> : null}
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      <Dialog open={editingLineId !== null} onOpenChange={(o) => !o && setEditingLineId(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingLineId === "new" ? "Add line" : "Edit line"}</DialogTitle>
            <DialogDescription>The INR amount is calculated by the database.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Purchase type"
                htmlFor="sql-type"
                required
                error={lineErrors["purchase_type"]}
              >
                <Select
                  value={lineForm.purchase_type}
                  onValueChange={(v) =>
                    setLineForm({ ...lineForm, purchase_type: v as SaleItemType })
                  }
                >
                  <SelectTrigger id="sql-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SALE_ITEM_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>
                        {SALE_ITEM_TYPE_LABELS[t]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <label className="flex items-center gap-2 pt-6 text-sm">
                <Checkbox
                  checked={lineForm.is_package}
                  onCheckedChange={(c) => setLineForm({ ...lineForm, is_package: c === true })}
                />
                Part of a package
              </label>
            </div>
            <Field
              label="Description"
              htmlFor="sql-desc"
              required
              error={lineErrors["description"]}
            >
              <Input
                id="sql-desc"
                value={lineForm.description}
                onChange={(e) => setLineForm({ ...lineForm, description: e.target.value })}
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Quantity" htmlFor="sql-qty" required error={lineErrors["quantity"]}>
                <Input
                  id="sql-qty"
                  type="number"
                  min={1}
                  value={lineForm.quantity}
                  onChange={(e) => setLineForm({ ...lineForm, quantity: e.target.value })}
                />
              </Field>
              <Field label="Currency" htmlFor="sql-cur" required error={lineErrors["currency"]}>
                <Input
                  id="sql-cur"
                  maxLength={3}
                  value={lineForm.currency}
                  onChange={(e) => {
                    const currency = e.target.value.toUpperCase();
                    setLineForm({
                      ...lineForm,
                      currency,
                      exchange_rate: currency === "INR" ? "1" : lineForm.exchange_rate,
                    });
                  }}
                />
              </Field>
              <Field
                label="Unit amount"
                htmlFor="sql-unit"
                required
                error={lineErrors["unit_amount"]}
              >
                <Input
                  id="sql-unit"
                  type="number"
                  min={0}
                  step="0.01"
                  value={lineForm.unit_amount}
                  onChange={(e) => setLineForm({ ...lineForm, unit_amount: e.target.value })}
                />
              </Field>
              <Field
                label="Exchange rate"
                htmlFor="sql-rate"
                required
                error={lineErrors["exchange_rate"]}
              >
                <Input
                  id="sql-rate"
                  type="number"
                  min={0}
                  step="0.0001"
                  disabled={isInr}
                  value={isInr ? "1" : lineForm.exchange_rate}
                  onChange={(e) => setLineForm({ ...lineForm, exchange_rate: e.target.value })}
                />
              </Field>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setEditingLineId(null)}
              disabled={saveLine.isPending}
            >
              Cancel
            </Button>
            <Button onClick={submitLine} disabled={saveLine.isPending}>
              {saveLine.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
              Save line
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={pendingStatus !== null} onOpenChange={(o) => !o && setPendingStatus(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pendingStatus ? `Mark quote ${SUPPLIER_QUOTE_STATUS_LABELS[pendingStatus]}?` : ""}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingStatus && isQuoteLocked(pendingStatus)
                ? "This is final: the quote and its lines can no longer be edited."
                : "The change is recorded in the activity log."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => pendingStatus && statusMutation.mutate(pendingStatus)}
              disabled={statusMutation.isPending}
            >
              Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={headerOpen} onOpenChange={setHeaderOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit quote details</DialogTitle>
            <DialogDescription>The vendor cannot be changed.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <Field label="Valid until" htmlFor="sq-edit-valid">
              <Input
                id="sq-edit-valid"
                type="date"
                value={header.valid_until}
                onChange={(e) => setHeader({ ...header, valid_until: e.target.value })}
              />
            </Field>
            <Field label="Notes" htmlFor="sq-edit-notes">
              <Textarea
                id="sq-edit-notes"
                rows={3}
                value={header.notes}
                onChange={(e) => setHeader({ ...header, notes: e.target.value })}
              />
            </Field>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setHeaderOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => saveHeader.mutate()} disabled={saveHeader.isPending}>
              {saveHeader.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmRevise} onOpenChange={setConfirmRevise}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Create revision?</AlertDialogTitle>
            <AlertDialogDescription>
              A new Requested quote (Rev {quote.revision_number + 1}) is created with the same
              lines. This quote becomes read-only and is marked Superseded.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => revise.mutate()} disabled={revise.isPending}>
              Create revision
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={removeLine !== null} onOpenChange={(o) => !o && setRemoveLine(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this line?</AlertDialogTitle>
            <AlertDialogDescription>
              {removeLine?.description} — the removal is recorded in the activity log.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => removeLine && deleteLine.mutate(removeLine.id)}
              disabled={deleteLine.isPending}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
