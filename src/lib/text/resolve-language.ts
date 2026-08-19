/**
 * WHICH LANGUAGE THE AI SHOULD ANSWER IN.
 *
 * The bug this fixes: every AI surface sent `language: locale` — the
 * language of the INTERFACE. A Greek speaker whose UI is in English (a
 * common combination: the app remembers a language you picked once, or
 * you are on a borrowed laptop) typed a Greek research topic and got an
 * English report back. The user told us the language, in the only way
 * that matters — by writing in it — and we asked the settings instead.
 *
 * WHAT THIS CAN AND CANNOT DECIDE, stated plainly rather than pretended
 * away. Of the ten supported locales, four are written in a script no
 * other supported locale uses:
 *
 *   Greek letters        → el
 *   Arabic letters       → ar
 *   Kana (ひらがな/カタカナ) → ja
 *   Han with no kana     → zh
 *
 * Those four are decided with certainty from the text, because a script
 * is not a guess. The other six — en, es, fr, de, it, pt — ALL use the
 * Latin alphabet, and telling them apart from a short topic like
 * "marketing 2026" or "Barcelona" is not something a stopword list does
 * reliably. A wrong confident guess there ("es" for a French topic) is
 * worse than the interface language, which the user did at least choose.
 *
 * So: Latin script falls back to the UI locale, deliberately and
 * documented. This function fixes the case it can actually fix and does
 * not pretend to fix the one it cannot. If Latin-language detection is
 * ever wanted, it needs a real model, not a heuristic added here.
 *
 * HOW JAPANESE IS TOLD FROM CHINESE. They share the Han characters, so
 * they are treated as one script for the "is this text non-Latin at all"
 * question, then separated by kana: Japanese mixes kana with kanji,
 * Chinese uses none. See the CJK constant below for why a share contest
 * between the two gets this backwards.
 */

import { SUPPORTED_LOCALES } from "@/i18n/constants";

/**
 * How much of the text has to be in a non-Latin script before it decides
 * the answer.
 *
 * Not 50%. Latin fragments inside non-Latin text are ordinary — brand
 * names, tickers, model numbers, URLs ("Έρευνα για Nvidia RTX 6090" is
 * half Latin characters and unambiguously Greek). The reverse almost
 * never happens: an English topic does not casually contain Greek words.
 * So the bar for "this text is in a non-Latin script" is deliberately
 * low, and the asymmetry is the point.
 */
const NON_LATIN_SHARE_THRESHOLD = 0.2;

// Unicode property escapes rather than hand-written ranges: \p{Script=Greek}
// is the actual definition of the Greek alphabet, including the accented
// and final forms that a hand-rolled [Α-ω] misses. The `u` flag
// is required for them to mean anything at all.
const GREEK = /\p{Script=Greek}/u;
const ARABIC = /\p{Script=Arabic}/u;
const KANA = /[\p{Script=Hiragana}\p{Script=Katakana}]/u;
/** Any letter at all, in any script — the denominator for the share. */
const ANY_LETTER = /\p{L}/u;

type ScriptRule = { pattern: RegExp; locale: string };

/**
 * Japanese and Chinese share the Han characters, so they are ONE entry in
 * the share contest and are separated afterwards by kana presence.
 *
 * Counting kana and Han as two competitors was the first version of this
 * and it was wrong: 日本の太陽光発電市場 is nine Han characters and a
 * single kana (の), so "whichever script has more characters" called
 * ordinary Japanese Chinese. Real Japanese prose is frequently mostly
 * kanji — the share of kana says nothing about whether the text is
 * Japanese. Its PRESENCE says everything, because Chinese does not use
 * kana at all. So the group competes on share, and the tell decides
 * which member of the group it is.
 */
const CJK = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u;

/**
 * Greek and Arabic are mutually exclusive with everything else, so their
 * order is arbitrary; CJK is one entry for the reason above.
 */
const SCRIPT_RULES: ScriptRule[] = [
  { pattern: GREEK, locale: "el" },
  { pattern: ARABIC, locale: "ar" },
  { pattern: CJK, locale: "cjk" },
];

/**
 * The language an AI reply should be written in.
 *
 * @param text      what the user actually typed — the research topic, the
 *                  question, the request. May be empty.
 * @param uiLocale  the interface language, used when the text cannot
 *                  decide (Latin script, or no letters at all).
 * @returns a locale code from SUPPORTED_LOCALES.
 *
 * Never throws and never returns something unsupported: an unrecognised
 * uiLocale falls through to "en" rather than being passed to a prompt as
 * "write in the user's language (xx-YY)", which is how a model ends up
 * inventing which language that is.
 */
export function resolveLanguage(text: string, uiLocale: string): string {
  const fallback = (SUPPORTED_LOCALES as readonly string[]).includes(uiLocale) ? uiLocale : "en";

  if (typeof text !== "string" || text.length === 0) return fallback;

  // Counted per character rather than matched once, because "is there a
  // Greek letter in here" is true of an English sentence containing a
  // single "μ" — a share is what separates a language from a symbol.
  let letters = 0;
  const counts = new Map<string, number>();

  for (const char of text) {
    if (!ANY_LETTER.test(char)) continue;
    letters++;
    for (const rule of SCRIPT_RULES) {
      if (rule.pattern.test(char)) {
        counts.set(rule.locale, (counts.get(rule.locale) ?? 0) + 1);
        break; // one script per character
      }
    }
  }

  if (letters === 0) return fallback;

  // The most-present non-Latin script, if any clears the bar. Iterating
  // SCRIPT_RULES rather than the Map keeps the tie-break deterministic
  // (a text with equal Greek and Arabic resolves to Greek every time,
  // rather than to whichever was inserted first).
  let best: { locale: string; count: number } | null = null;
  for (const rule of SCRIPT_RULES) {
    const count = counts.get(rule.locale) ?? 0;
    if (count > 0 && (best === null || count > best.count)) {
      best = { locale: rule.locale, count };
    }
  }

  if (best !== null && best.count / letters >= NON_LATIN_SHARE_THRESHOLD) {
    // The group cleared the bar; now say which member. Kana anywhere in
    // the text means Japanese — Chinese never uses it — regardless of how
    // small a fraction of the characters it is.
    if (best.locale === "cjk") return KANA.test(text) ? "ja" : "zh";
    return best.locale;
  }

  // Latin script, or a non-Latin trace too small to mean anything: the
  // interface language is the best answer available. See the header for
  // why no stopword heuristic is attempted for en/es/fr/de/it/pt.
  return fallback;
}
