// Client-safe i18n constants — no `next/headers` import here (unlike
// request.ts), so client components (language-selector.tsx) can pull in
// LOCALE_COOKIE without dragging a server-only module into the client
// bundle.
export const LOCALE_COOKIE = "NEXT_LOCALE";

// Only these two have a real messages/<locale>.json file. Every other
// language in the selector's list is a real, clickable option (so the
// full 10-language list the product wants is genuinely there) but falls
// back to English content until it gets translated.
// TODO: add messages/es.json, fr.json, de.json, it.json, pt.json, zh.json,
// ja.json, ar.json and add each locale below as real translations land.
export const SUPPORTED_LOCALES = ["en", "el"] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];
export const DEFAULT_LOCALE: SupportedLocale = "en";

export function resolveSupportedLocale(raw: string | undefined): SupportedLocale {
  return (SUPPORTED_LOCALES as readonly string[]).includes(raw ?? "")
    ? (raw as SupportedLocale)
    : DEFAULT_LOCALE;
}
