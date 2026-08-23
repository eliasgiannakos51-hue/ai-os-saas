"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import { useTranslations } from "next-intl";

/**
 * Error boundary scoped to a single widget.
 *
 * The dashboard already has a route-level error.tsx, but that replaces
 * the WHOLE page: one failing card takes down Home, the stats, the
 * timeline and everything else with it. This contains the failure to the
 * card that produced it, so the rest of the page keeps working.
 *
 * Must be a class component — React has no hook equivalent of
 * componentDidCatch.
 *
 * IT WAS EXPORTED AND NEVER IMPORTED. The paragraph above described a
 * protection the app did not have: nothing in src rendered this, so a
 * client widget that threw on Home still took the whole route down through
 * error.tsx, exactly the outcome this file says it prevents. It is now
 * mounted around the interactive widgets on Home — the ones whose render
 * can actually throw on the client.
 */
export class WidgetBoundary extends Component<
  { children: ReactNode; label?: string },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Reported to the server so a client-side crash lands in
    // production_errors alongside the API failures — a widget that throws
    // for every user is exactly the kind of outage this is meant to
    // surface, and it would otherwise be invisible.
    void fetch("/api/client-error", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: error.message,
        stack: error.stack?.slice(0, 4000),
        component: this.props.label ?? "widget",
        componentStack: info.componentStack?.slice(0, 2000),
      }),
      keepalive: true,
    }).catch(() => {
      // A failed report must not cascade.
    });
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return <WidgetFallback />;
  }
}

/**
 * The fallback, split out purely so it can be translated.
 *
 * useTranslations is a hook and the boundary has to be a class, so the two
 * cannot live in the same component. Both sentences were hardcoded English
 * — which meant the one message a user sees at the exact moment something
 * has already gone wrong was also the one message they might not be able
 * to read.
 */
function WidgetFallback() {
  const t = useTranslations("common.widgetError");
  return (
    <div
      role="alert"
      className="rounded-2xl border border-red-500/30 bg-red-500/[0.04] p-4 text-xs text-muted"
    >
      <p className="flex items-center gap-2 font-medium text-red-300">
        <AlertTriangle className="h-4 w-4" aria-hidden="true" />
        {t("title")}
      </p>
      <p className="mt-1">{t("body")}</p>
    </div>
  );
}

