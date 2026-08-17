"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { WifiOff, RefreshCw, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { isOffline, probeReachable, subscribeToNetwork } from "@/lib/network/network-status";
import { stalenessMinutes } from "@/lib/network/offline";

/**
 * What a page says when it cannot reach the server.
 *
 * BEFORE THIS, nothing did. The service worker already served the last
 * version of a page from cache when a navigation failed, which is the
 * right behaviour and the dangerous one: the user gets a dashboard that
 * looks completely normal and is simply not true any more. Numbers that
 * stopped updating look identical to numbers that did not change.
 *
 * So the three things this says are the three the user needs, in that
 * order:
 *
 *   1. WHAT HAPPENED — you are offline, nothing here is updating.
 *   2. WHAT THEY ARE LOOKING AT — how old it is. Cached data is worth
 *      keeping on screen; cached data presented as live is not.
 *   3. WHAT THEY CAN DO — one button, which actually checks rather than
 *      believing `navigator.onLine`.
 *
 * MOUNTED ONCE, in the dashboard layout, for the same reason the help
 * "?" lives in PageHeader: a warning that appears in a different place
 * on each page is one people stop finding. Every page that loads data is
 * under that layout, so every page gets it without each one remembering.
 *
 * It renders NOTHING while the connection is fine — no wrapper, no
 * reserved space, nothing to shift the layout of a page that is working.
 */
export function OfflineBanner() {
  const t = useTranslations("common.offline");
  const router = useRouter();
  const [offline, setOffline] = useState(false);
  const [checking, setChecking] = useState(false);
  const [failedRetry, setFailedRetry] = useState(false);
  // When the data on screen arrived. Mount time is the honest answer:
  // this component mounts with the server-rendered page it belongs to,
  // whether that page came from the network or out of the service
  // worker's cache.
  const loadedAtRef = useRef(Date.now());
  const [minutesOld, setMinutesOld] = useState<number | null>(null);

  useEffect(() => {
    setOffline(isOffline());
    return subscribeToNetwork(setOffline);
  }, []);

  // The age is only computed while offline, and only once a minute. A
  // ticking clock on a healthy page is a render every second for a
  // number nobody is reading.
  useEffect(() => {
    if (!offline) {
      setMinutesOld(null);
      return;
    }
    const update = () => setMinutesOld(stalenessMinutes(loadedAtRef.current, Date.now()));
    update();
    const timer = setInterval(update, 60_000);
    return () => clearInterval(timer);
  }, [offline]);

  async function retry() {
    setChecking(true);
    setFailedRetry(false);
    const reachable = await probeReachable();
    setChecking(false);
    if (!reachable) {
      // Said explicitly. A retry button that visibly does nothing is
      // indistinguishable from a broken one, and the user's next move —
      // wait, or move to somewhere with signal — depends on knowing.
      setFailedRetry(true);
      return;
    }
    // Reachable again: pull the page's own data down rather than leaving
    // the user on the cached copy they were just warned about.
    loadedAtRef.current = Date.now();
    router.refresh();
  }

  if (!offline) return null;

  return (
    <div
      data-testid="offline-banner"
      // The right padding clears GlobalControls, which is `fixed right-3
      // top-3` in the root layout. Without it the retry button sits
      // underneath the language and theme buttons at 375px — measured in
      // a screenshot, not guessed.
      // Assertive, not polite: the page underneath is stale and the
      // reader is entitled to be interrupted about it.
      role="alert"
      className="sticky top-0 z-50 border-b border-amber-500/40 bg-amber-500/10 px-4 py-2.5 pr-28 backdrop-blur sm:pr-32"
    >
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-3 gap-y-1.5">
        <WifiOff className="h-4 w-4 shrink-0 text-amber-400" aria-hidden="true" />
        <p className="text-xs font-medium text-amber-200">{t("title")}</p>
        <p className="text-[11px] text-amber-200/80">
          {minutesOld === null ? t("showingCached") : t("showingCachedAge", { minutes: minutesOld })}
        </p>
        <span className="grow" />
        {failedRetry && (
          <p data-testid="offline-retry-failed" className="text-[11px] text-amber-200/80">
            {t("stillOffline")}
          </p>
        )}
        <button
          type="button"
          data-testid="offline-retry"
          onClick={() => void retry()}
          disabled={checking}
          className="inline-flex min-h-[32px] shrink-0 items-center gap-1.5 rounded-lg border border-amber-500/50 px-3 py-1 text-[11px] font-semibold text-amber-200 transition-colors duration-150 hover:bg-amber-500/20 disabled:opacity-60"
        >
          {checking ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
          )}
          {checking ? t("checking") : t("retry")}
        </button>
      </div>
    </div>
  );
}
