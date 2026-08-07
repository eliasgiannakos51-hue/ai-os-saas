import "server-only";
import { findZipEntry, readZipEntries, readZipEntryText, ZipError } from "@/lib/files/zip";
import { extractPdfText, PdfError, readableRatio } from "@/lib/files/pdf";
import { MAX_EXTRACTED_CHARS, type FileKind } from "@/lib/files/file-types";

/**
 * Turn an uploaded file into text the AI can be asked about.
 *
 * The unit of the result is a PAGE, even for formats that have no pages,
 * because the whole feature promises "according to <file>, page X" and a
 * citation has to point at something real. A spreadsheet's "pages" are
 * its sheets, a text file's are its 3,000-character sections. Those are
 * honest units: they are what the reader will find if they go and look.
 *
 * Nothing in this file executes anything from the document. DOCX macros,
 * XLSX formulas and PDF actions are all simply not read — this reads the
 * parts that hold words and ignores the rest of the format.
 */

export type ExtractedPage = { pageNumber: number; label: string; text: string };

export type ExtractionResult = {
  pages: ExtractedPage[];
  pageCount: number;
  /** True when the document was longer than we extract. */
  truncated: boolean;
};

export class ExtractionError extends Error {}

/** Characters per synthetic page for the formats that have none. Roughly
 *  a printed page of prose, so "page 4" means something similar wherever
 *  it appears. */
const CHARS_PER_SYNTHETIC_PAGE = 3000;

// ---------------------------------------------------------------------
// Shared XML helpers.
//
// These do NOT parse XML in the general sense, and must not: a general
// parser on attacker-supplied XML is how you get billion-laughs and
// XXE. OOXML puts its text in known elements, and pulling those out with
// a scan cannot expand an entity or open a file.
// ---------------------------------------------------------------------

const XML_ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&apos;": "'",
};

