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

/**
 * How many entries an account needs before the score is shown at all.
 *
 * FIVE, AND THE NUMBER IS MEASURED RATHER THAN CHOSEN. Running
 * computeHealthScore over a fresh account, entries spread two per day
 * across 19 modules and no missions:
 *
 *     entries   0    1    2    3    4    5    6    8   10   15   20
 *     score     0   30   31   36   37   42   44   50   56   70   75
 *     move          +30  +1   +5   +1   +5   +2   +6   +6  +14   +5
 *
 * The first entry moves the score THIRTY POINTS — a third of the scale,
 * on one action — because `recency` goes from 0 to 100 the moment
 * anything exists. A number that swings a third of its range on a single
 * event is reporting the last thing you did, not how the business is
 * going, and it flips the printed label from "just starting" to
 * "building momentum" on that same one entry.
 *
 * From five onwards the largest single-entry move is six points, so no
 * one action dominates. That is the property that makes it a measurement,
 * and five is where it starts holding.
 *
 * BELOW THIS, THERE IS NO SCORE — not a zero. Zero out of a hundred is a
 * verdict, and an account that has done nothing has not earned a verdict;
 * `recency` for an account with no entries is not "0% healthy", it is
 * unknown. overview/page.tsx shows setup progress instead.
 */
export const HEALTH_SCORE_MIN_ENTRIES = 5;

/**
 * Whether there is enough evidence to show a score at all.
 *
 * A function rather than a bare `>=` at the call site, so the rule has one
 * home and scripts/tests/no-score-without-data.test.mjs can execute it
 * instead of reading a comparison out of a page.
 */
export function hasEnoughDataForScore(totalEntries: number): boolean {
  return totalEntries >= HEALTH_SCORE_MIN_ENTRIES;
}

/**
 * How many entries before the little 7-day sparklines have a shape.
 *
 * THREE, and it is smaller than HEALTH_SCORE_MIN_ENTRIES on purpose: a
 * line needs points, not a stable average. Two entries on two days is a
 * segment and says nothing about a trend; three is the first count that
 * can bend. Below it the card shows a dashed rule and says what fills it,
 * rather than either an empty chart or — as it did before — no chart and
 * a card that quietly changed height.
 */
export const CHART_MIN_ENTRIES = 3;

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
