"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

// Route-change entrance animation (300ms fade + 20px rise, see
// globals.css's .page-enter).
//
// The `key={pathname}` is the whole mechanism and is not incidental: a
// CSS animation only plays when an element is MOUNTED, not when its
// children change. Without the key, React would reuse this same <div>
// across navigations and the animation would fire exactly once, on the
// first page the user ever loads. Keying it by pathname forces React to
// tear down and remount the wrapper on every route change, so the
// animation replays each time.
//
// Deliberately a plain CSS animation and not a library (framer-motion et
// al): exit animations would require holding the outgoing route's DOM
// alive, which fights Next's streaming/RSC rendering for no visual gain
// at 300ms. Reduce-motion users get the final state instantly via the
// global html[data-motion="reduce"] rule — no extra logic needed here.
export function PageTransition({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return (
    <div key={pathname} className="page-enter">
      {children}
    </div>
  );
}
