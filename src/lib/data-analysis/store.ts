import "server-only";
import { parseCsv, type ParsedTable } from "@/lib/data-analysis/csv";
import { parseXlsx } from "@/lib/data-analysis/xlsx";
import { profileTable, type TableProfile } from "@/lib/data-analysis/profile";
import { MAX_UPLOAD_BYTES } from "@/lib/data-analysis/limits";

/**
 * FROM AN UPLOADED FILE TO A DATASET.
 *
 * One entry point, so a route cannot decide for itself what a CSV is.
 * Which reader runs is decided by the BYTES, not by the file name: a
 * .csv that is really a workbook and an .xlsx that is really a
 * comma-separated file both happen constantly (people rename files), and
 * trusting the extension turns each into a parse error a long way from
 * its cause.
 */

// Re-exported so server callers need one import; the constant itself
// lives in limits.ts because the upload panel is a Client Component and
// this file is server-only.
export { MAX_UPLOAD_BYTES };

/** The PK zip signature. Every .xlsx starts with it, because every .xlsx
 *  is a zip archive. */
const ZIP_MAGIC = Buffer.from([0x50, 0x4b, 0x03, 0x04]);

export type Dataset = ParsedTable & {
  sourceKind: "csv" | "xlsx";
  sheetName: string | null;
  sheetNames: string[];
  profile: TableProfile;
};

export type ReadOutcome = { ok: true; dataset: Dataset } | { ok: false; reason: string };

export function looksLikeXlsx(bytes: Buffer): boolean {
  return bytes.length >= 4 && bytes.subarray(0, 4).equals(ZIP_MAGIC);
}

export function readUpload(bytes: Buffer, sheet?: string): ReadOutcome {
  if (bytes.length === 0) return { ok: false, reason: "empty_file" };
  if (bytes.length > MAX_UPLOAD_BYTES) return { ok: false, reason: "too_large" };

  if (looksLikeXlsx(bytes)) {
    const parsed = parseXlsx(bytes, sheet);
    if (!parsed.ok) return { ok: false, reason: parsed.reason };
    return {
      ok: true,
      dataset: {
        headers: parsed.headers,
        rows: parsed.rows,
        truncated: parsed.truncated,
        raggedRows: parsed.raggedRows,
        sourceKind: "xlsx",
        sheetName: parsed.sheetName,
        sheetNames: parsed.sheetNames,
        profile: profileTable(parsed.headers, parsed.rows),
      },
    };
  }

  // UTF-8 with the BOM handled by the parser. A file in another encoding
  // (Windows-1253 is what a Greek Excel still writes by default) decodes
  // to replacement characters rather than throwing — which is visible in
  // the preview, and is the honest failure: we cannot guess an encoding
  // from bytes without a heuristic that is wrong for somebody.
  const parsed = parseCsv(bytes.toString("utf8"));
  if (!parsed.ok) return { ok: false, reason: parsed.reason };
  return {
    ok: true,
    dataset: {
      headers: parsed.headers,
      rows: parsed.rows,
      truncated: parsed.truncated,
      raggedRows: parsed.raggedRows,
      sourceKind: "csv",
      sheetName: null,
      sheetNames: [],
      profile: profileTable(parsed.headers, parsed.rows),
    },
  };
}

/** CSV out. Quoted properly — a value containing a comma, a quote or a
 *  newline round-trips back through parseCsv unchanged, which is the
 *  only definition of "export" that means anything. */
export function toCsv(headers: readonly string[], rows: readonly (readonly string[])[]): string {
  const cell = (value: string) =>
    /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
  const lines = [headers.map(cell).join(",")];
  for (const row of rows) lines.push(row.map((v) => cell(String(v ?? ""))).join(","));
  return lines.join("\n");
}
