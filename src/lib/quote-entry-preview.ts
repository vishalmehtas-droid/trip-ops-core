/** Entry-only arithmetic: saved quote totals remain database-authoritative. */
export function lineEntryTotal(quantity: string, amount: string, rate: string): string | null {
  let product = 1n;
  let scale = 0;
  for (const value of [quantity, amount, rate]) {
    if (!/^\d+(\.\d+)?$/.test(value)) return null;
    const [whole = "0", fraction = ""] = value.split(".");
    product *= BigInt(whole + fraction);
    scale += fraction.length;
  }
  const divisor = 10n ** BigInt(scale);
  const paise = (product * 100n + divisor / 2n) / divisor;
  return `${paise / 100n}.${String(paise % 100n).padStart(2, "0")}`;
}

export function formatEntryInr(value: string): string {
  const [whole = "0", fraction = "00"] = value.split(".");
  return `₹${BigInt(whole).toLocaleString("en-IN")}${fraction === "00" ? "" : `.${fraction}`}`;
}
