"use client";

import { isNetworkError } from "@/lib/network/offline";

/**
 * One place that knows whether the app can reach the server.
 *
 * A module-level emitter rather than React context because the things
 * that discover a failure are not components: `startAndWatchJob` and
 * `fetchWithAuthRetry` are plain functions called from event handlers,
 * and threading a context through them would mean every caller passing
 * something it does not care about.
 *
 * THE TWO SIGNALS, and why neither is enough alone:
 *
 *   · `navigator.onLine` — instant, and only trustworthy when FALSE.
 *     `true` means an interface exists, not that anything is reachable:
 *     a captive portal, a dropped VPN and a phone with one bar all
 *     report `true`.
 *   · A REQUEST THAT FAILED — true, and late. The user has already
 *     watched something not happen by the time this fires.
 *
 * So both are used, and recovery is never assumed from either: a
 * connection is declared back only after a request actually succeeds, or
 * after a probe reaches the server. An `online` event alone is exactly
 * the optimism above.
 */
type Listener = (offline: boolean) => void;

const listeners = new Set<Listener>();
let reportedOffline = false;

function emit() {
  const offline = isOffline();
  for (const listener of listeners) listener(offline);
}

/** Offline if the browser says so, or if a request told us so and
 *  nothing has succeeded since. */
export function isOffline(): boolean {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  return reportedOffline;
}

export function subscribeToNetwork(listener: Listener): () => void {
  listeners.add(listener);
  if (typeof window !== "undefined") {
    // The browser's own events. `offline` is believed immediately;
    // `online` only clears the browser's half — see probeReachable.
    window.addEventListener("online", emit);
    window.addEventListener("offline", emit);
  }
  return () => {
    listeners.delete(listener);
    if (typeof window !== "undefined" && listeners.size === 0) {
      window.removeEventListener("online", emit);
      window.removeEventListener("offline", emit);
    }
  };
}

/**
 * Called from a catch block. Only a transport failure counts — a 500
 * resolves, and reporting it as offline would tell the user to check a
 * connection that is fine while a real bug goes unmentioned.
 */
export function reportNetworkFailure(error: unknown): void {
  if (!isNetworkError(error)) return;
  if (reportedOffline) return;
  reportedOffline = true;
  emit();
}

/** Called when a request completed — whatever it answered. Reaching the
 *  server at all is the proof that the connection is back. */
export function reportNetworkSuccess(): void {
  if (!reportedOffline) return;
  reportedOffline = false;
  emit();
}

/**
 * Ask the server directly.
 *
 * Used by the retry button, because pressing "try again" and being told
 * "still offline" on the strength of `navigator.onLine` — which is the
 * signal that lies — would be the worst answer available.
 *
 * The manifest is fetched rather than an API route: it is tiny, it is
 * not personalised, it needs no session, and the service worker leaves
 * `no-store` requests alone, so a cached copy cannot answer for a
 * network that is down.
 */
export async function probeReachable(): Promise<boolean> {
  try {
    const response = await fetch("/manifest.webmanifest", { cache: "no-store", method: "GET" });
    if (!response.ok) return false;
    reportNetworkSuccess();
    return true;
  } catch (error) {
    reportNetworkFailure(error);
    return false;
  }
}

/** Test seam. The emitter is module state, so a suite that flips it has
 *  to be able to put it back. */
export function resetNetworkStatusForTests(): void {
  reportedOffline = false;
  listeners.clear();
}
