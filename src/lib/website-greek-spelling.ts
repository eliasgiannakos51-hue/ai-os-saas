import { foldForMatch, MAX_INFLECTION } from "@/lib/text/unicode-patterns";

/**
 * THE MODEL MISSPELLS GREEK, AND NOTHING WAS LOOKING.
 *
 * Reported on 2026-09-05 from a real generated site: "ρεμπα" where the
 * word is "ρεύμα". The prompt says nothing about spelling — checked, not
 * assumed — and none of the three post-generation enforcements
 * (lib/website-negative-instructions.ts, the page cap,
 * lib/website-map-embeds.ts) reads the words at all.
 *
 * WHY THIS IS A CHECK AND NOT A PROMPT LINE. Rule 23 of this project's
 * own working rules: if the model can ignore an instruction, it will.
 * "Spell correctly" is the least enforceable sentence one could add to a
 * prompt, and it would be indistinguishable from doing nothing.
 *
 * WHY IT REPORTS AND NEVER REWRITES. A word this flags might be a brand,
 * a village, a surname, a deliberate misspelling in a slogan, or simply
 * right in a way a model disagrees with. Silently "correcting" a business
 * name in somebody's own website is a worse defect than the typo. So the
 * output is a note beside the preview — the third one, next to "5 things
 * still to fill in" and "1 number you never gave" — and the owner
 * decides.
 *
 * WHAT IT COSTS. One classification call with at most SPELLING_WORD_CAP
 * words and a 300-token ceiling: about 200 tokens on a normal site. It
 * runs only when the page actually contains Greek.
 */

/** Greek letters, including the accented and final forms. */
const GREEK_LETTER = /[ΆΈ-ΊΌΎ-ΡΣ-ώ]/;
const GREEK_WORD = /[ΆΈ-ΊΌΎ-ΡΣ-ώ]{4,}/g;

/** At most this many distinct words go to the model, so a long site cannot
 *  turn one cheap check into an expensive one. */
export const SPELLING_WORD_CAP = 60;

/** Visible words only: script, style and every tag are removed first, the
 *  same way lib/website-invented-numbers.ts reads a page. */
function visibleTextOf(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&[a-z]+;/gi, " ")
    .replace(/\s+/g, " ");
}

/**
 * The Greek words on the page that are worth asking about.
 *
 * WORDS THE OWNER WROTE ARE NEVER ASKED ABOUT. Anything that appears in
 * the brief is the owner's own spelling of their own business, their own
 * village, their own surname — flagging it would be the product telling
 * somebody their name is wrong. The brief is folded the same way the word
 * is, so an accent or a final sigma does not sneak one past.
 *
 * ALL-CAPS IS SKIPPED for the same reason: a logo wordmark or a heading
 * set in capitals is a design choice, and capitals lose the accents that
 * make Greek spelling checkable in the first place.
 */
/**
 * THE OWNER'S OWN NAMES, IN EVERY CASE GREEK PUTS THEM IN.
 *
 * greekWordsToCheck excludes a page word when its FOLD matches a word in
 * the brief. That is exact-form matching, and Greek does not write the
 * same noun the same way twice: the brief says "Ζαχαροπλαστείο στο
 * Χαλάνδρι", the page it produces says "στην καρδιά του Χαλανδρίου", and
 * the second form is not the first.
 *
 * MEASURED, ON THE FIRST REAL SITE THIS CODE EVER SAW. 2026-09-06, a site
 * generated from exactly that brief: "Χαλανδρίου" went into the list of
 * words the model is asked to judge. Six of six constructed cases leaked
 * the same way — Χαλανδρίου, Παπαδόπουλος, Θεσσαλονίκης, Ναυπλίου,
 * Ιωαννίνων, Παπαδόπουλου.
 *
 * That is this file's FIRST stated promise — "IT NEVER ASKS ABOUT THE
 * OWNER'S OWN WORDS. A village, a surname, a business name written in the
 * brief is the owner's spelling of their own thing" — and it was true
 * only for the one form the owner happened to type. The prompt does tell
 * the model that a place or person's name is not a misspelling, but that
 * is a request; this is the enforcement, and docs/shapes.md already
 * carries "an instruction requested rather than enforced" as its own
 * failure shape.
 *
 * ONLY PROPER NOUNS, AND ONLY NOT-SENTENCE-INITIAL ONES. A capital at the
 * start of a sentence is a sentence, not a name — "Ζαχαροπλαστείο" in the
 * brief above is a common noun, and stemming it would stop the checker
 * asking about every word beginning "ζαχαροπλαστ", including a real typo
 * in one. The word after the first in each sentence is where the village
 * and the surname actually sit.
 *
 * THE STEM LENGTH IS max(5, 60% of the word). Shorter would catch
 * unrelated words ("χαλα" also begins χαλαρός, χάλασε); longer would miss
 * the genitive plural. MAX_INFLECTION is this repository's own answer to
 * "how much can a Greek ending add", used by stem() in
 * lib/text/unicode-patterns.ts, and it is the ceiling here too.
 */
