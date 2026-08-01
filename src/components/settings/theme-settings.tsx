"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Check, Palette } from "lucide-react";
import { THEMES, THEME_STORAGE_KEY, THEME_SWATCHES, type Theme } from "@/lib/theme-prefs";

// Same no-context/provider approach as accessibility-settings.tsx and
// theme-toggle.tsx: <html data-theme> + localStorage are the only source
// of truth, written directly to the DOM. Selecting a theme here also
// updates the same "theme" localStorage key theme-toggle.tsx reads, so
// the two stay in sync — picking "midnight" here and later hitting the
// quick top-nav toggle won't fight over two different stored values.
export function ThemeSettings() {
  const t = useTranslations("settings.theme");
  const [theme, setThemeState] = useState<Theme>("dark");

  useEffect(() => {
    const current = document.documentElement.getAttribute("data-theme");
    setThemeState(current === "light" || current === "midnight" || current === "carbon" ? current : "dark");
  }, []);

  function selectTheme(next: Theme) {
    setThemeState(next);
    document.documentElement.setAttribute("data-theme", next);
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Private browsing / storage disabled — theme still applies for this
      // page load via the DOM attribute, just doesn't persist.
    }
  }

  return (
    <div id="theme" className="mb-6 scroll-mt-20 space-y-3 rounded-2xl border border-border bg-panel p-5">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <Palette className="h-4 w-4 text-orange-400" /> {t("title")}
      </h2>
      <p className="text-xs text-muted">{t("description")}</p>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {THEMES.map((option) => {
          const swatch = THEME_SWATCHES[option];
          const selected = theme === option;
          return (
            <button
              key={option}
              type="button"
              onClick={() => selectTheme(option)}
              aria-pressed={selected}
              className={`flex min-h-[44px] items-center gap-2 rounded-xl border px-3 py-2.5 text-left transition-all duration-150 active:scale-[0.98] sm:min-h-0 ${
                selected
                  ? "border-orange-500 bg-orange-500/[0.06]"
                  : "border-border hover:border-orange-500/40"
              }`}
            >
              <span
                className="relative flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-white/10"
                style={{ backgroundColor: swatch.background }}
                aria-hidden="true"
              >
                <span
                  className="absolute bottom-0 right-0 h-3 w-3 rounded-full border border-white/10"
                  style={{ backgroundColor: swatch.accent }}
                />
              </span>
              <span className="min-w-0 flex-1 truncate text-xs font-medium text-foreground">
                {t(`options.${option}`)}
              </span>
              {selected && <Check className="h-3.5 w-3.5 shrink-0 text-orange-400" aria-hidden="true" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
