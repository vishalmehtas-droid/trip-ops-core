import { z } from "zod";

export const MONEY_TYPES = ["advance", "part", "final"] as const;
export type MoneyType = (typeof MONEY_TYPES)[number];
export const MONEY_TYPE_LABELS: Record<MoneyType, string> = {
  advance: "Advance",
  part: "Part",
  final: "Final",
};

export const PAYMENT_METHODS = ["bank_transfer", "upi", "cash", "cheque", "card", "other"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];
export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  bank_transfer: "Bank transfer",
  upi: "UPI",
  cash: "Cash",
  cheque: "Cheque",
  card: "Card",
  other: "Other",
};

export const MONEY_STATUSES = ["recorded", "cancelled"] as const;
export type MoneyStatus = (typeof MONEY_STATUSES)[number];

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

/** Positive INR amount as an exact decimal string (max 2 decimals). */
export const moneyString = z
  .union([z.string(), z.number()])
  .transform((value) => String(value).trim())
  .refine((value) => /^\d{1,12}(\.\d{1,2})?$/.test(value), {
    message: "Enter an amount with at most 2 decimals",
  })
  .refine((value) => Number(value) > 0, { message: "Amount must be greater than zero" });

const moneyType = z
  .union([z.literal(""), z.null(), z.undefined(), z.enum(MONEY_TYPES)])
  .transform((value) => value || "part");

const listStatus = z
  .union([z.literal(""), z.literal("all"), z.null(), z.undefined(), z.enum(MONEY_STATUSES)])
  .transform((value) => (value && value !== "all" ? value : null));

const listType = z
  .union([z.literal(""), z.literal("all"), z.null(), z.undefined(), z.enum(MONEY_TYPES)])
  .transform((value) => (value && value !== "all" ? value : null));

// ---- Vendor payments ------------------------------------------------------

export const paymentValuesSchema = z.object({
  vendor_id: z.string().uuid("Select a vendor"),
  sale_id: optionalUuid,
  payment_type: moneyType,
  payment_date: optionalDate,
  amount_inr: moneyString,
  method: z.enum(PAYMENT_METHODS, { message: "Select a method" }),
  reference: blankToNull(200, "Reference"),
  notes: blankToNull(2000, "Notes"),
});

export const allocationSchema = z.object({
  purchase_id: z.string().uuid(),
  amount_inr: moneyString,
});

export const paymentSaveSchema = z.object({
  id: optionalUuid,
  values: paymentValuesSchema,
  allocations: z.array(allocationSchema).max(500).default([]),
});

export const idSchema = z.object({ id: z.string().uuid() });

export const cancelSchema = z.object({
  id: z.string().uuid(),
  reason: z.string().trim().min(1, "A reason is required").max(1000, "Reason is too long"),
});

export const paymentListSchema = z
  .object({
    vendor_id: optionalUuid,
    sale_id: optionalUuid,
    payment_type: listType,
    status: listStatus,
    from: optionalDate,
    to: optionalDate,
  })
  .partial()
  .optional()
  .transform((value) => value ?? {});

export const openPurchasesSchema = z.object({
  vendor_id: z.string().uuid(),
  sale_id: optionalUuid,
  payment_id: optionalUuid,
});

export const saleIdSchema = z.object({ sale_id: z.string().uuid() });

// ---- Customer receipts ----------------------------------------------------

export const receiptValuesSchema = z.object({
  payment_type: moneyType,
  receipt_date: optionalDate,
  amount_inr: moneyString,
  method: z.enum(PAYMENT_METHODS, { message: "Select a method" }),
  reference: blankToNull(200, "Reference"),
  notes: blankToNull(2000, "Notes"),
});

export const receiptCreateSchema = z.object({
  sale_id: z.string().uuid("Select a booking"),
  values: receiptValuesSchema,
});

export const receiptUpdateSchema = z.object({
  id: z.string().uuid(),
  values: receiptValuesSchema,
});

export const receiptListSchema = z
  .object({
    sale_id: optionalUuid,
    payment_type: listType,
    status: listStatus,
    from: optionalDate,
    to: optionalDate,
  })
  .partial()
  .optional()
  .transform((value) => value ?? {});

export type ReceiptPaymentStatus = "unpaid" | "partly_paid" | "paid";
export const RECEIPT_PAYMENT_STATUS_LABELS: Record<ReceiptPaymentStatus, string> = {
  unpaid: "Unpaid",
  partly_paid: "Partly paid",
  paid: "Paid",
};
