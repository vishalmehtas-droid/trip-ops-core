import { z } from "zod";

export const appRoleSchema = z.enum(["admin", "sales", "operations", "accounts", "viewer"]);

export const setUserActiveSchema = z.object({
  userId: z.string().uuid(),
  isActive: z.boolean(),
});

export const userRoleSchema = z.object({
  userId: z.string().uuid(),
  role: appRoleSchema,
});
