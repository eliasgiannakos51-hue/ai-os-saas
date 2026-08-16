import { JOB_STEPS, type JobKind } from "@/lib/jobs/job-types";

/**
 * What a background job is doing right now, in words the user has a
 * reason to care about.
 *
 * THE DATA WAS ALREADY THERE. Every worker writes its real step to
 * `ai_jobs.step_label` as it passes it (lib/jobs/run-job.ts) — not a
 * timer, not a guess, a row that changes when something actually
 * finishes. Four of the five kinds then threw it away at the last
 * moment:
 *
 *   mission_plan  captured it into React state and never rendered it
 *   agent_build   showed one static "Designing…" for four real steps
 *   agent_run     showed no text at all, only a pulsing badge
 *   create        showed a bare spinner
 *
 * Only file_ask displayed it, and it did so by hand-rolling its own
 * three-entry map inside the component. This is that map, moved out and
 * made total: one place, all five kinds, so the sixth kind cannot ship
 * without one.
 *
 * NOT THE RAW TOKEN. "drafting", "synthesising", "delivering" are worker
 * vocabulary — fine in a database column, wrong on a screen. They are
 * also English, and a Greek user watching a Greek page is not owed an
 * English progress line. So the token is a KEY, never a label.
 *
 * PER KIND, not one shared table, because the same token means different
 * things: "reading" is reading YOUR FILES in file_ask and reading YOUR
 * MODULES in mission_plan, and a label that fits both would say neither.
 */
export type StepLabelKey = `aiSteps.${string}`;

/**
 * The key for one worker-reported step.
 *
 * Returns null for a label this kind does not declare — including the
 * null a job carries before it has finished its first step. The caller
 * shows aiSteps.starting for that, which is true: it is queued, and
 * saying "reading" before anything has been read would be the fake
 * progress this whole mechanism exists to avoid.
 */
export function stepLabelKey(kind: string, stepLabel: string | null): StepLabelKey | null {
  if (!stepLabel) return null;
  const steps = JOB_STEPS[kind as JobKind];
  if (!steps || !steps.includes(stepLabel)) return null;
  return `aiSteps.${kind}.${stepLabel}`;
}

/** Every key the catalogue must carry — the check reads this, not a list
 *  typed out a second time, so a new step in JOB_STEPS fails loudly. */
export function allStepLabelKeys(): StepLabelKey[] {
  return (Object.keys(JOB_STEPS) as JobKind[]).flatMap((kind) =>
    JOB_STEPS[kind].map((step) => `aiSteps.${kind}.${step}` as StepLabelKey)
  );
}
