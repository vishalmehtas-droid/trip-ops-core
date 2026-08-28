import { useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Loader2, Pencil } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/app/page-header";
import { DetailRow, Field, formatDate, formatDateTime } from "@/components/app/master-data";
import { RecordCombobox, SaleStatusBadge, type RecordOption } from "@/components/app/sales-ui";
import { ErrorState, LoadingState, UnauthorizedState } from "@/components/app/states";
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
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import {
  SALE_STATUS_LABELS,
  SALE_STATUS_TRANSITIONS,
  saleEditSchema,
  type SaleStatus,
} from "@/lib/sales-schemas";
import { changeSaleStatus, updateSale } from "@/lib/sales.functions";

export const Route = createFileRoute("/_authenticated/sales/$saleId")({
  head: () => ({
    meta: [
      { title: "Booking detail — Triptastic Ops" },
      { name: "description", content: "Booking header detail with status workflow." },
      { property: "og:title", content: "Booking detail — Triptastic Ops" },
      { property: "og:description", content: "Booking header detail with status workflow." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: SaleDetailPage,
});

type SaleDetail = {
  id: string;
  client_id: string;
  destination_id: string | null;
  booking_date: string;
  travel_date: string | null;
  status: SaleStatus;
  notes: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  client: { id: string; name: string; is_active: boolean } | null;
  destination: { id: string; name: string; is_active: boolean } | null;
};

const SALE_SELECT =
  "id, client_id, destination_id, booking_date, travel_date, status, notes, created_by, created_at, updated_at, client:clients(id, name, is_active), destination:destinations(id, name, is_active)";

type FormState = {
  client_id: string;
  destination_id: string;
  travel_date: string;
  notes: string;
};

function SaleDetailPage() {
  const { saleId } = Route.useParams();
  const { hasPermission } = useAuth();
  const canRead = hasPermission("sales.read");
  const canManage = hasPermission("sales.manage");
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<FormState>({
    client_id: "",
    destination_id: "",
    travel_date: "",
    notes: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pendingStatus, setPendingStatus] = useState<SaleStatus | null>(null);

  const updateFn = useServerFn(updateSale);
  const statusFn = useServerFn(changeSaleStatus);

  const saleQuery = useQuery({
    queryKey: ["sales", saleId],
    enabled: canRead,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales")
        .select(SALE_SELECT)
        .eq("id", saleId)
        .maybeSingle();
      if (error) throw error;
      return (data as unknown as SaleDetail | null) ?? null;
    },
  });

  const sale = saleQuery.data ?? null;

  const creatorQuery = useQuery({
    queryKey: ["user-directory"],
    enabled: canRead,
    queryFn: async () => {
      const { data, error } = await supabase.from("user_directory").select("id, name");
      if (error) throw error;
      return (data ?? []) as { id: string; name: string | null }[];
    },
  });

  const activeClientsQuery = useQuery({
    queryKey: ["clients", "active"],
    enabled: canManage,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("id, name, phone")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return (data ?? []) as { id: string; name: string; phone: string | null }[];
    },
  });

  const activeDestinationsQuery = useQuery({
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

  const clientOptions: RecordOption[] = useMemo(() => {
    const options = (activeClientsQuery.data ?? []).map((row) => ({
      id: row.id,
      label: row.name,
      hint: row.phone,
    }));
    // Keep the historical client selectable-as-is when it is now inactive.
    if (sale?.client && !options.some((option) => option.id === sale.client!.id)) {
      options.unshift({
        id: sale.client.id,
        label: `${sale.client.name} (inactive)`,
        hint: null,
      });
    }
    return options;
  }, [activeClientsQuery.data, sale]);

  const destinationOptions: RecordOption[] = useMemo(() => {
    const options = (activeDestinationsQuery.data ?? []).map((row) => ({
      id: row.id,
      label: row.name,
      hint: row.country,
    }));
    if (sale?.destination && !options.some((option) => option.id === sale.destination!.id)) {
      options.unshift({
        id: sale.destination.id,
        label: `${sale.destination.name} (inactive)`,
        hint: null,
      });
    }
    return options;
  }, [activeDestinationsQuery.data, sale]);

  const creatorName = useMemo(() => {
    if (!sale) return "—";
    const match = (creatorQuery.data ?? []).find((row) => row.id === sale.created_by);
    return match?.name || "Unknown user";
  }, [creatorQuery.data, sale]);

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ["sales"] });
    await queryClient.invalidateQueries({ queryKey: ["audit-log"] });
  };

  const save = useMutation({
    mutationFn: async (state: FormState) => {
      if (!sale) throw new Error("Booking not loaded");
      const values = saleEditSchema.parse({ ...state, booking_date: sale.booking_date });
      return updateFn({ data: { id: sale.id, values } });
    },
    onSuccess: async () => {
      await invalidate();
      toast.success("Booking updated");
      setFormOpen(false);
    },
    onError: (error: Error) => {
      toast.error("Request rejected", { description: error.message });
    },
  });

  const changeStatus = useMutation({
    mutationFn: (next: SaleStatus) => statusFn({ data: { id: saleId, status: next } }),
    onSuccess: async (_data, next) => {
      await invalidate();
      toast.success(`Booking marked ${SALE_STATUS_LABELS[next]}`);
      setPendingStatus(null);
    },
    onError: (error: Error) => {
      toast.error("Request rejected", { description: error.message });
      setPendingStatus(null);
    },
  });

  function openEdit() {
    if (!sale) return;
    setForm({
      client_id: sale.client_id,
      destination_id: sale.destination_id ?? "",
      travel_date: sale.travel_date ?? "",
      notes: sale.notes ?? "",
    });
    setErrors({});
    setFormOpen(true);
  }

  function submit() {
    if (!sale) return;
    const parsed = saleEditSchema.safeParse({ ...form, booking_date: sale.booking_date });
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

  if (!canRead) {
    return (
      <div className="space-y-6">
        <PageHeader title="Booking" description="Booking header detail." />
        <UnauthorizedState />
      </div>
    );
  }

  if (saleQuery.isPending) return <LoadingState label="Loading booking" />;
  if (saleQuery.isError) return <ErrorState onRetry={() => saleQuery.refetch()} />;

  if (!sale) {
    return (
      <div className="space-y-6">
        <PageHeader title="Booking not found" description="This booking is no longer available." />
        <Button variant="outline" size="sm" onClick={() => void navigate({ to: "/sales" })}>
          <ArrowLeft className="size-4" />
          Back to sales
        </Button>
      </div>
    );
  }

  const transitions = SALE_STATUS_TRANSITIONS[sale.status];
  const isLocked = transitions.length === 0;

  return (
    <div className="space-y-6">
      <div>
        <Link
          to="/sales"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" />
          Sales
        </Link>
      </div>

      <PageHeader
        title={sale.client?.name ?? "Booking"}
        description={`Booked ${formatDate(sale.booking_date)}${
          sale.destination ? ` · ${sale.destination.name}` : ""
        }`}
        badge={<SaleStatusBadge status={sale.status} />}
        {...(canManage
          ? {
              actions: (
                <div className="flex flex-wrap items-center gap-2">
                  {!isLocked ? (
                    <Button variant="outline" size="sm" onClick={openEdit}>
                      <Pencil className="size-3.5" />
                      Edit
                    </Button>
                  ) : null}
                  {transitions.map((next) => (
                    <Button
                      key={next}
                      size="sm"
                      variant={next === "cancelled" ? "outline" : "default"}
                      onClick={() => setPendingStatus(next)}
                      disabled={changeStatus.isPending}
                    >
                      Mark {SALE_STATUS_LABELS[next]}
                    </Button>
                  ))}
                </div>
              ),
            }
          : {})}
      />

      <section className="rounded-lg border border-border bg-surface px-4 py-2">
        <h2 className="py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Booking information
        </h2>
        <dl>
          <DetailRow
            label="Booking ID"
            value={<span className="font-mono text-xs">{sale.id}</span>}
          />
          <DetailRow
            label="Client"
            value={
              sale.client ? (
                <span>
                  {sale.client.name}
                  {!sale.client.is_active ? (
                    <Badge variant="outline" className="ml-2 text-[10px] uppercase">
                      Inactive
                    </Badge>
                  ) : null}
                </span>
              ) : (
                "—"
              )
            }
          />
          <DetailRow
            label="Destination"
            value={
              sale.destination ? (
                <span>
                  {sale.destination.name}
                  {!sale.destination.is_active ? (
                    <Badge variant="outline" className="ml-2 text-[10px] uppercase">
                      Inactive
                    </Badge>
                  ) : null}
                </span>
              ) : (
                "—"
              )
            }
          />
          <DetailRow label="Booking date" value={formatDate(sale.booking_date)} />
          <DetailRow label="Travel date" value={formatDate(sale.travel_date)} />
          <DetailRow label="Status" value={<SaleStatusBadge status={sale.status} />} />
          <DetailRow label="Notes" value={sale.notes} />
          <DetailRow label="Created by" value={creatorName} />
          <DetailRow label="Created at" value={formatDateTime(sale.created_at)} />
          <DetailRow label="Last updated" value={formatDateTime(sale.updated_at)} />
        </dl>
      </section>

      <section className="rounded-lg border border-dashed border-border bg-surface px-6 py-10 text-center">
        <h2 className="text-sm font-semibold text-foreground">
          Booking Components — Coming in Phase 2B-2
        </h2>
        <p className="mx-auto mt-1 max-w-md text-xs leading-relaxed text-muted-foreground">
          Hotels, flights, visas, activities and transport line items — together with vendor
          allocation and pricing — are added in the next phase. No amounts exist on a booking yet.
        </p>
      </section>

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit booking</DialogTitle>
            <DialogDescription>
              The booking date, creator and status are not editable here. Use the status actions to
              move the booking forward.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4">
            <Field label="Client" htmlFor="edit-client" required error={errors["client_id"]}>
              <RecordCombobox
                id="edit-client"
                options={clientOptions}
                value={form.client_id}
                onChange={(value) => setForm({ ...form, client_id: value })}
                placeholder="Select a client"
                searchPlaceholder="Search clients"
                emptyText="No active clients found"
              />
            </Field>
            <Field label="Destination" htmlFor="edit-destination" error={errors["destination_id"]}>
              <RecordCombobox
                id="edit-destination"
                options={destinationOptions}
                value={form.destination_id}
                onChange={(value) => setForm({ ...form, destination_id: value })}
                placeholder="Optional"
                searchPlaceholder="Search destinations"
                emptyText="No active destinations found"
                allowClear
              />
            </Field>
            <Field label="Travel date" htmlFor="edit-travel-date" error={errors["travel_date"]}>
              <Input
                id="edit-travel-date"
                type="date"
                value={form.travel_date}
                onChange={(event) => setForm({ ...form, travel_date: event.target.value })}
              />
            </Field>
            <Field label="Notes" htmlFor="edit-notes" error={errors["notes"]}>
              <Textarea
                id="edit-notes"
                rows={3}
                value={form.notes}
                onChange={(event) => setForm({ ...form, notes: event.target.value })}
              />
            </Field>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={save.isPending}>
              {save.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
              Save changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={pendingStatus !== null}
        onOpenChange={(open) => !open && setPendingStatus(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pendingStatus ? `Mark booking ${SALE_STATUS_LABELS[pendingStatus]}?` : ""}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingStatus === "cancelled"
                ? "Cancelling is final: the booking stays on record but can no longer be edited or reopened."
                : pendingStatus === "completed"
                  ? "Completing is final: the booking can no longer be edited or cancelled."
                  : "The status change is recorded in the activity log."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => pendingStatus && changeStatus.mutate(pendingStatus)}
              disabled={changeStatus.isPending}
            >
              Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
