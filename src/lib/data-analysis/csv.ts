/**
 * A CSV PARSER, WRITTEN RATHER THAN INSTALLED.
 *
 * Pure — no SDK, no filesystem, no network — so the build gate exercises
 * every branch below without a key or a connection.
 *
 * WHY NOT A DEPENDENCY. This is eighty lines of well-understood
 * specification (RFC 4180), and the four things that actually break real
 * spreadsheets are all things a library gets right by accident and a
 * hand-rolled `split(",")` gets wrong every time:
 *
 *   A COMMA INSIDE QUOTES. `"Smith, John",42` is two fields. Splitting on
 *   the comma gives three, and every column after it shifts by one — for
 *   that row only, so the file looks fine until somebody reads row 900.
 *
 *   A NEWLINE INSIDE QUOTES. An address field with a line break is one
 *   record. Splitting on \n turns it into two, one of which has half the
 *   columns.
 *
 *   THE BYTE ORDER MARK. Excel writes UTF-8 CSV with a BOM, so the first
 *   header becomes "﻿Date" — which matches nothing, so the date
 *   column silently disappears from every chart.
 *
 *   \r\n. Windows line endings leave a trailing \r on the last field of
 *   every row, so "42\r" parses as text and a numeric column is reported
 *   as strings.
 *
 * Each of those is a wrong ANSWER rather than an error, which is the
 * class of bug this whole module exists to avoid: a chart drawn from
 * misaligned columns looks exactly like a chart.
 */

/** Anything past this and we are not analysing a spreadsheet any more. */
export const MAX_ROWS = 50_000;
export const MAX_COLUMNS = 200;
/** A single field big enough to be a document, not a value. */
export const MAX_CELL_LENGTH = 10_000;

export type ParsedTable = {
  headers: string[];
  rows: string[][];
  /** Rows read before MAX_ROWS stopped it. Reported so the UI can say
   *  "the first 50,000 rows" rather than implying the whole file. */
  truncated: boolean;
  /** Rows whose field count did not match the header. Counted rather
   *  than dropped silently — a file where this is large is a file that
   *  was parsed with the wrong delimiter. */
  raggedRows: number;
};

export type ParseError = { ok: false; reason: string };
export type ParseResult = ({ ok: true } & ParsedTable) | ParseError;

/**
 * Guesses the delimiter from the header line.
 *
 * Counted OUTSIDE quotes only. A file whose first field is
 * `"Smith, John"` has more commas than semicolons inside quotes and none
 * outside, and a naive count picks the comma — which is how a
 * semicolon-delimited European export parses as one very wide column.
 */
export function detectDelimiter(sample: string): string {
  const candidates = [",", ";", "\t", "|"];
  const firstLine = firstUnquotedLine(sample);
  let best = ",";
  let bestCount = 0;
  for (const candidate of candidates) {
    const count = countOutsideQuotes(firstLine, candidate);
    if (count > bestCount) {
      best = candidate;
      bestCount = count;
    }
  }
  return best;
}

function firstUnquotedLine(text: string): string {
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') inQuotes = !inQuotes;
    else if (ch === "\n" && !inQuotes) return text.slice(0, i);
  }
  return text;
}

function countOutsideQuotes(line: string, delimiter: string): number {
  let inQuotes = false;
  let count = 0;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') inQuotes = !inQuotes;
    else if (ch === delimiter && !inQuotes) count++;
  }
  return count;
}

/** Strips the UTF-8 BOM Excel writes. One character, and without it the
 *  first column header matches nothing anywhere in the app. */
export function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/**
 * The parser itself. A single pass, character by character, with two
 * states — inside quotes and not.
 */
export function parseCsv(input: string, delimiter?: string): ParseResult {
  const text = stripBom(input);
  if (!text.trim()) return { ok: false, reason: "the file is empty" };

  const sep = delimiter ?? detectDelimiter(text);
  if (sep.length !== 1) return { ok: false, reason: "the delimiter must be a single character" };

  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let truncated = false;
  let sawAnyChar = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        // A DOUBLED QUOTE IS AN ESCAPED QUOTE, not the end of the field.
        // `"He said ""hi"""` is one field reading `He said "hi"`.
        if (text[i + 1] === '"') {
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

    if (ch === '"' && field === "") {
      inQuotes = true;
      sawAnyChar = true;
      continue;
    }
    if (ch === sep) {
      row.push(clampCell(field));
      field = "";
      sawAnyChar = true;
      continue;
    }
    if (ch === "\r") {
      // Swallowed, never stored. \r\n ends a row; a lone \r (classic Mac)
      // ends one too.
      if (text[i + 1] === "\n") continue;
      const done = endRow(rows, row, field, sawAnyChar);
      row = [];
      field = "";
      sawAnyChar = false;
      if (done && rows.length > MAX_ROWS) {
        truncated = true;
        break;
      }
      continue;
    }
    if (ch === "\n") {
      const done = endRow(rows, row, field, sawAnyChar);
      row = [];
      field = "";
      sawAnyChar = false;
      if (done && rows.length > MAX_ROWS) {
        truncated = true;
        break;
      }
      continue;
    }
    field += ch;
    sawAnyChar = true;
  }

  // The last row, when the file does not end in a newline.
  endRow(rows, row, field, sawAnyChar);

  if (rows.length === 0) return { ok: false, reason: "no rows could be read" };

  const rawHeaders = rows[0];
  if (rawHeaders.length > MAX_COLUMNS) {
    return { ok: false, reason: `more than ${MAX_COLUMNS} columns` };
  }

  const headers = normaliseHeaders(rawHeaders);
  const body = rows.slice(1);

  // RAGGED ROWS ARE PADDED, NOT DROPPED. A row with one missing trailing
  // value is the single most common defect in a real export, and throwing
  // it away silently changes every count and every average computed
  // afterwards.
  let raggedRows = 0;
  const normalised = body.map((r) => {
    if (r.length !== headers.length) raggedRows++;
    if (r.length < headers.length) return [...r, ...new Array(headers.length - r.length).fill("")];
    return r.slice(0, headers.length);
  });

  return {
    ok: true,
    headers,
    rows: normalised.slice(0, MAX_ROWS),
    truncated: truncated || body.length > MAX_ROWS,
    raggedRows,
  };
}

function clampCell(value: string): string {
  return value.length > MAX_CELL_LENGTH ? value.slice(0, MAX_CELL_LENGTH) : value;
}

/** Pushes a row unless it is a blank line. Returns whether anything was
 *  pushed, so the row cap counts real rows rather than blank lines. */
function endRow(rows: string[][], row: string[], field: string, sawAnyChar: boolean): boolean {
  if (!sawAnyChar && row.length === 0) return false;
  row.push(clampCell(field));
  rows.push(row);
  return true;
}

/**
 * Headers a human and a chart can both use.
 *
 * A BLANK HEADER GETS A NAME rather than being left empty: an unnamed
 * column cannot be selected in a chart, cannot be referred to in a
 * question, and two of them cannot be told apart. Same for duplicates —
 * "Total" twice means the second silently overwrites the first the moment
 * anything keys a row by header.
 */
export function normaliseHeaders(raw: readonly string[]): string[] {
  const seen = new Map<string, number>();
  return raw.map((value, index) => {
    let name = stripBom(value).trim();
    if (!name) name = `Column ${index + 1}`;
    const lower = name.toLowerCase();
    const count = seen.get(lower) ?? 0;
    seen.set(lower, count + 1);
    return count === 0 ? name : `${name} (${count + 1})`;
  });
}
