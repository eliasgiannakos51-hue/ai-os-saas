// Shared source of truth for the accessibility preferences set in
// Settings (src/components/settings/accessibility-settings.tsx) and read
// back by the blocking inline script in layout.tsx before first paint —
// keeping the storage keys/values here means both places import the same
// constants instead of duplicating string literals that could drift.
//
// Each preference lives on <html> as a data-* attribute (same pattern as
// data-theme in theme-toggle.tsx) so globals.css can style off it with no
// JS re-render required, and in localStorage so it survives reloads.
export type FontSize = "small" | "medium" | "large" | "xl";

export const FONT_SIZES: FontSize[] = ["small", "medium", "large", "xl"];

export const FONT_SIZE_STORAGE_KEY = "a11y-font-size";
export const HIGH_CONTRAST_STORAGE_KEY = "a11y-high-contrast";
export const REDUCE_MOTION_STORAGE_KEY = "a11y-reduce-motion";

export function isFontSize(value: string | null | undefined): value is FontSize {
  return value === "small" || value === "medium" || value === "large" || value === "xl";
}
