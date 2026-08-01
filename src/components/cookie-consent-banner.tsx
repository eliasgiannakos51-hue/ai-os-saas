"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

const STORAGE_KEY = "cookie-consent-accepted";

// Public pages only — dashboard routes are already behind auth, and by the
// time someone's logged in they've necessarily already passed through a
// public page first, so there's no path that reaches the dashboard
// without this banner having had a chance to show.
export function CookieConsentBanner() {
  const pathname = usePathname();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      setVisible(window.localStorage.getItem(STORAGE_KEY) !== "1");
    } catch {
      // Private browsing / storage disabled — default to showing it; the
      // Accept button below just won't persist the choice across reloads.
      setVisible(true);
    }
  }, []);

  function accept() {
    setVisible(false);
    try {
      window.localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      // Storage disabled — the banner will just show again next visit.
    }
  }

  if (pathname?.startsWith("/dashboard") || !visible) {
    return null;
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-panel/95 px-4 py-3 backdrop-blur-md sm:px-6">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted">
          We use cookies for essential functionality — signing you in and keeping your session
          working.
        </p>
        <button
          type="button"
          onClick={accept}
          className="inline-flex min-h-[36px] shrink-0 items-center justify-center rounded-lg bg-orange-500 px-4 py-1.5 text-xs font-semibold text-black transition-all duration-200 hover:opacity-90 sm:min-h-0"
        >
          Accept
        </button>
      </div>
    </div>
  );
}
