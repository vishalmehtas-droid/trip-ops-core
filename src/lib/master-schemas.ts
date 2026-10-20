import { z } from "zod";

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

export const CLIENT_SOURCES = [
  "Referral",
  "Repeat client",
  "Instagram",
  "Facebook",
  "WhatsApp",
  "Google",
  "Website",
  "Walk-in",
  "Other",
] as const;

const optionalSource = z
  .union([z.enum(CLIENT_SOURCES), z.literal("")])
  .nullish()
  .transform((value) => (value ? value : null));

export const clientInputSchema = z
  .object({
    name: requiredName,
    phone: optionalPhone,
    email: optionalEmail,
    address: optionalText(600),
    gst_number: optionalText(40),
    notes: optionalText(2000),
    source: optionalSource,
    referred_by: optionalText(120),
    markup_percent_override: z
      .union([z.string(), z.number()])
      .nullish()
      .transform((v) =>
        v === null || v === undefined || String(v).trim() === "" ? null : String(v).trim(),
      )
      .refine(
        (v) => v === null || /^\d{1,4}(\.\d{1,2})?$/.test(v),
        "Enter a percentage with at most 2 decimals",
      )
      .refine((v) => v === null || Number(v) <= 1000, "Too large")
      // Validated to at most 2 decimals above, so the numeric value is exact for storage.
      .transform((v) => (v === null ? null : Number(v))),
    is_active: z.boolean().default(true),
  })
  // "Referred by" only applies to referrals.
  .transform((v) => ({ ...v, referred_by: v.source === "Referral" ? v.referred_by : null }));

/** Vendors are intentionally unclassified — no vendor type concept. */
export const vendorInputSchema = z.object({
  name: requiredName,
  phone: optionalPhone,
  email: optionalEmail,
  gst_number: optionalText(40),
  address: optionalText(600),
  payment_terms: optionalText(500),
  advance_rule: optionalText(500),
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
