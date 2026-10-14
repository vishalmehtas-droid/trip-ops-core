import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { Field } from "./master-data";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { customerQuotePricingSchema } from "@/lib/customer-quote-schemas";
import { getCustomerQuote, setCustomerQuotePricing } from "@/lib/customer-quotes.functions";
import { BILLING_TYPES, BILLING_TYPE_LABELS, MARKUP_TYPES, MARKUP_TYPE_LABELS, DEFAULT_TCS_RATE, formatMoney, type BillingType, type MarkupType } from "@/lib/sale-costing-schemas";
import { quotationMargin, quotationPricingPreview, type QuotePricingForm } from "@/lib/quotation-pricing-preview";
import { quoteFieldErrors } from "@/lib/quotation-display";
import { ErrorState } from "./states";

type Pricing = NonNullable<Awaited<ReturnType<typeof getCustomerQuote>>["pricing"]>;

export function CustomerQuotePricing({ quoteId, pricing, editable, onChanged }: {
  quoteId: string; pricing: Pricing | null; editable: boolean; onChanged: () => Promise<void>;
}) {
  const saveFn = useServerFn(setCustomerQuotePricing);
  const [form, setForm] = useState<QuotePricingForm>({
    billing_type: pricing?.billing_type ?? "tour_package",
    markup_type: pricing?.markup_type ?? "none",
    markup_value: pricing?.markup_value ?? "0",
    discount_amount: pricing?.discount_amount ?? "0",
    tcs_applicable: pricing?.tcs_applicable ?? false,
    tcs_rate: pricing?.tcs_rate ?? DEFAULT_TCS_RATE,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [dirty, setDirty] = useState(false);
  const update = (patch: Partial<QuotePricingForm>) => { setForm(current => ({ ...current, ...patch })); setDirty(true); };
  const save = useMutation({
    mutationFn: () => saveFn({ data: customerQuotePricingSchema.parse({ customer_quote_id: quoteId, billing_type: form.billing_type, values: { ...form, markup_value: form.markup_type === "none" ? 0 : form.markup_value, tcs_rate: form.tcs_applicable ? form.tcs_rate : null } }) }),
    onSuccess: async () => { await onChanged(); setDirty(false); toast.success("Pricing saved"); },
    onError: (error: Error) => toast.error("Pricing not saved", { description: error.message }),
  });
  if (!pricing) return <ErrorState title="Pricing unavailable" onRetry={() => void onChanged()} />;
  const preview = editable && dirty ? quotationPricingPreview(pricing.expected_cost, form) : pricing;
  function submit() {
    const parsed = customerQuotePricingSchema.safeParse({ customer_quote_id: quoteId, billing_type: form.billing_type, values: { ...form, markup_value: form.markup_type === "none" ? 0 : form.markup_value, tcs_rate: form.tcs_applicable ? form.tcs_rate : null } });
    if (!parsed.success) { setErrors(quoteFieldErrors(parsed.error.issues.map(issue => ({ ...issue, path: issue.path[0] === "values" ? issue.path.slice(1) : issue.path })))); return; }
    setErrors({}); save.mutate();
  }
  return <section className="space-y-4 border-t border-border pt-5">
    <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-semibold">Pricing</h3>{editable ? <Button size="sm" onClick={submit} disabled={!dirty || save.isPending || !preview}>{save.isPending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}Save pricing</Button> : null}</div>
    <fieldset disabled={!editable || save.isPending} className="grid gap-4 sm:grid-cols-2">
      <Field label="Billing type" htmlFor={`cq-billing-${quoteId}`}><Select value={form.billing_type} onValueChange={value => update({ billing_type: value as BillingType })}><SelectTrigger id={`cq-billing-${quoteId}`}><SelectValue /></SelectTrigger><SelectContent>{BILLING_TYPES.map(type => <SelectItem key={type} value={type}>{BILLING_TYPE_LABELS[type]}</SelectItem>)}</SelectContent></Select></Field>
      <Field label="Markup type" htmlFor={`cq-markup-${quoteId}`}><Select value={form.markup_type} onValueChange={value => update({ markup_type: value as MarkupType })}><SelectTrigger id={`cq-markup-${quoteId}`}><SelectValue /></SelectTrigger><SelectContent>{MARKUP_TYPES.map(type => <SelectItem key={type} value={type}>{MARKUP_TYPE_LABELS[type]}</SelectItem>)}</SelectContent></Select></Field>
      <Field label={form.markup_type === "percentage" ? "Markup %" : "Markup INR"} htmlFor={`cq-value-${quoteId}`} error={errors["markup_value"]}><Input id={`cq-value-${quoteId}`} type="number" min="0" step="0.01" disabled={form.markup_type === "none"} value={form.markup_type === "none" ? "0" : form.markup_value} onChange={event => update({ markup_value: event.target.value })} /></Field>
      <Field label="Discount INR" htmlFor={`cq-discount-${quoteId}`} error={errors["discount_amount"]}><Input id={`cq-discount-${quoteId}`} type="number" min="0" step="0.01" value={form.discount_amount} onChange={event => update({ discount_amount: event.target.value })} /></Field>
      <div className="flex items-center justify-between gap-3"><label htmlFor={`cq-tcs-${quoteId}`} className="text-sm font-medium">TCS applicable</label><Switch id={`cq-tcs-${quoteId}`} checked={form.tcs_applicable} onCheckedChange={checked => update({ tcs_applicable: checked })} /></div>
      <Field label="TCS rate %" htmlFor={`cq-rate-${quoteId}`} error={errors["tcs_rate"]}><Input id={`cq-rate-${quoteId}`} type="number" min="0" max="100" step="0.01" disabled={!form.tcs_applicable} value={form.tcs_rate} onChange={event => update({ tcs_rate: event.target.value })} /></Field>
    </fieldset>
    {dirty && editable ? <p className="text-xs text-muted-foreground">Unsaved preview</p> : null}
    {preview ? <dl className="divide-y divide-border">
      {([ ["Expected cost", preview.expected_cost], ["Selling value", preview.selling_value], ["GST", preview.gst_amount], ["TCS", preview.tcs_amount], ["Customer payable", preview.customer_payable], ["Expected profit", preview.expected_gross_profit] ] as const).map(([label, value]) => <div key={label} className="flex items-baseline justify-between gap-4 py-2.5"><dt className="text-xs text-muted-foreground">{label}</dt><dd className="text-sm font-semibold tabular-nums">{formatMoney(value)}</dd></div>)}
      <div className="flex justify-between gap-4 py-2.5"><dt className="text-xs text-muted-foreground">Margin</dt><dd className="text-sm font-semibold tabular-nums">{quotationMargin(preview.expected_gross_profit, preview.selling_value)}</dd></div>
    </dl> : <p className="text-sm text-destructive">Enter valid pricing; discount cannot exceed selling value.</p>}
  </section>;
}