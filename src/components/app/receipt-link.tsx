import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { formatDate } from "@/components/app/master-data";
import { TableSkeleton } from "@/components/app/states";
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
import { linkReceiptToBookings, listClientOpenBookings } from "@/lib/accounts.functions";
import { fromPaise, isMoneyString, toPaise } from "@/lib/money";
import { formatMoney } from "@/lib/sale-costing-schemas";

/** Link a client advance to one or more of the client's bookings. */
export function LinkReceiptDialog({
  receipt,
  onOpenChange,
}: {
  receipt: { id: string; receipt_number: string; client_id: string; amount_inr: string } | null;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const listFn = useServerFn(listClientOpenBookings);
  const linkFn = useServerFn(linkReceiptToBookings);
  const [alloc, setAlloc] = useState<Record<string, string>>({});
  const [filled, setFilled] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const bookings = useQuery({
    queryKey: ["receipts", "client-open-bookings", receipt?.client_id],
    enabled: Boolean(receipt),
    queryFn: () => listFn({ data: { client_id: receipt!.client_id } }),
  });

  const key = receipt && bookings.data ? receipt.id : null;
  if (key !== filled) {
    setFilled(key);
    if (key && bookings.data) {
      const initial: Record<string, string> = {};
      for (const b of bookings.data) {
        const mine = b.linked[receipt!.id];
        if (mine) initial[b.id] = mine;
      }
      setAlloc(initial);
      setError(null);
    }
  }

  const rows = (bookings.data ?? []).map((b) => {
    const mine = toPaise(b.linked[receipt?.id ?? ""] ?? "0");
    return { ...b, available: toPaise(b.outstanding) + mine };
  });
  const total = toPaise(receipt?.amount_inr ?? "0");
  const used = rows.reduce(
    (s, r) => s + (isMoneyString(alloc[r.id] ?? "") ? toPaise(alloc[r.id]!) : 0n),
    0n,
  );

  const save = useMutation({
    mutationFn: () =>
      linkFn({
        data: {
          receipt_id: receipt!.id,
          allocations: rows
            .filter((r) => isMoneyString(alloc[r.id] ?? "") && toPaise(alloc[r.id]!) > 0n)
            .map((r) => ({ sale_id: r.id, amount_inr: alloc[r.id]!.trim() })),
        },
      }),
    onSuccess: async () => {
      for (const k of ["receipts", "money-log", "advances", "audit-log"]) {
        await queryClient.invalidateQueries({ queryKey: [k] });
      }
      toast.success("Advance linked");
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error("Request rejected", { description: e.message }),
  });

  function submit() {
    for (const r of rows) {
      const v = (alloc[r.id] ?? "").trim();
      if (!v) continue;
      if (!isMoneyString(v)) return setError(`${r.booking_number}: invalid amount`);
      if (toPaise(v) > r.available)
        return setError(`${r.booking_number}: more than outstanding ${formatMoney(fromPaise(r.available))}`);
    }
    if (used > total) return setError("Links can't exceed the receipt amount");
    setError(null);
    save.mutate();
  }

  return (
    <Dialog open={receipt !== null} onOpenChange={onOpenChange}>
      <DialogContent className="quote-dialog max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Link {receipt?.receipt_number} to bookings</DialogTitle>
          <DialogDescription>
            Split this advance across the client's open bookings. The total can't exceed the
            receipt amount.
          </DialogDescription>
        </DialogHeader>
        {bookings.isPending ? (
          <TableSkeleton rows={2} />
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">This client has no open bookings yet.</p>
        ) : (
          <div className="grid gap-2">
            {rows.map((r) => (
              <div key={r.id} className="flex items-center gap-3 rounded-md border border-border p-2">
                <div className="min-w-0 flex-1">
                  <div className="font-mono text-xs font-semibold">{r.booking_number}</div>
                  <div className="text-xs text-muted-foreground">
                    {formatDate(r.booking_date)} · outstanding {formatMoney(fromPaise(r.available))}
                  </div>
                </div>
                <Input
                  className="w-32 text-right"
                  inputMode="decimal"
                  aria-label={`Amount for ${r.booking_number}`}
                  value={alloc[r.id] ?? ""}
                  onChange={(e) => setAlloc({ ...alloc, [r.id]: e.target.value })}
                />
              </div>
            ))}
          </div>
        )}
        <div className="text-sm">
          Linked {formatMoney(fromPaise(used))} of {formatMoney(fromPaise(total))} · still
          unallocated {formatMoney(fromPaise(total - used))}
        </div>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={save.isPending || rows.length === 0}>
            {save.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
            Save links
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
