import { createServerFn } from "@tanstack/react-start";

import { requireActiveUser, requirePermission, type AuthorizedContext } from "./authz-middleware";
import {
  accountSaveSchema,
  advancesSchema,
  clearedSchema,
  clientIdSchema,
  dayEntriesSchema,
  otherTxnInputSchema,
  receiptLinkSchema,
  statementSchema,
  UNASSIGNED_ACCOUNT_ID,
  type AccountType,
  type OtherType,
} from "./account-schemas";
import { cancelSchema } from "./payment-schemas";
import { fromPaise, toPaise } from "./money";

/**
 * Accounts master, daily money log and account statements. Balances are
 * aggregated here in exact paise from text-cast numerics; numbers, creators,
 * account checks and allocation caps are enforced by database triggers.
 */

type Ctx = AuthorizedContext & { supabase: any }; // eslint-disable-line @typescript-eslint/no-explicit-any

export type AccountRow = {
  id: string;
  name: string;
  account_type: AccountType;
  last4: string | null;
  opening_balance: string;
  opening_balance_date: string;
  is_active: boolean;
  balance: string;
};

export type MoneyEntry = {
  kind: "payment" | "receipt" | "other";
  id: string;
  number: string;
  date: string;
  created_at: string;
  label: string;
  detail: string | null;
  account_id: string;
  /** Signed effect on this row's account (positive = money in). */
  amount: string;
  /** For transfers: the counter account and its effect. */
  to_account_id: string | null;
  sale_id: string | null;
  booking_number: string | null;
  cleared: boolean;
  created_by: string;
  method: string | null;
  reference: string | null;
};

const PAY_COLS =
  "id, payment_number, payment_date, created_at, amount_inr::text, account_id, sale_id, method, reference, notes, cleared, created_by, vendor:vendors(name), sale:sales(booking_number), allocations:vendor_payment_allocations(purchase:purchases(purchase_number, sale_id, sale:sales(booking_number)))";
const REC_COLS =
  "id, receipt_number, receipt_date, created_at, amount_inr::text, account_id, sale_id, method, reference, notes, cleared, created_by, client:clients(name), sale:sales(booking_number), allocations:customer_receipt_allocations(sale_id, sale:sales(booking_number))";
const OT_COLS =
  "id, entry_number, txn_type, txn_date, created_at, amount_inr::text, account_id, to_account_id, category, party, notes, reference, cleared, created_by";

function payEntry(r: any): MoneyEntry {
  // eslint-disable-line @typescript-eslint/no-explicit-any
  const firstAlloc = r.allocations?.[0]?.purchase;
  const saleId = r.sale_id ?? firstAlloc?.sale_id ?? null;
  const booking = r.sale?.booking_number ?? firstAlloc?.sale?.booking_number ?? null;
  return {
    kind: "payment",
    id: r.id,
    number: r.payment_number,
    date: r.payment_date,
    created_at: r.created_at,
    label: `Paid · ${r.vendor?.name ?? "Vendor"}`,
    detail: firstAlloc ? `${firstAlloc.purchase_number}${r.allocations.length > 1 ? " +more" : ""}` : r.notes,
    account_id: r.account_id,
    amount: fromPaise(-toPaise(r.amount_inr)),
    to_account_id: null,
    sale_id: saleId,
    booking_number: booking,
    cleared: r.cleared,
    created_by: r.created_by,
    method: r.method,
    reference: r.reference,
  };
}

function recEntry(r: any): MoneyEntry {
  // eslint-disable-line @typescript-eslint/no-explicit-any
  const firstAlloc = r.allocations?.[0];
  return {
    kind: "receipt",
    id: r.id,
    number: r.receipt_number,
    date: r.receipt_date,
    created_at: r.created_at,
    label: `Received · ${r.client?.name ?? "Client"}`,
    detail: r.sale_id ? null : r.allocations?.length ? "Advance (linked)" : "Advance (unallocated)",
    account_id: r.account_id,
    amount: fromPaise(toPaise(r.amount_inr)),
    to_account_id: null,
    sale_id: r.sale_id ?? firstAlloc?.sale_id ?? null,
    booking_number: r.sale?.booking_number ?? firstAlloc?.sale?.booking_number ?? null,
    cleared: r.cleared,
    created_by: r.created_by,
    method: r.method,
    reference: r.reference,
  };
}

