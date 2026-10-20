import { toPaise } from "./money";

type Role = "admin" | "sales" | "operations" | "accounts" | "viewer";

/** Admin, Accounts and Sales may view and print invoices. */
export function canReadInvoices(roles: readonly Role[]): boolean {
  return roles.some((r) => r === "admin" || r === "accounts" || r === "sales");
}
/** Only Admin and Accounts may issue invoices. */
export function canIssueInvoices(roles: readonly Role[]): boolean {
  return roles.some((r) => r === "admin" || r === "accounts");
}
/** Only Admin may cancel invoices. */
export function canCancelInvoices(roles: readonly Role[]): boolean {
  return roles.includes("admin");
}

const ONES = [
  "",
  "One",
  "Two",
  "Three",
  "Four",
  "Five",
  "Six",
  "Seven",
  "Eight",
  "Nine",
  "Ten",
  "Eleven",
  "Twelve",
  "Thirteen",
  "Fourteen",
  "Fifteen",
  "Sixteen",
  "Seventeen",
  "Eighteen",
  "Nineteen",
];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function belowHundred(n: number): string {
  if (n < 20) return ONES[n] ?? "";
  const t = TENS[Math.floor(n / 10)] ?? "";
  const o = n % 10;
  return o ? `${t} ${ONES[o]}` : t;
}

function belowThousand(n: number): string {
  const h = Math.floor(n / 100);
  const rest = n % 100;
  const parts: string[] = [];
  if (h) parts.push(`${ONES[h]} Hundred`);
  if (rest) parts.push(belowHundred(rest));
  return parts.join(" ");
}

/** Whole-number words in the Indian system (crore, lakh, thousand). */
export function integerToIndianWords(value: bigint): string {
  if (value === 0n) return "Zero";
  const parts: string[] = [];
  let n = value;
  const crore = n / 10000000n;
  n %= 10000000n;
  if (crore > 0n) parts.push(`${integerToIndianWords(crore)} Crore`);
  const lakh = Number(n / 100000n);
  n %= 100000n;
  if (lakh) parts.push(`${belowHundred(lakh)} Lakh`);
  const thousand = Number(n / 1000n);
  n %= 1000n;
  if (thousand) parts.push(`${belowHundred(thousand)} Thousand`);
  if (n > 0n) parts.push(belowThousand(Number(n)));
  return parts.join(" ");
}

/** "Rupees One Lakh Twenty Three Thousand ... and Fifty Paise Only". */
export function amountInWords(amount: string | number): string {
  const paise = toPaise(amount);
  const abs = paise < 0n ? -paise : paise;
  const rupees = abs / 100n;
  const p = Number(abs % 100n);
  let text = `Rupees ${integerToIndianWords(rupees)}`;
  if (p) text += ` and ${belowHundred(p)} Paise`;
  return `${text} Only`;
}
