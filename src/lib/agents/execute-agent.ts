import "server-only";
import { sendPushToUser } from "@/lib/push/web-push";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { User } from "@supabase/supabase-js";
import { isAdminEmail } from "@/lib/admin";
import { hasActiveBetaBypass } from "@/lib/beta";
import {
  hasEnoughCredits,
  resolveEffectivePlan,
  getPurchasedPackCreditPriceEur,
} from "@/lib/billing/credits";
import { CostAccumulator } from "@/lib/billing/cost-accumulator";
import { estimateForAction } from "@/lib/billing/estimate";
import { resolvePricingConfig } from "@/lib/billing/pricing-config";
import { effectiveCreditPriceEurForAccount } from "@/lib/billing/credit-formula";
import { reserveCredits, settleReservation, releaseReservation } from "@/lib/billing/reservations";
import { checkBypassCeiling } from "@/lib/billing/bypass-ceiling";
import {
  checkAiCallAllowed,
  fingerprintRequest,
  recordAiCallForDailySpend,
} from "@/lib/ai-circuit-breaker";
import { logApiError } from "@/lib/log-error";
import { diagLog } from "@/lib/diag";
import {
  AGENT_DEPTHS,
  AGENT_DEPTH_SPECS,
  parseAgentDepth,
  type AgentDepth,
} from "@/lib/agents/agent-depth";
import { runAgentTask } from "@/lib/agents/agent-runner";
import { nextRunAt } from "@/lib/agents/cron-expression";
import {
  AGENT_MAX_ATTEMPTS,
  AGENT_MAX_CONSECUTIVE_FAILURES,
  maxAgentRunsPerHour,
} from "@/lib/agents/agent-limits";
import {
  sendAgentDisabledEmail,
  sendAgentPausedNoCreditsEmail,
} from "@/lib/email/send-agent-emails";
import { deliverAgentResult } from "@/lib/agents/deliver";
import { normaliseAgentConfig, type UserAgent, type AgentDeliveryMethod } from "@/lib/agents/agent-config";

// ONE execution of one agent, end to end: rate limit, circuit breaker,
// credit hold, run (with retries), settle, deliver, reschedule.
//
// Deliberately shared between the cron (api/cron/agent-runs) and "Run now"
// (api/agents/[id]/run) rather than written twice. The two entry points
// differ only in WHO decided the agent should run — everything after that
// decision, especially the billing and the failure accounting, has to be
// identical or the two paths drift and one of them stops charging.

export type ExecuteAgentResult =
  | {
      ok: true;
      runId: string;
      output: string | null;
      creditsCharged: number;
      /** This account is never charged (admin, beta tester). Carried out
       *  of here because "0 credits" and "free for you" are the same
       *  number and a very different sentence — the agents workspace was
       *  reporting the first one to an owner after every run. */
      bypassCharge: boolean;
      /** What the run WOULD have cost on a charging account. Null when the
       *  account really was charged. */
      wouldHaveChargedCredits: number | null;
      /** True only when the result actually reached the user. Named for the
       *  outcome rather than the transport, since V3 Task 3 added Slack. */
      delivered: boolean;
      deliveredVia: AgentDeliveryMethod | null;
      /** Why it did not arrive, when it did not. */
      deliveryIssue?: string;
    }
  | {
      ok: false;
      reason:
        | "rate_limited"
        | "circuit_breaker"
        | "insufficient_credits"
        | "bypass_ceiling"
        | "run_failed"
        /**
         * The agent cannot do this task, ever. Separate from "run_failed"
         * because the two need opposite words in the UI: a failed run
         * says "try again", and this one must say "this agent cannot do
         * that — it has been switched off and you were not charged".
         * Telling a user to retry something impossible is how they end
         * up retrying it.
         */
        | "cannot_complete"
        | "no_api_key"
        | "internal";
      message: string;
      runId?: string;
    };

/**
 * How much to hold for one execution.
 *
 * Multiplied by AGENT_MAX_ATTEMPTS because a run that retries pays for
 * every attempt: settlement charges MEASURED usage across the whole
 * CostAccumulator, so a hold sized for one attempt would leave a retried
 * run charging more than was ever held — which is exactly the balance-goes-
 * negative case the three-phase billing exists to prevent. Over-holding
 * costs the user nothing; the unused remainder is released at settlement.
 */
const DEPTH_PROFILE = {
  simple: "agentRunSimple",
  standard: "agentRunStandard",
  deep: "agentRunDeep",
} as const;

