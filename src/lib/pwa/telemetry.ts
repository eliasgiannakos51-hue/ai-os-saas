"use client";

import {
  detectBrowser,
  detectPlatform,
  type BrowserFamily,
  type DisplayMode,
  type InstallSurface,
  type Platform,
} from "@/lib/pwa/platform";

/**
 * Reading this browser's own state, and reporting it at most occasionally.
 *
 * Kept out of the component so the throttle is one rule in one place: a
 * dashboard that mounts the provider on every navigation would otherwise
 * write a row per page view, and the resulting table would measure
 * navigation rather than adoption.
 */

const CLIENT_ID_KEY = "ionexa-pwa-client";
const LAST_REPORT_KEY = "ionexa-pwa-report";
/** A heartbeat this slow still distinguishes an active device from an
 *  abandoned one, without writing on every visit. */
const REPORT_EVERY_MS = 6 * 60 * 60 * 1000;

export type PwaClientState = {
  clientId: string;
  platform: Platform;
  browser: BrowserFamily;
  displayMode: DisplayMode;
  pushPermission: "granted" | "denied" | "default" | "unsupported";
  pushSubscribed: boolean;
  installSurface?: InstallSurface;
  installOutcome?: "accepted" | "dismissed";
};

/**
 * A random id kept in localStorage — NOT derived from anything about the
 * device.
 *
 * That is the difference between counting devices and fingerprinting them:
 * this id cannot be recomputed anywhere else, it dies when the user clears
 * their browser data, and on its own it says nothing at all.
 */
export function pwaClientId(): string {
  try {
    const existing = window.localStorage.getItem(CLIENT_ID_KEY);
    if (existing) return existing;
    const minted =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : Math.random().toString(36).slice(2) + Date.now().toString(36);
    window.localStorage.setItem(CLIENT_ID_KEY, minted);
    return minted;
  } catch {
    // Private browsing: report under a throwaway id rather than not at
    // all. It inflates the device count slightly for people who browse
    // that way, which is a smaller error than counting them as zero.
    return "ephemeral-" + Math.random().toString(36).slice(2);
  }
}

export function readDisplayMode(): DisplayMode {
  const modes: DisplayMode[] = ["window-controls-overlay", "fullscreen", "standalone", "minimal-ui"];
  for (const mode of modes) {
    if (window.matchMedia?.(`(display-mode: ${mode})`).matches) return mode;
  }
  // iOS Safari does not implement display-mode for installed web apps; it
  // has its own flag, and without this check every installed iPhone would
  // be counted as a browser tab — the exact population the whole question
  // is about.
  if ((window.navigator as unknown as { standalone?: boolean }).standalone === true) {
    return "standalone";
  }
  return "browser";
}

export async function readPushState(): Promise<{
  permission: PwaClientState["pushPermission"];
  subscribed: boolean;
}> {
  if (typeof Notification === "undefined" || !("serviceWorker" in navigator) || !("PushManager" in window)) {
    return { permission: "unsupported", subscribed: false };
  }
  const permission = Notification.permission as "granted" | "denied" | "default";
  if (permission !== "granted") return { permission, subscribed: false };
  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    return { permission, subscribed: Boolean(subscription) };
  } catch {
    return { permission, subscribed: false };
  }
}

export async function readPwaClientState(
  extra: Pick<PwaClientState, "installSurface" | "installOutcome"> = {}
): Promise<PwaClientState> {
  const push = await readPushState();
  return {
    clientId: pwaClientId(),
    platform: detectPlatform(navigator.userAgent, {
      maxTouchPoints: navigator.maxTouchPoints,
      platformHint: (navigator as unknown as { platform?: string }).platform,
    }),
    browser: detectBrowser(navigator.userAgent),
    displayMode: readDisplayMode(),
    pushPermission: push.permission,
    pushSubscribed: push.subscribed,
    ...extra,
  };
}

/** The facts, minus the id — what a report is ABOUT. A change here is
 *  always worth sending; an unchanged one can wait for the heartbeat. */
function factsOf(state: PwaClientState): string {
  return [
    state.platform,
    state.browser,
    state.displayMode,
    state.pushPermission,
    state.pushSubscribed ? "sub" : "nosub",
    state.installOutcome ?? "",
  ].join("|");
}

/**
 * Sends the state — unless nothing has changed and the last send was
 * recent. An `installOutcome` always sends: it happens once per device and
 * is the answer to "did the invitation work".
 */
export async function reportPwaState(state: PwaClientState): Promise<boolean> {
  const facts = factsOf(state);
  const now = Date.now();
  if (!state.installOutcome) {
    try {
      const raw = window.localStorage.getItem(LAST_REPORT_KEY);
      if (raw) {
        const last = JSON.parse(raw) as { at?: number; facts?: string };
        if (last.facts === facts && typeof last.at === "number" && now - last.at < REPORT_EVERY_MS) {
          return false;
        }
      }
    } catch {
      // Unreadable history means "report it", which is the safe direction.
    }
  }

  try {
    const response = await fetch("/api/pwa/telemetry", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(state),
      keepalive: true,
    });
    if (!response.ok) return false;
    window.localStorage.setItem(LAST_REPORT_KEY, JSON.stringify({ at: now, facts }));
    return true;
  } catch {
    // A dropped telemetry POST is not an error the user should ever meet.
    return false;
  }
}
