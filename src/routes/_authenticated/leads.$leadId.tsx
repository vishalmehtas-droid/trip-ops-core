import { useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Loader2, Pencil } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/app/page-header";
import { DetailRow, Field, formatDate, formatDateTime } from "@/components/app/master-data";
import { LeadStatusBadge } from "@/components/app/leads-ui";
import { LeadRequirements } from "@/components/app/lead-requirements";
import { RecordCombobox, type RecordOption } from "@/components/app/sales-ui";
import { useQuickAdd } from "@/components/app/quick-add";
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
  LEAD_STATUS_LABELS,
  LEAD_STATUS_TRANSITIONS,
  leadValuesSchema,
  type LeadStatus,
} from "@/lib/leads-schemas";
import { changeLeadStatus, updateLead } from "@/lib/leads.functions";

export const Route = createFileRoute("/_authenticated/leads/$leadId")({
  validateSearch: (
    search: Record<string, unknown>,
  ): { quote?: string; sq?: string; add?: string } => {
    const uuid = (value: unknown) =>
      typeof value === "string" &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
        ? value
        : undefined;
    const result: { quote?: string; sq?: string; add?: string } = {};
    const quote = uuid(search["quote"]);
    const sq = uuid(search["sq"]);
    if (quote) result.quote = quote;
    if (sq) result.sq = sq;
    if (search["add"] === "requirement") result.add = "requirement";
    return result;
  },
  head: () => ({
    meta: [
      { title: "Lead detail — Triptastic Ops" },
      { name: "description", content: "Lead detail with travel requirements and history." },
      { property: "og:title", content: "Lead detail — Triptastic Ops" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      {
        property: "og:description",
        content: "Lead detail with travel requirements and history.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: LeadDetailPage,
});

type LeadDetail = {
  id: string;
  lead_number: string;
  client_id: string;
  enquiry_date: string;
  assigned_to: string;
  source: string | null;
  follow_up_date: string | null;
  status: LeadStatus;
  notes: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  client: { id: string; name: string; phone: string | null; is_active: boolean } | null;
};

const LEAD_SELECT =
  "id, lead_number, client_id, enquiry_date, assigned_to, source, follow_up_date, status, notes, created_by, created_at, updated_at, client:clients(id, name, phone, is_active)";

type AuditRow = {
  id: string;
  action: string;
  entity_type: string;
  entity_id: string;
  created_at: string;
  user_id: string | null;
};

type FormState = {
  client_id: string;
  enquiry_date: string;
  assigned_to: string;
  source: string;
  follow_up_date: string;
  notes: string;
};

function LeadDetailPage() {
  const { leadId } = Route.useParams();
  const { quote: quoteToOpen, sq: supplierQuoteToOpen, add } = Route.useSearch();
  const { hasPermission } = useAuth();
  const canRead = hasPermission("leads.read");
  const canManage = hasPermission("leads.manage");
  const canReadAudit = hasPermission("audit.read");
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<FormState>({
    client_id: "",
    enquiry_date: "",
    assigned_to: "",
    source: "",
    follow_up_date: "",
    notes: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pendingStatus, setPendingStatus] = useState<LeadStatus | null>(null);

  const updateFn = useServerFn(updateLead);
  const statusFn = useServerFn(changeLeadStatus);

  const clientQuickAdd = useQuickAdd("client", (id) =>
    setForm((current) => ({ ...current, client_id: id })),
  );

  const leadQuery = useQuery({
    queryKey: ["leads", leadId],
    enabled: canRead,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leads")
        .select(LEAD_SELECT)
        .eq("id", leadId)
        .maybeSingle();
      if (error) throw error;
      return (data as unknown as LeadDetail | null) ?? null;
    },
  });

  const lead = leadQuery.data ?? null;

  const peopleQuery = useQuery({
    queryKey: ["profiles", "directory"],
    enabled: canRead,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, name, email, is_active")
        .order("name");
      if (error) throw error;
      return (data ?? []) as {
        id: string;
        name: string | null;
        email: string;
        is_active: boolean;
      }[];
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

  const historyQuery = useQuery({
    queryKey: ["audit-log", "lead", leadId],
    enabled: canRead && canReadAudit,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("audit_log")
        .select("id, action, entity_type, entity_id, created_at, user_id")
        .eq("entity_type", "lead")
        .eq("entity_id", leadId)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data ?? []) as AuditRow[];
    },
  });

  const people = peopleQuery.data ?? [];

  const personNames = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of people) map.set(row.id, row.name || row.email || "Unknown user");
    return map;
  }, [people]);

  const assigneeOptions: RecordOption[] = useMemo(() => {
    const options = people
      .filter((row) => row.is_active)
      .map((row) => ({ id: row.id, label: row.name || row.email, hint: null }));
    if (lead && !options.some((option) => option.id === lead.assigned_to)) {
      options.unshift({
        id: lead.assigned_to,
        label: `${personNames.get(lead.assigned_to) ?? "Unknown user"} (inactive)`,
        hint: null,
      });
    }
    return options;
  }, [people, lead, personNames]);

  const clientOptions: RecordOption[] = useMemo(() => {
    const options = (activeClientsQuery.data ?? []).map((row) => ({
      id: row.id,
      label: row.name,
      hint: row.phone,
    }));
    if (lead?.client && !options.some((option) => option.id === lead.client!.id)) {
      options.unshift({
        id: lead.client.id,
        label: `${lead.client.name} (inactive)`,
        hint: null,
      });
    }
    return options;
  }, [activeClientsQuery.data, lead]);

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ["leads"] });
    await queryClient.invalidateQueries({ queryKey: ["audit-log"] });
  };

  const save = useMutation({
    mutationFn: async (state: FormState) => {
      if (!lead) throw new Error("Lead not loaded");
      const values = leadValuesSchema.parse(state);
      return updateFn({ data: { id: lead.id, values } });
    },
    onSuccess: async () => {
      await invalidate();
      toast.success("Lead updated");
      setFormOpen(false);
    },
    onError: (error: Error) => {
      toast.error("Request rejected", { description: error.message });
    },
  });

  const changeStatus = useMutation({
    mutationFn: (next: LeadStatus) => statusFn({ data: { id: leadId, status: next } }),
    onSuccess: async (_data, next) => {
      await invalidate();
      toast.success(`Lead marked ${LEAD_STATUS_LABELS[next]}`);
      setPendingStatus(null);
    },
    onError: (error: Error) => {
      toast.error("Request rejected", { description: error.message });
      setPendingStatus(null);
    },
  });

  function openEdit() {
    if (!lead) return;
    setForm({
      client_id: lead.client_id,
      enquiry_date: lead.enquiry_date,
      assigned_to: lead.assigned_to,
      source: lead.source ?? "",
      follow_up_date: lead.follow_up_date ?? "",
      notes: lead.notes ?? "",
    });
    setErrors({});
    setFormOpen(true);
  }

  function submit() {
    const parsed = leadValuesSchema.safeParse(form);
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
        <PageHeader title="Lead" description="Enquiry detail." />
        <UnauthorizedState />
      </div>
    );
  }

  if (leadQuery.isPending) return <LoadingState label="Loading lead" />;
  if (leadQuery.isError) return <ErrorState onRetry={() => leadQuery.refetch()} />;

  if (!lead) {
    return (
      <div className="space-y-6">
        <PageHeader title="Lead not found" description="This lead is no longer available." />
        <Button variant="outline" size="sm" onClick={() => void navigate({ to: "/leads" })}>
          <ArrowLeft className="size-4" />
          Back to leads
        </Button>
      </div>
    );
  }

  const transitions = LEAD_STATUS_TRANSITIONS[lead.status];
  const isClosed = transitions.length === 0;

  return (
    <div className="space-y-6">
      <div>
        <Link
          to="/leads"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" />
          Leads
        </Link>
      </div>

      <PageHeader
        title={lead.client?.name ?? "Lead"}
        description={`${lead.lead_number} · enquiry ${formatDate(lead.enquiry_date)}${
          lead.source ? ` · ${lead.source}` : ""
        }`}
        badge={<LeadStatusBadge status={lead.status} />}
        {...(canManage
          ? {
              actions: (
                <div className="flex flex-wrap items-center gap-2">
                  {!isClosed ? (
                    <Button variant="outline" size="sm" onClick={openEdit}>
                      <Pencil className="size-3.5" />
                      Edit
                    </Button>
                  ) : null}
                  {transitions.map((next) => (
                    <Button
                      key={next}
                      size="sm"
                      variant={next === "lost" ? "outline" : "default"}
                      onClick={() => setPendingStatus(next)}
                      disabled={changeStatus.isPending}
                    >
                      Mark {LEAD_STATUS_LABELS[next]}
                    </Button>
                  ))}
                </div>
              ),
            }
          : {})}
      />

      <section className="rounded-lg border border-border bg-surface px-4 py-2">
        <h2 className="py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Lead information
        </h2>
        <dl>
          <DetailRow
            label="Lead number"
            value={<span className="font-mono text-xs">{lead.lead_number}</span>}
          />
          <DetailRow
            label="Client"
            value={
              lead.client ? (
                <span>
                  {lead.client.name}
                  {lead.client.phone ? (
                    <span className="ml-2 text-xs text-muted-foreground">{lead.client.phone}</span>
                  ) : null}
                  {!lead.client.is_active ? (
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
          <DetailRow label="Enquiry date" value={formatDate(lead.enquiry_date)} />
          <DetailRow
            label="Assigned to"
            value={personNames.get(lead.assigned_to) ?? "Unknown user"}
          />
          <DetailRow label="Source" value={lead.source} />
          <DetailRow
            label="Follow-up date"
            value={
              lead.follow_up_date ? (
                <span
                  className={
                    lead.status !== "won" &&
                    lead.status !== "lost" &&
                    lead.follow_up_date <= new Date().toISOString().slice(0, 10)
                      ? "font-semibold text-destructive"
                      : undefined
                  }
                >
                  {formatDate(lead.follow_up_date)}
                </span>
              ) : null
            }
          />
          <DetailRow label="Status" value={<LeadStatusBadge status={lead.status} />} />
          <DetailRow label="Notes" value={lead.notes} />
          <DetailRow
            label="Created by"
            value={personNames.get(lead.created_by) ?? "Unknown user"}
          />
          <DetailRow label="Created at" value={formatDateTime(lead.created_at)} />
          <DetailRow label="Last updated" value={formatDateTime(lead.updated_at)} />
        </dl>
      </section>

      <LeadRequirements
        leadId={lead.id}
        canManage={canManage && !isClosed}
        autoOpen={add === "requirement"}
        quoteToOpen={quoteToOpen}
        supplierQuoteToOpen={supplierQuoteToOpen}
      />

      {canReadAudit ? (
        <section className="rounded-lg border border-border bg-surface px-4 py-2">
          <h2 className="py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Activity
          </h2>
          {historyQuery.isPending ? (
            <p className="py-4 text-sm text-muted-foreground">Loading activity…</p>
          ) : (historyQuery.data ?? []).length === 0 ? (
            <p className="py-4 text-sm text-muted-foreground">No activity recorded yet.</p>
          ) : (
            <ul className="divide-y divide-border">
              {(historyQuery.data ?? []).map((row) => (
                <li key={row.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <span>{row.action}</span>
                  <span className="text-xs text-muted-foreground">
                    {row.user_id ? `${personNames.get(row.user_id) ?? "Unknown user"} · ` : ""}
                    {formatDateTime(row.created_at)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit lead</DialogTitle>
            <DialogDescription>
              The lead number and creator are not editable. Use the status actions to move the lead
              through the pipeline.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4">
            <Field label="Client" htmlFor="edit-lead-client" required error={errors["client_id"]}>
              <RecordCombobox
                id="edit-lead-client"
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
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Enquiry date"
                htmlFor="edit-lead-enquiry"
                required
                error={errors["enquiry_date"]}
              >
                <Input
                  id="edit-lead-enquiry"
                  type="date"
                  value={form.enquiry_date}
                  onChange={(event) => setForm({ ...form, enquiry_date: event.target.value })}
                />
              </Field>
              <Field label="Source" htmlFor="edit-lead-source" error={errors["source"]}>
                <Input
                  id="edit-lead-source"
                  value={form.source}
                  onChange={(event) => setForm({ ...form, source: event.target.value })}
                />
              </Field>
            </div>
            <Field
              label="Follow-up date"
              htmlFor="edit-lead-follow-up"
              error={errors["follow_up_date"]}
            >
              <Input
                id="edit-lead-follow-up"
                type="date"
                value={form.follow_up_date}
                onChange={(event) => setForm({ ...form, follow_up_date: event.target.value })}
              />
            </Field>
            <Field
              label="Assigned to"
              htmlFor="edit-lead-assigned"
              required
              error={errors["assigned_to"]}
            >
              <RecordCombobox
                id="edit-lead-assigned"
                options={assigneeOptions}
                value={form.assigned_to}
                onChange={(value) => setForm({ ...form, assigned_to: value })}
                placeholder="Select a salesperson"
                searchPlaceholder="Search colleagues"
                emptyText="No active users found"
              />
            </Field>
            <Field label="Notes" htmlFor="edit-lead-notes" error={errors["notes"]}>
              <Textarea
                id="edit-lead-notes"
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
              {pendingStatus ? `Mark lead ${LEAD_STATUS_LABELS[pendingStatus]}?` : ""}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingStatus === "lost"
                ? "Marking a lead lost is final: it stays on record for history but can no longer be edited."
                : pendingStatus === "won"
                  ? "Marking a lead won is final. The requirements stay linked; no booking is created automatically."
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

      {clientQuickAdd.quickAddDialog}
    </div>
  );
}
