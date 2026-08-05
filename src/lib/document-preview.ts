import type { DocumentContent } from "@/types/document";

const MAX_PREVIEW_CHARS = 200;

/**
 * Plain-text preview of a document's body, for the two-line description
 * on its card.
 *
 * The stored body is the contentEditable editor's own HTML, so it has to
 * be flattened before it can be shown as text. This strips tags rather
 * than rendering them: the card must never execute or lay out the note's
 * markup, only summarise it. Block-level tags become spaces so
 * "<p>a</p><p>b</p>" reads as "a b" rather than "ab".
 */
export function documentPreviewText(content: DocumentContent | null | undefined): string | null {
  const html = content?.html;
  if (typeof html !== "string" || html.trim() === "") return null;

  const text = html
    // Drop anything that could carry text we shouldn't surface at all.
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();

  if (text === "") return null;
  return text.length > MAX_PREVIEW_CHARS ? `${text.slice(0, MAX_PREVIEW_CHARS)}…` : text;
}
