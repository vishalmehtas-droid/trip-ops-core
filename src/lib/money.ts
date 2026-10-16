/** Exact paise arithmetic on decimal strings (never floats). */
export function toPaise(value: string | number | null | undefined): bigint {
  if (value === null || value === undefined || value === "") return 0n;
  const text = String(value).trim();
  const negative = text.startsWith("-");
  const [whole = "0", fraction = ""] = (negative ? text.slice(1) : text).split(".");
  const absolute =
    BigInt(whole || "0") * 100n + BigInt(fraction.padEnd(2, "0").slice(0, 2) || "0");
  return negative ? -absolute : absolute;
}

export function fromPaise(value: bigint): string {
  const sign = value < 0n ? "-" : "";
  const absolute = value < 0n ? -value : value;
  return `${sign}${absolute / 100n}.${String(absolute % 100n).padStart(2, "0")}`;
}

/** True when the string is a positive amount with at most 2 decimals. */
export function isMoneyString(value: string): boolean {
  return /^\d{1,12}(\.\d{1,2})?$/.test(value.trim());
}