export function estimateAgentRun(params: {
  promptChars: number;
  needsWebSearch: boolean;
  accountCreditPriceEur: number;
  planSlug?: string | null;
  /** Omitted, this prices the standard tier — which is what an agent
   *  with no depth recorded actually runs as. */
  depth?: AgentDepth;
}) {
  const config = resolvePricingConfig();
  const depth = parseAgentDepth(params.depth);
  const spec = AGENT_DEPTH_SPECS[depth];
  const single = estimateForAction(
    DEPTH_PROFILE[depth],
    {
      // THE TIER'S MODEL, not a constant. Pricing every tier against
      // Sonnet would over-charge `simple` by three and under-reserve
      // `deep` by nearly half — and the under-reserve is the one that
      // ends with a balance going negative mid-run.
      model: spec.model,
      inputChars: params.promptChars,
      expectedWebSearches: params.needsWebSearch ? spec.maxSearches : 0,
      planSlug: params.planSlug ?? null,
    },
    config,
    params.accountCreditPriceEur
  );
  return {
    estimatedCredits: single.estimatedCredits,
    reserveCredits: single.reserveCredits * AGENT_MAX_ATTEMPTS,
  };
}

/**
 * ALL THREE TIERS, PRICED THE SAME WAY THE RUN WILL BE.
 *
 * The picker has to put a number beside every option — that is the whole
 * of requirement (b) — and a number computed in the browser would be a
 * second implementation of the pricing, drifting from the one that
 * charges. So the server prices all three and the component renders what
 * it is given.
 *
 * `promptChars` is the task the agent will actually run. Before an agent
 * exists (the create screen) the draft's prompt is the right input;
 * afterwards it is the stored one.
 */
export function agentRunEstimatesByDepth(params: {
  promptChars: number;
  needsWebSearch: boolean;
  accountCreditPriceEur: number;
  planSlug?: string | null;
}): Record<AgentDepth, number> {
  const out = {} as Record<AgentDepth, number>;
  for (const depth of AGENT_DEPTHS) {
    out[depth] = estimateAgentRun({ ...params, depth }).estimatedCredits;
  }
  return out;
}

/** Executions this user has started in the trailing hour, whatever the source. */
async function runsInLastHour(admin: SupabaseClient, userId: string): Promise<number | null> {
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count, error } = await admin
    .from("agent_runs")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("started_at", since);
  if (error) {
    logApiError("agents:execute", error, { stage: "runs_in_last_hour", userId });
    // Fails OPEN, same tolerance as lib/rate-limit.ts: a counting hiccup
    // must not stop a user's agents. The circuit breaker below is the
    // hard ceiling on runaway spend.
    return null;
  }
  return count ?? 0;
}

