import { z } from "zod";

export const SALE_STATUSES = ["pending", "confirmed", "completed", "cancelled"] as const;

export type SaleStatus = (typeof SALE_STATUSES)[number];

export const SALE_STATUS_LABELS: Record<SaleStatus, string> = {
  pending: "Pending",
  confirmed: "Confirmed",
  completed: "Completed",
  cancelled: "Cancelled",
};

/** Allowed forward-only status transitions. Completed and Cancelled are final. */
export const SALE_STATUS_TRANSITIONS: Record<SaleStatus, SaleStatus[]> = {
  pending: ["confirmed", "cancelled"],
  confirmed: ["completed", "cancelled"],
  completed: [],
  cancelled: [],
};

export function canTransition(from: SaleStatus, to: SaleStatus): boolean {
  return SALE_STATUS_TRANSITIONS[from].includes(to);
}

const isoDate = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid date");

const optionalIsoDate = z
  .string()
  .trim()
  .refine((value) => value === "" || /^\d{4}-\d{2}-\d{2}$/.test(value), "Enter a valid date")
  .transform((value) => (value === "" ? null : value))
  .nullable()
  .optional()
  .transform((value) => value ?? null);

const optionalUuid = z
  .string()
  .trim()
  .refine((value) => value === "" || z.string().uuid().safeParse(value).success, {
    message: "Select a valid destination",
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

const travelAfterBooking = <T extends { booking_date: string; travel_date: string | null }>(
  schema: z.ZodType<T, z.ZodTypeDef, unknown>,
) =>
  schema.refine((value) => !value.travel_date || value.travel_date >= value.booking_date, {
    path: ["travel_date"],
    message: "Travel date cannot be before the booking date",
  });

export const saleCreateSchema = travelAfterBooking(
  z.object({
    client_id: z.string().uuid("Select a client"),
    destination_id: optionalUuid,
    booking_date: isoDate,
    travel_date: optionalIsoDate,
    notes: optionalNotes,
  }),
);

export const saleEditSchema = travelAfterBooking(
  z.object({
    client_id: z.string().uuid("Select a client"),
    destination_id: optionalUuid,
    /** Immutable in the database; carried for the travel-date comparison only. */
    booking_date: isoDate,
    travel_date: optionalIsoDate,
    notes: optionalNotes,
    /** Drives the GST treatment; recalculates pricing server-side when changed. */
    billing_type: z.enum(BILLING_TYPES, { message: "Select a billing type" }),
  }),
);

export const saleUpdateSchema = z.object({
  id: z.string().uuid(),
  values: saleEditSchema,
});

export const saleStatusChangeSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(SALE_STATUSES),
});

export type SaleCreateInput = z.input<typeof saleCreateSchema>;
export type SaleEditInput = z.input<typeof saleEditSchema>;
