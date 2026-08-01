// Every language shown in the selector. Deliberately only the two that
// have a real messages/<locale>.json (see i18n/constants.ts's
// SUPPORTED_LOCALES) — a longer list used to include 8 more languages
// that silently fell back to English when selected (only marked with a
// small "soon" badge), which read as broken/non-functional options.
// Add an entry here only once its translation file actually exists.
export type LanguageOption = { code: string; label: string };

export const LANGUAGES: LanguageOption[] = [
  { code: "en", label: "English" },
  { code: "el", label: "Ελληνικά" },
];
