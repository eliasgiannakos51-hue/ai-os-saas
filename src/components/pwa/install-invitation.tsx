"use client";

import { useState } from "react";
import { Download, Share, Plus, X, Smartphone } from "lucide-react";
import { useTranslations } from "next-intl";
import type { InstallSurface } from "@/lib/pwa/platform";

/**
 * The invitation to install — and, on iPhone, the only thing that can
 * possibly work.
 *
 * TWO SURFACES, because they are two different problems.
 *
 * On Chrome and Edge the browser hands us an event and one button does
 * everything. On iOS Safari there is no event and no API: Apple never
 * offers installation, and no code we write can trigger it. The only
 * mechanism available is a person tapping Share and then "Add to Home
 * Screen" — so on iOS the honest product is instructions, not a button
 * that does nothing.
 *
 * That is not a cosmetic gap. iOS grants Web Push only to a web app that
 * was added to the Home Screen, and Safari evicts a site's stored data
 * after seven days without a visit. An iPhone user who is never told this
 * gets no notifications and loses local state, and neither failure looks
 * like a missing instruction from the inside — it looks like the app being
 * broken.
 */
export function InstallInvitation({
  surface,
  onInstall,
  onDismiss,
}: {
  surface: Exclude<InstallSurface, "none">;
  onInstall: () => void;
  onDismiss: () => void;
}) {
  const t = useTranslations("pwa");
  const tCommon = useTranslations("common");
  const [showSteps, setShowSteps] = useState(false);

  return (
    <div
      role="dialog"
      aria-label={t("installTitle")}
      data-testid="install-invitation"
      data-surface={surface}
      className="fixed inset-x-3 bottom-3 z-50 mx-auto max-w-sm rounded-xl border border-border bg-panel p-4 shadow-lg md:left-auto md:right-4 md:mx-0"
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-orange-500/10 text-orange-400">
          {surface === "ios" ? (
            <Smartphone className="h-4 w-4" aria-hidden="true" />
          ) : (
            <Download className="h-4 w-4" aria-hidden="true" />
          )}
        </span>

        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">
            {surface === "ios" ? t("iosTitle") : t("installTitle")}
          </p>
          <p className="mt-0.5 text-xs text-muted">
            {surface === "ios" ? t("iosBody") : t("installBody")}
          </p>

          {surface === "ios" && showSteps && <IosInstallSteps />}

          <div className="mt-3 flex gap-2">
            {surface === "native" ? (
              <button
                type="button"
                onClick={onInstall}
                data-testid="install-accept"
                className="rounded-lg bg-orange-500 px-3 py-1.5 text-xs font-semibold text-black transition hover:bg-orange-400"
              >
                {t("install")}
              </button>
            ) : showSteps ? (
              <button
                type="button"
                onClick={onDismiss}
                data-testid="install-accept"
                className="rounded-lg bg-orange-500 px-3 py-1.5 text-xs font-semibold text-black transition hover:bg-orange-400"
              >
                {t("iosGotIt")}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setShowSteps(true)}
                data-testid="install-show-how"
                className="rounded-lg bg-orange-500 px-3 py-1.5 text-xs font-semibold text-black transition hover:bg-orange-400"
              >
                {t("showHow")}
              </button>
            )}
            <button
              type="button"
              onClick={onDismiss}
              data-testid="install-dismiss"
              className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted transition hover:text-foreground"
            >
              {t("notNow")}
            </button>
          </div>
        </div>

        <button
          type="button"
          onClick={onDismiss}
          aria-label={tCommon("dismiss")}
          className="text-muted transition hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

/**
 * The three taps, and the two things that do not work until they are made.
 *
 * Shared by the bottom-sheet invitation and the permanent Settings
 * section, because an iPhone user who dismissed the card still needs a way
 * back to these instructions — and a second copy of them would be a second
 * copy to drift.
 */
export function IosInstallSteps() {
  const t = useTranslations("pwa");
  return (
    <div data-testid="ios-install-steps">
      <ol className="mt-3 space-y-2">
        {[
          { icon: <Share className="h-3.5 w-3.5" aria-hidden="true" />, text: t("iosStep1") },
          { icon: <Plus className="h-3.5 w-3.5" aria-hidden="true" />, text: t("iosStep2") },
          { icon: null, text: t("iosStep3") },
        ].map((step, index) => (
          <li key={index} className="flex items-start gap-2 text-xs">
            <span className="mt-px flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-border text-[10px] font-semibold text-muted">
              {index + 1}
            </span>
            <span className="flex items-center gap-1.5">
              {step.icon}
              <span>{step.text}</span>
            </span>
          </li>
        ))}
      </ol>
      {/* Said plainly rather than hidden in a help article: these are the
          two things that silently stop working on an iPhone until the app
          is on the Home Screen. */}
      <p className="mt-3 rounded-lg border border-border bg-black/20 px-2.5 py-2 text-[11px] leading-relaxed text-muted">
        {t("iosWhy")}
      </p>
    </div>
  );
}
