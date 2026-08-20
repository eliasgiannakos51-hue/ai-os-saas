import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { updateMissionPlanSteps, type PlanStepsUpdateResult } from "@/lib/mission-plan-steps";
import type { MissionStep } from "@/types/mission";

/**
 * Removing, editing and reordering the steps of a mission.
 *
 * THE COUPLING THIS FILE EXISTS TO OWN. A mission's steps live in one
 * jsonb array (ai_missions.plan_steps), so their identity IS their
 * position — and `scheduled_agent_runs.step_index` is an integer pointing
 * into that array. The daily cron reads `steps[run.step_index]` and
 * executes whatever it finds there (api/cron/scheduled-runs/route.ts:202).
 *
 * So a step deleted or moved without touching the scheduled runs does not
 * merely lose a row: every run scheduled after it now points one place to
 * the left and would silently execute a DIFFERENT step, spending real
 * credits on work the user did not ask for. That is invisible to the
 * compiler and to any test that only looks at the array, which is why
 * every mutation here fixes the runs in the same call, and why there is
 * exactly one of each mutation rather than one per call site.
 *
 * NOT A TRANSACTION, and it cannot be from here: the steps live in a
 * jsonb column guarded by an optimistic version and the runs are separate
 * rows. The order below is the one that fails safe — the runs are fixed
 * FIRST, so a crash in between leaves runs that point at a step that
 * still exists (harmless: the run executes the step it was always meant
 * to), rather than runs pointing past the end of a shortened array.
 */

/** A scheduled run, as much of it as restoring one needs. Declared in a
 *  client-safe file and re-exported here, because the UI needs the shape
 *  to offer an undo and must not pull this "server-only" module in. */
export type { RemovedRun } from "@/lib/mission-step-edits-types";
import type { RemovedRun } from "@/lib/mission-step-edits-types";

export type StepMutationResult =
  | { ok: true; removedStep?: MissionStep; removedRuns?: RemovedRun[] }
  | { ok: false; conflict: true }
  | { ok: false; conflict: false; error: unknown };

function fromPlanResult(result: PlanStepsUpdateResult): StepMutationResult {
  return result.ok ? { ok: true } : result;
}

/**
 * Delete one step.
 *
 * Returns what it removed — the step itself and any PENDING scheduled
 * runs that pointed at it — so an undo can put both back. A run that has
 * already executed is left alone: it is history, and history does not
 * move when the plan does.
 */
export async function deleteMissionStep(
  supabase: SupabaseClient,
  missionId: string,
  userId: string,
  index: number
): Promise<StepMutationResult> {
  const { data: runs, error: runsError } = await supabase
    .from("scheduled_agent_runs")
    .select("step_index, step_text, agent_role, scheduled_for")
    .eq("mission_id", missionId)
    .eq("user_id", userId)
    .eq("status", "pending");
  if (runsError) return { ok: false, conflict: false, error: runsError };

  const pending = (runs ?? []) as RemovedRun[];
  const removedRuns = pending.filter((r) => r.step_index === index);

  // A run that pointed AT this step has nothing left to execute.
  if (removedRuns.length > 0) {
    const { error } = await supabase
      .from("scheduled_agent_runs")
      .delete()
      .eq("mission_id", missionId)
      .eq("user_id", userId)
      .eq("status", "pending")
      .eq("step_index", index);
    if (error) return { ok: false, conflict: false, error };
  }
  // Everything after it shifts one to the left, or it executes its
  // neighbour's step tomorrow morning.
  for (const run of pending.filter((r) => r.step_index > index)) {
    const { error } = await supabase
      .from("scheduled_agent_runs")
      .update({ step_index: run.step_index - 1 })
      .eq("mission_id", missionId)
      .eq("user_id", userId)
      .eq("status", "pending")
      .eq("step_index", run.step_index);
    if (error) return { ok: false, conflict: false, error };
  }

  let removedStep: MissionStep | undefined;
  const result = await updateMissionPlanSteps(supabase, missionId, ({ planSteps }) => {
    const steps = [...(planSteps.steps ?? [])];
    removedStep = steps[index];
    steps.splice(index, 1);
    return { planSteps: { ...planSteps, steps } };
  });
  if (!result.ok) return result;
  return { ok: true, removedStep, removedRuns };
}

