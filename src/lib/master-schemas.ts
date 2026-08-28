import { z } from "zod";

export const VENDOR_TYPES = ["hotel", "flight", "visa", "activity", "transport", "other"] as const;

export type VendorType = (typeof VENDOR_TYPES)[number];

export const VENDOR_TYPE_LABELS: Record<VendorType, string> = {
  hotel: "Hotel",
  flight: "Flight",
  visa: "Visa",
  activity: "Activity",
  transport: "Transport",
  other: "Other",
};

const requiredName = z
  .string()
  .trim()
  .min(2, "Name must be at least 2 characters")
  .max(160, "Name is too long");

/** Optional free text: empty string is normalised to null. */
const optionalText = (max = 400) =>
  z
    .string()
    .trim()
    .max(max, "Value is too long")
    .transform((value) => (value === "" ? null : value))
    .nullable()
    .optional()
    .transform((value) => value ?? null);

/** Phone stays permissive: international formats vary widely. */
const optionalPhone = z
  .string()
  .trim()
  .max(40, "Phone number is too long")
  .transform((value) => (value === "" ? null : value))
  .nullable()
  .optional()
  .transform((value) => value ?? null);

const optionalEmail = z
  .string()
  .trim()
  .max(200)
  .refine((value) => value === "" || z.string().email().safeParse(value).success, {
    message: "Enter a valid email address",
  })
  .transform((value) => (value === "" ? null : value))
  .nullable()
  .optional()
  .transform((value) => value ?? null);

export const clientInputSchema = z.object({
  name: requiredName,
  phone: optionalPhone,
  email: optionalEmail,
  address: optionalText(600),
  gst_number: optionalText(40),
  notes: optionalText(2000),
  is_active: z.boolean().default(true),
});

export const vendorInputSchema = z.object({
  name: requiredName,
  type: z.enum(VENDOR_TYPES),
  phone: optionalPhone,
  email: optionalEmail,
  gst_number: optionalText(40),
  address: optionalText(600),
  notes: optionalText(2000),
  is_active: z.boolean().default(true),
});

export const destinationInputSchema = z.object({
  name: requiredName,
  country: optionalText(120),
  region: optionalText(120),
  notes: optionalText(2000),
  is_active: z.boolean().default(true),
});

export const clientUpdateSchema = z.object({
  id: z.string().uuid(),
  values: clientInputSchema,
});

export const vendorUpdateSchema = z.object({
  id: z.string().uuid(),
  values: vendorInputSchema,
});

export const destinationUpdateSchema = z.object({
  id: z.string().uuid(),
  values: destinationInputSchema,
});

export const setActiveSchema = z.object({
  id: z.string().uuid(),
  isActive: z.boolean(),
});

export type ClientInput = z.input<typeof clientInputSchema>;
export type VendorInput = z.input<typeof vendorInputSchema>;
export type DestinationInput = z.input<typeof destinationInputSchema>;
