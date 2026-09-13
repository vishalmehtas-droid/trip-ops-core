import { useCallback, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Field } from "@/components/app/master-data";
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
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { clientInputSchema, destinationInputSchema, vendorInputSchema } from "@/lib/master-schemas";
import { createClient, createDestination, createVendor } from "@/lib/master.functions";

export type QuickAddKind = "client" | "vendor" | "destination";

type Form = {
  name: string;
  phone: string;
  email: string;
  gst_number: string;
  address: string;
  country: string;
  region: string;
  notes: string;
};

const EMPTY: Form = {
  name: "",
  phone: "",
  email: "",
  gst_number: "",
  address: "",
  country: "",
  region: "",
  notes: "",
};

const CONFIG: Record<
  QuickAddKind,
  { title: string; permission: string; table: "clients" | "vendors" | "destinations" }
> = {
  client: { title: "Add new client", permission: "clients.manage", table: "clients" },
  vendor: { title: "Add new vendor", permission: "vendors.manage", table: "vendors" },
  destination: {
    title: "Add new destination",
    permission: "destinations.manage",
    table: "destinations",
  },
};

type Match = { id: string; name: string; is_active: boolean; hint: string | null };

function issuesToErrors(issues: { path: (string | number | symbol)[]; message: string }[]) {
  const next: Record<string, string> = {};
  for (const issue of issues) {
    const key = String(issue.path[0] ?? "form");
    if (!next[key]) next[key] = issue.message;
  }
  return next;
}

/**
 * Compact inline creation of a master record from inside a transaction form.
 * Uses the existing secure server functions, validation and permissions —
 * nothing here bypasses server-side authorisation.
 */
