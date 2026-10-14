import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link, useNavigate } from "@tanstack/react-router";
import { Loader2, Pencil, Plus, Copy } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { Field, DetailRow, formatDate } from "./master-data";
import { EmptyState, ErrorState, LoadingState } from "./states";
import { CustomerQuoteLines } from "./customer-quote-lines";
import { CustomerQuotePricing } from "./customer-quote-pricing";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
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
  listCustomerQuotes,
  getCustomerQuote,
  createCustomerQuote,
  updateCustomerQuote,
  changeCustomerQuoteStatus,
  createCustomerQuoteRevision,
  convertCustomerQuoteToBooking,
} from "@/lib/customer-quotes.functions";
import {
  customerQuoteHeaderSchema,
  CUSTOMER_QUOTE_STATUS_LABELS,
  CUSTOMER_QUOTE_TRANSITIONS,
  REVISABLE_STATUSES,
  type CustomerQuoteStatus,
} from "@/lib/customer-quote-schemas";
import { formatMoney } from "@/lib/sale-costing-schemas";
import { quoteFieldErrors } from "@/lib/quotation-display";

function StatusBadge({ status }: { status: CustomerQuoteStatus }) {
  return (
    <Badge
      variant={
        status === "accepted"
          ? "default"
          : status === "rejected"
            ? "destructive"
            : status === "superseded"
              ? "outline"
              : "secondary"
      }
    >
      {CUSTOMER_QUOTE_STATUS_LABELS[status]}
    </Badge>
  );
}

