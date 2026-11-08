"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

/**
 * Tells the first-party page counter (src/app/api/analytics/view/route.ts)
 * that this page was viewed. It sends the page's pathname, whether this is
 * the first view of the visit, and on that first view only the referrer's
 * HOST and a ?utm_source= tag. Nothing is stored in the browser: no cookie,
 * no localStorage, no id, so there is nothing for it to remember between
 * visits. It is silent when the browser says Do Not Track or Global Privacy
 * Control, and when the server's switch is off the server ignores the call.
 */
export function PageViewBeacon() {
  const pathname = usePathname();
  const first = useRef(true);

  useEffect(() => {
    if (!pathname) return;
    const nav = navigator as Navigator & { globalPrivacyControl?: boolean };
    if (nav.doNotTrack === "1" || nav.globalPrivacyControl === true) return;

    const isFirst = first.current;
    first.current = false;

    let ref = "";
    let utm = "";
    if (isFirst) {
      try {
        const r = document.referrer ? new URL(document.referrer).host : "";
        ref = r && r !== window.location.host ? r : "";
        utm = new URLSearchParams(window.location.search).get("utm_source") ?? "";
      } catch {
        /* an unreadable referrer is simply "direct" */
      }
    }

    try {
      void fetch("/api/analytics/view", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ path: pathname, first: isFirst, ref, utm }),
        keepalive: true,
        credentials: "same-origin",
      }).catch(() => {});
    } catch {
      /* counting must never break a page */
    }
  }, [pathname]);

  return null;
}
