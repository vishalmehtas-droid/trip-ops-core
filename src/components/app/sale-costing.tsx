import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Field } from "@/components/app/master-data";
import { RecordCombobox, type RecordOption } from "@/components/app/sales-ui";
import { useQuickAdd } from "@/components/app/quick-add";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
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
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import {
  BILLING_TYPE_LABELS,
  COST_SOURCE_TYPES,
  COST_SOURCE_TYPE_LABELS,
  DEFAULT_TCS_RATE,
  MARKUP_TYPES,
  MARKUP_TYPE_LABELS,
  SALE_COST_TYPES,
  SALE_COST_TYPE_LABELS,
  formatMoney,
  saleCostValuesSchema,
  salePricingValuesSchema,
  type BillingType,
  type CostSourceType,
  type MarkupType,
  type SaleCostType,
} from "@/lib/sale-costing-schemas";
import {
  createSaleCost,
  deleteSaleCost,
  updateSaleCost,
  updateSalePricing,
} from "@/lib/sale-costing.functions";

type SaleCost = {
  id: string;
  sale_id: string;
  cost_type: SaleCostType;
  source_type: CostSourceType;
  description: string;
  vendor_id: string | null;
  quantity: number;
  unit_cost: string | number;
  total_cost: string | number;
  currency_code: string;
  exchange_rate: string | number;
  base_currency_cost: string | number;
  notes: string | null;
  sort_order: number;
  created_at: string;
  vendor: { id: string; name: string; is_active: boolean } | null;
};

type SalePricing = {
  sale_id: string;
  markup_type: MarkupType;
  markup_value: string | number;
  markup_amount: string | number;
  discount_amount: string | number;
  selling_value: string | number;
  service_charge_amount: string | number;
  gst_rate: string | number;
  gst_amount: string | number;
  tcs_applicable: boolean;
  tcs_rate: string | number | null;
  tcs_amount: string | number;
  customer_payable: string | number;
  expected_cost: string | number;
  expected_gross_profit: string | number;
  updated_at: string;
};

const COST_SELECT =
  "id, sale_id, cost_type, source_type, description, vendor_id, quantity, unit_cost, total_cost, currency_code, exchange_rate, base_currency_cost, notes, sort_order, created_at, vendor:vendors(id, name, is_active)";

const PRICING_SELECT =
  "sale_id, markup_type, markup_value, markup_amount, discount_amount, selling_value, service_charge_amount, gst_rate, gst_amount, tcs_applicable, tcs_rate, tcs_amount, customer_payable, expected_cost, expected_gross_profit, updated_at";

type CostForm = {
  cost_type: SaleCostType | "";
  source_type: CostSourceType;
  description: string;
  vendor_id: string;
  quantity: string;
  unit_cost: string;
  currency_code: string;
  exchange_rate: string;
  notes: string;
};

const EMPTY_COST: CostForm = {
  cost_type: "",
  source_type: "vendor",
  description: "",
  vendor_id: "",
  quantity: "1",
  unit_cost: "",
  currency_code: "INR",
  exchange_rate: "1",
  notes: "",
};

type PricingForm = {
  markup_type: MarkupType;
  markup_value: string;
  discount_amount: string;
  tcs_applicable: boolean;
  tcs_rate: string;
};

