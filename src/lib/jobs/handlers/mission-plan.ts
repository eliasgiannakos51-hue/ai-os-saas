import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { logApiError } from "@/lib/log-error";
import { getUserFullContext, buildUserContextPromptAdditionGreek } from "@/lib/user-context";
import { planMission, researchGoal } from "@/lib/mission-agents";
import type { MissionPlan } from "@/types/mission";
import { logSecurityCheck } from "@/lib/security-check-log";
import { JOB_STEPS } from "@/lib/jobs/job-types";
import type { JobContext, JobHandler, JobHandlerResult } from "@/lib/jobs/run-job";

/**
 * Planning a mission, in the background.
 *
 * The route awaited a web-search pass AND a planning call under a
 * 180-second ceiling. Two sequential model calls under a limit that only
 * just covers them is the shape that produces a kill, and a kill runs no
 * catch block: no mission, no settlement, and the hold left standing.
 *
 * Moved verbatim in behaviour. The one thing that necessarily changes is
 * the client used for the reads and the insert: a worker has no session,
 * so it uses the admin client with the job's own user_id — which is where
 * the ownership check already happened, in the route, before the job
 * existed.
 */
export const missionPlanHandler: JobHandler = async (ctx: JobContext): Promise<JobHandlerResult> => {
  const steps = JOB_STEPS.mission_plan;
  const goal = String(ctx.input.goal ?? "").trim();
  const admin = createAdminClient();

  await ctx.progress(1, steps[0]);

  // "AI Life Context" — the consolidated user picture, so the Planner
  // grounds its steps in the user's real modules and missions rather than
  // in the goal text alone. Best-effort: a lookup failure means planning
  // falls back to the goal, exactly as it did before this existed.
  let userContext = "";
  try {
    const fullContext = await getUserFullContext(admin, ctx.userId);
    userContext = buildUserContextPromptAdditionGreek(fullContext);
  } catch (err) {
    logApiError("jobs:mission_plan", err, { stage: "user_full_context", jobId: ctx.jobId });
  }

  await ctx.progress(2, steps[1]);

  // Research first, plan second. Self-limiting: it searches only when the
  // goal depends on external facts, caps itself at 3 searches, and returns
  // nothing on any failure.
  const research = await researchGoal(ctx.apiKey, goal, ctx.costs);
  const planResult = await planMission(ctx.apiKey, goal, userContext, ctx.costs, research.findings);

  // A vague goal: the Planner asked for clarification instead of inventing
  // generic filler steps. No mission is created, but a real model call
  // happened and produced something the user needs — so this is a settled
  // job with a question in it, not a refund.
  if (planResult.clarificationNeeded) {
    return { result: { planned: false, message: planResult.clarificationQuestion } };
  }

  await ctx.progress(3, steps[2]);

  const planSteps: MissionPlan = {
    steps: planResult.steps.map((step) => ({
      text: step.text,
      status: "pending" as const,
      // Only written when the Planner actually supplied them, so a plan
      // without sub-steps stores exactly the shape it always did.
      ...(step.outcome ? { outcome: step.outcome } : {}),
      ...(step.estimatedMinutes ? { estimatedMinutes: step.estimatedMinutes } : {}),
      ...(step.substeps
        ? { substeps: step.substeps.map((text) => ({ text, status: "pending" as const })) }
        : {}),
    })),
  };

  const { data: mission, error: insertError } = await admin
    .from("ai_missions")
    .insert({ user_id: ctx.userId, goal, status: "planning", plan_steps: planSteps })
    .select("*")
    .single();

  // Thrown, not returned: a plan that was produced but could not be saved
  // is a failure the user should not pay for, and throwing is what routes
  // it through run-job's refund path.
  if (insertError || !mission) {
    logApiError("jobs:mission_plan", insertError, { stage: "insert_mission", jobId: ctx.jobId });
    throw new Error("Could not save the mission plan.");
  }

  void logSecurityCheck(admin, {
    userId: ctx.userId,
    resourceType: "mission_plan",
    resourceId: mission.id,
    result: {
      passed: true,
      checks: ["plan step validation (length + duplicate filtering)"],
      issues: [],
    },
  });

  return { result: { planned: true, mission } };
};
