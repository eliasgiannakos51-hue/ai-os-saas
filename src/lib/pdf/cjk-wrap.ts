/**
 * BREAKING CHINESE AND JAPANESE ONTO LINES, BECAUSE NOTHING ELSE WILL.
 *
 * THE DEFECT. @react-pdf breaks lines at spaces. Chinese and Japanese have
 * none, so a whole paragraph arrives at the line breaker as one token and is
 * drawn as ONE LINE — measured, a 106-character Chinese paragraph produced a
 * single `Tm` and ran off the right edge of the page, losing most of its
 * text. Japanese happened to survive because its kana give the breaker
 * something to work with; Han-only text does not.
 *
 * WHY THE TWO OBVIOUS FIXES DO NOT WORK, both measured rather than assumed:
 *
 *   A HYPHENATION CALLBACK that splits a CJK token into characters does make
 *   it wrap — and puts a HYPHEN at the end of every line. Chinese does not
 *   hyphenate. `Font.registerHyphenationCallback` decides WHERE a token may
 *   split, not whether a hyphen is drawn at the split.
 *
 *   A ZERO-WIDTH SPACE (U+200B) between characters also wraps, and also gets
 *   a hyphen: @react-pdf treats any break inside a token as a hyphenation
 *   point. Worse, Noto Sans SC has no glyph for U+200B at all
 *   (`hasGlyphForCodePoint` is false, `.notdef` has a FULL-WIDTH advance), so
 *   in the one font that matters it is neither zero-width nor invisible.
 *
 * SO THE BREAKS ARE PLACED HERE, as real newlines, which @react-pdf honours
 * without inserting anything. Measured on the result: the non-CJK code points
 * drawn are `(none)`.
 *
 * THE ARITHMETIC IS EXACT. Every CJK character is one em wide — verified
 * across Han, hiragana, katakana, CJK punctuation and fullwidth digits in
 * Noto Sans SC: all 1.000em. So a column fits exactly
 * `floor(columnWidth / fontSize)` of them, with no measurement needed at
 * render time.
 *
 * Pure and dependency-free, so it is unit-testable without the PDF engine.
 */

/** Han, hiragana, katakana, CJK punctuation, fullwidth forms. */
const CJK = /[　-〿぀-ゟ゠-ヿ㐀-䶿一-鿿豈-﫿＀-￯]/;

/**
 * Characters that may not START a line (kinsoku shori): closing brackets and
 * the punctuation that must stay with the sentence it ends. Breaking before
 * one of these is what makes a page look machine-set to a reader of the
 * language, so the break moves one character earlier instead.
 */
const NEVER_STARTS_A_LINE = new Set([
  "、",
  "。",
  "，",
  "．",
  "！",
  "？",
  "：",
  "；",
  "）",
  "」",
  "』",
  "】",
  "〕",
  "》",
  "〉",
  "”",
  "’",
  "ー",
  "…",
  "·",
  "・",
]);

/** Characters that may not END a line: opening brackets. */
const NEVER_ENDS_A_LINE = new Set([
  "（",
  "「",
  "『",
  "【",
  "〔",
  "《",
  "〈",
  "“",
  "‘",
]);

/**
 * Inserts newlines into runs of CJK that have nothing else to break on.
 *
 * Text that already has spaces is left alone — the engine's own breaker
 * handles it, and it handles it better, because it measures. This only steps
 * in where the breaker has nothing to work with.
 *
 * @param text        the paragraph
 * @param charsPerLine how many full-width characters fit the column
 */
export function breakCjkRuns(text: string, charsPerLine: number): string {
  if (!Number.isFinite(charsPerLine) || charsPerLine < 2) return text;
  if (!CJK.test(text)) return text;

  const out: string[] = [];
  let run = 0; // characters placed on the current line
  const chars = [...text];

  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    if (ch === "\n") {
      out.push(ch);
      run = 0;
      continue;
    }
    // A SPACE IS A BREAK THE ENGINE CAN ALREADY SEE. Once one appears, this
    // stops counting: the line is the breaker's problem from here, and
    // second-guessing it would put a hard newline in the middle of a line it
    // was going to break anyway.
    if (/\s/.test(ch)) {
      out.push(ch);
      run = 0;
      continue;
    }
    if (!CJK.test(ch)) {
      out.push(ch);
      run += 1;
      continue;
    }
    if (run >= charsPerLine) {
      // Do not start a line with punctuation that must stay with what it
      // ends; let it overhang by one instead, which is what a typesetter
      // does.
      if (NEVER_STARTS_A_LINE.has(ch)) {
        out.push(ch);
        run += 1;
        continue;
      }
      // Do not end a line with an opening bracket: move it down with its
      // contents.
      const last = out[out.length - 1];
      if (last !== undefined && NEVER_ENDS_A_LINE.has(last)) {
        out.splice(out.length - 1, 0, "\n");
      } else {
        out.push("\n");
      }
      run = 0;
    }
    out.push(ch);
    run += 1;
  }
  return out.join("");
}

/**
 * How many full-width characters fit a column.
 *
 * Floor, not round: a column that fits 21.9 characters fits 21.
 */
export function cjkCharsPerLine(columnWidth: number, fontSize: number): number {
  if (!(columnWidth > 0) || !(fontSize > 0)) return 0;
  return Math.floor(columnWidth / fontSize);
}
