import { describe, expect, test } from "bun:test";

import {
  amountInWords,
  canCancelInvoices,
  canIssueInvoices,
  canReadInvoices,
} from "./invoice-helpers.ts";

describe("invoice access", () => {
  test("Admin, Accounts and Sales can view; Viewer and Operations cannot", () => {
    expect(canReadInvoices(["sales"])).toBe(true);
    expect(canReadInvoices(["accounts"])).toBe(true);
    expect(canReadInvoices(["viewer"])).toBe(false);
    expect(canReadInvoices(["operations"])).toBe(false);
  });
  test("Sales cannot issue; Accounts can", () => {
    expect(canIssueInvoices(["sales"])).toBe(false);
    expect(canIssueInvoices(["accounts"])).toBe(true);
  });
  test("only Admin can cancel", () => {
    expect(canCancelInvoices(["accounts"])).toBe(false);
    expect(canCancelInvoices(["admin"])).toBe(true);
  });
});

describe("amount in words (Indian system)", () => {
  test("lakh and paise", () => {
    expect(amountInWords("123456.50")).toBe(
      "Rupees One Lakh Twenty Three Thousand Four Hundred Fifty Six and Fifty Paise Only",
    );
  });
  test("crore", () => {
    expect(amountInWords("10000000")).toBe("Rupees One Crore Only");
  });
});
