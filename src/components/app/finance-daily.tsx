import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { AccountSelect, accountLabel } from "@/components/app/account-select";
import { Field } from "@/components/app/master-data";
import { SummaryStat, todayIso } from "@/components/app/payments";
import { RecordCombobox, type RecordOption } from "@/components/app/sales-ui";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/app/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { DEFAULT_CATEGORIES, otherTxnInputSchema } from "@/lib/account-schemas";
import {
  createOtherTransaction,
  getDayEntries,
  listCategories,
  type MoneyEntry,
} from "@/lib/accounts.functions";
import { isMoneyString, toPaise } from "@/lib/money";
import { PAYMENT_METHODS, PAYMENT_METHOD_LABELS, type PaymentMethod } from "@/lib/payment-schemas";
import { listOpenPurchases, saveVendorPayment } from "@/lib/payments.functions";
import { quoteFieldErrors } from "@/lib/quotation-display";
import { createReceipt } from "@/lib/receipts.functions";
import { formatMoney } from "@/lib/sale-costing-schemas";
import { cn } from "@/lib/utils";

type Tab = "paid" | "received" | "other" | "transfer";

type EntryForm = {
  date: string;
  account_id: string;
  to_account_id: string;
  amount_inr: string;
  party_id: string;
  sale_id: string;
  purchase_id: string;
  method: PaymentMethod | "";
  reference: string;
  notes: string;
  other_type: "expense" | "income";
  category: string;
  party: string;
};

function emptyEntry(keep?: Partial<EntryForm>): EntryForm {
  return {
    date: todayIso(),
    account_id: "",
    to_account_id: "",
    amount_inr: "",
    party_id: "",
    sale_id: "",
    purchase_id: "",
    method: "",
    reference: "",
    notes: "",
    other_type: "expense",
    category: "",
    party: "",
    ...keep,
  };
}

function useParties(table: "vendors" | "clients", enabled: boolean) {
  return useQuery({
    queryKey: [table, "daily-entry-options"],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase
        .from(table)
        .select("id, name, phone")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return (data ?? []) as { id: string; name: string; phone: string | null }[];
    },
  });
}

function useClientBookings(enabled: boolean) {
  return useQuery({
    queryKey: ["sales", "daily-entry-options"],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales")
        .select("id, booking_number, status, client_id, client:clients(name)")
        .neq("status", "cancelled")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as {
        id: string;
        booking_number: string;
        status: string;
        client_id: string;
        client: { name: string } | null;
      }[];
    },
  });
}

const KIND_LABEL: Record<MoneyEntry["kind"], string> = {
  payment: "Paid",
  receipt: "Received",
  other: "Other",
};

