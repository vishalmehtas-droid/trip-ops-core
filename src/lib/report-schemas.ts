import { z } from "zod";

const optionalDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid date")
  .optional();

export const clientLedgerSchema = z.object({
  client_id: z.string().uuid(),
  from: optionalDate,
  to: optionalDate,
});

export const vendorLedgerSchema = z.object({
  vendor_id: z.string().uuid(),
  from: optionalDate,
  to: optionalDate,
});

export const dateRangeSchema = z.object({
  from: optionalDate,
  to: optionalDate,
});

export const profitabilitySchema = dateRangeSchema.extend({
  salesperson_id: z.string().uuid().optional(),
  destination_id: z.string().uuid().optional(),
});

/** Period reports (cashflow, profitability, GST) are Admin/Accounts only. */
export function canAccessReport(roles: string[], isAdmin: boolean): boolean {
  return isAdmin || roles.includes("accounts");
}

export type LedgerKind = "client" | "vendor";

/**
 * Report visibility: Admin and Accounts see both ledgers; Sales and Operations
 * see the Client Ledger only (further limited to clients with their bookings
 * in the server function); Viewer has no access.
 */
export function canAccessLedger(kind: LedgerKind, roles: string[], isAdmin: boolean): boolean {
  if (isAdmin || roles.includes("accounts")) return true;
  if (kind === "client") return roles.includes("sales") || roles.includes("operations");
  return false;
}
