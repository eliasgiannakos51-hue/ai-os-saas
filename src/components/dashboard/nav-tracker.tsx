"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

/**
 * One row per screen change, for the whole dashboard.
 *
 * Mounted once in app/dashboard/layout.tsx, which is the only place it
 * can be: the layout survives every client-side navigation, so
 * usePathname() here reports each change without the component
 * remounting — whereas a tracker inside a page would fire on mount and
 * then be destroyed, which records the arrival and never the departure.
 *
 * THE DEDUPE KEY IS A MODULE VARIABLE, NOT A REF, and that is deliberate.
 * A useRef is re-created when React remounts the tree — which StrictMode
 * does on purpose in development, and which a hot reload does by
 * accident. Either would post the same navigation twice and inflate every
 * count in nav_screen_usage. One variable per browser tab is exactly the
 * scope the question needs.
 *
 * WHAT IT SENDS AND WHAT IT DOES NOT. The raw pathname, and the previous
 * one. No query string is read here — but nothing depends on that, because
 * lib/nav/nav-path.ts strips it again on the server, where the client
 * cannot reach.
 *
 * keepalive: the last navigation of a session is usually the one that
 * closes the tab, and a plain fetch is cancelled when the document goes
 * away. Without it the exit screen — the single most useful row in the
 * table for "where do people stop" — would be the one row never written.
 */
let lastTrackedPath: string | null = null;

/** For the tests: forget what this tab has already recorded. */
export function resetNavTrackerForTests() {
  lastTrackedPath = null;
}

/**
 * The screen this navigation came FROM.
 *
 * Within a tab that is simply the previous pathname. On the first
 * navigation after a full page load there is no previous pathname, so
 * document.referrer stands in — and only then. Same-origin: its pathname.
 * Another site: the literal 'external', never the URL, because that URL
 * belongs to somebody else and answers no question this table asks.
 */
function referrerFor(previous: string | null): string | null {
  if (previous) return previous;
  if (typeof document === "undefined") return null;
  const raw = document.referrer;
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.origin === window.location.origin ? url.pathname : "external";
  } catch {
    return null;
  }
}

export function NavTracker() {
  const pathname = usePathname();

  useEffect(() => {
    if (!pathname) return;
    if (lastTrackedPath === pathname) return;

    const referrer = referrerFor(lastTrackedPath);
    // SET BEFORE THE FETCH, not after. Two navigations can land in the
    // same tick; setting it in the .then() would let both see the old
    // value and post twice.
    lastTrackedPath = pathname;

    void fetch("/api/nav/track", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ path: pathname, referrer }),
      keepalive: true,
    }).catch(() => undefined);
  }, [pathname]);

  return null;
}
