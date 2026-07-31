// Every language shown in the selector — the full list the product wants,
// regardless of translation status. Only "en"/"el" have real messages
// (see i18n/request.ts's SUPPORTED_LOCALES); the rest are real, clickable
// entries that currently render English content until translated.
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
