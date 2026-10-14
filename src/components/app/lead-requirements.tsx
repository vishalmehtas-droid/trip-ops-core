import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowDown, ArrowUp, Loader2, Plus, X } from "lucide-react";
import { toast } from "sonner";

import { Field, formatDate } from "@/components/app/master-data";
import { RecordCombobox, type RecordOption } from "@/components/app/sales-ui";
import { RequirementStatusBadge } from "@/components/app/leads-ui";
import { useQuickAdd } from "@/components/app/quick-add";
import { SupplierQuotes } from "@/components/app/supplier-quotes";
import { CustomerQuotes } from "@/components/app/customer-quotes";
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
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import {
  REQUIREMENT_STATUS_LABELS,
  REQUIREMENT_STATUS_TRANSITIONS,
  requirementValuesSchema,
  type RequirementStatus,
} from "@/lib/leads-schemas";
import {
  changeRequirementStatus,
  createRequirement,
  updateRequirement,
} from "@/lib/leads.functions";

type RequirementRow = {
  id: string;
  requirement_number: string;
  travel_start_date: string | null;
  travel_end_date: string | null;
  adults: number;
  children: number;
  rooms: number | null;
  trip_type: string | null;
  budget: string | number | null;
  notes: string | null;
  status: RequirementStatus;
  created_at: string;
  legs: {
    id: string;
    sequence_order: number;
    destination: { id: string; name: string } | null;
  }[];
};

const REQUIREMENT_SELECT =
  "id, requirement_number, travel_start_date, travel_end_date, adults, children, rooms, trip_type, budget, notes, status, created_at, legs:travel_requirement_destinations(id, sequence_order, destination:destinations(id, name))";

type FormState = {
  destination_ids: string[];
  travel_start_date: string;
  travel_end_date: string;
  adults: string;
  children: string;
  rooms: string;
  trip_type: string;
  budget: string;
  notes: string;
};

const EMPTY_FORM: FormState = {
  destination_ids: [],
  travel_start_date: "",
  travel_end_date: "",
  adults: "1",
  children: "0",
  rooms: "",
  trip_type: "",
  budget: "",
  notes: "",
};

