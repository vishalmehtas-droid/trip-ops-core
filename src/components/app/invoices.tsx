import { useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { FileText, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { amountInWords } from "@/lib/invoice-helpers";
import { issueInvoice, listInvoices, type InvoiceSnapshot } from "@/lib/invoices.functions";
import { toPaise } from "@/lib/money";
import { formatMoney } from "@/lib/sale-costing-schemas";
import { formatDate } from "@/components/app/master-data";

export function InvoiceStatusBadge({ status }: { status: "issued" | "cancelled" }) {
  return status === "issued" ? (
    <Badge variant="outline" className="border-primary/40 text-[10px] uppercase text-primary">
      Issued
    </Badge>
  ) : (
    <Badge variant="outline" className="text-[10px] uppercase text-muted-foreground">
      Cancelled
    </Badge>
  );
}

/** Booking page action: issue an invoice or open the active one. */
export function BookingInvoiceAction({ saleId, cancelled }: { saleId: string; cancelled: boolean }) {
  const { hasAnyRole } = useAuth();
  const canRead = hasAnyRole(["admin", "accounts", "sales"]);
  const canIssue = hasAnyRole(["admin", "accounts"]);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const list = useServerFn(listInvoices);
  const issue = useServerFn(issueInvoice);

  const invoices = useQuery({
    queryKey: ["invoices", { saleId }],
    queryFn: () => list({ data: { saleId } }),
    enabled: canRead,
  });
  const readiness = useQuery({
    queryKey: ["invoice-readiness", saleId],
    enabled: canIssue,
    queryFn: async () => {
      const [pricing, company] = await Promise.all([
        supabase.from("sale_pricing").select("customer_payable").eq("sale_id", saleId).maybeSingle(),
        supabase.from("company_settings").select("legal_name, gstin, address, state").maybeSingle(),
      ]);
      const c = company.data;
      return {
        hasPayable: toPaise(String(pricing.data?.customer_payable ?? "0")) > 0n,
        companyReady: Boolean(c?.legal_name && c.gstin && c.address && c.state),
      };
    },
  });

  const mutation = useMutation({
    mutationFn: () => issue({ data: { saleId } }),
    onSuccess: async ({ id }) => {
      toast.success("Invoice issued");
      await queryClient.invalidateQueries({ queryKey: ["invoices"] });
      void queryClient.invalidateQueries({ queryKey: ["audit-log"] });
      void navigate({ to: "/invoices/$invoiceId", params: { invoiceId: id } });
    },
    onError: (error: Error) => toast.error("Could not issue the invoice", { description: error.message }),
  });

  if (!canRead) return null;
  const active = invoices.data?.find((row) => row.status === "issued");
  if (active) {
    return (
      <Button variant="outline" size="sm" asChild>
        <Link to="/invoices/$invoiceId" params={{ invoiceId: active.id }}>
          <FileText className="size-3.5" />
          Invoice {active.invoice_number}
        </Link>
      </Button>
    );
  }
  if (!canIssue) return null;

  let reason: string | null = null;
  if (cancelled) reason = "Cancelled bookings cannot be invoiced.";
  else if (readiness.data && !readiness.data.hasPayable) reason = "Set the booking's customer payable first.";
  else if (readiness.data && !readiness.data.companyReady)
    reason = "Complete company settings (legal name, GSTIN, address, state) first.";

  return (
    <div className="flex flex-col items-end gap-0.5">
      <Button
        size="sm"
        variant="outline"
        disabled={Boolean(reason) || !readiness.data || invoices.isLoading || mutation.isPending}
        onClick={() => mutation.mutate()}
      >
        {mutation.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <FileText className="size-3.5" />}
        Issue invoice
      </Button>
      {reason ? <span className="text-[11px] text-muted-foreground">{reason}</span> : null}
    </div>
  );
}

function travellers(s: InvoiceSnapshot) {
  if (s.adults === null && s.children === null) return null;
  const parts = [`${s.adults ?? 0} adult${s.adults === 1 ? "" : "s"}`];
  if (s.children) parts.push(`${s.children} child${s.children === 1 ? "" : "ren"}`);
  return parts.join(", ");
}

/** Customer-facing A4 invoice. Contains only snapshot data — never vendors or costs. */
export function InvoiceDocument({
  invoiceNumber,
  invoiceDate,
  status,
  snapshot: s,
  logoUrl,
}: {
  invoiceNumber: string;
  invoiceDate: string;
  status: "issued" | "cancelled";
  snapshot: InvoiceSnapshot;
  logoUrl: string | null;
}) {
  const intra = s.tax_mode === "cgst_sgst";
  const half = (Number(s.gst_rate) / 2).toString();
  const travel = [s.travel_start ? formatDate(s.travel_start) : null, s.travel_end ? formatDate(s.travel_end) : null]
    .filter(Boolean)
    .join(" – ");
  const hasTcs = toPaise(s.tcs_amount) > 0n;

  return (
    <article className="invoice-a4 mx-auto max-w-[210mm] space-y-5 rounded-lg border border-border bg-surface p-8 text-sm text-foreground shadow-panel print:border-0 print:p-0 print:shadow-none">
      <header className="flex items-start justify-between gap-6 border-b border-border pb-4">
        <div className="flex items-start gap-3">
          {logoUrl ? <img src={logoUrl} alt="" className="h-14 w-auto object-contain" /> : null}
          <div>
            <div className="text-base font-bold">{s.company.trade_name ?? s.company.legal_name}</div>
            {s.company.trade_name ? <div className="text-xs">{s.company.legal_name}</div> : null}
            <div className="whitespace-pre-line text-xs text-muted-foreground">{s.company.address}</div>
            <div className="text-xs text-muted-foreground">
              {[s.company.state, s.company.phone, s.company.email].filter(Boolean).join(" · ")}
            </div>
            <div className="text-xs font-semibold">GSTIN: {s.company.gstin}</div>
          </div>
        </div>
        <div className="text-right">
          <div className="text-lg font-bold uppercase tracking-wide">Tax Invoice</div>
          <div className="font-mono text-xs">{invoiceNumber}</div>
          <div className="text-xs text-muted-foreground">Date: {formatDate(invoiceDate)}</div>
          {status === "cancelled" ? (
            <div className="mt-1 text-xs font-bold uppercase text-destructive">Cancelled</div>
          ) : null}
        </div>
      </header>

      <section className="grid grid-cols-2 gap-6">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Bill to</div>
          <div className="font-semibold">{s.client.name}</div>
          {s.client.address ? <div className="whitespace-pre-line text-xs">{s.client.address}</div> : null}
          {s.client.gstin ? <div className="text-xs">GSTIN: {s.client.gstin}</div> : null}
          <div className="text-xs">
            Place of supply: {s.place_of_supply ?? <span className="text-destructive">not set</span>}
          </div>
        </div>
        <div className="text-xs">
          <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Booking</div>
          <div>Booking: {s.booking_number}</div>
          {s.destination ? <div>Destination: {s.destination}</div> : null}
          {travel ? <div>Travel: {travel}</div> : null}
          {travellers(s) ? <div>Travellers: {travellers(s)}</div> : null}
        </div>
      </section>

      <table className="w-full border-collapse text-xs">
        <thead>
          <tr className="border-y border-border text-left">
            <th className="py-2 pr-2">#</th>
            <th className="py-2 pr-2">Description</th>
            <th className="py-2 text-right">Taxable value</th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-b border-border">
            <td className="py-2 pr-2">1</td>
            <td className="py-2 pr-2">{s.description}</td>
            <td className="py-2 text-right tabular-nums">{formatMoney(s.taxable_value)}</td>
          </tr>
        </tbody>
      </table>

      <section className="ml-auto w-full max-w-xs space-y-1 text-xs tabular-nums">
        <Line label="Taxable value" value={s.taxable_value} />
        {intra ? (
          <>
            <Line label={`CGST @ ${half}%`} value={s.cgst} />
            <Line label={`SGST @ ${half}%`} value={s.sgst} />
          </>
        ) : (
          <Line label={`IGST @ ${Number(s.gst_rate)}%`} value={s.igst} />
        )}
        {hasTcs ? <Line label={`TCS${s.tcs_rate ? ` @ ${Number(s.tcs_rate)}%` : ""}`} value={s.tcs_amount} /> : null}
        <div className="border-t border-border pt-1">
          <Line label="Total payable" value={s.total_payable} strong />
        </div>
        <Line label="Received to date" value={s.amount_received} />
        <Line label="Balance due" value={s.balance_due} strong />
      </section>

      <p className="text-xs">
        <span className="font-semibold">Amount in words: </span>
        {amountInWords(s.total_payable)}
      </p>

      {s.company.bank_name || s.company.upi_id ? (
        <section className="rounded border border-border p-3 text-xs">
          <div className="mb-1 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            Payment details
          </div>
          {s.company.bank_name ? <div>Bank: {s.company.bank_name}</div> : null}
          {s.company.bank_account_name ? <div>Account name: {s.company.bank_account_name}</div> : null}
          {s.company.bank_account_number ? <div>Account no.: {s.company.bank_account_number}</div> : null}
          {s.company.bank_ifsc ? <div>IFSC: {s.company.bank_ifsc}</div> : null}
          {s.company.upi_id ? <div>UPI: {s.company.upi_id}</div> : null}
        </section>
      ) : null}

      <footer className="border-t border-border pt-3 text-center text-[11px] text-muted-foreground">
        This is a computer generated invoice.
      </footer>
    </article>
  );
}

function Line({ label, value, strong }: { label: string; value: string; strong?: boolean | undefined }) {
  return (
    <div className={`flex justify-between ${strong ? "font-semibold" : ""}`}>
      <span>{label}</span>
      <span>{formatMoney(value)}</span>
    </div>
  );
}
