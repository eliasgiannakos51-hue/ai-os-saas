"use client";

import { useEffect } from "react";

/**
 * Stamps "seen" once, after the Home has rendered.
 *
 * A Server Component cannot do this: writing the timestamp while
 * computing the page would overwrite the value the page is diffing
 * against, and "what changed since last time" would always be empty.
 *
 * Renders nothing, fires once, and ignores failure — a missed stamp means
 * tomorrow's block covers two days instead of one, which is a smaller
 * problem than an error on a page that rendered correctly.
 */
export function HomeSeenStamp() {
  useEffect(() => {
    void fetch("/api/home/seen", { method: "POST", keepalive: true }).catch(() => undefined);
  }, []);
  return null;
}
