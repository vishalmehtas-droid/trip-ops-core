import { z } from "zod";

export const UNASSIGNED_ACCOUNT_ID = "00000000-0000-0000-0000-000000000001";

export const ACCOUNT_TYPES = ["bank", "credit_card", "cash", "upi_wallet"] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];
export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  bank: "Bank",
  credit_card: "Credit card",
  cash: "Cash",
  upi_wallet: "UPI/Wallet",
};

export const OTHER_TYPES = ["expense", "income", "transfer"] as const;
export type OtherType = (typeof OTHER_TYPES)[number];
export const OTHER_TYPE_LABELS: Record<OtherType, string> = {
  expense: "Expense",
  income: "Other income",
  transfer: "Transfer",
};

export const DEFAULT_CATEGORIES = [
  "Rent",
  "Salary",
  "Bank charges",
  "Software",
  "Marketing",
  "Other",
];

const isoDate = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid date");
const optionalDate = z
  .union([z.literal(""), z.null(), z.undefined(), isoDate])
  .transform((v) => (v ? v : null));
const optionalUuid = z
  .union([z.literal(""), z.null(), z.undefined(), z.string().uuid()])
  .transform((v) => (v ? v : null));
const blankToNull = (max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, `${label} is too long`)
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .optional()
    .transform((v) => v ?? null);

/** Non-negative exact decimal string (max 2 decimals). */
export const nonNegativeMoney = z
  .union([z.string(), z.number()])
  .transform((v) => String(v).trim() || "0")
  .refine((v) => /^\d{1,12}(\.\d{1,2})?$/.test(v), {
    message: "Enter an amount with at most 2 decimals",
  });

const positiveMoney = z
  .union([z.string(), z.number()])
  .transform((v) => String(v).trim())
  .refine((v) => /^\d{1,12}(\.\d{1,2})?$/.test(v), {
    message: "Enter an amount with at most 2 decimals",
  })
  .refine((v) => Number(v) > 0, { message: "Amount must be greater than zero" });

export const accountInputSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120, "Name is too long"),
  account_type: z.enum(ACCOUNT_TYPES, { message: "Select a type" }),
  last4: z
    .union([z.literal(""), z.null(), z.undefined(), z.string().trim().regex(/^\d{4}$/, "Enter 4 digits")])
    .transform((v) => (v ? v : null)),
  /** For credit cards this is the amount owed, entered positive. */
  opening_balance: nonNegativeMoney,
  opening_balance_negative: z.boolean().optional().default(false),
  opening_balance_date: isoDate,
  is_active: z.boolean(),
});
export type AccountInput = z.input<typeof accountInputSchema>;

export const accountSaveSchema = z.object({ id: optionalUuid, values: accountInputSchema });

export const otherTxnInputSchema = z
  .object({
    txn_type: z.enum(OTHER_TYPES),
    txn_date: optionalDate,
    amount_inr: positiveMoney,
    account_id: z.string().uuid("Select an account"),
    to_account_id: optionalUuid,
    category: blankToNull(80, "Category"),
    party: blankToNull(200, "Party"),
    notes: blankToNull(2000, "Notes"),
    reference: blankToNull(200, "Reference"),
  })
  .superRefine((v, ctx) => {
    if (v.txn_type === "transfer") {
      if (!v.to_account_id)
        ctx.addIssue({ code: "custom", path: ["to_account_id"], message: "Select the to-account" });
      else if (v.to_account_id === v.account_id)
        ctx.addIssue({ code: "custom", path: ["to_account_id"], message: "Pick a different account" });
    }
  })
  .transform((v) => ({ ...v, to_account_id: v.txn_type === "transfer" ? v.to_account_id : null }));

export const statementSchema = z.object({
  account_id: z.string().uuid(),
  from: optionalDate,
  to: optionalDate,
});

export const dayEntriesSchema = z.object({ date: isoDate });

export const clearedSchema = z.object({
  kind: z.enum(["payment", "receipt", "other"]),
  id: z.string().uuid(),
  cleared: z.boolean(),
});

export const advancesSchema = z
  .object({
    kind: z.enum(["all", "payment", "receipt"]).optional(),
    vendor_id: optionalUuid,
    client_id: optionalUuid,
  })
  .partial()
  .optional()
  .transform((v) => v ?? {});

export const receiptLinkSchema = z.object({
  receipt_id: z.string().uuid(),
  allocations: z
    .array(z.object({ sale_id: z.string().uuid(), amount_inr: positiveMoney }))
    .max(200),
});

export const clientIdSchema = z.object({ client_id: z.string().uuid() });

/** Daily-entry and statement access. Admin/Accounts hold accounts.manage. */
export function canManageAccounts(permissions: string[]) {
  return permissions.includes("accounts.manage");
}
