import { MAX_PDF_PAGES } from "@/lib/files/file-types";
import type { Citation } from "@/lib/files/answer";

/**
 * «Η ΑΠΑΝΤΗΣΗ ΓΡΑΦΕΙ ΣΕ ΠΟΙΑ ΣΕΛΙΔΑ ΤΟ ΒΡΗΚΕ» (MASTER 16, package 12),
 * behind the switch "file-pages".
 *
 * The answer already names pages, and every name is CHECKED against the
 * pages the model was shown (lib/files/ask.ts, verifyCitations), which now
 * keeps the file and page each one resolved to. This file turns that into
 * what the screen needs: the answer cut into text and pressable
 * references, the list of pages without repeats, the address that opens a
 * PDF at a page, and — for a PDF longer than MAX_PDF_PAGES — which pages
 * were never read, so an answer is not taken as covering what it did not
 * see. Client-safe. Held by scripts/tests/file-pages.test.mjs.
 */

export type AnswerPiece = { text: string } | { citation: Citation };

const CITATION = /\[([^\][|]{1,200}?),\s*([^\][|]{1,80}?)\]/g;

/**
 * The answer as text and references. Only a reference the checker kept —
 * same file, same label — becomes pressable; anything else in brackets
 * stays text.
 */
export function splitAnswer(text: string, citations: readonly Citation[]): AnswerPiece[] {
  const known = new Map(citations.filter((c) => c.fileId && c.page).map((c) => [`${c.filename}|${c.label}`, c]));
  const pieces: AnswerPiece[] = [];
  let at = 0;
  for (const m of text.matchAll(CITATION)) {
    const citation = known.get(`${m[1].trim()}|${m[2].trim()}`);
    if (!citation) continue;
    if (m.index! > at) pieces.push({ text: text.slice(at, m.index) });
    pieces.push({ citation });
    at = m.index! + m[0].length;
  }
  if (at < text.length) pieces.push({ text: text.slice(at) });
  return pieces;
}

/** Each page once, in the order the answer first cites it. */
export function uniquePages(citations: readonly Citation[]): Citation[] {
  const seen = new Set<string>();
  return citations.filter((c) => {
    const key = c.fileId && c.page ? `${c.fileId}|${c.page}` : `${c.filename}|${c.label}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Opens the PDF at that page in a new tab (api/files/[id]/view). */
export function pdfPageHref(fileId: string, page: number): string {
  return `/api/files/${encodeURIComponent(fileId)}/view?page=${Math.max(1, Math.floor(page))}`;
}

export type UnreadPages = { filename: string; read: number; total: number };

/**
 * A file whose stored page count is larger than the pages it was read
 * from: a PDF past MAX_PDF_PAGES, which ingest keeps but reads only so far.
 */
export function unreadPages(files: readonly { filename: string; extracted_text: string | null; page_count?: number | null }[]): UnreadPages[] {
  return files.flatMap((f) => {
    const total = typeof f.page_count === "number" ? f.page_count : 0;
    const read = (f.extracted_text ?? "").match(/\[\[PAGE \d+\|/g)?.length ?? 0;
    return read > 0 && total > read ? [{ filename: f.filename, read, total }] : [];
  });
}

/** What a file's line says about its pages: all of them, or the first MAX_PDF_PAGES. */
export function pagesRead(fileType: string, pageCount: number | null): { read: number; total: number } | null {
  if (fileType !== "pdf" || pageCount === null || pageCount <= MAX_PDF_PAGES) return null;
  return { read: MAX_PDF_PAGES, total: pageCount };
}

/** The answer's own record of unread pages, read defensively. */
export function readUnreadPages(raw: unknown): UnreadPages[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((u) => {
    if (!u || typeof u !== "object") return [];
    const { filename, read, total } = u as Record<string, unknown>;
    return typeof filename === "string" && Number.isInteger(read) && Number.isInteger(total) && (total as number) > (read as number)
      ? [{ filename, read: read as number, total: total as number }]
      : [];
  });
}
