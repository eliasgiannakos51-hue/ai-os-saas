"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { ChevronDown } from "lucide-react";

const STORAGE_KEY = "cookie-consent-accepted";

// Public pages only — dashboard routes are already behind auth, and by the
// time someone's logged in they've necessarily already passed through a
// public page first, so there's no path that reaches the dashboard
// without this banner having had a chance to show.
export function CookieConsentBanner() {
  const pathname = usePathname();
  const t = useTranslations("cookies.banner");
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
            <span>{t("summary")}</span>
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
            className="inline-flex min-h-[44px] shrink-0 items-center justify-center rounded-lg bg-orange-500 px-4 py-1.5 text-xs font-semibold text-black transition-all duration-200 hover:opacity-90"
          >
            {t("accept")}
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
            {/* Each paragraph is ONE message, with its emphasis and its links
                inside it as rich-text tags rather than as separate keys
                concatenated in JSX. Splitting a sentence into a label key
                plus a body key forces every language into English word
                order — and German, Japanese and Arabic do not have it. The
                dash after the bold lead-in belongs to the sentence too, and
                in Arabic the whole line runs the other way, so it cannot
                live in the JSX either. */}
            <div className="mt-3 space-y-1.5 border-t border-border pt-3 text-xs text-muted">
              <p>
                {t.rich("essential", {
                  term: (chunks) => <span className="font-medium text-foreground">{chunks}</span>,
                })}
              </p>
              <p>
                {t.rich("preferences", {
                  term: (chunks) => <span className="font-medium text-foreground">{chunks}</span>,
                })}
              </p>
              <p>
                {t.rich("noTracking", {
                  cookiePolicy: (chunks) => (
                    <a href="/cookies" className="text-orange-400 underline underline-offset-2">
                      {chunks}
                    </a>
                  ),
                  privacyPolicy: (chunks) => (
                    <a href="/privacy" className="text-orange-400 underline underline-offset-2">
                      {chunks}
                    </a>
                  ),
                })}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
