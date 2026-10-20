import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Copy, Loader2, Mail, MessageCircle, Pencil, Share2 } from "lucide-react";
import { toast } from "sonner";

import { Field, formatDateTime } from "./master-data";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { setCustomerQuoteShare, updateCustomerQuoteContent } from "@/lib/customer-quotes.functions";
import { getSharedQuote } from "@/lib/shared-quote.functions";
import {
  customerQuoteContentSchema,
  type CustomerContentField,
} from "@/lib/customer-quote-schemas";
import { formatMoney } from "@/lib/sale-costing-schemas";
import { quoteFieldErrors } from "@/lib/quotation-display";

type ContentForm = Record<CustomerContentField, string>;

const CONTENT_LABELS: { key: CustomerContentField; label: string; rows: number }[] = [
  { key: "public_title", label: "Title", rows: 1 },
  { key: "summary", label: "Summary", rows: 3 },
  { key: "itinerary", label: "Itinerary (day-wise)", rows: 6 },
  { key: "inclusions", label: "Inclusions", rows: 4 },
  { key: "exclusions", label: "Exclusions", rows: 4 },
  { key: "terms", label: "Terms", rows: 4 },
];

type ShareQuote = {
  id: string;
  status: string;
  share_token: string;
  share_enabled: boolean;
  view_count: number;
  last_viewed_at: string | null;
  client: { name: string; phone: string | null; email: string | null } | null;
} & Partial<Record<CustomerContentField, string | null>>;

/** "Viewed N times, last <date>" for shared quotes. */
export function QuoteViewStats({
  quote,
}: {
  quote: { share_enabled: boolean; view_count: number; last_viewed_at: string | null };
}) {
  if (!quote.share_enabled && quote.view_count === 0) return null;
  if (quote.view_count === 0) {
    return <span className="text-xs text-muted-foreground">Shared · not viewed yet</span>;
  }
  return (
    <span className="text-xs text-muted-foreground">
      Viewed {quote.view_count} {quote.view_count === 1 ? "time" : "times"}, last{" "}
      {formatDateTime(quote.last_viewed_at)}
    </span>
  );
}

export function CustomerFacingDetails({
  quote,
  editable,
  onChanged,
}: {
  quote: ShareQuote;
  editable: boolean;
  onChanged: () => Promise<void>;
}) {
  const toForm = (): ContentForm => ({
    public_title: quote.public_title ?? "",
    summary: quote.summary ?? "",
    itinerary: quote.itinerary ?? "",
    inclusions: quote.inclusions ?? "",
    exclusions: quote.exclusions ?? "",
    terms: quote.terms ?? "",
  });
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<ContentForm>(toForm);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const updateFn = useServerFn(updateCustomerQuoteContent);
  const save = useMutation({
    mutationFn: () =>
      updateFn({ data: { id: quote.id, values: customerQuoteContentSchema.parse(form) } }),
    onSuccess: async () => {
      await onChanged();
      setOpen(false);
      toast.success("Customer-facing details saved");
    },
    onError: (error: Error) => toast.error("Not saved", { description: error.message }),
  });
  function submit() {
    const parsed = customerQuoteContentSchema.safeParse(form);
    if (!parsed.success) {
      setErrors(quoteFieldErrors(parsed.error.issues));
      return;
    }
    setErrors({});
    save.mutate();
  }
  const filled = CONTENT_LABELS.filter(({ key }) => quote[key]);
  return (
    <section className="border-t border-border pt-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Customer-facing details
        </h3>
        {editable ? (
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setForm(toForm());
              setErrors({});
              setOpen(true);
            }}
          >
            <Pencil className="size-4" />
            Edit
          </Button>
        ) : null}
      </div>
      {filled.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {editable
            ? "No customer-facing text yet. Add a title, itinerary, inclusions and terms."
            : "No customer-facing text."}
        </p>
      ) : (
        <dl className="space-y-3 text-sm">
          {filled.map(({ key, label }) => (
            <div key={key}>
              <dt className="text-xs text-muted-foreground">{label}</dt>
              <dd className="line-clamp-4 whitespace-pre-wrap break-words">{quote[key]}</dd>
            </div>
          ))}
        </dl>
      )}
      {!editable && quote.status !== "draft" ? (
        <p className="mt-2 text-xs text-muted-foreground">Editable only while the quote is Draft.</p>
      ) : null}
      <Dialog open={open && editable} onOpenChange={setOpen}>
        <DialogContent className="quote-dialog sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Customer-facing details</DialogTitle>
            <DialogDescription>Shown to the customer on the shared quote page.</DialogDescription>
          </DialogHeader>
          <div className="quote-dialog-body grid gap-4">
            {CONTENT_LABELS.map(({ key, label, rows }) => (
              <Field key={key} label={label} htmlFor={`cqc-${key}`} error={errors[key]}>
                {rows === 1 ? (
                  <Input
                    id={`cqc-${key}`}
                    maxLength={8000}
                    value={form[key]}
                    onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                  />
                ) : (
                  <Textarea
                    id={`cqc-${key}`}
                    rows={rows}
                    maxLength={8000}
                    value={form[key]}
                    onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                  />
                )}
              </Field>
            ))}
            <p className="text-sm font-medium text-destructive">
              Do not include vendor names or costs.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" disabled={save.isPending} onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button disabled={save.isPending} onClick={submit}>
              {save.isPending ? <Loader2 className="size-4 animate-spin" /> : null}Save details
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

