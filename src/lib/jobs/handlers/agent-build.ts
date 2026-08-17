import "server-only";
import { logApiError } from "@/lib/log-error";
import { checkNeedsClarification } from "@/lib/clarification";
import { buildAgentFromRequest } from "@/lib/agents/agent-builder";
import { nextRuns } from "@/lib/agents/cron-expression";
import { estimateAgentRun } from "@/lib/agents/execute-agent";
import { JOB_STEPS } from "@/lib/jobs/job-types";
import type { JobContext, JobHandler, JobHandlerResult } from "@/lib/jobs/run-job";

/**
 * Designing an agent, as work that survives the page.
 *
 * This is the body of what api/agents/build used to do inline, moved
 * verbatim in behaviour: the shared clarifying-questions pre-check, then
 * the builder, then the preview figures. What changed is only WHERE it
 * runs — nothing about the two model calls, the accumulator they share, or
 * what a user ends up with.
 *
 * WHY IT WAS THE MOST URGENT of the five. The builder is the slowest thing
 * a new user meets, it is the first thing they try, and it declared
 * maxDuration = 60 while doing two sequential model calls. On a 60-second
 * ceiling the second call could be killed outright — and a kill runs no
 * catch block, so the old route left the reservation held and returned
 * nothing. The user's first impression of the product was paying for a
 * spinner.
 *
 * It CREATES NOTHING. The result is a draft the user confirms through
 * POST /api/agents, which is what makes "the AI misunderstood me" a
 * discarded preview rather than a scheduled thing spending credits every
 * morning.
 */
export const agentBuildHandler: JobHandler = async (ctx: JobContext): Promise<JobHandlerResult> => {
  const steps = JOB_STEPS.agent_build;
  const request = String(ctx.input.request ?? "").trim();
  const timezone = String(ctx.input.timezone ?? "UTC");
  // The route refuses the request outright when the account has no email
  // (an agent with nowhere to send results), so by the time a job exists
  // this is always a real address. "" is the type-level floor, never a
  // value a real job carries.
  const deliveryTarget = String(ctx.input.deliveryTarget ?? "");
  const skipClarification = ctx.input.skipClarification === true;
  const accountCreditPriceEur = Number(ctx.input.accountCreditPriceEur ?? 0);
  const planSlug = ctx.input.planSlug == null ? null : String(ctx.input.planSlug);

  await ctx.progress(1, steps[0]);

  // The clarifying-questions pre-check. Its cost lands on the same
  // accumulator, so a build that stops here is still paid for — and
  // stopping here is a SUCCESSFUL job with questions in it, not a failure:
  // the user got exactly what the step is for.
  if (!skipClarification) {
    try {
      const clarification = await checkNeedsClarification(
        ctx.apiKey,
        "agent",
        request,
        ctx.costs,
        // (δ) of the brief: never ask for something the AI Life Context
        // already answers. Captured by the ROUTE, through the user's own
        // RLS-scoped client — getUserFullContext reads ai_missions with
        // no user_id filter and relies entirely on RLS to scope it, so
        // calling it here with the worker's admin client would put other
        // people's missions into this user's prompt.
        typeof ctx.input.knownContext === "string" ? ctx.input.knownContext : null
      );
      if (clarification.needsClarification) {
        return {
          result: {
            built: false,
            needsClarification: true,
            questions: clarification.questions,
            // Aligned by index with `questions` — the tappable answers,
            // without which a clarifying question is just an empty box
            // that costs more effort than the vague request did.
            questionSuggestions: clarification.suggestions,
          },
          // Settled as its OWN feature, not as agent_build.
          //
          // A build that stops here made one small classification call.
          // A build that finishes made two calls and produced a
          // configuration. Both were previously logged as "agent_build",
          // so the margin report averaged them — and because a user who
          // gets questions comes straight back and submits again, ONE
          // agent design routinely produced TWO agent_build rows, each
          // holding roughly half the interaction's Anthropic cost.
          //
          // Each row is margin-guaranteed on its own cost, so no money
          // was lost. What was lost is the ability to check that: one row
          // read against the Console's total for the whole interaction
          // shows about half the margin it really earned. On Ultimate,
          // a $0.06 interaction split into two $0.03 rows reads as 2.03x
          // against a real 4x. Naming the pre-check separately is what
          // makes the two rows addable instead of averageable — the same
          // fix api/websites/generate already carries as
          // "website_generate_precheck".
          feature: "agent_build_precheck",
        };
      }
    } catch (err) {
      // Best-effort, exactly as before: a hiccup in the pre-check must not
      // block a real agent from being designed.
      logApiError("jobs:agent_build", err, { stage: "clarification_check", jobId: ctx.jobId });
    }
  }

  await ctx.progress(2, steps[1]);
  const result = await buildAgentFromRequest({
    apiKey: ctx.apiKey,
    request,
    timezone,
    deliveryTarget,
    costs: ctx.costs,
  });

  await ctx.progress(3, steps[2]);

  if (!result.ok) {
    // The builder ran and cost real tokens even though it produced nothing
    // usable, so this is a settled job with a refusal in it — NOT a
    // refund. Returning it as a job failure would give the credits back
    // for work that genuinely happened.
    return {
      result: {
        built: false,
        reason: result.reason,
        error:
          result.reason === "invalid_schedule"
            ? `Couldn't work out a valid schedule: ${result.detail} Try saying when it should run, e.g. "every morning".`
            : "Couldn't design that agent. Try describing it a little differently.",
      },
    };
  }

  const { draft, understood, unsupported } = result.built;
  const perRun = estimateAgentRun({
    promptChars: draft.prompt.length,
    needsWebSearch: draft.config.needsWebSearch,
    accountCreditPriceEur,
    planSlug,
  });

  await ctx.progress(4, steps[3]);

  return {
    result: {
      built: true,
      draft,
      understood,
      unsupported,
      // The preview: what it understood, when it will run, and what each
      // run will cost. All three before the agent exists.
      upcomingRuns: nextRuns(draft.scheduleCron, new Date(), draft.timezone, 3).map((d) => d.toISOString()),
      estimatedCreditsPerRun: perRun.estimatedCredits,
    },
  };
};
