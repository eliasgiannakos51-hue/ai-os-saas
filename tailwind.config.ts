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
      fontFamily: {
        sans: [
          "'Inter'",
          // The metric-matched stand-in — see globals.css's @font-face for
          // the measured numbers and the layout shift it removes. It has to
          // be in BOTH stacks: `body` sets one, and any element carrying
          // Tailwind's `font-sans` overrides it with this one.
          "'Inter Fallback'",
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