/** Put a deleted step back where it was, with the runs that went with it. */
export async function restoreMissionStep(
  supabase: SupabaseClient,
  missionId: string,
  userId: string,
  index: number,
  step: MissionStep,
  runs: RemovedRun[]
): Promise<StepMutationResult> {
  const result = await updateMissionPlanSteps(supabase, missionId, ({ planSteps }) => {
    const steps = [...(planSteps.steps ?? [])];
    steps.splice(Math.min(index, steps.length), 0, step);
    return { planSteps: { ...planSteps, steps } };
  });
  if (!result.ok) return result;

  // Shift the later runs back out of the way before re-inserting.
  const { data: laterRuns } = await supabase
    .from("scheduled_agent_runs")
    .select("step_index")
    .eq("mission_id", missionId)
    .eq("user_id", userId)
    .eq("status", "pending")
    .gte("step_index", index);
  for (const run of ((laterRuns ?? []) as { step_index: number }[]).sort((a, b) => b.step_index - a.step_index)) {
    await supabase
      .from("scheduled_agent_runs")
      .update({ step_index: run.step_index + 1 })
      .eq("mission_id", missionId)
      .eq("user_id", userId)
      .eq("status", "pending")
      .eq("step_index", run.step_index);
  }

  if (runs.length > 0) {
    // user_id and mission_id come from the SERVER's own values, never the
    // request body: an undo may only put back the caller's own work.
    const { error } = await supabase.from("scheduled_agent_runs").insert(
      runs.map((r) => ({
        user_id: userId,
        mission_id: missionId,
        step_index: index,
        step_text: r.step_text,
        agent_role: r.agent_role,
        status: "pending",
        scheduled_for: r.scheduled_for,
      }))
    );
    if (error) return { ok: false, conflict: false, error };
  }
  return { ok: true };
}

/** Rewrite one step's text. Nothing else about it changes — its status,
 *  its output and its scheduled runs all still refer to the same step. */
export async function editMissionStepText(
  supabase: SupabaseClient,
  missionId: string,
  userId: string,
  index: number,
  text: string
): Promise<StepMutationResult> {
  const result = await updateMissionPlanSteps(supabase, missionId, ({ planSteps }) => {
    const steps = [...(planSteps.steps ?? [])];
    if (steps[index]) steps[index] = { ...steps[index], text };
    return { planSteps: { ...planSteps, steps } };
  });
  if (!result.ok) return result;

  // The run carries its own copy of the text, shown to the user in the
  // schedule list and fed to the model at execution time. Leaving it
  // stale is how tomorrow's run does the old wording of a step the user
  // deliberately rewrote.
  const { error } = await supabase
    .from("scheduled_agent_runs")
    .update({ step_text: text })
    .eq("mission_id", missionId)
    .eq("user_id", userId)
    .eq("status", "pending")
    .eq("step_index", index);
  if (error) return { ok: false, conflict: false, error };
  return { ok: true };
}

/** Move a step one place up or down, taking its scheduled runs with it. */
export async function moveMissionStep(
  supabase: SupabaseClient,
  missionId: string,
  userId: string,
  index: number,
  direction: "up" | "down"
): Promise<StepMutationResult> {
  const target = direction === "up" ? index - 1 : index + 1;
  if (target < 0) return { ok: false, conflict: false, error: new Error("Already first.") };

  let moved = false;
  const result = await updateMissionPlanSteps(supabase, missionId, ({ planSteps }) => {
    const steps = [...(planSteps.steps ?? [])];
    if (target < steps.length && steps[index]) {
      [steps[index], steps[target]] = [steps[target], steps[index]];
      moved = true;
    }
    return { planSteps: { ...planSteps, steps } };
  });
  if (!result.ok) return result;
  if (!moved) return { ok: false, conflict: false, error: new Error("Already last.") };

  // The two positions swap, so the runs pointing at them swap too — via a
  // parking value, because the pair would otherwise collide mid-swap.
  const PARK = -1;
  const at = (i: number) =>
    supabase
      .from("scheduled_agent_runs")
      .update({ step_index: PARK })
      .eq("mission_id", missionId)
      .eq("user_id", userId)
      .eq("status", "pending")
      .eq("step_index", i);
  const park = await at(index);
  if (park.error) return { ok: false, conflict: false, error: park.error };
  const shift = await supabase
    .from("scheduled_agent_runs")
    .update({ step_index: index })
    .eq("mission_id", missionId)
    .eq("user_id", userId)
    .eq("status", "pending")
    .eq("step_index", target);
  if (shift.error) return { ok: false, conflict: false, error: shift.error };
  const unpark = await supabase
    .from("scheduled_agent_runs")
    .update({ step_index: target })
    .eq("mission_id", missionId)
    .eq("user_id", userId)
    .eq("status", "pending")
    .eq("step_index", PARK);
  if (unpark.error) return { ok: false, conflict: false, error: unpark.error };
  return fromPlanResult({ ok: true });
}
