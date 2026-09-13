import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Pencil, Plus } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/app/page-header";
import { Field, MasterToolbar, StatusBadge, formatDate } from "@/components/app/master-data";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAuth } from "@/hooks/use-auth";
import { useVendorTypes } from "@/hooks/use-vendor-types";
import { vendorTypeInputSchema, type VendorTypeRow } from "@/lib/master-schemas";
import { createVendorType, setVendorTypeActive, updateVendorType } from "@/lib/master.functions";

export const Route = createFileRoute("/_authenticated/vendor-types")({
  head: () => ({
    meta: [
      { title: "Vendor Types — Triptastic Ops" },
      {
        name: "description",
        content: "Master list of vendor categories used across vendors and bookings.",
      },
      { property: "og:title", content: "Vendor Types — Triptastic Ops" },
      {
        property: "og:description",
        content: "Master list of vendor categories used across vendors and bookings.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: VendorTypesPage,
});

function VendorTypesPage() {
  const { hasPermission } = useAuth();
  const canRead = hasPermission("vendors.read");
  const canManage = hasPermission("vendors.manage");
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"all" | "active" | "inactive">("all");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<VendorTypeRow | null>(null);
  const [name, setName] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pendingStatus, setPendingStatus] = useState<VendorTypeRow | null>(null);

  const createFn = useServerFn(createVendorType);
  const updateFn = useServerFn(updateVendorType);
  const setActiveFn = useServerFn(setVendorTypeActive);

  const typesQuery = useVendorTypes({ enabled: canRead });

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (typesQuery.data ?? []).filter((row) => {
      if (status === "active" && !row.is_active) return false;
      if (status === "inactive" && row.is_active) return false;
      if (!term) return true;
      return row.name.toLowerCase().includes(term);
    });
  }, [typesQuery.data, search, status]);

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ["vendor-types"] });
    await queryClient.invalidateQueries({ queryKey: ["vendors"] });
    await queryClient.invalidateQueries({ queryKey: ["audit-log"] });
  };

  const save = useMutation({
    mutationFn: async () => {
      const values = vendorTypeInputSchema.parse({
        name,
        is_active: editing ? editing.is_active : true,
      });
      if (editing) return updateFn({ data: { id: editing.id, values } });
      return createFn({ data: values });
    },
    onSuccess: async () => {
      await invalidate();
      toast.success(editing ? "Vendor type updated" : "Vendor type created");
      setFormOpen(false);
    },
    onError: (error: Error) => {
      toast.error("Request rejected", { description: error.message });
    },
  });

  const toggleActive = useMutation({
    mutationFn: (row: VendorTypeRow) =>
      setActiveFn({ data: { id: row.id, isActive: !row.is_active } }),
    onSuccess: async (_data, row) => {
      await invalidate();
      toast.success(row.is_active ? "Vendor type deactivated" : "Vendor type activated");
      setPendingStatus(null);
    },
    onError: (error: Error) => {
      toast.error("Request rejected", { description: error.message });
      setPendingStatus(null);
    },
  });

  function openCreate() {
    setEditing(null);
    setName("");
    setErrors({});
    setFormOpen(true);
  }

  function openEdit(row: VendorTypeRow) {
    setEditing(row);
    setName(row.name);
    setErrors({});
    setFormOpen(true);
  }

  function submit() {
    const parsed = vendorTypeInputSchema.safeParse({ name, is_active: true });
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

  if (!canRead) {
    return (
      <div className="space-y-6">
        <PageHeader title="Vendor Types" description="Vendor category master data." />
        <UnauthorizedState />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Vendor Types"
        description="Categories used when classifying vendors. Types are deactivated rather than deleted so existing vendors keep a valid category."
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
                  New vendor type
                </Button>
              ),
            }
          : {})}
      />

      <MasterToolbar search={search} onSearchChange={setSearch} placeholder="Search vendor types">
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

      {typesQuery.isPending ? (
        <TableSkeleton />
      ) : typesQuery.isError ? (
        <ErrorState onRetry={() => typesQuery.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState
          title={typesQuery.data.length === 0 ? "No vendor types yet" : "No matching vendor types"}
          description={
            typesQuery.data.length === 0
              ? "Add the categories your suppliers fall into, such as Hotel, DMC or Car Rental."
              : "Adjust the search term or filter."
          }
          {...(canManage && typesQuery.data.length === 0
            ? {
                action: (
                  <Button size="sm" onClick={openCreate}>
                    <Plus className="size-4" />
                    New vendor type
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
                  <TableCell>
                    <StatusBadge active={row.is_active} />
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDate(row.created_at)}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-2">
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
                      ) : (
                        <span className="text-xs text-muted-foreground">View only</span>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit vendor type" : "New vendor type"}</DialogTitle>
            <DialogDescription>
              Names must be unique. Existing vendors keep their category even if it is later
              deactivated.
            </DialogDescription>
          </DialogHeader>

          <Field label="Name" htmlFor="vendor-type-name" required error={errors["name"]}>
            <Input
              id="vendor-type-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              autoFocus
            />
          </Field>

          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={save.isPending}>
              {save.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
              {editing ? "Save changes" : "Create vendor type"}
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
              {pendingStatus?.is_active ? "Deactivate vendor type?" : "Activate vendor type?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingStatus?.is_active
                ? "It stops appearing in vendor forms. Vendors already using it keep the category and nothing is deleted."
                : "The type becomes selectable in vendor forms again."}
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
