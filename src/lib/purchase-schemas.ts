import { z } from "zod";

export const PURCHASE_STATUSES = ["recorded", "cancelled"] as const;
export type PurchaseStatus = (typeof PURCHASE_STATUSES)[number];
export const PURCHASE_STATUS_LABELS: Record<PurchaseStatus, string> = {
  recorded: "Recorded",
  cancelled: "Cancelled",
};

const blankToNull = (max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, `${label} is too long`)
    .transform((value) => (value === "" ? null : value))
    .nullable()
    .optional()
    .transform((value) => value ?? null);

const isoDate = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid date");

const optionalDate = z
  .union([z.literal(""), z.null(), z.undefined(), isoDate])
  .transform((value) => (value ? value : null));

const optionalUuid = z
  .union([z.literal(""), z.null(), z.undefined(), z.string().uuid()])
  .transform((value) => (value ? value : null));

export const purchaseValuesSchema = z
  .object({
    vendor_id: z.string().uuid("Select a vendor"),
    vendor_invoice_number: blankToNull(100, "Invoice number"),
    invoice_date: optionalDate,
    currency_code: z
      .string()
      .trim()
      .transform((value) => value.toUpperCase())
      .refine((value) => /^[A-Z]{3}$/.test(value), "Use a 3-letter currency code"),
    exchange_rate: z.coerce
      .number({ message: "Exchange rate must be a number" })
      .positive("Exchange rate must be greater than zero")
      .max(100_000, "Exchange rate is too large"),
    amount: z.coerce
      .number({ message: "Amount must be a number" })
      .positive("Amount must be greater than zero")
      .max(99_999_999_999, "Amount is too large")
      .refine((value) => Math.abs(value * 100 - Math.round(value * 100)) < 1e-6, {
        message: "Amount can have at most 2 decimal places",
      }),
    notes: blankToNull(2000, "Notes"),
  })
  .refine((value) => value.currency_code !== "INR" || value.exchange_rate === 1, {
    path: ["exchange_rate"],
    message: "The exchange rate for INR is always 1",
  });

export const purchaseCreateSchema = z.object({
  sale_id: z.string().uuid("Select a booking"),
  values: purchaseValuesSchema,
});

export const purchaseUpdateSchema = z.object({
  id: z.string().uuid(),
  values: purchaseValuesSchema,
});

export const purchaseCancelSchema = z.object({
  id: z.string().uuid(),
  reason: z.string().trim().min(1, "A reason is required").max(1000, "Reason is too long"),
});

export const purchaseIdSchema = z.object({ id: z.string().uuid() });

export const purchaseListSchema = z
  .object({
    sale_id: optionalUuid,
    vendor_id: optionalUuid,
    from: optionalDate,
    to: optionalDate,
    status: z
      .union([z.literal(""), z.literal("all"), z.null(), z.undefined(), z.enum(PURCHASE_STATUSES)])
      .transform((value) => (value && value !== "all" ? value : null)),
  })
  .partial()
  .optional()
  .transform((value) => value ?? {});

export const bookingVarianceSchema = z.object({ sale_id: z.string().uuid() });

export type PurchaseValuesInput = z.input<typeof purchaseValuesSchema>;
