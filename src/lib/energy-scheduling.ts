import type { MissionStep } from "@/types/mission";

/**
 * Matching work to how much is left in the tank.
 *
 * The energy check-in has existed since "AI Life Context" needed one as
 * an input. It was recorded, shown back, and passed to the chat prompt —
 * and nothing in the product ever ACTED on it. This is the part that
 * does: given today's level, which of a mission's steps is the one to
 * pick up now.
 *
 * Pure and client-safe on purpose. No database, no model call. Deciding
 * "you have three hours of focus, do the hard one" does not need an AI
 * call, and one here would put a credit charge and a spinner in front of
 * a suggestion that has to be instant to be used at all.
 *
 * TWO RULES SHAPE EVERYTHING BELOW, and both are about not being
 * annoying enough to get switched off:
 *
 *   STALE ENERGY IS WORSE THAN NONE. A check-in from Tuesday tells you
 *   nothing about Thursday, and acting on it produces confident advice
 *   built on a stale premise — which is more damaging than a blank
 *   space, because the user cannot see the premise. Only today's
 *   check-in is used; otherwise the product asks rather than guesses.
 *
 *   IT SUGGESTS, IT NEVER REORDERS. A plan's order carries dependencies
 *   the planner chose. Shuffling somebody's steps because they slept
 *   badly would break the plan to serve the mood. The order stays; one
 *   step is marked as the good one to start with, and the reason is
 *   said out loud so it can be disagreed with.
 */

export type StepDemand = "light" | "moderate" | "deep";

/** Energy is recorded 1-5 by the check-in widget. */
export type EnergyLevel = 1 | 2 | 3 | 4 | 5;

/**
 * How much a step is going to take out of somebody.
 *
 * Derived from what the planner already produced rather than from a new
 * field the planner would have to be asked for: the time estimate and
 * whether the step was big enough to be broken into substeps. Adding a
 * `demand` field to the planner's tool schema would have been more
 * direct and would also mean every existing mission — every plan already
 * saved — has no demand at all. Deriving it means this works on the
 * missions people already have.
 */
export function stepDemand(step: MissionStep): StepDemand {
  const minutes = typeof step.estimatedMinutes === "number" ? step.estimatedMinutes : 0;
  const substeps = Array.isArray(step.substeps) ? step.substeps.length : 0;

  // Substeps are the stronger signal. The planner only breaks a step
  // down when it judged it big, so three substeps means "big" whatever
  // the optimistic minute estimate says — and minute estimates are
  // optimistic.
  if (substeps >= 3 || minutes >= 90) return "deep";
  if (substeps >= 1 || minutes >= 30) return "moderate";
  return "light";
}

/**
 * What to attempt at this level.
 *
 * Deliberately GENEROUS downward and strict upward: at high energy
 * everything is available, because telling somebody with a clear
 * afternoon that a ten-minute task is beneath them is absurd. At low
 * energy only the light work is suggested, because that is the entire
 * point — the failure mode this prevents is opening a three-hour task at
 * 5pm on a bad day, bouncing off it, and finishing the day having done
 * nothing at all.
 */
export function demandsForEnergy(level: EnergyLevel): StepDemand[] {
  if (level <= 2) return ["light"];
  if (level === 3) return ["light", "moderate"];
  return ["light", "moderate", "deep"];
}

export function stepSuitsEnergy(step: MissionStep, level: EnergyLevel): boolean {
  return demandsForEnergy(level).includes(stepDemand(step));
}

/** Is this check-in still worth acting on? Same calendar day in the
 *  VIEWER's timezone, which is why the comparison is on local date parts
 *  rather than on an hour difference: a check-in at 23:00 is not advice
 *  about the following afternoon, however few hours ago it was. */
export function isCheckInFresh(createdAt: string, now: Date = new Date()): boolean {
  const when = new Date(createdAt);
  if (Number.isNaN(when.getTime())) return false;
  return (
    when.getFullYear() === now.getFullYear() &&
    when.getMonth() === now.getMonth() &&
    when.getDate() === now.getDate()
  );
}

export type EnergySuggestion =
  | { kind: "no_checkin" }
  | { kind: "stale_checkin" }
  | { kind: "nothing_left" }
  | { kind: "step"; step: MissionStep; demand: StepDemand; index: number }
  | { kind: "all_too_heavy"; lightestDemand: StepDemand };

/**
 * The one step to start with, or an honest reason there isn't one.
 *
 * Every branch is a distinct thing to SAY, which is why this returns a
 * tagged result rather than `MissionStep | null`. "You have not checked
 * in", "your check-in is from yesterday", "everything left is heavier
 * than today" and "nothing is left" are four different situations, and
 * collapsing them into a null produces an empty panel that explains
 * none of them.
 */
export function suggestStepForEnergy(params: {
  steps: MissionStep[];
  level: EnergyLevel | null;
  checkInAt: string | null;
  now?: Date;
}): EnergySuggestion {
  const { steps, level, checkInAt } = params;

  if (level === null || checkInAt === null) return { kind: "no_checkin" };
  if (!isCheckInFresh(checkInAt, params.now)) return { kind: "stale_checkin" };

  const pending = steps
    .map((step, index) => ({ step, index }))
    // "pending", not "!completed": the status is a closed union, and
    // matching the value we want is what keeps a third status added
    // later from silently counting as unfinished work.
    .filter(({ step }) => step.status === "pending");

  if (pending.length === 0) return { kind: "nothing_left" };

  const allowed = demandsForEnergy(level);
  // FIRST match in plan order, not the lightest available. The order
  // encodes dependencies, so the earliest suitable step is the one that
  // actually unblocks the mission; picking the lightest would have
  // somebody doing step 9 while step 2 still blocks everything.
  const match = pending.find(({ step }) => allowed.includes(stepDemand(step)));
  if (match) {
    return { kind: "step", step: match.step, demand: stepDemand(match.step), index: match.index };
  }

  // Everything left is heavier than today. Said plainly, with what the
  // lightest thing actually is, because "come back tomorrow" is only
  // useful if it also says what tomorrow needs to look like.
  const order: StepDemand[] = ["light", "moderate", "deep"];
  const lightest = pending
    .map(({ step }) => stepDemand(step))
    .sort((a, b) => order.indexOf(a) - order.indexOf(b))[0];
  return { kind: "all_too_heavy", lightestDemand: lightest };
}
