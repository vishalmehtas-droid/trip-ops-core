import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireActiveUser } from "./authz-middleware";
import { checkRows, IMPORT_COLUMNS, MAX_IMPORT_ROWS, type ImportKind } from "./csv-import";

export const IMPORT_ROLES: Record<ImportKind, ("admin" | "sales" | "operations")[]> = {
  clients: ["admin", "sales", "operations"],
  vendors: ["admin", "operations"],
};

const inputSchema = z.object({
  kind: z.enum(["clients", "vendors"]),
  records: z
    .array(z.record(z.string(), z.string().max(4000)))
    .max(MAX_IMPORT_ROWS, "Up to 500 rows"),
});

export type ImportOutcome = {
  imported: number;
  rejected: {
    line: number;
    values: Record<string, string>;
    outcome: "skipped" | "failed";
    reason: string;
  }[];
};

/** Create-only import: re-validates every row with the form rules, then inserts all new rows in one transaction. */
export const importCsvRecords = createServerFn({ method: "POST" })
  .middleware([requireActiveUser])
  .inputValidator((input: unknown) => inputSchema.parse(input))
  .handler(async ({ data, context }): Promise<ImportOutcome> => {
    const allowed = IMPORT_ROLES[data.kind];
    if (!context.roles.some((r) => (allowed as string[]).includes(r))) {
      throw new Error(`Forbidden: you cannot import ${data.kind}`);
    }
    const { data: existing, error } = await context.supabase
      .from(data.kind)
      .select("name, phone, email");
    if (error) throw new Error(error.message);

    const cols = IMPORT_COLUMNS[data.kind];
    const records = data.records.map((r) =>
      Object.fromEntries(cols.map((c) => [c, (r[c] ?? "").trim()])),
    );
    const checked = checkRows(data.kind, records, existing ?? []);
    const fresh = checked.filter((r) => r.status === "new");
    const rejected: ImportOutcome["rejected"] = checked
      .filter((r) => r.status !== "new")
      .map((r) => ({
        line: r.line,
        values: r.values,
        outcome: r.status === "duplicate" ? "skipped" : "failed",
        reason: r.reason ?? "Invalid row",
      }));
    if (fresh.length === 0) return { imported: 0, rejected };

    const rpc = data.kind === "clients" ? "import_clients" : "import_vendors";
    const { data: count, error: rpcError } = await context.supabase.rpc(rpc, {
      _rows: fresh.map((r) => r.values),
    });
    if (rpcError) {
      return {
        imported: 0,
        rejected: [
          ...rejected,
          ...fresh.map((r) => ({
            line: r.line,
            values: r.values,
            outcome: "failed" as const,
            reason: `Nothing imported: ${rpcError.message}`,
          })),
        ].sort((a, b) => a.line - b.line),
      };
    }
    return { imported: Number(count ?? 0), rejected };
  });
