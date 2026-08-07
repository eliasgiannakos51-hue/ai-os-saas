import { neutraliseFormula } from "@/lib/import/csv-parse";

/**
 * Quote a value for CSV — and defuse it first.
 *
 * The quoting half is RFC 4180. The `neutraliseFormula` call is the half
 * that matters for safety: this function writes a file the user will
 * open in Excel, and a stored value beginning `=`, `@`, or `+`/`-`
 * followed by anything non-numeric is EXECUTED there.
 *
 * Quoting does not help. `"=cmd|'/c calc'!A1"` is still a formula to
 * Excel — the quotes are CSV syntax, stripped before the cell is
 * evaluated. Only changing what the cell starts with works.
 *
 * This runs on every export, not only on imported rows, because a value
 * typed by hand into a "Notes" field is exactly as executable as one
 * that arrived in a spreadsheet. Plain numbers, including negative ones,
 * are passed through untouched — see neutraliseFormula.
 */
function escapeCSVValue(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  // A real number is already safe and must not be re-formatted.
  const str = typeof value === "number" ? String(value) : neutraliseFormula(String(value));
  if (/["\n\r,;\t]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function toCSV(
  headers: string[],
  rows: (string | number | null | undefined)[][]
): string {
  const lines = [
    headers.map(escapeCSVValue).join(","),
    ...rows.map((row) => row.map(escapeCSVValue).join(",")),
  ];
  return lines.join("\r\n");
}

export function downloadCSV(filename: string, csvContent: string): void {
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function downloadJSON(filename: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function todayForFilename(): string {
  return new Date().toISOString().slice(0, 10);
}
