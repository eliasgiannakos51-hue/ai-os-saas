import "server-only";
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
import {
  checkAiCallAllowed,
  fingerprintRequest,
  recordAiCallForDailySpend,
} from "@/lib/ai-circuit-breaker";
import { logApiError } from "@/lib/log-error";
import { diagLog } from "@/lib/diag";
import { AGENT_RUNNER_MODEL } from "@/lib/agents/agent-models";
import { runAgentTask, AGENT_MAX_WEB_SEARCHES } from "@/lib/agents/agent-runner";
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
import { normaliseAgentConfig, type UserAgent } from "@/lib/agents/agent-config";

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
      /** True only when the result actually reached the user. Named for the
       *  outcome rather than the transport, since V3 Task 3 added Slack. */
      delivered: boolean;
      deliveredVia: "email" | "slack" | null;
      /** Why it did not arrive, when it did not. */
      deliveryIssue?: string;
    }
  | {
      ok: false;
      reason:
        | "rate_limited"
        | "circuit_breaker"
        | "insufficient_credits"
        | "run_failed"
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
export function estimateAgentRun(params: {
  promptChars: number;
  needsWebSearch: boolean;
  accountCreditPriceEur: number;
  planSlug?: string | null;
}) {
  const config = resolvePricingConfig();
  const single = estimateForAction(
    "agentRun",
    {
      model: AGENT_RUNNER_MODEL,
      inputChars: params.promptChars,
      expectedWebSearches: params.needsWebSearch ? AGENT_MAX_WEB_SEARCHES : 0,
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
  const estimate = estimateAgentRun({
    promptChars: agent.prompt.length,
    needsWebSearch: agentConfig.needsWebSearch,
    accountCreditPriceEur,
    planSlug: plan?.slug ?? null,
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
  let outcome = await runAgentTask({ apiKey, prompt: agent.prompt, config: agentConfig, costs });
  attempts = 1;
  while (
    !outcome.ok &&
    (outcome.failure.kind === "api_error" || outcome.failure.kind === "no_output") &&
    attempts < AGENT_MAX_ATTEMPTS
  ) {
    attempts++;
    outcome = await runAgentTask({ apiKey, prompt: agent.prompt, config: agentConfig, costs });
  }

  // 8. Settle. Always — every attempt above spent real tokens, including
  //    the ones that produced nothing, and a failed run that charges zero
  //    is a run the margin report cannot see.
  const settlement = await settleReservation({
    userId,
    reservationId,
    feature: "agent_run",
    costs,
    plan,
    bypassCharge: bypassCredits || !plan,
    metadata: {
      agentId: agent.id,
      runId,
      triggerSource,
      attempts,
      estimatedCredits: estimate.estimatedCredits,
    },
  });
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
  const tokensUsed =
    totals.inputTokens + totals.outputTokens + totals.cacheReadTokens + totals.cacheWriteTokens;
  const finishedAt = new Date().toISOString();

  // 9. Reschedule. Computed from NOW rather than from the stored
  //    next_run_at, so an agent whose runs were delayed (a cron outage, a
  //    long queue) does not immediately fire again for every missed slot.
  const nextRun =
    agent.status === "active" ? nextRunAt(agent.schedule_cron, new Date(), agent.timezone) : null;

  // ---- failure path -------------------------------------------------
  if (!outcome.ok && outcome.failure.kind !== "nothing_to_report") {
    const consecutiveFailures = agent.consecutive_failures + 1;
    const shouldDisable = consecutiveFailures >= AGENT_MAX_CONSECUTIVE_FAILURES;

    await admin
      .from("agent_runs")
      .update({
        status: "failed",
        finished_at: finishedAt,
        error: outcome.failure.message,
        credits_charged: settlement.creditsCharged,
        tokens_used: tokensUsed,
        attempts,
      })
      .eq("id", runId);

    // A manual "Run now" must not be able to disable an agent or advance
    // its schedule — it is a test, not a scheduled execution. Only its
    // cost and its history row are real.
    if (triggerSource === "schedule") {
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
      reason: "run_failed",
      message: outcome.failure.message,
      runId,
    };
  }

  // ---- success path (including "nothing to report") -----------------
  const output = outcome.ok ? outcome.output : null;
  let delivery: { delivered: boolean; via: "email" | "slack" | null; reason?: string } = {
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
}
