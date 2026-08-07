// The five deck themes.
//
// A theme is TOKENS, not CSS. Three renderers consume it — the on-screen
// slide, the print/PDF view and the PPTX writer — and only two of those
// can run CSS at all. PowerPoint wants `RRGGBB` hex and points; the
// browser wants CSS colours and rem. Expressing a theme as a stylesheet
// would mean the PPTX export either reimplemented every theme by hand or
// shipped without them, and a deck that looks like the user's brand on
// screen and like nothing in the file they email out is the failure this
// shape exists to prevent.
//
// So: colours as bare hex here (the single source), turned into CSS
// custom properties for the browser by `themeCssVariables` and into
// DrawingML by the PPTX writer. Fonts are named twice for the same
// reason — a CSS stack for the browser, and one real font name for
// PowerPoint, which cannot fall back.
//
// All five are checked for contrast in scripts/tests/presentations.test.mjs:
// body text against its background must clear WCAG AA (4.5:1). A theme
// that looks good in a screenshot and is unreadable from the back of a
// room is not a theme anyone can use, and "Bold" and "Dark" are exactly
// where that goes wrong.

export type PresentationTheme = {
  id: string;
  /** i18n key under dashboard.presentations.themes.<id>. The English
   *  name is not stored — every other user-facing label in this app goes
   *  through next-intl, and a theme picker that says "Professional" in a
   *  Japanese UI is the systemic i18n bug this repo already fixed once. */
  nameKey: string;
  colors: {
    /** Slide background. */
    background: string;
    /** A second surface — the panel behind a quote, the image caption
     *  bar, the two-column divider. */
    surface: string;
    /** Headings. */
    heading: string;
    /** Body text and bullets. */
    body: string;
    /** Secondary text: attributions, captions, slide numbers. */
    muted: string;
    /** The one colour that carries the theme: bullet markers, rules,
     *  the section-slide band. */
    accent: string;
    /** Text drawn ON the accent. Paired deliberately, not derived — a
     *  computed "black or white" gets it wrong on mid-tone accents. */
    accentText: string;
  };
  fonts: {
    /** CSS stack for the browser. */
    headingCss: string;
    bodyCss: string;
    /** One real family name for PowerPoint, which has no stack and no
     *  fallback. Both are fonts present on a default Windows and macOS
     *  install — a PPTX naming a webfont renders in Calibri on the
     *  reviewer's machine and looks broken. */
    headingOffice: string;
    bodyOffice: string;
  };
  /** Section slides paint the accent full-bleed instead of the
   *  background. Off for Minimal, whose whole point is that it does
   *  not. */
  boldSections: boolean;
};