function decodeXmlText(value: string): string {
  return value
    .replace(/&(amp|lt|gt|quot|apos);/g, (m) => XML_ENTITIES[m] ?? m)
    // Numeric references only — no named entity beyond the five above is
    // resolved, and no DTD is consulted. That is the XXE defence.
    .replace(/&#(\d{1,7});/g, (_, d) => safeCodePoint(Number(d)))
    .replace(/&#[xX]([0-9A-Fa-f]{1,6});/g, (_, h) => safeCodePoint(parseInt(h, 16)));
}

function safeCodePoint(value: number): string {
  if (!Number.isFinite(value) || value < 0 || value > 0x10ffff) return "";
  try {
    return String.fromCodePoint(value);
  } catch {
    return "";
  }
}

function stripTags(xml: string): string {
  return xml.replace(/<[^>]*>/g, "");
}

// ---------------------------------------------------------------------
// DOCX
// ---------------------------------------------------------------------

export function extractDocx(buf: Buffer): ExtractionResult {
  const entries = readZipEntries(buf);
  const main = findZipEntry(entries, "word/document.xml");
  if (!main) throw new ExtractionError("this .docx file is missing its document body");

  const xml = readZipEntryText(buf, main);

  // Structure first, then strip. Doing it the other way round runs every
  // paragraph together into one wall of text, which reads as a single
  // sentence to a model and destroys any sense of where a heading ended.
  const withBreaks = xml
    .replace(/<w:tab\b[^>]*\/>/g, "\t")
    .replace(/<w:br\b[^>]*\/>/g, "\n")
    .replace(/<\/w:p>/g, "\n")
    // A table cell boundary is a column break, not a word break.
    .replace(/<\/w:tc>/g, "\t")
    .replace(/<\/w:tr>/g, "\n");

  const text = decodeXmlText(stripTags(withBreaks))
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return paginate(text, "Page");
}

// ---------------------------------------------------------------------
// XLSX
// ---------------------------------------------------------------------

/** Column letters from a cell reference, so a row reads A,B,C in order
 *  even when the file omits empty cells (which it always does). */
function columnIndex(ref: string): number {
  const letters = /^([A-Z]+)/.exec(ref)?.[1] ?? "";
  let index = 0;
  for (const ch of letters) index = index * 26 + (ch.charCodeAt(0) - 64);
  return index;
}

export function extractXlsx(buf: Buffer): ExtractionResult {
  const entries = readZipEntries(buf);

  // The shared string table: every repeated text value in the workbook
  // lives here once and is referenced by index from the cells.
  const sharedStrings: string[] = [];
  const sharedEntry = findZipEntry(entries, "xl/sharedStrings.xml");
  if (sharedEntry) {
    const xml = readZipEntryText(buf, sharedEntry);
    for (const si of xml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)) {
      // An <si> may hold several <t> runs (mixed formatting); they are
      // one string, so they are joined without a separator.
      const parts = [...si[1].matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((m) => decodeXmlText(m[1]));
      sharedStrings.push(parts.join(""));
    }
  }

  // Sheet names, in workbook order, so a citation can say which sheet.
  const sheetNames: string[] = [];
  const workbook = findZipEntry(entries, "xl/workbook.xml");
  if (workbook) {
    const xml = readZipEntryText(buf, workbook);
    for (const m of xml.matchAll(/<sheet\b[^>]*\bname="([^"]*)"/g)) {
      sheetNames.push(decodeXmlText(m[1]));
    }
  }

  const sheetEntries = entries
    .filter((e) => /^xl\/worksheets\/sheet\d+\.xml$/.test(e.name))
    .sort((a, b) => {
      const na = Number(/sheet(\d+)\.xml$/.exec(a.name)?.[1] ?? 0);
      const nb = Number(/sheet(\d+)\.xml$/.exec(b.name)?.[1] ?? 0);
      return na - nb;
    });

  if (sheetEntries.length === 0) throw new ExtractionError("this .xlsx file has no worksheets");

  const pages: ExtractedPage[] = [];

  for (let s = 0; s < sheetEntries.length; s++) {
    const xml = readZipEntryText(buf, sheetEntries[s]);
    const rows: string[] = [];

    for (const row of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
      const cells: { index: number; value: string }[] = [];

      for (const cell of row[1].matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g)) {
        const attrs = cell[1];
        const body = cell[2];
        const ref = /\br="([A-Z]+\d+)"/.exec(attrs)?.[1] ?? "";
        const type = /\bt="([^"]+)"/.exec(attrs)?.[1] ?? "n";

        let value = "";
        if (type === "s") {
          const index = Number(decodeXmlText(stripTags(/<v\b[^>]*>([\s\S]*?)<\/v>/.exec(body)?.[1] ?? "")));
          value = sharedStrings[index] ?? "";
        } else if (type === "inlineStr") {
          value = [...body.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((m) => decodeXmlText(m[1])).join("");
        } else {
          // Numbers, dates and booleans all arrive as <v>. The CACHED
          // value is used, never the <f> formula: a formula is code, and
          // the thing being read here is a document.
          value = decodeXmlText(/<v\b[^>]*>([\s\S]*?)<\/v>/.exec(body)?.[1] ?? "");
        }

        if (value !== "") cells.push({ index: columnIndex(ref), value: value.replace(/\t/g, " ") });
      }

      if (cells.length === 0) continue;
      cells.sort((a, b) => a.index - b.index);

      // Padded to the real column positions so that a gap in the sheet
      // stays a gap. A model reading a table with the blanks squeezed out
      // silently mis-attributes every value after the gap.
      const line: string[] = [];
      let expected = 1;
      for (const cell of cells) {
        while (expected < cell.index) {
          line.push("");
          expected++;
        }
        line.push(cell.value);
        expected++;
      }
      rows.push(line.join("\t"));
    }

    const name = sheetNames[s] ?? `Sheet ${s + 1}`;
    pages.push({
      pageNumber: pages.length + 1,
      label: name,
      text: rows.join("\n").trim(),
    });
  }

  return { pages, pageCount: pages.length, truncated: false };
}

// ---------------------------------------------------------------------
// Plain text kinds
// ---------------------------------------------------------------------

function paginate(text: string, unit: string): ExtractionResult {
  if (!text) return { pages: [], pageCount: 0, truncated: false };

  const pages: ExtractedPage[] = [];
  // Break on a paragraph boundary near the target size rather than
  // mid-sentence: a citation that lands in the middle of a word is a
  // citation nobody can verify.
  let cursor = 0;
  while (cursor < text.length) {
    let end = Math.min(text.length, cursor + CHARS_PER_SYNTHETIC_PAGE);
    if (end < text.length) {
      const paragraph = text.lastIndexOf("\n\n", end);
      const line = text.lastIndexOf("\n", end);
      const boundary = paragraph > cursor + CHARS_PER_SYNTHETIC_PAGE / 2 ? paragraph : line;
      if (boundary > cursor + CHARS_PER_SYNTHETIC_PAGE / 2) end = boundary;
    }
    const slice = text.slice(cursor, end).trim();
    if (slice) {
      pages.push({ pageNumber: pages.length + 1, label: `${unit} ${pages.length + 1}`, text: slice });
    }
    cursor = end;
    if (pages.length >= 400) break;
  }

  return { pages, pageCount: pages.length, truncated: cursor < text.length };
}

