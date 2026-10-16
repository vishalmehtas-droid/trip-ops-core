import { useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/app/page-header";
import { Field, MasterToolbar, formatDate } from "@/components/app/master-data";
import { RecordCombobox, type RecordOption } from "@/components/app/sales-ui";
import { LeadStatusBadge } from "@/components/app/leads-ui";
import { useQuickAdd } from "@/components/app/quick-add";
import { EmptyState, ErrorState, TableSkeleton, UnauthorizedState } from "@/components/app/states";
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
import {
  LEAD_STATUSES,
  LEAD_STATUS_LABELS,
  leadCreateSchema,
  type LeadStatus,
} from "@/lib/leads-schemas";
import { createLead } from "@/lib/leads.functions";

export const Route = createFileRoute("/_authenticated/leads/")({
  validateSearch: (search: Record<string, unknown>): { followup?: "due" } =>
    search["followup"] === "due" ? { followup: "due" } : {},
  head: () => ({
    meta: [
      { title: "Leads — Triptastic Ops" },
      {
        name: "description",
        content: "Enquiry pipeline with client, salesperson and lead status.",
      },
      { property: "og:title", content: "Leads — Triptastic Ops" },
      {
        property: "og:description",
        content: "Enquiry pipeline with client, salesperson and lead status.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: LeadsPage,
});

type LeadListRow = {
  id: string;
  lead_number: string;
  client_id: string;
  enquiry_date: string;
  assigned_to: string;
  source: string | null;
  follow_up_date: string | null;
  status: LeadStatus;
  updated_at: string;
  client: { id: string; name: string; is_active: boolean } | null;
};

const LEAD_SELECT =
  "id, lead_number, client_id, enquiry_date, assigned_to, source, follow_up_date, status, updated_at, client:clients(id, name, is_active)";

const PAGE_SIZE = 25;

function today() {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  return new Date(now.getTime() - offset * 60_000).toISOString().slice(0, 10);
}

type FormState = {
  client_id: string;
  enquiry_date: string;
  assigned_to: string;
  source: string;
  follow_up_date: string;
  notes: string;
};

function followUpDue(row: { follow_up_date: string | null; status: LeadStatus }) {
  return (
    row.follow_up_date !== null &&
    row.follow_up_date <= today() &&
    row.status !== "won" &&
    row.status !== "lost"
  );
}

function LeadsPage() {
  const { hasPermission, user } = useAuth();
  const canRead = hasPermission("leads.read");
  const canManage = hasPermission("leads.manage");
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const { followup } = Route.useSearch();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"all" | LeadStatus>("all");
  const [assignee, setAssignee] = useState<string>("all");
  const [followUpFilter, setFollowUpFilter] = useState<"all" | "due">(
    followup === "due" ? "due" : "all",
  );
  const [page, setPage] = useState(0);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<FormState>({
    client_id: "",
    enquiry_date: today(),
    assigned_to: "",
    source: "",
    follow_up_date: "",
    notes: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const createFn = useServerFn(createLead);

  const clientQuickAdd = useQuickAdd("client", (id) =>
    setForm((current) => ({ ...current, client_id: id })),
  );

  const leadsQuery = useQuery({
    queryKey: ["leads"],
    enabled: canRead,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leads")
        .select(LEAD_SELECT)
        .order("enquiry_date", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as LeadListRow[];
    },
  });

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

  const people = peopleQuery.data ?? [];

  const personNames = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of people) map.set(row.id, row.name || row.email || "Unknown user");
    return map;
  }, [people]);

  const assigneeOptions: RecordOption[] = useMemo(
    () =>
      people
        .filter((row) => row.is_active)
        .map((row) => ({ id: row.id, label: row.name || row.email, hint: null })),
    [people],
  );

  const clientOptions: RecordOption[] = useMemo(
    () =>
      (activeClientsQuery.data ?? []).map((row) => ({
        id: row.id,
        label: row.name,
        hint: row.phone,
      })),
    [activeClientsQuery.data],
  );

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (leadsQuery.data ?? []).filter((row) => {
      if (status !== "all" && row.status !== status) return false;
      if (assignee !== "all" && row.assigned_to !== assignee) return false;
      if (followUpFilter === "due" && !followUpDue(row)) return false;
      if (!term) return true;
      return [row.lead_number, row.client?.name, row.source]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(term));
    });
  }, [leadsQuery.data, search, status, assignee, followUpFilter]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const rows = filtered.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

  const save = useMutation({
    mutationFn: async (state: FormState) => createFn({ data: leadCreateSchema.parse(state) }),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ["leads"] });
      await queryClient.invalidateQueries({ queryKey: ["audit-log"] });
      toast.success("Lead created");
      setFormOpen(false);
      void navigate({ to: "/leads/$leadId", params: { leadId: result.id } });
    },
    onError: (error: Error) => {
      toast.error("Request rejected", { description: error.message });
    },
  });

  function openCreate() {
    setForm({
      client_id: "",
      enquiry_date: today(),
      assigned_to: user?.id ?? "",
      source: "",
      follow_up_date: "",
      notes: "",
    });
    setErrors({});
    setFormOpen(true);
  }

  function submit() {
    const parsed = leadCreateSchema.safeParse(form);
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
        <PageHeader title="Leads" description="Enquiry pipeline." />
        <UnauthorizedState />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Leads"
        description="Every enquiry with its client, owner and travel requirements."
        {...(canManage
          ? {
              actions: (
                <Button size="sm" onClick={openCreate}>
                  <Plus className="size-4" />
                  New lead
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
        placeholder="Search lead number, client or source"
      >
        <Select
          value={status}
          onValueChange={(value) => {
            setStatus(value as typeof status);
            setPage(0);
          }}
        >
          <SelectTrigger className="w-[170px]" aria-label="Status filter">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {LEAD_STATUSES.map((value) => (
              <SelectItem key={value} value={value}>
                {LEAD_STATUS_LABELS[value]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={assignee}
          onValueChange={(value) => {
            setAssignee(value);
            setPage(0);
          }}
        >
          <SelectTrigger className="w-[200px]" aria-label="Salesperson filter">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All salespeople</SelectItem>
            {people.map((row) => (
              <SelectItem key={row.id} value={row.id}>
                {row.name || row.email}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={followUpFilter}
          onValueChange={(value) => {
            setFollowUpFilter(value as typeof followUpFilter);
            setPage(0);
          }}
        >
          <SelectTrigger className="w-[160px]" aria-label="Follow-up filter">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All follow-ups</SelectItem>
            <SelectItem value="due">Follow-up due</SelectItem>
          </SelectContent>
        </Select>
      </MasterToolbar>

      {leadsQuery.isPending ? (
        <TableSkeleton />
      ) : leadsQuery.isError ? (
        <ErrorState onRetry={() => leadsQuery.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState
          title={leadsQuery.data.length === 0 ? "No leads yet" : "No matching leads"}
          description={
            leadsQuery.data.length === 0
              ? "Log the first enquiry against an active client."
              : "Adjust the search term, status or salesperson."
          }
          {...(canManage && leadsQuery.data.length === 0
            ? {
                action: (
                  <Button size="sm" onClick={openCreate}>
                    <Plus className="size-4" />
                    New lead
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
                  <TableHead className="text-[10px] uppercase tracking-wider">Lead</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wider">Client</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wider">Enquiry</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wider">
                    Assigned to
                  </TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wider">Source</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wider">
                    Follow-up
                  </TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wider">Status</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wider">Updated</TableHead>
                  <TableHead className="text-right text-[10px] uppercase tracking-wider">
                    Actions
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-mono text-xs font-medium">
                      {row.lead_number}
                    </TableCell>
                    <TableCell>{row.client?.name ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDate(row.enquiry_date)}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {personNames.get(row.assigned_to) ?? "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{row.source ?? "—"}</TableCell>
                    <TableCell
                      className={
                        row.follow_up_date && followUpDue(row)
                          ? "font-semibold text-destructive"
                          : "text-muted-foreground"
                      }
                    >
                      {row.follow_up_date ? formatDate(row.follow_up_date) : "—"}
                    </TableCell>
                    <TableCell>
                      <LeadStatusBadge status={row.status} />
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDate(row.updated_at)}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            void navigate({ to: "/leads/$leadId", params: { leadId: row.id } })
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
                Page {safePage + 1} of {pageCount} · {filtered.length} leads
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
            <DialogTitle>New lead</DialogTitle>
            <DialogDescription>
              New leads start as New and get a system-generated lead number. Only active clients and
              active colleagues can be selected.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4">
            <Field label="Client" htmlFor="lead-client" required error={errors["client_id"]}>
              <RecordCombobox
                id="lead-client"
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
                htmlFor="lead-enquiry-date"
                required
                error={errors["enquiry_date"]}
              >
                <Input
                  id="lead-enquiry-date"
                  type="date"
                  value={form.enquiry_date}
                  onChange={(event) => setForm({ ...form, enquiry_date: event.target.value })}
                />
              </Field>
              <Field label="Source" htmlFor="lead-source" error={errors["source"]}>
                <Input
                  id="lead-source"
                  value={form.source}
                  onChange={(event) => setForm({ ...form, source: event.target.value })}
                  placeholder="Referral, website, walk-in…"
                />
              </Field>
            </div>
            <Field
              label="Follow-up date"
              htmlFor="lead-follow-up"
              error={errors["follow_up_date"]}
            >
              <Input
                id="lead-follow-up"
                type="date"
                value={form.follow_up_date}
                onChange={(event) => setForm({ ...form, follow_up_date: event.target.value })}
              />
            </Field>
            <Field
              label="Assigned to"
              htmlFor="lead-assigned"
              required
              error={errors["assigned_to"]}
            >
              <RecordCombobox
                id="lead-assigned"
                options={assigneeOptions}
                value={form.assigned_to}
                onChange={(value) => setForm({ ...form, assigned_to: value })}
                placeholder="Select a salesperson"
                searchPlaceholder="Search colleagues"
                emptyText="No active users found"
              />
            </Field>
            <Field label="Notes" htmlFor="lead-notes" error={errors["notes"]}>
              <Textarea
                id="lead-notes"
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
              Create lead
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {clientQuickAdd.quickAddDialog}
    </div>
  );
}
