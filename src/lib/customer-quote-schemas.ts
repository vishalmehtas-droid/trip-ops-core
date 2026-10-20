import { z } from "zod";

import { BILLING_TYPES, salePricingValuesSchema } from "./sale-costing-schemas";
import { SALE_ITEM_TYPES } from "./sales-item-schemas";

export const CUSTOMER_QUOTE_STATUSES = [
  "draft",
  "sent",
  "accepted",
  "rejected",
  "expired",
  "superseded",
] as const;
export type CustomerQuoteStatus = (typeof CUSTOMER_QUOTE_STATUSES)[number];

export const CUSTOMER_QUOTE_STATUS_LABELS: Record<CustomerQuoteStatus, string> = {
  draft: "Draft",
  sent: "Sent",
  accepted: "Accepted",
  rejected: "Rejected",
  expired: "Expired",
  superseded: "Superseded",
};

/** Mirrors app.guard_customer_quote_update. Superseded is set only by a revision. */
export const CUSTOMER_QUOTE_TRANSITIONS: Record<CustomerQuoteStatus, CustomerQuoteStatus[]> = {
  draft: ["sent", "accepted"],
  sent: ["accepted", "rejected", "expired"],
  accepted: [],
  rejected: [],
  expired: [],
  superseded: [],
};

export const REVISABLE_STATUSES: CustomerQuoteStatus[] = ["sent", "rejected", "expired"];

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

const twoDecimals = (v: number) => Math.abs(Math.round(v * 100) - v * 100) < 1e-6;

export const customerQuoteHeaderSchema = z.object({ valid_until: isoDate, notes });

export const customerQuoteCreateSchema = z.object({
  requirement_id: uuid,
  values: customerQuoteHeaderSchema,
});
export const customerQuoteUpdateSchema = z.object({ id: uuid, values: customerQuoteHeaderSchema });
export const customerQuoteIdSchema = z.object({ id: uuid });
export const customerQuoteListSchema = z.object({ requirement_id: uuid });

export const customerQuoteStatusSchema = z.object({
  id: uuid,
  status: z.enum(["sent", "accepted", "rejected", "expired"]),
});

const lineBase = {
  purchase_type: z.enum(SALE_ITEM_TYPES, { message: "Select a purchase type" }),
  description: z.string().trim().min(1, "Description is required").max(500, "Too long"),
  quantity: z.coerce.number().int("Whole number").positive("Must be at least 1").max(9999),
};

export const manualLineValuesSchema = z.object({
  ...lineBase,
  currency: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{3}$/, "Use a 3-letter code"),
  expected_cost_inr: z.coerce
    .number({ message: "Enter an amount" })
    .min(0, "Cannot be negative")
    .max(999_999_999_999, "Too large")
    .refine(twoDecimals, "At most 2 decimals"),
});

export const customerQuoteLineAddSchema = z.discriminatedUnion("source", [
  z.object({
    source: z.literal("supplier"),
    customer_quote_id: uuid,
    supplier_quote_line_id: uuid,
  }),
  z.object({
    source: z.literal("manual"),
    customer_quote_id: uuid,
    values: manualLineValuesSchema,
  }),
]);

/** For supplier-sourced lines the database keeps the cost snapshot fixed. */
export const customerQuoteLineUpdateSchema = z.object({
  id: uuid,
  values: manualLineValuesSchema,
});
export const customerQuoteLineRemoveSchema = z.object({ id: uuid });

export const customerQuotePricingSchema = z.object({
  customer_quote_id: uuid,
  billing_type: z.enum(BILLING_TYPES),
  values: salePricingValuesSchema,
});

const customerText = z
  .string()
  .trim()
  .max(8000, "At most 8000 characters")
  .nullish()
  .transform((v) => (v ? v : null));

export const CUSTOMER_CONTENT_FIELDS = [
  "public_title",
  "summary",
  "itinerary",
  "inclusions",
  "exclusions",
  "terms",
] as const;
export type CustomerContentField = (typeof CUSTOMER_CONTENT_FIELDS)[number];

export const customerQuoteContentSchema = z.object({
  public_title: customerText,
  summary: customerText,
  itinerary: customerText,
  inclusions: customerText,
  exclusions: customerText,
  terms: customerText,
});
export const customerQuoteContentUpdateSchema = z.object({
  id: uuid,
  values: customerQuoteContentSchema,
});
export const customerQuoteShareSchema = z.object({ id: uuid, enabled: z.boolean() });
export const sharedQuoteTokenSchema = z.object({
  token: z.string().trim().min(32).max(128).regex(/^[A-Za-z0-9]+$/),
  track: z.boolean().default(true),
});
