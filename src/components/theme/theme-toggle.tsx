"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

type Theme = "dark" | "light";

// No context/provider needed — the theme lives on <html data-theme> and in
// localStorage, both written directly to the DOM. The blocking inline
// script in layout.tsx sets the initial attribute before paint (avoiding a
// flash); this component only needs to read that attribute back on mount
// and toggle it afterward, same source of truth either way.
export function ThemeToggle({ className }: { className?: string }) {
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
      window.localStorage.setItem("theme", next);
    } catch {
      // Private browsing / storage disabled — theme still applies for this
      // page load via the DOM attribute, just doesn't persist.
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={theme === "light" ? "Switch to dark mode" : "Switch to light mode"}
      className={
        className ??
        "flex h-9 w-9 items-center justify-center rounded-lg text-muted transition-colors duration-150 hover:bg-panel hover:text-foreground"
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
