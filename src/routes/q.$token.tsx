import { createFileRoute } from "@tanstack/react-router";
import { Printer } from "lucide-react";

import { getSharedQuote, type SharedQuote } from "@/lib/shared-quote.functions";
import { formatMoney } from "@/lib/sale-costing-schemas";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/q/$token")({
  validateSearch: (search: Record<string, unknown>): { preview?: string | undefined } =>
    search["preview"] === "1" ? { preview: "1" } : {},
  loaderDeps: ({ search }) => ({ preview: search.preview === "1" }),
  loader: ({ params, deps }) =>
    getSharedQuote({ data: { token: params.token, track: !deps.preview } }),
  head: ({ loaderData }) => {
    const title = loaderData
      ? `${loaderData.public_title ?? "Your travel quote"} · Triptastic Holidays`
      : "Quote · Triptastic Holidays";
    const description = "Your travel quotation from Triptastic Holidays.";
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { name: "robots", content: "noindex, nofollow" },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "website" },
        { name: "twitter:card", content: "summary" },
      ],
    };
  },
  component: SharedQuotePage,
});

function fmtDate(value: string | null) {
  if (!value) return null;
  return new Date(value).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function Brand() {
  return (
    <div className="flex items-center justify-between border-b border-border pb-4">
      <div>
        <p className="text-lg font-semibold tracking-tight text-foreground">Triptastic Holidays</p>
        <p className="text-xs text-muted-foreground">Travel quotation</p>
      </div>
    </div>
  );
}

function SharedQuotePage() {
  const quote = Route.useLoaderData();
  if (!quote) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="w-full max-w-md text-center">
          <p className="text-lg font-semibold text-foreground">Triptastic Holidays</p>
          <p className="mt-6 text-base text-foreground">This link is not available.</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Please contact us for an up-to-date quotation.
          </p>
        </div>
      </main>
    );
  }
  return <QuoteView quote={quote} />;
}

function TextBlock({ title, text }: { title: string; text: string | null }) {
  if (!text) return null;
  return (
    <section className="shared-quote-section mt-6">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h2>
      <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground">
        {text}
      </p>
    </section>
  );
}

function QuoteView({ quote }: { quote: SharedQuote }) {
  const start = fmtDate(quote.travel_start_date);
  const end = fmtDate(quote.travel_end_date);
  const dates = start && end ? `${start} – ${end}` : (start ?? end);
  const travellers = [
    quote.adults ? `${quote.adults} adult${quote.adults === 1 ? "" : "s"}` : null,
    quote.children ? `${quote.children} child${quote.children === 1 ? "" : "ren"}` : null,
  ]
    .filter(Boolean)
    .join(", ");
  const destinations = quote.destinations
    .map((d) => (d.nights ? `${d.name} (${d.nights}N)` : d.name))
    .join(" · ");
  const hasTcs = Number(quote.tcs_amount) > 0;
  const facts: [string, string | null][] = [
    ["Prepared for", quote.client_name],
    ["Destination", destinations || null],
    ["Travel dates", dates],
    ["Travellers", travellers || null],
    ["Valid until", fmtDate(quote.valid_until)],
  ];
  return (
    <main className="shared-quote min-h-screen bg-background">
      <div className="mx-auto w-full max-w-2xl px-4 py-6 sm:py-10">
        <Brand />
        {!quote.is_latest ? (
          <div
            role="status"
            className="mt-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-foreground"
          >
            This quote has been updated. Please ask us for the latest version.
          </div>
        ) : null}
        <div className="mt-5 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold leading-tight text-foreground">
              {quote.public_title ?? "Your travel quotation"}
            </h1>
            <p className="mt-1 font-mono text-xs text-muted-foreground">
              {quote.quote_number} · Rev {quote.revision_no}
            </p>
          </div>
          <Button size="sm" variant="outline" className="no-print" onClick={() => window.print()}>
            <Printer className="size-4" />
            Print / Save as PDF
          </Button>
        </div>
        <dl className="shared-quote-section mt-5 grid grid-cols-1 gap-x-6 gap-y-2 rounded-md border border-border p-4 text-sm sm:grid-cols-2">
          {facts.map(([label, value]) =>
            value ? (
              <div key={label}>
                <dt className="text-xs text-muted-foreground">{label}</dt>
                <dd className="text-foreground">{value}</dd>
              </div>
            ) : null,
          )}
        </dl>
        <TextBlock title="Summary" text={quote.summary} />
        <TextBlock title="Itinerary" text={quote.itinerary} />
        <TextBlock title="Inclusions" text={quote.inclusions} />
        <TextBlock title="Exclusions" text={quote.exclusions} />
        <section className="shared-quote-section mt-6 rounded-md border border-border p-4">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Price
          </h2>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between gap-4">
              <dt>Total</dt>
              <dd className="tabular-nums">{formatMoney(quote.total)}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt>GST ({Number(quote.gst_rate)}%)</dt>
              <dd className="tabular-nums">{formatMoney(quote.gst_amount)}</dd>
            </div>
            {hasTcs ? (
              <div className="flex justify-between gap-4">
                <dt>TCS{quote.tcs_rate ? ` (${Number(quote.tcs_rate)}%)` : ""}</dt>
                <dd className="tabular-nums">{formatMoney(quote.tcs_amount)}</dd>
              </div>
            ) : null}
            <div className="flex justify-between gap-4 border-t border-border pt-2 text-base font-semibold">
              <dt>Total payable</dt>
              <dd className="tabular-nums">{formatMoney(quote.customer_payable)}</dd>
            </div>
          </dl>
        </section>
        <TextBlock title="Terms & conditions" text={quote.terms} />
        <p className="mt-8 border-t border-border pt-4 text-xs text-muted-foreground">
          Triptastic Holidays · Prices are in Indian Rupees and subject to availability at the
          time of booking.
        </p>
      </div>
    </main>
  );
}
