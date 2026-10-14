import { z } from "zod";

export const SALE_COST_TYPES = [
  "tour_package",
  "hotel",
  "flight",
  "visa",
  "activity",
  "transport",
  "land_package",
  "full_package",
  "other",
] as const;

export type SaleCostType = (typeof SALE_COST_TYPES)[number];

export const SALE_COST_TYPE_LABELS: Record<SaleCostType, string> = {
  tour_package: "Tour Package",
  hotel: "Hotel",
  flight: "Flight",
  visa: "Visa",
  activity: "Activity",
  transport: "Car Rental",
  land_package: "Land Package",
  full_package: "Full Package",
  other: "Other",
};

export const MARKUP_TYPES = ["percentage", "lumpsum", "none"] as const;

export type MarkupType = (typeof MARKUP_TYPES)[number];

export const MARKUP_TYPE_LABELS: Record<MarkupType, string> = {
  percentage: "Percentage",
  lumpsum: "Lumpsum",
  none: "None",
};

export const BILLING_TYPES = ["tour_package", "standalone_service"] as const;

export type BillingType = (typeof BILLING_TYPES)[number];

export const BILLING_TYPE_LABELS: Record<BillingType, string> = {
  tour_package: "Tour package",
  standalone_service: "Standalone service",
};

export const BILLING_TYPE_HINTS: Record<BillingType, string> = {
  tour_package: "Hotel, activities and transfers sold together — GST 5% on the selling value.",
  standalone_service:
    "Hotel only, flight only, visa or another single service — GST 18% on the service charge only.",
};

export const DEFAULT_TCS_RATE = "2.00";

/** Money is entered as text and validated to two decimals; the server recalculates all totals. */
const money = (label: string) =>
  z.coerce
    .number({ message: `${label} must be a number` })
    .min(0, `${label} cannot be negative`)
    .max(99_999_999_999, `${label} is too large`)
    .refine((value) => Number.isFinite(value), `${label} must be a number`)
    .refine((value) => Math.round(value * 100) === Number((value * 100).toFixed(0)), {
      message: `${label} can have at most 2 decimal places`,
    });

const rate = (label: string) =>
  z.coerce
    .number({ message: `${label} must be a number` })
    .min(0, `${label} cannot be negative`)
    .max(100, `${label} cannot exceed 100`);

const optionalVendorId = z
  .string()
  .trim()
  .refine((value) => value === "" || z.string().uuid().safeParse(value).success, {
    message: "Select a valid vendor",
  })
  .transform((value) => (value === "" ? null : value))
  .nullable()
  .optional()
  .transform((value) => value ?? null);

const optionalNotes = z
  .string()
  .trim()
  .max(2000, "Notes are too long")
  .transform((value) => (value === "" ? null : value))
  .nullable()
  .optional()
  .transform((value) => value ?? null);

export const saleCostValuesSchema = z
  .object({
    cost_type: z.enum(SALE_COST_TYPES, { message: "Select a purchase type" }),

    description: z
      .string()
      .trim()
      .min(1, "Description is required")
      .max(500, "Description is too long"),
    vendor_id: optionalVendorId,
    quantity: z.coerce
      .number()
      .int("Quantity must be a whole number")
      .positive("Quantity must be greater than zero")
      .max(9999, "Quantity is too large"),
    unit_cost: money("Unit cost"),
    currency_code: z
      .string()
      .trim()
      .transform((value) => value.toUpperCase())
      .refine((value) => /^[A-Z]{3}$/.test(value), "Use a 3-letter currency code"),
    exchange_rate: z.coerce
      .number({ message: "Exchange rate must be a number" })
      .positive("Exchange rate must be greater than zero")
      .max(100_000, "Exchange rate is too large"),
    notes: optionalNotes,
  })
  .refine((value) => value.currency_code !== "INR" || value.exchange_rate === 1, {
    path: ["exchange_rate"],
    message: "The exchange rate for INR is always 1",
  });

export const saleCostCreateSchema = z.object({
  sale_id: z.string().uuid(),
  values: saleCostValuesSchema,
});

export const saleCostUpdateSchema = z.object({
  id: z.string().uuid(),
  values: saleCostValuesSchema,
});

export const saleCostDeleteSchema = z.object({
  id: z.string().uuid(),
});

export const salePricingValuesSchema = z
  .object({
    markup_type: z.enum(MARKUP_TYPES, { message: "Select a markup type" }),
    markup_value: money("Markup value"),
    discount_amount: money("Discount"),
    tcs_applicable: z.boolean(),
    tcs_rate: z
      .union([z.literal("").transform(() => null), z.null(), rate("TCS rate")])
      .optional()
      .transform((value) => value ?? null),
  })
  .refine((value) => !value.tcs_applicable || typeof value.tcs_rate === "number", {
    path: ["tcs_rate"],
    message: "A TCS rate is required when TCS applies",
  })
  .refine((value) => value.markup_type === "none" || value.markup_value > 0, {
    path: ["markup_value"],
    message: "Enter a markup value",
  });

export const salePricingUpdateSchema = z.object({
  sale_id: z.string().uuid(),
  values: salePricingValuesSchema,
});

export const salePricingRecalculateSchema = z.object({
  sale_id: z.string().uuid(),
});

export type SaleCostValuesInput = z.input<typeof saleCostValuesSchema>;
export type SalePricingValuesInput = z.input<typeof salePricingValuesSchema>;

/** Display helper only — never used as a financial authority. */
export function formatMoney(value: number | string | null | undefined, currency = "INR"): string {
  if (value === null || value === undefined || value === "") return "—";
  const numeric = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(numeric)) return "—";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(numeric);
}
