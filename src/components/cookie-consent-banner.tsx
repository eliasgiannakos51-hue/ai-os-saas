"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { ChevronDown } from "lucide-react";

const STORAGE_KEY = "cookie-consent-accepted";

// Public pages only — dashboard routes are already behind auth, and by the
// time someone's logged in they've necessarily already passed through a
// public page first, so there's no path that reaches the dashboard
// without this banner having had a chance to show.
export function CookieConsentBanner() {
  const pathname = usePathname();
  const [visible, setVisible] = useState(false);
  const [expanded, setExpanded] = useState(false);

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
    <div className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-panel/95 backdrop-blur-md">
      <div className="mx-auto max-w-5xl px-4 py-3 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setExpanded((e) => !e)}
            aria-expanded={expanded}
            className="flex min-w-0 items-center gap-1.5 text-left text-xs text-muted transition-colors duration-150 hover:text-foreground"
          >
            <span>
              We use cookies for essential functionality — signing you in and keeping your
              session working.
            </span>
            <ChevronDown
              className={`h-3.5 w-3.5 shrink-0 transition-transform duration-200 ${
                expanded ? "rotate-180" : "rotate-0"
              }`}
              aria-hidden="true"
            />
          </button>
          <button
            type="button"
            onClick={accept}
            className="inline-flex min-h-[36px] shrink-0 items-center justify-center rounded-lg bg-orange-500 px-4 py-1.5 text-xs font-semibold text-black transition-all duration-200 hover:opacity-90 sm:min-h-0"
          >
            Accept
          </button>
        </div>

        {/* grid-template-rows 0fr->1fr, not conditional rendering — same
            technique sidebar.tsx's group collapse uses, so this expands/
            collapses smoothly instead of popping in and out instantly. */}
        <div
          className={`grid transition-[grid-template-rows] duration-200 ease-in-out ${
            expanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
          }`}
        >
          <div className="min-h-0 overflow-hidden">
            <div className="mt-3 space-y-1.5 border-t border-border pt-3 text-xs text-muted">
              <p>
                <span className="font-medium text-foreground">Essential session cookie</span> —
                set by Supabase Auth when you log in, so the app knows you&apos;re signed in on
                later requests. Without it, you&apos;d be signed out on every page load. Cleared
                automatically when it expires or when you sign out.
              </p>
              <p>
                <span className="font-medium text-foreground">Local preferences</span> — theme,
                language, accessibility settings, and this cookie-consent choice are stored in
                your browser&apos;s local storage, not sent anywhere.
              </p>
              <p>
                No advertising or third-party tracking cookies are used. See our{" "}
                <a href="/cookies" className="-my-2 inline-block py-2 text-orange-400 underline underline-offset-2">
                  Cookie Policy
                </a>{" "}
                and{" "}
                <a href="/privacy" className="-my-2 inline-block py-2 text-orange-400 underline underline-offset-2">
                  Privacy Policy
                </a>{" "}
                for details.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
