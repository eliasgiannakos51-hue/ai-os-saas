"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { AlertTriangle } from "lucide-react";

/**
 * THE DASHBOARD'S BOUNDARY — the one 39 pages fall back to.
 *
 * THREE THINGS WERE WRONG WITH IT and all three showed only when
 * somebody actually hit it:
 *
 *   1. IT WAS IN ENGLISH. "something went wrong", "unexpected error",
 *      "retry()" — hard-coded, in a product that ships in ten languages.
 *      The one screen a person sees when something breaks was the one
 *      screen that was not translated.
 *   2. IT PRINTED error.message. In a production build that reads
 *      "Minified React error #310; visit https://react.dev/errors/310",
 *      which tells the reader nothing — and putting a raw error string on
 *      a page is the exact thing lib/scrub-secrets.ts exists to prevent.
 *      A Postgres error carrying a connection string would have been
 *      rendered here verbatim.
 *   3. IT REPORTED NOWHERE. console.error only. A dashboard crashing for
 *      every user was invisible to /dashboard/system-health, while the
 *      machinery to report it (/api/client-error, used by WidgetBoundary)
 *      already existed.
 *
 * The digest replaces the message: it is the value that matches the
 * server log entry, and it is the only thing support could ask a user for.
 */
export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("errors.boundary");

  useEffect(() => {
    console.error(error);
    void fetch("/api/client-error", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: error.message,
        stack: error.stack?.slice(0, 4000),
        component: "dashboard",
      }),
      keepalive: true,
    }).catch(() => {
      // A failed report must not cascade.
    });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div
        role="alert"
        className="w-full max-w-md rounded-2xl border border-red-500/30 bg-red-500/[0.04] p-6"
      >
        <p className="flex items-center gap-2 text-base font-semibold text-foreground">
          <AlertTriangle className="h-5 w-5 shrink-0 text-red-400" aria-hidden="true" />
          {t("title")}
        </p>
        <p className="mt-2 text-sm text-muted">{t("body")}</p>
        <button
          type="button"
          onClick={() => reset()}
          className="mt-5 inline-flex min-h-[44px] items-center justify-center rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-black transition-opacity hover:opacity-90"
        >
          {t("reload")}
        </button>
        {error.digest ? (
          <p className="mt-4 font-mono text-[11px] text-muted/70">{error.digest}</p>
        ) : null}
      </div>
    </div>
  );
}