export function extractPlainText(buf: Buffer, kind: FileKind): ExtractionResult {
  // Strip a UTF-8 BOM: it is invisible in every editor and turns the
  // first heading of a Markdown file into a non-heading.
  let text = buf.toString("utf8");
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  return paginate(text.replace(/\r\n?/g, "\n").trim(), kind === "csv" ? "Rows" : "Page");
}

// ---------------------------------------------------------------------
// The dispatcher
// ---------------------------------------------------------------------

/**
 * Extract, then cap.
 *
 * The cap is applied to the TOTAL and drops whole pages from the end,
 * never half a page. A truncated result is reported as truncated so the
 * UI can say "the first N pages of this document are searchable" — the
 * alternative, silently answering from three-quarters of a contract while
 * claiming to have read it, is the failure mode this whole feature exists
 * to avoid.
 */
export function extractText(buf: Buffer, kind: FileKind): ExtractionResult {
  let result: ExtractionResult;

  try {
    if (kind === "pdf") {
      const pdf = extractPdfText(buf);
      const pages = pdf.pages.map((p) => ({
        pageNumber: p.pageNumber,
        label: `Page ${p.pageNumber}`,
        text: p.text,
      }));
      const joined = pages.map((p) => p.text).join("");
      if (joined.trim().length < 20 || readableRatio(joined) < 0.6) {
        throw new ExtractionError(
          "no readable text was found in this PDF — it is probably a scan, and it would need OCR before the AI can read it"
        );
      }
      result = {
        pages,
        pageCount: pdf.totalPages,
        truncated: pdf.truncated,
      };
    } else if (kind === "docx") {
      result = extractDocx(buf);
    } else if (kind === "xlsx") {
      result = extractXlsx(buf);
    } else {
      result = extractPlainText(buf, kind);
    }
  } catch (err) {
    if (err instanceof ExtractionError) throw err;
    if (err instanceof PdfError) throw new ExtractionError(err.message);
    if (err instanceof ZipError) throw new ExtractionError(err.message);
    throw new ExtractionError("this file could not be read");
  }

  if (result.pages.length === 0) {
    throw new ExtractionError("this file appears to be empty");
  }

  let total = 0;
  const kept: ExtractedPage[] = [];
  for (const page of result.pages) {
    if (total + page.text.length > MAX_EXTRACTED_CHARS) break;
    total += page.text.length;
    kept.push(page);
  }
  if (kept.length === 0) kept.push({ ...result.pages[0], text: result.pages[0].text.slice(0, MAX_EXTRACTED_CHARS) });

  return {
    pages: kept,
    pageCount: result.pageCount,
    truncated: result.truncated || kept.length < result.pages.length,
  };
}

/** The stored form: one string, with page markers the citation checker
 *  can find again. The markers are deliberately ugly and unlikely to
 *  occur in a real document. */
export const PAGE_MARKER_PREFIX = "\n\n[[PAGE ";

export function serialisePages(pages: ExtractedPage[]): string {
  return pages.map((p) => `${PAGE_MARKER_PREFIX}${p.pageNumber}|${p.label}]]\n${p.text}`).join("").trim();
}

export function deserialisePages(stored: string): ExtractedPage[] {
  const pages: ExtractedPage[] = [];
  const pattern = /\[\[PAGE (\d+)\|([^\]]*)\]\]\n?/g;
  const matches = [...stored.matchAll(pattern)];

  if (matches.length === 0) {
    return stored.trim() ? [{ pageNumber: 1, label: "Page 1", text: stored }] : [];
  }
  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].index! + matches[i][0].length;
    const end = i + 1 < matches.length ? matches[i + 1].index! : stored.length;
    pages.push({
      pageNumber: Number(matches[i][1]),
      label: matches[i][2],
      text: stored.slice(start, end).trim(),
    });
  }
  return pages;
}
