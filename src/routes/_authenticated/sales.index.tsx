import { useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/app/page-header";
import { Field, MasterToolbar, formatDate } from "@/components/app/master-data";
import { RecordCombobox, SaleStatusBadge, type RecordOption } from "@/components/app/sales-ui";
import { useQuickAdd } from "@/components/app/quick-add";
import { EmptyState, ErrorState, TableSkeleton, UnauthorizedState } from "@/components/app/states";
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
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { SALE_STATUSES, SALE_STATUS_LABELS, saleCreateSchema } from "@/lib/sales-schemas";
import type { SaleStatus } from "@/lib/sales-schemas";
import { createSale } from "@/lib/sales.functions";

export const Route = createFileRoute("/_authenticated/sales/")({
  head: () => ({
    meta: [
      { title: "Sales bookings — Triptastic Ops" },
      { name: "description", content: "Booking register with client, destination and status." },
      { property: "og:title", content: "Sales bookings — Triptastic Ops" },
      {
        property: "og:description",
        content: "Booking register with client, destination and status.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: SalesPage,
});

export type SaleListRow = {
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

const PAGE_SIZE = 25;

function today() {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  return new Date(now.getTime() - offset * 60_000).toISOString().slice(0, 10);
}

type FormState = {
  client_id: string;
  destination_id: string;
  booking_date: string;
  travel_date: string;
  notes: string;
};

function SalesPage() {
  const { hasPermission } = useAuth();
  const canRead = hasPermission("sales.read");
  const canManage = hasPermission("sales.manage");
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"all" | SaleStatus>("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [page, setPage] = useState(0);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<FormState>({
    client_id: "",
    destination_id: "",
    booking_date: today(),
    travel_date: "",
    notes: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const createFn = useServerFn(createSale);

  const clientQuickAdd = useQuickAdd("client", (id) =>
    setForm((current) => ({ ...current, client_id: id })),
  );
  const destinationQuickAdd = useQuickAdd("destination", (id) =>
    setForm((current) => ({ ...current, destination_id: id })),
  );

  const salesQuery = useQuery({
    queryKey: ["sales"],
    enabled: canRead,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales")
        .select(SALE_SELECT)
        .order("booking_date", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as SaleListRow[];
    },
  });

  const directoryQuery = useQuery({
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

  const creatorNames = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of directoryQuery.data ?? []) map.set(row.id, row.name || "Unknown user");
    return map;
  }, [directoryQuery.data]);

  const clientOptions: RecordOption[] = useMemo(
    () =>
      (activeClientsQuery.data ?? []).map((row) => ({
        id: row.id,
        label: row.name,
        hint: row.phone,
      })),
    [activeClientsQuery.data],
  );

  const destinationOptions: RecordOption[] = useMemo(
    () =>
      (activeDestinationsQuery.data ?? []).map((row) => ({
        id: row.id,
        label: row.name,
        hint: row.country,
      })),
    [activeDestinationsQuery.data],
  );

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (salesQuery.data ?? []).filter((row) => {
      if (status !== "all" && row.status !== status) return false;
      if (fromDate && row.booking_date < fromDate) return false;
      if (toDate && row.booking_date > toDate) return false;
      if (!term) return true;
      return [row.client?.name, row.destination?.name]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(term));
    });
  }, [salesQuery.data, search, status, fromDate, toDate]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const rows = filtered.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

  const save = useMutation({
    mutationFn: async (state: FormState) => createFn({ data: saleCreateSchema.parse(state) }),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ["sales"] });
      await queryClient.invalidateQueries({ queryKey: ["audit-log"] });
      toast.success("Booking created");
      setFormOpen(false);
      void navigate({ to: "/sales/$saleId", params: { saleId: result.id } });
    },
    onError: (error: Error) => {
      toast.error("Request rejected", { description: error.message });
    },
  });

  function openCreate() {
    setForm({
      client_id: "",
      destination_id: "",
      booking_date: today(),
      travel_date: "",
      notes: "",
    });
    setErrors({});
    setFormOpen(true);
  }

  function submit() {
    const parsed = saleCreateSchema.safeParse(form);
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
        <PageHeader title="Sales" description="Booking register." />
        <UnauthorizedState />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Sales"
        description="Booking headers linking a client to a destination, each with its own booking components."
        badge={
          <Badge variant="outline" className="text-[10px] font-bold uppercase tracking-wide">
            Bookings
          </Badge>
        }
        {...(canManage
          ? {
              actions: (
                <Button size="sm" onClick={openCreate}>
                  <Plus className="size-4" />
                  New booking
                </Button>
              ),
            }
          : {})}
      />

      <MasterToolbar
        search={search}
        onSearchChange={(value) => {
          setSearch(value);
          setPage(0);
        }}
        placeholder="Search client or destination"
      >
        <Select
          value={status}
          onValueChange={(value) => {
            setStatus(value as typeof status);
            setPage(0);
          }}
        >
          <SelectTrigger className="w-[160px]" aria-label="Status filter">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {SALE_STATUSES.map((value) => (
              <SelectItem key={value} value={value}>
                {SALE_STATUS_LABELS[value]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          type="date"
          value={fromDate}
          onChange={(event) => {
            setFromDate(event.target.value);
            setPage(0);
          }}
          className="w-[150px]"
          aria-label="Booked from"
        />
        <Input
          type="date"
          value={toDate}
          onChange={(event) => {
            setToDate(event.target.value);
            setPage(0);
          }}
          className="w-[150px]"
          aria-label="Booked until"
        />
      </MasterToolbar>

      {salesQuery.isPending ? (
        <TableSkeleton />
      ) : salesQuery.isError ? (
        <ErrorState onRetry={() => salesQuery.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState
          title={salesQuery.data.length === 0 ? "No bookings yet" : "No matching bookings"}
          description={
            salesQuery.data.length === 0
              ? "Create the first booking against an active client."
              : "Adjust the search term, status or date range."
          }
          {...(canManage && salesQuery.data.length === 0
            ? {
                action: (
                  <Button size="sm" onClick={openCreate}>
                    <Plus className="size-4" />
                    New booking
                  </Button>
                ),
              }
            : {})}
        />
      ) : (
        <>
          <div className="overflow-x-auto rounded-lg border border-border bg-surface">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-[10px] uppercase tracking-wider">Booked</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wider">Client</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wider">
                    Destination
                  </TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wider">Travel</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wider">Status</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wider">Created by</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wider">Created</TableHead>
                  <TableHead className="text-right text-[10px] uppercase tracking-wider">
                    Actions
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium">{formatDate(row.booking_date)}</TableCell>
                    <TableCell>{row.client?.name ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {row.destination?.name ?? "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDate(row.travel_date)}
                    </TableCell>
                    <TableCell>
                      <SaleStatusBadge status={row.status} />
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {creatorNames.get(row.created_by) ?? "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDate(row.created_at)}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            void navigate({ to: "/sales/$saleId", params: { saleId: row.id } })
                          }
                        >
                          View
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {pageCount > 1 ? (
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>
                Page {safePage + 1} of {pageCount} · {filtered.length} bookings
              </span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={safePage === 0}
                  onClick={() => setPage(safePage - 1)}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={safePage >= pageCount - 1}
                  onClick={() => setPage(safePage + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          ) : null}
        </>
      )}

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>New booking</DialogTitle>
            <DialogDescription>
              New bookings start as Pending. Only active clients and destinations can be selected.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4">
            <Field label="Client" htmlFor="sale-client" required error={errors["client_id"]}>
              <RecordCombobox
                id="sale-client"
                options={clientOptions}
                value={form.client_id}
                onChange={(value) => setForm({ ...form, client_id: value })}
                placeholder="Select a client"
                searchPlaceholder="Search clients"
                emptyText="No active clients found"
                onCreateNew={clientQuickAdd.openQuickAdd}
                createLabel="Add new client"
              />
            </Field>
            <Field label="Destination" htmlFor="sale-destination" error={errors["destination_id"]}>
              <RecordCombobox
                id="sale-destination"
                options={destinationOptions}
                value={form.destination_id}
                onChange={(value) => setForm({ ...form, destination_id: value })}
                placeholder="Optional"
                searchPlaceholder="Search destinations"
                emptyText="No active destinations found"
                allowClear
                onCreateNew={destinationQuickAdd.openQuickAdd}
                createLabel="Add new destination"
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Booking date"
                htmlFor="sale-booking-date"
                required
                error={errors["booking_date"]}
              >
                <Input
                  id="sale-booking-date"
                  type="date"
                  value={form.booking_date}
                  onChange={(event) => setForm({ ...form, booking_date: event.target.value })}
                />
              </Field>
              <Field label="Travel date" htmlFor="sale-travel-date" error={errors["travel_date"]}>
                <Input
                  id="sale-travel-date"
                  type="date"
                  value={form.travel_date}
                  onChange={(event) => setForm({ ...form, travel_date: event.target.value })}
                />
              </Field>
            </div>
            <Field label="Notes" htmlFor="sale-notes" error={errors["notes"]}>
              <Textarea
                id="sale-notes"
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
              Create booking
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
