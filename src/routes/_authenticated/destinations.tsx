import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Pencil, Plus } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/app/page-header";
import {
  DetailRow,
  Field,
  MasterToolbar,
  StatusBadge,
  formatDate,
  formatDateTime,
} from "@/components/app/master-data";
import { EmptyState, ErrorState, TableSkeleton, UnauthorizedState } from "@/components/app/states";
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
import { destinationInputSchema } from "@/lib/master-schemas";
import {
  createDestination,
  setDestinationActive,
  updateDestination,
} from "@/lib/master.functions";

export const Route = createFileRoute("/_authenticated/destinations")({
  head: () => ({
    meta: [
      { title: "Destinations — Triptastic Ops" },
      { name: "description", content: "Destination master used across bookings." },
      { property: "og:title", content: "Destinations — Triptastic Ops" },
      { property: "og:description", content: "Destination master used across bookings." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: DestinationsPage,
});

type DestinationRow = {
  id: string;
  name: string;
  country: string | null;
  region: string | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

type FormState = {
  name: string;
  country: string;
  region: string;
  notes: string;
  is_active: boolean;
};

const EMPTY_FORM: FormState = {
  name: "",
  country: "",
  region: "",
  notes: "",
  is_active: true,
};

function DestinationsPage() {
  const { hasPermission } = useAuth();
  const canRead = hasPermission("destinations.read");
  const canManage = hasPermission("destinations.manage");
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [country, setCountry] = useState("all");
  const [status, setStatus] = useState<"all" | "active" | "inactive">("all");
  const [editing, setEditing] = useState<DestinationRow | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [viewing, setViewing] = useState<DestinationRow | null>(null);
  const [pendingStatus, setPendingStatus] = useState<DestinationRow | null>(null);

  const createFn = useServerFn(createDestination);
  const updateFn = useServerFn(updateDestination);
  const setActiveFn = useServerFn(setDestinationActive);

  const destinationsQuery = useQuery({
    queryKey: ["destinations"],
    enabled: canRead,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("destinations")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as DestinationRow[];
    },
  });

  const countries = useMemo(
    () =>
      Array.from(
        new Set((destinationsQuery.data ?? []).map((row) => row.country).filter(Boolean) as string[]),
      ).sort((a, b) => a.localeCompare(b)),
    [destinationsQuery.data],
  );

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (destinationsQuery.data ?? []).filter((row) => {
      if (country !== "all" && row.country !== country) return false;
      if (status === "active" && !row.is_active) return false;
      if (status === "inactive" && row.is_active) return false;
      if (!term) return true;
      return [row.name, row.country, row.region]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(term));
    });
  }, [destinationsQuery.data, search, status, country]);

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ["destinations"] });
    await queryClient.invalidateQueries({ queryKey: ["audit-log"] });
  };

  const save = useMutation({
    mutationFn: async (state: FormState) => {
      const values = destinationInputSchema.parse(state);
      if (editing) return updateFn({ data: { id: editing.id, values } });
      return createFn({ data: values });
    },
    onSuccess: async () => {
      await invalidate();
      toast.success(editing ? "Destination updated" : "Destination created");
      setFormOpen(false);
    },
    onError: (error: Error) => {
      toast.error("Request rejected", { description: error.message });
    },
  });

  const toggleActive = useMutation({
    mutationFn: (row: DestinationRow) =>
      setActiveFn({ data: { id: row.id, isActive: !row.is_active } }),
    onSuccess: async (_data, row) => {
      await invalidate();
      toast.success(row.is_active ? "Destination deactivated" : "Destination activated");
      setPendingStatus(null);
    },
    onError: (error: Error) => {
      toast.error("Request rejected", { description: error.message });
      setPendingStatus(null);
    },
  });

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setErrors({});
    setFormOpen(true);
  }

  function openEdit(row: DestinationRow) {
    setEditing(row);
    setForm({
      name: row.name,
      country: row.country ?? "",
      region: row.region ?? "",
      notes: row.notes ?? "",
      is_active: row.is_active,
    });
    setErrors({});
    setFormOpen(true);
  }

  function submit() {
    const parsed = destinationInputSchema.safeParse(form);
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
        <PageHeader title="Destinations" description="Destination master data." />
        <UnauthorizedState />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Destinations"
        description="Destination master used across bookings. Records are deactivated rather than deleted so future transactions keep a valid reference."
        badge={
          <Badge variant="outline" className="text-[10px] font-bold uppercase tracking-wide">
            Masters
          </Badge>
        }
        {...(canManage
          ? {
              actions: (
                <Button size="sm" onClick={openCreate}>
                  <Plus className="size-4" />
                  New destination
                </Button>
              ),
            }
          : {})}
      />

      <MasterToolbar search={search} onSearchChange={setSearch} placeholder="Search destinations">
        {countries.length > 0 ? (
          <Select value={country} onValueChange={setCountry}>
            <SelectTrigger className="w-[170px]" aria-label="Country filter">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All countries</SelectItem>
              {countries.map((item) => (
                <SelectItem key={item} value={item}>
                  {item}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}
        <Select value={status} onValueChange={(value) => setStatus(value as typeof status)}>
          <SelectTrigger className="w-[150px]" aria-label="Status filter">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
          </SelectContent>
        </Select>
      </MasterToolbar>

      {destinationsQuery.isPending ? (
        <TableSkeleton />
      ) : destinationsQuery.isError ? (
        <ErrorState onRetry={() => destinationsQuery.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState
          title={
            destinationsQuery.data.length === 0 ? "No destinations yet" : "No matching destinations"
          }
          description={
            destinationsQuery.data.length === 0
              ? "Add the destinations your packages are sold against."
              : "Adjust the search term or filters."
          }
          {...(canManage && destinationsQuery.data.length === 0
            ? {
                action: (
                  <Button size="sm" onClick={openCreate}>
                    <Plus className="size-4" />
                    New destination
                  </Button>
                ),
              }
            : {})}
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border bg-surface">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-[10px] uppercase tracking-wider">Name</TableHead>
                <TableHead className="text-[10px] uppercase tracking-wider">Country</TableHead>
                <TableHead className="text-[10px] uppercase tracking-wider">Region</TableHead>
                <TableHead className="text-[10px] uppercase tracking-wider">Status</TableHead>
                <TableHead className="text-[10px] uppercase tracking-wider">Created</TableHead>
                <TableHead className="text-right text-[10px] uppercase tracking-wider">
                  Actions
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-medium">{row.name}</TableCell>
                  <TableCell className="text-muted-foreground">{row.country ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{row.region ?? "—"}</TableCell>
                  <TableCell>
                    <StatusBadge active={row.is_active} />
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDate(row.created_at)}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-2">
                      <Button variant="ghost" size="sm" onClick={() => setViewing(row)}>
                        View
                      </Button>
                      {canManage ? (
                        <>
                          <Button variant="outline" size="sm" onClick={() => openEdit(row)}>
                            <Pencil className="size-3.5" />
                            Edit
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setPendingStatus(row)}
                            disabled={toggleActive.isPending}
                          >
                            {row.is_active ? "Deactivate" : "Activate"}
                          </Button>
                        </>
                      ) : null}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit destination" : "New destination"}</DialogTitle>
            <DialogDescription>Only the name is mandatory.</DialogDescription>
          </DialogHeader>

          <div className="grid gap-4">
            <Field label="Name" htmlFor="destination-name" required error={errors["name"]}>
              <Input
                id="destination-name"
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Country" htmlFor="destination-country" error={errors["country"]}>
                <Input
                  id="destination-country"
                  value={form.country}
                  onChange={(event) => setForm({ ...form, country: event.target.value })}
                />
              </Field>
              <Field label="Region" htmlFor="destination-region" error={errors["region"]}>
                <Input
                  id="destination-region"
                  value={form.region}
                  onChange={(event) => setForm({ ...form, region: event.target.value })}
                />
              </Field>
            </div>
            <Field label="Notes" htmlFor="destination-notes" error={errors["notes"]}>
              <Textarea
                id="destination-notes"
                rows={3}
                value={form.notes}
                onChange={(event) => setForm({ ...form, notes: event.target.value })}
              />
            </Field>
            <div className="flex items-center justify-between rounded-md border border-border px-3 py-2.5">
              <div>
                <p className="text-xs font-semibold">Active</p>
                <p className="text-xs text-muted-foreground">
                  Inactive destinations stay on record but are excluded from new work.
                </p>
              </div>
              <Switch
                checked={form.is_active}
                onCheckedChange={(checked) => setForm({ ...form, is_active: checked })}
                aria-label="Active status"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={save.isPending}>
              {save.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
              {editing ? "Save changes" : "Create destination"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={viewing !== null} onOpenChange={(open) => !open && setViewing(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{viewing?.name}</DialogTitle>
            <DialogDescription>Destination master record</DialogDescription>
          </DialogHeader>
          {viewing ? (
            <dl>
              <DetailRow label="Status" value={<StatusBadge active={viewing.is_active} />} />
              <DetailRow label="Country" value={viewing.country} />
              <DetailRow label="Region" value={viewing.region} />
              <DetailRow label="Notes" value={viewing.notes} />
              <DetailRow label="Created" value={formatDateTime(viewing.created_at)} />
              <DetailRow label="Last updated" value={formatDateTime(viewing.updated_at)} />
            </dl>
          ) : null}
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={pendingStatus !== null}
        onOpenChange={(open) => !open && setPendingStatus(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pendingStatus?.is_active ? "Deactivate destination?" : "Activate destination?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingStatus?.is_active
                ? "The destination stays on record and can be reactivated at any time. Nothing is deleted."
                : "The destination becomes available for new work again."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => pendingStatus && toggleActive.mutate(pendingStatus)}
              disabled={toggleActive.isPending}
            >
              Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