function waNumber(phone: string | null | undefined) {
  const digits = (phone ?? "").replace(/\D/g, "").replace(/^0+/, "");
  if (!digits) return "";
  return digits.length === 10 ? `91${digits}` : digits;
}

export function ShareQuoteButton({
  quote,
  canManage,
  onChanged,
}: {
  quote: ShareQuote;
  canManage: boolean;
  onChanged: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [confirmDraft, setConfirmDraft] = useState(false);
  const shareFn = useServerFn(setCustomerQuoteShare);
  const share = useMutation({
    mutationFn: (enabled: boolean) => shareFn({ data: { id: quote.id, enabled } }),
    onSuccess: async (_r, enabled) => {
      await onChanged();
      setConfirmDraft(false);
      if (enabled) setOpen(true);
      toast.success(enabled ? "Share link enabled" : "Share link disabled");
    },
    onError: (error: Error) => toast.error("Request rejected", { description: error.message }),
  });
  function start() {
    if (quote.share_enabled) setOpen(true);
    else if (quote.status === "draft") setConfirmDraft(true);
    else share.mutate(true);
  }
  const disabledReason = !canManage
    ? "You do not have permission to share quotes."
    : quote.status === "superseded"
      ? "A newer revision replaces this quote."
      : null;
  return (
    <div className="space-y-1">
      <Button
        size="sm"
        variant="outline"
        disabled={Boolean(disabledReason) || share.isPending}
        onClick={start}
      >
        <Share2 className="size-4" />
        Share
      </Button>
      {disabledReason ? <p className="text-xs text-muted-foreground">{disabledReason}</p> : null}
      <AlertDialog
        open={confirmDraft}
        onOpenChange={(o) => !share.isPending && setConfirmDraft(o)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Share this Draft quote?</AlertDialogTitle>
            <AlertDialogDescription>
              Sharing marks the quote as Sent, which locks its details, lines and pricing. Changes
              then require a new revision.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={share.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={share.isPending}
              onClick={(e) => {
                e.preventDefault();
                share.mutate(true);
              }}
            >
              {share.isPending ? <Loader2 className="size-4 animate-spin" /> : null}Mark as Sent and
              share
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {open ? (
        <ShareDialog
          quote={quote}
          canManage={canManage}
          pending={share.isPending}
          onToggle={(enabled) => share.mutate(enabled)}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </div>
  );
}

function ShareDialog({
  quote,
  canManage,
  pending,
  onToggle,
  onClose,
}: {
  quote: ShareQuote;
  canManage: boolean;
  pending: boolean;
  onToggle: (enabled: boolean) => void;
  onClose: () => void;
}) {
  const link =
    typeof window === "undefined" ? "" : `${window.location.origin}/q/${quote.share_token}`;
  const previewFn = useServerFn(getSharedQuote);
  const preview = useQuery({
    queryKey: ["shared-quote-preview", quote.id, quote.share_enabled],
    queryFn: () => previewFn({ data: { token: quote.share_token, track: false } }),
    enabled: quote.share_enabled,
  });
  const [message, setMessage] = useState("");
  const [touched, setTouched] = useState(false);
  useEffect(() => {
    if (touched || !preview.data) return;
    const p = preview.data;
    const dest = p.destinations.map((d) => d.name).join(", ") || "travel";
    const name = quote.client?.name ?? p.client_name ?? "Customer";
    const title = p.public_title ?? `Quote ${p.quote_number}`;
    setMessage(
      `Dear ${name}, please find your ${dest} quote here: ${link}\n\n${title}\nTotal payable: ${formatMoney(p.customer_payable)}`,
    );
  }, [preview.data, touched, link, quote.client?.name]);
  const phone = waNumber(quote.client?.phone);
  const waHref = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
  const mailHref = `mailto:${quote.client?.email ?? ""}?subject=${encodeURIComponent(
    preview.data?.public_title ?? "Your travel quote",
  )}&body=${encodeURIComponent(message)}`;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="quote-dialog sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Share quote</DialogTitle>
          <DialogDescription>
            Anyone with the link can view the customer page. It never shows vendors, costs or
            margin.
          </DialogDescription>
        </DialogHeader>
        <div className="quote-dialog-body grid gap-4">
          <div className="flex items-center justify-between gap-3 rounded-md border border-border p-3">
            <div>
              <p className="text-sm font-medium">Link enabled</p>
              <QuoteViewStats quote={quote} />
            </div>
            <Switch
              checked={quote.share_enabled}
              disabled={!canManage || pending}
              onCheckedChange={(checked) => onToggle(checked)}
              aria-label="Enable share link"
            />
          </div>
          {quote.share_enabled ? (
            <>
              <Field label="Share link" htmlFor="cq-share-link">
                <div className="flex gap-2">
                  <Input id="cq-share-link" readOnly value={link} className="font-mono text-xs" />
                  <Button
                    variant="outline"
                    onClick={() => {
                      void navigator.clipboard.writeText(link).then(
                        () => toast.success("Link copied"),
                        () => toast.error("Could not copy the link"),
                      );
                    }}
                  >
                    <Copy className="size-4" />
                    Copy
                  </Button>
                </div>
              </Field>
              <Field label="Message" htmlFor="cq-share-message">
                <Textarea
                  id="cq-share-message"
                  rows={4}
                  value={message}
                  onChange={(e) => {
                    setTouched(true);
                    setMessage(e.target.value);
                  }}
                />
              </Field>
              <div className="flex flex-wrap gap-2">
                <Button asChild>
                  <a href={waHref} target="_blank" rel="noopener noreferrer">
                    <MessageCircle className="size-4" />
                    Share on WhatsApp
                  </a>
                </Button>
                <Button asChild variant="outline">
                  <a href={mailHref}>
                    <Mail className="size-4" />
                    Email
                  </a>
                </Button>
              </div>
              {!phone ? (
                <p className="text-xs text-muted-foreground">
                  The client has no phone number; WhatsApp will ask you to pick a contact.
                </p>
              ) : null}
              <div>
                <p className="mb-2 text-xs font-medium text-muted-foreground">Customer preview</p>
                <iframe
                  title="Customer page preview"
                  src={`/q/${quote.share_token}?preview=1`}
                  className="h-[420px] w-full rounded-md border border-border bg-background"
                />
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              The link is disabled. Customers who open it see "This link is not available".
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
