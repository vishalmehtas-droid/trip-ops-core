import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Download, Loader2, Upload } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import {
  checkRows,
  IMPORT_COLUMNS,
  IMPORT_SAMPLE,
  MAX_IMPORT_BYTES,
  MAX_IMPORT_ROWS,
  parseCsv,
  toCsv,
  toRecords,
  type CheckedRow,
  type ImportKind,
} from "@/lib/csv-import";
import { IMPORT_ROLES, importCsvRecords, type ImportOutcome } from "@/lib/csv-import.functions";

function download(name: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

const STATUS_LABEL = { new: "New", duplicate: "Duplicate", error: "Error" } as const;

export function CsvImportActions({ kind, queryKey }: { kind: ImportKind; queryKey: readonly unknown[] }) {
  const { hasAnyRole } = useAuth();
  const [open, setOpen] = useState(false);
  if (!hasAnyRole(IMPORT_ROLES[kind])) return null;
  const cols = IMPORT_COLUMNS[kind];
  return (
    <>
      <Button
        variant="link"
        size="sm"
        onClick={() => download(`${kind}-template.csv`, toCsv([[...cols], IMPORT_SAMPLE[kind]]))}
      >
        <Download className="size-3.5" />
        Download template
      </Button>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Upload className="size-3.5" />
        Import CSV
      </Button>
      {open ? <ImportDialog kind={kind} queryKey={queryKey} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function ImportDialog({
  kind,
  queryKey,
  onClose,
}: {
  kind: ImportKind;
  queryKey: readonly unknown[];
  onClose: () => void;
}) {
  const cols = IMPORT_COLUMNS[kind];
  const run = useServerFn(importCsvRecords);
  const queryClient = useQueryClient();
  const [rows, setRows] = useState<CheckedRow[] | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ImportOutcome | null>(null);

  const counts = useMemo(() => {
    const c = { new: 0, duplicate: 0, error: 0 };
    for (const r of rows ?? []) c[r.status]++;
    return c;
  }, [rows]);

  async function onFile(file: File) {
    setFileError(null);
    setRows(null);
    if (file.size > MAX_IMPORT_BYTES) return setFileError("The file is larger than 1 MB.");
    const buffer = await file.arrayBuffer();
    let text: string;
    try {
      text = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
    } catch {
      // Older Excel saves as Windows-1252 rather than UTF-8.
      text = new TextDecoder("windows-1252").decode(buffer);
    }
    const { records, error } = toRecords(kind, parseCsv(text));
    if (error) return setFileError(error);
    if (records.length === 0) return setFileError("No data rows found.");
    if (records.length > MAX_IMPORT_ROWS) return setFileError(`Up to ${MAX_IMPORT_ROWS} rows per file.`);
    const { data, error: readError } = await supabase.from(kind).select("name, phone, email");
    if (readError) return setFileError(readError.message);
    setRows(checkRows(kind, records, data ?? []));
  }

  async function doImport() {
    if (!rows) return;
    setBusy(true);
    try {
      const outcome = await run({ data: { kind, records: rows.map((r) => r.values) } });
      setResult(outcome);
      await queryClient.invalidateQueries({ queryKey });
      void queryClient.invalidateQueries({ queryKey: ["audit-log"] });
    } catch (error) {
      toast.error("Import failed — nothing was imported", { description: (error as Error).message });
    } finally {
      setBusy(false);
    }
  }

  const skipped = result?.rejected.filter((r) => r.outcome === "skipped").length ?? 0;
  const failed = result?.rejected.filter((r) => r.outcome === "failed").length ?? 0;

  return (
    <Dialog open onOpenChange={(o) => (!o && !busy ? onClose() : undefined)}>
      <DialogContent className="quote-dialog max-h-[90vh] overflow-y-auto sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>Import {kind} from CSV</DialogTitle>
        </DialogHeader>

        {result ? (
          <div className="space-y-3 text-sm">
            <div className="flex gap-6">
              <span>Imported: <strong>{result.imported}</strong></span>
              <span>Skipped: <strong>{skipped}</strong></span>
              <span>Failed: <strong>{failed}</strong></span>
            </div>
            {result.rejected.length ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  download(
                    `${kind}-import-issues.csv`,
                    toCsv([
                      ["line", "outcome", "reason", ...cols],
                      ...result.rejected.map((r) => [
                        String(r.line), r.outcome, r.reason, ...cols.map((c) => r.values[c] ?? ""),
                      ]),
                    ]),
                  )
                }
              >
                <Download className="size-3.5" />
                Download skipped/failed rows
              </Button>
            ) : null}
          </div>
        ) : (
          <div className="space-y-3">
            <Input type="file" accept=".csv,text/csv" onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onFile(f);
            }} />
            <p className="text-[11px] text-muted-foreground">
              Up to {MAX_IMPORT_ROWS} rows and 1 MB. Only new records are created; existing records are never changed.
            </p>
            {fileError ? <p className="text-xs font-medium text-destructive">{fileError}</p> : null}
            {rows ? (
              <>
                <div className="flex gap-4 text-xs">
                  <span>New: <strong>{counts.new}</strong></span>
                  <span>Duplicate (skipped): <strong>{counts.duplicate}</strong></span>
                  <span>Error: <strong>{counts.error}</strong></span>
                </div>
                <div className="max-h-[50vh] overflow-auto rounded border border-border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Line</TableHead>
                        <TableHead>Status</TableHead>
                        {cols.map((c) => <TableHead key={c}>{c}</TableHead>)}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.map((r) => (
                        <TableRow key={r.line}>
                          <TableCell className="text-xs">{r.line}</TableCell>
                          <TableCell className="text-xs">
                            <Badge
                              variant="outline"
                              className={`text-[10px] uppercase ${r.status === "error" ? "text-destructive" : r.status === "duplicate" ? "text-muted-foreground" : "text-primary"}`}
                            >
                              {STATUS_LABEL[r.status]}
                            </Badge>
                            {r.reason ? <div className="mt-0.5 text-[11px] text-muted-foreground">{r.reason}</div> : null}
                          </TableCell>
                          {cols.map((c) => (
                            <TableCell key={c} className="max-w-[180px] truncate text-xs">{r.values[c]}</TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </>
            ) : null}
          </div>
        )}

        <DialogFooter>
          {result ? (
            <Button onClick={onClose}>Done</Button>
          ) : (
            <>
              <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
              <Button disabled={!rows || counts.new === 0 || busy} onClick={() => void doImport()}>
                {busy ? <Loader2 className="size-4 animate-spin" /> : null}
                Import {counts.new} new records
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
