import type { AiToolSpec } from "@/lib/ai/providers/types";
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

/**
 * THE STANDALONE TOOL'S REGISTER (the owner's "ΛΕΙΤΟΥΡΓΙΚΟ, ΚΟΜΜΑΤΙ
 * ΚΟΜΜΑΤΙ", package 1). The site/document translation above never asked
 * for one — a copy of a whole page keeps its own voice. Pasted text has
 * no existing voice to keep unless the person says "as the original".
 */
export type TranslateStyle = "formal" | "friendly" | "source";
export const TRANSLATE_STYLES: readonly TranslateStyle[] = ["formal", "friendly", "source"];
export const isTranslateStyle = (v: unknown): v is TranslateStyle => TRANSLATE_STYLES.includes(v as TranslateStyle);

function styleLine(style: TranslateStyle): string {
  switch (style) {
    case "formal": return "Use a formal, professional register throughout.";
    case "friendly": return "Use a warm, friendly, conversational register throughout.";
    case "source": return "Match the register and tone of the original paragraphs exactly.";
  }
}

/**
 * THE GLOSSARY LINE (package 4): words this account said to keep exactly
 * as written — a product name, a code, a name not every reader would
 * recognise as a proper noun the way "Camping Ήλιος" or "Apple" is. Empty
 * or omitted adds nothing; the sentence about ordinary names, numbers and
 * addresses below is unconditional either way.
 */
function glossaryLine(terms?: readonly string[]): string {
  if (!terms || terms.length === 0) return "";
  return ` Keep these exact words unchanged, in every language, letter for letter: ${terms.join(", ")}.`;
}

/** The same shape as translateSystemPrompt, for plain paragraphs (no marks) and with a register. */
export function translateTextSystemPrompt(target: string, style: TranslateStyle, glossary?: readonly string[]): string {
  const language = describeLocale(target);
  return (
    [
      `You translate text into ${language}.`,
      "You receive a JSON list of paragraphs in the order they appear; neighbouring paragraphs are context for each other.",
      "Answer with the tool: the same number of strings, in the same order, each the translation of the paragraph at the same position.",
      styleLine(style),
      "Keep numbers, prices, currencies, dates, email and web addresses, phone numbers, and the names of businesses, places, brands and products as they are.",
      `A paragraph already in ${language} comes back unchanged.`,
      "Never merge, split, skip, explain or add paragraphs.",
    ].join(" ") + glossaryLine(glossary)
  );
}

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

export const TRANSLATE_TOOL: AiToolSpec = {
  name: "translations",
  description: "The translated pieces, one for each piece sent, in the same order.",
  inputSchema: {
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

/** The same count, for the standalone tool's register-aware prompt — one target. */
export function translateTextInputChars(pieces: readonly Piece[], target: string, style: TranslateStyle, glossary?: readonly string[]): number {
  const system = translateTextSystemPrompt(target, style, glossary).length;
  return translateBatches(pieces).reduce((sum, b) => sum + system + batchMessage(pieces, b, target).length, 0);
}

/**
 * ONE TRANSLATED PARAGRAPH, CHANGED BY WORDS (package 3): "make this
 * shorter", "more formal" — the instruction and the ONE paragraph it is
 * about, nothing else the screen is showing. api/translate/text/edit/
 * route.ts sends exactly this; scripts/tests/translate-tool.test.mjs
 * executes it.
 */
export const MAX_TRANSLATE_EDIT_INSTRUCTION_CHARS = 500;

export function translateEditSystemPrompt(target: string, style: TranslateStyle, glossary?: readonly string[]): string {
  const language = describeLocale(target);
  return (
    [
      `You are given one paragraph already translated into ${language}, and an instruction for how to change it.`,
      "Answer with the tool: the paragraph, changed exactly as asked, still in " + language + ", still meaning the same thing unless the instruction asks otherwise.",
      styleLine(style),
      "Keep numbers, prices, currencies, dates, email and web addresses, phone numbers, and the names of businesses, places, brands and products as they are.",
      "Answer with the paragraph alone — no preamble, no explanation.",
    ].join(" ") + glossaryLine(glossary)
  );
}

export const TRANSLATE_EDIT_TOOL: AiToolSpec = {
  name: "edited_paragraph",
  description: "The paragraph, changed as asked.",
  inputSchema: {
    type: "object" as const,
    properties: { text: { type: "string" } },
    required: ["text"],
  },
};

export function translateEditMessage(target: string, paragraph: string, instruction: string): string {
  return JSON.stringify({ language: describeLocale(target), paragraph, instruction });
}

export function translateEditInputChars(target: string, paragraph: string, instruction: string, style: TranslateStyle, glossary?: readonly string[]): number {
  return translateEditSystemPrompt(target, style, glossary).length + translateEditMessage(target, paragraph, instruction).length;
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
