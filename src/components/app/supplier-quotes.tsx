import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate } from "@tanstack/react-router";
import { ExternalLink, Loader2, Paperclip, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { DetailRow, Field, formatDate } from "@/components/app/master-data";
import { RecordCombobox, type RecordOption } from "@/components/app/sales-ui";
import { useQuickAdd } from "@/components/app/quick-add";
import { EmptyState, ErrorState, LoadingState } from "@/components/app/states";
import { QuoteCurrencyField, QuoteLinePreview } from "./quote-entry-fields";
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
import { decimalString, supplierExtrasTotal, supplierTotal } from "@/lib/quotation-display";
import {
  isPackageType,
  PURCHASE_TYPE_HINTS,
  QUOTE_LINE_TYPES,
  SALE_ITEM_TYPES,
  SALE_ITEM_TYPE_LABELS,
  type SaleItemType,
} from "@/lib/sales-item-schemas";
import {
  isQuoteLocked,
  PRICE_BASES,
  PRICE_BASIS_LABELS,
  QUOTE_FILE_MAX_BYTES,
  QUOTE_FILE_TYPES,
  quoteDetailsSchema,
  quoteHeaderSchema,
  type PriceBasis,
  quoteLineValuesSchema,
  SUPPLIER_QUOTE_STATUS_LABELS,
  SUPPLIER_QUOTE_TRANSITIONS,
  type SupplierQuoteStatus,
} from "@/lib/supplier-quote-schemas";
import { createCustomerQuoteFromSupplierQuote } from "@/lib/customer-quotes.functions";
import {
  addSupplierQuoteLine,
  createSupplierQuote,
  createSupplierQuoteRevision,
  getSupplierQuoteFileUrl,
  listSupplierQuoteFiles,
  listSupplierQuotes,
  registerSupplierQuoteFile,
  removeSupplierQuoteLine,
  updateSupplierQuote,
  updateSupplierQuoteLine,
} from "@/lib/supplier-quotes.functions";

type Quote = Awaited<ReturnType<typeof listSupplierQuotes>>[number];
type Line = Quote["lines"][number];

const inr = (value: number) =>
  value.toLocaleString("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 });

/** Quote total excludes lines marked not in total; summed exactly in paise. */
const quoteTotal = (quote: Quote) => Number(decimalString(supplierTotal(quote)));
const extrasTotal = (quote: Quote) => Number(decimalString(supplierExtrasTotal(quote)));

type DetailsForm = {
  valid_until: string;
  notes: string;
  adults: string;
  children: string;
  child_ages: string;
  inclusions: string;
  exclusions: string;
  itinerary_notes: string;
};
const detailsFrom = (q: Partial<Record<keyof DetailsForm, string | number | null>>) =>
  Object.fromEntries(
    (
      [
        "valid_until",
        "notes",
        "adults",
        "children",
        "child_ages",
        "inclusions",
        "exclusions",
        "itinerary_notes",
      ] as const
    ).map((k) => [k, q[k] === null || q[k] === undefined ? "" : String(q[k])]),
  ) as DetailsForm;

function CollapsibleText({ text }: { text: string | null }) {
  const [open, setOpen] = useState(false);
  if (!text) return <span>—</span>;
  const long = text.length > 240 || text.split("\n").length > 4;
  return (
    <div>
      <p className={`whitespace-pre-wrap break-words ${!open && long ? "line-clamp-4" : ""}`}>
        {text}
      </p>
      {long ? (
        <button
          type="button"
          className="mt-1 text-xs font-medium text-primary hover:underline"
          onClick={() => setOpen(!open)}
        >
          {open ? "Show less" : "Show more"}
        </button>
      ) : null}
    </div>
  );
}

function DetailsFields({
  value,
  onChange,
  errors,
  idPrefix,
}: {
  value: DetailsForm;
  onChange: (v: DetailsForm) => void;
  errors: Record<string, string>;
  idPrefix: string;
}) {
  const text = (key: "inclusions" | "exclusions" | "itinerary_notes", label: string) => (
    <Field label={label} htmlFor={`${idPrefix}-${key}`} error={errors[key]}>
      <Textarea
        id={`${idPrefix}-${key}`}
        rows={3}
        maxLength={8000}
        value={value[key]}
        onChange={(e) => onChange({ ...value, [key]: e.target.value })}
      />
    </Field>
  );
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Adults" htmlFor={`${idPrefix}-adults`} error={errors["adults"]}>
          <Input
            id={`${idPrefix}-adults`}
            type="number"
            min={0}
            value={value.adults}
            onChange={(e) => onChange({ ...value, adults: e.target.value })}
          />
        </Field>
        <Field label="Children" htmlFor={`${idPrefix}-children`} error={errors["children"]}>
          <Input
            id={`${idPrefix}-children`}
            type="number"
            min={0}
            value={value.children}
            onChange={(e) => onChange({ ...value, children: e.target.value })}
          />
        </Field>
        <Field label="Child ages" htmlFor={`${idPrefix}-ages`} error={errors["child_ages"]}>
          <Input
            id={`${idPrefix}-ages`}
            placeholder="11, 6, 2"
            value={value.child_ages}
            onChange={(e) => onChange({ ...value, child_ages: e.target.value })}
          />
        </Field>
      </div>
      {text("inclusions", "Inclusions")}
      {text("exclusions", "Exclusions")}
      {text("itinerary_notes", "Itinerary / notes")}
    </>
  );
}

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
  defaultAdults,
  defaultChildren,
  canManage,
  canCreate,
  quoteToOpen,
}: {
  leadId: string;
  requirementId: string;
  defaultAdults: number;
  defaultChildren: number;
  canManage: boolean;
  canCreate: boolean;
  quoteToOpen?: string | undefined;
}) {
  const queryClient = useQueryClient();
  const listFn = useServerFn(listSupplierQuotes);
  const createFn = useServerFn(createSupplierQuote);
  const queryKey = ["supplier-quotes", requirementId];

  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ vendor_id: "", ...detailsFrom({}) });
  const [markReceived, setMarkReceived] = useState(true);
  const [confirmFromSupplier, setConfirmFromSupplier] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [openId, setOpenId] = useState<string | null>(null);
  useEffect(() => {
    if (quoteToOpen) setOpenId(quoteToOpen);
  }, [quoteToOpen]);

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
      createFn({
        data: { lead_id: leadId, requirement_id: requirementId, values, mark_received: markReceived },
      }),
    onSuccess: async () => {
      await invalidate();
      toast.success("Supplier quote created");
      setCreateOpen(false);
    },
    onError: (error: Error) => toast.error("Request rejected", { description: error.message }),
  });

  const updateFn = useServerFn(updateSupplierQuote);
  const fromSupplierFn = useServerFn(createCustomerQuoteFromSupplierQuote);
  const navigate = useNavigate();
  const markReceivedRow = useMutation({
    mutationFn: (id: string) => updateFn({ data: { id, status: "received" } }),
    onSuccess: async () => {
      await invalidate();
      toast.success("Quote marked Received");
    },
    onError: (error: Error) => toast.error("Request rejected", { description: error.message }),
  });
  const createCustomerQuote = useMutation({
    mutationFn: (supplierQuoteId: string) => fromSupplierFn({ data: { supplier_quote_id: supplierQuoteId } }),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ["customer-quotes", requirementId] });
      setConfirmFromSupplier(null);
      toast.success("Customer quote created — set pricing and send");
      await navigate({
        to: "/leads/$leadId",
        params: { leadId },
        search: { quote: result.id },
      });
    },
    onError: (error: Error) => {
      setConfirmFromSupplier(null);
      toast.error("Customer quote not created", { description: error.message });
    },
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
    <div
      id={`supplier-quotes-${requirementId}`}
      className="mt-3 scroll-mt-4 rounded-md border border-border"
    >
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
                setForm({
                  vendor_id: "",
                  ...detailsFrom({ adults: defaultAdults, children: defaultChildren }),
                });
                setMarkReceived(true);
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
              {canManage ? <th className="px-3 py-2 text-right font-medium">Next step</th> : null}
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
                {canManage ? (
                  <td className="px-3 py-2 text-right">
                    {quote.is_superseded ? null : quote.status === "requested" ? (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={markReceivedRow.isPending}
                        onClick={(event) => {
                          event.stopPropagation();
                          markReceivedRow.mutate(quote.id);
                        }}
                      >
                        Mark received
                      </Button>
                    ) : quote.status === "received" ? (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={createCustomerQuote.isPending}
                        onClick={(event) => {
                          event.stopPropagation();
                          setConfirmFromSupplier(quote.id);
                        }}
                      >
                        Create customer quote
                      </Button>
                    ) : null}
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="quote-dialog sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>New Supplier Quote</DialogTitle>
            <DialogDescription>The quote number is assigned automatically.</DialogDescription>
          </DialogHeader>
          <div className="quote-dialog-body grid gap-4">
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
            <DetailsFields
              idPrefix="sq-new"
              value={form}
              onChange={(v) => setForm({ ...form, ...v })}
              errors={errors}
            />
            <label className="flex items-start gap-2 text-sm" htmlFor="sq-received">
              <Checkbox
                id="sq-received"
                checked={markReceived}
                onCheckedChange={(checked) => setMarkReceived(checked === true)}
              />
              <span>
                Quote already received
                <span className="block text-xs text-muted-foreground">
                  Marks it Received straight away so lines can be added. Untick if you are only
                  requesting prices.
                </span>
              </span>
            </label>
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
        <SheetContent className="w-full overflow-y-auto overscroll-contain pb-6 sm:max-w-3xl">
          {openQuote ? (
            <QuoteSheetBody
              quote={openQuote}
              canManage={canManage}
              onChanged={invalidate}
              defaultPersons={defaultAdults + defaultChildren}
              onCreateCustomerQuote={(id) => setConfirmFromSupplier(id)}
              customerQuotePending={createCustomerQuote.isPending}
            />
          ) : null}
        </SheetContent>
      </Sheet>

      <AlertDialog
        open={confirmFromSupplier !== null}
        onOpenChange={(open) => !open && setConfirmFromSupplier(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Create customer quote from this quote?</AlertDialogTitle>
            <AlertDialogDescription>
              A Draft customer quote is created with this quote's lines (excluding alternatives and
              add-ons) and their INR cost snapshots. Only pricing is left to set.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={createCustomerQuote.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={createCustomerQuote.isPending}
              onClick={(event) => {
                event.preventDefault();
                if (confirmFromSupplier) createCustomerQuote.mutate(confirmFromSupplier);
              }}
            >
              {createCustomerQuote.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
              Create customer quote
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {vendorQuickAdd.quickAddDialog}
    </div>
  );
}

type LineForm = {
  price_basis: PriceBasis;
  option_label: string;
  not_in_total: boolean;
  purchase_type: SaleItemType;
  description: string;
  quantity: string;
  currency: string;
  unit_amount: string;
  exchange_rate: string;
};
const EMPTY_LINE: LineForm = {
  price_basis: "per_person",
  option_label: "",
  not_in_total: false,
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
  defaultPersons,
  onCreateCustomerQuote,
  customerQuotePending,
}: {
  quote: Quote;
  canManage: boolean;
  onChanged: () => Promise<void>;
  defaultPersons: number;
  onCreateCustomerQuote: (supplierQuoteId: string) => void;
  customerQuotePending: boolean;
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
  const [header, setHeader] = useState<DetailsForm>(detailsFrom({}));
  const [headerErrors, setHeaderErrors] = useState<Record<string, string>>({});
  const persons = (quote.adults ?? 0) + (quote.children ?? 0) || defaultPersons;
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
    mutationFn: (values: ReturnType<typeof quoteDetailsSchema.parse>) =>
      updateFn({ data: { id: quote.id, values } }),
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
    mutationFn: (values: ReturnType<typeof quoteLineValuesSchema.parse>) => {
      if (editingLineId === "new")
        return addLineFn({ data: { supplier_quote_id: quote.id, values } });
      if (!editingLineId) throw new Error("Select a line");
      return updateLineFn({ data: { id: editingLineId, values } });
    },
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
      setLineForm({ ...EMPTY_LINE, quantity: String(Math.max(persons, 1)) });
      setEditingLineId("new");
      return;
    }
    setLineForm({
      price_basis: (line.price_basis as PriceBasis) ?? "total",
      option_label: line.option_label ?? "",
      not_in_total: line.not_in_total,
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

  function submitHeader() {
    const parsed = quoteDetailsSchema.safeParse(header);
    if (!parsed.success) {
      setHeaderErrors(issuesToErrors(parsed.error.issues));
      return;
    }
    setHeaderErrors({});
    saveHeader.mutate(parsed.data);
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
        <DetailRow
          label="Travellers"
          value={
            quote.adults === null && quote.children === null && !quote.child_ages
              ? "—"
              : `${quote.adults ?? 0} adults · ${quote.children ?? 0} children${
                  quote.child_ages ? ` (ages ${quote.child_ages})` : ""
                }`
          }
        />
        <DetailRow label="Inclusions" value={<CollapsibleText text={quote.inclusions} />} />
        <DetailRow label="Exclusions" value={<CollapsibleText text={quote.exclusions} />} />
        <DetailRow
          label="Itinerary / notes"
          value={<CollapsibleText text={quote.itinerary_notes} />}
        />
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
                setHeader(detailsFrom(quote));
                setHeaderErrors({});
                setHeaderOpen(true);
              }}
            >
              <Pencil className="size-3.5" />
              Edit details
            </Button>
          </div>
        ) : null}
        <div className="space-y-1 pt-2">
          <Button
            size="sm"
            variant="outline"
            disabled={!editable || quote.status !== "received" || revise.isPending}
            onClick={() => setConfirmRevise(true)}
          >
            Create revision
          </Button>
          {!editable || quote.status !== "received" ? (
            <p className="text-xs text-muted-foreground">
              {quote.is_superseded
                ? "A newer revision already replaces this quote."
                : quote.status === "selected"
                  ? "Selected quotes are final; revisions are unavailable."
                  : quote.status === "rejected"
                    ? "Rejected quotes are final; revisions are unavailable."
                    : !canManage
                      ? "You do not have permission to create revisions."
                      : "Mark the quote as Received first."}
            </p>
          ) : null}
        </div>
        {canManage && !quote.is_superseded && quote.status === "received" ? (
          <div className="pt-2">
            <Button
              size="sm"
              disabled={customerQuotePending}
              onClick={() => onCreateCustomerQuote(quote.id)}
            >
              Create customer quote from this quote
            </Button>
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
                  {transitions
                    .filter((s) => s !== "selected")
                    .map((s) => (
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
                <th className="px-2 py-2 font-medium">Option</th>
                <th className="px-2 py-2 font-medium">Basis</th>
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
                  <td colSpan={9} className="px-2 py-6 text-center text-muted-foreground">
                    No lines yet.
                  </td>
                </tr>
              ) : (
                quote.lines.map((line) => (
                  <tr key={line.id}>
                    <td className="px-2 py-2">
                      {SALE_ITEM_TYPE_LABELS[line.purchase_type]}
                      {isPackageType(line.purchase_type) ? (
                        <Badge variant="outline" className="ml-1">
                          Package
                        </Badge>
                      ) : null}
                    </td>
                    <td className="px-2 py-2">
                      {line.description}
                      {line.not_in_total ? (
                        <Badge variant="outline" className="ml-1">
                          Not in total
                        </Badge>
                      ) : null}
                    </td>
                    <td className="px-2 py-2 text-muted-foreground">{line.option_label ?? "—"}</td>
                    <td className="px-2 py-2 text-muted-foreground">
                      {PRICE_BASIS_LABELS[line.price_basis as PriceBasis] ?? line.price_basis}
                    </td>
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
                <td colSpan={7} className="px-2 py-2 text-right">
                  Quote total
                </td>
                <td className="px-2 py-2 text-right tabular-nums">{inr(quoteTotal(quote))}</td>
                {editable ? <td /> : null}
              </tr>
              {quote.lines.some((l) => l.not_in_total) ? (
                <tr className="text-muted-foreground">
                  <td colSpan={7} className="px-2 py-2 text-right">
                    Alternatives and add-ons (not in quote total)
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums">{inr(extrasTotal(quote))}</td>
                  {editable ? <td /> : null}
                </tr>
              ) : null}
            </tfoot>
          </table>
        </div>
      </div>

      <QuoteFiles quoteId={quote.id} canUpload={canManage && !quote.is_superseded} />

      {canManage && !quote.is_superseded ? (
        <div className="sticky bottom-0 mt-6 border-t border-border bg-surface px-4 py-3">
          {quote.status === "requested" ? (
            <Button
              size="sm"
              className="w-full"
              disabled={statusMutation.isPending}
              onClick={() => setPendingStatus("received")}
            >
              {statusMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
              Mark received
            </Button>
          ) : quote.status === "received" ? (
            <Button
              size="sm"
              className="w-full"
              disabled={customerQuotePending}
              onClick={() => onCreateCustomerQuote(quote.id)}
            >
              Create customer quote from this quote
            </Button>
          ) : null}
        </div>
      ) : null}

      <Dialog open={editingLineId !== null} onOpenChange={(o) => !o && setEditingLineId(null)}>
        <DialogContent className="quote-dialog sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingLineId === "new" ? "Add line" : "Edit line"}</DialogTitle>
            <DialogDescription>The INR amount is calculated by the database.</DialogDescription>
          </DialogHeader>
          <div className="quote-dialog-body grid gap-4">
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
                    {SALE_ITEM_TYPES.filter(
                      (t) =>
                        (QUOTE_LINE_TYPES as readonly string[]).includes(t) ||
                        t === lineForm.purchase_type,
                    ).map((t) => (
                      <SelectItem key={t} value={t}>
                        {SALE_ITEM_TYPE_LABELS[t]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {PURCHASE_TYPE_HINTS[lineForm.purchase_type] ? (
                  <p className="text-xs text-muted-foreground">
                    {PURCHASE_TYPE_HINTS[lineForm.purchase_type]}
                  </p>
                ) : null}
              </Field>
              <Field label="Price basis" htmlFor="sql-basis" error={lineErrors["price_basis"]}>
                <Select
                  value={lineForm.price_basis}
                  onValueChange={(v) => {
                    const price_basis = v as PriceBasis;
                    setLineForm({
                      ...lineForm,
                      price_basis,
                      quantity:
                        price_basis === "per_person" && lineForm.price_basis !== "per_person"
                          ? String(Math.max(persons, 1))
                          : lineForm.quantity,
                    });
                  }}
                >
                  <SelectTrigger id="sql-basis">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PRICE_BASES.map((b) => (
                      <SelectItem key={b} value={b}>
                        {PRICE_BASIS_LABELS[b]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>
            <Field label="Option label" htmlFor="sql-option" error={lineErrors["option_label"]}>
              <Input
                id="sql-option"
                placeholder="Double sharing"
                value={lineForm.option_label}
                onChange={(e) => setLineForm({ ...lineForm, option_label: e.target.value })}
              />
            </Field>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={lineForm.not_in_total}
                onCheckedChange={(c) => setLineForm({ ...lineForm, not_in_total: c === true })}
              />
              Alternative or optional (not in quote total)
            </label>
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
              <Field
                label={lineForm.price_basis === "per_person" ? "No. of persons" : "Quantity"}
                htmlFor="sql-qty"
                required
                error={lineErrors["quantity"]}
              >
                <Input
                  id="sql-qty"
                  type="number"
                  min={1}
                  value={lineForm.quantity}
                  onChange={(e) => setLineForm({ ...lineForm, quantity: e.target.value })}
                />
              </Field>
              <QuoteCurrencyField
                key={editingLineId}
                id="sql-cur"
                value={lineForm.currency}
                error={lineErrors["currency"]}
                onChange={(currency) =>
                  setLineForm({
                    ...lineForm,
                    currency,
                    exchange_rate: currency === "INR" ? "1" : lineForm.exchange_rate,
                  })
                }
              />
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
                label={`Rate to INR (₹ per 1 ${lineForm.currency || "currency"})`}
                htmlFor="sql-rate"
                required
                error={lineErrors["exchange_rate"]}
              >
                <Input
                  id="sql-rate"
                  type="number"
                  min={0}
                  step="0.0001"
                  readOnly={isInr}
                  value={isInr ? "1" : lineForm.exchange_rate}
                  onChange={(e) => setLineForm({ ...lineForm, exchange_rate: e.target.value })}
                />
              </Field>
            </div>
            <QuoteLinePreview
              quantity={lineForm.quantity}
              currency={lineForm.currency}
              amount={lineForm.unit_amount}
              rate={isInr ? "1" : lineForm.exchange_rate}
            />
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
        <DialogContent className="quote-dialog sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit quote details</DialogTitle>
            <DialogDescription>The vendor cannot be changed.</DialogDescription>
          </DialogHeader>
          <div className="quote-dialog-body grid gap-4">
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
            <DetailsFields
              idPrefix="sq-edit"
              value={header}
              onChange={setHeader}
              errors={headerErrors}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setHeaderOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submitHeader} disabled={saveHeader.isPending}>
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

const formatBytes = (n: number) =>
  n >= 1024 * 1024
    ? `${(n / 1024 / 1024).toFixed(1)} MB`
    : `${Math.max(1, Math.round(n / 1024))} KB`;

function QuoteFiles({ quoteId, canUpload }: { quoteId: string; canUpload: boolean }) {
  const queryClient = useQueryClient();
  const listFn = useServerFn(listSupplierQuoteFiles);
  const registerFn = useServerFn(registerSupplierQuoteFile);
  const urlFn = useServerFn(getSupplierQuoteFileUrl);
  const queryKey = ["supplier-quote-files", quoteId];
  const files = useQuery({ queryKey, queryFn: () => listFn({ data: { id: quoteId } }) });

  const upload = useMutation({
    mutationFn: async (file: File) => {
      const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
      const contentType = QUOTE_FILE_TYPES[ext];
      if (!contentType) throw new Error("Allowed types: PDF, PNG, JPG, WEBP, TXT, EML");
      if (file.size > QUOTE_FILE_MAX_BYTES) throw new Error("Files can be at most 10 MB");
      const path = `${quoteId}/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage
        .from("supplier-quote-files")
        .upload(path, file, { contentType, upsert: false });
      if (error) throw new Error(error.message);
      return registerFn({
        data: {
          supplier_quote_id: quoteId,
          file_name: file.name.slice(0, 255),
          storage_path: path,
          content_type: contentType,
          size_bytes: file.size,
        },
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey });
      await queryClient.invalidateQueries({ queryKey: ["audit-log"] });
      toast.success("File uploaded");
    },
    onError: (e: Error) => toast.error("Upload failed", { description: e.message }),
  });

  const open = useMutation({
    mutationFn: (id: string) => urlFn({ data: { id } }),
    onSuccess: ({ url }) => window.open(url, "_blank", "noopener,noreferrer"),
    onError: (e: Error) => toast.error("Could not open file", { description: e.message }),
  });

  return (
    <div className="px-4 pb-6">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Files
        </h3>
        {canUpload ? (
          <Button size="sm" variant="outline" asChild disabled={upload.isPending}>
            <label className="cursor-pointer">
              {upload.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Paperclip className="size-4" />
              )}
              Upload file
              <input
                type="file"
                className="sr-only"
                accept=".pdf,.png,.jpg,.jpeg,.webp,.txt,.eml"
                disabled={upload.isPending}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (file) upload.mutate(file);
                }}
              />
            </label>
          </Button>
        ) : null}
      </div>
      {files.isPending ? (
        <LoadingState label="Loading files" />
      ) : files.isError ? (
        <ErrorState description={files.error.message} onRetry={() => void files.refetch()} />
      ) : files.data.length === 0 ? (
        <EmptyState title="No files attached" />
      ) : (
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-2 py-2 font-medium">Name</th>
                <th className="px-2 py-2 text-right font-medium">Size</th>
                <th className="px-2 py-2 font-medium">Uploaded</th>
                <th className="w-20" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {files.data.map((file) => (
                <tr key={file.id}>
                  <td className="break-all px-2 py-2">{file.file_name}</td>
                  <td className="px-2 py-2 text-right tabular-nums">
                    {formatBytes(Number(file.size_bytes))}
                  </td>
                  <td className="px-2 py-2">{formatDate(file.created_at)}</td>
                  <td className="px-2 py-2 text-right">
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={open.isPending}
                      onClick={() => open.mutate(file.id)}
                    >
                      <ExternalLink className="size-3.5" />
                      Open
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
