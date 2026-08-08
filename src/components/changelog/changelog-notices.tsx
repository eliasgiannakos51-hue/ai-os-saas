"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Sparkles, X } from "lucide-react";
import { useChangelog } from "@/components/changelog/changelog-context";

/**
 * The louder half of what's-new (V3 Task 13): a MODAL for the newest
 * unseen big feature, a slim BANNER for unseen improvements/fixes.
 * Dismissing either marks the items seen, so each shows once per
 * account — the seen state lives in the database, not this tab.
 */
export function ChangelogNotices() {
  const t = useTranslations("changelog");
  const { updates, markSeen } = useChangelog();

  const [modalDismissed, setModalDismissed] = useState(false);
  const [bannerDismissed, setBannerDismissed] = useState(false);

  const unseenFeature = updates.find((u) => u.type === "feature" && !u.seen) ?? null;
  const unseenMinor = updates.filter((u) => u.type !== "feature" && !u.seen);

  // The modal steals the whole screen, so it must never race the page:
  // wait a beat after mount before showing it.
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setReady(true), 600);
    return () => clearTimeout(timer);
  }, []);

  if (!ready) return null;

  if (unseenFeature && !modalDismissed) {
    const dismiss = () => {
      setModalDismissed(true);
      markSeen([unseenFeature.id]);
    };
    return (
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("whatsNew")}
        className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      >
        <div className="w-full max-w-md rounded-2xl border border-orange-500/30 bg-panel p-5 shadow-xl">
          <div className="mb-3 flex items-start justify-between gap-3">
            <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-orange-400">
              <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
              {t("newFeature")}
            </p>
            <button
              type="button"
              onClick={dismiss}
              aria-label={t("dismiss")}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-muted transition-colors duration-150 hover:bg-panel-hover hover:text-foreground"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
          <h2 className="text-base font-bold text-foreground">{unseenFeature.title}</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted">{unseenFeature.description}</p>
          <button
            type="button"
            onClick={dismiss}
            className="mt-4 inline-flex min-h-[40px] items-center rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-black transition-all duration-200 hover:opacity-90"
          >
            {t("gotIt")}
          </button>
        </div>
      </div>
    );
  }

  if (unseenMinor.length > 0 && !bannerDismissed) {
    const dismiss = () => {
      setBannerDismissed(true);
      markSeen(unseenMinor.map((u) => u.id));
    };
    return (
      <div className="border-b border-border bg-panel/70 px-4 py-2">
        <div className="mx-auto flex max-w-5xl items-center gap-3">
          <p className="min-w-0 flex-1 truncate text-xs text-muted">
            <span className="font-semibold text-foreground">{t("improved")}</span>{" "}
            {unseenMinor[0].title}
            {unseenMinor.length > 1 && ` · ${t("andMore", { count: unseenMinor.length - 1 })}`}
          </p>
          <button
            type="button"
            onClick={dismiss}
            aria-label={t("dismiss")}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-muted transition-colors duration-150 hover:bg-panel-hover hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      </div>
    );
  }

  return null;
}
