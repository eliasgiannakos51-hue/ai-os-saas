/**
 * What language should the ANSWER be in?
 *
 * THE BUG, stated exactly.
 *
 * Every AI feature that thought about language at all took it from
 * `useLocale()` — the UI locale, the language of the chrome around the
 * text. So a Greek user whose interface is in English typed a Greek topic
 * into Deep Research and got an English report. The model was not
 * disobeying: it was told `language = "en"` and it wrote English,
 * obediently and correctly.
 *
 * Language follows the TEXT, not the chrome. Somebody who writes to you in
 * Greek wants to be answered in Greek, whatever menu language they happen
 * to be running.
 *
 * The second half of the same defect: what was interpolated into the prompt
 * was the CODE. `Write in the user's language (el)` asks a model to infer a
 * language from an ISO tag, which it mostly can, and "mostly" is not a
 * property worth relying on when the fix is to write "Greek". Codes that
 * are near-homographs of other words ("it" for Italian, "no" for
 * Norwegian) are the obvious hazard, and "el" is not obvious at all.
 *
 * WHY A DETERMINISTIC DETECTOR AND NOT A MODEL CALL.
 * This has to run before the expensive call, on every request, to decide
 * one field of a prompt. A classification call would add latency and real
 * money to every research run, every file question and every insight
 * narration — and could itself fail, at which point we are back to
 * guessing. The ten languages this app actually ships are separable
 * without one: four of them are written in scripts nothing else here uses,
 * and the remaining six are Latin-script Europeans that stopwords and
 * diacritics tell apart reliably at the length of a real question.
 *
 * It returns null rather than guessing when the text is too short or too
 * ambiguous — and null is what makes the UI locale a legitimate FALLBACK
 * rather than the wrong answer it was being used as. "Hi" has no detectable
 * language, and pretending otherwise would trade one confident mistake for
 * another.
 *
 * Pure and dependency-free: no server-only, no network, no model. Callable
 * from a route, a worker or a test.
 */

import { DEFAULT_LOCALE, SUPPORTED_LOCALES, type SupportedLocale } from "@/i18n/constants";

/**
 * The ENGLISH name of each language, because that is what goes into a
 * system prompt. "Greek" is unambiguous to a model in a way "el" is not.
 *
 * Deliberately not the endonym — lib/languages.ts already holds those
 * ("Ελληνικά") for the language selector, where a human is choosing and
 * should see their own language written the way they write it. A prompt has
 * the opposite requirement.
 */
export const LANGUAGE_NAMES: Record<SupportedLocale, string> = {
  en: "English",
  el: "Greek",
  es: "Spanish",
  fr: "French",
  de: "German",
  it: "Italian",
  pt: "Portuguese",
  zh: "Chinese",
  ja: "Japanese",
  ar: "Arabic",
};

export function languageName(code: string): string {
  return LANGUAGE_NAMES[(SUPPORTED_LOCALES as readonly string[]).includes(code) ? (code as SupportedLocale) : DEFAULT_LOCALE];
}

// Scripts that identify a language on sight. Each of these belongs to
// exactly one of the ten locales, so a single character is evidence and a
// handful is proof.
const SCRIPTS: { locale: SupportedLocale; pattern: RegExp }[] = [
  // Kana FIRST. Japanese also uses Han characters, so testing Han first
  // would classify every Japanese sentence as Chinese; kana is the thing
  // only Japanese has.
  { locale: "ja", pattern: /[぀-ゟ゠-ヿ]/g },
  { locale: "zh", pattern: /[一-鿿㐀-䶿]/g },
  { locale: "el", pattern: /[Ͱ-Ͽἀ-῿]/g },
  { locale: "ar", pattern: /[؀-ۿݐ-ݿ]/g },
];

/**
 * Function words, which are what actually separate the six Latin-script
 * languages. Content words are shared and borrowed constantly ("startup",
 * "marketing", "email" appear in all six); function words are not.
 *
 * Short, high-frequency, and chosen for being distinctive rather than for
 * being the most common — "de" is the commonest word in three of these and
 * therefore evidence for none of them, so it is absent.
 */
