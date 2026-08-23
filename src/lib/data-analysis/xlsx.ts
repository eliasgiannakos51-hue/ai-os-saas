import { readZipEntry, readZipIndex } from "@/lib/data-analysis/zip";
import { MAX_COLUMNS, MAX_ROWS, normaliseHeaders, type ParsedTable } from "@/lib/data-analysis/csv";

/**
 * READING AN .XLSX, without a dependency and without a DTD.
 *
 * The file is a ZIP of XML (see zip.ts for why that is hand-rolled). What
 * is read out of it:
 *
 *   xl/workbook.xml          which sheets exist, and in what order
 *   xl/sharedStrings.xml     every string in the book, by index
 *   xl/worksheets/sheetN.xml the cells
 *   xl/styles.xml            which number formats are DATES
 *
 * THE FOUR THINGS THAT MAKE A NAIVE READER WRONG, each of which produces
 * a plausible-looking table rather than an error:
 *
 *   A DATE IS A NUMBER. Excel stores 2024-03-01 as 45352. A reader that
 *   ignores styles.xml reports a date column as integers, and every chart
 *   built on it plots forty-five thousand.
 *
 *   AN EMPTY CELL HAS NO ELEMENT AT ALL. Rows list only the cells that
 *   have content, so `A1, C1` means B1 is empty — and a reader that
 *   appends cells in order shifts C into B for that row only. The cell
 *   REFERENCE ("C1") is the position; the order is not.
 *
 *   A SHARED STRING CAN BE RICH TEXT. `<si><r><t>Total</t></r><r><t>s</t></r></si>`
 *   is the one word "Totals" split across two runs. Reading only the
 *   first <t> loses half of it.
 *
 *   THE SHEETS ARE NOT NECESSARILY sheet1.xml. The workbook's own
 *   relationship file says which part each sheet is, and the first sheet
 *   in the book is frequently sheet2.xml or worse.
 *
 * XXE IS IMPOSSIBLE BY CONSTRUCTION rather than by configuration: this is
 * a scanner, not an XML processor. It resolves the five predefined
 * entities and numeric character references, and treats anything else —
 * including a DOCTYPE and any entity declared in one — as literal text.
 * There is no code path that opens a file or a URL named in the
 * document.
 */

export type XlsxResult = ({ ok: true } & ParsedTable & { sheetName: string; sheetNames: string[] }) | { ok: false; reason: string };

/** Excel's own built-in number formats that mean "date" or "time". */
const BUILTIN_DATE_FORMATS = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 45, 46, 47]);

export function parseXlsx(buffer: Buffer, wantedSheet?: string): XlsxResult {
  const index = readZipIndex(buffer);
  if (!index.ok) return { ok: false, reason: index.reason };

  const read = (name: string): string | null => {
    const entry = index.entries.get(name);
    if (!entry) return null;
    const data = readZipEntry(buffer, entry);
    return data ? data.toString("utf8") : null;
  };

  const workbook = read("xl/workbook.xml");
  if (!workbook) return { ok: false, reason: "not an Excel workbook" };

  const rels = read("xl/_rels/workbook.xml.rels") ?? "";
  const relTargets = new Map<string, string>();
  for (const m of rels.matchAll(/<Relationship\b[^>]*>/g)) {
    const id = attr(m[0], "Id");
    const target = attr(m[0], "Target");
    if (id && target) relTargets.set(id, target);
  }

  const sheets: { name: string; part: string }[] = [];
  for (const m of workbook.matchAll(/<sheet\b[^>]*\/?>/g)) {
    const name = decodeXml(attr(m[0], "name") ?? "");
    // The r:id attribute, whatever prefix this writer used for the
    // relationships namespace — some write r:id, some write, unhelpfully,
    // something else bound to the same namespace.
    const rid = attr(m[0], "r:id") ?? attr(m[0], "id");
    const target = rid ? relTargets.get(rid) : undefined;
    if (!name || !target) continue;
    const part = target.startsWith("/") ? target.slice(1) : `xl/${target.replace(/^\.\//, "")}`;
    sheets.push({ name, part });
  }
  if (sheets.length === 0) return { ok: false, reason: "the workbook has no sheets" };

  const chosen = wantedSheet ? sheets.find((s) => s.name === wantedSheet) ?? sheets[0] : sheets[0];
  const sheetXml = read(chosen.part);
  if (!sheetXml) return { ok: false, reason: `could not read the sheet "${chosen.name}"` };

  const sharedStrings = parseSharedStrings(read("xl/sharedStrings.xml") ?? "");
  const dateStyles = parseDateStyles(read("xl/styles.xml") ?? "");

  const grid = parseSheet(sheetXml, sharedStrings, dateStyles);
  if (grid.rows.length === 0) return { ok: false, reason: "the sheet is empty" };
  if (grid.width > MAX_COLUMNS) return { ok: false, reason: `more than ${MAX_COLUMNS} columns` };

  const headers = normaliseHeaders(padTo(grid.rows[0], grid.width));
  const body = grid.rows.slice(1).map((r) => padTo(r, grid.width));

  return {
    ok: true,
    sheetName: chosen.name,
    sheetNames: sheets.map((s) => s.name),
    headers,
    rows: body.slice(0, MAX_ROWS),
    truncated: grid.truncated || body.length > MAX_ROWS,
    // An .xlsx grid is rectangular by construction here — every row is
    // padded to the widest — so there is nothing ragged to count. Kept in
    // the shape so the two readers return the same thing.
    raggedRows: 0,
  };
}

