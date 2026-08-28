import { createServerFn } from "@tanstack/react-start";

import { setUserActiveSchema, userRoleSchema } from "./admin-schemas";
import { requirePermission } from "./authz-middleware";
import { requireActiveUser } from "./authz-middleware";

export const setUserActive = createServerFn({ method: "POST" })
  .middleware([requireActiveUser])
  .inputValidator((input: unknown) => setUserActiveSchema.parse(input))
  .handler(async ({ data, context }) => {
    requirePermission(context, "users.manage");

    if (data.userId === context.userId) {
      throw new Error("You cannot change your own account status");
    }

    const { error } = await context.supabase
      .from("profiles")
      .update({ is_active: data.isActive })
      .eq("id", data.userId);

    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const grantRole = createServerFn({ method: "POST" })
  .middleware([requireActiveUser])
  .inputValidator((input: unknown) => userRoleSchema.parse(input))
  .handler(async ({ data, context }) => {
    requirePermission(context, "users.manage");

    if (data.userId === context.userId) {
      throw new Error("You cannot change your own roles");
    }

    const { error } = await context.supabase
      .from("user_roles")
      .insert({ user_id: data.userId, role: data.role });

    if (error && !error.message.includes("duplicate key")) throw new Error(error.message);
    return { ok: true as const };
  });

export const revokeRole = createServerFn({ method: "POST" })
  .middleware([requireActiveUser])
  .inputValidator((input: unknown) => userRoleSchema.parse(input))
  .handler(async ({ data, context }) => {
    requirePermission(context, "users.manage");

    if (data.userId === context.userId) {
      throw new Error("You cannot change your own roles");
    }

    const { error } = await context.supabase
      .from("user_roles")
      .delete()
      .eq("user_id", data.userId)
      .eq("role", data.role);

    if (error) throw new Error(error.message);
    return { ok: true as const };
  });
