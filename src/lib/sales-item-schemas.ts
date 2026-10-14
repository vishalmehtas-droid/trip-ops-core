import { z } from "zod";

export const SALE_ITEM_TYPES = [
  "hotel",
  "flight",
  "visa",
  "activity",
  "transport",
  "land_package",
  "full_package",
  "other",
] as const;

export type SaleItemType = (typeof SALE_ITEM_TYPES)[number];

export const SALE_ITEM_TYPE_LABELS: Record<SaleItemType, string> = {
  hotel: "Hotel",
  flight: "Flight",
  visa: "Visa",
  activity: "Activity",
  transport: "Car Rental",
  land_package: "Land Package",
  full_package: "Full Package",
  other: "Other",
};

/** Types offered for new supplier/customer quote lines ("Other" stays for old records). */
export const QUOTE_LINE_TYPES = [
  "hotel",
  "transport",
  "land_package",
  "full_package",
  "visa",
  "flight",
  "activity",
] as const satisfies readonly SaleItemType[];

export const PURCHASE_TYPE_HINTS: Partial<Record<string, string>> = {
  land_package:
    "Car rental, sightseeing and entry tickets: everything except hotel, visa and taxes.",
  full_package: "Hotels plus land services, quoted together.",
};

export const isPackageType = (type: string) => type === "land_package" || type === "full_package";

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

const quantity = z.coerce
  .number()
  .int("Quantity must be a whole number")
  .positive("Quantity must be greater than zero")
  .max(9999, "Quantity is too large");

export const saleItemValuesSchema = z.object({
  item_type: z.enum(SALE_ITEM_TYPES, { message: "Select a component type" }),
  description: z
    .string()
    .trim()
    .min(1, "Description is required")
    .max(500, "Description is too long"),
  vendor_id: optionalVendorId,
  quantity,
});

export const saleItemCreateSchema = z.object({
  sale_id: z.string().uuid(),
  values: saleItemValuesSchema,
});

export const saleItemUpdateSchema = z.object({
  id: z.string().uuid(),
  values: saleItemValuesSchema,
});

export const saleItemDeleteSchema = z.object({
  id: z.string().uuid(),
});

export type SaleItemValuesInput = z.input<typeof saleItemValuesSchema>;