function padTo(row: string[], width: number): string[] {
  return row.length >= width ? row.slice(0, width) : [...row, ...new Array(width - row.length).fill("")];
}

// ---------------------------------------------------------------------
// Shared strings
// ---------------------------------------------------------------------
export function parseSharedStrings(xml: string): string[] {
  const out: string[] = [];
  for (const si of xml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)) {
    // EVERY <t>, joined. Rich text splits one word across runs, and
    // taking the first gives "Tot" where the cell says "Totals".
    const parts = [...si[1].matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((m) => decodeXml(m[1]));
    out.push(parts.join(""));
  }
  return out;
}

// ---------------------------------------------------------------------
// Which style indexes mean "date"
// ---------------------------------------------------------------------
export function parseDateStyles(xml: string): Set<number> {
  // Custom formats first: anything whose format code contains a date or
  // time token and is not inside a literal quoted section.
  const customDateIds = new Set<number>();
  for (const m of xml.matchAll(/<numFmt\b[^>]*\/?>/g)) {
    const id = Number(attr(m[0], "numFmtId"));
    const code = decodeXml(attr(m[0], "formatCode") ?? "");
    if (!Number.isFinite(id)) continue;
    // Quoted literals stripped first: a currency format like
    // "\"EUR\" #,##0.00" contains no date token, but one written
    // `"date:"#,##0` would look like one to a naive scan.
    const bare = code.replace(/"[^"]*"/g, "").replace(/\[[^\]]*\]/g, "");
    if (/[dmyhs]/i.test(bare) && /[dy]|hh|ss|mm:/i.test(bare)) customDateIds.add(id);
  }

  const dateStyles = new Set<number>();
  const cellXfs = xml.match(/<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/);
  if (!cellXfs) return dateStyles;
  let styleIndex = 0;
  for (const m of cellXfs[1].matchAll(/<xf\b[^>]*\/?>/g)) {
    const numFmtId = Number(attr(m[0], "numFmtId") ?? "0");
    if (BUILTIN_DATE_FORMATS.has(numFmtId) || customDateIds.has(numFmtId)) dateStyles.add(styleIndex);
    styleIndex++;
  }
  return dateStyles;
}

// ---------------------------------------------------------------------
// The grid
// ---------------------------------------------------------------------
function parseSheet(
  xml: string,
  sharedStrings: readonly string[],
  dateStyles: ReadonlySet<number>
): { rows: string[][]; width: number; truncated: boolean } {
  const rows: string[][] = [];
  let width = 0;
  let truncated = false;

  for (const rowMatch of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    if (rows.length > MAX_ROWS) {
      truncated = true;
      break;
    }
    const cells: string[] = [];
    for (const cellMatch of rowMatch[1].matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>|<c\b([^>]*)\/>/g)) {
      const attrs = cellMatch[1] ?? cellMatch[3] ?? "";
      const inner = cellMatch[2] ?? "";
      const ref = attr(`<c ${attrs}>`, "r");
      // POSITION FROM THE REFERENCE, not from arrival order — that is
      // what stops a row with a gap from shifting every column after it.
      const column = ref ? columnIndex(ref) : cells.length;
      while (cells.length < column) cells.push("");
      cells[column] = cellValue(attrs, inner, sharedStrings, dateStyles);
    }
    // A ROW ELEMENT WITH NO CELLS is a blank row in the middle of a
    // sheet; keeping it would insert an empty record into every count.
    if (cells.some((c) => c !== "")) {
      rows.push(cells);
      if (cells.length > width) width = cells.length;
    }
  }

  return { rows, width, truncated };
}