function num(value: string | number | null | undefined): number {
  const parsed = typeof value === "string" ? Number(value) : (value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function issuesToErrors(issues: { path: (string | number | symbol)[]; message: string }[]) {
  const next: Record<string, string> = {};
  for (const issue of issues) {
    const key = String(issue.path[0] ?? "form");
    if (!next[key]) next[key] = issue.message;
  }
  return next;
}

export function BookingCosting({
  saleId,
  billingType,
  canManage,
}: {
  saleId: string;
  billingType: BillingType;
  /** False for read-only users and for completed/cancelled bookings. */
  canManage: boolean;
}) {
  const queryClient = useQueryClient();

  const [costDialogOpen, setCostDialogOpen] = useState(false);
  const [editingCostId, setEditingCostId] = useState<string | null>(null);
  const [costForm, setCostForm] = useState<CostForm>(EMPTY_COST);
  const [costErrors, setCostErrors] = useState<Record<string, string>>({});
  const [pendingDelete, setPendingDelete] = useState<SaleCost | null>(null);

  const [pricingDialogOpen, setPricingDialogOpen] = useState(false);
  const [pricingForm, setPricingForm] = useState<PricingForm>({
    markup_type: "none",
    markup_value: "0",
    discount_amount: "0",
    tcs_applicable: false,
    tcs_rate: DEFAULT_TCS_RATE,
  });
  const [pricingErrors, setPricingErrors] = useState<Record<string, string>>({});

  const createCostFn = useServerFn(createSaleCost);
  const updateCostFn = useServerFn(updateSaleCost);
  const deleteCostFn = useServerFn(deleteSaleCost);
  const updatePricingFn = useServerFn(updateSalePricing);

  const vendorQuickAdd = useQuickAdd("vendor", (id) =>
    setCostForm((current) => ({ ...current, vendor_id: id })),
  );

  const costsQuery = useQuery({
    queryKey: ["sales", saleId, "costs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sale_costs")
        .select(COST_SELECT)
        .eq("sale_id", saleId)
        .order("sort_order")
        .order("created_at");
      if (error) throw error;
      return (data ?? []) as unknown as SaleCost[];
    },
  });

  const pricingQuery = useQuery({
    queryKey: ["sales", saleId, "pricing"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sale_pricing")
        .select(PRICING_SELECT)
        .eq("sale_id", saleId)
        .maybeSingle();
      if (error) throw error;
      return (data as unknown as SalePricing | null) ?? null;
    },
  });

  const costs = costsQuery.data ?? [];
  const pricing = pricingQuery.data ?? null;
  const editingCost = costs.find((cost) => cost.id === editingCostId) ?? null;

  const activeVendorsQuery = useQuery({
    queryKey: ["vendors", "active"],
    enabled: canManage,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vendors")
        .select("id, name")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return (data ?? []) as unknown as {
        id: string;
        name: string;
      }[];
    },
  });

  const vendorOptions: RecordOption[] = useMemo(() => {
    const options: RecordOption[] = (activeVendorsQuery.data ?? []).map((row) => ({
      id: row.id,
      label: row.name,
      hint: null,
    }));
    if (editingCost?.vendor && !options.some((option) => option.id === editingCost.vendor!.id)) {
      options.unshift({
        id: editingCost.vendor.id,
        label: `${editingCost.vendor.name} (inactive)`,
        hint: null,
      });
    }
    return options;
  }, [activeVendorsQuery.data, editingCost]);

  useEffect(() => {
    if (!pricing || pricingDialogOpen) return;
    setPricingForm({
      markup_type: pricing.markup_type,
      markup_value: String(num(pricing.markup_value)),
      discount_amount: String(num(pricing.discount_amount)),
      tcs_applicable: pricing.tcs_applicable,
      tcs_rate: pricing.tcs_rate === null ? DEFAULT_TCS_RATE : String(num(pricing.tcs_rate)),
    });
  }, [pricing, pricingDialogOpen]);

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ["sales", saleId, "costs"] });
    await queryClient.invalidateQueries({ queryKey: ["sales", saleId, "pricing"] });
    await queryClient.invalidateQueries({ queryKey: ["audit-log"] });
  };

  const saveCost = useMutation({
    mutationFn: async (state: CostForm) => {
      const values = saleCostValuesSchema.parse(state);
      if (editingCostId) return updateCostFn({ data: { id: editingCostId, values } });
      return createCostFn({ data: { sale_id: saleId, values } });
    },
    onSuccess: async () => {
      await invalidate();
      toast.success(editingCostId ? "Cost updated" : "Cost added");
      setCostDialogOpen(false);
    },
    onError: (error: Error) => {
      toast.error("Request rejected", { description: error.message });
    },
  });

  const removeCost = useMutation({
    mutationFn: (id: string) => deleteCostFn({ data: { id } }),
    onSuccess: async () => {
      await invalidate();
      toast.success("Cost removed");
      setPendingDelete(null);
    },
    onError: (error: Error) => {
      toast.error("Request rejected", { description: error.message });
      setPendingDelete(null);
    },
  });

  const savePricing = useMutation({
    mutationFn: async (state: PricingForm) => {
      const values = salePricingValuesSchema.parse({
        markup_type: state.markup_type,
        markup_value: state.markup_type === "none" ? 0 : state.markup_value,
        discount_amount: state.discount_amount,
        tcs_applicable: state.tcs_applicable,
        tcs_rate: state.tcs_applicable ? state.tcs_rate : null,
      });
      return updatePricingFn({ data: { sale_id: saleId, values } });
    },
    onSuccess: async () => {
      await invalidate();
      toast.success("Pricing updated");
      setPricingDialogOpen(false);
    },
    onError: (error: Error) => {
      toast.error("Request rejected", { description: error.message });
    },
  });

  function openAddCost() {
    setEditingCostId(null);
    setCostForm(EMPTY_COST);
    setCostErrors({});
    setCostDialogOpen(true);
  }

  function openEditCost(cost: SaleCost) {
    setEditingCostId(cost.id);
    setCostForm({
      cost_type: cost.cost_type,
      source_type: cost.source_type,
      description: cost.description,
      vendor_id: cost.vendor_id ?? "",
      quantity: String(cost.quantity),
      unit_cost: String(num(cost.unit_cost)),
      currency_code: cost.currency_code,
      exchange_rate: String(num(cost.exchange_rate)),
      notes: cost.notes ?? "",
    });
    setCostErrors({});
    setCostDialogOpen(true);
  }

  function submitCost() {
    const parsed = saleCostValuesSchema.safeParse(costForm);
    if (!parsed.success) {
      setCostErrors(issuesToErrors(parsed.error.issues));
      return;
    }
    setCostErrors({});
    saveCost.mutate(costForm);
  }

  function submitPricing() {
    const parsed = salePricingValuesSchema.safeParse({
      markup_type: pricingForm.markup_type,
      markup_value: pricingForm.markup_type === "none" ? 0 : pricingForm.markup_value,
      discount_amount: pricingForm.discount_amount,
      tcs_applicable: pricingForm.tcs_applicable,
      tcs_rate: pricingForm.tcs_applicable ? pricingForm.tcs_rate : null,
    });
    if (!parsed.success) {
      setPricingErrors(issuesToErrors(parsed.error.issues));
      return;
    }
    setPricingErrors({});
    savePricing.mutate(pricingForm);
  }

  const chargeLabel = billingType === "tour_package" ? "Markup" : "Service charge";
  const isForeign = costForm.currency_code.toUpperCase() !== "INR";

  return (
    <>
      <section className="rounded-lg border border-border bg-surface">
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
          <div>
            <h2 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Internal costs
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              What we expect to pay suppliers. Never shown to the customer.
            </p>
          </div>
          {canManage ? (
            <Button size="sm" variant="outline" onClick={openAddCost}>
              <Plus className="size-3.5" />
              Add cost
            </Button>
          ) : null}
        </header>

        {costsQuery.isPending ? (
          <div className="flex items-center gap-2 px-4 py-8 text-xs text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Loading costs
          </div>
        ) : costsQuery.isError ? (
          <div className="px-4 py-8 text-center text-xs text-destructive">
            Costs could not be loaded.{" "}
            <button className="underline" onClick={() => void costsQuery.refetch()}>
              Retry
            </button>
          </div>
        ) : costs.length === 0 ? (
          <p className="px-4 py-10 text-center text-xs text-muted-foreground">
            {canManage
              ? "Add the DMC, hotel, flight, visa or transport costs you expect to pay for this booking."
              : "No internal costs recorded yet."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-2">Type</th>
                  <th className="px-4 py-2">Description</th>
                  <th className="px-4 py-2">Vendor / source</th>
                  <th className="px-4 py-2 text-right">Qty</th>
                  <th className="px-4 py-2 text-right">Unit cost</th>
                  <th className="px-4 py-2 text-right">Line total</th>
                  <th className="px-4 py-2 text-right">In INR</th>
                  {canManage ? <th className="px-4 py-2 text-right">Actions</th> : null}
                </tr>
              </thead>
              <tbody>
                {costs.map((cost) => (
                  <tr key={cost.id} className="border-b border-border last:border-b-0">
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      <Badge variant="outline" className="text-[10px] font-bold uppercase">
                        {SALE_COST_TYPE_LABELS[cost.cost_type]}
                      </Badge>
                    </td>
                    <td className="px-4 py-2.5">
                      {cost.description}
                      {cost.notes ? (
                        <span className="block text-xs text-muted-foreground">{cost.notes}</span>
                      ) : null}
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground">
                      {cost.vendor ? (
                        <span>
                          {cost.vendor.name}
                          {!cost.vendor.is_active ? (
                            <Badge variant="outline" className="ml-2 text-[10px] uppercase">
                              Inactive
                            </Badge>
                          ) : null}
                        </span>
                      ) : (
                        COST_SOURCE_TYPE_LABELS[cost.source_type]
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{cost.quantity}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {formatMoney(cost.unit_cost, cost.currency_code)}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {formatMoney(cost.total_cost, cost.currency_code)}
                      {cost.currency_code !== "INR" ? (
                        <span className="block text-[11px] text-muted-foreground">
                          @ {num(cost.exchange_rate)}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-4 py-2.5 text-right font-medium tabular-nums">
                      {formatMoney(cost.base_currency_cost)}
                    </td>
                    {canManage ? (
                      <td className="px-4 py-2.5 text-right whitespace-nowrap">
                        <Button variant="ghost" size="sm" onClick={() => openEditCost(cost)}>
                          <Pencil className="size-3.5" />
                          <span className="sr-only">Edit cost</span>
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => setPendingDelete(cost)}>
                          <Trash2 className="size-3.5 text-destructive" />
                          <span className="sr-only">Remove cost</span>
                        </Button>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-lg border border-border bg-surface">
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
          <div>
            <h2 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Costing &amp; pricing
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {BILLING_TYPE_LABELS[billingType]} · all amounts are calculated and stored by the
              system.
            </p>
          </div>
          {canManage && pricing ? (
            <Button size="sm" variant="outline" onClick={() => setPricingDialogOpen(true)}>
              <Pencil className="size-3.5" />
              Edit pricing
            </Button>
          ) : null}
        </header>

        {pricingQuery.isPending ? (
          <div className="flex items-center gap-2 px-4 py-8 text-xs text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Loading pricing
          </div>
        ) : !pricing ? (
          <p className="px-4 py-10 text-center text-xs text-muted-foreground">
            Pricing is not available for this booking.
          </p>
        ) : (
          <dl className="grid gap-x-8 px-4 py-2 sm:grid-cols-2">
            <MoneyRow label="Internal cost (expected)" value={pricing.expected_cost} />
            <MoneyRow
              label={`${chargeLabel} (${
                pricing.markup_type === "percentage"
                  ? `${num(pricing.markup_value)}%`
                  : MARKUP_TYPE_LABELS[pricing.markup_type]
              })`}
              value={pricing.service_charge_amount}
            />
            <MoneyRow label="Discount (internal)" value={pricing.discount_amount} />
            <MoneyRow label="Customer selling value" value={pricing.selling_value} strong />
            <MoneyRow
              label={`GST @ ${num(pricing.gst_rate)}%${
                billingType === "standalone_service" ? " on service charge" : ""
              }`}
              value={pricing.gst_amount}
            />
            <MoneyRow
              label={
                pricing.tcs_applicable ? `TCS @ ${num(pricing.tcs_rate)}%` : "TCS (not applicable)"
              }
              value={pricing.tcs_amount}
            />
            <MoneyRow label="Customer payable" value={pricing.customer_payable} strong />
            <MoneyRow label="Expected gross profit" value={pricing.expected_gross_profit} strong />
          </dl>
        )}
      </section>

      <Dialog open={costDialogOpen} onOpenChange={setCostDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingCostId ? "Edit cost" : "Add cost"}</DialogTitle>
            <DialogDescription>
              Line totals and the INR value are calculated by the system from quantity, unit cost
              and exchange rate.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4">
            <Field label="Cost type" htmlFor="cost-type" required error={costErrors["cost_type"]}>
              <Select
                value={costForm.cost_type}
                onValueChange={(value) =>
                  setCostForm({ ...costForm, cost_type: value as SaleCostType })
                }
              >
                <SelectTrigger id="cost-type">
                  <SelectValue placeholder="Select a cost type" />
                </SelectTrigger>
                <SelectContent>
                  {SALE_COST_TYPES.map((type) => (
                    <SelectItem key={type} value={type}>
                      {SALE_COST_TYPE_LABELS[type]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Source" htmlFor="cost-source" required error={costErrors["source_type"]}>
              <Select
                value={costForm.source_type}
                onValueChange={(value) =>
                  setCostForm({ ...costForm, source_type: value as CostSourceType })
                }
              >
                <SelectTrigger id="cost-source">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {COST_SOURCE_TYPES.map((type) => (
                    <SelectItem key={type} value={type}>
                      {COST_SOURCE_TYPE_LABELS[type]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field
              label="Description"
              htmlFor="cost-description"
              required
              error={costErrors["description"]}
            >
              <Input
                id="cost-description"
                value={costForm.description}
                onChange={(event) => setCostForm({ ...costForm, description: event.target.value })}
                placeholder="DMC package — 5 nights Bangkok"
              />
            </Field>
            <Field label="Vendor" htmlFor="cost-vendor" error={costErrors["vendor_id"]}>
              <RecordCombobox
                id="cost-vendor"
                options={vendorOptions}
                value={costForm.vendor_id}
                onChange={(value) => setCostForm({ ...costForm, vendor_id: value })}
                placeholder="Optional"
                searchPlaceholder="Search vendors"
                emptyText="No active vendors found"
                allowClear
                onCreateNew={vendorQuickAdd.openQuickAdd}
                createLabel="Add new vendor"
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Quantity"
                htmlFor="cost-quantity"
                required
                error={costErrors["quantity"]}
              >
                <Input
                  id="cost-quantity"
                  type="number"
                  min={1}
                  step={1}
                  value={costForm.quantity}
                  onChange={(event) => setCostForm({ ...costForm, quantity: event.target.value })}
                />
              </Field>
              <Field label="Unit cost" htmlFor="cost-unit" required error={costErrors["unit_cost"]}>
                <Input
                  id="cost-unit"
                  type="number"
                  min={0}
                  step="0.01"
                  value={costForm.unit_cost}
                  onChange={(event) => setCostForm({ ...costForm, unit_cost: event.target.value })}
                />
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Currency"
                htmlFor="cost-currency"
                required
                error={costErrors["currency_code"]}
              >
                <Input
                  id="cost-currency"
                  value={costForm.currency_code}
                  maxLength={3}
                  onChange={(event) =>
                    setCostForm({
                      ...costForm,
                      currency_code: event.target.value.toUpperCase(),
                      exchange_rate:
                        event.target.value.toUpperCase() === "INR" ? "1" : costForm.exchange_rate,
                    })
                  }
                />
              </Field>
              <Field
                label="Exchange rate to INR"
                htmlFor="cost-rate"
                required
                error={costErrors["exchange_rate"]}
              >
                <Input
                  id="cost-rate"
                  type="number"
                  min={0}
                  step="0.000001"
                  disabled={!isForeign}
                  value={costForm.exchange_rate}
                  onChange={(event) =>
                    setCostForm({ ...costForm, exchange_rate: event.target.value })
                  }
                />
              </Field>
            </div>
            <Field label="Notes" htmlFor="cost-notes" error={costErrors["notes"]}>
              <Textarea
                id="cost-notes"
                rows={2}
                value={costForm.notes}
                onChange={(event) => setCostForm({ ...costForm, notes: event.target.value })}
              />
            </Field>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCostDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submitCost} disabled={saveCost.isPending}>
              {saveCost.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
              {editingCostId ? "Save changes" : "Add cost"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={pricingDialogOpen} onOpenChange={setPricingDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit pricing</DialogTitle>
            <DialogDescription>
              Enter the markup, discount and TCS choice. Selling value, GST, TCS, customer payable
              and gross profit are calculated by the system.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4">
            <Field
              label={`${chargeLabel} type`}
              htmlFor="markup-type"
              required
              error={pricingErrors["markup_type"]}
            >
              <Select
                value={pricingForm.markup_type}
                onValueChange={(value) =>
                  setPricingForm({ ...pricingForm, markup_type: value as MarkupType })
                }
              >
                <SelectTrigger id="markup-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MARKUP_TYPES.map((type) => (
                    <SelectItem key={type} value={type}>
                      {MARKUP_TYPE_LABELS[type]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            {pricingForm.markup_type !== "none" ? (
              <Field
                label={
                  pricingForm.markup_type === "percentage"
                    ? `${chargeLabel} percentage`
                    : `${chargeLabel} amount (INR)`
                }
                htmlFor="markup-value"
                required
                error={pricingErrors["markup_value"]}
              >
                <Input
                  id="markup-value"
                  type="number"
                  min={0}
                  step="0.01"
                  value={pricingForm.markup_value}
                  onChange={(event) =>
                    setPricingForm({ ...pricingForm, markup_value: event.target.value })
                  }
                />
              </Field>
            ) : null}
            <Field
              label="Discount (INR, internal only)"
              htmlFor="discount-amount"
              error={pricingErrors["discount_amount"]}
            >
              <Input
                id="discount-amount"
                type="number"
                min={0}
                step="0.01"
                value={pricingForm.discount_amount}
                onChange={(event) =>
                  setPricingForm({ ...pricingForm, discount_amount: event.target.value })
                }
              />
            </Field>
            <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
              <div>
                <p className="text-sm font-medium">TCS applicable</p>
                <p className="text-xs text-muted-foreground">
                  Collected on behalf of the government; never part of gross profit.
                </p>
              </div>
              <Switch
                checked={pricingForm.tcs_applicable}
                onCheckedChange={(checked) =>
                  setPricingForm({
                    ...pricingForm,
                    tcs_applicable: checked,
                    tcs_rate: checked
                      ? pricingForm.tcs_rate || DEFAULT_TCS_RATE
                      : pricingForm.tcs_rate,
                  })
                }
              />
            </div>
            <Field label="TCS rate %" htmlFor="tcs-rate" error={pricingErrors["tcs_rate"]}>
              <Input
                id="tcs-rate"
                type="number"
                min={0}
                step="0.01"
                disabled={!pricingForm.tcs_applicable}
                value={pricingForm.tcs_applicable ? pricingForm.tcs_rate : ""}
                onChange={(event) =>
                  setPricingForm({ ...pricingForm, tcs_rate: event.target.value })
                }
              />
            </Field>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setPricingDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submitPricing} disabled={savePricing.isPending}>
              {savePricing.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
              Save pricing
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => !open && setPendingDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this cost?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete
                ? `${SALE_COST_TYPE_LABELS[pendingDelete.cost_type]} — ${pendingDelete.description} will be removed and the booking pricing recalculated. The removal is recorded in the activity log.`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => pendingDelete && removeCost.mutate(pendingDelete.id)}
              disabled={removeCost.isPending}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {vendorQuickAdd.quickAddDialog}
    </>
  );
}

function MoneyRow({
  label,
  value,
  strong,
}: {
  label: string;
  value: string | number | null;
  strong?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-border py-2.5 last:border-b-0">
      <dt
        className={
          strong ? "text-xs font-semibold uppercase tracking-wide" : "text-xs text-muted-foreground"
        }
      >
        {label}
      </dt>
      <dd className={strong ? "text-sm font-semibold tabular-nums" : "text-sm tabular-nums"}>
        {formatMoney(value)}
      </dd>
    </div>
  );
}
