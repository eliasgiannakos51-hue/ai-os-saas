"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  INSTALL_STATE_STORAGE_KEY,
  parseInstallState,
  recordVisit,
  shouldShowInstallPrompt,
  type InstallPromptState,
} from "@/lib/pwa/install-prompt";
import {
  installSurface,
  isInstalledDisplayMode,
  type DisplayMode,
  type InstallSurface,
  type Platform,
} from "@/lib/pwa/platform";
import { readPwaClientState, reportPwaState } from "@/lib/pwa/telemetry";
import { InstallInvitation } from "@/components/pwa/install-invitation";

// Registers the service worker, decides whether to invite an install, and
// records what this browser is.
//
// Mounted once, in the dashboard layout rather than the root layout: the
// offline shell and push are features of the signed-in app, and a service
// worker registered on the marketing pages would start caching navigations
// for visitors who never log in.
//
// WHAT CHANGED AND WHY. The invitation used to live entirely inside the
// `beforeinstallprompt` handler — so on any browser that never fires that
// event, the card could not appear at all. Safari never fires it. Every
// iPhone therefore fell through to nothing: no invitation, and, because
// iOS grants web push only to a Home-Screen app, no notifications either.
// The decision now starts from the DEVICE (lib/pwa/platform.ts) and the
// event is only one of the things that can satisfy it.

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function readState(): InstallPromptState {
  try {
    return parseInstallState(window.localStorage.getItem(INSTALL_STATE_STORAGE_KEY));
  } catch {
    return parseInstallState(null);
  }
}

function writeState(state: InstallPromptState) {
  try {
    window.localStorage.setItem(INSTALL_STATE_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Private browsing — the prompt just won't remember, which is a better
    // failure than throwing inside a layout.
  }
}

export function PwaProvider() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [surface, setSurface] = useState<InstallSurface>("none");
  const [visible, setVisible] = useState(false);
  /** Telemetry is sent once per mount at most; the throttle inside
   *  reportPwaState decides whether it actually goes. */
  const reported = useRef(false);

  // 1. Service worker.
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    // Registered after load so it never competes with the first paint for
    // bandwidth on a slow connection.
    const register = () => {
      // The build stamp is what makes a redeploy REACH the worker.
      //
      // public/sw.js is byte-identical between deploys, so the browser saw
      // no update, never ran `activate`, and the cache-purge in it never
      // fired — a user who had been offline could open last month's
      // dashboard HTML indefinitely. A changing script URL is what the
      // browser treats as a new script for the same scope. Vercel injects
      // the commit SHA; locally it is "dev", which is stable across a
      // dev session and that is the right behaviour there.
      const build =
        process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA ?? process.env.NEXT_PUBLIC_BUILD_ID ?? "dev";
      navigator.serviceWorker.register(`/sw.js?build=${encodeURIComponent(build)}`).catch(() => {
        // A failed registration means no offline shell and no push. Both
        // are enhancements; the app itself keeps working.
      });
    };
    if (document.readyState === "complete") register();
    else {
      window.addEventListener("load", register);
      return () => window.removeEventListener("load", register);
    }
  }, []);

  // 2. What this device is, whether to invite it, and what to record.
  //
  // The decision has two inputs that arrive in either order: the device
  // (resolved asynchronously, because reading the push subscription needs
  // the worker) and the browser's install event (which may fire before or
  // after that, or never). So both are kept in refs and `decide` is called
  // whenever either lands — rather than the old arrangement, where the
  // event handler WAS the decision and a device that never fires one could
  // not be offered anything.
  const nativePrompt = useRef<BeforeInstallPromptEvent | null>(null);
  const device = useRef<{ platform: Platform; displayMode: DisplayMode } | null>(null);

  const decide = useCallback(() => {
    const seen = device.current;
    if (!seen) return;
    const next = installSurface({
      platform: seen.platform,
      displayMode: seen.displayMode,
      hasNativePrompt: Boolean(nativePrompt.current),
    });
    setSurface(next);
    if (next === "none") {
      setVisible(false);
      return;
    }
    if (
      shouldShowInstallPrompt(readState(), Date.now(), {
        alreadyInstalled: isInstalledDisplayMode(seen.displayMode),
        canPrompt: true,
      })
    ) {
      setVisible(true);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    const onBeforeInstall = (event: Event) => {
      // Suppress Chrome's own mini-infobar; we decide the timing.
      event.preventDefault();
      nativePrompt.current = event as BeforeInstallPromptEvent;
      setDeferred(event as BeforeInstallPromptEvent);
      decide();
    };
    const onInstalled = () => {
      writeState({ ...readState(), installed: true });
      setVisible(false);
      setDeferred(null);
      nativePrompt.current = null;
      void readPwaClientState({ installSurface: "native", installOutcome: "accepted" }).then(
        reportPwaState
      );
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);

    void (async () => {
      const resolved = await readPwaClientState();
      if (cancelled) return;
      device.current = { platform: resolved.platform, displayMode: resolved.displayMode };

      // The visit is counted once per mount, BEFORE any decision reads it.
      writeState(recordVisit(readState(), Date.now()));

      if (!reported.current) {
        reported.current = true;
        void reportPwaState(resolved);
      }
      decide();
    })();

    return () => {
      cancelled = true;
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, [decide]);

  const install = useCallback(async () => {
    if (!deferred) return;
    setVisible(false);
    await deferred.prompt();
    const choice = await deferred.userChoice;
    if (choice.outcome === "dismissed") {
      writeState({ ...readState(), dismissedAt: Date.now() });
    }
    void readPwaClientState({ installSurface: "native", installOutcome: choice.outcome }).then(
      reportPwaState
    );
    setDeferred(null);
  }, [deferred]);

  const dismiss = useCallback(() => {
    writeState({ ...readState(), dismissedAt: Date.now() });
    setVisible(false);
    if (surface !== "none") {
      // On iOS "dismiss" covers both buttons — there is no event that can
      // tell us whether the person went on to add it. The next visit's
      // display_mode is what answers that, which is why it is recorded
      // rather than assumed here.
      void readPwaClientState({ installSurface: surface, installOutcome: "dismissed" }).then(
        reportPwaState
      );
    }
  }, [surface]);

  if (!visible || surface === "none") return null;

  return <InstallInvitation surface={surface} onInstall={install} onDismiss={dismiss} />;
}
