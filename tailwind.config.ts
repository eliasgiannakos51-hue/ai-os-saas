import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
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
