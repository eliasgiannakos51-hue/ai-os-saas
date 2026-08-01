// Client-safe i18n constants — no `next/headers` import here (unlike
// request.ts), so client components (language-selector.tsx) can pull in
// LOCALE_COOKIE without dragging a server-only module into the client
// bundle.
export const LOCALE_COOKIE = "NEXT_LOCALE";

// Every locale with a real messages/<locale>.json file — kept in sync
// with lib/languages.ts's LANGUAGES list (the selector only ever shows
// locales that are actually translated; see that file's comment for why).
export const SUPPORTED_LOCALES = ["en", "el"] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];
export const DEFAULT_LOCALE: SupportedLocale = "en";

export function resolveSupportedLocale(raw: string | undefined): SupportedLocale {
  return (SUPPORTED_LOCALES as readonly string[]).includes(raw ?? "")
    ? (raw as SupportedLocale)
    : DEFAULT_LOCALE;
}
