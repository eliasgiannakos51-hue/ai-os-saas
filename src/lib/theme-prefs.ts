// Shared source of truth for the theme preference set in Settings
// (src/components/settings/theme-settings.tsx) and read back by the
// blocking inline script in layout.tsx before first paint — same pattern
// as accessibility-prefs.ts. Lives on <html data-theme> (styled by
// globals.css) and in localStorage under the same "theme" key
// theme-toggle.tsx already uses, so the quick top-nav toggle and the
// fuller Settings picker stay in sync automatically.
// TWO THEMES, dark and light — the owner's design system (docs/CONTEXT.md,
// «ΣΥΣΤΗΜΑ DESIGN»), decided 2026-10-04. "midnight" and "carbon" were
// offered until then; anyone who had picked one keeps a dark screen:
// normalizeTheme() reads them as "dark", and the inline script in
// app/layout.tsx rewrites the stored value before first paint.
export type Theme = "dark" | "light";

export const THEMES: Theme[] = ["dark", "light"];

/** Values a browser may still have stored from before 2026-10-04. */
export const RETIRED_THEMES = ["midnight", "carbon"] as const;

/** Whatever is stored, the theme to show: light only when it says light. */
export function normalizeTheme(value: string | null | undefined): Theme {
  return value === "light" ? "light" : "dark";
}

export const THEME_STORAGE_KEY = "theme";

export function isTheme(value: string | null | undefined): value is Theme {
  return value === "dark" || value === "light";
}

// Small swatch preview per theme for the Settings picker — not read by
// globals.css (that reads the real CSS variables via data-theme), just a
// quick visual reference so each option is recognizable before selecting.
export const THEME_SWATCHES: Record<Theme, { background: string; accent: string }> = {
  dark: { background: "#0a0a0a", accent: "#141414" },
  light: { background: "#f7f7f8", accent: "#ffffff" },
};
