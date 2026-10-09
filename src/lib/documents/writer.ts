import type { PdfBlock, PdfRun } from "@/lib/pdf/blocks";
import { escapeHtml } from "@/lib/html-escape";

/**
 * A DOCUMENT WRITTEN FROM A DESCRIPTION, AS BLOCKS (MASTER 16, package 14:
 * «παίρνω έγγραφο από περιγραφή, αλλάζω μία παράγραφο με λόγια, και το
 * κατεβάζω σε Word και PDF»), behind the switch "document-writer".
 *
 * ONE SHAPE FOR EVERYTHING A DOCUMENT IS. The editor stores HTML
 * (user_documents.content.html), the PDF is drawn from lib/pdf/blocks.ts's
 * PdfBlock list, and the Word file and the boxes are drawn from the same
 * list: htmlToBlocks reads a document, blocksToHtml writes one back. So a
 * document the model wrote and one a person typed are the same thing, and
 * a paragraph changed with words is one block replaced in that list, every
 * other block kept as it was (keepOnlyBlock).
 *
 * The model's answer is parsed here and clamped, as every generator in this
 * app is: a heading longer than MAX_HEADING_CHARS is cut, a block past
 * MAX_BLOCKS is dropped. A prompt rule is a request; the parser is the
 * guarantee.
 *
 * Pure: no SDK, no database. scripts/tests/document-writer.test.mjs runs it.
 */

export const MIN_DOC_DESCRIPTION_CHARS = 10;
export const MAX_DOC_DESCRIPTION_CHARS = 4_000;
export const MIN_DOC_INSTRUCTION_CHARS = 4;
export const MAX_DOC_INSTRUCTION_CHARS = 1_000;
export const MAX_DOC_TITLE_CHARS = 120;
export const MAX_BLOCKS = 80;
export const MAX_HEADING_CHARS = 160;
export const MAX_PARAGRAPH_CHARS = 2_000;
export const MAX_LIST_ITEMS = 12;
export const MAX_LIST_ITEM_CHARS = 400;
/** Characters a written document comes to at the ceiling the estimate
 *  holds for: a two-page document is ~6,000. */
export const DOC_OUTPUT_ALLOWANCE_CHARS = 9_000;

/** The kinds of document the field offers (MASTER 5.5: «Πρότυπα»). */
export const DOC_KINDS = ["free", "offer", "letter", "cv", "report", "invoice", "script"] as const;
export type DocKind = (typeof DOC_KINDS)[number];
export function isDocKind(value: unknown): value is DocKind {
  return typeof value === "string" && (DOC_KINDS as readonly string[]).includes(value);
}

export type WrittenDoc = { title: string; blocks: PdfBlock[] };
export type DocVerdict = { ok: true; doc: WrittenDoc } | { ok: false; reason: "no_blocks" | "no_title" };

function clip(value: unknown, max: number): string {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

/**
 * Plain text with `**bold**` and `*italic*` as runs — the only inline
 * marks the editor makes, so the model is allowed exactly those.
 */
export function textRuns(value: string): PdfRun[] {
  const runs: PdfRun[] = [];
  const pattern = /(\*\*([^*]+)\*\*)|(\*([^*]+)\*)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(value)) !== null) {
    if (m.index > last) runs.push({ text: value.slice(last, m.index) });
    if (m[2] !== undefined) runs.push({ text: m[2], bold: true });
    else runs.push({ text: m[4], italic: true });
    last = m.index + m[0].length;
  }
  if (last < value.length) runs.push({ text: value.slice(last) });
  return runs.filter((r) => r.text.length > 0);
}

/** One block from the model's tool input, clamped; null for nothing usable. */
function parseOneBlock(raw: unknown): PdfBlock[] {
  const b = (raw ?? {}) as Record<string, unknown>;
  if (b.kind === "heading") {
    const text = clip(b.text, MAX_HEADING_CHARS);
    if (!text) return [];
    return [{ kind: "heading", level: b.level === 2 ? 2 : b.level === 3 ? 3 : 1, runs: textRuns(text) }];
  }
  if (b.kind === "list") {
    const ordered = b.ordered === true;
    return (Array.isArray(b.items) ? b.items : [])
      .map((item) => clip(item, MAX_LIST_ITEM_CHARS))
      .filter((item) => item.length > 0)
      .slice(0, MAX_LIST_ITEMS)
      .map((item, i): PdfBlock => ({ kind: "listItem", marker: ordered ? `${i + 1}.` : "•", runs: textRuns(item) }));
  }
  const text = clip(b.text, MAX_PARAGRAPH_CHARS);
  return text ? [{ kind: "paragraph", runs: textRuns(text) }] : [];
}

