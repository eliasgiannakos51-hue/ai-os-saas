"use client";

import { useCallback, useEffect, useState } from "react";
import { Download, Check, Smartphone } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  detectPlatform,
  installSurface,
  isApplePhoneOrTablet,
  isInstalledDisplayMode,
  type InstallSurface,
} from "@/lib/pwa/platform";
import { readDisplayMode, readPwaClientState, reportPwaState } from "@/lib/pwa/telemetry";
import { IosInstallSteps } from "@/components/pwa/install-invitation";

/**
 * A permanent place to install, in Settings.
 *
 * The bottom-sheet invitation is transient by design — it waits for a
 * third visit and goes quiet for a month when dismissed. That is the right
 * behaviour for an interruption and the wrong behaviour for the ONLY way
 * to find the feature: someone who tapped "Not now" once, or who is on
 * iOS and read the steps but did not follow them then, had nowhere to go.
 * This is that somewhere, and it is always the truth about this device.
 */

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export function InstallSection() {
  const t = useTranslations("pwa");
  const [installed, setInstalled] = useState(false);
  const [surface, setSurface] = useState<InstallSurface>("none");
  const [onApple, setOnApple] = useState(false);
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const platform = detectPlatform(navigator.userAgent, {
      maxTouchPoints: navigator.maxTouchPoints,
      platformHint: (navigator as unknown as { platform?: string }).platform,
    });
    const displayMode = readDisplayMode();
    setOnApple(isApplePhoneOrTablet(platform));
    setInstalled(isInstalledDisplayMode(displayMode));
    setSurface(installSurface({ platform, displayMode, hasNativePrompt: false }));
    setReady(true);

    const onBeforeInstall = (event: Event) => {
      event.preventDefault();
      setDeferred(event as BeforeInstallPromptEvent);
      setSurface(installSurface({ platform, displayMode, hasNativePrompt: true }));
    };
    const onInstalled = () => {
      setInstalled(true);
      setSurface("none");
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
    await deferred.prompt();
    const choice = await deferred.userChoice;
    void readPwaClientState({ installSurface: "native", installOutcome: choice.outcome }).then(
      reportPwaState
    );
    setDeferred(null);
  }, [deferred]);

  // Rendered only once the browser has been read: a server-rendered
  // "install it" that flips to "already installed" on hydration is a worse
  // first impression than a beat of nothing.
  if (!ready) return null;

  return (
    <div className="rounded-xl border border-border bg-panel p-5">
      <h2 className="flex items-center gap-2 text-sm font-semibold">
        {installed ? (
          <Check className="h-4 w-4 text-emerald-400" aria-hidden="true" />
        ) : onApple ? (
          <Smartphone className="h-4 w-4 text-orange-400" aria-hidden="true" />
        ) : (
          <Download className="h-4 w-4 text-orange-400" aria-hidden="true" />
        )}
        {installed ? t("installedHere") : onApple ? t("iosTitle") : t("installTitle")}
      </h2>

      {installed ? null : surface === "native" ? (
        <>
          <p className="mt-1 text-xs text-muted">{t("installBody")}</p>
          <button
            type="button"
            onClick={install}
            data-testid="settings-install"
            className="mt-3 rounded-lg bg-orange-500 px-3 py-1.5 text-xs font-semibold text-black transition hover:bg-orange-400"
          >
            {t("install")}
          </button>
        </>
      ) : surface === "ios" ? (
        <>
          <p className="mt-1 text-xs text-muted">{t("iosBody")}</p>
          <IosInstallSteps />
        </>
      ) : (
        // Not "you cannot install this": most desktop browsers simply have
        // not met their own engagement heuristic yet, and every one of them
        // has a menu item that does it regardless.
        <p className="mt-1 text-xs text-muted">{t("installUnavailable")}</p>
      )}
    </div>
  );
}
