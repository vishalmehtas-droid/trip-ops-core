import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { PageHeader } from "@/components/app/page-header";
import { EmptyState, ErrorState, TableSkeleton, UnauthorizedState } from "@/components/app/states";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
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

export const Route = createFileRoute("/_authenticated/audit-log")({
  head: () => ({
    meta: [
      { title: "Audit log — Triptastic Ops" },
      { name: "description", content: "Immutable record of tracked changes across the system." },
      { property: "og:title", content: "Audit log — Triptastic Ops" },
      {
        property: "og:description",
        content: "Immutable record of tracked changes across the system.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AuditLogPage,
});

type AuditRow = {
  id: string;
  user_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  created_at: string;
};

function AuditLogPage() {
  const { hasPermission } = useAuth();
  const canRead = hasPermission("audit.read");
  const [filter, setFilter] = useState("");

  const auditQuery = useQuery({
    queryKey: ["audit-log", "all"],
    enabled: canRead,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("audit_log")
        .select("id, user_id, action, entity_type, entity_id, created_at")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as AuditRow[];
    },
  });

  const rows = (auditQuery.data ?? []).filter((row) => {
    const term = filter.trim().toLowerCase();
    if (!term) return true;
    return row.action.toLowerCase().includes(term) || row.entity_type.toLowerCase().includes(term);
  });

  if (!canRead) {
    return (
      <div className="space-y-6">
        <PageHeader title="Audit log" description="Tracked changes across the system." />
        <UnauthorizedState />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Audit log"
        description="Every tracked change is written by the database with actor, entity and before/after values."
        badge={
          <Badge variant="outline" className="text-[10px] font-bold uppercase tracking-wide">
            Phase 1
          </Badge>
        }
        actions={
          <Input
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            placeholder="Filter by action or entity"
            className="w-full sm:w-64"
          />
        }
      />

      {auditQuery.isPending ? (
        <TableSkeleton />
      ) : auditQuery.isError ? (
        <ErrorState onRetry={() => auditQuery.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState
          title="No audit entries"
          description="Records appear here as soon as tracked actions are performed in the application."
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border bg-surface">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-[10px] uppercase tracking-wider">Timestamp</TableHead>
                <TableHead className="text-[10px] uppercase tracking-wider">Action</TableHead>
                <TableHead className="text-[10px] uppercase tracking-wider">Entity</TableHead>
                <TableHead className="text-[10px] uppercase tracking-wider">Entity ID</TableHead>
                <TableHead className="text-[10px] uppercase tracking-wider">Actor</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="whitespace-nowrap font-mono text-xs tabular-nums text-muted-foreground">
                    {new Date(row.created_at).toLocaleString()}
                  </TableCell>
                  <TableCell className="font-medium">{row.action}</TableCell>
                  <TableCell>{row.entity_type}</TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {row.entity_id ?? "—"}
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {row.user_id ?? "system"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
