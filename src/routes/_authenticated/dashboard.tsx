import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { KeyRound, ShieldCheck, UserCheck } from "lucide-react";

import { PageHeader } from "@/components/app/page-header";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/app/states";
import { Badge } from "@/components/ui/badge";
import { ROLE_LABELS, useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — Triptastic Ops" },
      {
        name: "description",
        content: "Operational overview for the Triptastic Holidays internal system.",
      },
      { property: "og:title", content: "Dashboard — Triptastic Ops" },
      {
        property: "og:description",
        content: "Operational overview for the Triptastic Holidays internal system.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: DashboardPage,
});

type AuditRow = {
  id: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  created_at: string;
};

function StatCard({
  label,
  value,
  hint,
  icon: Icon,
}: {
  label: string;
  value: string;
  hint: string;
  icon: typeof ShieldCheck;
}) {
  return (
    <div className="rounded-lg border border-border bg-surface p-4 shadow-panel">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
        <Icon className="size-4 text-muted-foreground" />
      </div>
      <p className="mt-2 truncate text-xl font-semibold text-foreground">{value}</p>
      <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p>
    </div>
  );
}

function DashboardPage() {
  const { profile, roles, permissions, primaryRole, isAdmin, hasPermission } = useAuth();

  const auditQuery = useQuery({
    queryKey: ["audit-log", "recent"],
    enabled: hasPermission("audit.read"),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("audit_log")
        .select("id, action, entity_type, entity_id, created_at")
        .order("created_at", { ascending: false })
        .limit(5);
      if (error) throw error;
      return (data ?? []) as AuditRow[];
    },
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        description="Phase 1 delivers the secure foundation. Operational and financial modules arrive in later phases."
        badge={
          <Badge variant="outline" className="text-[10px] font-bold uppercase tracking-wide">
            Phase 1
          </Badge>
        }
      />

      <div className="rounded-lg border border-border bg-surface p-4 shadow-panel">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Signed in as
            </p>
            <p className="text-sm font-semibold text-foreground">
              {profile?.name || profile?.email}
            </p>
            <p className="text-xs text-muted-foreground">{profile?.email}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {roles.length === 0 ? (
              <span className="rounded border border-warning/40 bg-warning/10 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-warning-foreground">
                No role assigned
              </span>
            ) : (
              roles.map((role) => (
                <span
                  key={role}
                  className="rounded border border-brand/25 bg-brand-muted px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-brand"
                >
                  {ROLE_LABELS[role]}
                </span>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard
          label="Active role"
          value={primaryRole ? ROLE_LABELS[primaryRole] : "None"}
          hint={isAdmin ? "Full administrative access" : "Scoped access enforced by the database"}
          icon={ShieldCheck}
        />
        <StatCard
          label="Account status"
          value={profile?.is_active ? "Active" : "Inactive"}
          hint="Only administrators can change account status"
          icon={UserCheck}
        />
        <StatCard
          label="Granted permissions"
          value={String(permissions.length)}
          hint="Extensible framework for future modules"
          icon={KeyRound}
        />
      </div>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
            Recent audit activity
          </h2>
        </div>

        {!hasPermission("audit.read") ? (
          <EmptyState
            title="Audit log restricted"
            description="Your role does not include audit visibility. Administrators can review all recorded activity."
          />
        ) : auditQuery.isPending ? (
          <TableSkeleton rows={4} />
        ) : auditQuery.isError ? (
          <ErrorState onRetry={() => auditQuery.refetch()} />
        ) : auditQuery.data.length === 0 ? (
          <EmptyState
            title="No audit records yet"
            description="Entries appear here once tracked actions are performed in the application."
          />
        ) : (
          <div className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface">
            {auditQuery.data.map((row) => (
              <div key={row.id} className="flex items-start gap-3 p-3">
                <span className="mt-1.5 size-2 shrink-0 rounded-full bg-success" />
                <div className="min-w-0">
                  <p className="truncate text-xs font-semibold text-foreground">
                    {row.action} · {row.entity_type}
                    {row.entity_id ? ` (${row.entity_id})` : ""}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    {new Date(row.created_at).toLocaleString()}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
