import type { SupabaseClient } from "@supabase/supabase-js";
import type { Mission, MissionPlan, MissionStatus } from "@/types/mission";

export type PlanStepsUpdateResult =
  | { ok: true }
  | { ok: false; conflict: true }
  | { ok: false; conflict: false; error: unknown };

// Fixes a real race: two writers for the same mission (two tabs, or a live
// "Create with AI" click racing the daily cron's scheduled-run execution
// for a different step of the same mission) previously each read
// mission.plan_steps once, ran a many-second-to-minutes-long AI call, then
// blindly overwrote plan_steps with their own stale snapshot plus one
// step's change — whichever write landed second silently erased the
// first's completed step. This re-reads plan_steps immediately before
// writing and guards the write with the version it just read (ai_missions
// .plan_steps_version), so a write that lost the race returns
// conflict:true instead of corrupting data — same "atomic conditional
// write, never a blind overwrite" principle as deduct_credits_atomic and
// the website edit's editing_started_at claim.
export async function updateMissionPlanSteps(
  supabase: SupabaseClient,
  missionId: string,
  mutate: (current: { planSteps: MissionPlan; status: MissionStatus }) => {
    planSteps: MissionPlan;
    extraFields?: Record<string, unknown>;
  }
): Promise<PlanStepsUpdateResult> {
  const { data: current, error: readError } = await supabase
    .from("ai_missions")
    .select("plan_steps, plan_steps_version, status")
    .eq("id", missionId)
    .maybeSingle();
  if (readError || !current) {
    return { ok: false, conflict: false, error: readError ?? new Error("Mission not found.") };
  }

  const currentVersion = (current.plan_steps_version as number) ?? 0;
  const { planSteps: nextPlanSteps, extraFields } = mutate({
    planSteps: (current.plan_steps as Mission["plan_steps"]) ?? { steps: [] },
    status: current.status as MissionStatus,
  });

  const { data: updated, error: updateError } = await supabase
    .from("ai_missions")
    .update({ plan_steps: nextPlanSteps, plan_steps_version: currentVersion + 1, ...extraFields })
    .eq("id", missionId)
    .eq("plan_steps_version", currentVersion)
    .select("id");

  if (updateError) {
    return { ok: false, conflict: false, error: updateError };
  }
  if (!updated || updated.length === 0) {
    return { ok: false, conflict: true };
  }
  return { ok: true };
}