const OWN_STEM_MIN = 5;
export function ownNameStems(brief: string): string[] {
  const stems: string[] = [];
  for (const sentence of brief.split(/[.!?;·\n]+/)) {
    const words = sentence.match(GREEK_WORD) ?? [];
    for (const w of words.slice(1)) {
      if (w[0] !== w[0].toUpperCase() || w === w.toUpperCase()) continue;
      const folded = foldForMatch(w);
      const len = Math.max(OWN_STEM_MIN, Math.ceil(folded.length * 0.6));
      if (folded.length < OWN_STEM_MIN) continue;
      stems.push(folded.slice(0, len));
    }
  }
  return stems;
}

/** Is this page word an inflection of one of the owner's own names? */
export function isOwnName(word: string, stems: string[]): boolean {
  const folded = foldForMatch(word);
  return stems.some((s) => folded.startsWith(s) && folded.length <= s.length + MAX_INFLECTION);
}

/**
 * EVERY Greek word on the page, with nothing filtered out.
 *
 * This is the DENOMINATOR, and it exists so that a person can be told WHY
 * a word was not asked about instead of simply not seeing it.
 * greekWordsToCheck drops words for five different reasons — all-caps, a
 * word the owner typed, an inflection of an owner's name, a duplicate
 * fold, the cap — and a list that shows only what survived cannot
 * distinguish "your village was protected" from "your village was never
 * on the page".
 *
 * scripts/check-site-spelling.mjs subtracts one list from the other to
 * print that split. It is exported rather than re-derived there because
 * the regex for "a Greek word" is a RULE: a second copy in a script would
 * agree with this one today and quietly disagree after the first edit,
 * which is the shape docs/shapes.md calls a copy that passes forever.
 */
export function greekWordsOnPage(html: string): string[] {
  const text = visibleTextOf(html);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of text.match(GREEK_WORD) ?? []) {
    if (seen.has(raw)) continue;
    seen.add(raw);
    out.push(raw);
  }
  return out;
}

/** The words in the brief, folded — the owner's own spelling of their own
 *  things, in the exact form they typed. Shared with the audit script for
 *  the same reason greekWordsOnPage is. */
export function briefWordFolds(brief: string): Set<string> {
  return new Set((brief.match(GREEK_WORD) ?? []).map(foldForMatch));
}

export function greekWordsToCheck(html: string, brief: string): string[] {
  const text = visibleTextOf(html);
  if (!GREEK_LETTER.test(text)) return [];
  // THE SHARED FOLD, AND IT WAS A PRIVATE ONE FOR ONE DRAFT.
  //
  // The first version of this function wrote `s.toLowerCase().replace(/ς/g,
  // "σ")` — the same private-fold mistake lib/support/knowledge-base.ts had
  // made, fixed two rounds earlier, and repeated here by the same hand. It
  // does not strip accents, so a brief saying "Καλαμπάκα" did not protect a
  // page saying "Καλαμπακα": the product would have asked the owner whether
  // their own town was a typo. foldForMatch folds case, final sigma AND
  // accents, and is what every other matching surface in this codebase
  // already uses.
  const fold = foldForMatch;
  const fromBrief = briefWordFolds(brief);
  const ownStems = ownNameStems(brief);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of text.match(GREEK_WORD) ?? []) {
    if (raw === raw.toUpperCase()) continue;
    const key = fold(raw);
    if (fromBrief.has(key) || seen.has(key) || isOwnName(raw, ownStems)) continue;
    seen.add(key);
    out.push(raw);
    if (out.length >= SPELLING_WORD_CAP) break;
  }
  return out;
}

/**
 * THE ANSWER IS FILTERED TO THE QUESTION.
 *
 * The model is asked which of N given words are misspelled and answers
 * with a JSON array. Anything it returns that was not in the list is
 * dropped — a "correction" it invented, a word from its own head, a
 * sentence instead of a word. The product never shows the owner a word
 * that was not on their own page.
 */
export function keepOnlyAsked(answer: unknown, asked: string[]): string[] {
  // FOLDED, NOT LOWER-CASED. The first draft matched with toLowerCase(),
  // and scripts/tests/accent-search.test.mjs failed the build on it —
  // correctly: a model asked about "ρεμπα" may answer "Ρεμπα", and Greek
  // comparison that ignores accents and final sigma is the whole reason
  // lib/text/unicode-patterns.ts exists. Third place in this session where
  // the shared fold was the answer and a private comparison was written
  // first.
  const allowed = new Map(asked.map((w) => [foldForMatch(w), w]));
  const raw = Array.isArray(answer) ? answer : [];
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item !== "string") continue;
    const hit = allowed.get(foldForMatch(item.trim()));
    if (hit && !out.includes(hit)) out.push(hit);
  }
  return out;
}

/** Parses the model's reply into an array without throwing on prose. */
export function parseWordList(text: string): unknown {
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start < 0 || end <= start) return [];
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return [];
  }
}
