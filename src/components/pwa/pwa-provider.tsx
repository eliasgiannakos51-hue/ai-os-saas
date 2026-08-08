"use client";

import { useCallback, useEffect, useState } from "react";
import { Download, X } from "lucide-react";
import {
  INSTALL_STATE_STORAGE_KEY,
  parseInstallState,
  recordVisit,
  shouldShowInstallPrompt,
  type InstallPromptState,
} from "@/lib/pwa/install-prompt";

// Registers the service worker and owns the add-to-home-screen prompt.
//
// Mounted once, in the dashboard layout rather than the root layout: the
// offline shell and push are features of the signed-in app, and a
// service worker registered on the marketing pages would start caching
// navigations for visitors who never log in.

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
    // Private browsing — the prompt just won't remember, which is a
    // better failure than throwing inside a layout.
  }
}

export function PwaProvider() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);

  // 1. Service worker.
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    // Registered after load so it never competes with the first paint for
    // bandwidth on a slow connection.
    const register = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
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

  // 2. Visit counting + install prompt eligibility.
  useEffect(() => {
    const isStandalone =
      window.matchMedia?.("(display-mode: standalone)").matches ||
      // iOS Safari's own flag — it does not implement display-mode for
      // installed web apps in older versions.
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;

    const next = recordVisit(readState(), Date.now());
    writeState(next);

    const onBeforeInstall = (event: Event) => {
      // Suppress Chrome's own mini-infobar; we decide the timing.
      event.preventDefault();
      const promptEvent = event as BeforeInstallPromptEvent;
      setDeferred(promptEvent);
      if (
        shouldShowInstallPrompt(readState(), Date.now(), {
          alreadyInstalled: isStandalone,
          canPrompt: true,
        })
      ) {
        setVisible(true);
      }
    };
    const onInstalled = () => {
      writeState({ ...readState(), installed: true });
      setVisible(false);
      setDeferred(null);
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const install = useCallback(async () => {
    if (!deferred) return;
    setVisible(false);
    await deferred.prompt();
    const choice = await deferred.userChoice;
    if (choice.outcome === "dismissed") {
      writeState({ ...readState(), dismissedAt: Date.now() });
    }
    setDeferred(null);
  }, [deferred]);

  const dismiss = useCallback(() => {
    writeState({ ...readState(), dismissedAt: Date.now() });
    setVisible(false);
  }, []);

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-label="Install Ionexa"
      className="fixed inset-x-3 bottom-3 z-50 mx-auto max-w-sm rounded-xl border border-border bg-panel p-4 shadow-lg md:left-auto md:right-4 md:mx-0"
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-orange-500/10 text-orange-400">
          <Download className="h-4 w-4" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">Install Ionexa</p>
          <p className="mt-0.5 text-xs text-muted">
            Add it to your home screen for full-screen access and notifications.
          </p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={install}
              className="rounded-lg bg-orange-500 px-3 py-1.5 text-xs font-semibold text-black transition hover:bg-orange-400"
            >
              Install
            </button>
            <button
              type="button"
              onClick={dismiss}
              className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted transition hover:text-foreground"
            >
              Not now
            </button>
          </div>
        </div>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss"
          className="text-muted transition hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
