import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Pencil, Plus } from "lucide-react";
import { toast } from "sonner";

import { ClientSourceFields } from "@/components/app/client-source-fields";
import { PageHeader } from "@/components/app/page-header";
import { CsvImportActions } from "@/components/app/csv-import";
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
import { clientInputSchema } from "@/lib/master-schemas";
import { createClient, setClientActive, updateClient } from "@/lib/master.functions";

export const Route = createFileRoute("/_authenticated/clients")({
  head: () => ({
    meta: [
      { title: "Clients — Triptastic Ops" },
      { name: "description", content: "Client master with contact and billing details." },
      { property: "og:title", content: "Clients — Triptastic Ops" },
      { property: "og:description", content: "Client master with contact and billing details." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ClientsPage,
});

type ClientRow = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  gst_number: string | null;
  state: string | null;
  notes: string | null;
  source: string | null;
  referred_by: string | null;
  markup_percent_override: number | string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

type FormState = {
  name: string;
  phone: string;
  email: string;
  address: string;
  gst_number: string;
  state: string;
  notes: string;
  source: string;
  referred_by: string;
  markup_percent_override: string;
  is_active: boolean;
};

const EMPTY_FORM: FormState = {
  name: "",
  phone: "",
  email: "",
  address: "",
  gst_number: "",
  state: "",
  notes: "",
  source: "",
  referred_by: "",
  markup_percent_override: "",
  is_active: true,
};

function ClientsPage() {
  const { hasPermission } = useAuth();
  const canRead = hasPermission("clients.read");
  const canManage = hasPermission("clients.manage");
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"all" | "active" | "inactive">("all");
  const [editing, setEditing] = useState<ClientRow | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [viewing, setViewing] = useState<ClientRow | null>(null);
  const [pendingStatus, setPendingStatus] = useState<ClientRow | null>(null);

  const createFn = useServerFn(createClient);
  const updateFn = useServerFn(updateClient);
  const setActiveFn = useServerFn(setClientActive);

  const clientsQuery = useQuery({
    queryKey: ["clients"],
    enabled: canRead,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ClientRow[];
    },
  });

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (clientsQuery.data ?? []).filter((row) => {
      if (status === "active" && !row.is_active) return false;
      if (status === "inactive" && row.is_active) return false;
      if (!term) return true;
      return [row.name, row.phone, row.email, row.gst_number]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(term));
    });
  }, [clientsQuery.data, search, status]);

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ["clients"] });
    await queryClient.invalidateQueries({ queryKey: ["audit-log"] });
  };

  const save = useMutation({
    mutationFn: async (state: FormState) => {
      const values = clientInputSchema.parse(state);
      if (editing) return updateFn({ data: { id: editing.id, values } });
      return createFn({ data: values });
    },
    onSuccess: async () => {
      await invalidate();
      toast.success(editing ? "Client updated" : "Client created");
      setFormOpen(false);
    },
    onError: (error: Error) => {
      toast.error("Request rejected", { description: error.message });
    },
  });

  const toggleActive = useMutation({
    mutationFn: (row: ClientRow) => setActiveFn({ data: { id: row.id, isActive: !row.is_active } }),
    onSuccess: async (_data, row) => {
      await invalidate();
      toast.success(row.is_active ? "Client deactivated" : "Client activated");
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

  function openEdit(row: ClientRow) {
    setEditing(row);
    setForm({
      name: row.name,
      phone: row.phone ?? "",
      email: row.email ?? "",
      address: row.address ?? "",
      gst_number: row.gst_number ?? "",
      state: row.state ?? "",
      notes: row.notes ?? "",
      source: row.source ?? "",
      referred_by: row.referred_by ?? "",
      markup_percent_override:
        row.markup_percent_override === null ? "" : String(row.markup_percent_override),
      is_active: row.is_active,
    });
    setErrors({});
    setFormOpen(true);
  }

  function submit() {
    const parsed = clientInputSchema.safeParse(form);
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
        <PageHeader title="Clients" description="Client master data." />
        <UnauthorizedState />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Clients"
        description="Client master with contact and billing details. Records are deactivated rather than deleted so future transactions keep a valid reference."
        badge={
          <Badge variant="outline" className="text-[10px] font-bold uppercase tracking-wide">
            Masters
          </Badge>
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <CsvImportActions kind="clients" queryKey={["clients"]} />
            {canManage ? (
              <Button size="sm" onClick={openCreate}>
                <Plus className="size-4" />
                New client
              </Button>
            ) : null}
          </div>
        }
      />

      <MasterToolbar search={search} onSearchChange={setSearch} placeholder="Search clients">
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

      {clientsQuery.isPending ? (
        <TableSkeleton />
      ) : clientsQuery.isError ? (
        <ErrorState onRetry={() => clientsQuery.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState
          title={clientsQuery.data.length === 0 ? "No clients yet" : "No matching clients"}
          description={
            clientsQuery.data.length === 0
              ? "Add your first client to start building the master data."
              : "Adjust the search term or status filter."
          }
          {...(canManage && clientsQuery.data.length === 0
            ? {
                action: (
                  <Button size="sm" onClick={openCreate}>
                    <Plus className="size-4" />
                    New client
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
                <TableHead className="text-[10px] uppercase tracking-wider">Phone</TableHead>
                <TableHead className="text-[10px] uppercase tracking-wider">Email</TableHead>
                <TableHead className="text-[10px] uppercase tracking-wider">GST number</TableHead>
                <TableHead className="text-[10px] uppercase tracking-wider">Source</TableHead>
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
                  <TableCell className="text-muted-foreground">{row.phone ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{row.email ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{row.gst_number ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">
                    <div>{row.source ?? "—"}</div>
                    {row.referred_by ? <div className="text-xs">by {row.referred_by}</div> : null}
                  </TableCell>
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

      {/* Create / edit */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit client" : "New client"}</DialogTitle>
            <DialogDescription>
              Only the name is mandatory. Contact details may be shared between clients.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4">
            <Field label="Name" htmlFor="client-name" required error={errors["name"]}>
              <Input
                id="client-name"
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Phone" htmlFor="client-phone" error={errors["phone"]}>
                <Input
                  id="client-phone"
                  value={form.phone}
                  onChange={(event) => setForm({ ...form, phone: event.target.value })}
                />
              </Field>
              <Field label="Email" htmlFor="client-email" error={errors["email"]}>
                <Input
                  id="client-email"
                  value={form.email}
                  onChange={(event) => setForm({ ...form, email: event.target.value })}
                />
              </Field>
            </div>
            <Field label="GST number" htmlFor="client-gst" error={errors["gst_number"]}>
              <Input
                id="client-gst"
                value={form.gst_number}
                onChange={(event) => setForm({ ...form, gst_number: event.target.value })}
              />
            </Field>
            <Field label="State (place of supply)" htmlFor="client-state" error={errors["state"]}>
              <Input
                id="client-state"
                placeholder="e.g. Maharashtra"
                value={form.state}
                onChange={(event) => setForm({ ...form, state: event.target.value })}
              />
            </Field>
            <ClientSourceFields
              idPrefix="client"
              source={form.source}
              referredBy={form.referred_by}
              errors={errors}
              onChange={(source, referred_by) => setForm({ ...form, source, referred_by })}
            />
            <Field
              label="Special markup % (leave blank to use the default)"
              htmlFor="client-markup"
              error={errors["markup_percent_override"]}
            >
              <Input
                id="client-markup"
                type="number"
                min="0"
                step="0.01"
                value={form.markup_percent_override}
                onChange={(event) =>
                  setForm({ ...form, markup_percent_override: event.target.value })
                }
              />
            </Field>
            <Field label="Address" htmlFor="client-address" error={errors["address"]}>
              <Textarea
                id="client-address"
                rows={2}
                value={form.address}
                onChange={(event) => setForm({ ...form, address: event.target.value })}
              />
            </Field>
            <Field label="Notes" htmlFor="client-notes" error={errors["notes"]}>
              <Textarea
                id="client-notes"
                rows={3}
                value={form.notes}
                onChange={(event) => setForm({ ...form, notes: event.target.value })}
              />
            </Field>
            <div className="flex items-center justify-between rounded-md border border-border px-3 py-2.5">
              <div>
                <p className="text-xs font-semibold">Active</p>
                <p className="text-xs text-muted-foreground">
                  Inactive clients stay on record but are excluded from new work.
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
              {editing ? "Save changes" : "Create client"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detail view */}
      <Dialog open={viewing !== null} onOpenChange={(open) => !open && setViewing(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{viewing?.name}</DialogTitle>
            <DialogDescription>Client master record</DialogDescription>
          </DialogHeader>
          {viewing ? (
            <dl>
              <DetailRow label="Status" value={<StatusBadge active={viewing.is_active} />} />
              <DetailRow label="Phone" value={viewing.phone} />
              <DetailRow label="Email" value={viewing.email} />
              <DetailRow label="GST number" value={viewing.gst_number} />
              <DetailRow label="State" value={viewing.state} />
              <DetailRow label="Source" value={viewing.source} />
              {viewing.source === "Referral" ? (
                <DetailRow label="Referred by" value={viewing.referred_by} />
              ) : null}
              <DetailRow label="Address" value={viewing.address} />
              <DetailRow
                label="Special markup %"
                value={
                  viewing.markup_percent_override === null
                    ? null
                    : `${viewing.markup_percent_override}%`
                }
              />
              <DetailRow label="Notes" value={viewing.notes} />
              <DetailRow label="Created" value={formatDateTime(viewing.created_at)} />
              <DetailRow label="Last updated" value={formatDateTime(viewing.updated_at)} />
            </dl>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* Status confirmation */}
      <AlertDialog
        open={pendingStatus !== null}
        onOpenChange={(open) => !open && setPendingStatus(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pendingStatus?.is_active ? "Deactivate client?" : "Activate client?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingStatus?.is_active
                ? "The client stays on record and can be reactivated at any time. Nothing is deleted."
                : "The client becomes available for new work again."}
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
