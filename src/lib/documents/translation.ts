import { escapeHtml } from "@/lib/html-escape";
import { LANGUAGES } from "@/lib/languages";

/**
 * DOWNLOADING A DOCUMENT IN ANOTHER LANGUAGE — the pure half.
 *
 * V4.6: "Before it downloads, ask which language: the document's own, or
 * a translation. And if it translates, it CHARGES — say so BEFORE, with
 * the amount." Everything here is deterministic and dependency-free so
 * scripts/tests/documents-pdf-language.test.mjs can execute it: the model
 * call and the money live in app/api/documents/[id]/pdf/route.ts.
 *
 * WHAT IS TRANSLATED IS THE HTML, NOT THE TEXT. The editor stores
 * `{ html }` and the PDF is laid out from that HTML's headings, lists and
 * emphasis (lib/pdf/blocks.ts). Translating extracted text would flatten
 * a document into paragraphs; translating the HTML and parsing it the
 * same way keeps the shape.
 */

/** The same model the text actions use for their "translate" action. */
export const TRANSLATION_MODEL = "claude-sonnet-4-6";

/**
 * A ceiling on what one translation may cost, in input characters.
 *
 * 60,000 characters is roughly fifteen pages; a Sonnet call that size is
 * a few tens of cents of real cost and a quoted price the dialog can
 * show. Above it the route refuses with the size, rather than starting a
 * call whose price would surprise. The limit is on the HTML, which is
 * what is sent.
 */
export const MAX_TRANSLATION_CHARS = 60_000;

/** The title travels inside the HTML so ONE call translates both. */
const TITLE_ATTR = 'data-ionexa-title="1"';

export type LanguageCode = (typeof LANGUAGES)[number]["code"];

/** English names, for the prompt: the model is told the target in
 *  English and in its own script, so "zh" can never be read as Zhuang. */
const ENGLISH_NAMES: Record<string, string> = {
  en: "English",
  el: "Greek",
  es: "Spanish",
  fr: "French",
  de: "German",
  it: "Italian",
  pt: "Portuguese",
  zh: "Simplified Chinese",
  ja: "Japanese",
  ar: "Arabic",
};

export function isSupportedTargetLocale(value: unknown): value is LanguageCode {
  return typeof value === "string" && LANGUAGES.some((l) => l.code === value);
}

/** "Ελληνικά (Greek)" — native first, because the reader may not read English. */
export function describeLocale(code: string): string {
  const native = LANGUAGES.find((l) => l.code === code)?.label ?? code;
  const english = ENGLISH_NAMES[code] ?? code;
  return native === english ? native : `${native} (${english})`;
}

/** No call, no charge, when the document is already in that language. */
export function needsTranslation(detectedLocale: string, targetLocale: string): boolean {
  return detectedLocale !== targetLocale;
}


/** The document as sent to the model: the title as a marked heading, then the body. */
export function translationInput(title: string, html: string): string {
  return `<h1 ${TITLE_ATTR}>${escapeHtml(title)}</h1>\n${html}`;
}

export function translationSystemPrompt(targetLocale: string): string {
  const language = describeLocale(targetLocale);
  return [
    `You translate an HTML document into ${language}.`,
    "Translate every piece of human-readable text — headings, paragraphs, list items, link text, the title in the <h1> that carries data-ionexa-title — into natural, fluent " +
      ENGLISH_NAMES[targetLocale] +
      ".",
    "Keep EVERY HTML tag and attribute exactly as it is, in the same order and nesting. Do not add, remove, merge or reorder elements. Do not translate attribute values, URLs, code, numbers, dates, currency symbols or proper names of products.",
    "If a passage is already in the target language, leave it as it is.",
    "Return ONLY the translated HTML, starting with the marked <h1>. No preamble, no code fence, no explanation.",
  ].join(" ");
}

/**
 * The model's answer, split back into a title and a body.
 *
 * The marked heading is where the title went in; if the model dropped the
 * marker, the original title stands rather than a guess from the first
 * heading — a filename should not change because a tag was lost.
 */
export function splitTranslated(output: string, fallbackTitle: string): { title: string; html: string } {
  const cleaned = output.replace(/^\s*```(?:html)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
  const m = cleaned.match(/<h1\b[^>]*data-ionexa-title="1"[^>]*>([\s\S]*?)<\/h1>\s*/i);
  if (!m) return { title: fallbackTitle, html: cleaned };
  const title = decodeBasicEntities(m[1].replace(/<[^>]+>/g, "")).trim() || fallbackTitle;
  return { title, html: cleaned.slice((m.index ?? 0) + m[0].length) };
}

function decodeBasicEntities(text: string): string {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

/**
 * The output cap for the call, from the input size: translated HTML is
 * about the length of the source, and a cap far above that only makes a
 * runaway answer expensive. Never below a floor, so a short document does
 * not get cut mid-sentence; never above the model's own ceiling.
 */
export function translationMaxTokens(inputChars: number): number {
  // A non-finite or negative size is a caller's bug, not a reason to send
  // NaN to the API: it gets the floor.
  const chars = Number.isFinite(inputChars) && inputChars > 0 ? inputChars : 0;
  const estimatedTokens = Math.ceil(chars / 2.5);
  return Math.max(1024, Math.min(16_000, estimatedTokens));
}
