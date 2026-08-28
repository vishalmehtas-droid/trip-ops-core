import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { PageHeader } from "@/components/app/page-header";
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
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ROLE_LABELS, useAuth, type AppRole } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/users")({
  head: () => ({
    meta: [
      { title: "Users — Triptastic Ops" },
      { name: "description", content: "Application users, roles and account status." },
      { property: "og:title", content: "Users — Triptastic Ops" },
      { property: "og:description", content: "Application users, roles and account status." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: UsersPage,
});

type ProfileRow = {
  id: string;
  name: string;
  email: string;
  is_active: boolean;
  created_at: string;
};

function UsersPage() {
  const { hasPermission, user } = useAuth();
  const queryClient = useQueryClient();
  const canRead = hasPermission("users.read");
  const canManage = hasPermission("users.manage");

  const usersQuery = useQuery({
    queryKey: ["users"],
    enabled: canRead,
    queryFn: async () => {
      const [{ data: profiles, error }, { data: roleRows, error: roleError }] = await Promise.all([
        supabase
          .from("profiles")
          .select("id, name, email, is_active, created_at")
          .order("created_at", { ascending: true }),
        supabase.from("user_roles").select("user_id, role"),
      ]);
      if (error) throw error;
      if (roleError) throw roleError;

      const rolesByUser = new Map<string, AppRole[]>();
      for (const row of (roleRows ?? []) as { user_id: string; role: AppRole }[]) {
        rolesByUser.set(row.user_id, [...(rolesByUser.get(row.user_id) ?? []), row.role]);
      }

      return ((profiles ?? []) as ProfileRow[]).map((profile) => ({
        ...profile,
        roles: rolesByUser.get(profile.id) ?? [],
      }));
    },
  });

  const toggleActive = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      const { error } = await supabase.from("profiles").update({ is_active: isActive }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: async (_data, variables) => {
      await queryClient.invalidateQueries({ queryKey: ["users"] });
      toast.success(variables.isActive ? "User activated" : "User deactivated");
    },
    onError: (error: Error) => {
      toast.error("Update rejected by the database", { description: error.message });
    },
  });

  if (!canRead) {
    return (
      <div className="space-y-6">
        <PageHeader title="Users" description="Application users and role assignment." />
        <UnauthorizedState />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Users"
        description="Accounts are created by an administrator; roles and access are enforced by the database."
        badge={
          <Badge variant="outline" className="text-[10px] font-bold uppercase tracking-wide">
            Phase 1
          </Badge>
        }
      />

      {usersQuery.isPending ? (
        <TableSkeleton />
      ) : usersQuery.isError ? (
        <ErrorState onRetry={() => usersQuery.refetch()} />
      ) : usersQuery.data.length === 0 ? (
        <EmptyState title="No user profiles yet" />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border bg-surface">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-[10px] uppercase tracking-wider">Name</TableHead>
                <TableHead className="text-[10px] uppercase tracking-wider">Email</TableHead>
                <TableHead className="text-[10px] uppercase tracking-wider">Roles</TableHead>
                <TableHead className="text-[10px] uppercase tracking-wider">Status</TableHead>
                {canManage ? <TableHead className="text-right text-[10px] uppercase">Action</TableHead> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {usersQuery.data.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-medium">{row.name || "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{row.email}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {row.roles.length === 0 ? (
                        <span className="text-xs text-muted-foreground">No role</span>
                      ) : (
                        row.roles.map((role) => (
                          <Badge key={role} variant="outline" className="text-[10px] uppercase">
                            {ROLE_LABELS[role]}
                          </Badge>
                        ))
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <span
                      className={
                        row.is_active
                          ? "inline-flex items-center gap-1.5 text-xs font-semibold text-foreground"
                          : "inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground"
                      }
                    >
                      <span
                        className={`size-2 rounded-full ${row.is_active ? "bg-success" : "bg-muted-foreground"}`}
                      />
                      {row.is_active ? "Active" : "Inactive"}
                    </span>
                  </TableCell>
                  {canManage ? (
                    <TableCell className="text-right">
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={row.id === user?.id || toggleActive.isPending}
                          >
                            {row.is_active ? "Deactivate" : "Activate"}
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>
                              {row.is_active ? "Deactivate this user?" : "Activate this user?"}
                            </AlertDialogTitle>
                            <AlertDialogDescription>
                              {row.is_active
                                ? `${row.email} will keep their login but lose permission-based access until reactivated.`
                                : `${row.email} will regain permission-based access.`}
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() =>
                                toggleActive.mutate({ id: row.id, isActive: !row.is_active })
                              }
                            >
                              Confirm
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </TableCell>
                  ) : null}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <div className="rounded-lg border border-dashed border-border bg-surface p-5">
        <h2 className="text-sm font-semibold text-foreground">Deferred to Phase 2</h2>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          Inviting new users by email and editing role assignments from this screen will be added
          with the administration module. Roles are stored in a dedicated table and every check is
          enforced by database policies, not by the interface.
        </p>
      </div>
    </div>
  );
}
