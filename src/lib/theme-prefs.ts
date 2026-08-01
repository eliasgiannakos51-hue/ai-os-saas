// Shared source of truth for the theme preference set in Settings
// (src/components/settings/theme-settings.tsx) and read back by the
// blocking inline script in layout.tsx before first paint — same pattern
// as accessibility-prefs.ts. Lives on <html data-theme> (styled by
// globals.css) and in localStorage under the same "theme" key
// theme-toggle.tsx already uses, so the quick top-nav toggle and the
// fuller Settings picker stay in sync automatically.
export type Theme = "dark" | "light" | "midnight" | "carbon";

export const THEMES: Theme[] = ["dark", "light", "midnight", "carbon"];

export const THEME_STORAGE_KEY = "theme";

export function isTheme(value: string | null | undefined): value is Theme {
  return value === "dark" || value === "light" || value === "midnight" || value === "carbon";
}

// Small swatch preview per theme for the Settings picker — not read by
// globals.css (that reads the real CSS variables via data-theme), just a
// quick visual reference so each option is recognizable before selecting.
export const THEME_SWATCHES: Record<Theme, { background: string; accent: string }> = {
  dark: { background: "#0a0a0a", accent: "#141414" },
  light: { background: "#f7f7f8", accent: "#ffffff" },
  midnight: { background: "#05070f", accent: "#131a2c" },
  carbon: { background: "#1a1a1c", accent: "#2a2a2e" },
};
