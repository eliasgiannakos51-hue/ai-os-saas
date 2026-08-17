"use client";

import { useTranslations } from "next-intl";
import { stepsFor, type AiActionKind } from "@/lib/jobs/ai-steps";
import type { JobKind } from "@/lib/jobs/job-types";
import { ThinkingIndicator } from "@/components/ui/thinking-indicator";

/**
 * "Looking for the information…" instead of a rotating circle.
 *
 * Motion is still here, deliberately — it is what tells a person the app
 * has not frozen, and taking it away to replace it with static text trades
 * one problem for another. What changes is that it is no longer the ONLY
 * thing on screen: the words next to it say which of the several-second
 * things the app is currently doing, which is the difference between a
 * four-second wait that reads as thinking and one that reads as broken.
 *
 * The motion is ThinkingIndicator, not a spinner. A rotating circle is the
 * symbol for "a request is in flight" and it is used for saving, loading
 * and uploading everywhere else in this app; a model composing an answer
 * is a different kind of wait and looks like one. It sits BESIDE the step
 * words rather than replacing them — see components/ui/thinking-indicator.tsx.
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
      <ThinkingIndicator size="sm" />
      {code ? t(code) : null}
      {steps.length > 1 && (
        <span className="text-muted/60">
          {t("counter", { step: Math.min(stepIndex + 1, steps.length), total: steps.length })}
        </span>
      )}
    </span>
  );
}
