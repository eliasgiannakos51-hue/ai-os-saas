import type { MissionPlan } from "@/types/mission";
import { MAX_PROPOSED_ACTIONS, type ProposedAction } from "@/lib/meetings/meeting-analysis";

/**
 * A MEETING'S ACTIONS BECOME THE STEPS OF A GOAL, INSIDE A PROJECT
 * (MASTER 16, package 17: «ανεβάζω ηχογράφηση, παίρνω περίληψη και
 * ενέργειες, και τις κάνω βήματα σε έναν στόχο μέσα σε ένα έργο»), behind
 * the switch "meeting-goal".
 *
 * A goal is an ai_missions row — the same row Mission Control plans and
 * shows — and its steps are the actions the person ticked, in the order
 * the meeting proposed them, each saying who and when as the meeting did.
 * Nothing is planned by a model and nothing is charged: the meeting was
 * already analysed, and the steps are its own words.
 *
 * THE ROUTE RE-READS THE ACTIONS BY INDEX (api/meetings/[id]/goal), as
 * api/meetings/[id]/actions does: the browser sends which, never what, so
 * a goal cannot carry a sentence the meeting did not produce.
 *
 * Pure: scripts/tests/meeting-goal.test.mjs runs it.
 */

export const MAX_GOAL_CHARS = 500;

/** The indexes the person ticked: whole, in range, once each, in the meeting's order. */
export function chosenIndexes(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [];
  return [...new Set(raw.map((v) => Number(v)).filter((n) => Number.isInteger(n) && n >= 0 && n < MAX_PROPOSED_ACTIONS))].sort((a, b) => a - b);
}

/** One step, in the meeting's own words: what, then who and when when it said them. */
export function stepText(action: ProposedAction): string {
  const what = action.what.trim();
  const who = action.who?.trim();
  const when = action.when?.trim();
  return `${what}${who ? ` — ${who}` : ""}${when ? ` (${when})` : ""}`;
}

/** The goal's plan from the meeting's proposals; null when no chosen index holds an action. */
export function goalPlan(proposals: readonly ProposedAction[], indexes: readonly number[]): MissionPlan | null {
  const steps = indexes
    .map((i) => proposals[i])
    .filter((a): a is ProposedAction => Boolean(a) && typeof a.what === "string" && a.what.trim().length > 0)
    .map((a) => ({ text: stepText(a), status: "pending" as const }));
  return steps.length > 0 ? { steps } : null;
}

/** The goal as written, or the meeting's title when nothing was. */
export function goalText(raw: unknown, meetingTitle: string): string {
  const written = typeof raw === "string" ? raw.replace(/\s+/g, " ").trim() : "";
  return (written || meetingTitle.trim()).slice(0, MAX_GOAL_CHARS);
}
