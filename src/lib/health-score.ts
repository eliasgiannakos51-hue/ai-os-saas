import { DAY_MS } from "@/lib/time-constants";

// How long each recency-style factor takes to decay to 0 — kept in one
// place so the four factors share a coherent time horizon rather than
// each picking an arbitrary window.
const RECENCY_FULL_DECAY_DAYS = 14;
const MISSION_STEPS_TARGET = 5;
/**
 * The window "activeDaysThisWeek" is counted over.
 *
 * EXPORTED, because lib/user-context.ts is what COUNTS those days and had
 * its own copy of the 7. Two files agreeing about the size of the window
 * only by coincidence is how a score comes to be computed over a
 * different period than the one it is scaled against.
 */
export const CONSISTENCY_WINDOW_DAYS = 7;

export type HealthScoreFactor = "recency" | "coverage" | "missionSteps" | "consistency";

export type HealthScoreLabel =
  | "justStarting"
  | "buildingMomentum"
  | "strongProgress"
  | "excellentConsistency";

export type HealthScoreInput = {
  // Timestamp (ms) of the single most recent entry across every module,
  // or null if the account has never created one.
  lastActivityMs: number | null;
  modulesWithActivity: number;
  totalModules: number;
  // Mission steps marked "completed" in missions touched in the last
  // RECENCY_FULL_DECAY_DAYS days — see overview/page.tsx for why this is
  // an approximation (ai_missions has no per-step completed_at).
  missionStepsCompletedRecent: number;
  // How many of the last CONSISTENCY_WINDOW_DAYS days had >=1 new entry
  // in any module.
  activeDaysThisWeek: number;
};

export type HealthScoreResult = {
  score: number;
  label: HealthScoreLabel;
  weakestFactor: HealthScoreFactor;
  factors: Record<HealthScoreFactor, number>;
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function labelFor(score: number): HealthScoreLabel {
  if (score <= 30) return "justStarting";
  if (score <= 60) return "buildingMomentum";
  if (score <= 85) return "strongProgress";
  return "excellentConsistency";
}

// Pure calculation, no I/O and no AI call — every input is a plain number
// or timestamp the caller already has from its own DB queries (see
// overview/page.tsx). Four factors, weighted 25% each per the spec.
export function computeHealthScore(input: HealthScoreInput): HealthScoreResult {
  const recency =
    input.lastActivityMs === null
      ? 0
      : clamp(
          100 - ((Date.now() - input.lastActivityMs) / DAY_MS) * (100 / RECENCY_FULL_DECAY_DAYS),
          0,
          100
        );

  const coverage =
    input.totalModules === 0 ? 0 : clamp((input.modulesWithActivity / input.totalModules) * 100, 0, 100);

  const missionSteps = clamp(
    (input.missionStepsCompletedRecent / MISSION_STEPS_TARGET) * 100,
    0,
    100
  );

  const consistency = clamp(
    (input.activeDaysThisWeek / CONSISTENCY_WINDOW_DAYS) * 100,
    0,
    100
  );

  const factors: Record<HealthScoreFactor, number> = { recency, coverage, missionSteps, consistency };

  const score = Math.round((recency + coverage + missionSteps + consistency) / 4);

  // Fixed factor order breaks ties deterministically rather than picking
  // whichever happened to iterate first.
  const order: HealthScoreFactor[] = ["recency", "coverage", "missionSteps", "consistency"];
  const weakestFactor = order.reduce((weakest, factor) =>
    factors[factor] < factors[weakest] ? factor : weakest
  );

  return { score, label: labelFor(score), weakestFactor, factors };
}