export const PRESENTATION_THEMES: PresentationTheme[] = [
  {
    id: "professional",
    nameKey: "professional",
    colors: {
      background: "FFFFFF",
      surface: "F1F5F9",
      heading: "0F172A",
      body: "1E293B",
      muted: "5B6B7F",
      accent: "1D4ED8",
      accentText: "FFFFFF",
    },
    fonts: {
      headingCss: '"Inter", "Segoe UI", system-ui, sans-serif',
      bodyCss: '"Inter", "Segoe UI", system-ui, sans-serif',
      headingOffice: "Calibri",
      bodyOffice: "Calibri",
    },
    boldSections: true,
  },
  {
    id: "modern",
    nameKey: "modern",
    colors: {
      background: "FBFAFF",
      surface: "EFEAFE",
      heading: "1B1035",
      body: "312357",
      muted: "6A5D8C",
      accent: "6D28D9",
      accentText: "FFFFFF",
    },
    fonts: {
      headingCss: '"Inter", "Segoe UI", system-ui, sans-serif',
      bodyCss: '"Inter", "Segoe UI", system-ui, sans-serif',
      headingOffice: "Segoe UI",
      bodyOffice: "Segoe UI",
    },
    boldSections: true,
  },
  {
    id: "minimal",
    nameKey: "minimal",
    colors: {
      background: "FFFFFF",
      surface: "F5F5F4",
      heading: "1C1917",
      body: "292524",
      muted: "6B6259",
      // Near-black accent: Minimal's rules and bullet markers are
      // structure, not decoration. A coloured accent here would make it
      // a different theme.
      accent: "1C1917",
      accentText: "FFFFFF",
    },
    fonts: {
      headingCss: 'Georgia, "Times New Roman", serif',
      bodyCss: '"Inter", "Segoe UI", system-ui, sans-serif',
      headingOffice: "Georgia",
      bodyOffice: "Calibri",
    },
    boldSections: false,
  },
  {
    id: "bold",
    nameKey: "bold",
    colors: {
      background: "FFFBF5",
      surface: "FFEDD5",
      heading: "431407",
      body: "5C2310",
      muted: "8A4A2B",
      // Deepened from the obvious orange: the bright one fails AA
      // against the cream background, and the accent is used for text on
      // section slides, not only for shapes.
      accent: "C2410C",
      accentText: "FFFFFF",
    },
    fonts: {
      headingCss: '"Inter", "Segoe UI Black", system-ui, sans-serif',
      bodyCss: '"Inter", "Segoe UI", system-ui, sans-serif',
      headingOffice: "Arial Black",
      bodyOffice: "Arial",
    },
    boldSections: true,
  },
  {
    id: "dark",
    nameKey: "dark",
    colors: {
      background: "0B1120",
      surface: "16213A",
      heading: "F8FAFC",
      body: "DCE3ED",
      // Lightened well past the usual slate-400: this is the one theme
      // where "muted" is light-on-dark, and the conventional value is
      // under 4.5:1 on this background.
      muted: "9FB0C6",
      accent: "38BDF8",
      // Dark text on the light-blue accent. White on this accent is
      // 1.9:1 — unreadable, and it is the section-slide title.
      accentText: "07172B",
    },
    fonts: {
      headingCss: '"Inter", "Segoe UI", system-ui, sans-serif',
      bodyCss: '"Inter", "Segoe UI", system-ui, sans-serif',
      headingOffice: "Calibri",
      bodyOffice: "Calibri",
    },
    boldSections: true,
  },
];

export const DEFAULT_THEME_ID = "professional";

export function getTheme(id: string | null | undefined): PresentationTheme {
  return (
    PRESENTATION_THEMES.find((t) => t.id === id) ??
    PRESENTATION_THEMES.find((t) => t.id === DEFAULT_THEME_ID)!
  );
}

export function isThemeId(value: unknown): boolean {
  return typeof value === "string" && PRESENTATION_THEMES.some((t) => t.id === value);
}

/**
 * The theme as CSS custom properties, for the on-screen and print
 * renderers.
 *
 * Returned as a style object rather than injected as a <style> tag:
 * a deck renders inside our dashboard, and a stylesheet scoped by
 * nothing but a class name is one collision away from restyling the app
 * around it.
 */
export function themeCssVariables(theme: PresentationTheme): Record<string, string> {
  return {
    "--slide-bg": `#${theme.colors.background}`,
    "--slide-surface": `#${theme.colors.surface}`,
    "--slide-heading": `#${theme.colors.heading}`,
    "--slide-body": `#${theme.colors.body}`,
    "--slide-muted": `#${theme.colors.muted}`,
    "--slide-accent": `#${theme.colors.accent}`,
    "--slide-accent-text": `#${theme.colors.accentText}`,
    "--slide-font-heading": theme.fonts.headingCss,
    "--slide-font-body": theme.fonts.bodyCss,
  };
}

// ---------------------------------------------------------------------
// Contrast.
// ---------------------------------------------------------------------
//
// Exported so the build gate can assert it rather than trusting the hex
// values above to have been chosen carefully. They were — but "chosen
// carefully once" is not a property that survives someone tweaking a
// colour later, which is exactly when a theme quietly stops being
// readable.

function channelLuminance(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

export function relativeLuminance(hex: string): number {
  const value = hex.replace("#", "");
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return (
    0.2126 * channelLuminance(r) + 0.7152 * channelLuminance(g) + 0.0722 * channelLuminance(b)
  );
}

/** WCAG 2.1 contrast ratio between two hex colours. */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const lighter = Math.max(la, lb);
  const darker = Math.min(la, lb);
  return (lighter + 0.05) / (darker + 0.05);
}