const STOPWORDS: Record<Exclude<SupportedLocale, "el" | "zh" | "ja" | "ar">, string[]> = {
  en: ["the", "and", "with", "for", "what", "how", "this", "that", "from", "are", "which", "about", "should", "would", "there", "their", "these", "have", "been", "will"],
  es: ["los", "las", "que", "una", "para", "con", "por", "del", "como", "pero", "esta", "este", "sus", "más", "también", "cuando", "porque", "sobre", "hacia", "desde"],
  fr: ["les", "des", "une", "pour", "avec", "dans", "qui", "que", "sur", "cette", "sont", "leur", "aux", "plus", "aussi", "comme", "mais", "nous", "vous", "être"],
  de: ["der", "die", "das", "und", "ist", "ein", "eine", "für", "mit", "von", "den", "dem", "nicht", "auch", "sich", "auf", "wie", "sind", "werden", "oder"],
  it: ["gli", "che", "una", "per", "con", "sono", "del", "della", "come", "anche", "questo", "questa", "nel", "alla", "dei", "più", "loro", "essere", "quando", "perché"],
  pt: ["que", "uma", "para", "com", "não", "como", "das", "dos", "mais", "também", "seu", "sua", "pelo", "pela", "quando", "porque", "sobre", "está", "são", "muito"],
};

/**
 * Characters that only some of the six use. Weighted higher than a stopword
 * because a single "ß" or "ñ" is far stronger evidence than one "the".
 */
const DIACRITICS: { locale: SupportedLocale; pattern: RegExp }[] = [
  { locale: "de", pattern: /[äöüßÄÖÜ]/g },
  { locale: "es", pattern: /[ñ¿¡Ñ]/g },
  { locale: "pt", pattern: /[ãõÃÕ]/g },
  { locale: "fr", pattern: /[œêôûîëïùÿŒÊÔÛÎ]/g },
  { locale: "it", pattern: /[àèìòùÀÈÌÒÙ]/g },
];

/** Minimum letters before a verdict is worth having. "Hi" is not English
 *  evidence; it is two characters that happen to be Latin. */
const MIN_LETTERS = 12;

function countMatches(text: string, pattern: RegExp): number {
  return (text.match(pattern) ?? []).length;
}

/**
 * The language `text` is written in, or null when there is not enough to
 * tell.
 *
 * Null is a real answer and the caller is expected to handle it — see
 * resolveContentLanguage, where it is exactly the case the UI locale is
 * legitimately for.
 */
