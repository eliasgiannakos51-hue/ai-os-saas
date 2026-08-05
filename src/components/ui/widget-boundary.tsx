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
    return (
      <div
        role="alert"
        className="rounded-2xl border border-red-500/30 bg-red-500/[0.04] p-4 text-xs text-muted"
      >
        <p className="flex items-center gap-2 font-medium text-red-300">
          <AlertTriangle className="h-4 w-4" aria-hidden="true" />
          This section could not be displayed.
        </p>
        <p className="mt-1">The rest of the page is unaffected. Reloading usually fixes it.</p>
      </div>
    );
  }
}
