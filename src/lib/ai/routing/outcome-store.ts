import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { logApiError } from "@/lib/log-error";
import { DEFAULT_MIN_SAMPLES, type RouteDecision } from "@/lib/ai/routing/route";

/**
 * WHAT THE ROUTER LEARNS FROM (V4 #35).
 *
 * The decision is pure (route.ts); this is the IO half, the same split
 * every safety-critical module in this app uses.
 *
 * THE ROW IS WRITTEN EVEN WHEN NOTHING WENT WRONG. A table that only
 * records failures reports a 0% success rate for every feature, and the
 * router would climb every route to the top model on the strength of it.
 *
 * NOTHING HERE MAY THROW INTO A REQUEST. A routing LOG must not be able
 * to fail the work it is describing — the customer's answer does not
 * depend on our bookkeeping, and a learning loop that can 500 a chat is
 * a learning loop that gets deleted.
 */

export type RoutingOutcome = {
  userId?: string | null;
  feature: string;
  decision: RouteDecision;
  succeeded: boolean | null;
  failureReason?: string | null;
  escalatedTo?: string | null;
  chargedUsd?: number;
  absorbedUsd?: number;
  latencyMs?: number | null;
};

export async function recordRoutingOutcome(outcome: RoutingOutcome): Promise<void> {
  try {
    const admin = createAdminClient();
    const { decision } = outcome;
    const { error } = await admin.from("routing_decisions").insert({
      user_id: outcome.userId ?? null,
      feature: outcome.feature,
      tier: decision.tier,
      // The FIRST reason is the rule that chose the tier; the rest are
      // overrides applied on top. Stored joined so the dashboard can show
      // the whole chain rather than a conclusion.
      rule: decision.reasons.join(" | ").slice(0, 500),
      model_id: decision.modelId,
      overridden_from: decision.wouldHaveCostUsd === null ? null : "tier-default",
      would_have_cost_usd: decision.wouldHaveCostUsd,
      prefix_tokens: decision.prefixTokens,
      cached: decision.cached,
      estimated_input_cost_usd: decision.estimatedInputCostUsd,
      succeeded: outcome.succeeded,
      failure_reason: outcome.failureReason ?? null,
      escalated_to: outcome.escalatedTo ?? null,
      charged_usd: outcome.chargedUsd ?? 0,
      absorbed_usd: outcome.absorbedUsd ?? 0,
      latency_ms: outcome.latencyMs ?? null,
    });
    if (error) throw error;
  } catch (err) {
    logApiError("ai:routing", err, { stage: "record", feature: outcome.feature });
  }
}

export type LearnedRates = {
  successRates: Record<string, number>;
  sampleCounts: Record<string, number>;
};

export const NO_LEARNING: LearnedRates = { successRates: {}, sampleCounts: {} };

/**
 * The per-(feature, model) success rates the router routes on.
 *
 * FAILS TO "NOTHING LEARNED". An unreadable aggregate must leave the
 * router on its static tier map — the behaviour it had before learning
 * existed. Failing the other way, to a made-up low rate, would push
 * every route to the most expensive model because a query timed out.
 *
 * A 30-DAY WINDOW. A model's success rate from six months ago is not
 * evidence about today's model, today's prompt or today's traffic.
 */
export async function loadLearnedRates(days = 30): Promise<LearnedRates> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("routing_success_rates", { p_days: days });
    if (error) throw error;
    const successRates: Record<string, number> = {};
    const sampleCounts: Record<string, number> = {};
    for (const row of (data ?? []) as {
      feature: string;
      model_id: string;
      runs: number | string;
      success_rate: number | string | null;
    }[]) {
      // A null rate means nothing conclusive ran. Skipped rather than
      // stored as 0 — see the SQL for why a zero here would be a lie
      // that pushes every route up a rung.
      if (row.success_rate === null) continue;
      const key = `${row.feature}:${row.model_id}`;
      successRates[key] = Number(row.success_rate);
      sampleCounts[key] = Number(row.runs);
    }
    return { successRates, sampleCounts };
  } catch (err) {
    logApiError("ai:routing", err, { stage: "load_rates" });
    return NO_LEARNING;
  }
}

export type RoutingDashboardRow = {
  modelId: string;
  decisions: number;
  chargedUsd: number;
  /** What our own failed cheap attempts cost US. The number that decides
   *  whether the router is actually saving anything. */
  absorbedUsd: number;
  overrides: number;
  /** What refusing the cache-losing downgrades saved. */
  overrideSavingUsd: number;
};

export async function loadRoutingDashboard(days = 30): Promise<RoutingDashboardRow[]> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("routing_savings", { p_days: days });
    if (error) throw error;
    return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
      modelId: String(row.model_id),
      decisions: Number(row.decisions ?? 0),
      chargedUsd: Number(row.charged_usd ?? 0),
      absorbedUsd: Number(row.absorbed_usd ?? 0),
      overrides: Number(row.overrides ?? 0),
      overrideSavingUsd: Number(row.override_saving_usd ?? 0),
    }));
  } catch (err) {
    logApiError("ai:routing", err, { stage: "load_dashboard" });
    return [];
  }
}

/** Re-exported so a caller does not have to import two modules to know
 *  how much evidence the router waits for. */
export { DEFAULT_MIN_SAMPLES };
