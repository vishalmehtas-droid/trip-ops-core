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
