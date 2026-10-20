import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { ACCOUNT_TYPE_LABELS, UNASSIGNED_ACCOUNT_ID, type AccountType } from "@/lib/account-schemas";

export type SelectableAccount = {
  id: string;
  name: string;
  account_type: AccountType;
  last4: string | null;
};

export function accountLabel(a: { name: string; last4?: string | null }) {
  return a.last4 ? `${a.name} ··${a.last4}` : a.name;
}

export function useSelectableAccounts(enabled = true) {
  return useQuery({
    queryKey: ["accounts", "selectable"],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("list_selectable_accounts");
      if (error) throw error;
      return (data ?? []) as SelectableAccount[];
    },
  });
}

export function useLastAccount(enabled = true) {
  return useQuery({
    queryKey: ["accounts", "last-used"],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("my_last_account");
      if (error) throw error;
      return (data as string | null) ?? null;
    },
  });
}

/**
 * Required account dropdown. When empty it fills in the account this user
 * used last (once per mount), so repeated entries need no extra click.
 */
export function AccountSelect({
  id,
  value,
  onChange,
  currentName,
  exclude,
  autoDefault = true,
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  /** Name of the saved account when it is no longer selectable (e.g. Unassigned). */
  currentName?: string | null | undefined;
  exclude?: string | undefined;
  autoDefault?: boolean;
}) {
  const accounts = useSelectableAccounts();
  const last = useLastAccount(autoDefault);
  const applied = useRef(false);
  const list = (accounts.data ?? []).filter((a) => a.id !== exclude);

  useEffect(() => {
    if (!autoDefault || applied.current || value) return;
    if (!accounts.data || last.data === undefined) return;
    applied.current = true;
    const pick = list.find((a) => a.id === last.data) ?? (list.length === 1 ? list[0] : undefined);
    if (pick) onChange(pick.id);
  }, [autoDefault, value, accounts.data, last.data, list, onChange]);

  const showCurrent = Boolean(value) && !list.some((a) => a.id === value);

  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger id={id}>
        <SelectValue placeholder={accounts.isLoading ? "Loading accounts…" : "Select an account"} />
      </SelectTrigger>
      <SelectContent>
        {showCurrent ? (
          <SelectItem value={value} className="text-muted-foreground">
            {currentName ?? (value === UNASSIGNED_ACCOUNT_ID ? "Unassigned" : "Inactive account")}
          </SelectItem>
        ) : null}
        {list.map((a) => (
          <SelectItem key={a.id} value={a.id}>
            {accountLabel(a)}{" "}
            <span className="text-muted-foreground">· {ACCOUNT_TYPE_LABELS[a.account_type]}</span>
          </SelectItem>
        ))}
        {list.length === 0 && !showCurrent ? (
          <div className="px-2 py-1.5 text-xs text-muted-foreground">
            No active accounts yet. Ask Admin or Accounts to add one under Finance → Accounts.
          </div>
        ) : null}
      </SelectContent>
    </Select>
  );
}
