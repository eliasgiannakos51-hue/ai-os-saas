import { resolveLanguage } from "@/lib/text/resolve-language";
import type { Piece } from "@/lib/translate/segments";

/**
 * PASTED TEXT, AS PARAGRAPHS (the standalone Translate tool, package 1-2,
 * 2026-10-24) — the plain-text counterpart to lib/translate/sources.ts's
 * `planSite`/`planDocument`. There is no HTML here, so there is nothing
 * for lib/translate/segments.ts's mark machinery to protect: a paragraph
 * is split on a blank line and sent as one `Piece`, and comes back as one
 * string. A paragraph a translation leaves empty keeps its original text
 * and is counted (`kept`), the same accounting rebuildHtml uses for a
 * piece whose marks did not round-trip.
 *
 * A ceiling well under MAX_TRANSLATE_CHARS (60,000, lib/translate/
 * translate-prompt.ts): pasted text is typed or pasted by hand, not a
 * whole site, so 20,000 characters (roughly 3,500 words) is already a
 * long document and keeps one estimate/one reservation covering every
 * target language at once from growing past what one page shows well.
 */
export const MAX_TRANSLATE_TEXT_CHARS = 20_000;

/** Up to five at once (the owner's own ceiling, "ΚΟΜΜΑΤΙ 1") — more than
 *  that is a batch job, not a paste-and-read screen. */
export const MAX_TRANSLATE_TARGETS = 5;

export type TextPlan = { paragraphs: string[]; pieces: Piece[]; from: string };

export function splitParagraphs(text: string): string[] {
  return text
    .split(/\r?\n\s*\r?\n/)
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

export function planText(text: string): TextPlan {
  const paragraphs = splitParagraphs(text);
  const pieces: Piece[] = paragraphs.map((p) => ({ text: p, kind: "plain" }));
  const from = resolveLanguage(paragraphs.join(" ").slice(0, 6000), "en");
  return { paragraphs, pieces, from };
}

/**
 * A crude, pre-submit proxy for the price hint — chars typed times
 * languages chosen, the same kind of formula lib/documents/writer.ts's
 * `docEstimateInputChars` uses. Real pricing (POST api/translate/text,
 * mode "price") uses the exact paragraphs, the exact language and the
 * exact register; this only has the length, because ChatComposer gives
 * the parent a length while typing and the text itself only on send
 * (components/chat/chat-composer.tsx) — keystrokes stay fast because the
 * parent never re-renders on one.
 */
export const TRANSLATE_SYSTEM_OVERHEAD_CHARS = 420;
export function translateTextLiveEstimateChars(textChars: number, targetCount: number): number {
  return Math.max(0, targetCount) * (Math.max(0, textChars) + TRANSLATE_SYSTEM_OVERHEAD_CHARS);
}

export type RebuiltText = { paragraphs: string[]; kept: number };

/** A translation that is missing or blank leaves that paragraph exactly as it was, counted in `kept`. */
export function rebuildText(paragraphs: readonly string[], translations: readonly (string | null | undefined)[]): RebuiltText {
  let kept = 0;
  const out = paragraphs.map((original, i) => {
    const v = translations[i];
    if (typeof v !== "string" || !v.trim()) {
      kept++;
      return original;
    }
    return v.trim();
  });
  return { paragraphs: out, kept };
}
