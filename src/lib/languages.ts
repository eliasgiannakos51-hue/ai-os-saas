// Every language shown in the selector. Deliberately only ones that have
// a real messages/<locale>.json (see i18n/constants.ts's
// SUPPORTED_LOCALES) — a longer list used to previously include languages
// that silently fell back to English when selected (only marked with a
// small "soon" badge), which read as broken/non-functional options.
// Add an entry here only once its translation file actually exists.
//
// "ar" (Arabic) is fully translated but text-only LTR for now — see the
// SUPPORTED_LOCALES comment in i18n/constants.ts for the known
// RTL-layout limitation.
export type LanguageOption = { code: string; label: string };

export const LANGUAGES: LanguageOption[] = [
  { code: "en", label: "English" },
  { code: "el", label: "Ελληνικά" },
  { code: "es", label: "Español" },
  { code: "fr", label: "Français" },
  { code: "de", label: "Deutsch" },
  { code: "it", label: "Italiano" },
  { code: "pt", label: "Português" },
  { code: "zh", label: "中文" },
  { code: "ja", label: "日本語" },
  { code: "ar", label: "العربية" },
];
