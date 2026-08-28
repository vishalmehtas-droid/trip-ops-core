import { z } from "zod";

export const SALE_ITEM_TYPES = [
  "hotel",
  "flight",
  "visa",
  "activity",
  "transport",
  "other",
] as const;

export type SaleItemType = (typeof SALE_ITEM_TYPES)[number];

export const SALE_ITEM_TYPE_LABELS: Record<SaleItemType, string> = {
  hotel: "Hotel",
  flight: "Flight",
  visa: "Visa",
  activity: "Activity",
  transport: "Transport",
  other: "Other",
};

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
  description: z.string().trim().min(1, "Description is required").max(500, "Description is too long"),
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