export function DailyEntry() {
  const { hasPermission, isAdmin } = useAuth();
  const full = isAdmin || hasPermission("accounts.manage");
  const canPaid = full || hasPermission("payments.manage") || hasPermission("payments.enter");
  const canReceived =
    full || hasPermission("receipts.manage") || hasPermission("receipts.enter_own");
  const tabs: Tab[] = [
    ...(canPaid ? (["paid"] as Tab[]) : []),
    ...(canReceived ? (["received"] as Tab[]) : []),
    ...(full ? (["other", "transfer"] as Tab[]) : []),
  ];
  const [tab, setTab] = useState<Tab>(tabs[0] ?? "paid");
  const [day, setDay] = useState(todayIso());

  const dayFn = useServerFn(getDayEntries);
  const entries = useQuery({
    queryKey: ["money-log", "day", day],
    enabled: tabs.length > 0,
    queryFn: () => dayFn({ data: { date: day } }),
  });

  if (tabs.length === 0) return null;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="rounded-lg border border-border bg-surface p-4">
        <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
          <TabsList className="grid w-full" style={{ gridTemplateColumns: `repeat(${tabs.length}, 1fr)` }}>
            {tabs.includes("paid") ? <TabsTrigger value="paid">Paid</TabsTrigger> : null}
            {tabs.includes("received") ? <TabsTrigger value="received">Received</TabsTrigger> : null}
            {tabs.includes("other") ? <TabsTrigger value="other">Expense / Income</TabsTrigger> : null}
            {tabs.includes("transfer") ? <TabsTrigger value="transfer">Transfer</TabsTrigger> : null}
          </TabsList>
          {tabs.map((t) => (
            <TabsContent key={t} value={t} className="mt-4">
              <EntryFormPanel tab={t} />
            </TabsContent>
          ))}
        </Tabs>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">
            {day === todayIso() ? "Today's entries" : "Entries on this day"}
          </h2>
          <Input
            type="date"
            className="w-[150px]"
            aria-label="Entries date"
            value={day}
            onChange={(e) => setDay(e.target.value || todayIso())}
          />
        </div>
        {entries.isPending ? (
          <TableSkeleton rows={3} />
        ) : entries.isError ? (
          <ErrorState description={entries.error.message} onRetry={() => entries.refetch()} />
        ) : entries.data.entries.length === 0 ? (
          <EmptyState title="No entries yet" description="Entries saved for this day appear here." />
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
            {entries.data.entries.map((e) => (
              <li key={`${e.kind}-${e.id}`} className="flex items-start justify-between gap-3 p-3">
                <div className="min-w-0">
                  <div className="text-xs text-muted-foreground">
                    {KIND_LABEL[e.kind]} · <span className="font-mono">{e.number}</span>
                  </div>
                  <div className="truncate text-sm font-medium">{e.label}</div>
                  {e.sale_id && e.booking_number ? (
                    <Link
                      to="/sales/$saleId"
                      params={{ saleId: e.sale_id }}
                      className="font-mono text-xs text-primary underline-offset-2 hover:underline"
                    >
                      {e.booking_number}
                    </Link>
                  ) : e.detail ? (
                    <div className="truncate text-xs text-muted-foreground">{e.detail}</div>
                  ) : null}
                </div>
                <div
                  className={cn(
                    "shrink-0 text-right text-sm font-semibold tabular-nums",
                    e.kind === "other" && e.to_account_id
                      ? ""
                      : toPaise(e.amount) < 0n
                        ? "text-destructive"
                        : "text-success",
                  )}
                >
                  {e.kind === "other" && e.to_account_id
                    ? formatMoney(e.amount.replace("-", ""))
                    : formatMoney(e.amount)}
                </div>
              </li>
            ))}
          </ul>
        )}
        {entries.data?.balances ? (
          <div>
            <h2 className="mb-2 text-sm font-semibold">Account balances</h2>
            {entries.data.balances.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No active accounts yet. Add one under Finance → Accounts.
              </p>
            ) : null}
            <div className="grid gap-2 sm:grid-cols-2">
              {entries.data.balances.map((a) => (
                <div key={a.id}>
                  <SummaryStat label={accountLabel(a)} value={formatMoney(a.balance)} />
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function EntryFormPanel({ tab }: { tab: Tab }) {
  const queryClient = useQueryClient();
  const payFn = useServerFn(saveVendorPayment);
  const receiptFn = useServerFn(createReceipt);
  const otherFn = useServerFn(createOtherTransaction);
  const openFn = useServerFn(listOpenPurchases);
  const categoriesFn = useServerFn(listCategories);
  const [form, setForm] = useState<EntryForm>(emptyEntry());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = (patch: Partial<EntryForm>) => setForm((f) => ({ ...f, ...patch }));

  const vendors = useParties("vendors", tab === "paid");
  const clients = useParties("clients", tab === "received");
  const bookings = useClientBookings(tab === "paid" || tab === "received");
  const categories = useQuery({
    queryKey: ["money-log", "categories"],
    enabled: tab === "other",
    queryFn: () => categoriesFn(),
  });
  const purchases = useQuery({
    queryKey: ["vendor-payments", "open-purchases", form.party_id, form.sale_id, null],
    enabled: tab === "paid" && Boolean(form.party_id),
    queryFn: () =>
      openFn({ data: { vendor_id: form.party_id, sale_id: form.sale_id || null, payment_id: null } }),
  });

  const partyOptions: RecordOption[] = useMemo(
    () =>
      ((tab === "paid" ? vendors.data : clients.data) ?? []).map((r) => ({
        id: r.id,
        label: r.name,
        hint: r.phone,
      })),
    [tab, vendors.data, clients.data],
  );
  const bookingOptions: RecordOption[] = useMemo(
    () =>
      (bookings.data ?? [])
        .filter((b) => tab !== "received" || !form.party_id || b.client_id === form.party_id)
        .map((b) => ({
          id: b.id,
          label: `${b.booking_number} · ${b.client?.name ?? "—"}`,
          hint: b.status,
        })),
    [bookings.data, tab, form.party_id],
  );
  const purchaseOptions: RecordOption[] = (purchases.data ?? []).map((p) => ({
    id: p.id,
    label: `${p.purchase_number} · ${p.booking_number ?? "—"}`,
    hint: `Outstanding ${formatMoney(p.outstanding)}`,
  }));
  const categoryList = Array.from(new Set([...DEFAULT_CATEGORIES, ...(categories.data ?? [])]));

  const save = useMutation({
    mutationFn: async () => {
      if (tab === "paid") {
        const purchase = (purchases.data ?? []).find((p) => p.id === form.purchase_id);
        const amount = form.amount_inr.trim();
        const allocate =
          purchase && toPaise(purchase.outstanding) < toPaise(amount) ? purchase.outstanding : amount;
        const r = await payFn({
          data: {
            id: null,
            values: {
              vendor_id: form.party_id,
              sale_id: form.sale_id || (purchase ? purchase.sale_id : null),
              account_id: form.account_id,
              payment_type: purchase
                ? toPaise(amount) >= toPaise(purchase.outstanding)
                  ? "final"
                  : "part"
                : "advance",
              payment_date: form.date,
              amount_inr: amount,
              method: form.method as PaymentMethod,
              reference: form.reference,
              notes: form.notes,
            },
            allocations: purchase ? [{ purchase_id: purchase.id, amount_inr: allocate }] : [],
          },
        });
        return r.payment_number;
      }
      if (tab === "received") {
        const r = await receiptFn({
          data: {
            sale_id: form.sale_id || null,
            client_id: form.party_id || null,
            values: {
              account_id: form.account_id,
              payment_type: form.sale_id ? "part" : "advance",
              receipt_date: form.date,
              amount_inr: form.amount_inr.trim(),
              method: form.method as PaymentMethod,
              reference: form.reference,
              notes: form.notes,
            },
          },
        });
        return (r as { receipt_number: string }).receipt_number;
      }
      const r = await otherFn({
        data: {
          txn_type: tab === "transfer" ? "transfer" : form.other_type,
          txn_date: form.date,
          amount_inr: form.amount_inr.trim(),
          account_id: form.account_id,
          to_account_id: tab === "transfer" ? form.to_account_id : null,
          category: tab === "transfer" ? null : form.category,
          party: form.party,
          notes: form.notes,
          reference: form.reference,
        },
      });
      return (r as { entry_number: string }).entry_number;
    },
    onError: (e: Error) => toast.error("Request rejected", { description: e.message }),
  });

  function validate() {
    const next: Record<string, string> = {};
    if (!isMoneyString(form.amount_inr) || toPaise(form.amount_inr) <= 0n)
      next["amount_inr"] = "Enter an amount with at most 2 decimals";
    if (!form.account_id) next["account_id"] = "Select an account";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(form.date)) next["date"] = "Enter a valid date";
    if (tab === "paid" || tab === "received") {
      if (!form.method) next["method"] = "Select a method";
    }
    if (tab === "paid" && !form.party_id) next["party_id"] = "Select a vendor";
    if (tab === "received" && !form.party_id && !form.sale_id)
      next["party_id"] = "Select a client or a booking";
    if (tab === "other" || tab === "transfer") {
      const parsed = otherTxnInputSchema.safeParse({
        txn_type: tab === "transfer" ? "transfer" : form.other_type,
        txn_date: form.date,
        amount_inr: form.amount_inr,
        account_id: form.account_id,
        to_account_id: form.to_account_id,
        category: form.category,
        party: form.party,
        notes: form.notes,
        reference: form.reference,
      });
      if (!parsed.success) Object.assign(next, quoteFieldErrors(parsed.error.issues));
    }
    if (form.reference.trim().length > 200) next["reference"] = "Reference is too long";
    return next;
  }

  async function submit(addAnother: boolean) {
    const next = validate();
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    const number = await save.mutateAsync().catch(() => null);
    if (!number) return;
    toast.success(`${number} saved`);
    for (const k of ["money-log", "vendor-payments", "receipts", "purchases", "accounts", "advances"]) {
      await queryClient.invalidateQueries({ queryKey: [k] });
    }
    setForm(
      addAnother
        ? emptyEntry({
            date: form.date,
            account_id: form.account_id,
            method: form.method,
            other_type: form.other_type,
            to_account_id: form.to_account_id,
            ...(tab === "paid" ? { party_id: form.party_id } : {}),
          })
        : emptyEntry({ account_id: form.account_id }),
    );
  }

  return (
    <div className="grid gap-4">
      {tab === "other" ? (
        <Field label="Type" htmlFor="entry-other-type">
          <Select value={form.other_type} onValueChange={(v) => set({ other_type: v as "expense" | "income" })}>
            <SelectTrigger id="entry-other-type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="expense">Expense</SelectItem>
              <SelectItem value="income">Other income</SelectItem>
            </SelectContent>
          </Select>
        </Field>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Date" htmlFor={`entry-${tab}-date`} error={errors["date"]}>
          <Input
            id={`entry-${tab}-date`}
            type="date"
            value={form.date}
            onChange={(e) => set({ date: e.target.value })}
          />
        </Field>
        <Field label="Amount (INR)" htmlFor={`entry-${tab}-amount`} required error={errors["amount_inr"]}>
          <Input
            id={`entry-${tab}-amount`}
            inputMode="decimal"
            value={form.amount_inr}
            onChange={(e) => set({ amount_inr: e.target.value })}
          />
        </Field>
        <Field
          label={tab === "transfer" ? "From account" : tab === "received" || (tab === "other" && form.other_type === "income") ? "Into account" : "From account"}
          htmlFor={`entry-${tab}-account`}
          required
          error={errors["account_id"]}
        >
          <AccountSelect
            id={`entry-${tab}-account`}
            value={form.account_id}
            onChange={(v) => set({ account_id: v })}
          />
        </Field>
        {tab === "transfer" ? (
          <Field label="To account" htmlFor="entry-transfer-to" required error={errors["to_account_id"]}>
            <AccountSelect
              id="entry-transfer-to"
              value={form.to_account_id}
              onChange={(v) => set({ to_account_id: v })}
              exclude={form.account_id}
              autoDefault={false}
            />
          </Field>
        ) : null}
        {tab === "paid" || tab === "received" ? (
          <Field label="Method" htmlFor={`entry-${tab}-method`} required error={errors["method"]}>
            <Select value={form.method} onValueChange={(v) => set({ method: v as PaymentMethod })}>
              <SelectTrigger id={`entry-${tab}-method`}>
                <SelectValue placeholder="Select" />
              </SelectTrigger>
              <SelectContent>
                {PAYMENT_METHODS.map((m) => (
                  <SelectItem key={m} value={m}>
                    {PAYMENT_METHOD_LABELS[m]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        ) : null}
      </div>

      {tab === "paid" || tab === "received" ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label={tab === "paid" ? "Vendor" : "Client"}
            htmlFor={`entry-${tab}-party`}
            required={tab === "paid"}
            error={errors["party_id"]}
          >
            <RecordCombobox
              id={`entry-${tab}-party`}
              options={partyOptions}
              value={form.party_id}
              onChange={(v) => set({ party_id: v, sale_id: "", purchase_id: "" })}
              placeholder={tab === "paid" ? "Select a vendor" : "Select a client"}
              searchPlaceholder="Search"
              emptyText="Nothing found"
              allowClear
            />
          </Field>
          <Field label="Booking (optional)" htmlFor={`entry-${tab}-booking`}>
            <RecordCombobox
              id={`entry-${tab}-booking`}
              options={bookingOptions}
              value={form.sale_id}
              onChange={(v) => {
                const b = (bookings.data ?? []).find((row) => row.id === v);
                set({
                  sale_id: v,
                  purchase_id: "",
                  ...(tab === "received" && b ? { party_id: b.client_id } : {}),
                });
              }}
              placeholder="Not linked — saved as an advance"
              searchPlaceholder="Search booking number or client"
              emptyText="No open bookings"
              allowClear
            />
          </Field>
          {tab === "paid" && form.party_id ? (
            <Field label="Purchase (optional)" htmlFor="entry-paid-purchase">
              <RecordCombobox
                id="entry-paid-purchase"
                options={purchaseOptions}
                value={form.purchase_id}
                onChange={(v) => set({ purchase_id: v })}
                placeholder="Not linked — saved as an advance"
                searchPlaceholder="Search purchase"
                emptyText="No unpaid purchases for this vendor"
                allowClear
              />
            </Field>
          ) : null}
        </div>
      ) : null}

      {tab === "other" ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Category" htmlFor="entry-category" error={errors["category"]}>
            <Input
              id="entry-category"
              list="entry-category-options"
              value={form.category}
              onChange={(e) => set({ category: e.target.value })}
            />
            <datalist id="entry-category-options">
              {categoryList.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </Field>
          <Field label="Party" htmlFor="entry-party" error={errors["party"]}>
            <Input id="entry-party" value={form.party} onChange={(e) => set({ party: e.target.value })} />
          </Field>
        </div>
      ) : null}

      <Field label="Reference" htmlFor={`entry-${tab}-reference`} error={errors["reference"]}>
        <Input
          id={`entry-${tab}-reference`}
          placeholder="UTR or cheque number"
          value={form.reference}
          onChange={(e) => set({ reference: e.target.value })}
        />
      </Field>
      <Field label="Notes" htmlFor={`entry-${tab}-notes`} error={errors["notes"]}>
        <Textarea
          id={`entry-${tab}-notes`}
          rows={2}
          value={form.notes}
          onChange={(e) => set({ notes: e.target.value })}
        />
      </Field>
      <div className="sticky bottom-0 -mx-4 flex flex-col gap-2 border-t border-border bg-surface px-4 py-3 sm:flex-row sm:justify-end">
        <Button variant="outline" onClick={() => submit(true)} disabled={save.isPending}>
          Save and add another
        </Button>
        <Button onClick={() => submit(false)} disabled={save.isPending}>
          {save.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
          Save
        </Button>
      </div>
    </div>
  );
}
