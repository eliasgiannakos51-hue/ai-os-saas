import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    // src/lib holds class strings too — lib/module-colors.ts's per-module
    // palette is the whole of it. Without this glob Tailwind never saw
    // "bg-rose-500/10" or "text-rose-400" in any scanned file and purged
    // every one of them, so the Timeline's module badges and the
    // Favorites page's group headings have been rendering with no colour
    // at all: the class was on the element, the rule didn't exist.
    "./src/lib/**/*.{js,ts}",
  ],
  theme: {
    // THE PALETTE IS CLOSED (ΣΥΣΤΗΜΑ DESIGN, docs/CONTEXT.md, 2026-10-04).
    //
    // `colors` here REPLACES Tailwind's palette instead of extending it, so
    // `text-orange-400` or `bg-white` is not some other colour — it emits
    // no CSS at all. scripts/tests/design-tokens.test.mjs names any such
    // class in a component, and any hex or rgb() literal, and fails.
    //
    // Every value is a variable from src/app/globals.css, in channel form
    // so `text-muted/70` keeps working: Tailwind can only apply an alpha
    // modifier to a colour it can rewrite, and a bare var() makes the
    // modified class emit nothing.
    colors: {
      transparent: "transparent",
      current: "currentColor",
      inherit: "inherit",
      background: "rgb(var(--background) / <alpha-value>)",
      panel: "rgb(var(--panel) / <alpha-value>)",
      "panel-hover": "rgb(var(--panel-hover) / <alpha-value>)",
      // The work area and code blocks, one step darker than a panel.
      workspace: "rgb(var(--workspace) / <alpha-value>)",
      border: "rgb(var(--border) / <alpha-value>)",
      divider: "rgb(var(--divider) / <alpha-value>)",
      tag: "rgb(var(--tag) / <alpha-value>)",
      foreground: "rgb(var(--foreground) / <alpha-value>)",
      // Running text; headings use foreground.
      body: "rgb(var(--body) / <alpha-value>)",
      muted: "rgb(var(--muted) / <alpha-value>)",
      button: "rgb(var(--button) / <alpha-value>)",
      "button-ink": "rgb(var(--button-ink) / <alpha-value>)",
      success: "rgb(var(--success) / <alpha-value>)",
      warning: "rgb(var(--warning) / <alpha-value>)",
      danger: "rgb(var(--danger) / <alpha-value>)",
      // The signal colour. Allowed on the globe and the logo only, which
      // the token gate checks file by file.
      signal: "rgb(var(--signal) / <alpha-value>)",
      // A user's own content (a generated site, a document page) on the
      // white it will be published on.
      paper: "rgb(var(--paper) / <alpha-value>)",
      input: "var(--input-bg)",
    },
    extend: {
      fontFamily: {
        sans: [
          "'Commissioner'",
          "-apple-system",
          "BlinkMacSystemFont",
          "'Segoe UI'",
          "Roboto",
          "Helvetica",
          "Arial",
          "sans-serif",
        ],
        mono: [
          "'JetBrains Mono'",
          "'Fira Code'",
          "ui-monospace",
          "SFMono-Regular",
          "Menlo",
          "Consolas",
          "monospace",
        ],
      },
      borderRadius: {
        // The design's three radii: 18px the main field, 16px cards and tool
        // squares (the design allows 14-16; the final spec of 2026-10-05
        // chose 16 for the All tools squares, and cards follow), 10px
        // menu items (tags are rounded-full).
        field: "18px",
        card: "16px",
        item: "10px",
      },
      /*
       * THE TYPE SCALE, REDESIGN PHASE 4.
       *
       * WHY THIS IS A TOKEN CHANGE AND NOT A SWEEP OF THE COMPONENTS.
       * scripts/design-census.mjs counted 1,570 sized elements and 1,499
       * of them — NINETY-FIVE PER CENT — at the two smallest sizes: 913
       * `text-xs` and 586 `text-sm`. A product written almost entirely at
       * 12px and 14px has no hierarchy to improve; it has one size. Fixing
       * that by editing 1,499 class names would be 1,499 chances to get a
       * different one wrong. Redefining what the two names MEAN moves all
       * of them at once, and moves them consistently.
       *
       * IN rem, NEVER px. globals.css sets `html { font-size:
       * var(--app-font-size) }` and Settings offers small/medium/large/xl
       * (14/16/18/20px) — the whole accessibility control is that root
       * size, and a scale in px would silently switch it off. Every value
       * below is relative to a 16px root.
       *
       * WHAT MOVED, AND WHAT DID NOT. The floor comes up (12->13, 14->15)
       * so body text is readable, and the top opens up (24->26, 30->32,
       * 36->40) so a heading reads as a heading. Line height rises with
       * the small sizes — the old 12/16 is 1.33, which is tight for Greek
       * and unreadable for Arabic diacritics — and tightens on the big
       * ones, where the default is loose. Negative tracking only above
       * 24px, where it is a correction rather than a style.
       */
      fontSize: {
        xs: ["0.8125rem", { lineHeight: "1.125rem" }],
        sm: ["0.9375rem", { lineHeight: "1.375rem" }],
        base: ["1rem", { lineHeight: "1.5625rem" }],
        lg: ["1.125rem", { lineHeight: "1.625rem" }],
        xl: ["1.3125rem", { lineHeight: "1.75rem" }],
        "2xl": ["1.625rem", { lineHeight: "2rem", letterSpacing: "-0.01em" }],
        "3xl": ["2rem", { lineHeight: "2.375rem", letterSpacing: "-0.015em" }],
        "4xl": ["2.5rem", { lineHeight: "2.75rem", letterSpacing: "-0.02em" }],
        "5xl": ["3.125rem", { lineHeight: "3.25rem", letterSpacing: "-0.02em" }],
        "6xl": ["3.875rem", { lineHeight: "4rem", letterSpacing: "-0.025em" }],
      },
      keyframes: {
        "fade-in": {
          "0%": { opacity: "0", transform: "translateY(4px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "fade-in": "fade-in 200ms ease-out",
      },
    },
  },
  plugins: [],
};

export default config;
