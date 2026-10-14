import { decimalString, paise } from "./quotation-display";
import type { BillingType, MarkupType } from "./sale-costing-schemas";

export type QuotePricingForm = {
  billing_type: BillingType;
  markup_type: MarkupType;
  markup_value: string;
  discount_amount: string;
  tcs_applicable: boolean;
  tcs_rate: string;
};

function percentage(amount: bigint, rate: string) {
  if (!/^\d+(\.\d+)?$/.test(rate)) throw new Error("Enter a valid rate");
  const [whole = "0", fraction = ""] = rate.split(".");
  const scale = 10n ** BigInt(fraction.length);
  const numerator = amount * BigInt(whole + fraction);
  const denominator = scale * 100n;
  return (numerator + denominator / 2n) / denominator;
}

/** Non-authoritative, exact decimal display preview. Only inputs are sent to the existing server function. */
export function quotationPricingPreview(expectedCost: string, form: QuotePricingForm) {
  try {
    for (const value of [form.markup_type === "none" ? "0" : form.markup_value, form.discount_amount]) {
      if (!/^\d+(\.\d{0,2})?$/.test(value)) return null;
    }
    const cost = paise(expectedCost);
    const charge = form.markup_type === "percentage" ? percentage(cost, form.markup_value)
      : form.markup_type === "lumpsum" ? paise(form.markup_value) : 0n;
    const selling = cost + charge - paise(form.discount_amount);
    if (selling < 0n) return null;
    const gst = form.billing_type === "tour_package" ? percentage(selling, "5") : percentage(charge, "18");
    const tcs = form.tcs_applicable ? percentage(selling + gst, form.tcs_rate) : 0n;
    return {
      expected_cost: expectedCost,
      selling_value: decimalString(selling),
      gst_amount: decimalString(gst),
      tcs_amount: decimalString(tcs),
      customer_payable: decimalString(selling + gst + tcs),
      expected_gross_profit: decimalString(selling - cost),
    };
  } catch { return null; }
}

export function quotationMargin(profit: string, selling: string) {
  const denominator = paise(selling);
  if (denominator <= 0n) return "—";
  const numerator = paise(profit) * 10000n;
  const absolute = numerator < 0n ? -numerator : numerator;
  const rounded = (absolute + denominator / 2n) / denominator;
  return `${numerator < 0n ? "-" : ""}${decimalString(rounded)}%`;
}