export function detectLanguage(text: string): SupportedLocale | null {
  if (!text) return null;
  // URLs and code blocks are full of English function words that say
  // nothing about the language the person is writing in.
  const cleaned = text
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]*`/g, " ")
    .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, " ");

  const letters = countMatches(cleaned, /\p{L}/gu);
  if (letters < MIN_LETTERS) return null;

  // --- Latin six: stopwords, plus diacritics at higher weight. Scored
  //     BEFORE the script check, because the script check needs to know how
  //     strong the Latin evidence is before it overrides it.
  const words = cleaned.toLowerCase().match(/\p{L}+/gu) ?? [];
  const wordSet = words;
  const scores = new Map<SupportedLocale, number>();
  for (const [locale, list] of Object.entries(STOPWORDS)) {
    const hits = wordSet.filter((w) => list.includes(w)).length;
    scores.set(locale as SupportedLocale, hits * 2);
  }
  for (const { locale, pattern } of DIACRITICS) {
    const hits = countMatches(cleaned, pattern);
    if (hits > 0) scores.set(locale, (scores.get(locale) ?? 0) + hits * 3);
  }

  const ranked = [...scores.entries()].sort((a, b) => b[1] - a[1]);
  const [best, bestScore] = ranked[0];
  const secondScore = ranked[1]?.[1] ?? 0;

  // --- Non-Latin scripts, weighed against that Latin evidence.
  //
  // These four scripts appear in no other supported language, so a MAJORITY
  // of them is decisive on its own. A MINORITY is not, and treating it as
  // decisive was a real defect: "how the Ελληνικά Ταχυδρομεία network
  // compares with the private couriers" is an English sentence containing a
  // Greek proper noun, and it was being detected as Greek — which would have
  // answered an English speaker in a language they may not read, on the
  // strength of the company they asked about.
  //
  // So a minority script only wins when the Latin evidence is weak. That
  // keeps "Θέλω ένα SaaS landing page με modern design" Greek — its Latin
  // words are borrowed nouns, which score nothing, because STOPWORDS are
  // function words and borrowings never are.
  for (const { locale, pattern } of SCRIPTS) {
    const hits = countMatches(cleaned, pattern);
    if (hits < 4) continue;
    const share = hits / letters;
    if (share >= 0.5) return locale;
    if (share >= 0.2 && bestScore < 6) return locale;
  }
  // Two guards, both of which produce null rather than a guess:
  //   a floor, so a sentence of proper nouns is not "detected", and
  //   a margin, so es/pt on a sentence they genuinely share stays undecided
  //   and the UI locale — which at least reflects a choice the user made —
  //   gets to answer instead.
  if (bestScore < 4) return null;
  if (bestScore < secondScore * 1.5) return null;
  return best;
}

export type ContentLanguage = {
  /** BCP-47-ish code, for storage and for anything that needs to compare. */
  code: SupportedLocale;
  /** The English NAME, which is what belongs in a system prompt. */
  name: string;
  /** How it was decided — recorded so a wrong answer is diagnosable. */
  source: "detected" | "ui-locale";
};

/**
 * The language a generated answer should be written in.
 *
 * The text wins. The UI locale is the fallback, used only when the text is
 * too short or too ambiguous to tell — which is the correct role for it and
 * the opposite of how it was being used.
 */
export function resolveContentLanguage(text: string, uiLocale: string | undefined): ContentLanguage {
  const detected = detectLanguage(text ?? "");
  if (detected) return { code: detected, name: LANGUAGE_NAMES[detected], source: "detected" };
  const fallback = (SUPPORTED_LOCALES as readonly string[]).includes(uiLocale ?? "")
    ? (uiLocale as SupportedLocale)
    : DEFAULT_LOCALE;
  return { code: fallback, name: LANGUAGE_NAMES[fallback], source: "ui-locale" };
}

/**
 * Rebuilds a resolved language from a stored code.
 *
 * A long-running job (Deep Research runs in chunks across several
 * invocations) resolves the language once, at the start, from the topic the
 * user typed — and then has to survive being reloaded from a database row
 * that holds only a code. Re-detecting on resume would be wrong twice over:
 * the topic is no longer the only text in play, and a resumed chunk could
 * silently disagree with the chunk before it and produce a report written
 * half in one language.
 *
 * `source` is "ui-locale" because that is honest: on resume this value came
 * from storage, not from a fresh reading of the user's words.
 */
export function contentLanguageFromCode(code: string | null | undefined): ContentLanguage {
  const resolved = (SUPPORTED_LOCALES as readonly string[]).includes(code ?? "")
    ? (code as SupportedLocale)
    : DEFAULT_LOCALE;
  return { code: resolved, name: LANGUAGE_NAMES[resolved], source: "ui-locale" };
}

/**
 * The instruction every AI feature appends, in one place.
 *
 * WHY THE QUALITY CLAUSES ARE HERE RATHER THAN "write good Greek".
 * A generic instruction to write well is one a model already believes it is
 * following. Naming the specific machinery a language actually gets wrong —
 * agreement, case, accent — is what changes the output, and it differs per
 * language, so it is selected per language rather than listed as a wall of
 * advice about languages this answer is not in.
 */
const QUALITY_NOTES: Partial<Record<SupportedLocale, string>> = {
  el: "Πρόσεξε ιδιαίτερα: γένος, πτώση, συμφωνία επιθέτου-ουσιαστικού, και τον τονισμό (κάθε πολυσύλλαβη λέξη παίρνει τόνο). Μην αφήσεις αμετάφραστους αγγλικούς όρους όπου υπάρχει καθιερωμένος ελληνικός.",
  de: "Achte besonders auf: Kasus (Nominativ/Akkusativ/Dativ/Genitiv), Artikel- und Adjektivdeklination, Groß- und Kleinschreibung der Substantive, und die Verbstellung im Nebensatz.",
  fr: "Fais particulièrement attention à : l'accord en genre et en nombre (adjectifs et participes passés), les accents, et l'élision.",
  es: "Presta especial atención a: la concordancia de género y número, los acentos, y el uso de ser frente a estar.",
  it: "Presta particolare attenzione a: la concordanza di genere e numero, gli accenti, e l'uso delle preposizioni articolate.",
  pt: "Presta especial atenção a: a concordância de género e número, os acentos, e a diferença entre ser e estar.",
  ar: "انتبه بشكل خاص إلى: التذكير والتأنيث، والإعراب، والمطابقة بين الصفة والموصوف.",
};

/**
 * One line for a system prompt, naming the language and what to get right.
 *
 * `subject` names what is being written ("the report", "the questions") so
 * the instruction is about the whole answer rather than an unqualified
 * "write in X" that a model can satisfy with one paragraph.
 */
export function languageInstruction(language: ContentLanguage, subject = "your entire answer"): string {
  const quality =
    QUALITY_NOTES[language.code] ??
    "Use correct spelling, grammar and syntax throughout.";
  return [
    `LANGUAGE: write ${subject} in ${language.name}, and ONLY in ${language.name}.`,
    `This includes every heading, every list item, every label, every question and every caption — not just the body text. Do not leave a title or a section heading in English because it looked like a technical term.`,
    `Write it as a fluent native speaker would: correct spelling, grammar and syntax. ${quality}`,
    `Proper nouns stay as they are — people, companies, products and place names are not translated. Quoted source titles keep their original language, with a short ${language.name} gloss if the meaning is not obvious.`,
  ].join("\n");
}
