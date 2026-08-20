"use client";

import { useTranslations } from "next-intl";
import { ThinkingIndicator } from "@/components/ui/thinking-indicator";
import { stepLabelKey } from "@/lib/jobs/step-labels";
import type { AiJob } from "@/lib/jobs/use-ai-job";

/**
 * "Ψάχνω πληροφορίες…" instead of a spinner.
 *
 * One component for all five background kinds, because the alternative is
 * what was there: five different answers to the same question, four of
 * which were "nothing". It renders the job's OWN reported step, so the
 * line changes when the work moves and stops changing when the work
 * stops — the property a timer-driven progress bar cannot have, and the
 * reason a stuck job is visible here rather than disguised.
 *
 * Returns null when nothing is running. Not a placeholder, not a zero
 * percent bar: a component that renders reassurance while nothing is
 * happening is the thing this replaces.
 */
export function AiJobProgress({
  job,
  watchLost = false,
  className = "",
}: {
  job: AiJob | null;
  /** From useAiJob: the polls cannot SEE the job at all. On the broken
   *  deployment that was a missing ai_jobs RLS policy — builds succeeded
   *  while this component rendered null, forever. Saying so is the
   *  difference between a diagnosable failure and a silent one. */
  watchLost?: boolean;
  className?: string;
}) {
  const t = useTranslations();

  if (watchLost && (!job || job.status === "queued" || job.status === "running")) {
    return (
      <span className={`text-[11px] text-amber-400 ${className}`} data-testid="ai-progress-watch-lost">
        {t("aiSteps.watchFailed")}
      </span>
    );
  }

  if (!job || (job.status !== "queued" && job.status !== "running")) return null;

  const key = stepLabelKey(job.kind, job.stepLabel);
  // No step reported yet means QUEUED — the worker has not claimed it.
  // Saying "reading" here would be inventing the first step before it has
  // begun, which is exactly the lie the step counter exists to prevent.
  const label = key ? t(key) : t("aiSteps.starting");

  return (
    <span className={`inline-flex flex-wrap items-center gap-x-2 gap-y-1 ${className}`}>
      <ThinkingIndicator />
      {/* THE SENTENCE, VISIBLE. This component used to hand `label` to
          ThinkingIndicator, which renders it as aria-label ONLY — for
          screen readers, by design. Every sighted user therefore saw the
          little constellation and nothing else, on every surface that
          uses this component: the exact "I don't see the steps" report.
          The step label is the point of this component; it renders as
          text, and the drawing decorates it (so it carries no aria-label
          of its own — announcing the same sentence twice is worse than
          once). aria-live so a screen reader hears the step CHANGE too. */}
      <span className="text-xs text-muted" aria-live="polite" data-testid="ai-progress-step">
        {label}
      </span>
      {/* The counter is the honest half of the pair: "2/4" says how much
          is left in a way a sentence cannot, and it comes from the same
          row, so it cannot run ahead of the label. Hidden until the first
          step lands, because "0/4" is noise. */}
      {job.step > 0 && job.stepTotal > 0 && (
        <span className="text-[11px] tabular-nums text-muted">
          {job.step}/{job.stepTotal}
        </span>
      )}
    </span>
  );
}
