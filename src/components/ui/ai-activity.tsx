"use client";

import { useTranslations } from "next-intl";
import { stepsFor, type AiActionKind } from "@/lib/jobs/ai-steps";
import type { JobKind } from "@/lib/jobs/job-types";

/**
 * "Looking for the information…" instead of a rotating circle.
 *
 * The spinner is still here, deliberately — motion is what tells a person
 * the app has not frozen, and taking it away to replace it with static
 * text trades one problem for another. What changes is that it is no
 * longer the ONLY thing on screen: the words next to it say which of the
 * several-second things the app is currently doing, which is the
 * difference between a four-second wait that reads as thinking and one
 * that reads as broken.
 *
 * `stepIndex` comes from something real — a job row's step counter, a
 * stream's first token, an upload completing. It is never a timer. When
 * the caller has nothing to advance on it stays at 0 and the first step is
 * shown for the whole wait, which is honest; see lib/jobs/ai-steps.ts.
 */
export function AiActivity({
  kind,
  stepIndex = 0,
  className = "",
}: {
  kind: AiActionKind | JobKind;
  stepIndex?: number;
  className?: string;
}) {
  const t = useTranslations("aiSteps");
  const steps = stepsFor(kind);
  const code = steps[Math.min(Math.max(stepIndex, 0), steps.length - 1)];

  return (
    <span
      className={`inline-flex items-center gap-2 text-xs text-muted ${className}`}
      // Announced politely: a screen reader should hear what is happening
      // without having the current focus yanked away mid-action.
      role="status"
      aria-live="polite"
    >
      <span
        aria-hidden="true"
        className="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-orange-500/30 border-t-orange-400"
      />
      {code ? t(code) : null}
      {steps.length > 1 && (
        <span className="text-muted/60">
          {t("counter", { step: Math.min(stepIndex + 1, steps.length), total: steps.length })}
        </span>
      )}
    </span>
  );
}
