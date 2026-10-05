// ONE THEME, DARK — the owner's design system (docs/CONTEXT.md, ΣΥΣΤΗΜΑ
// DESIGN — ΤΟ ΤΕΛΙΚΟ, 2026-10-04): "ένα θέμα μόνο, σκούρο· καμία επιλογή
// θέματος ή χρώματος". There is no picker any more. The blocking script in
// app/layout.tsx sets <html data-theme="dark"> before first paint and
// clears whatever an older version stored under THEME_STORAGE_KEY, so
// anyone who had chosen light, midnight or carbon sees the dark theme from
// the first load.
export type Theme = "dark";

export const THEMES: Theme[] = ["dark"];

/** Values a browser may still have stored from before 2026-10-04. */
export const RETIRED_THEMES = ["light", "midnight", "carbon"] as const;

/** Whatever is stored, the theme to show. */
export function normalizeTheme(_value: string | null | undefined): Theme {
  return "dark";
}

export const THEME_STORAGE_KEY = "theme";