const OT_LABEL: Record<OtherType, string> = {
  expense: "Expense",
  income: "Other income",
  transfer: "Transfer",
};

function otEntry(r: any): MoneyEntry {
  // eslint-disable-line @typescript-eslint/no-explicit-any
  const amount = toPaise(r.amount_inr);
  return {
    kind: "other",
    id: r.id,
    number: r.entry_number,
    date: r.txn_date,
    created_at: r.created_at,
    label: `${OT_LABEL[r.txn_type as OtherType]}${r.category ? ` · ${r.category}` : ""}`,
    detail: [r.party, r.notes].filter(Boolean).join(" — ") || null,
    account_id: r.account_id,
    amount: fromPaise(r.txn_type === "income" ? amount : -amount),
    to_account_id: r.to_account_id,
    sale_id: null,
    booking_number: null,
    cleared: r.cleared,
    created_by: r.created_by,
    method: null,
    reference: r.reference,
  };
}

function sortEntries(rows: MoneyEntry[]) {
  return rows.sort((a, b) =>
    a.date === b.date ? a.created_at.localeCompare(b.created_at) : a.date.localeCompare(b.date),
  );
}

/** Net effect of all recorded entries per account, in paise. */
async function accountMovements(supabase: Ctx["supabase"]) {
  const [pays, recs, ots] = await Promise.all([
    supabase.from("vendor_payments").select("account_id, amount_inr::text").eq("status", "recorded"),
    supabase.from("customer_receipts").select("account_id, amount_inr::text").eq("status", "recorded"),
    supabase
      .from("other_transactions")
      .select("txn_type, account_id, to_account_id, amount_inr::text")
      .eq("status", "recorded"),
  ]);
  for (const r of [pays, recs, ots]) if (r.error) throw new Error(r.error.message);
  const net = new Map<string, bigint>();
  const add = (id: string, v: bigint) => net.set(id, (net.get(id) ?? 0n) + v);
  for (const p of pays.data ?? []) add(p.account_id, -toPaise(p.amount_inr));
  for (const r of recs.data ?? []) add(r.account_id, toPaise(r.amount_inr));
  for (const o of ots.data ?? []) {
    const amt = toPaise(o.amount_inr);
    if (o.txn_type === "income") add(o.account_id, amt);
    else add(o.account_id, -amt);
    if (o.txn_type === "transfer" && o.to_account_id) add(o.to_account_id, amt);
  }
  return net;
}

async function loadAccounts(ctx: Ctx, activeOnly: boolean): Promise<AccountRow[]> {
  let q = ctx.supabase
    .from("accounts")
    .select("id, name, account_type, last4, opening_balance::text, opening_balance_date, is_active")
    .order("name");
  if (activeOnly) q = q.eq("is_active", true);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  const net = await accountMovements(ctx.supabase);
  return ((data ?? []) as Omit<AccountRow, "balance">[]).map((a) => ({
    ...a,
    balance: fromPaise(toPaise(a.opening_balance) + (net.get(a.id) ?? 0n)),
  }));
}

export const listAccounts = createServerFn({ method: "POST" })
  .middleware([requireActiveUser])
  .handler(async ({ context }) => {
    requirePermission(context, "accounts.read");
    return loadAccounts(context as Ctx, false);
  });

export const saveAccount = createServerFn({ method: "POST" })
  .middleware([requireActiveUser])
  .inputValidator((input: unknown) => accountSaveSchema.parse(input))
  .handler(async ({ data, context }) => {
    requirePermission(context, "accounts.manage");
    if (data.id === UNASSIGNED_ACCOUNT_ID) throw new Error("The Unassigned account can't be changed");
    const v = data.values;
    const row = {
      name: v.name,
      account_type: v.account_type,
      last4: v.last4,
      // Credit cards: amount owed entered positive; the database stores it negative.
      opening_balance: v.opening_balance as unknown as number,
      opening_balance_date: v.opening_balance_date,
      is_active: v.is_active,
    };
    if (data.id) {
      const { error } = await context.supabase.from("accounts").update(row).eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: created, error } = await context.supabase
      .from("accounts")
      .insert(row)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return created;
  });

