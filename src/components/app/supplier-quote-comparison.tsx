import { Fragment } from "react";
import { ArrowLeftRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog";
import { EmptyState } from "./states";
import {
  decimalString,
  latestSupplierQuotes,
  supplierTotal,
  type SupplierQuoteRow,
} from "@/lib/quotation-display";
import { formatMoney } from "@/lib/sale-costing-schemas";
import { SALE_ITEM_TYPES, SALE_ITEM_TYPE_LABELS } from "@/lib/sales-item-schemas";
import { SUPPLIER_QUOTE_STATUS_LABELS } from "@/lib/supplier-quote-schemas";

export function SupplierQuoteComparison({ quotes }: { quotes: SupplierQuoteRow[] }) {
  const latest = latestSupplierQuotes(quotes);
  const totals = latest.map(supplierTotal);
  const lowest = totals.reduce<bigint | null>(
    (min, total) => (min === null || total < min ? total : min),
    null,
  );
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <ArrowLeftRight className="size-4" />
          Compare
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>Supplier quote comparison</DialogTitle>
          <DialogDescription>
            Latest non-rejected, non-superseded quote per vendor.
          </DialogDescription>
        </DialogHeader>
        {latest.length === 0 ? (
          <EmptyState title="No eligible supplier quotes" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="min-w-36 p-3 text-muted-foreground">Purchase type</th>
                  {latest.map((quote) => (
                    <th key={quote.id} className="min-w-56 p-3 align-top font-medium">
                      <div>{quote.vendor?.name ?? "—"}</div>
                      <div className="mt-1 font-mono text-xs text-muted-foreground">
                        {quote.quote_number} · Rev {quote.revision_number}
                      </div>
                      <Badge className="mt-2" variant="secondary">
                        {SUPPLIER_QUOTE_STATUS_LABELS[quote.status]}
                      </Badge>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {SALE_ITEM_TYPES.map((type) => {
                  if (!latest.some((q) => q.lines.some((line) => line.purchase_type === type)))
                    return null;
                  return (
                    <Fragment key={type}>
                      <tr className="bg-muted/40">
                        <th colSpan={latest.length + 1} className="px-3 py-2 text-xs font-semibold">
                          {SALE_ITEM_TYPE_LABELS[type]}
                        </th>
                      </tr>
                      {[true, false].map((isPackage) => (
                        <tr key={String(isPackage)} className="border-b border-border">
                          <th className="p-3 align-top text-xs font-normal text-muted-foreground">
                            {isPackage ? "Package lines" : "Component lines"}
                          </th>
                          {latest.map((quote) => {
                            const lines = quote.lines.filter(
                              (line) =>
                                line.purchase_type === type && line.is_package === isPackage,
                            );
                            return (
                              <td key={quote.id} className="p-3 align-top">
                                {lines.length === 0 ? (
                                  <span className="text-muted-foreground">—</span>
                                ) : (
                                  <ul className="space-y-3">
                                    {lines.map((line) => (
                                      <li key={line.id}>
                                        <div className="break-words">{line.description}</div>
                                        <div className="mt-1 flex justify-between gap-3 text-xs">
                                          <span className="text-muted-foreground">
                                            Qty {line.quantity}
                                          </span>
                                          <span className="tabular-nums">
                                            {formatMoney(line.amount_inr)}
                                          </span>
                                        </div>
                                      </li>
                                    ))}
                                  </ul>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </Fragment>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <th className="p-3">Total INR</th>
                  {latest.map((quote, index) => (
                    <td
                      key={quote.id}
                      className={
                        totals[index] === lowest
                          ? "bg-primary/10 p-3 font-semibold text-primary"
                          : "p-3 font-semibold"
                      }
                    >
                      <div className="tabular-nums">
                        {formatMoney(decimalString(totals[index] ?? 0n))}
                      </div>
                      {totals[index] === lowest ? (
                        <Badge variant="outline" className="mt-2">
                          Lowest total
                        </Badge>
                      ) : null}
                    </td>
                  ))}
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