function cellValue(
  attrs: string,
  inner: string,
  sharedStrings: readonly string[],
  dateStyles: ReadonlySet<number>
): string {
  const tag = `<c ${attrs}>`;
  const type = attr(tag, "t") ?? "n";
  const styleAttr = attr(tag, "s");
  const style = styleAttr === null ? null : Number(styleAttr);

  if (type === "inlineStr") {
    const parts = [...inner.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((m) => decodeXml(m[1]));
    return parts.join("");
  }

  const raw = inner.match(/<v\b[^>]*>([\s\S]*?)<\/v>/)?.[1] ?? "";
  if (raw === "") return "";
  const value = decodeXml(raw);

  if (type === "s") {
    const idx = Number(value);
    return Number.isInteger(idx) && idx >= 0 && idx < sharedStrings.length ? sharedStrings[idx] : "";
  }
  if (type === "b") return value === "1" ? "TRUE" : "FALSE";
  // "e" is an error cell (#DIV/0!, #N/A). Kept verbatim rather than
  // blanked: a column full of #N/A is a fact about the spreadsheet, and
  // silently emptying it would make the analysis claim the data is clean.
  if (type === "e") return value;
  if (type === "str") return value;

  // A number — unless its style says it is a date.
  if (style !== null && dateStyles.has(style)) {
    const serial = Number(value);
    if (Number.isFinite(serial)) return excelSerialToIso(serial);
  }
  return value;
}

/**
 * Excel's day 1 is 1900-01-01, and the epoch is off by one because the
 * 1900 calendar contains a 29th of February that never happened — Lotus
 * 1-2-3 had the bug and Excel kept it for compatibility. So serial 60 is
 * that phantom day, and everything after it is one greater than the true
 * day count.
 */
export function excelSerialToIso(serial: number): string {
  if (!Number.isFinite(serial) || serial <= 0) return String(serial);
  // Serials below 60 are before the phantom day and need no correction.
  const days = serial < 60 ? serial : serial - 1;
  const ms = Math.round((days - 1) * 86_400_000);
  const date = new Date(Date.UTC(1900, 0, 1) + ms);
  if (Number.isNaN(date.getTime())) return String(serial);
  const iso = date.toISOString();
  // A whole number of days is a date; a fraction carries a time.
  return Number.isInteger(serial) ? iso.slice(0, 10) : iso.slice(0, 19).replace("T", " ");
}

export function columnIndex(ref: string): number {
  let n = 0;
  for (const ch of ref) {
    const code = ch.charCodeAt(0);
    if (code >= 65 && code <= 90) n = n * 26 + (code - 64);
    else if (code >= 97 && code <= 122) n = n * 26 + (code - 96);
    else break;
  }
  return Math.max(0, n - 1);
}

function attr(tag: string, name: string): string | null {
  const match = tag.match(new RegExp(`\\s${name.replace(":", "\\:")}="([^"]*)"`));
  return match ? match[1] : null;
}

/**
 * The five predefined entities and numeric character references. Nothing
 * else — an entity declared in a DOCTYPE resolves to itself, which is why
 * there is no XXE here to configure away.
 */
export function decodeXml(text: string): string {
  return text
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => safeCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => safeCodePoint(parseInt(dec, 10)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    // LAST, not first. Decoding &amp; before the others turns the literal
    // text "&amp;lt;" into "<" — one round of decoding too many, which is
    // how an escaped tag becomes a real one.
    .replace(/&amp;/g, "&");
}

function safeCodePoint(code: number): string {
  if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return "";
  try {
    return String.fromCodePoint(code);
  } catch {
    return "";
  }
}