export function CustomerQuotes({
  requirementId,
  canCreate,
  initialQuoteId,
}: {
  requirementId: string;
  canCreate: boolean;
  initialQuoteId?: string | undefined;
}) {
  const auth = useAuth();
  const canManage = auth.hasAnyRole(["admin", "sales"]) && auth.hasPermission("leads.manage");
  const queryClient = useQueryClient();
  const listFn = useServerFn(listCustomerQuotes);
  const createFn = useServerFn(createCustomerQuote);
  const [createOpen, setCreateOpen] = useState(false);
  const [openId, setOpenId] = useState<string | null>(initialQuoteId ?? null);
  const [form, setForm] = useState({ valid_until: "", notes: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const quotes = useQuery({
    queryKey: ["customer-quotes", requirementId],
    queryFn: () => listFn({ data: { requirement_id: requirementId } }),
  });
  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["customer-quotes", requirementId] }),
      queryClient.invalidateQueries({ queryKey: ["customer-quote"] }),
      queryClient.invalidateQueries({ queryKey: ["audit-log"] }),
      queryClient.invalidateQueries({ queryKey: ["sales"] }),
      queryClient.invalidateQueries({ queryKey: ["leads"] }),
    ]);
  };
  const create = useMutation({
    mutationFn: () =>
      createFn({
        data: { requirement_id: requirementId, values: customerQuoteHeaderSchema.parse(form) },
      }),
    onSuccess: async (result) => {
      await invalidate();
      setCreateOpen(false);
      setOpenId(result.id);
      toast.success("Customer quote created");
    },
    onError: (error: Error) => toast.error("Quote not created", { description: error.message }),
  });
  function submit() {
    const parsed = customerQuoteHeaderSchema.safeParse(form);
    if (!parsed.success) {
      setErrors(quoteFieldErrors(parsed.error.issues));
      return;
    }
    setErrors({});
    create.mutate();
  }
  return (
    <section className="mt-4 border-t border-border pt-3">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Customer quotes
        </h3>
        {canManage && canCreate ? (
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setForm({ valid_until: "", notes: "" });
              setErrors({});
              setCreateOpen(true);
            }}
          >
            <Plus className="size-4" />
            New Customer Quote
          </Button>
        ) : null}
      </div>
      {quotes.isPending ? (
        <LoadingState label="Loading customer quotes" />
      ) : quotes.isError ? (
        <ErrorState description={quotes.error.message} onRetry={() => void quotes.refetch()} />
      ) : quotes.data.length === 0 ? (
        <EmptyState title="No customer quotes yet" />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted/40 text-xs text-muted-foreground">
              <tr>
                <th className="p-3">Number</th>
                <th className="p-3">Status</th>
                <th className="p-3">Valid until</th>
                <th className="p-3 text-right">Customer payable</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {quotes.data.map((quote) => (
                <tr
                  key={quote.id}
                  className="cursor-pointer hover:bg-muted/40"
                  onClick={() => setOpenId(quote.id)}
                >
                  <td className="p-3">
                    <Button
                      variant="link"
                      className="h-auto p-0 font-mono text-xs"
                      onClick={() => setOpenId(quote.id)}
                    >
                      {quote.quote_number}
                    </Button>
                    <span className="ml-2 whitespace-nowrap text-xs text-muted-foreground">
                      Rev {quote.revision_no}
                    </span>
                  </td>
                  <td className="p-3">
                    <StatusBadge status={quote.status} />
                  </td>
                  <td className="whitespace-nowrap p-3">{formatDate(quote.valid_until)}</td>
                  <td className="whitespace-nowrap p-3 text-right tabular-nums">
                    {formatMoney(quote.customer_payable)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Customer Quote</DialogTitle>
            <DialogDescription>
              Client and quote number are assigned automatically.
            </DialogDescription>
          </DialogHeader>
          <HeaderFields form={form} onChange={setForm} errors={errors} />
          <DialogFooter>
            <Button
              variant="outline"
              disabled={create.isPending}
              onClick={() => setCreateOpen(false)}
            >
              Cancel
            </Button>
            <Button disabled={create.isPending} onClick={submit}>
              {create.isPending ? <Loader2 className="size-4 animate-spin" /> : null}Create quote
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Sheet
        open={openId !== null && Boolean(quotes.data?.some((quote) => quote.id === openId))}
        onOpenChange={(open) => !open && setOpenId(null)}
      >
        <SheetContent className="w-full overflow-y-auto sm:max-w-3xl">
          {openId ? (
            <CustomerQuoteDetail
              key={openId}
              id={openId}
              requirementId={requirementId}
              canManage={canManage}
              onChanged={invalidate}
              onOpen={setOpenId}
            />
          ) : null}
        </SheetContent>
      </Sheet>
    </section>
  );
}

function HeaderFields({
  form,
  onChange,
  errors,
}: {
  form: { valid_until: string; notes: string };
  onChange: (form: { valid_until: string; notes: string }) => void;
  errors: Record<string, string>;
}) {
  return (
    <div className="grid gap-4">
      <Field label="Valid until" htmlFor="cq-valid" error={errors["valid_until"]}>
        <Input
          id="cq-valid"
          type="date"
          value={form.valid_until}
          onChange={(event) => onChange({ ...form, valid_until: event.target.value })}
        />
      </Field>
      <Field label="Notes" htmlFor="cq-notes" error={errors["notes"]}>
        <Textarea
          id="cq-notes"
          rows={3}
          value={form.notes}
          onChange={(event) => onChange({ ...form, notes: event.target.value })}
        />
      </Field>
    </div>
  );
}

function CustomerQuoteDetail({
  id,
  requirementId,
  canManage,
  onChanged,
  onOpen,
}: {
  id: string;
  requirementId: string;
  canManage: boolean;
  onChanged: () => Promise<void>;
  onOpen: (id: string) => void;
}) {
  const getFn = useServerFn(getCustomerQuote);
  const query = useQuery({
    queryKey: ["customer-quote", id],
    queryFn: () => getFn({ data: { id } }),
  });
  return (
    <>
      <SheetHeader>
        <SheetTitle>Customer quotation</SheetTitle>
        <SheetDescription>{query.data?.quote.quote_number ?? "Quote details"}</SheetDescription>
      </SheetHeader>
      {query.isPending ? (
        <LoadingState label="Loading quotation" />
      ) : query.isError ? (
        <ErrorState description={query.error.message} onRetry={() => void query.refetch()} />
      ) : (
        <CustomerQuoteBody
          data={query.data}
          requirementId={requirementId}
          canManage={canManage}
          onChanged={onChanged}
          onOpen={onOpen}
        />
      )}
    </>
  );
}

const actionLabels = {
  sent: "Send",
  accepted: "Accept",
  rejected: "Reject",
  expired: "Expire",
} as const;

function CustomerQuoteBody({
  data,
  requirementId,
  canManage,
  onChanged,
  onOpen,
}: {
  data: Awaited<ReturnType<typeof getCustomerQuote>>;
  requirementId: string;
  canManage: boolean;
  onChanged: () => Promise<void>;
  onOpen: (id: string) => void;
}) {
  const { quote, lines, pricing } = data;
  const navigate = useNavigate();
  const auth = useAuth();
  const booking = Array.isArray(quote.booking) ? quote.booking[0] : quote.booking;
  const canConvert =
    canManage && auth.hasPermission("sales.manage") && quote.status === "accepted" && !booking;
  const editable = canManage && quote.status === "draft";
  const [headerOpen, setHeaderOpen] = useState(false);
  const [form, setForm] = useState({
    valid_until: quote.valid_until ?? "",
    notes: quote.notes ?? "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = useState<keyof typeof actionLabels | "revision" | null>(null);
  const [confirmConvert, setConfirmConvert] = useState(false);
  const updateFn = useServerFn(updateCustomerQuote);
  const statusFn = useServerFn(changeCustomerQuoteStatus);
  const revisionFn = useServerFn(createCustomerQuoteRevision);
  const convertFn = useServerFn(convertCustomerQuoteToBooking);
  const onError = (error: Error) => toast.error("Request rejected", { description: error.message });
  const convert = useMutation({
    mutationFn: () => convertFn({ data: { id: quote.id } }),
    onSuccess: async (result) => {
      await onChanged();
      setConfirmConvert(false);
      toast.success("Booking created from quote");
      await navigate({ to: "/sales/$saleId", params: { saleId: result.id } });
    },
    onError,
  });
  const save = useMutation({
    mutationFn: () =>
      updateFn({ data: { id: quote.id, values: customerQuoteHeaderSchema.parse(form) } }),
    onSuccess: async () => {
      await onChanged();
      setHeaderOpen(false);
      toast.success("Quote updated");
    },
    onError,
  });
  const action = useMutation({
    mutationFn: async () => {
      if (pending === "revision") return revisionFn({ data: { id: quote.id } });
      if (!pending) throw new Error("Select a status action");
      return statusFn({ data: { id: quote.id, status: pending } });
    },
    onSuccess: async (result) => {
      await onChanged();
      const revised = pending === "revision";
      setPending(null);
      toast.success(revised ? "Revision created" : "Quote status updated");
      if (revised) onOpen(result.id);
    },
    onError,
  });
  function submitHeader() {
    const parsed = customerQuoteHeaderSchema.safeParse(form);
    if (!parsed.success) {
      setErrors(quoteFieldErrors(parsed.error.issues));
      return;
    }
    setErrors({});
    save.mutate();
  }
  return (
    <div className="mt-5 space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-mono text-lg font-semibold">{quote.quote_number}</h2>
        <span className="text-sm text-muted-foreground">Rev {quote.revision_no}</span>
        <StatusBadge status={quote.status} />
      </div>
      <dl className="space-y-1">
        <DetailRow label="Client" value={quote.client?.name ?? "—"} />
        {booking ? (
          <DetailRow
            label="Booking"
            value={
              <Button asChild size="sm" variant="link" className="h-auto p-0">
                <Link to="/sales/$saleId" params={{ saleId: booking.id }}>
                  Booking BK-{booking.id}
                </Link>
              </Button>
            }
          />
        ) : null}
        <DetailRow label="Valid until" value={formatDate(quote.valid_until)} />
        <DetailRow
          label="Notes"
          value={<span className="whitespace-pre-wrap break-words">{quote.notes ?? "—"}</span>}
        />
        {quote.previous_quote_id ? (
          <DetailRow
            label="Replaces"
            value={
              <Button
                size="sm"
                variant="link"
                className="h-auto p-0"
                onClick={() => {
                  if (quote.previous_quote_id) onOpen(quote.previous_quote_id);
                }}
              >
                Previous quote · Rev {quote.revision_no - 1}
              </Button>
            }
          />
        ) : null}
      </dl>
      <div className="flex flex-wrap gap-2">
        {canConvert ? (
          <Button size="sm" onClick={() => setConfirmConvert(true)} disabled={convert.isPending}>
            Convert to Booking
          </Button>
        ) : null}
        {editable ? (
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setForm({ valid_until: quote.valid_until ?? "", notes: quote.notes ?? "" });
              setErrors({});
              setHeaderOpen(true);
            }}
          >
            <Pencil className="size-4" />
            Edit details
          </Button>
        ) : null}
        {canManage
          ? CUSTOMER_QUOTE_TRANSITIONS[quote.status].map((status) =>
              status in actionLabels ? (
                <Button
                  key={status}
                  size="sm"
                  variant="outline"
                  onClick={() => setPending(status as keyof typeof actionLabels)}
                >
                  {actionLabels[status as keyof typeof actionLabels]}
                </Button>
              ) : null,
            )
          : null}
        {canManage && REVISABLE_STATUSES.includes(quote.status) ? (
          <Button size="sm" variant="outline" onClick={() => setPending("revision")}>
            <Copy className="size-4" />
            Create revision
          </Button>
        ) : null}
      </div>
      <CustomerQuoteLines
        quoteId={quote.id}
        requirementId={requirementId}
        lines={lines}
        editable={editable}
        onChanged={onChanged}
      />
      <CustomerQuotePricing
        key={`${quote.id}-${quote.status}-${JSON.stringify(pricing)}`}
        quoteId={quote.id}
        pricing={pricing}
        editable={editable}
        onChanged={onChanged}
      />
      <Dialog open={headerOpen && editable} onOpenChange={setHeaderOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit quote details</DialogTitle>
            <DialogDescription>
              {quote.quote_number} · Rev {quote.revision_no}
            </DialogDescription>
          </DialogHeader>
          <HeaderFields form={form} onChange={setForm} errors={errors} />
          <DialogFooter>
            <Button
              variant="outline"
              disabled={save.isPending}
              onClick={() => setHeaderOpen(false)}
            >
              Cancel
            </Button>
            <Button disabled={save.isPending} onClick={submitHeader}>
              {save.isPending ? <Loader2 className="size-4 animate-spin" /> : null}Save details
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <AlertDialog
        open={pending !== null && canManage}
        onOpenChange={(open) => !open && setPending(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pending === "revision"
                ? "Create a new revision?"
                : pending
                  ? `${actionLabels[pending]} quote?`
                  : "Confirm action"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pending === "revision"
                ? "Lines and pricing will be copied into a new Draft. This quote becomes Superseded and read-only."
                : pending === "sent"
                  ? "Sending locks the quote details, lines and pricing. Changes require a new revision."
                  : "This status change is recorded in the audit log."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={action.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={action.isPending}
              onClick={(event) => {
                event.preventDefault();
                action.mutate();
              }}
            >
              {action.isPending ? <Loader2 className="size-4 animate-spin" /> : null}Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog
        open={confirmConvert && canConvert}
        onOpenChange={(open) => !convert.isPending && setConfirmConvert(open)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Convert Accepted quote to Booking?</AlertDialogTitle>
            <AlertDialogDescription>
              The booking will include the itinerary, quote lines, INR cost snapshots and matching
              pricing. The lead moves to Won. This quote can convert only once and remains
              read-only.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={convert.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={convert.isPending}
              onClick={(event) => {
                event.preventDefault();
                convert.mutate();
              }}
            >
              {convert.isPending ? <Loader2 className="size-4 animate-spin" /> : null}Convert to
              Booking
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
