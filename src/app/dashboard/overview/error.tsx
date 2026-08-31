"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { AlertTriangle } from "lucide-react";

/**
 * THE HOME SCREEN'S OWN BOUNDARY.
 *
 * WHY THIS SEGMENT AND NOT JUST THE DASHBOARD'S. A React error #310 —
 * "rendered more hooks than during the previous render" — was observed
 * here in a production build, two runs in seven, thrown from a useMemo
 * inside a vendor chunk. It did not reproduce in a development build in
 * 141 attempts, so it is not fixed; what IS fixed is what a person sees
 * when it happens. This is the first screen after signing in.
 *
 * WHAT IT DOES NOT DO: print error.message. In a production build that
 * message is "Minified React error #310; visit https://react.dev/…",
 * which tells the reader nothing and puts a raw error string on a page —
 * the exact thing lib/scrub-secrets.ts exists to keep out of the DOM. The
 * digest is shown instead, because that is the value that matches the
 * server log entry, and it is the only thing support could ask for.
 *
 * The individual cards each sit inside a WidgetBoundary as well, so this
 * only appears when something outside them fails. Both report to
 * /api/client-error, which lands in production_errors and on
 * /dashboard/system-health.
 */
export default function OverviewError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("errors.boundary");

  useEffect(() => {
    // The console line stays: it is what a developer with the tab open
    // reads, and it is the only place the full stack survives.
    console.error(error);
    void fetch("/api/client-error", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: error.message,
        stack: error.stack?.slice(0, 4000),
        component: "dashboard/overview",
      }),
      keepalive: true,
    }).catch(() => {
      // A failed report must not cascade into a second failure on a
      // screen whose whole job is to stay standing.
    });
  }, [error]);

  return (
    <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6">
      <div
        role="alert"
        className="rounded-2xl border border-red-500/30 bg-red-500/[0.04] p-6"
      >
        <p className="flex items-center gap-2 text-base font-semibold text-foreground">
          <AlertTriangle className="h-5 w-5 shrink-0 text-red-400" aria-hidden="true" />
          {t("title")}
        </p>
        <p className="mt-2 max-w-prose text-sm text-muted">{t("body")}</p>
        <button
          type="button"
          onClick={() => reset()}
          className="mt-5 inline-flex min-h-[44px] items-center justify-center rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-black transition-opacity hover:opacity-90"
        >
          {t("reload")}
        </button>
        {error.digest ? (
          // NOT the message. The digest is the value that matches the
          // server log, so it is the one thing worth showing and the one
          // thing support can act on.
          <p className="mt-4 font-mono text-[11px] text-muted/70">{error.digest}</p>
        ) : null}
      </div>
    </div>
  );
}
