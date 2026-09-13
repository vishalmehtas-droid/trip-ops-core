import { useMemo, useState } from "react";
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
import { supabase } from "@/integrations/supabase/client";
import {
  SALE_ITEM_TYPES,
  SALE_ITEM_TYPE_LABELS,
  saleItemValuesSchema,
  type SaleItemType,
} from "@/lib/sales-item-schemas";
import { createSaleItem, deleteSaleItem, updateSaleItem } from "@/lib/sales-items.functions";

type SaleItem = {
  id: string;
  sale_id: string;
  item_type: SaleItemType;
  description: string;
  vendor_id: string | null;
  quantity: number;
  sort_order: number;
  created_at: string;
  vendor: { id: string; name: string; is_active: boolean } | null;
};

const ITEM_SELECT =
  "id, sale_id, item_type, description, vendor_id, quantity, sort_order, created_at, vendor:vendors(id, name, is_active)";

type FormState = {
  item_type: SaleItemType | "";
  description: string;
  vendor_id: string;
  quantity: string;
};

const EMPTY_FORM: FormState = { item_type: "", description: "", vendor_id: "", quantity: "1" };

export function BookingComponents({
  saleId,
  canManage,
}: {
  saleId: string;
  /** False for read-only users and for completed/cancelled bookings. */
  canManage: boolean;
}) {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pendingDelete, setPendingDelete] = useState<SaleItem | null>(null);

  const createFn = useServerFn(createSaleItem);
  const updateFn = useServerFn(updateSaleItem);
  const deleteFn = useServerFn(deleteSaleItem);

  const vendorQuickAdd = useQuickAdd("vendor", (id) =>
    setForm((current) => ({ ...current, vendor_id: id })),
  );

  const itemsQuery = useQuery({
    queryKey: ["sales", saleId, "items"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales_items")
        .select(ITEM_SELECT)
        .eq("sale_id", saleId)
        .order("sort_order")
        .order("created_at");
      if (error) throw error;
      return (data ?? []) as unknown as SaleItem[];
    },
  });

  const items = itemsQuery.data ?? [];
  const editing = items.find((item) => item.id === editingId) ?? null;

  const activeVendorsQuery = useQuery({
    queryKey: ["vendors", "active"],
    enabled: canManage,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vendors")
        .select("id, name, vendor_type:vendor_types(name)")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return (data ?? []) as unknown as {
        id: string;
        name: string;
        vendor_type: { name: string } | null;
      }[];
    },
  });

  const vendorOptions: RecordOption[] = useMemo(() => {
    const options: RecordOption[] = (activeVendorsQuery.data ?? []).map((row) => ({
      id: row.id,
      label: row.name,
      hint: row.vendor_type?.name ?? null,
    }));
    // Keep an already-attached vendor selectable even if it is now inactive.
    if (editing?.vendor && !options.some((option) => option.id === editing.vendor!.id)) {
      options.unshift({
        id: editing.vendor.id,
        label: `${editing.vendor.name} (inactive)`,
        hint: null,
      });
    }
    return options;
  }, [activeVendorsQuery.data, editing]);

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ["sales", saleId, "items"] });
    await queryClient.invalidateQueries({ queryKey: ["audit-log"] });
  };

  const save = useMutation({
    mutationFn: async (state: FormState) => {
      const values = saleItemValuesSchema.parse(state);
      if (editingId) return updateFn({ data: { id: editingId, values } });
      return createFn({ data: { sale_id: saleId, values } });
    },
    onSuccess: async () => {
      await invalidate();
      toast.success(editingId ? "Component updated" : "Component added");
      setDialogOpen(false);
    },
    onError: (error: Error) => {
      toast.error("Request rejected", { description: error.message });
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: async () => {
      await invalidate();
      toast.success("Component removed");
      setPendingDelete(null);
    },
    onError: (error: Error) => {
      toast.error("Request rejected", { description: error.message });
      setPendingDelete(null);
    },
  });

  function openAdd() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setErrors({});
    setDialogOpen(true);
  }

  function openEdit(item: SaleItem) {
    setEditingId(item.id);
    setForm({
      item_type: item.item_type,
      description: item.description,
      vendor_id: item.vendor_id ?? "",
      quantity: String(item.quantity),
    });
    setErrors({});
    setDialogOpen(true);
  }

  function submit() {
    const parsed = saleItemValuesSchema.safeParse(form);
    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? "form");
        if (!next[key]) next[key] = issue.message;
      }
      setErrors(next);
      return;
    }
    setErrors({});
    save.mutate(form);
  }

  return (
    <section className="rounded-lg border border-border bg-surface">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
        <div>
          <h2 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Booking components
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {items.length === 0
              ? "No components yet."
              : `${items.length} component${items.length === 1 ? "" : "s"} on this booking.`}
          </p>
        </div>
        {canManage ? (
          <Button size="sm" onClick={openAdd}>
            <Plus className="size-3.5" />
            Add component
          </Button>
        ) : null}
      </header>

      {itemsQuery.isPending ? (
        <div className="flex items-center gap-2 px-4 py-8 text-xs text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Loading components
        </div>
      ) : itemsQuery.isError ? (
        <div className="px-4 py-8 text-center text-xs text-destructive">
          Components could not be loaded.{" "}
          <button className="underline" onClick={() => void itemsQuery.refetch()}>
            Retry
          </button>
        </div>
      ) : items.length === 0 ? (
        <p className="px-4 py-10 text-center text-xs text-muted-foreground">
          {canManage
            ? "Add hotels, flights, visas, activities or transport to build out this booking."
            : "This booking has no components yet."}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-2">Type</th>
                <th className="px-4 py-2">Description</th>
                <th className="px-4 py-2">Vendor</th>
                <th className="px-4 py-2 text-right">Qty</th>
                {canManage ? <th className="px-4 py-2 text-right">Actions</th> : null}
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-b border-border last:border-b-0">
                  <td className="px-4 py-2.5 whitespace-nowrap">
                    <Badge variant="outline" className="text-[10px] font-bold uppercase">
                      {SALE_ITEM_TYPE_LABELS[item.item_type]}
                    </Badge>
                  </td>
                  <td className="px-4 py-2.5">{item.description}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">
                    {item.vendor ? (
                      <span>
                        {item.vendor.name}
                        {!item.vendor.is_active ? (
                          <Badge variant="outline" className="ml-2 text-[10px] uppercase">
                            Inactive
                          </Badge>
                        ) : null}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{item.quantity}</td>
                  {canManage ? (
                    <td className="px-4 py-2.5 text-right whitespace-nowrap">
                      <Button variant="ghost" size="sm" onClick={() => openEdit(item)}>
                        <Pencil className="size-3.5" />
                        <span className="sr-only">Edit component</span>
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setPendingDelete(item)}>
                        <Trash2 className="size-3.5 text-destructive" />
                        <span className="sr-only">Remove component</span>
                      </Button>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit component" : "Add component"}</DialogTitle>
            <DialogDescription>
              Components describe what the booking includes. Amounts and taxes are not part of this
              phase.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4">
            <Field label="Type" htmlFor="item-type" required error={errors["item_type"]}>
              <Select
                value={form.item_type}
                onValueChange={(value) => setForm({ ...form, item_type: value as SaleItemType })}
              >
                <SelectTrigger id="item-type">
                  <SelectValue placeholder="Select a type" />
                </SelectTrigger>
                <SelectContent>
                  {SALE_ITEM_TYPES.map((type) => (
                    <SelectItem key={type} value={type}>
                      {SALE_ITEM_TYPE_LABELS[type]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field
              label="Description"
              htmlFor="item-description"
              required
              error={errors["description"]}
            >
              <Input
                id="item-description"
                value={form.description}
                onChange={(event) => setForm({ ...form, description: event.target.value })}
                placeholder="3 nights — Hilton Bangkok"
              />
            </Field>
            <Field label="Vendor" htmlFor="item-vendor" error={errors["vendor_id"]}>
              <RecordCombobox
                id="item-vendor"
                options={vendorOptions}
                value={form.vendor_id}
                onChange={(value) => setForm({ ...form, vendor_id: value })}
                placeholder="Optional"
                searchPlaceholder="Search vendors"
                emptyText="No active vendors found"
                allowClear
                onCreateNew={vendorQuickAdd.openQuickAdd}
                createLabel="Add new vendor"
              />
            </Field>
            <Field label="Quantity" htmlFor="item-quantity" required error={errors["quantity"]}>
              <Input
                id="item-quantity"
                type="number"
                min={1}
                step={1}
                value={form.quantity}
                onChange={(event) => setForm({ ...form, quantity: event.target.value })}
              />
            </Field>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={save.isPending}>
              {save.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
              {editingId ? "Save changes" : "Add component"}
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
            <AlertDialogTitle>Remove this component?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete
                ? `${SALE_ITEM_TYPE_LABELS[pendingDelete.item_type]} — ${pendingDelete.description} will be removed from this booking. The removal is recorded in the activity log.`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => pendingDelete && remove.mutate(pendingDelete.id)}
              disabled={remove.isPending}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {vendorQuickAdd.quickAddDialog}
    </section>
  );
}
