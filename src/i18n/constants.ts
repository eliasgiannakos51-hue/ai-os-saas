// Client-safe i18n constants — no `next/headers` import here (unlike
// request.ts), so client components (language-selector.tsx) can pull in
// LOCALE_COOKIE without dragging a server-only module into the client
// bundle.
export const LOCALE_COOKIE = "NEXT_LOCALE";

// A year. The language somebody picked is not a session-scoped fact.
//
// Lives here rather than beside the writer in lib/locale-preference.ts
// because middleware.ts also writes this cookie, and that file is a
// "use client" module importing the Supabase browser client — pulling it
// into the edge bundle for one integer.
export const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

// Every locale with a real messages/<locale>.json file — all ten of them,
// COUNT: 10 /\.json$/ in messages/
// kept in sync with lib/languages.ts's LANGUAGES list (the selector only
// ever shows locales that are actually translated; see that file's
// comment for why).
//
// "ar" is laid out right-to-left. app/layout.tsx sets dir="rtl" on <html>
// from this locale via lib/text-direction.ts, the app's own half of the
// catalogue lib/website-builder.ts already hands to every model it calls.
//
// THIS COMMENT USED TO SAY THE OPPOSITE — "no dir=\"rtl\", no
// logical-property/mirrored-layout pass ... full RTL layout is a
// follow-up" — and it was true and honest for as long as it stood. It is
// also exactly the kind of sentence that outlives the fact it describes,
// so scripts/tests/rtl.test.mjs reads this comment and app/layout.tsx
// together and goes red if they disagree in EITHER direction: a comment
// claiming RTL support the layout does not set, or a layout setting a dir
// this comment still denies.
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
