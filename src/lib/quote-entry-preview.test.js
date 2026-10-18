import { expect, test } from "bun:test";
import { lineEntryTotal, formatEntryInr } from "./quote-entry-preview";

test("requested 13-person USD entry preview is exact", () => {
  expect(formatEntryInr(lineEntryTotal("13", "717", "85"))).toBe("₹7,92,285");
});
test("INR entry uses a rate of one", () => {
  expect(lineEntryTotal("13", "717", "1")).toBe("9321.00");
});
test("decimal preview rounds only the final amount", () => {
  expect(lineEntryTotal("3", "0.01", "1.5")).toBe("0.05");
});