export function QuickAddDialog({
  kind,
  open,
  onOpenChange,
  onCreated,
}: {
  kind: QuickAddKind;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Receives the id of the created (or reused) record so the caller can select it. */
  onCreated: (id: string) => void;
}) {
  const config = CONFIG[kind];
  const { hasPermission } = useAuth();
  const canManage = hasPermission(config.permission);
  const queryClient = useQueryClient();

  const [form, setForm] = useState<Form>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [matches, setMatches] = useState<Match[] | null>(null);

  const createClientFn = useServerFn(createClient);
  const createVendorFn = useServerFn(createVendor);
  const createDestinationFn = useServerFn(createDestination);

  const reset = useCallback(() => {
    setForm(EMPTY);
    setErrors({});
    setMatches(null);
  }, []);

  function close() {
    onOpenChange(false);
    reset();
  }

  /** Likely-duplicate lookup on name, and on phone/email where they apply. */
  async function findDuplicates(): Promise<Match[]> {
    const name = form.name.trim();
    const phone = form.phone.trim();
    const email = form.email.trim();

    const orParts = [`name.ilike.%${name}%`];
    if (kind !== "destination") {
      if (phone) orParts.push(`phone.eq.${phone}`);
      if (email) orParts.push(`email.ilike.${email}`);
    }

    const columns =
      kind === "destination" ? "id, name, is_active, country" : "id, name, is_active, phone, email";
    const { data, error } = await supabase
      .from(config.table)
      .select(columns)
      .or(orParts.join(","))
      .limit(5);
    if (error) return [];
    return ((data ?? []) as unknown as Record<string, string | boolean | null>[]).map((row) => ({
      id: String(row["id"]),
      name: String(row["name"]),
      is_active: Boolean(row["is_active"]),
      hint:
        kind === "destination"
          ? ((row["country"] as string | null) ?? null)
          : ((row["phone"] as string | null) ?? (row["email"] as string | null) ?? null),
    }));
  }

  const save = useMutation({
    mutationFn: async () => {
      if (kind === "client") {
        const values = clientInputSchema.parse({
          name: form.name,
          phone: form.phone,
          email: form.email,
          address: form.address,
          gst_number: form.gst_number,
          notes: form.notes,
          is_active: true,
        });
        return createClientFn({ data: values });
      }
      if (kind === "vendor") {
        const values = vendorInputSchema.parse({
          name: form.name,
          phone: form.phone,
          email: form.email,
          gst_number: form.gst_number,
          address: form.address,
          notes: form.notes,
          is_active: true,
        });
        return createVendorFn({ data: values });
      }
      const values = destinationInputSchema.parse({
        name: form.name,
        country: form.country,
        region: form.region,
        notes: form.notes,
        is_active: true,
      });
      return createDestinationFn({ data: values });
    },
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: [config.table] });
      await queryClient.invalidateQueries({ queryKey: ["audit-log"] });
      toast.success(
        kind === "client"
          ? "Client created"
          : kind === "vendor"
            ? "Vendor created"
            : "Destination created",
      );
      onCreated(result.id);
      close();
    },
    onError: (error: Error) => {
      toast.error("Request rejected", { description: error.message });
    },
  });

  const check = useMutation({
    mutationFn: findDuplicates,
    onSuccess: (found) => {
      if (found.length > 0) {
        setMatches(found);
        return;
      }
      save.mutate();
    },
    onError: () => save.mutate(),
  });

  function submit() {
    const schema =
      kind === "client"
        ? clientInputSchema
        : kind === "vendor"
          ? vendorInputSchema
          : destinationInputSchema;
    const parsed = schema.safeParse({
      name: form.name,

      phone: form.phone,
      email: form.email,
      gst_number: form.gst_number,
      address: form.address,
      country: form.country,
      region: form.region,
      notes: form.notes,
      is_active: true,
    });
    if (!parsed.success) {
      setErrors(issuesToErrors(parsed.error.issues));
      return;
    }
    setErrors({});
    if (kind === "destination") {
      save.mutate();
      return;
    }
    check.mutate();
  }

  const busy = save.isPending || check.isPending;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{config.title}</DialogTitle>
          <DialogDescription>
            Created straight away and selected here — the full record can be edited later on its own
            page.
          </DialogDescription>
        </DialogHeader>

        {!canManage ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            You do not have permission to create these records.
          </p>
        ) : matches ? (
          <div className="space-y-3">
            <p className="text-sm text-foreground">
              A similar record already exists. Use it instead of creating a duplicate?
            </p>
            <ul className="divide-y divide-border rounded-md border border-border">
              {matches.map((match) => (
                <li key={match.id} className="flex items-center justify-between gap-3 px-3 py-2">
                  <div>
                    <p className="text-sm font-medium">{match.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {match.hint ?? "No contact details"}
                      {match.is_active ? "" : " · inactive"}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!match.is_active}
                    onClick={() => {
                      onCreated(match.id);
                      close();
                    }}
                  >
                    Use existing
                  </Button>
                </li>
              ))}
            </ul>
            <DialogFooter>
              <Button variant="outline" onClick={() => setMatches(null)} disabled={busy}>
                Back
              </Button>
              <Button onClick={() => save.mutate()} disabled={busy}>
                {busy ? <Loader2 className="size-4 animate-spin" /> : null}
                Create anyway
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <>
            <div className="grid gap-4">
              <Field label="Name" htmlFor={`qa-${kind}-name`} required error={errors["name"]}>
                <Input
                  id={`qa-${kind}-name`}
                  value={form.name}
                  onChange={(event) => setForm({ ...form, name: event.target.value })}
                  autoFocus
                />
              </Field>

              {kind === "destination" ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Country" htmlFor="qa-destination-country" error={errors["country"]}>
                    <Input
                      id="qa-destination-country"
                      value={form.country}
                      onChange={(event) => setForm({ ...form, country: event.target.value })}
                    />
                  </Field>
                  <Field label="Region" htmlFor="qa-destination-region" error={errors["region"]}>
                    <Input
                      id="qa-destination-region"
                      value={form.region}
                      onChange={(event) => setForm({ ...form, region: event.target.value })}
                    />
                  </Field>
                </div>
              ) : (
                <>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Phone" htmlFor={`qa-${kind}-phone`} error={errors["phone"]}>
                      <Input
                        id={`qa-${kind}-phone`}
                        value={form.phone}
                        onChange={(event) => setForm({ ...form, phone: event.target.value })}
                      />
                    </Field>
                    <Field label="Email" htmlFor={`qa-${kind}-email`} error={errors["email"]}>
                      <Input
                        id={`qa-${kind}-email`}
                        type="email"
                        value={form.email}
                        onChange={(event) => setForm({ ...form, email: event.target.value })}
                      />
                    </Field>
                  </div>
                  <Field label="GSTIN" htmlFor={`qa-${kind}-gst`} error={errors["gst_number"]}>
                    <Input
                      id={`qa-${kind}-gst`}
                      value={form.gst_number}
                      onChange={(event) => setForm({ ...form, gst_number: event.target.value })}
                    />
                  </Field>
                  <Field label="Address" htmlFor={`qa-${kind}-address`} error={errors["address"]}>
                    <Textarea
                      id={`qa-${kind}-address`}
                      rows={2}
                      value={form.address}
                      onChange={(event) => setForm({ ...form, address: event.target.value })}
                    />
                  </Field>
                </>
              )}

              <Field label="Notes" htmlFor={`qa-${kind}-notes`} error={errors["notes"]}>
                <Textarea
                  id={`qa-${kind}-notes`}
                  rows={2}
                  value={form.notes}
                  onChange={(event) => setForm({ ...form, notes: event.target.value })}
                />
              </Field>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={close} disabled={busy}>
                Cancel
              </Button>
              <Button onClick={submit} disabled={busy}>
                {busy ? <Loader2 className="size-4 animate-spin" /> : null}
                Save
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

/**
 * Wires a quick-add dialog to a selector. Returns the trigger handler (undefined
 * when the user lacks the master-data permission) and the dialog element.
 */
export function useQuickAdd(kind: QuickAddKind, onCreated: (id: string) => void) {
  const { hasPermission } = useAuth();
  const canAdd = hasPermission(CONFIG[kind].permission);
  const [open, setOpen] = useState(false);

  const dialog = canAdd ? (
    <QuickAddDialog kind={kind} open={open} onOpenChange={setOpen} onCreated={onCreated} />
  ) : null;

  return {
    canAdd,
    openQuickAdd: canAdd ? () => setOpen(true) : undefined,
    quickAddDialog: dialog,
  };
}
