"use client";

import { isRecordableHref } from "@/lib/nav-analytics";

/**
 * Tell the server a navigation happened. Never blocks it.
 *
 * `keepalive: true` is the whole reason this is a fetch and not an
 * ordinary one: a nav click can start a full page load, and a normal
 * fetch is cancelled when the document goes away. keepalive lets the
 * request outlive the page, which is exactly what sendBeacon does — and
 * unlike sendBeacon it can send a JSON content type, which the route
 * parses. Same-origin, so the session cookie rides along either way.
 *
 * EVERY FAILURE IS SWALLOWED. Offline, rate-limited, 500, blocked by an
 * extension: none of it may affect the click the user just made. A lost
 * row costs a statistic. A thrown promise in a nav handler costs the
 * navigation.
 *
 * The client-side isRecordableHref() call is an optimisation, not a
 * check — it skips a request the server would refuse anyway. The route
 * runs the same validator on what actually arrives.
 */
export function recordNavEvent(href: string): void {
  if (typeof window === "undefined") return;
  if (!isRecordableHref(href)) return;

  try {
    void fetch("/api/nav-events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ href }),
      keepalive: true,
    }).catch(() => {
      /* see above: a navigation must not depend on this succeeding */
    });
  } catch {
    /* fetch itself can throw synchronously if the page is tearing down */
  }
}