export const getAccountStatement = createServerFn({ method: "POST" })
  .middleware([requireActiveUser])
  .inputValidator((input: unknown) => statementSchema.parse(input))
  .handler(async ({ data, context }) => {
    requirePermission(context, "accounts.read");
    const { supabase } = context;
    const { data: account, error } = await supabase
      .from("accounts")
      .select("id, name, account_type, last4, opening_balance::text, opening_balance_date, is_active")
      .eq("id", data.account_id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!account) throw new Error("Account not found");
    const [pays, recs, outs, ins] = await Promise.all([
      supabase.from("vendor_payments").select(PAY_COLS).eq("status", "recorded").eq("account_id", data.account_id),
      supabase.from("customer_receipts").select(REC_COLS).eq("status", "recorded").eq("account_id", data.account_id),
      supabase.from("other_transactions").select(OT_COLS).eq("status", "recorded").eq("account_id", data.account_id),
      supabase.from("other_transactions").select(OT_COLS).eq("status", "recorded").eq("to_account_id", data.account_id),
    ]);
    for (const r of [pays, recs, outs, ins]) if (r.error) throw new Error(r.error.message);
    const names = new Map<string, string>();
    const { data: accs } = await supabase.from("accounts").select("id, name");
    for (const a of (accs ?? []) as { id: string; name: string }[]) names.set(a.id, a.name);

    const all: MoneyEntry[] = [
      ...(pays.data ?? []).map(payEntry),
      ...(recs.data ?? []).map(recEntry),
      ...(outs.data ?? []).map((r: any) => {
        // eslint-disable-line @typescript-eslint/no-explicit-any
        const e = otEntry(r);
        if (r.txn_type === "transfer") e.label = `Transfer to ${names.get(r.to_account_id) ?? "account"}`;
        return e;
      }),
      ...(ins.data ?? []).map((r: any) => {
        // eslint-disable-line @typescript-eslint/no-explicit-any
        const e = otEntry(r);
        e.amount = fromPaise(toPaise(r.amount_inr));
        e.label = `Transfer from ${names.get(r.account_id) ?? "account"}`;
        return e;
      }),
    ];
    sortEntries(all);
    let opening = toPaise(account.opening_balance);
    const rows: (MoneyEntry & { balance: string })[] = [];
    let running = 0n;
    let moneyIn = 0n;
    let moneyOut = 0n;
    for (const e of all) {
      const amt = toPaise(e.amount);
      if (data.from && e.date < data.from) {
        opening += amt;
        continue;
      }
      if (data.to && e.date > data.to) continue;
      if (rows.length === 0) running = opening;
      running += amt;
      if (amt >= 0n) moneyIn += amt;
      else moneyOut -= amt;
      rows.push({ ...e, balance: fromPaise(running) });
    }
    return {
      account,
      opening: fromPaise(opening),
      money_in: fromPaise(moneyIn),
      money_out: fromPaise(moneyOut),
      closing: fromPaise(rows.length ? running : opening),
      rows,
    };
  });

/** Entries for one day plus active account balances (balances only for Accounts/Admin). */
export const getDayEntries = createServerFn({ method: "POST" })
  .middleware([requireActiveUser])
  .inputValidator((input: unknown) => dayEntriesSchema.parse(input))
  .handler(async ({ data, context }) => {
    const ctx = context as Ctx;
    const full = ctx.isAdmin || ctx.permissions.includes("accounts.read");
    // Same rules as the entry tabs in finance-daily.tsx.
    const has = (p: string) => ctx.permissions.includes(p);
    const canPaid = full || has("payments.enter") || has("payments.manage");
    const canReceived = full || has("receipts.enter_own") || has("receipts.manage");
    if (!canPaid && !canReceived) throw new Error("Forbidden: no access to daily entries");
    const tasks: Promise<MoneyEntry[]>[] = [];
    if (canPaid) {
      let q = ctx.supabase
        .from("vendor_payments")
        .select(PAY_COLS)
        .eq("status", "recorded")
        .eq("payment_date", data.date);
      if (!full) q = q.eq("created_by", ctx.userId);
      tasks.push(
        q.then((r: any) => {
          // eslint-disable-line @typescript-eslint/no-explicit-any
          if (r.error) throw new Error(r.error.message);
          return (r.data ?? []).map(payEntry);
        }),
      );
    }
    if (canReceived) {
      let q = ctx.supabase
        .from("customer_receipts")
        .select(REC_COLS)
        .eq("status", "recorded")
        .eq("receipt_date", data.date);
      if (!full) q = q.eq("created_by", ctx.userId);
      tasks.push(
        q.then((r: any) => {
          // eslint-disable-line @typescript-eslint/no-explicit-any
          if (r.error) throw new Error(r.error.message);
          return (r.data ?? []).map(recEntry);
        }),
      );
    }
    if (full) {
      tasks.push(
        ctx.supabase
          .from("other_transactions")
          .select(OT_COLS)
          .eq("status", "recorded")
          .eq("txn_date", data.date)
          .then((r: any) => {
            // eslint-disable-line @typescript-eslint/no-explicit-any
            if (r.error) throw new Error(r.error.message);
            return (r.data ?? []).map(otEntry);
          }),
      );
    }
    const entries = sortEntries((await Promise.all(tasks)).flat());
    const balances = full ? await loadAccounts(ctx, true) : null;
    return { entries, balances, full };
  });

