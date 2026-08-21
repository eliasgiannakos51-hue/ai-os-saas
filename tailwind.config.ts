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
        background: "rgb(var(--background) / <alpha-value>)",
        panel: "rgb(var(--panel) / <alpha-value>)",
        "panel-hover": "rgb(var(--panel-hover) / <alpha-value>)",
        // CHANNEL FORM, not a bare var(), and the difference was 62 dead
        // utility classes. Tailwind can only apply an alpha modifier
        // (`text-muted/70`) to a colour it can rewrite, so a bare
        // `var(--muted)` makes `text-muted/70` emit NO CSS AT ALL — the
        // element silently keeps whatever colour it inherited. Verified
        // against the deployed stylesheet: `.text-orange-400\/70` is in
        // it (that token was already in channel form) and
        // `.text-foreground\/90` is not, though 27 elements ask for it.
        // That is why secondary text looked the same weight as primary.
        // The accent tokens below have always been written this way, and
        // "no accent token is declared as a bare var() colour" is already
        // asserted at the bottom of light-theme-contrast.test.mjs — these
        // three were simply never included.
        border: "rgb(var(--border) / <alpha-value>)",
        foreground: "rgb(var(--foreground) / <alpha-value>)",
        muted: "rgb(var(--muted) / <alpha-value>)",
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
      // `text-amber-400/90`). CORRECTION TO WHAT THIS COMMENT USED TO
      // SAY: with a plain var() the modified class does not become fully
      // opaque, it does not EXIST — Tailwind emits no rule for it at all,
      // so the element keeps whatever it inherited. Verified in the
      // deployed stylesheet: `.text-orange-400\/70` is present and
      // `.text-foreground\/90` is absent though 27 elements ask for it.
      // SEMANTIC FAMILIES GET THE SAME TREATMENT AS THE ACCENT.
      //
      // When the accent moved into this system, success and danger did
      // not, and nothing flagged it because the check that went in with
      // the fix only looked at the accent. Measured across every colour
      // utility actually written in src/, against all three light
      // surfaces: text-emerald-400 (51 usages) 1.72:1, text-red-400 (81
      // usages) 2.47:1, text-red-300 (19) 1.70:1, text-emerald-300 (8)
      // 1.36:1 — all against a 4.5:1 requirement, all for exactly the
      // reason the orange failed: a colour picked to sit on #0a0a0a.
      //
      // Only the shades the codebase actually writes are listed. Adding
      // entries for shades nobody uses would be dead configuration that
      // looks like coverage.
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
        emerald: {
          200: "rgb(var(--success-text-softer) / <alpha-value>)",
          300: "rgb(var(--success-text-soft) / <alpha-value>)",
          400: "rgb(var(--success-text) / <alpha-value>)",
        },
        red: {
          100: "rgb(var(--danger-text-softest) / <alpha-value>)",
          200: "rgb(var(--danger-text-softer) / <alpha-value>)",
          300: "rgb(var(--danger-text-soft) / <alpha-value>)",
          400: "rgb(var(--danger-text) / <alpha-value>)",
        },
        // rose is used as a second danger tone in a handful of places and
        // fails identically (text-rose-200 at 1.26:1); it shares the
        // danger ink rather than earning variables of its own.
        rose: {
          200: "rgb(var(--danger-text-softer) / <alpha-value>)",
          300: "rgb(var(--danger-text-soft) / <alpha-value>)",
          400: "rgb(var(--danger-text) / <alpha-value>)",
        },
        // The per-module badge hues (lib/module-colors.ts). Same
        // treatment, eleven more families — see the --module-* block in
        // globals.css for why and for the measured ratios.
        sky: {
          300: "rgb(var(--module-sky-soft) / <alpha-value>)",
          400: "rgb(var(--module-sky) / <alpha-value>)",
        },
        indigo: {
          300: "rgb(var(--module-indigo-soft) / <alpha-value>)",
          400: "rgb(var(--module-indigo) / <alpha-value>)",
        },
        lime: {
          400: "rgb(var(--module-lime) / <alpha-value>)",
        },
        fuchsia: {
          300: "rgb(var(--module-fuchsia-soft) / <alpha-value>)",
          400: "rgb(var(--module-fuchsia) / <alpha-value>)",
        },
        cyan: {
          300: "rgb(var(--module-cyan-soft) / <alpha-value>)",
          400: "rgb(var(--module-cyan) / <alpha-value>)",
        },
        pink: {
          300: "rgb(var(--module-pink-soft) / <alpha-value>)",
          400: "rgb(var(--module-pink) / <alpha-value>)",
        },
        teal: {
          400: "rgb(var(--module-teal) / <alpha-value>)",
        },
        violet: {
          400: "rgb(var(--module-violet) / <alpha-value>)",
        },
        blue: {
          400: "rgb(var(--module-blue) / <alpha-value>)",
        },
        purple: {
          300: "rgb(var(--module-purple-soft) / <alpha-value>)",
          400: "rgb(var(--module-purple) / <alpha-value>)",
        },
        slate: {
          300: "rgb(var(--module-slate) / <alpha-value>)",
        },
      },
      borderColor: {
        orange: {
          500: "rgb(var(--accent-border) / <alpha-value>)",
          // 600 is a module badge edge (lib/module-colors.ts). It was
          // un-themed and only survived review through the "known-safe
          // fixed value" list; routing it through the token is strictly
          // better, and it is what the light-theme alpha rule already
          // resolves it to.
          600: "rgb(var(--accent-border) / <alpha-value>)",
          // The 800/900s are the notice-box edges. Solid, they measure
          // 8:1+ on white and "pass" — but a near-black rule around a
          // pale notice is not what a coloured edge is for, and the same
          // token is what makes the box identifiable once its fill stops
          // being dark. Dark keeps the literal 900.
          900: "rgb(var(--accent-border-deep) / <alpha-value>)",
        },
        amber: {
          500: "rgb(var(--accent-amber-border) / <alpha-value>)",
          600: "rgb(var(--accent-amber-border) / <alpha-value>)",
          800: "rgb(var(--accent-amber-border-deep) / <alpha-value>)",
        },
        emerald: {
          500: "rgb(var(--success-border) / <alpha-value>)",
          600: "rgb(var(--success-border) / <alpha-value>)",
          800: "rgb(var(--success-border-deep) / <alpha-value>)",
          900: "rgb(var(--success-border-deep) / <alpha-value>)",
        },
        red: {
          500: "rgb(var(--danger-border) / <alpha-value>)",
          800: "rgb(var(--danger-border-deep) / <alpha-value>)",
          900: "rgb(var(--danger-border-deep) / <alpha-value>)",
        },
        rose: { 500: "rgb(var(--danger-border) / <alpha-value>)" },
        // THE PER-MODULE BADGE EDGES (lib/module-colors.ts). textColor
        // already themes these eleven families at 300/400; borderColor
        // never did, so every module badge outline resolved to the raw
        // Tailwind palette in both themes — colours chosen to sit on
        // #0a0a0a. Measured on white at the 40% these are written with:
        // cyan-500 1.40:1, sky-500 1.46:1, blue-500 1.57:1. The light
        // values of --module-* are the 600/700 ends of each hue and
        // measure 4.62:1 to 6.78:1 solid, which is what the
        // alpha-neutralising block in globals.css then makes them use.
        sky: { 500: "rgb(var(--module-sky) / <alpha-value>)", 600: "rgb(var(--module-sky) / <alpha-value>)" },
        indigo: { 500: "rgb(var(--module-indigo) / <alpha-value>)", 600: "rgb(var(--module-indigo) / <alpha-value>)" },
        lime: { 500: "rgb(var(--module-lime) / <alpha-value>)" },
        fuchsia: { 500: "rgb(var(--module-fuchsia) / <alpha-value>)", 600: "rgb(var(--module-fuchsia) / <alpha-value>)" },
        cyan: { 500: "rgb(var(--module-cyan) / <alpha-value>)", 600: "rgb(var(--module-cyan) / <alpha-value>)" },
        pink: { 500: "rgb(var(--module-pink) / <alpha-value>)", 600: "rgb(var(--module-pink) / <alpha-value>)" },
        teal: { 500: "rgb(var(--module-teal) / <alpha-value>)" },
        violet: { 500: "rgb(var(--module-violet) / <alpha-value>)" },
        blue: { 500: "rgb(var(--module-blue) / <alpha-value>)" },
        purple: { 500: "rgb(var(--module-purple) / <alpha-value>)" },
        slate: { 500: "rgb(var(--module-slate) / <alpha-value>)" },
      },
      // NOTICE FILLS. Only the 950s — `bg-orange-500` is a filled button
      // and stays the raw palette, exactly as the accent block above
      // explains. Overriding backgroundColor wholesale would break it.
      backgroundColor: {
        orange: { 950: "rgb(var(--accent-tint) / <alpha-value>)" },
        amber: { 950: "rgb(var(--accent-amber-tint) / <alpha-value>)" },
        emerald: { 950: "rgb(var(--success-tint) / <alpha-value>)" },
        red: { 950: "rgb(var(--danger-tint) / <alpha-value>)" },
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
