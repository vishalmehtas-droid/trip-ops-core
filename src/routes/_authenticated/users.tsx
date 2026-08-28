import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, Loader2 } from "lucide-react";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { grantRole, revokeRole, setUserActive } from "@/lib/admin.functions";

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

const ALL_ROLES: AppRole[] = ["admin", "accounts", "operations", "sales", "viewer"];

function UsersPage() {
  const { hasPermission, user } = useAuth();
  const queryClient = useQueryClient();
  const canRead = hasPermission("users.read");
  const canManage = hasPermission("users.manage");

  const setActiveFn = useServerFn(setUserActive);
  const grantFn = useServerFn(grantRole);
  const revokeFn = useServerFn(revokeRole);

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

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ["users"] });
    await queryClient.invalidateQueries({ queryKey: ["audit-log"] });
  };

  const toggleActive = useMutation({
    mutationFn: (variables: { userId: string; isActive: boolean }) =>
      setActiveFn({ data: variables }),
    onSuccess: async (_data, variables) => {
      await invalidate();
      toast.success(variables.isActive ? "User activated" : "User deactivated");
    },
    onError: (error: Error) => {
      toast.error("Request rejected", { description: error.message });
    },
  });

  const changeRole = useMutation({
    mutationFn: (variables: { userId: string; role: AppRole; grant: boolean }) =>
      variables.grant
        ? grantFn({ data: { userId: variables.userId, role: variables.role } })
        : revokeFn({ data: { userId: variables.userId, role: variables.role } }),
    onSuccess: async (_data, variables) => {
      await invalidate();
      toast.success(
        variables.grant
          ? `${ROLE_LABELS[variables.role]} role granted`
          : `${ROLE_LABELS[variables.role]} role removed`,
      );
    },
    onError: (error: Error) => {
      toast.error("Role change rejected", { description: error.message });
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

  const busy = toggleActive.isPending || changeRole.isPending;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Users"
        description="Accounts are created by an administrator. Status and role changes run through authorized server-side mutations and are written to the audit log."
        badge={
          <Badge variant="outline" className="text-[10px] font-bold uppercase tracking-wide">
            Administration
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
                {canManage ? (
                  <TableHead className="text-right text-[10px] uppercase">Actions</TableHead>
                ) : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {usersQuery.data.map((row) => {
                const isSelf = row.id === user?.id;
                return (
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
                      <TableCell>
                        <div className="flex items-center justify-end gap-2">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="outline" size="sm" disabled={isSelf || busy}>
                                {changeRole.isPending ? (
                                  <Loader2 className="size-3.5 animate-spin" />
                                ) : null}
                                Roles
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-52">
                              <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
                                Toggle roles for {row.email}
                              </DropdownMenuLabel>
                              <DropdownMenuSeparator />
                              {ALL_ROLES.map((role) => {
                                const held = row.roles.includes(role);
                                return (
                                  <DropdownMenuItem
                                    key={role}
                                    onSelect={(event) => {
                                      event.preventDefault();
                                      changeRole.mutate({
                                        userId: row.id,
                                        role,
                                        grant: !held,
                                      });
                                    }}
                                  >
                                    <span className="flex w-4 justify-center">
                                      {held ? <Check className="size-3.5" /> : null}
                                    </span>
                                    {ROLE_LABELS[role]}
                                  </DropdownMenuItem>
                                );
                              })}
                            </DropdownMenuContent>
                          </DropdownMenu>

                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="outline" size="sm" disabled={isSelf || busy}>
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
                                    ? `${row.email} keeps their login but immediately loses all application access and privileges until reactivated.`
                                    : `${row.email} will regain access based on their assigned roles.`}
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() =>
                                    toggleActive.mutate({
                                      userId: row.id,
                                      isActive: !row.is_active,
                                    })
                                  }
                                >
                                  Confirm
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </TableCell>
                    ) : null}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <div className="rounded-lg border border-dashed border-border bg-surface p-5">
        <h2 className="text-sm font-semibold text-foreground">How access is enforced</h2>
        <ul className="mt-2 space-y-1 text-xs leading-relaxed text-muted-foreground">
          <li>· You cannot change your own status or roles — another administrator must do it.</li>
          <li>· The last active administrator cannot be demoted or deactivated.</li>
          <li>· Every status and role change is written to the append-only audit log.</li>
          <li>· Inviting users by email arrives with the administration module in a later phase.</li>
        </ul>
      </div>
    </div>
  );
}
