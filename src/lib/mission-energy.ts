import type { MissionStep } from "@/types/mission";

// Energy-based step suggestion.
//
// The energy check-in already existed (user_energy_checkins, the Overview
// widget) but nothing ever READ it except the AI Life Context blurb. This
// turns it into a decision: given how someone says they feel right now,
// which of their open steps is the one to pick up.
//
// The rule is the obvious one and it is deliberately not cleverer than
// that: hard things when there is energy for them, light things when
// there is not. What matters is that it degrades honestly — no check-in
// means no suggestion at all, rather than a confident recommendation
// derived from nothing.

/** How much focus a step demands. Assigned by the Planner per step.
 *
 *  Declared here as well as in lib/mission-agents.ts on purpose: that
 *  module PRODUCES the field and this one CONSUMES it, so importing
 *  across would make the planner depend on a suggestion feature it knows
 *  nothing about. scripts/tests/mission-energy.test.mjs asserts the two
 *  lists are identical, which is the guard against them drifting. */
export type StepEffort = "light" | "medium" | "deep";

export const STEP_EFFORTS: StepEffort[] = ["light", "medium", "deep"];

export function isStepEffort(value: unknown): value is StepEffort {
  return typeof value === "string" && (STEP_EFFORTS as string[]).includes(value);
}

// The check-in is a 1-5 scale (see components/overview/energy-checkin-widget.tsx).
export const ENERGY_MIN = 1;
export const ENERGY_MAX = 5;

/**
 * Which effort level suits this energy level.
 *
 * The bands are asymmetric on purpose. At 4-5 a person can do anything,
 * so `deep` is preferred but nothing is excluded. At 1-2 the honest
 * answer is that deep work will not happen, so it is excluded rather than
 * merely deprioritized — suggesting a two-hour analysis task to someone
 * who just said they are running on empty is how a feature like this
 * loses trust in one interaction.
 */
export function effortsForEnergy(energyLevel: number): {
  preferred: StepEffort;
  acceptable: StepEffort[];
} {
  const level = Math.min(ENERGY_MAX, Math.max(ENERGY_MIN, Math.round(energyLevel)));
  if (level >= 4) return { preferred: "deep", acceptable: ["deep", "medium", "light"] };
  if (level === 3) return { preferred: "medium", acceptable: ["medium", "light", "deep"] };
  return { preferred: "light", acceptable: ["light", "medium"] };
}

/** A step's effort, defaulting to medium when the Planner did not say. */
export function stepEffort(step: MissionStep): StepEffort {
  return isStepEffort(step.effort) ? step.effort : "medium";
}

export type EnergySuggestion = {
  /** Open steps ordered best-first for the current energy level. */
  ranked: MissionStep[];
  /** The single step to lead with, or null when there is nothing to suggest. */
  top: MissionStep | null;
  preferred: StepEffort;
  /** Steps deliberately held back as too demanding for right now. */
  heldBack: MissionStep[];
};

/**
 * Ranks a mission's open steps against the latest energy check-in.
 *
 * Returns null — not an empty suggestion — when there is no check-in.
 * The caller shows nothing at all in that case, because "here is what to
 * do based on your energy" is a lie when we do not know their energy.
 */
export function suggestStepsForEnergy(
  steps: MissionStep[],
  energyLevel: number | null | undefined
): EnergySuggestion | null {
  if (typeof energyLevel !== "number" || !Number.isFinite(energyLevel)) return null;

  const open = steps.filter((s) => s.status !== "completed");
  if (open.length === 0) return null;

  const { preferred, acceptable } = effortsForEnergy(energyLevel);

  // Rank by how well the effort matches, then keep the mission's own
  // order within a band — the Planner sequenced these steps for a reason,
  // and energy is a tie-breaker, not a re-plan.
  const rank = (s: MissionStep) => {
    const idx = acceptable.indexOf(stepEffort(s));
    return idx === -1 ? Number.MAX_SAFE_INTEGER : idx;
  };
  const ranked = open
    .map((s, i) => ({ s, i }))
    .sort((a, b) => rank(a.s) - rank(b.s) || a.i - b.i)
    .map(({ s }) => s);

  const heldBack = open.filter((s) => !acceptable.includes(stepEffort(s)));
  const suggestible = ranked.filter((s) => acceptable.includes(stepEffort(s)));

  return {
    ranked,
    top: suggestible[0] ?? null,
    preferred,
    heldBack,
  };
}
