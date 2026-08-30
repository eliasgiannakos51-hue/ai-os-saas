// Unicode-safe text matching primitives.
//
// WHY THIS FILE EXISTS. JavaScript's `\b`, `\w` and `\d` are ASCII-only,
// and this is not a rounding error — it inverts the meaning of a pattern
// on any non-Latin script:
//
//     /\bσύστημα/.test("σύστημα: ...")   // false  <- the real attack
//     /\bσύστημα/.test("aσύστημα: ...")  // true   <- nonsense
//
// `\b` is a boundary between a `\w` character and a non-`\w` one. Greek
// letters are not `\w`, so `\bσ` demands that an ASCII word character sit
// immediately before the σ. A pattern written that way does not merely
// under-match — it matches exactly the strings it was meant to ignore, and
// it does so silently: no error, no warning, a green test suite.
//
// Everything here is built on `\p{L}` / `\p{N}` with the `u` flag instead,
// so a boundary means "not a letter or a digit" in every script.
//
// Client-safe on purpose (no `server-only`): the same rules have to hold in
// the browser and on the server, and a check that exists in only one of
// those places is a check that can be walked around.

/** The character class a "word character" actually means, in any script. */
export const LETTER = "\\p{L}";
export const LETTER_OR_DIGIT = "[\\p{L}\\p{N}]";
export const NOT_LETTER_OR_DIGIT = "[^\\p{L}\\p{N}]";

/**
 * End-of-word boundary. A lookahead, which is supported everywhere — the
 * symmetrical lookbehind `(?<!...)` is ES2018 and only reached Safari in
 * 16.4, and a regex literal with unsupported syntax throws at *construction*
 * time, which would take down the whole page rather than degrade one check.
 * The start-of-word boundary is handled by a leading capture group instead;
 * see `boundedPattern`.
 */
export const WORD_END = `(?!${LETTER_OR_DIGIT})`;

/**
 * How many letters of inflection a stem is allowed to absorb.
 *
 * Greek, German and Russian all inflect the words these patterns care
 * about — "οδηγίες / οδηγιών / οδηγία", "Anweisungen / Anweisung" — so
 * matching a fixed surface form catches one case out of several. Six covers
 * the real endings; the word-end boundary stops it running into the next
 * word regardless.
 */
export const MAX_INFLECTION = 6;

const REGEX_SPECIALS = /[.*+?^${}()|[\]\\]/g;
function escapeLiteral(s: string): string {
  return s.replace(REGEX_SPECIALS, "\\$&");
}

/**
 * Exact word forms: `word("συστημα", "system")` matches either, but only as
 * a whole word.
 *
 * Returns regex *source*, not a RegExp, so fragments compose into a phrase.
 */
export function word(...forms: string[]): string {
  return `(?:${forms.map(escapeLiteral).join("|")})${WORD_END}`;
}

/**
 * Word stems plus their inflected endings:
 * `stem("οδηγι")` matches οδηγία, οδηγίες, οδηγιών — but not οδηγός, and
 * not a longer unrelated word, because of the word-end boundary.
 */
export function stem(...stems: string[]): string {
  return `(?:${stems.map(escapeLiteral).join("|")})${LETTER}{0,${MAX_INFLECTION}}${WORD_END}`;
}

/**
 * Up to `max` intervening words — the determiners, quantifiers and
 * particles that sit between the verb and its object in a real sentence
 * ("αγνόησε **όλες τις** προηγούμενες οδηγίες").
 */
export function gap(max: number): string {
  return `(?:\\s+${LETTER}{1,14}){0,${max}}\\s+`;
}

/**
 * Compiles fragments into a pattern anchored at a word boundary on BOTH
 * sides.
 *
 * The leading boundary is a capture group rather than a lookbehind (see
 * WORD_END). Group 1 is therefore always present and always holds the
 * single separator character before the match, or "" at the start of the
 * string — callers subtract its length to get the true match offset. Every
 * pattern produced here has exactly one capture group, so that contract is
 * uniform.
 */
export function boundedPattern(...fragments: string[]): RegExp {
  return new RegExp(`(^|${NOT_LETTER_OR_DIGIT})(?:${fragments.join("")})`, "gu");
}

/**
 * A pattern that starts with punctuation or a symbol (`</system>`,
 * `[INST]`), where the symbol IS the boundary and demanding another one in
 * front of it would break the match.
 *
 * Wrapped with an empty capture group so it obeys the same "group 1 is the
 * leading separator" contract as boundedPattern.
 */
export function symbolPattern(source: string): RegExp {
  return new RegExp(`()(?:${source})`, "gu");
}

/**
 * Case- and accent-insensitive normalisation for MATCHING ONLY.
 *
 * INDEX STABILITY IS THE CONTRACT: the returned string has exactly the same
 * length, in UTF-16 code units, as the input, and character i of the output
 * corresponds to character i of the input. That is what lets a caller match
 * against the folded text and then splice the ORIGINAL — which is what
 * sanitisers must do, since the user's real text is what gets stored and
 * shown.
 *
 * The naive `s.normalize("NFD").replace(/\p{Diacritic}/gu, "")` does not
 * have that property: it lengthens the string before shortening it, and
 * every offset past the first accent points somewhere else. So the fold is
 * done per code point, and any transformation that would change a
 * character's length is discarded rather than applied — e.g. U+0130 'İ',
 * whose lowercase is two code points.
 *
 * Three things are folded:
 *   - case, so ΑΓΝΟΗΣΕ and αγνόησε are the same pattern;
 *   - diacritics, so "αγνοησε" typed without accents still matches, along
 *     with German umlauts and French accents;
 *   - Greek final sigma, which is a positional variant: the same word ends
 *     in ς but contains σ, and lower('Σ') is always σ — so "ΚΑΦΕΣ" folds to
 *     "καφεσ" while "καφές" folds to "καφες" unless ς is mapped to σ.
 */
export function foldForMatch(input: string): string {
  const src = String(input ?? "");
  let out = "";
  for (const ch of src) {
    let folded = ch.toLowerCase();
    if (folded === "ς") folded = "σ";
    // WHAT SURVIVES A STRIP, AND WHY — checked across every script in
    // scripts/tests/host-and-word-boundaries.test.mjs, not reasoned about
    // here. Korean jamo, Thai tone marks, Hebrew niqqud, Devanagari
    // matras and Arabic harakat are all safe, and not by design: they are
    // SEPARATE code points, so stripping them changes the length and the
    // `stripped.length === ch.length` guard below rejects it. Kana was
    // the exception because プ has a precomposed single-codepoint form.
    //
    // VIETNAMESE IS A KNOWN, DELIBERATE COLLISION. má and mà fold
    // together, and its tones are phonemic exactly as kana voicing is.
    // It is not fixable by inspecting the mark: the acute on á is the
    // same code point in "café", where stripping it is the whole point.
    // Distinguishing them needs the language, which this function does
    // not have. French, Spanish and Portuguese are shipped locales and
    // Vietnamese is not, so the trade is made in their favour — recorded
    // here and asserted in the gate so it stays a decision rather than
    // becoming a discovery.
    //
    // KANA VOICING MARKS ARE NOT ACCENTS. U+3099 and U+309A turn ハ into
    // バ and パ — different consonants, different words. Unicode calls
    // them Diacritic, so a blanket \p{Diacritic} strip folded バグ (bug)
    // and ハグ (hug) to the same string, and ゴール (goal) and コール
    // (call) likewise. Every Japanese match in the app ran on that: the
    // deep dive, the injection filter, module narrowing, cross-module
    // context. Greek accents and Latin diacritics still go, because there
    // stripping them is the point.
    const stripped = folded
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, (mark) => (mark === "\u3099" || mark === "\u309A" ? mark : ""))
      .normalize("NFC");
    if (stripped.length === ch.length) folded = stripped;
    out += folded.length === ch.length ? folded : ch;
  }
  return out;
}

/** True when `text` is already in folded form — used by the build gate to
 *  catch a pattern literal written with accents or capitals, which could
 *  never match the folded text it is run against. */
export function isFolded(text: string): boolean {
  return foldForMatch(text) === text;
}
