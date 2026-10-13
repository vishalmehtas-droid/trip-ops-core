import { z } from "zod";

import { SALE_ITEM_TYPES } from "./sales-item-schemas";

export const SUPPLIER_QUOTE_STATUSES = ["requested", "received", "selected", "rejected"] as const;
export type SupplierQuoteStatus = (typeof SUPPLIER_QUOTE_STATUSES)[number];

export const SUPPLIER_QUOTE_STATUS_LABELS: Record<SupplierQuoteStatus, string> = {
  requested: "Requested",
  received: "Received",
  selected: "Selected",
  rejected: "Rejected",
};

/** Mirrors app.guard_supplier_quote_update in the database. */
export const SUPPLIER_QUOTE_TRANSITIONS: Record<SupplierQuoteStatus, SupplierQuoteStatus[]> = {
  requested: ["received", "rejected"],
  received: ["selected", "rejected"],
  selected: [],
  rejected: [],
};

export const isQuoteLocked = (status: SupplierQuoteStatus) =>
  status === "selected" || status === "rejected";

const uuid = z.string().uuid();

const isoDate = z
  .string()
  .trim()
  .refine((v) => v === "" || /^\d{4}-\d{2}-\d{2}$/.test(v), "Enter a valid date")
  .transform((v) => (v === "" ? null : v));

const notes = z
  .string()
  .trim()
  .max(2000, "Notes are too long")
  .transform((v) => (v === "" ? null : v));

const twoDecimals = (v: number) => Math.abs(Math.round(v * 100) - v * 100) < 1e-6;

export const quoteHeaderSchema = z.object({
  vendor_id: uuid,
  valid_until: isoDate,
  notes,
});

export const quoteCreateSchema = z.object({
  lead_id: uuid,
  requirement_id: uuid,
  values: quoteHeaderSchema,
});

export const quoteUpdateSchema = z.object({
  id: uuid,
  values: z.object({ valid_until: isoDate, notes }).optional(),
  status: z.enum(SUPPLIER_QUOTE_STATUSES).optional(),
});

export const quoteLineValuesSchema = z.object({
  is_package: z.boolean(),
  purchase_type: z.enum(SALE_ITEM_TYPES, { message: "Select a purchase type" }),
  description: z.string().trim().min(1, "Description is required").max(500, "Too long"),
  quantity: z.coerce
    .number()
    .int("Whole number")
    .positive("Must be at least 1")
    .max(9999, "Too large"),
  currency: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{3}$/, "Use a 3-letter code"),
  unit_amount: z.coerce
    .number({ message: "Enter an amount" })
    .min(0, "Cannot be negative")
    .max(999_999_999_999, "Too large")
    .refine(twoDecimals, "At most 2 decimals"),
  exchange_rate: z.coerce
    .number({ message: "Enter a rate" })
    .positive("Must be greater than zero")
    .max(1_000_000, "Too large"),
});

export const quoteLineAddSchema = z.object({
  supplier_quote_id: uuid,
  values: quoteLineValuesSchema,
});
export const quoteLineUpdateSchema = z.object({ id: uuid, values: quoteLineValuesSchema });
export const quoteLineRemoveSchema = z.object({ id: uuid });
export const quoteRevisionSchema = z.object({ id: uuid });
export const listQuotesSchema = z.object({ requirement_id: uuid });
