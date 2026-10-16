import { z } from "zod";

/* ------------------------------- STATUSES -------------------------------- */

export const LEAD_STATUSES = [
  "new",
  "in_progress",
  "quoted",
  "negotiation",
  "won",
  "lost",
] as const;

export type LeadStatus = (typeof LEAD_STATUSES)[number];

export const LEAD_STATUS_LABELS: Record<LeadStatus, string> = {
  new: "New",
  in_progress: "In Progress",
  quoted: "Quoted",
  negotiation: "Negotiation",
  won: "Won",
  lost: "Lost",
};

/** Controlled workflow. Won and Lost are final and keep the lead on record. */
export const LEAD_STATUS_TRANSITIONS: Record<LeadStatus, LeadStatus[]> = {
  new: ["in_progress", "quoted", "lost"],
  in_progress: ["quoted", "negotiation", "lost"],
  quoted: ["negotiation", "won", "lost"],
  negotiation: ["quoted", "won", "lost"],
  won: [],
  lost: [],
};

export function canTransitionLead(from: LeadStatus, to: LeadStatus): boolean {
  return LEAD_STATUS_TRANSITIONS[from].includes(to);
}

export const REQUIREMENT_STATUSES = ["draft", "active", "superseded", "closed"] as const;

export type RequirementStatus = (typeof REQUIREMENT_STATUSES)[number];

export const REQUIREMENT_STATUS_LABELS: Record<RequirementStatus, string> = {
  draft: "Draft",
  active: "Active",
  superseded: "Superseded",
  closed: "Closed",
};

/** Superseded and Closed are final: history is never deleted. */
export const REQUIREMENT_STATUS_TRANSITIONS: Record<RequirementStatus, RequirementStatus[]> = {
  draft: ["active", "closed"],
  active: ["superseded", "closed"],
  superseded: [],
  closed: [],
};

export function canTransitionRequirement(from: RequirementStatus, to: RequirementStatus): boolean {
  return REQUIREMENT_STATUS_TRANSITIONS[from].includes(to);
}

/* -------------------------------- HELPERS -------------------------------- */

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

const optionalText = (max: number, message: string) =>
  z
    .string()
    .trim()
    .max(max, message)
    .transform((value) => (value === "" ? null : value))
    .nullable()
    .optional()
    .transform((value) => value ?? null);

const optionalNotes = optionalText(2000, "Notes are too long");

const countInt = (message: string, min: number) =>
  z.coerce.number({ message }).int(message).min(min, message);

const optionalCount = (message: string) =>
  z
    .union([z.literal(""), z.coerce.number()])
    .transform((value) => (value === "" ? null : value))
    .nullable()
    .optional()
    .transform((value) => value ?? null)
    .refine((value) => value === null || (Number.isInteger(value) && value >= 0), message);

const optionalMoney = (message: string) =>
  z
    .union([z.literal(""), z.coerce.number()])
    .transform((value) => (value === "" ? null : value))
    .nullable()
    .optional()
    .transform((value) => value ?? null)
    .refine((value) => value === null || value >= 0, message)
    .transform((value) => (value === null ? null : Math.round(value * 100) / 100));

/* --------------------------------- LEADS --------------------------------- */

export const leadValuesSchema = z.object({
  client_id: z.string().uuid("Select a client"),
  enquiry_date: isoDate,
  assigned_to: z.string().uuid("Select a salesperson"),
  source: optionalText(120, "Source is too long"),
  follow_up_date: optionalIsoDate,
  notes: optionalNotes,
});

export const leadCreateSchema = leadValuesSchema;

export const leadUpdateSchema = z.object({
  id: z.string().uuid(),
  values: leadValuesSchema,
});

export const leadStatusChangeSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(LEAD_STATUSES),
});

/* --------------------------- TRAVEL REQUIREMENTS -------------------------- */

export const requirementValuesSchema = z
  .object({
    destination_ids: z.array(z.string().uuid("Select a destination")).max(20, "Too many stops"),
    travel_start_date: optionalIsoDate,
    travel_end_date: optionalIsoDate,
    adults: countInt("At least one adult is required", 1),
    children: countInt("Children cannot be negative", 0),
    rooms: optionalCount("Rooms cannot be negative"),
    trip_type: optionalText(120, "Trip type is too long"),
    budget: optionalMoney("Budget cannot be negative"),
    notes: optionalNotes,
  })
  .refine(
    (value) =>
      !value.travel_start_date ||
      !value.travel_end_date ||
      value.travel_end_date >= value.travel_start_date,
    { path: ["travel_end_date"], message: "The end date cannot be before the start date" },
  );

export const requirementCreateSchema = z.object({
  lead_id: z.string().uuid(),
  values: requirementValuesSchema,
});

export const requirementUpdateSchema = z.object({
  id: z.string().uuid(),
  values: requirementValuesSchema,
});

export const requirementStatusChangeSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(REQUIREMENT_STATUSES),
});

export type LeadValuesInput = z.input<typeof leadValuesSchema>;
export type RequirementValuesInput = z.input<typeof requirementValuesSchema>;
