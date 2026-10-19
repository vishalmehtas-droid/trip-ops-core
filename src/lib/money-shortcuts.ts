import type { MoneyType } from "@/lib/payment-schemas";

/** Vendor payment type: final when it covers the full target amount, otherwise part. */
export function vendorPaymentType(amountPaise: bigint, targetPaise: bigint): MoneyType {
  return amountPaise >= targetPaise ? "final" : "part";
}

/**
 * Receipt type: final when it covers the remaining outstanding; advance when it is the
 * first receipt and doesn't cover the full amount; otherwise part.
 */
export function receiptType(
  amountPaise: bigint,
  outstandingPaise: bigint,
  isFirstReceipt: boolean,
): MoneyType {
  if (amountPaise >= outstandingPaise) return "final";
  return isFirstReceipt ? "advance" : "part";
}
