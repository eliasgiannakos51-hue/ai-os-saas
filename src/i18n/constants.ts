// Client-safe i18n constants — no `next/headers` import here (unlike
// request.ts), so client components (language-selector.tsx) can pull in
// LOCALE_COOKIE without dragging a server-only module into the client
// bundle.
export const LOCALE_COOKIE = "NEXT_LOCALE";

// Every locale with a real messages/<locale>.json file — kept in sync
// with lib/languages.ts's LANGUAGES list (the selector only ever shows
// locales that are actually translated; see that file's comment for why).
//
// "ar" ships text-only Arabic translations with no RTL layout support yet
// (no dir="rtl", no logical-property/mirrored-layout pass) — the Arabic
// text itself still renders right-to-left per Unicode's bidi algorithm,
// but surrounding UI (nav, icons, alignment) stays LTR. Known limitation,
// tracked rather than silently shipped: full RTL layout is a follow-up.
export const SUPPORTED_LOCALES = [
  "en",
  "el",
  "es",
  "fr",
  "de",
  "it",
  "pt",
  "zh",
  "ja",
  "ar",
] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];
export const DEFAULT_LOCALE: SupportedLocale = "en";

export function resolveSupportedLocale(raw: string | undefined): SupportedLocale {
  return (SUPPORTED_LOCALES as readonly string[]).includes(raw ?? "")
    ? (raw as SupportedLocale)
    : DEFAULT_LOCALE;
}
