import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { executeAgent } from "@/lib/agents/execute-agent";
import { JOB_STEPS } from "@/lib/jobs/job-types";
import type { JobContext, JobHandler, JobHandlerResult } from "@/lib/jobs/run-job";
import type { UserAgent } from "@/lib/agents/agent-config";

/**
 * "Run now" — a real execution, in the background.
 *
 * The route used to await executeAgent under a 300-second ceiling: a
 * search-enabled run plus a retry plus an email. Closing the tab aborted
 * the fetch, and although the run itself often finished, the user was left
 * with no result and no way to know.
 *
 * SELF-BILLED, and this is the one handler that is. executeAgent has
 * always owned the whole reserve/settle cycle for a run, because a
 * SCHEDULED run happens with no request at all and had to. Letting the job
 * machinery settle again would write a second cost-log row for the same
 * work — zero-cost, because this job's accumulator never sees those tokens
 * — and a zero-margin row would drag agent_run's 30-day average down and
 * fire the below-target alert for a feature that is fine.
 *
 * It is NOT a dry run: it costs credits, emails the result and writes a
 * history row. What it deliberately does not touch is the agent's schedule
 * or failure streak, so pressing "Run now" while tweaking a task can never
 * auto-disable the agent or shift when it next fires.
 */
export const agentRunHandler: JobHandler = async (ctx: JobContext): Promise<JobHandlerResult> => {
  const steps = JOB_STEPS.agent_run;
  const agentId = String(ctx.input.agentId ?? "");
  const admin = createAdminClient();

  await ctx.progress(1, steps[0]);

  // Re-read the agent HERE rather than carrying it in the job input. The
  // input is captured when the button is pressed and the worker may run a
  // minute later; executing a stale copy of a prompt the user has since
  // edited would be the wrong run, done confidently.
  const { data: agentRow } = await admin.from("user_agents").select("*").eq("id", agentId).maybeSingle();
  if (!agentRow) throw new Error("That agent no longer exists.");
  const agent = agentRow as UserAgent;

  // Ownership was checked by the route through RLS before the job existed.
  // Re-checking it against the job's own user is belt and braces against a
  // job input that somehow named someone else's agent.
  if (String(agent.user_id) !== ctx.userId) throw new Error("That agent no longer exists.");

  const { data: userData } = await admin.auth.admin.getUserById(ctx.userId);
  if (!userData?.user) throw new Error("The account for this run could not be read.");

  await ctx.progress(2, steps[1]);

  const result = await executeAgent({
    admin,
    user: userData.user,
    agent,
    triggerSource: "manual",
    apiKey: ctx.apiKey,
  });

  await ctx.progress(3, steps[2]);

  if (!result.ok) {
    // A run that legitimately failed is a completed JOB carrying a failed
    // RUN — a real, recorded outcome the user needs to read, not a
    // transport error to retry. executeAgent has already settled or
    // released whatever was right for it.
    return {
      selfBilled: true,
      result: {
        ran: false,
        reason: result.reason,
        error: result.message,
        runId: result.runId ?? null,
        creditsCharged: 0,
      },
    };
  }

  return {
    selfBilled: true,
    result: {
      ran: true,
      runId: result.runId,
      output: result.output,
      creditsCharged: result.creditsCharged,
      delivered: result.delivered,
      deliveredVia: result.deliveredVia,
      deliveryIssue: result.deliveryIssue ?? null,
    },
  };
};
