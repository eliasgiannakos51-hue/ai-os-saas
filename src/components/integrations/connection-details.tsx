"use client";
import { Check, X, Clock, Unplug } from "lucide-react";

/**
 * WHAT ONE CONNECTION IS ALLOWED TO DO, WHAT IT IS NOT, WHEN IT LAST DID
 * ANYTHING, AND THE BUTTON THAT ENDS IT.
 *
 * THIS IS SHARED ON PURPOSE AND IT IS SHARED BEFORE IT HAS TWO CALLERS.
 * The owner's directive 24 asked for this block «όπως στο Gmail» — like
 * Gmail's. Gmail does not have it. What Gmail has today is one
 * «Τι βλέπει το AI» line (dashboard.integrations.providers.<key>.sees) and
 * a Disconnect in a menu; the four-part pane is the pending Connect
 * redesign, docs/QUEUE.md's CN1, tasks #181-#183. So the correction is
 * written down (docs/NEEDS-FROM-ELIAS.md) and the block is built HERE, as
 * a component with no Telegram in it, so that CN1 adopts this file for
 * Gmail, Drive, Calendar and Slack rather than finding a Telegram-shaped
 * fork and copying it four times.
 *
 * PRESENTATIONAL ONLY: every string arrives already translated. The i18n
 * slicer cannot follow a key built at run time, so the `t()` calls stay at
 * the call site where the keys are literal, and this file holds no
 * namespace of its own.
 *
 * NO FILLED ACCENT BUTTON IN HERE. /dashboard/integrations spends its one
 * white button (bg-button, scripts/tests/one-primary-action.test.mjs) on
 * the OAuth consent panel's «Έγκριση» — the press that hands an AI your
 * mail. Disconnect is the quiet, reversible one and is drawn as such.
 *
 * THE DISCONNECT IS OPTIONAL, and that was found by looking at the first
 * screenshot of this block rather than at its code. The same three panes
 * are shown BEFORE agreeing — so a person can read what a connection may
 * do before making one — and there the button was still rendering, in red,
 * with an unplug icon, over the words «Όχι τώρα». There is nothing to
 * disconnect at that point: the way out of a consent step is a plain
 * refusal and belongs beside the agreement, not dressed as an undo of
 * something that has not happened. Left out, this block renders the three
 * panes and stops.
 */
export function ConnectionDetails({
  canTitle,
  can,
  cannotTitle,
  cannot,
  activityTitle,
  activityLines,
  activityEmpty,
  disconnectLabel,
  disconnectBusyLabel,
  onDisconnect,
  disconnecting = false,
  testId = "connection-details",
}: {
  canTitle: string;
  can: readonly string[];
  cannotTitle: string;
  cannot: readonly string[];
  activityTitle: string;
  /** Already formatted, newest first. Empty is the normal first state, not
   *  an error: a connection that has not been used has nothing to show. */
  activityLines: readonly string[];
  activityEmpty: string;
  /** All three together, or none: a block with no connection yet shows
   *  the panes and no button. */
  disconnectLabel?: string;
  disconnectBusyLabel?: string;
  onDisconnect?: () => void;
  disconnecting?: boolean;
  testId?: string;
}) {
  return (
    <div className="space-y-4" data-testid={testId}>
      <div className="grid gap-4 sm:grid-cols-2">
        {/* CAN AND CANNOT SIDE BY SIDE, and on a phone one under the other.
            The pair is the point: a list of permissions with no list of
            refusals beside it reads as "and whatever else it feels like". */}
        <section aria-labelledby={`${testId}-can`}>
          <h3 id={`${testId}-can`} className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted">
            {canTitle}
          </h3>
          <ul className="space-y-1" data-testid={`${testId}-can-list`}>
            {can.map((line) => (
              <li key={line} className="flex gap-1.5 text-xs leading-relaxed text-body">
                <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" aria-hidden="true" />
                <span>{line}</span>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby={`${testId}-cannot`}>
          <h3 id={`${testId}-cannot`} className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted">
            {cannotTitle}
          </h3>
          <ul className="space-y-1" data-testid={`${testId}-cannot-list`}>
            {cannot.map((line) => (
              <li key={line} className="flex gap-1.5 text-xs leading-relaxed text-body">
                <X className="mt-0.5 h-3.5 w-3.5 shrink-0 text-danger/70" aria-hidden="true" />
                <span>{line}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section aria-labelledby={`${testId}-activity`}>
        <h3 id={`${testId}-activity`} className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted">
          <Clock className="h-3 w-3" aria-hidden="true" />
          {activityTitle}
        </h3>
        {activityLines.length === 0 ? (
          <p className="text-xs text-muted" data-testid={`${testId}-activity-empty`}>
            {activityEmpty}
          </p>
        ) : (
          <ul className="space-y-1" data-testid={`${testId}-activity-list`}>
            {activityLines.map((line) => (
              <li key={line} className="text-xs leading-relaxed text-body">
                {line}
              </li>
            ))}
          </ul>
        )}
      </section>

      {onDisconnect && disconnectLabel && (
        <button
          type="button"
          onClick={onDisconnect}
          disabled={disconnecting}
          data-testid={`${testId}-disconnect`}
          className="inline-flex min-h-[44px] items-center gap-1.5 rounded-item border border-border px-3 text-xs font-medium text-danger/80 transition-colors duration-150 hover:border-danger/40 hover:bg-danger/10 hover:text-danger disabled:opacity-50"
        >
          <Unplug className="h-3.5 w-3.5" aria-hidden="true" />
          {disconnecting ? disconnectBusyLabel ?? disconnectLabel : disconnectLabel}
        </button>
      )}
    </div>
  );
}
