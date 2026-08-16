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
  className = "",
}: {
  job: AiJob | null;
  className?: string;
}) {
  const t = useTranslations();

  if (!job || (job.status !== "queued" && job.status !== "running")) return null;

  const key = stepLabelKey(job.kind, job.stepLabel);
  // No step reported yet means QUEUED — the worker has not claimed it.
  // Saying "reading" here would be inventing the first step before it has
  // begun, which is exactly the lie the step counter exists to prevent.
  const label = key ? t(key) : t("aiSteps.starting");

  return (
    <span className={`inline-flex flex-wrap items-center gap-x-2 gap-y-1 ${className}`}>
      <ThinkingIndicator label={label} />
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
