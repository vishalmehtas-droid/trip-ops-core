import { describe, expect, test } from "bun:test";

import { checkRows, parseCsv, toRecords } from "./csv-import.ts";

describe("csv import", () => {
  test("handles quoted commas, BOM and CRLF", () => {
    const rows = parseCsv('\uFEFFname,notes\r\n"Rao, Asha","said ""hi"""\r\n');
    expect(rows[1]).toEqual(["Rao, Asha", 'said "hi"']);
  });
  test("flags errors and duplicates", () => {
    const { records } = toRecords("clients", parseCsv(
      "name,email,gstin,source\n,a@x.com,,\nBob,bad,,\nCal,,123,\nDee,,,Telepathy\nEve,,,\n e VE ,,,\nZed,,,",
    ));
    const out = checkRows("clients", records, [{ name: "Zed", phone: null, email: null }]);
    expect(out.map((r) => r.status)).toEqual(["error", "error", "error", "error", "new", "duplicate", "duplicate"]);
    expect(out[0].reason).toBe("Missing name");
    expect(out[2].reason).toBe("GSTIN not 15 characters");
  });
});
