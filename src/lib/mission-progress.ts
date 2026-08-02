import type { Mission, MissionStep } from "@/types/mission";

export const MISSION_STALE_MS = 3 * 24 * 60 * 60 * 1000;

// A mission reads as "stuck" once it's been sitting "in_progress" with no
// step completed for more than 3 days — mission.updated_at only moves
// when a step's own update touches the row (see mission-card.tsx's
// buildStep) or the Reviewer runs, so its age doubles as "time since last
// real progress" without needing a per-step timestamp. The step to point
// at is simply the next one still pending — whichever one is actually
// blocking further progress.
export function getStuckStep(mission: Mission): MissionStep | null {
  if (mission.status !== "in_progress") return null;
  const staleMs = Date.now() - new Date(mission.updated_at).getTime();
  if (staleMs < MISSION_STALE_MS) return null;
  const steps = mission.plan_steps?.steps ?? [];
  return steps.find((s) => s.status === "pending") ?? null;
}

// Active Missions widget (Home page) — "active" means still being worked
// on, not finished or abandoned.
export function isActiveMission(mission: Mission): boolean {
  return mission.status === "planning" || mission.status === "in_progress";
}

export function missionProgressPercent(mission: Mission): number {
  const steps = mission.plan_steps?.steps ?? [];
  if (steps.length === 0) return 0;
  const completed = steps.filter((s) => s.status === "completed").length;
  return Math.round((completed / steps.length) * 100);
}
