import { describe, expect, test } from "bun:test";

import { canAccessLedger } from "./report-schemas";

describe("ledger report access", () => {
  test("admin and accounts can view both ledgers", () => {
    expect(canAccessLedger("client", ["admin"], true)).toBe(true);
    expect(canAccessLedger("vendor", ["accounts"], false)).toBe(true);
  });

  test("sales and operations can view the client ledger but not the vendor ledger", () => {
    expect(canAccessLedger("client", ["sales"], false)).toBe(true);
    expect(canAccessLedger("client", ["operations"], false)).toBe(true);
    expect(canAccessLedger("vendor", ["sales"], false)).toBe(false);
    expect(canAccessLedger("vendor", ["operations"], false)).toBe(false);
  });

  test("viewer has no ledger access", () => {
    expect(canAccessLedger("client", ["viewer"], false)).toBe(false);
    expect(canAccessLedger("vendor", ["viewer"], false)).toBe(false);
  });
});
