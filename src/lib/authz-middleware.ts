import { createMiddleware } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type AppRoleName = "admin" | "sales" | "operations" | "accounts" | "viewer";

export type AuthorizedContext = {
  userId: string;
  roles: AppRoleName[];
  permissions: string[];
  isAdmin: boolean;
};

/**
 * Server-side authorization foundation.
 *
 * Verifies the bearer token (via requireSupabaseAuth), then verifies that the
 * user still has an ACTIVE application profile and loads their roles and
 * permissions from the database. Every future mutation (including financial
 * writes) must run behind this middleware.
 */
export const requireActiveUser = createMiddleware({ type: "function" })
  .middleware([requireSupabaseAuth])
  .server(async ({ next, context }) => {
    const { supabase, userId } = context;

    const { data: profile, error } = await supabase
      .from("profiles")
      .select("id, name, email, is_active")
      .eq("id", userId)
      .maybeSingle();

    if (error) throw new Error("Unauthorized: profile could not be verified");
    if (!profile) throw new Error("Unauthorized: no application profile");
    if (!profile.is_active) throw new Error("Forbidden: this account is deactivated");

    const { data: roleRows } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);

    const roles = ((roleRows ?? []) as { role: AppRoleName }[]).map((row) => row.role);

    let permissions: string[] = [];
    if (roles.length > 0) {
      const { data: permissionRows } = await supabase
        .from("role_permissions")
        .select("permission_key")
        .in("role", roles);
      permissions = Array.from(
        new Set(
          ((permissionRows ?? []) as { permission_key: string }[]).map((r) => r.permission_key),
        ),
      );
    }

    return next({
      context: {
        profile,
        roles,
        permissions,
        isAdmin: roles.includes("admin"),
      },
    });
  });

/** Rejects the request unless the caller holds the given role. */
export function requireRole(context: AuthorizedContext, role: AppRoleName): void {
  if (!context.roles.includes(role)) {
    throw new Error(`Forbidden: the ${role} role is required`);
  }
}

/** Rejects the request unless the caller holds the given permission. */
export function requirePermission(context: AuthorizedContext, permission: string): void {
  if (context.isAdmin) return;
  if (!context.permissions.includes(permission)) {
    throw new Error(`Forbidden: missing permission ${permission}`);
  }
}

/** Rejects the request unless the caller is an active administrator. */
export function requireAdmin(context: AuthorizedContext): void {
  if (!context.isAdmin) throw new Error("Forbidden: administrator access is required");
}