function formatMoney(value: string | number | null) {
  if (value === null || value === "") return "—";
  const amount = typeof value === "number" ? value : Number(value);
  if (Number.isNaN(amount)) return "—";
  return amount.toLocaleString("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  });
}

/** Travel requirements captured under a lead. Multi-destination and never deleted. */
export function LeadRequirements({
  leadId,
  canManage,
  autoOpen,
}: {
  leadId: string;
  canManage: boolean;
  autoOpen?: boolean;
}) {
  const queryClient = useQueryClient();
  const [formOpen, setFormOpen] = useState(Boolean(autoOpen));
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = useState<{ id: string; status: RequirementStatus } | null>(null);
  const [legPick, setLegPick] = useState("");

  const createFn = useServerFn(createRequirement);
  const updateFn = useServerFn(updateRequirement);
  const statusFn = useServerFn(changeRequirementStatus);

  const destinationQuickAdd = useQuickAdd("destination", (id) =>
    setForm((current) =>
      current.destination_ids.includes(id)
        ? current
        : { ...current, destination_ids: [...current.destination_ids, id] },
    ),
  );

  const requirementsQuery = useQuery({
    queryKey: ["travel-requirements", leadId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("travel_requirements")
        .select(REQUIREMENT_SELECT)
        .eq("lead_id", leadId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as RequirementRow[];
    },
  });

  const destinationsQuery = useQuery({
    queryKey: ["destinations", "active"],
    enabled: canManage,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("destinations")
        .select("id, name, country")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return (data ?? []) as { id: string; name: string; country: string | null }[];
    },
  });

  const destinationNames = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of destinationsQuery.data ?? []) map.set(row.id, row.name);
    return map;
  }, [destinationsQuery.data]);

  const destinationOptions: RecordOption[] = useMemo(
    () =>
      (destinationsQuery.data ?? [])
        .filter((row) => !form.destination_ids.includes(row.id))
        .map((row) => ({ id: row.id, label: row.name, hint: row.country })),
    [destinationsQuery.data, form.destination_ids],
  );

  const rows = requirementsQuery.data ?? [];

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ["travel-requirements", leadId] });
    await queryClient.invalidateQueries({ queryKey: ["audit-log"] });
  };

  const save = useMutation({
    mutationFn: async () => {
      const values = requirementValuesSchema.parse(form);
      if (editingId) return updateFn({ data: { id: editingId, values } });
      return createFn({ data: { lead_id: leadId, values } });
    },
    onSuccess: async () => {
      await invalidate();
      toast.success(editingId ? "Requirement updated" : "Requirement added");
      setFormOpen(false);
      setEditingId(null);
    },
    onError: (error: Error) => {
      toast.error("Request rejected", { description: error.message });
    },
  });

  const changeStatus = useMutation({
    mutationFn: (input: { id: string; status: RequirementStatus }) => statusFn({ data: input }),
    onSuccess: async (_data, input) => {
      await invalidate();
      toast.success(`Requirement marked ${REQUIREMENT_STATUS_LABELS[input.status]}`);
      setPending(null);
    },
    onError: (error: Error) => {
      toast.error("Request rejected", { description: error.message });
      setPending(null);
    },
  });

  function openCreate() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setErrors({});
    setLegPick("");
    setFormOpen(true);
  }

  function openEdit(row: RequirementRow) {
    setEditingId(row.id);
    setForm({
      destination_ids: [...row.legs]
        .sort((a, b) => a.sequence_order - b.sequence_order)
        .map((leg) => leg.destination?.id)
        .filter((id): id is string => Boolean(id)),
      travel_start_date: row.travel_start_date ?? "",
      travel_end_date: row.travel_end_date ?? "",
      adults: String(row.adults),
      children: String(row.children),
      rooms: row.rooms === null ? "" : String(row.rooms),
      trip_type: row.trip_type ?? "",
      budget: row.budget === null ? "" : String(row.budget),
      notes: row.notes ?? "",
    });
    setErrors({});
    setLegPick("");
    setFormOpen(true);
  }

  function submit() {
    const parsed = requirementValuesSchema.safeParse(form);
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
    save.mutate();
  }

  function moveLeg(index: number, direction: -1 | 1) {
    const next = [...form.destination_ids];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    const moved = next[index]!;
    next[index] = next[target]!;
    next[target] = moved;
    setForm({ ...form, destination_ids: next });
  }

  return (
    <section className="rounded-lg border border-border bg-surface">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
        <div>
          <h2 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Travel requirements
          </h2>
          <p className="text-xs text-muted-foreground">
            What the customer asked for. Earlier versions are superseded, never deleted.
          </p>
        </div>
        {canManage ? (
          <Button size="sm" onClick={openCreate}>
            <Plus className="size-4" />
            Add requirement
          </Button>
        ) : null}
      </div>

      {requirementsQuery.isPending ? (
        <p className="px-4 py-6 text-sm text-muted-foreground">Loading requirements…</p>
      ) : rows.length === 0 ? (
        <p className="px-4 py-6 text-sm text-muted-foreground">
          No requirements captured yet. Add the destinations, dates and party size the customer
          asked about.
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {rows.map((row) => {
            const legs = [...row.legs].sort((a, b) => a.sequence_order - b.sequence_order);
            const transitions = REQUIREMENT_STATUS_TRANSITIONS[row.status];
            const locked = transitions.length === 0;
            return (
              <li key={row.id} className="px-4 py-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-semibold">
                        {row.requirement_number}
                      </span>
                      <RequirementStatusBadge status={row.status} />
                    </div>
                    <p className="text-sm font-medium">
                      {legs.length > 0
                        ? legs.map((leg) => leg.destination?.name ?? "—").join(" → ")
                        : "No destinations selected"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(row.travel_start_date)} – {formatDate(row.travel_end_date)} ·{" "}
                      {row.adults} adult{row.adults === 1 ? "" : "s"}
                      {row.children > 0 ? `, ${row.children} children` : ""}
                      {row.rooms !== null ? ` · ${row.rooms} rooms` : ""}
                      {row.trip_type ? ` · ${row.trip_type}` : ""} · Budget{" "}
                      {formatMoney(row.budget)}
                    </p>
                    {row.notes ? (
                      <p className="text-xs text-muted-foreground">{row.notes}</p>
                    ) : null}
                  </div>
                  {canManage ? (
                    <div className="flex flex-wrap items-center gap-2">
                      {!locked ? (
                        <Button variant="outline" size="sm" onClick={() => openEdit(row)}>
                          Edit
                        </Button>
                      ) : null}
                      {transitions.map((next) => (
                        <Button
                          key={next}
                          variant="ghost"
                          size="sm"
                          onClick={() => setPending({ id: row.id, status: next })}
                          disabled={changeStatus.isPending}
                        >
                          Mark {REQUIREMENT_STATUS_LABELS[next]}
                        </Button>
                      ))}
                    </div>
                  ) : null}
                </div>
                <SupplierQuotes
                  leadId={leadId}
                  requirementId={row.id}
                  canManage={canManage}
                  canCreate={row.status === "draft" || row.status === "active"}
                />
                <CustomerQuotes
                  requirementId={row.id}
                  canCreate={canManage && (row.status === "draft" || row.status === "active")}
                />
              </li>
            );
          })}
        </ul>
      )}

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit requirement" : "Add requirement"}</DialogTitle>
            <DialogDescription>
              Add the stops in travel order — for example Mumbai → Jaisalmer → Udaipur.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4">
            <Field
              label="Destinations"
              htmlFor="requirement-destination"
              error={errors["destination_ids"]}
            >
              <div className="space-y-2">
                {form.destination_ids.length > 0 ? (
                  <ol className="divide-y divide-border rounded-md border border-border">
                    {form.destination_ids.map((id, index) => (
                      <li key={id} className="flex items-center gap-2 px-3 py-2">
                        <span className="w-5 text-xs font-semibold text-muted-foreground">
                          {index + 1}
                        </span>
                        <span className="flex-1 text-sm">{destinationNames.get(id) ?? id}</span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label="Move earlier"
                          onClick={() => moveLeg(index, -1)}
                          disabled={index === 0}
                        >
                          <ArrowUp className="size-3.5" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label="Move later"
                          onClick={() => moveLeg(index, 1)}
                          disabled={index === form.destination_ids.length - 1}
                        >
                          <ArrowDown className="size-3.5" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label="Remove destination"
                          onClick={() =>
                            setForm({
                              ...form,
                              destination_ids: form.destination_ids.filter((value) => value !== id),
                            })
                          }
                        >
                          <X className="size-3.5" />
                        </Button>
                      </li>
                    ))}
                  </ol>
                ) : null}
                <RecordCombobox
                  id="requirement-destination"
                  options={destinationOptions}
                  value={legPick}
                  onChange={(value) => {
                    setLegPick("");
                    if (!value || form.destination_ids.includes(value)) return;
                    setForm({ ...form, destination_ids: [...form.destination_ids, value] });
                  }}
                  placeholder="Add a destination"
                  searchPlaceholder="Search destinations"
                  emptyText="No active destinations found"
                  onCreateNew={destinationQuickAdd.openQuickAdd}
                  createLabel="Add new destination"
                />
              </div>
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Travel start"
                htmlFor="requirement-start"
                error={errors["travel_start_date"]}
              >
                <Input
                  id="requirement-start"
                  type="date"
                  value={form.travel_start_date}
                  onChange={(event) => setForm({ ...form, travel_start_date: event.target.value })}
                />
              </Field>
              <Field label="Travel end" htmlFor="requirement-end" error={errors["travel_end_date"]}>
                <Input
                  id="requirement-end"
                  type="date"
                  value={form.travel_end_date}
                  onChange={(event) => setForm({ ...form, travel_end_date: event.target.value })}
                />
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Adults" htmlFor="requirement-adults" required error={errors["adults"]}>
                <Input
                  id="requirement-adults"
                  type="number"
                  min={1}
                  value={form.adults}
                  onChange={(event) => setForm({ ...form, adults: event.target.value })}
                />
              </Field>
              <Field label="Children" htmlFor="requirement-children" error={errors["children"]}>
                <Input
                  id="requirement-children"
                  type="number"
                  min={0}
                  value={form.children}
                  onChange={(event) => setForm({ ...form, children: event.target.value })}
                />
              </Field>
              <Field label="Rooms" htmlFor="requirement-rooms" error={errors["rooms"]}>
                <Input
                  id="requirement-rooms"
                  type="number"
                  min={0}
                  value={form.rooms}
                  onChange={(event) => setForm({ ...form, rooms: event.target.value })}
                />
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Trip type" htmlFor="requirement-trip-type" error={errors["trip_type"]}>
                <Input
                  id="requirement-trip-type"
                  value={form.trip_type}
                  onChange={(event) => setForm({ ...form, trip_type: event.target.value })}
                  placeholder="Honeymoon, family, group…"
                />
              </Field>
              <Field label="Budget (INR)" htmlFor="requirement-budget" error={errors["budget"]}>
                <Input
                  id="requirement-budget"
                  type="number"
                  min={0}
                  step="0.01"
                  value={form.budget}
                  onChange={(event) => setForm({ ...form, budget: event.target.value })}
                />
              </Field>
            </div>

            <Field label="Notes" htmlFor="requirement-notes" error={errors["notes"]}>
              <Textarea
                id="requirement-notes"
                rows={3}
                value={form.notes}
                onChange={(event) => setForm({ ...form, notes: event.target.value })}
              />
            </Field>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)} disabled={save.isPending}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={save.isPending}>
              {save.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
              {editingId ? "Save changes" : "Add requirement"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={pending !== null} onOpenChange={(open) => !open && setPending(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pending ? `Mark requirement ${REQUIREMENT_STATUS_LABELS[pending.status]}?` : ""}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pending?.status === "superseded"
                ? "The requirement stays on record as history and can no longer be edited."
                : pending?.status === "closed"
                  ? "Closing is final: the requirement stays on record but can no longer be edited."
                  : "The change is recorded in the activity log."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => pending && changeStatus.mutate(pending)}
              disabled={changeStatus.isPending}
            >
              Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {destinationQuickAdd.quickAddDialog}
    </section>
  );
}
