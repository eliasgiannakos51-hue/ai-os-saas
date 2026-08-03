import type { AgentRole } from "@/lib/agent-roles";

export type ScheduledAgentRunStatus = "pending" | "completed" | "failed";

// A single "Schedule for tomorrow" click on a Mission Control step (see
// components/mission/mission-card.tsx) — approved by the user at schedule
// time, executed later by api/cron/scheduled-runs/route.ts, never
// autonomous beyond that one already-picked action.
export type ScheduledAgentRun = {
  id: string;
  user_id: string;
  mission_id: string;
  // Denormalized: Mission Control's steps live inside ai_missions.plan_steps
  // (jsonb), not as their own rows — step_index/step_text are what let the
  // cron job know which step to write the result back to and what to
  // actually build, without depending on plan_steps' shape staying
  // identical between scheduling and execution.
  step_index: number;
  step_text: string;
  agent_role: AgentRole;
  status: ScheduledAgentRunStatus;
  result: string | null;
  scheduled_for: string;
  executed_at: string | null;
  created_at: string;
};
