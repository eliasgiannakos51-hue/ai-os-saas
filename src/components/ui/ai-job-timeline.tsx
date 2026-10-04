"use client";

import { useFormatter, useTranslations } from "next-intl";
import { stepLabelKey } from "@/lib/jobs/step-labels";
import type { ClientStep, EvidenceKey } from "@/lib/jobs/job-timeline";

// What a step found, by key — the worker stores a key and a number, never
// a sentence (lib/jobs/job-timeline.ts EVIDENCE_KEYS). Named rather than
// built from the key, so every message this can render is a literal.
const EVIDENCE_MESSAGE = {
  files: "timeline.evidence.files",
  parts: "timeline.evidence.parts",
  planSteps: "timeline.evidence.planSteps",
  sources: "timeline.evidence.sources",
  pages: "timeline.evidence.pages",
  photos: "timeline.evidence.photos",
} as const satisfies Record<EvidenceKey, string>;

/**
 * WHAT A JOB DID, STEP BY STEP — V6.2 2.1 (lib/jobs/job-timeline.ts).
 *
 * AiJobProgress says what is happening NOW and disappears when the job
 * ends. This stays: each step the worker reported, how long it took, and
 * — once the job is charged — the credits it accounted for, which add up
 * to the charge because they are that charge, split. While the job runs a
 * step shows no credits at all rather than a guess.
 *
 * Renders nothing for a job with no recorded steps: an un-migrated
 * database, or a job from before the timeline existed.
 */
export function AiJobTimeline({
  job,
  labelFor,
  className = "",
}: {
  // A background job (lib/jobs/use-ai-job), or anything else that keeps
  // the same steps — Deep Research does (lib/research/research-timeline).
  job: { kind: string; timeline?: ClientStep[] } | null;
  // For a caller whose labels are its own keys rather than JOB_STEPS.
  // Returns null to fall through to the job wording, or the raw label.
  labelFor?: (label: string | null) => string | null;
  className?: string;
}) {
  // NAMESPACED, so the dashboard's message slice can be bounded
  // (scripts/tests/message-slices.test.mjs): the step labels live under
  // aiSteps, the credits string under settings.billing.
  const tSteps = useTranslations("aiSteps");
  const tBilling = useTranslations("settings.billing");
  const format = useFormatter();
  const steps = job?.timeline ?? [];
  if (!job || steps.length === 0) return null;

  return (
    <details className={`text-xs text-muted ${className}`} data-testid="ai-job-timeline">
      <summary className="cursor-pointer select-none py-1">{tSteps("timeline.title")}</summary>
      <ol className="mt-1 space-y-1 border-s border-border ps-3">
        {steps.map((s) => {
          const key = stepLabelKey(job.kind, s.label);
          return (
            <li key={`${s.step}-${s.startedAt}`} className="flex flex-wrap items-baseline gap-x-2" data-testid="ai-job-timeline-step">
              <span className="text-foreground">
                {labelFor?.(s.label) ?? (key ? tSteps(key.slice("aiSteps.".length) as never) : s.label)}
              </span>
              {s.evidence && EVIDENCE_MESSAGE[s.evidence.key] && (
                <span>{tSteps(EVIDENCE_MESSAGE[s.evidence.key], { count: s.evidence.count })}</span>
              )}
              <span className="tabular-nums">
                {s.seconds === null
                  ? tSteps("timeline.running")
                  : format.number(s.seconds, { style: "unit", unit: "second", unitDisplay: "short" })}
              </span>
              {s.credits !== null && (
                <span className="tabular-nums">{tBilling("creditsAmount", { count: s.credits })}</span>
              )}
            </li>
          );
        })}
      </ol>
    </details>
  );
}
