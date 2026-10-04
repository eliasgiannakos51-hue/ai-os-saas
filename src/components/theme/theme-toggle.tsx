"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { THEME_STORAGE_KEY, type Theme } from "@/lib/theme-prefs";
import { useTranslations } from "next-intl";

// No context/provider needed — the theme lives on <html data-theme> and in
// localStorage, both written directly to the DOM. The blocking inline
// script in layout.tsx sets the initial attribute before paint (avoiding a
// flash); this component only needs to read that attribute back on mount
// and toggle it afterward, same source of truth either way.
//
// A plain dark/light toggle, and since 2026-10-04 those are the only two
// themes there are (lib/theme-prefs.ts).
export function ThemeToggle({ className }: { className?: string }) {
  const t = useTranslations("common");
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => {
    const current = document.documentElement.getAttribute("data-theme");
    setTheme(current === "light" ? "light" : "dark");
  }, []);

  function toggle() {
    const next: Theme = theme === "light" ? "dark" : "light";
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Private browsing / storage disabled — theme still applies for this
      // page load via the DOM attribute, just doesn't persist.
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={theme === "light" ? t("switchToDarkMode") : t("switchToLightMode")}
      className={
        className ??
        "flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-muted transition-colors duration-150 hover:bg-panel hover:text-foreground"
      }
    >
      {theme === "light" ? (
        <Moon className="h-[18px] w-[18px]" aria-hidden="true" />
      ) : (
        <Sun className="h-[18px] w-[18px]" aria-hidden="true" />
      )}
    </button>
  );
}
