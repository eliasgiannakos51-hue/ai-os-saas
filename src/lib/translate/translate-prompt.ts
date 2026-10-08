import { describeLocale, TRANSLATION_MODEL } from "@/lib/documents/translation";
import { batchPieces, type Piece } from "@/lib/translate/segments";

/**
 * WHAT IS SENT TO THE MODEL TO TRANSLATE A PAGE (package 28), pure, so the
 * estimate route and the translation route build the SAME messages and
 * quote and hold the same number (lib/billing/estimate.ts, action
 * "documentTranslate"). scripts/tests/translate.test.mjs executes it.
 */

/** The model the document PDF already translates with. */
export const TRANSLATE_MODEL = TRANSLATION_MODEL;

/**
 * A ceiling on the words of one translation, in characters of text (the
 * HTML around them is not sent). Sixty thousand is the PDF translation's
 * own ceiling (MAX_TRANSLATION_CHARS), and a five-page site
 * (MAX_PAGES_PER_SITE) of about 15,000 characters of HTML a page carries
 * well under it.
 */
export const MAX_TRANSLATE_CHARS = 60_000;

/** One call's share: small enough that a list never runs past the output ceiling. */
export const BATCH_CHARS = 6_000;
export const BATCH_COUNT = 120;
/** Calls in flight at once for one translation. */
export const PARALLEL_CALLS = 3;

export function translateSystemPrompt(target: string): string {
  const language = describeLocale(target);
  return [
    `You translate the words of a web page or a document into ${language}.`,
    "You receive a JSON list of pieces in the order they appear; neighbouring pieces are context for each other.",
    "Answer with the tool: the same number of strings, in the same order, each the translation of the piece at the same position.",
    "Pieces contain marks such as <1>, </1> and <2/>. They stand for formatting and links. Keep every mark exactly as written and exactly once; you may move a mark to where the other language puts those words.",
    "Keep numbers, prices, currencies, dates, email and web addresses, phone numbers, and the names of businesses, places, brands and products as they are.",
    `A piece already in ${language}, or that is only a name, comes back unchanged.`,
    "Never merge, split, skip, explain or add pieces.",
  ].join(" ");
}

export const TRANSLATE_TOOL = {
  name: "translations",
  description: "The translated pieces, one for each piece sent, in the same order.",
  input_schema: {
    type: "object" as const,
    properties: { translations: { type: "array", items: { type: "string" } } },
    required: ["translations"],
  },
};

export function batchMessage(pieces: readonly Piece[], indexes: readonly number[], target: string): string {
  return JSON.stringify({ language: describeLocale(target), pieces: indexes.map((i) => pieces[i].text) });
}

export function translateBatches(pieces: readonly Piece[]): number[][] {
  return batchPieces(pieces, BATCH_CHARS, BATCH_COUNT);
}

/** Characters of everything sent, every call counted: what the estimate is sized on. */
export function translateInputChars(pieces: readonly Piece[], target: string): number {
  const system = translateSystemPrompt(target).length;
  return translateBatches(pieces).reduce((sum, b) => sum + system + batchMessage(pieces, b, target).length, 0);
}

/** Characters of words: what MAX_TRANSLATE_CHARS bounds. */
export function textChars(pieces: readonly Piece[]): number {
  return pieces.reduce((sum, p) => sum + p.text.length, 0);
}

/**
 * The output ceiling for one call. Greek and Chinese spend more tokens per
 * character than English, so the ceiling is sized at 1.5 characters a
 * token rather than the 2.5 the PDF translation uses for HTML.
 */
export function batchMaxTokens(messageChars: number): number {
  const chars = Number.isFinite(messageChars) && messageChars > 0 ? messageChars : 0;
  return Math.max(2048, Math.min(16_000, Math.ceil(chars / 1.5) + 512));
}
