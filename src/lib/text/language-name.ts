/**
 * The English name of each interface language, for a prompt that says
 * "write this in Greek". One table, because two generators
 * (lib/presentations/prompt.ts, lib/posts/prompt.ts) need it and
 * scripts/tests/load-ts.mjs concatenates every module a gate loads into
 * one scope: the day posts/prompt.ts imported this from the deck's
 * prompt, the deck's contract and the posts' contract both declared
 * MAX_DESCRIPTION_CHARS there and scripts/tests/posts.test.mjs could not
 * load at all. Pure — no SDK, nothing server-only.
 */
const LANGUAGE_NAMES: Record<string, string> = {
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

export function languageNameFor(locale: string): string {
  return LANGUAGE_NAMES[locale] ?? LANGUAGE_NAMES.en;
}