/** The model's write_document input, made safe. */
export function parseDocToolInput(raw: unknown, fallbackTitle: string): DocVerdict {
  const input = (raw ?? {}) as Record<string, unknown>;
  const blocks: PdfBlock[] = [];
  for (const entry of Array.isArray(input.blocks) ? input.blocks : []) {
    for (const block of parseOneBlock(entry)) {
      if (blocks.length < MAX_BLOCKS) blocks.push(block);
    }
  }
  if (blocks.length === 0) return { ok: false, reason: "no_blocks" };
  const title = clip(input.title, MAX_DOC_TITLE_CHARS) || clip(fallbackTitle, MAX_DOC_TITLE_CHARS);
  if (!title) return { ok: false, reason: "no_title" };
  return { ok: true, doc: { title, blocks } };
}

/** One rewritten block from the model's rewrite_block input, the same kind
 *  as the one it replaces; null for nothing usable. */
export function parseRewrittenBlock(raw: unknown, before: PdfBlock): PdfBlock | null {
  const text = clip((raw as Record<string, unknown> | null)?.text, before.kind === "heading" ? MAX_HEADING_CHARS : before.kind === "listItem" ? MAX_LIST_ITEM_CHARS : MAX_PARAGRAPH_CHARS);
  if (!text) return null;
  if (before.kind === "heading") return { kind: "heading", level: before.level, runs: textRuns(text) };
  if (before.kind === "listItem") return { kind: "listItem", marker: before.marker, runs: textRuns(text) };
  if (before.kind === "rule") return null;
  return { kind: "paragraph", runs: textRuns(text) };
}

function runsToHtml(runs: readonly PdfRun[]): string {
  return runs
    .map((r) => {
      let out = escapeHtml(r.text);
      if (r.italic) out = `<em>${out}</em>`;
      if (r.bold) out = `<strong>${out}</strong>`;
      if (r.href && /^https?:\/\//i.test(r.href)) out = `<a href="${escapeHtml(r.href)}">${out}</a>`;
      return out;
    })
    .join("");
}

/**
 * Blocks back to the editor's HTML: headings, paragraphs, and consecutive
 * list items of one kind as one list. Every character is escaped, so text
 * the model wrote is text and never markup.
 */
export function blocksToHtml(blocks: readonly PdfBlock[]): string {
  const out: string[] = [];
  let list: "ul" | "ol" | null = null;
  const close = () => {
    if (list) out.push(`</${list}>`);
    list = null;
  };
  for (const block of blocks) {
    if (block.kind === "listItem") {
      const kind = /^\d+\.$/.test(block.marker) ? "ol" : "ul";
      if (list !== kind) {
        close();
        out.push(`<${kind}>`);
        list = kind;
      }
      out.push(`<li>${runsToHtml(block.runs)}</li>`);
      continue;
    }
    close();
    if (block.kind === "heading") out.push(`<h${block.level}>${runsToHtml(block.runs)}</h${block.level}>`);
    else if (block.kind === "paragraph") out.push(`<p>${runsToHtml(block.runs)}</p>`);
    else out.push("<hr>");
  }
  close();
  return out.join("");
}

/** A block's words, as the person and the model read them. */
export function blockText(block: PdfBlock): string {
  return block.kind === "rule" ? "—" : block.runs.map((r) => (r.bold ? `**${r.text}**` : r.italic ? `*${r.text}*` : r.text)).join("");
}

/**
 * ONE BOX, ONE CHANGE: the block at `index` from what the model rewrote,
 * every other block exactly as stored. Null for an index that is not a
 * block of this document, or a rewrite that is not usable.
 */
export function keepOnlyBlock(stored: readonly PdfBlock[], index: number, rewritten: PdfBlock | null): PdfBlock[] | null {
  if (!Number.isInteger(index) || index < 0 || index >= stored.length || !rewritten) return null;
  return stored.map((block, i) => (i === index ? rewritten : block));
}

/** A block index from a request body, or null for the whole document, or "bad". */
export function readBlockIndex(value: unknown, total: number): number | null | "bad" {
  if (value === undefined || value === null) return null;
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value < total ? value : "bad";
}

/** Characters an edit sends: the whole document as text, plus the instruction. */
export function docEditEstimateInputChars(blocks: readonly PdfBlock[], instructionChars: number): number {
  return blocks.reduce((n, b) => n + blockText(b).length + 8, 0) + Math.max(0, instructionChars);
}

/** Characters a generation is held for: the brief, the records, and the
 *  document it will write. */
export function docEstimateInputChars(descriptionChars: number): number {
  return Math.max(0, descriptionChars) + DOC_OUTPUT_ALLOWANCE_CHARS;
}

export type DescriptionVerdict = { ok: true } | { ok: false; reason: "too_short" | "too_long"; limit: number };
export function checkDocDescription(description: string): DescriptionVerdict {
  const length = description.trim().length;
  if (length < MIN_DOC_DESCRIPTION_CHARS) return { ok: false, reason: "too_short", limit: MIN_DOC_DESCRIPTION_CHARS };
  if (length > MAX_DOC_DESCRIPTION_CHARS) return { ok: false, reason: "too_long", limit: MAX_DOC_DESCRIPTION_CHARS };
  return { ok: true };
}
