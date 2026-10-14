import type { listSupplierQuotes } from "./supplier-quotes.functions";

export type SupplierQuoteRow = Awaited<ReturnType<typeof listSupplierQuotes>>[number];

/** Latest eligible quote per vendor; a newer rejected revision never hides an eligible quote. */
export function latestSupplierQuotes(quotes: SupplierQuoteRow[]) {
  const vendors = new Map<string, SupplierQuoteRow>();
  for (const quote of quotes) {
    if (quote.is_superseded || quote.status === "rejected") continue;
    const previous = vendors.get(quote.vendor_id);
    if (
      !previous ||
      quote.created_at > previous.created_at ||
      (quote.created_at === previous.created_at && quote.revision_number > previous.revision_number)
    ) {
      vendors.set(quote.vendor_id, quote);
    }
  }
  return [...vendors.values()].sort((a, b) =>
    (a.vendor?.name ?? "").localeCompare(b.vendor?.name ?? ""),
  );
}

/** Exact paise aggregation of database-computed decimal strings, for display only. */
export function paise(value: string): bigint {
  const negative = value.startsWith("-");
  const [whole = "0", fraction = ""] = (negative ? value.slice(1) : value).split(".");
  const absolute = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0").slice(0, 2));
  return negative ? -absolute : absolute;
}

export function supplierTotal(quote: SupplierQuoteRow) {
  return quote.lines.reduce(
    (sum, line) => (line.not_in_total ? sum : sum + paise(line.amount_inr)),
    0n,
  );
}

/** Alternatives and add-ons: listed separately, never part of the quote total. */
export function supplierExtrasTotal(quote: SupplierQuoteRow) {
  return quote.lines.reduce(
    (sum, line) => (line.not_in_total ? sum + paise(line.amount_inr) : sum),
    0n,
  );
}

export function decimalString(value: bigint) {
  const sign = value < 0n ? "-" : "";
  const absolute = value < 0n ? -value : value;
  return `${sign}${absolute / 100n}.${String(absolute % 100n).padStart(2, "0")}`;
}

export function quoteFieldErrors(issues: { path: PropertyKey[]; message: string }[]) {
  const errors: Record<string, string> = {};
  for (const issue of issues) errors[String(issue.path[0] ?? "form")] ??= issue.message;
  return errors;
}
