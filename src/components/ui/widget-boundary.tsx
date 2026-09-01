"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle } from "lucide-react";

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
 * TRANSLATED, AND THAT IS WHY THE STRINGS ARE PROPS. Being a class it
 * cannot call useTranslations. Its two
 * sentences were hard-coded English in a product that ships in ten
 * languages, and the one screen a person sees when something breaks was
 * the one screen that was not translated. The caller resolves them (the
 * dashboard pages are server components with getTranslations) and hands
 * them down.
 *
 * They default to nothing rather than to English: a boundary rendered
 * without them shows the icon and no claim, which is honest, instead of
 * showing a language the reader did not choose.
 */
export class WidgetBoundary extends Component<
  { children: ReactNode; label?: string; title?: string; body?: string },
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
    return (
      /* data-widget-boundary IS A MARKER FOR TESTS, and it earns its
         place. A check that asks "did a widget fall back?" by selecting
         [role="alert"] gets an answer about the furniture: eight
         components use that role, and the offline banner is on every
         page — so it reported all five pages as broken. This attribute
         names the one thing being asked about. */
      <div
        role="alert"
        data-widget-boundary="failed"
        className="rounded-2xl border border-red-500/30 bg-red-500/[0.04] p-4 text-xs text-muted"
      >
        <p className="flex items-center gap-2 font-medium text-red-300">
          <AlertTriangle className="h-4 w-4" aria-hidden="true" />
          {this.props.title}
        </p>
        {this.props.body ? <p className="mt-1">{this.props.body}</p> : null}
      </div>
    );
  }
}
