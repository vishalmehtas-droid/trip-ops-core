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
import { vendorInputSchema } from "@/lib/master-schemas";
import { createVendor, setVendorActive, updateVendor } from "@/lib/master.functions";

export const Route = createFileRoute("/_authenticated/vendors")({
  head: () => ({
    meta: [
      { title: "Vendors — Triptastic Ops" },
      { name: "description", content: "Vendor master with contact details." },
      { property: "og:title", content: "Vendors — Triptastic Ops" },
      { property: "og:description", content: "Vendor master with contact details." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: VendorsPage,
});

type VendorRow = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  gst_number: string | null;
  address: string | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

type FormState = {
  name: string;
  phone: string;
  email: string;
  gst_number: string;
  address: string;
  notes: string;
  is_active: boolean;
};

const EMPTY_FORM: FormState = {
  name: "",
  phone: "",
  email: "",
  gst_number: "",
  address: "",
  notes: "",
  is_active: true,
};

function VendorsPage() {
  const { hasPermission } = useAuth();
  const canRead = hasPermission("vendors.read");
  const canManage = hasPermission("vendors.manage");
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"all" | "active" | "inactive">("all");
  const [editing, setEditing] = useState<VendorRow | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [viewing, setViewing] = useState<VendorRow | null>(null);
  const [pendingStatus, setPendingStatus] = useState<VendorRow | null>(null);

  const createFn = useServerFn(createVendor);
  const updateFn = useServerFn(updateVendor);
  const setActiveFn = useServerFn(setVendorActive);

  const vendorsQuery = useQuery({
    queryKey: ["vendors"],
    enabled: canRead,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vendors")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as VendorRow[];
    },
  });

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (vendorsQuery.data ?? []).filter((row) => {
      if (status === "active" && !row.is_active) return false;
      if (status === "inactive" && row.is_active) return false;
      if (!term) return true;
      return [row.name, row.phone, row.email, row.gst_number]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(term));
    });
  }, [vendorsQuery.data, search, status]);

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ["vendors"] });
    await queryClient.invalidateQueries({ queryKey: ["audit-log"] });
  };

  const save = useMutation({
    mutationFn: async (state: FormState) => {
      const values = vendorInputSchema.parse(state);
      if (editing) return updateFn({ data: { id: editing.id, values } });
      return createFn({ data: values });
    },
    onSuccess: async () => {
      await invalidate();
      toast.success(editing ? "Vendor updated" : "Vendor created");
      setFormOpen(false);
    },
    onError: (error: Error) => {
      toast.error("Request rejected", { description: error.message });
    },
  });

  const toggleActive = useMutation({
    mutationFn: (row: VendorRow) => setActiveFn({ data: { id: row.id, isActive: !row.is_active } }),
    onSuccess: async (_data, row) => {
      await invalidate();
      toast.success(row.is_active ? "Vendor deactivated" : "Vendor activated");
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

  function openEdit(row: VendorRow) {
    setEditing(row);
    setForm({
      name: row.name,
      phone: row.phone ?? "",
      email: row.email ?? "",
      gst_number: row.gst_number ?? "",
      address: row.address ?? "",
      notes: row.notes ?? "",
      is_active: row.is_active,
    });
    setErrors({});
    setFormOpen(true);
  }

  function submit() {
    const parsed = vendorInputSchema.safeParse(form);
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
        <PageHeader title="Vendors" description="Vendor master data." />
        <UnauthorizedState />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Vendors"
        description="Vendor master with contact details. Records are deactivated rather than deleted so future transactions keep a valid reference."
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
                  New vendor
                </Button>
              ),
            }
          : {})}
      />

      <MasterToolbar search={search} onSearchChange={setSearch} placeholder="Search vendors">
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

      {vendorsQuery.isPending ? (
        <TableSkeleton />
      ) : vendorsQuery.isError ? (
        <ErrorState onRetry={() => vendorsQuery.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState
          title={vendorsQuery.data.length === 0 ? "No vendors yet" : "No matching vendors"}
          description={
            vendorsQuery.data.length === 0
              ? "Add hotels, DMCs, airlines, visa agents, transporters and activity partners here."
              : "Adjust the search term or filters."
          }
          {...(canManage && vendorsQuery.data.length === 0
            ? {
                action: (
                  <Button size="sm" onClick={openCreate}>
                    <Plus className="size-4" />
                    New vendor
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
            <DialogTitle>{editing ? "Edit vendor" : "New vendor"}</DialogTitle>
            <DialogDescription>Only the name is mandatory.</DialogDescription>
          </DialogHeader>

          <div className="grid gap-4">
            <Field label="Name" htmlFor="vendor-name" required error={errors["name"]}>
              <Input
                id="vendor-name"
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Phone" htmlFor="vendor-phone" error={errors["phone"]}>
                <Input
                  id="vendor-phone"
                  value={form.phone}
                  onChange={(event) => setForm({ ...form, phone: event.target.value })}
                />
              </Field>
              <Field label="Email" htmlFor="vendor-email" error={errors["email"]}>
                <Input
                  id="vendor-email"
                  value={form.email}
                  onChange={(event) => setForm({ ...form, email: event.target.value })}
                />
              </Field>
            </div>
            <Field label="GST number" htmlFor="vendor-gst" error={errors["gst_number"]}>
              <Input
                id="vendor-gst"
                value={form.gst_number}
                onChange={(event) => setForm({ ...form, gst_number: event.target.value })}
              />
            </Field>
            <Field label="Address" htmlFor="vendor-address" error={errors["address"]}>
              <Textarea
                id="vendor-address"
                rows={2}
                value={form.address}
                onChange={(event) => setForm({ ...form, address: event.target.value })}
              />
            </Field>
            <Field label="Notes" htmlFor="vendor-notes" error={errors["notes"]}>
              <Textarea
                id="vendor-notes"
                rows={3}
                value={form.notes}
                onChange={(event) => setForm({ ...form, notes: event.target.value })}
              />
            </Field>
            <div className="flex items-center justify-between rounded-md border border-border px-3 py-2.5">
              <div>
                <p className="text-xs font-semibold">Active</p>
                <p className="text-xs text-muted-foreground">
                  Inactive vendors stay on record but are excluded from new work.
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
              {editing ? "Save changes" : "Create vendor"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={viewing !== null} onOpenChange={(open) => !open && setViewing(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{viewing?.name}</DialogTitle>
            <DialogDescription>Vendor master record</DialogDescription>
          </DialogHeader>
          {viewing ? (
            <dl>
              <DetailRow label="Status" value={<StatusBadge active={viewing.is_active} />} />
              <DetailRow label="Phone" value={viewing.phone} />
              <DetailRow label="Email" value={viewing.email} />
              <DetailRow label="GST number" value={viewing.gst_number} />
              <DetailRow label="Address" value={viewing.address} />
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
              {pendingStatus?.is_active ? "Deactivate vendor?" : "Activate vendor?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingStatus?.is_active
                ? "The vendor stays on record and can be reactivated at any time. Nothing is deleted."
                : "The vendor becomes available for new work again."}
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
