import type { AgentRole } from "@/lib/agent-roles";

export type MissionStatus = "planning" | "in_progress" | "completed" | "failed";

export type MissionStepStatus = "pending" | "completed";

/**
 * A tickable piece of a larger step.
 *
 * Sub-steps are checked off by hand, not built by the classifier: they
 * exist because "Set up payments" is one loggable action but four real
 * chores, and a user who cannot tick off the first three has no way to
 * see progress inside a step that takes a week.
 *
 * The whole shape is optional on MissionStep, so every mission stored
 * before this existed keeps rendering exactly as it did — no migration,
 * no backfill.
 */
export type MissionSubstep = {
  text: string;
  status: MissionStepStatus;
};

export type MissionStep = {
  text: string;
  status: MissionStepStatus;
  // How much focus this step demands, assigned by the Planner. Read by
  // lib/mission-energy.ts to suggest what to pick up given the user's
  // latest energy check-in. Absent on missions planned before this
  // existed — treated as "medium" rather than guessed at.
  effort?: "light" | "medium" | "deep";
  // Filled in from /api/create's response once "Create with AI" succeeds
  // for this step — the Planner never assigns a module itself, Create
  // Anything's own classifier decides it at build time.
  module?: string;
  moduleTitleKey?: string;
  href?: string;
  // "AI Company" — which agent role (see lib/agent-roles.ts) this step was
  // built under, chosen per-step in mission-card.tsx before "Create with
  // AI". Absent (or "general") means the default classifier behavior, same
  // as every step before this feature existed.
  agentRole?: AgentRole;
  // Real agent-to-agent collaboration: a short summary of what this step
  // actually produced (record fields + the AI's own message), captured
  // from /api/create's response once the step completes. Fed back in as
  // context to every later step in the same mission (see mission-card.tsx's
  // buildStep) so e.g. a Finance Agent step can see numbers a prior
  // Marketing Agent step produced.
  output?: string;
  // Mission Control retry: number of failed "Create with AI" attempts for
  // this step so far, persisted so the 3-attempt cap survives page
  // reloads. Absent/0 means never failed.
  attempts?: number;
  // What you will have once this step is done. The Planner is asked for
  // it explicitly, because "Analyse the market" and "Analyse the market
  // → you will have 5 competitors with their prices logged" are the
  // difference between a step you can act on and one you skip.
  outcome?: string;
  // The Planner's own rough estimate, in minutes. Shown as a range-ish
  // hint next to the step, never as a countdown.
  estimatedMinutes?: number;
  // Only present for steps the Planner judged big enough to break down.
  substeps?: MissionSubstep[];
};

// The ai_missions.plan_steps jsonb column's shape — an object (steps +
// optional review), not a bare array, so the Reviewer's output has
// somewhere to persist without needing a new column beyond the ones
// given in the spec.
export type MissionPlan = {
  steps: MissionStep[];
  review?: string;
};

export type Mission = {
  id: string;
  user_id: string;
  goal: string;
  status: MissionStatus;
  plan_steps: MissionPlan | null;
  created_at: string;
  updated_at: string;
};