export async function executeAgent(params: {
  admin: SupabaseClient;
  user: User;
  agent: UserAgent;
  triggerSource: "schedule" | "manual";
  apiKey: string;
  /** ONE RUN AT A DIFFERENT DEPTH, without touching the schedule.
   *  Validated by the route before it gets here; parseAgentDepth below
   *  is the second line, because this is what sizes the hold. */
  depthOverride?: AgentDepth;
}): Promise<ExecuteAgentResult> {
  const { admin, user, agent, triggerSource, apiKey } = params;
  const userId = user.id;

  if (!apiKey) {
    return { ok: false, reason: "no_api_key", message: "The AI service is not configured." };
  }

  // 1. Per-user hourly execution cap.
  const recentRuns = await runsInLastHour(admin, userId);
  const hourlyCap = maxAgentRunsPerHour();
  if (recentRuns !== null && recentRuns >= hourlyCap) {
    return {
      ok: false,
      reason: "rate_limited",
      message: `You've hit the limit of ${hourlyCap} agent runs per hour. Try again shortly.`,
    };
  }

  // 2. Circuit breaker — independent of credits (lib/ai-circuit-breaker.ts).
  //    A cron-triggered call is as capable of runaway volume as a live one.
  const breaker = await checkAiCallAllowed(
    userId,
    "agent_run",
    fingerprintRequest(agent.id, agent.prompt)
  );
  if (!breaker.allowed) {
    return { ok: false, reason: "circuit_breaker", message: breaker.reason };
  }

  // 3. Billing context.
  const isAdmin = isAdminEmail(user.email);
  const bypassCredits = isAdmin || (await hasActiveBetaBypass(user));
  // THE BYPASS EUR CEILING. checkAiCallAllowed above caps volume for
  // every account; this caps real Anthropic SPEND specifically for the
  // accounts credits do not — admin and active beta. See
  // lib/billing/bypass-ceiling.ts for why this is one check in euros
  // rather than a counter re-implemented per feature.
  if (bypassCredits) {
    const ceiling = await checkBypassCeiling(userId, isAdmin, bypassCredits && !isAdmin);
    if (!ceiling.allowed) {
      return { ok: false, reason: "bypass_ceiling", message: ceiling.reason };
    }
  }
  const plan = await resolveEffectivePlan(user);
  const pricingConfig = resolvePricingConfig();
  const accountCreditPriceEur = bypassCredits
    ? pricingConfig.creditPriceEur
    : effectiveCreditPriceEurForAccount(
        plan,
        await getPurchasedPackCreditPriceEur(userId),
        pricingConfig
      );
  const agentConfig = normaliseAgentConfig(agent.config);
  // ONE depth for the whole execution — the hold, the run and the
  // receipt. Reading the override in one place and passing it down is
  // what stops a run being HELD at standard and EXECUTED at deep.
  const runDepth = parseAgentDepth(params.depthOverride ?? agentConfig.depth);
  const estimate = estimateAgentRun({
    promptChars: agent.prompt.length,
    needsWebSearch: agentConfig.needsWebSearch,
    accountCreditPriceEur,
    planSlug: plan?.slug ?? null,
    depth: runDepth,
  });

  // 4. Read-only affordability check before anything is held or called.
  if (!bypassCredits && plan) {
    const check = await hasEnoughCredits(userId, estimate.reserveCredits, plan);
    if (!check.ok) {
      return {
        ok: false,
        reason: "insufficient_credits",
        message: "Not enough credits to run this agent.",
      };
    }
  }

  // 5. The hold.
  const costs = new CostAccumulator();
  let reservationId = "";
  if (!bypassCredits && plan) {
    const reservation = await reserveCredits(userId, estimate.reserveCredits, "agent_run", {
      agentId: agent.id,
      estimatedCredits: estimate.estimatedCredits,
      triggerSource,
    });
    if (!reservation.ok) {
      return {
        ok: false,
        reason: "insufficient_credits",
        message: "Not enough credits to run this agent.",
      };
    }
    reservationId = reservation.reservationId;
  }
  void recordAiCallForDailySpend(estimate.estimatedCredits);

  // 6. The run row exists BEFORE the work starts, so an execution that
  //    dies mid-flight (a killed serverless function) leaves a visible
  //    'running' row rather than no trace at all.
  const { data: runRow, error: runInsertError } = await admin
    .from("agent_runs")
    .insert({
      agent_id: agent.id,
      user_id: userId,
      status: "running",
      trigger_source: triggerSource,
      attempts: 1,
    })
    .select("id")
    .single();

  if (runInsertError || !runRow) {
    await releaseReservation(userId, reservationId);
    logApiError("agents:execute", runInsertError, { stage: "insert_run", agentId: agent.id });
    return { ok: false, reason: "internal", message: "Could not start the run." };
  }
  const runId = String(runRow.id);

  // 7. Execute, retrying the failures that are plausibly transient.
  //
  //    'unsafe_output' is deliberately NOT retried: it means the output
  //    failed the safety shape check, and retrying a safety failure until
  //    it passes is how a safety check becomes a formality.
  let attempts = 0;
  let outcome = await runAgentTask({ apiKey, prompt: agent.prompt, config: agentConfig, costs, depth: runDepth });
  attempts = 1;
  while (
    !outcome.ok &&
    (outcome.failure.kind === "api_error" || outcome.failure.kind === "no_output") &&
    attempts < AGENT_MAX_ATTEMPTS
  ) {
    attempts++;
    outcome = await runAgentTask({ apiKey, prompt: agent.prompt, config: agentConfig, costs, depth: runDepth });
  }

  // 8. Settle. Always — every attempt above spent real tokens, including
  //    the ones that produced nothing, and a failed run that charges zero
  //    is a run the margin report cannot see.
  //
  //    THE ONE EXCEPTION: the agent said it cannot do this task at all.
  //
  //    Every other failure is bad luck — an overloaded API, an empty
  //    response, a page that would not load — and the user still asked
  //    for something we can do. A capability refusal is different in
  //    kind: the task is impossible, it was impossible when we let them
  //    create it, and it will be impossible on every future run. Charging
  //    for the discovery is charging for our own gap. So this settles as
  //    a bypass row — the real cost stays visible in the margin report,
  //    which is what tells us how much these gaps cost — and the hold is
  //    released whole below.
  const cannotComplete = !outcome.ok && outcome.failure.kind === "cannot_complete";
  const settlement = await settleReservation({
    userId,
    reservationId: cannotComplete ? "" : reservationId,
    feature: cannotComplete ? "agent_run_cannot_complete" : "agent_run",
    costs,
    plan,
    bypassCharge: bypassCredits || !plan || cannotComplete,
    metadata: {
      agentId: agent.id,
      runId,
      triggerSource,
      attempts,
      estimatedCredits: estimate.estimatedCredits,
      // ON THE COST ROW, not only in the estimate. The margin report
      // groups by feature, and without this a `deep` run and a `simple`
      // run are one undifferentiated "agent_run" average — which is the
      // number somebody would use to decide whether the tiers pay for
      // themselves.
      depth: runDepth,
      depthOverridden: params.depthOverride ? true : undefined,
      ...(cannotComplete ? { refunded: true, cannotComplete: true } : {}),
    },
  });
  if (cannotComplete) {
    // Released AFTER settlement, not instead of it: settleReservation was
    // passed an empty reservation id precisely so it would charge nothing
    // and leave the hold alone, and this is the release. Doing it the
    // other way round — release first, settle second — is the ordering
    // that can charge against a hold that is already gone.
    await releaseReservation(userId, reservationId);
  }
  diagLog(
    `[billing] agent_run settled: ${JSON.stringify({
      userId,
      agentId: agent.id,
      runId,
      attempts,
      creditsCharged: settlement.creditsCharged,
      achievedMargin: settlement.achievedMargin,
    })}`
  );

  const totals = costs.totals();
  // Every token Anthropic billed for, including BOTH cache-write TTLs —
  // the 1-hour slice is priced separately (2x input) but it is still
  // tokens the run consumed, and omitting it would understate the figure
  // shown on the run.
  const tokensUsed =
    totals.inputTokens +
    totals.outputTokens +
    totals.cacheReadTokens +
    totals.cacheWriteTokens +
    totals.cacheWrite1hTokens;
  const finishedAt = new Date().toISOString();

  // 9. Reschedule. Computed from NOW rather than from the stored
  //    next_run_at, so an agent whose runs were delayed (a cron outage, a
  //    long queue) does not immediately fire again for every missed slot.
  const nextRun =
    agent.status === "active" ? nextRunAt(agent.schedule_cron, new Date(), agent.timezone) : null;

  // ---- failure path -------------------------------------------------
  if (!outcome.ok && outcome.failure.kind !== "nothing_to_report") {
    const consecutiveFailures = agent.consecutive_failures + 1;
    // A capability refusal disables the agent on the FIRST occurrence.
    //
    // The five-failure rule is calibrated for flakiness: five bad days in
    // a row probably means something is really wrong. An impossible task
    // is not flaky — it fails identically forever — so waiting for five
    // means five more scheduled runs, five more emails telling the user
    // their agent cannot do the thing, and five more sets of tokens we
    // pay for and refund. Once is enough to know.
    const shouldDisable = cannotComplete || consecutiveFailures >= AGENT_MAX_CONSECUTIVE_FAILURES;

    await admin
      .from("agent_runs")
      .update({
        status: "failed",
        finished_at: finishedAt,
        // A code the client can translate, not the model's own sentence:
        // that sentence is already stored below as the disable reason,
        // and the run list needs a label in the reader's language.
        error: cannotComplete ? "cannot_complete" : outcome.failure.message,
        credits_charged: settlement.creditsCharged,
      // Null when the account really was charged; a number only on a
      // bypass account, where credits_charged is 0 and says nothing.
      would_have_charged_credits: settlement.wouldHaveChargedCredits,
        tokens_used: tokensUsed,
        attempts,
      })
      .eq("id", runId);

    // A manual "Run now" must not be able to disable an agent or advance
    // its schedule — it is a test, not a scheduled execution. Only its
    // cost and its history row are real.
    //
    // `cannotComplete` is the exception, and for the same reason it skips
    // the five-failure count: pressing "Run now" is exactly how a user
    // discovers the agent is impossible, and leaving it scheduled after
    // that guarantees it runs anyway tomorrow morning.
    if (triggerSource === "schedule" || cannotComplete) {
      await admin
        .from("user_agents")
        .update({
          last_run_at: finishedAt,
          next_run_at: shouldDisable ? null : nextRun?.toISOString() ?? null,
          consecutive_failures: consecutiveFailures,
          ...(shouldDisable ? { status: "disabled" as const } : {}),
        })
        .eq("id", agent.id);

      if (shouldDisable) {
        void sendAgentDisabledEmail({
          userId,
          email: user.email ?? "",
          agentName: agent.name,
          reason: outcome.failure.message,
          consecutiveFailures,
        });
      }
    }

    return {
      ok: false,
      reason: cannotComplete ? "cannot_complete" : "run_failed",
      message: outcome.failure.message,
      runId,
    };
  }

  // ---- success path (including "nothing to report") -----------------
  const output = outcome.ok ? outcome.output : null;
  // Typed from the channel registry rather than from a literal union: the
  // union here was "email" | "slack", and widening the registry without
  // widening this would have been a type error at best and a silently
  // mis-recorded delivery at worst.
  let delivery: { delivered: boolean; via: AgentDeliveryMethod | null; reason?: string } = {
    delivered: false,
    via: null,
  };
  if (output) {
    const result = await deliverAgentResult({
      userId,
      email: user.email ?? "",
      method: agent.delivery_method,
      target: agent.delivery_target,
      agentName: agent.name,
      output,
      language: agentConfig.language,
    });
    delivery = { delivered: result.delivered, via: result.via, reason: result.reason };
    // Push, in addition to (never instead of) the email/Slack delivery
    // above. An agent runs unattended at 08:00 — a phone notification is
    // what makes a result something the user actually sees that morning,
    // and it carries no content beyond the agent's name: the result may
    // be long and private, and a notification is shown on a lock screen.
    void sendPushToUser(userId, "agent_results", {
      title: agent.name,
      body: "Your agent finished its run — tap to read the result.",
      url: "/dashboard/agents",
      tag: `agent-${agent.id}`,
    });
  }

  await admin
    .from("agent_runs")
    .update({
      status: "success",
      finished_at: finishedAt,
      output,
      // The run SUCCEEDED — the work was done and paid for — but if the
      // result never reached the user, that has to be visible in the
      // history rather than inferred from an inbox that stayed empty.
      error: output && !delivery.delivered ? delivery.reason ?? null : null,
      credits_charged: settlement.creditsCharged,
      // Null when the account really was charged; a number only on a
      // bypass account, where credits_charged is 0 and says nothing.
      would_have_charged_credits: settlement.wouldHaveChargedCredits,
      tokens_used: tokensUsed,
      attempts,
    })
    .eq("id", runId);

  if (triggerSource === "schedule") {
    await admin
      .from("user_agents")
      .update({
        last_run_at: finishedAt,
        next_run_at: nextRun?.toISOString() ?? null,
        consecutive_failures: 0,
      })
      .eq("id", agent.id);
  } else if (agent.consecutive_failures > 0) {
    // A successful manual test clears the failure streak — otherwise an
    // agent the user has just proved works could still auto-disable on its
    // next scheduled hiccup.
    await admin.from("user_agents").update({ consecutive_failures: 0 }).eq("id", agent.id);
  }

  return {
    ok: true,
    runId,
    output,
    creditsCharged: settlement.creditsCharged,
    bypassCharge: settlement.bypassCharge,
    wouldHaveChargedCredits: settlement.wouldHaveChargedCredits,
    delivered: delivery.delivered,
    deliveredVia: delivery.via,
    ...(delivery.reason ? { deliveryIssue: delivery.reason } : {}),
  };
}

/**
 * Pauses an agent because the account is out of credits, and tells the
 * owner why. Separate from the failure path above: nothing is wrong with
 * the agent, the run never happened, and nothing was charged — so it must
 * not count toward the consecutive-failure streak that disables agents.
 */
export async function pauseAgentForNoCredits(params: {
  admin: SupabaseClient;
  userId: string;
  email: string;
  agent: UserAgent;
}): Promise<void> {
  const { admin, userId, email, agent } = params;
  await admin
    .from("user_agents")
    .update({ status: "paused", next_run_at: null })
    .eq("id", agent.id);
  void sendAgentPausedNoCreditsEmail({ userId, email, agentName: agent.name });
  // The low-credits push. This is the moment it genuinely matters: an
  // agent has just STOPPED because the balance ran out, and every further
  // scheduled run is silently skipped until the user acts.
  void sendPushToUser(userId, "low_credits", {
    title: "Agent paused — out of credits",
    body: `${agent.name} could not run because your balance ran out.`,
    url: "/dashboard/settings",
    tag: "low-credits",
  });
}
