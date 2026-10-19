import { expect, test } from "bun:test";
import { receiptType, vendorPaymentType } from "./money-shortcuts";

test("vendor payment equal to the purchase amount is final", () => {
  expect(vendorPaymentType(10000n, 10000n)).toBe("final");
});
test("vendor payment below the purchase amount is part", () => {
  expect(vendorPaymentType(9999n, 10000n)).toBe("part");
});
test("first receipt not covering the full amount is advance", () => {
  expect(receiptType(5000n, 10000n, true)).toBe("advance");
});
test("receipt covering the remaining outstanding is final", () => {
  expect(receiptType(10000n, 10000n, true)).toBe("final");
});
test("later partial receipt is part", () => {
  expect(receiptType(2000n, 10000n, false)).toBe("part");
});
