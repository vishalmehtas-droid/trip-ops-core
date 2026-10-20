import { CLIENT_SOURCES, clientInputSchema, vendorInputSchema } from "./master-schemas";

export type ImportKind = "clients" | "vendors";

export const IMPORT_COLUMNS: Record<ImportKind, readonly string[]> = {
  clients: ["name", "phone", "email", "city", "state", "gstin", "source", "referred_by", "notes"],
  vendors: ["name", "phone", "email", "city", "gstin", "payment_terms", "notes"],
};

export const IMPORT_SAMPLE: Record<ImportKind, string[]> = {
  clients: [
    "Asha Rao",
    "+91 98200 12345",
    "asha@example.com",
    "Mumbai",
    "Maharashtra",
    "27ABCDE1234F1Z5",
    "Referral",
    "Rahul Shah",
    "Prefers beach holidays",
  ],
  vendors: [
    "Blue Lagoon DMC",
    "+971 4 555 0100",
    "ops@bluelagoon.example",
    "Dubai",
    "",
    "50% advance, balance 7 days before travel",
    "UAE land packages",
  ],
};

export const MAX_IMPORT_ROWS = 500;
export const MAX_IMPORT_BYTES = 1024 * 1024;

/** RFC 4180 parser: quoted fields, doubled quotes, embedded commas/newlines, CRLF, BOM, ; delimiter. */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^\uFEFF/, "");
  const firstLine = src.split(/\r?\n/, 1)[0] ?? "";
  const delimiter =
    (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === delimiter) {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += ch;
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

export type ImportRecord = Record<string, string>;
export type RowStatus = "new" | "duplicate" | "error";
export type CheckedRow = {
  line: number;
  values: ImportRecord;
  status: RowStatus;
  reason: string | null;
};
export type ExistingRecord = { name: string; phone: string | null; email: string | null };

export function toRecords(
  kind: ImportKind,
  rows: string[][],
): { records: ImportRecord[]; error: string | null } {
  const [header, ...body] = rows;
  if (!header) return { records: [], error: "The file is empty." };
  const keys = header.map((h) => h.trim().toLowerCase().replace(/\s+/g, "_"));
  if (!keys.includes("name"))
    return { records: [], error: "The header row must include a name column." };
  const cols = IMPORT_COLUMNS[kind];
  const records = body.map((cells) => {
    const rec: ImportRecord = {};
    for (const col of cols) {
      const idx = keys.indexOf(col);
      rec[col] = idx >= 0 ? (cells[idx] ?? "").trim() : "";
    }
    return rec;
  });
  return { records, error: null };
}

const normName = (v: string) => v.toLowerCase().replace(/\s+/g, "");
const normPhone = (v: string | null) => (v ?? "").replace(/\D/g, "");
const normEmail = (v: string | null) => (v ?? "").trim().toLowerCase();

/** Same validation as the normal create forms, plus GSTIN length and a known source. */
function validate(kind: ImportKind, rec: ImportRecord): string | null {
  if (!rec["name"]) return "Missing name";
  const gstin = rec["gstin"] ?? "";
  if (gstin && gstin.replace(/\s/g, "").length !== 15) return "GSTIN not 15 characters";
  if ((rec["city"] ?? "").length > 120) return "City is too long";
  if (kind === "clients") {
    let source = rec["source"] ?? "";
    if (source) {
      const match = CLIENT_SOURCES.find((s) => s.toLowerCase() === source.toLowerCase());
      if (!match) return `Unknown source "${source}"`;
      source = match;
      rec["source"] = match;
    }
    const parsed = clientInputSchema.safeParse({
      name: rec["name"],
      phone: rec["phone"],
      email: rec["email"],
      state: rec["state"],
      gst_number: gstin,
      source,
      referred_by: rec["referred_by"],
      notes: rec["notes"],
    });
    if (!parsed.success) return parsed.error.issues[0]?.message ?? "Invalid row";
  } else {
    const parsed = vendorInputSchema.safeParse({
      name: rec["name"],
      phone: rec["phone"],
      email: rec["email"],
      gst_number: gstin,
      payment_terms: rec["payment_terms"],
      notes: rec["notes"],
    });
    if (!parsed.success) return parsed.error.issues[0]?.message ?? "Invalid row";
  }
  return null;
}

export function checkRows(
  kind: ImportKind,
  records: ImportRecord[],
  existing: ExistingRecord[],
): CheckedRow[] {
  const names = new Set(existing.map((e) => normName(e.name)));
  const phones = new Set(existing.map((e) => normPhone(e.phone)).filter(Boolean));
  const emails = new Set(existing.map((e) => normEmail(e.email)).filter(Boolean));
  return records.map((raw, i) => {
    const values = { ...raw };
    const line = i + 2;
    const error = validate(kind, values);
    if (error) return { line, values, status: "error" as const, reason: error };
    const n = normName(values["name"] ?? "");
    const p = normPhone(values["phone"] ?? null);
    const e = normEmail(values["email"] ?? null);
    let reason: string | null = null;
    if (names.has(n)) reason = "Same name as an existing record or earlier row";
    else if (p && phones.has(p)) reason = "Same phone as an existing record or earlier row";
    else if (e && emails.has(e)) reason = "Same email as an existing record or earlier row";
    names.add(n);
    if (p) phones.add(p);
    if (e) emails.add(e);
    return reason
      ? { line, values, status: "duplicate" as const, reason }
      : { line, values, status: "new" as const, reason: null };
  });
}

export function toCsv(rows: string[][]): string {
  const cell = (v: string) => (/[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  return "\uFEFF" + rows.map((r) => r.map(cell).join(",")).join("\r\n");
}
