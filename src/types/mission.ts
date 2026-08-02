import type { AgentRole } from "@/lib/agent-roles";

export type MissionStatus = "planning" | "in_progress" | "completed" | "failed";

export type MissionStepStatus = "pending" | "completed";

export type MissionStep = {
  text: string;
  status: MissionStepStatus;
  // Filled in from /api/create's response once "Create with AI" succeeds
  // for this step — the Planner never assigns a module itself, Create
  // Anything's own classifier decides it at build time.
  module?: string;
  moduleTitle?: string;
  href?: string;
  // "AI Company" — which agent role (see lib/agent-roles.ts) this step was
  // built under, chosen per-step in mission-card.tsx before "Create with
  // AI". Absent (or "general") means the default classifier behavior, same
  // as every step before this feature existed.
  agentRole?: AgentRole;
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