export const createOtherTransaction = createServerFn({ method: "POST" })
  .middleware([requireActiveUser])
  .inputValidator((input: unknown) => otherTxnInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    requirePermission(context, "accounts.manage");
    const { data: row, error } = await context.supabase
      .from("other_transactions")
      .insert({
        txn_type: data.txn_type,
        ...(data.txn_date ? { txn_date: data.txn_date } : {}),
        amount_inr: data.amount_inr as unknown as number,
        account_id: data.account_id,
        to_account_id: data.to_account_id,
        category: data.category,
        party: data.party,
        notes: data.notes,
        reference: data.reference,
      })
      .select("id, entry_number")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const cancelOtherTransaction = createServerFn({ method: "POST" })
  .middleware([requireActiveUser])
  .inputValidator((input: unknown) => cancelSchema.parse(input))
  .handler(async ({ data, context }) => {
    requirePermission(context, "accounts.manage");
    const { error } = await context.supabase
      .from("other_transactions")
      .update({ status: "cancelled", cancel_reason: data.reason })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const listCategories = createServerFn({ method: "POST" })
  .middleware([requireActiveUser])
  .handler(async ({ context }) => {
    requirePermission(context, "accounts.read");
    const { data, error } = await context.supabase
      .from("other_transactions")
      .select("category")
      .not("category", "is", null)
      .limit(1000);
    if (error) throw new Error(error.message);
    return Array.from(new Set((data ?? []).map((r) => r.category as string))).sort();
  });

export const setEntryCleared = createServerFn({ method: "POST" })
  .middleware([requireActiveUser])
  .inputValidator((input: unknown) => clearedSchema.parse(input))
  .handler(async ({ data, context }) => {
    requirePermission(context, "accounts.manage");
    const table =
      data.kind === "payment"
        ? "vendor_payments"
        : data.kind === "receipt"
          ? "customer_receipts"
          : "other_transactions";
    const { error } = await context.supabase
      .from(table)
      .update({ cleared: data.cleared, cleared_on: null })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export type AdvanceRow = {
  kind: "payment" | "receipt";
  id: string;
  number: string;
  date: string;
  party_id: string;
  party_name: string;
  amount: string;
  unallocated: string;
};

/** Recorded vendor payments / client receipts with money not yet linked. */
export const listUnallocatedAdvances = createServerFn({ method: "POST" })
  .middleware([requireActiveUser])
  .inputValidator((input: unknown) => advancesSchema.parse(input))
  .handler(async ({ data, context }) => {
    requirePermission(context, "accounts.read");
    const out: AdvanceRow[] = [];
    if (data.kind !== "receipt" && !data.client_id) {
      let q = context.supabase
        .from("vendor_payments")
        .select(
          "id, payment_number, payment_date, amount_inr::text, vendor_id, vendor:vendors(name), allocations:vendor_payment_allocations(amount_inr::text, purchase:purchases(status))",
        )
        .eq("status", "recorded");
      if (data.vendor_id) q = q.eq("vendor_id", data.vendor_id);
      const { data: rows, error } = await q;
      if (error) throw new Error(error.message);
      for (const r of (rows ?? []) as any[]) {
        // eslint-disable-line @typescript-eslint/no-explicit-any
        const used = (r.allocations ?? [])
          .filter((a: any) => a.purchase?.status === "recorded") // eslint-disable-line @typescript-eslint/no-explicit-any
          .reduce((s: bigint, a: any) => s + toPaise(a.amount_inr), 0n); // eslint-disable-line @typescript-eslint/no-explicit-any
        const left = toPaise(r.amount_inr) - used;
        if (left > 0n)
          out.push({
            kind: "payment",
            id: r.id,
            number: r.payment_number,
            date: r.payment_date,
            party_id: r.vendor_id,
            party_name: r.vendor?.name ?? "—",
            amount: r.amount_inr,
            unallocated: fromPaise(left),
          });
      }
    }
    if (data.kind !== "payment" && !data.vendor_id) {
      let q = context.supabase
        .from("customer_receipts")
        .select(
          "id, receipt_number, receipt_date, amount_inr::text, client_id, client:clients(name), allocations:customer_receipt_allocations(amount_inr::text)",
        )
        .eq("status", "recorded")
        .is("sale_id", null);
      if (data.client_id) q = q.eq("client_id", data.client_id);
      const { data: rows, error } = await q;
      if (error) throw new Error(error.message);
      for (const r of (rows ?? []) as any[]) {
        // eslint-disable-line @typescript-eslint/no-explicit-any
        const used = (r.allocations ?? []).reduce(
          (s: bigint, a: any) => s + toPaise(a.amount_inr), // eslint-disable-line @typescript-eslint/no-explicit-any
          0n,
        );
        const left = toPaise(r.amount_inr) - used;
        if (left > 0n)
          out.push({
            kind: "receipt",
            id: r.id,
            number: r.receipt_number,
            date: r.receipt_date,
            party_id: r.client_id,
            party_name: r.client?.name ?? "—",
            amount: r.amount_inr,
            unallocated: fromPaise(left),
          });
      }
    }
    return out.sort((a, b) => a.date.localeCompare(b.date));
  });

/** Outstanding non-cancelled bookings of a client (direct receipts plus linked advances). */
export const listClientOpenBookings = createServerFn({ method: "POST" })
  .middleware([requireActiveUser])
  .inputValidator((input: unknown) => clientIdSchema.parse(input))
  .handler(async ({ data, context }) => {
    requirePermission(context, "receipts.read");
    const { data: sales, error } = await context.supabase
      .from("sales")
      .select(
        "id, booking_number, booking_date, pricing:sale_pricing(customer_payable::text), receipts:customer_receipts(amount_inr::text, status), links:customer_receipt_allocations(receipt_id, amount_inr::text, receipt:customer_receipts(status))",
      )
      .eq("client_id", data.client_id)
      .neq("status", "cancelled")
      .order("booking_date");
    if (error) throw new Error(error.message);
    return ((sales ?? []) as any[]).map((s) => {
      // eslint-disable-line @typescript-eslint/no-explicit-any
      const pricing = Array.isArray(s.pricing) ? s.pricing[0] : s.pricing;
      const payable = toPaise(pricing?.customer_payable ?? "0");
      let got = 0n;
      for (const r of s.receipts ?? []) if (r.status === "recorded") got += toPaise(r.amount_inr);
      const linkByReceipt: Record<string, string> = {};
      for (const l of s.links ?? [])
        if (l.receipt?.status === "recorded") {
          got += toPaise(l.amount_inr);
          linkByReceipt[l.receipt_id] = l.amount_inr;
        }
      return {
        id: s.id as string,
        booking_number: s.booking_number as string,
        booking_date: s.booking_date as string,
        customer_payable: fromPaise(payable),
        outstanding: fromPaise(payable - got),
        linked: linkByReceipt,
      };
    });
  });

export const linkReceiptToBookings = createServerFn({ method: "POST" })
  .middleware([requireActiveUser])
  .inputValidator((input: unknown) => receiptLinkSchema.parse(input))
  .handler(async ({ data, context }) => {
    requirePermission(context, "receipts.manage");
    const ids = new Set<string>();
    for (const a of data.allocations) {
      if (ids.has(a.sale_id)) throw new Error("A booking can only be linked once");
      ids.add(a.sale_id);
    }
    const { error } = await context.supabase.rpc("link_receipt_allocations", {
      _receipt_id: data.receipt_id,
      _allocations: data.allocations,
    });
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });
