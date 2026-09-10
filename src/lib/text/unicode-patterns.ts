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

/**
 * "Does this text contain a CJK character at all."
 *
 * ONE COPY, AND IT WAS THREE. lib/ai/deep-dive.ts, lib/text/
 * resolve-language.ts and lib/text/script-length.ts each declared this
 * exact regex as a module-private `const CJK`. Three identical
 * constants is the duplicated-constant shape on its own, and it had a
 * second cost that is worth writing down because it is not obvious:
 *
 *   scripts/tests/load-ts.mjs bundles a module and its local imports by
 *   CONCATENATION. Two of those three files in one test therefore
 *   produced "SyntaxError: Identifier 'CJK' has already been declared",
 *   and a gate that wanted to measure both — the research cost test,
 *   which needs deep-dive's row limit and script-length's ratios — could
 *   not be written at all. The loader already documents two other
 *   artefacts of concatenation (import hoisting, re-export dedup); this
 *   is a third, and the honest fix is one declaration rather than a
 *   third workaround in the bundler.
 *
 * INCLUDES KANA ON PURPOSE. The question these three callers ask is
 * "does the per-character arithmetic I am about to do hold here", and it
 * does not for Japanese any more than for Chinese: both are dense scripts
 * where a character carries far more than a Latin letter. Distinguishing
 * Japanese FROM Chinese is a different question and resolve-language.ts
 * answers it separately, with the kana as the tell.
 */
export const CJK_PATTERN = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u;

// ---------------------------------------------------------------------
// GREEKLISH
// ---------------------------------------------------------------------
//
// "thelo na ftiakso" is Greek. Until now this app saw noise: not Greek to
// foldForMatch, not English to the classifier, matching no canned answer.
// A Greek user on a phone with an English keyboard - which is most of
// them, some of the time - fell through every match here.
//
// THE AMBIGUITY ONLY BITES IF YOU MUST PRODUCE ONE ANSWER. `x` is both
// chi and xi; `h` is both eta and chi; `u` is both theta (it is the theta
// key on a Greek layout) and upsilon. Transliterating greeklish INTO
// Greek forces a choice and gets it wrong half the time. So nothing here
// transliterates.
//
// Both sides are reduced to a SKELETON instead - one token per Greek
// phoneme - and the Greek side is deterministic while only the Latin side
// branches. All of thelo, 8elw, thelw and the Greek word itself reduce to
// `8elo`. A Latin word with an ambiguous letter yields a small SET of
// skeletons and matches if any of them is the Greek one. Ambiguity
// becomes many-to-one, which is the direction that costs nothing.
//
// AND NOTHING IS EVER REWRITTEN. "email" does not become a Greek word,
// because no function here returns Greek. They return skeletons, for
// comparing. The only risk left is a false MATCH, and that is measured
// against this app's own vocabulary in scripts/tests/greeklish.test.mjs
// rather than argued about - an English word that happens to reduce to a
// Greek word's skeleton is a collision, and the count of them is a
// number.

/** One token per Greek phoneme. Chosen so no two phonemes share one. */
const GREEK_DIGRAPHS: ReadonlyArray<readonly [string, string]> = [
  ["ου", "u"],
  ["ει", "i"],
  ["οι", "i"],
  ["υι", "i"],
  ["αι", "e"],
  // alpha-upsilon and epsilon-upsilon are a consonant in disguise: they
  // are pronounced av/af and ev/ef. Greeklish writes au/av/af and
  // eu/ev/ef for them, so both sides are normalised to the voiced
  // spelling and the three Latin forms collapse onto it below.
  ["αυ", "av"],
  ["ευ", "ev"],
];

const GREEK_LETTERS: Readonly<Record<string, string>> = {
  "α": "a", "β": "v", "γ": "g", "δ": "d",
  "ε": "e", "ζ": "z", "η": "i", "θ": "8",
  "ι": "i", "κ": "k", "λ": "l", "μ": "m",
  "ν": "n", "ξ": "3", "ο": "o", "π": "p",
  "ρ": "r", "σ": "s", "τ": "t", "υ": "i",
  "φ": "f", "χ": "x", "ψ": "y", "ω": "o",
};

/** The Latin sequences that mean one Greek phoneme, longest first. */
const LATIN_DIGRAPHS: ReadonlyArray<readonly [string, readonly string[]]> = [
  ["ou", ["u"]],
  ["ei", ["i"]],
  ["oi", ["i"]],
  ["ai", ["e"]],
  ["au", ["av"]],
  ["av", ["av"]],
  // BOTH READINGS, AND THE SECOND ONE WAS MISSING. "af" is αυ before a
  // voiceless consonant ("afto" -> αυτό), and it is ALSO a plain alpha
  // followed by a phi — "diafanies" is δια-φάνειες, "grafeio" is γραφείο,
  // "kafe" is καφές. With only the αυ reading, every Greek word with a
  // phi after an alpha became unreachable from an English keyboard:
  // greeklishSkeletons("diafanies") returned "diavanies" alone while
  // greekSkeleton("διαφάνειες") is "diafanies", so the two could never
  // meet. Found on 2026-09-10 by scripts/tests/producer-routes.test.mjs,
  // which measured 28 of 30 phrases and named both misses; six surfaces
  // share this table, so the same hole was in all of them.
  ["af", ["av", "af"]],
  ["eu", ["ev"]],
  ["ev", ["ev"]],
  // The same, for epsilon: "efxaristo" is ευχαριστώ and "efimerida" is
  // εφημερίδα, and one rule cannot serve both without branching.
  ["ef", ["ev", "ef"]],
  ["th", ["8"]],
  ["ch", ["x"]],
  ["ps", ["y"]],
  ["ks", ["3"]],
];

/** A single Latin letter, and every Greek phoneme it can mean. */
const LATIN_LETTERS: Readonly<Record<string, readonly string[]>> = {
  a: ["a"], b: ["v"], c: ["k"], d: ["d"], e: ["e"], f: ["f"], g: ["g"],
  // eta or chi. Both are real: "hmera" is a day, "hara" is joy.
  h: ["i", "x"],
  i: ["i"], j: ["3"], k: ["k"], l: ["l"], m: ["m"], n: ["n"], o: ["o"],
  p: ["p"], q: ["k"], r: ["r"], s: ["s"], t: ["t"],
  // theta on a Greek keyboard, or the vowel upsilon.
  u: ["8", "i"],
  v: ["v"],
  // omega on a Greek keyboard.
  w: ["o"],
  // chi or xi. "xara" is joy, "xero" is I know.
  x: ["x", "3"],
  y: ["i"], z: ["z"],
  // The digits people type for the letters they resemble.
  "8": ["8"], "9": ["8"], "3": ["3"], "0": ["o"],
};

/** Beyond this many branches a word is not being read, it is being
 *  guessed at. Sixteen covers four ambiguous letters in one word, which
 *  no real word reaches. */
const MAX_GREEKLISH_BRANCHES = 16;

/**
 * The skeleton of a GREEK string. Deterministic: one input, one output.
 */
export function greekSkeleton(input: string): string {
  // THE MARKER IS NOT A SPACE, and it was for one draft. Digraphs are
  // replaced by an already-Latin token, which then has to be protected
  // from the single-letter pass — so the first version wrapped it in
  // spaces and dropped every space afterwards. That destroyed the real
  // word boundaries too: "ακύρωση συνδρομής" came out as one word, and
  // the phrase triggers it exists to match could never be found. U+0000
  // cannot occur in a fold, so it can mark without meaning anything.
  const MARK = "\u0000";
  let s = foldForMatch(String(input ?? ""));
  for (const [from, to] of GREEK_DIGRAPHS) s = s.split(from).join(`${MARK}${to}${MARK}`);
  let out = "";
  let literal = false;
  for (const ch of s) {
    if (ch === MARK) {
      literal = !literal;
      continue;
    }
    out += literal ? ch : GREEK_LETTERS[ch] ?? ch;
  }
  return out;
}

/**
 * Every skeleton a LATIN string could mean, at most
 * MAX_GREEKLISH_BRANCHES of them.
 */
export function greeklishSkeletons(input: string): string[] {
  const s = foldForMatch(String(input ?? ""));
  let branches: string[] = [""];
  let i = 0;
  while (i < s.length) {
    const two = s.slice(i, i + 2);
    const digraph = LATIN_DIGRAPHS.find(([from]) => from === two);
    const options = digraph ? digraph[1] : LATIN_LETTERS[s[i]] ?? [s[i]];
    i += digraph ? 2 : 1;
    if (branches.length * options.length > MAX_GREEKLISH_BRANCHES) {
      // Too many readings: keep the first of each from here on. The word
      // is still matched, just not in every spelling at once.
      branches = branches.map((b) => b + options[0]);
      continue;
    }
    const next: string[] = [];
    for (const b of branches) for (const o of options) next.push(b + o);
    branches = next;
  }
  return [...new Set(branches)];
}

/** Does this text contain a Greek letter at all? */
export const GREEK_LETTER_PATTERN = /\p{Script=Greek}/u;

/**
 * Is `latin` a greeklish spelling of `greek`?
 *
 * TWO GUARDS, AND BOTH ARE ABOUT FALSE MATCHES RATHER THAN MISSES:
 *
 * A string that already contains Greek letters is not greeklish - it is
 * Greek, and foldForMatch already handles it.
 *
 * And a floor of three characters, because two-letter skeletons collide
 * with almost everything. The count of collisions above that floor is
 * measured in the gate rather than assumed to be zero.
 */
export function isGreeklishOf(latin: string, greek: string): boolean {
  const l = String(latin ?? "");
  const g = String(greek ?? "");
  if (GREEK_LETTER_PATTERN.test(l)) return false;
  if (!GREEK_LETTER_PATTERN.test(g)) return false;
  // THE FLOOR IS ON THE SKELETON, AND ONLY THERE. A first draft also
  // checked the two inputs' lengths, and its own mutation proved that
  // guard inert: nothing two characters long can produce a skeleton of
  // three, so the check below already refused everything it did. A guard
  // that protects nothing is worse than none — it reads like a defence
  // and the next person keeps it.
  const target = greekSkeleton(g);
  if (target.length < 3) return false;
  return greeklishSkeletons(l).includes(target);
}

/**
 * Does `text` contain a greeklish spelling of any of `greekTerms`?
 *
 * THE SEAM, AND IT HAD TO BE MADE RATHER THAN FOUND. The six places that
 * needed greeklish did not share one: four decide a match with
 * `.includes()` on folded text (search-match, knowledge-base,
 * module-relevance, trading/rules) and two test hand-written regex
 * alternations (website-negative-instructions, and trading/rules again).
 * There was no single function to teach, which is exactly how a feature
 * ends up wired at the one place somebody needed it.
 *
 * So this is the one implementation, and every one of the six calls it.
 * scripts/tests/greeklish.test.mjs names all six and goes red for any
 * that stops.
 *
 * IT DOES NOTHING WHEN THE TEXT IS ALREADY GREEK. A user who typed Greek
 * is served by foldForMatch, and running this as well would only add
 * chances to be wrong.
 */
export function textHasGreeklishTerm(text: string, greekTerms: readonly string[]): boolean {
  const t = String(text ?? "");
  if (!t || GREEK_LETTER_PATTERN.test(t)) return false;
  // A TERM CAN BE A PHRASE, and the first version of this could not see
  // one. The canned-answer triggers include "ακύρωση συνδρομής"; a
  // token-by-token comparison can never equal a two-word skeleton, so
  // "akyrwsh sindromhs" matched nothing while the single-word trigger
  // beside it matched. A phrase is satisfied when EVERY one of its words
  // is found among the text's tokens — order is not required, because a
  // user typing on the wrong keyboard is not also being asked to get the
  // word order of a trigger right.
  const targets: string[][] = [];
  for (const term of greekTerms) {
    if (!GREEK_LETTER_PATTERN.test(term)) continue;
    const parts = greekSkeleton(term)
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length >= 3);
    if (parts.length > 0) targets.push(parts);
  }
  if (targets.length === 0) return false;

  const seen = new Set<string>();
  for (const token of foldForMatch(t).split(/[^a-z0-9]+/)) {
    if (token.length < 3) continue;
    for (const candidate of greeklishSkeletons(token)) seen.add(candidate);
  }
  if (seen.size === 0) return false;
  return targets.some((parts) => parts.every((part) => seen.has(part)));
}


/**
 * Like textHasGreeklishTerm, but the terms are STEMS.
 *
 * FEATURE_SPECS writes its Greek as stems on purpose — the booking
 * pattern is a stem plus any letters, because Greek inflects the noun
 * five ways. Comparing a stem to a whole token by equality therefore
 * finds nothing: the stem for "booking" reduces to `kratis` and a user
 * types `kratisi`. The allowance is MAX_INFLECTION, this repository's own
 * answer to how much a Greek ending can add, so a stem cannot swallow a
 * much longer unrelated word.
 */
export function textHasGreeklishStem(text: string, greekStems: readonly string[]): boolean {
  const t = String(text ?? "");
  if (!t || GREEK_LETTER_PATTERN.test(t)) return false;
  const stems: string[] = [];
  for (const term of greekStems) {
    if (!GREEK_LETTER_PATTERN.test(term)) continue;
    const skeleton = greekSkeleton(term).replace(/[^a-z0-9]/g, "");
    if (skeleton.length >= 3) stems.push(skeleton);
  }
  if (stems.length === 0) return false;
  for (const token of foldForMatch(t).split(/[^a-z0-9]+/)) {
    if (token.length < 3) continue;
    for (const candidate of greeklishSkeletons(token)) {
      for (const stem of stems) {
        if (candidate.startsWith(stem) && candidate.length <= stem.length + MAX_INFLECTION) return true;
      }
    }
  }
  return false;
}
