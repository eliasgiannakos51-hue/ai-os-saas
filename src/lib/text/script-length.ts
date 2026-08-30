/**
 * A CHARACTER COUNT IS A CLAIM ABOUT A LANGUAGE.
 *
 * V4.6. Found because DEEP_DIVE_MIN_QUESTION_CHARS = 15 scored Chinese
 * 0 of 5 on questions that had ALREADY placed the correct module: the
 * feature worked and an unrelated length check threw the answer away.
 * "总收入是多少？" is seven characters and a complete question.
 *
 * THE RATIOS BELOW ARE MEASURED, not assumed. Source: this app's own
 * message catalogue — 681 English prose strings of 40 characters or more
 * with no ICU placeholders, against their translations, median ratio of
 * character counts (scripts/tests/script-length.test.mjs re-measures it
 * and fails if the catalogue drifts away from these figures):
 *
 *     en 1.00   el 1.10   es 1.06   fr 1.13   de 1.14   it 1.07
 *     pt 1.05   zh 0.33   ja 0.49   ar 0.80
 *
 * TWO DIFFERENT FAULTS, and they need different fixes.
 *
 * A MINIMUM calibrated on English REJECTS valid Chinese and Japanese,
 * which say the same thing in a third to a half of the characters. That
 * is a script property, and the script is visible in the text, so it can
 * be detected — which is what this file does.
 *
 * A MAXIMUM calibrated on English DISCARDS valid German and French,
 * which take about 14% more. That is NOT a script property — German is
 * Latin script and indistinguishable from English by inspection — so
 * there is nothing to detect and the only honest fix is a limit generous
 * enough for the longest language. LATIN_HEADROOM is that figure.
 *
 * React-free and dependency-free so the gate can load it.
 */

/** Median characters per English character, measured (see above). */
export const MEASURED_LENGTH_RATIO: Record<string, number> = {
  en: 1.0,
  el: 1.1,
  es: 1.06,
  fr: 1.13,
  de: 1.14,
  it: 1.07,
  pt: 1.05,
  zh: 0.33,
  ja: 0.49,
  ar: 0.8,
};

/**
 * The ratio for the densest script this app ships. Used as the floor
 * multiplier, so a minimum admits the shortest valid text in any
 * language rather than only in the one it was written for.
 */
export const DENSEST_RATIO = MEASURED_LENGTH_RATIO.zh;

/**
 * The ratio for the longest-winded language this app ships. Used as the
 * ceiling multiplier: a maximum written for English has to hold German
 * too, and German cannot be detected from the characters.
 */
export const LATIN_HEADROOM = MEASURED_LENGTH_RATIO.de;

const CJK = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u;

/** Is this text written in a script that says more per character? */
export function isDenseScript(text: string): boolean {
  return CJK.test(text);
}

/**
 * The minimum length to apply to THIS text, given a minimum chosen for
 * English.
 *
 * Never below two: a floor exists to reject an empty or truncated
 * string, and one character is that in every script.
 */
export function minCharsFor(text: string, latinMinimum: number): number {
  if (!isDenseScript(text)) return latinMinimum;
  return Math.max(2, Math.ceil(latinMinimum * DENSEST_RATIO));
}

/**
 * A maximum chosen for English, widened to hold the longest language.
 *
 * Applied unconditionally rather than per-language, because the language
 * that needs the room is written in the same script as the one that does
 * not. Rounding up: a ceiling that is a few characters too generous
 * costs nothing, and one that is a few too tight silently drops content.
 */
export function maxCharsFor(latinMaximum: number): number {
  return Math.ceil(latinMaximum * LATIN_HEADROOM);
}
