import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Field } from "@/components/app/master-data";
import { todayIso } from "@/components/app/payments";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  ACCOUNT_TYPES,
  ACCOUNT_TYPE_LABELS,
  accountInputSchema,
  type AccountType,
} from "@/lib/account-schemas";
import { saveAccount, type AccountRow } from "@/lib/accounts.functions";
import { fromPaise, toPaise } from "@/lib/money";
import { quoteFieldErrors } from "@/lib/quotation-display";
import { formatMoney } from "@/lib/sale-costing-schemas";

/** Why an action is unavailable, shown next to its disabled button (works on phones too). */
export function ReasonNote({ reason }: { reason: string | null | undefined }) {
  if (!reason) return null;
  return <p className="text-xs text-muted-foreground">{reason}</p>;
}

/** Balance as people read it: credit cards show the amount owed. */
export function formatAccountBalance(a: { account_type: AccountType; balance: string }) {
  const paise = toPaise(a.balance);
  if (a.account_type === "credit_card" && paise < 0n)
    return `${formatMoney(fromPaise(-paise))} owed`;
  return formatMoney(a.balance);
}

type FormState = {
  name: string;
  account_type: AccountType | "";
  last4: string;
  opening_balance: string;
  opening_balance_date: string;
  is_active: boolean;
};

function initialForm(account: AccountRow | null): FormState {
  if (!account) {
    return {
      name: "",
      account_type: "",
      last4: "",
      opening_balance: "0",
      opening_balance_date: todayIso(),
      is_active: true,
    };
  }
  // Credit card balances are stored negative; the form shows the amount owed.
  const opening = toPaise(account.opening_balance);
  return {
    name: account.name,
    account_type: account.account_type,
    last4: account.last4 ?? "",
    opening_balance: fromPaise(opening < 0n ? -opening : opening),
    opening_balance_date: account.opening_balance_date,
    is_active: account.is_active,
  };
}

export function AccountFormDialog({
  open,
  onOpenChange,
  account,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** null = add a new account. */
  account: AccountRow | null;
}) {
  const queryClient = useQueryClient();
  const saveFn = useServerFn(saveAccount);
  const [form, setForm] = useState<FormState>(() => initialForm(account));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const set = (patch: Partial<FormState>) => setForm((f) => ({ ...f, ...patch }));

  // Reset the form each time the dialog opens for a different account.
  const key = open ? (account?.id ?? "new") : null;
  if (key !== loadedFor) {
    setLoadedFor(key);
    if (key) {
      setForm(initialForm(account));
      setErrors({});
    }
  }

  const save = useMutation({
    mutationFn: (values: FormState) => saveFn({ data: { id: account?.id ?? null, values } }),
    onSuccess: async () => {
      for (const k of ["accounts", "money-log", "account-statement"]) {
        await queryClient.invalidateQueries({ queryKey: [k] });
      }
      toast.success(account ? "Account updated" : "Account added");
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error("Request rejected", { description: e.message }),
  });

  function submit() {
    const parsed = accountInputSchema.safeParse(form);
    if (!parsed.success) {
      setErrors(quoteFieldErrors(parsed.error.issues));
      return;
    }
    setErrors({});
    save.mutate(form);
  }

  const isCard = form.account_type === "credit_card";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{account ? `Edit ${account.name}` : "Add account"}</DialogTitle>
          <DialogDescription>
            A bank account, credit card, cash box or UPI wallet that money moves through.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <Field label="Name" htmlFor="account-name" required error={errors["name"]}>
            <Input
              id="account-name"
              placeholder="e.g. HDFC Current"
              value={form.name}
              onChange={(e) => set({ name: e.target.value })}
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Type" htmlFor="account-type" required error={errors["account_type"]}>
              <Select
                value={form.account_type}
                onValueChange={(v) => set({ account_type: v as AccountType })}
              >
                <SelectTrigger id="account-type">
                  <SelectValue placeholder="Select" />
                </SelectTrigger>
                <SelectContent>
                  {ACCOUNT_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {ACCOUNT_TYPE_LABELS[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Last 4 digits" htmlFor="account-last4" error={errors["last4"]}>
              <Input
                id="account-last4"
                inputMode="numeric"
                maxLength={4}
                placeholder="Optional"
                value={form.last4}
                onChange={(e) => set({ last4: e.target.value })}
              />
            </Field>
            <Field
              label={isCard ? "Amount owed on card (INR)" : "Opening balance (INR)"}
              htmlFor="account-opening"
              required
              error={errors["opening_balance"]}
            >
              <Input
                id="account-opening"
                inputMode="decimal"
                value={form.opening_balance}
                onChange={(e) => set({ opening_balance: e.target.value })}
              />
            </Field>
            <Field
              label="Balance as on"
              htmlFor="account-opening-date"
              required
              error={errors["opening_balance_date"]}
            >
              <Input
                id="account-opening-date"
                type="date"
                value={form.opening_balance_date}
                onChange={(e) => set({ opening_balance_date: e.target.value })}
              />
            </Field>
          </div>
          {isCard ? (
            <p className="text-xs text-muted-foreground">
              Enter what you owe on the card as a positive number. It is saved as money owed.
            </p>
          ) : null}
          <label className="flex items-center justify-between gap-3 rounded-md border border-border p-3">
            <span>
              <span className="block text-sm font-medium">Active</span>
              <span className="block text-xs text-muted-foreground">
                Inactive accounts keep their history but can't be picked for new entries.
              </span>
            </span>
            <Switch checked={form.is_active} onCheckedChange={(v) => set({ is_active: v })} />
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={save.isPending}>
            {save.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
            {account ? "Save changes" : "Add account"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
