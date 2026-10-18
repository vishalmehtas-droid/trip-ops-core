import { useState } from "react";
import { Field } from "./master-data";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatEntryInr, lineEntryTotal } from "@/lib/quote-entry-preview";

const currencies = ["INR", "USD", "EUR", "AED", "THB", "SGD"];

export function QuoteCurrencyField({ id, value, onChange, disabled = false, error }: {
  id: string; value: string; onChange: (value: string) => void; disabled?: boolean; error?: string | undefined;
}) {
  const [other, setOther] = useState(!currencies.includes(value));
  return <Field label="Currency" htmlFor={id} error={error}>
    <Select value={other ? "other" : value} disabled={disabled} onValueChange={(next) => {
      setOther(next === "other");
      onChange(next === "other" ? "" : next);
    }}>
      <SelectTrigger id={id}><SelectValue /></SelectTrigger>
      <SelectContent>{currencies.map((code) => <SelectItem key={code} value={code}>{code}</SelectItem>)}<SelectItem value="other">Other</SelectItem></SelectContent>
    </Select>
    {other ? <Input aria-label="Other currency code" className="mt-2" placeholder="3-letter code" maxLength={3} value={value} disabled={disabled} onChange={(event) => onChange(event.target.value.toUpperCase())} /> : null}
  </Field>;
}

export function QuoteLinePreview({ quantity, currency, amount, rate }: { quantity: string; currency: string; amount: string; rate: string }) {
  const total = lineEntryTotal(quantity, amount, rate);
  return <p aria-live="polite" className="break-words text-sm font-medium tabular-nums">{quantity || "—"} x {currency || "—"} {amount || "—"} x {rate || "—"} = {total === null ? "—" : formatEntryInr(total)}</p>;
}