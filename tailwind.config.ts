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
    extend: {
      colors: {
        // Theme-aware — resolve to CSS custom properties (globals.css)
        // instead of fixed hex, so the dark/light toggle only has to swap
        // variable values, not every component's color classes. `input`
        // is the shared "recessed surface" used by every input/textarea/
        // select/code block/kbd badge (previously hardcoded bg-black/NN).
        background: "var(--background)",
        panel: "var(--panel)",
        "panel-hover": "var(--panel-hover)",
        border: "var(--border)",
        foreground: "var(--foreground)",
        muted: "var(--muted)",
        input: "var(--input-bg)",
      },
      // ACCENT COLOURS, SPLIT BY ROLE — the light theme's actual fix.
      //
      // Tailwind resolves `text-orange-400`, `bg-orange-400` and
      // `border-orange-400` from ONE palette entry, which is why the
      // light theme could not be fixed by editing a palette: the three
      // roles need different answers. `bg-orange-500` is a filled button
      // with black text and measures 7.49:1 — correct as it is. The same
      // colour as TEXT on white is 2.80:1 and as a BORDER 2.62:1 over the
      // page background — both failing.
      //
      // Overriding `textColor` and `borderColor` separately (a first-class
      // Tailwind feature) lets each role carry its own theme-aware value
      // while every class name in the app stays exactly as written. No
      // component changed; ~700 usages were corrected by these two blocks.
      //
      // `rgb(var(--x) / <alpha-value>)` and not `var(--x)`: 246 of those
      // usages carry an opacity modifier (`border-orange-500/40`,
      // `text-amber-400/90`). With a plain var() Tailwind emits no alpha
      // channel and every one of them silently becomes fully opaque.
      textColor: {
        orange: {
          200: "rgb(var(--accent-text-softer) / <alpha-value>)",
          300: "rgb(var(--accent-text-soft) / <alpha-value>)",
          400: "rgb(var(--accent-text) / <alpha-value>)",
          500: "rgb(var(--accent-text-strong) / <alpha-value>)",
        },
        amber: {
          200: "rgb(var(--accent-amber-text-softer) / <alpha-value>)",
          300: "rgb(var(--accent-amber-text-soft) / <alpha-value>)",
          400: "rgb(var(--accent-amber-text) / <alpha-value>)",
        },
      },
      borderColor: {
        // Only the 500s. The 600/800/900 accent borders already measure
        // 3.19:1 or better on white and are left alone — a theme
        // override that changes nothing is a lie in the source.
        orange: { 500: "rgb(var(--accent-border) / <alpha-value>)" },
        amber: { 500: "rgb(var(--accent-amber-border) / <alpha-value>)" },
      },
      fontFamily: {
        sans: [
          "'Inter'",
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
        card: "14px",
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
