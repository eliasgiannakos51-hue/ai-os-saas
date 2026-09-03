"use client";

import { usePathname } from "next/navigation";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { LanguageSelector } from "@/components/i18n/language-selector";

// Mounted once, in the root layout, so the language switcher + theme
// toggle reach every page (landing, pricing, roadmap, auth pages, legal
// pages, etc.) without touching each one's own markup. Dashboard routes
// already get both controls from TopNav (the actual "top navigation bar"
// the feature was asked for), so this renders nothing there to avoid a
// duplicate, overlapping control cluster.
export function GlobalControls() {
  const pathname = usePathname();
  if (pathname?.startsWith("/dashboard")) {
    return null;
  }

  return (
    <div className="fixed right-3 top-3 z-40 flex items-center gap-1 rounded-xl border border-border bg-panel/90 p-1 shadow-lg backdrop-blur-md sm:right-4 sm:top-4">
      {/* The same testid as the dashboard bar's control, so one gate
          (scripts/tests/language-visible.prodtest.mjs, and its public
          half against the live site) can find "the language control" on
          every kind of page by the same name. */}
      <LanguageSelector showCode testId="language-control" />
      <ThemeToggle />
    </div>
  );
}
