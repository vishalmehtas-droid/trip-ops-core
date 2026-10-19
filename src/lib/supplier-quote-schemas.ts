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
  .nullish()
  .transform((v) => (v ? v : null));

const notes = z
  .string()
  .trim()
  .max(2000, "Notes are too long")
  .nullish()
  .transform((v) => (v ? v : null));

const longText = z
  .string()
  .trim()
  .max(8000, "Too long (max 8000 characters)")
  .nullish()
  .transform((v) => (v ? v : null));

const optionalCount = z
  .union([z.string(), z.number()])
  .nullish()
  .transform((v) => (v === null || v === undefined || String(v).trim() === "" ? null : Number(v)))
  .refine((v) => v === null || (Number.isInteger(v) && v >= 0 && v <= 999), "Enter 0–999");

export const PRICE_BASES = ["per_person", "per_room", "total"] as const;
export type PriceBasis = (typeof PRICE_BASES)[number];
export const PRICE_BASIS_LABELS: Record<PriceBasis, string> = {
  per_person: "Per person",
  per_room: "Per room",
  total: "Total",
};

export const quoteDetailsSchema = z.object({
  valid_until: isoDate,
  notes,
  adults: optionalCount,
  children: optionalCount,
  child_ages: longText,
  inclusions: longText,
  exclusions: longText,
  itinerary_notes: longText,
});

const twoDecimals = (v: number) => Math.abs(Math.round(v * 100) - v * 100) < 1e-6;

export const quoteHeaderSchema = quoteDetailsSchema.extend({ vendor_id: uuid });

export const quoteCreateSchema = z.object({
  lead_id: uuid,
  requirement_id: uuid,
  values: quoteHeaderSchema,
  /** When true the quote is created and marked Received in the same action. */
  mark_received: z.boolean().default(false),
});

export const quoteUpdateSchema = z.object({
  id: uuid,
  values: quoteDetailsSchema.optional(),
  status: z.enum(SUPPLIER_QUOTE_STATUSES).optional(),
});

export const quoteLineValuesSchema = z.object({
  price_basis: z.enum(PRICE_BASES).default("total"),
  option_label: z
    .string()
    .trim()
    .max(200, "Too long")
    .nullish()
    .transform((v) => (v ? v : null)),
  not_in_total: z.boolean().default(false),
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
export const QUOTE_FILE_TYPES: Record<string, string> = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  txt: "text/plain",
  eml: "message/rfc822",
};
export const QUOTE_FILE_MAX_BYTES = 10 * 1024 * 1024;

export const quoteFileRegisterSchema = z.object({
  supplier_quote_id: uuid,
  file_name: z.string().trim().min(1).max(255),
  storage_path: z.string().min(1).max(600),
  content_type: z.enum(Object.values(QUOTE_FILE_TYPES) as [string, ...string[]]),
  size_bytes: z.number().int().positive().max(QUOTE_FILE_MAX_BYTES, "Max 10 MB"),
});
export const quoteFileIdSchema = z.object({ id: uuid });

export const listQuotesSchema = z.object({ requirement_id: uuid });
