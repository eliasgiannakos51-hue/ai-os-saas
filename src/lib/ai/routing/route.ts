import { cachesOn, prefixInputCostUsd } from "@/lib/ai/providers/cache-policy";
import { classify, type ClassifyInput } from "@/lib/ai/routing/classify";
import { TIER_MODELS, nextRung, canEscalate, type Tier } from "@/lib/ai/routing/tiers";

/**
 * THE ROUTING DECISION (V4 #35).
 *
 * Deterministic, pure, and under a millisecond — the brief's 50ms budget
 * is for the whole overhead and the build gate measures this at a
 * fraction of it, because nothing here does IO.
 *
 * THE RULE THE BRIEF WARNS ABOUT, AND IT IS NOT A DETAIL.
 *
 *   Haiku's prompt cache needs 4,096 tokens of prefix. Sonnet's needs
 *   1,024.
 *
 * So a request with a 2,000-token system prefix CACHES ON SONNET AND DOES
 * NOT CACHE ON HAIKU. Sonnet bills that prefix at the cache-read rate;
 * Haiku bills all 2,000 tokens as fresh input on every single call. The
 * "downgrade" can therefore cost MORE than the model it downgraded from,
 * while every dashboard reports it as a saving because the per-token rate
 * went down.
 *
 * This is not hypothetical arithmetic. It is the shape of a change that
 * looks like a 70% cost cut in a spreadsheet and shows up as a cost rise
 * in the invoice, with worse answers attached. So the router prices BOTH
 * models on the ACTUAL prefix and refuses any downgrade that does not
 * actually save money.
 *
 * WHAT THIS FILE DOES NOT DO: call anything. It returns a decision. The
 * caller executes it, and reports the outcome back through
 * lib/ai/routing/outcome-store.ts, which is what makes the next decision
 * better.
 */

export type RouteDecision = {
  modelId: string;
  tier: Tier;
  /** Every reason that applied, in the order they applied, so a
   *  dashboard can explain a decision instead of just displaying it. */
  reasons: string[];
  /** What this call is expected to cost in input alone, at the chosen
   *  model, with the cache accounted for. Output cost is unknowable
   *  before the call and is deliberately absent rather than guessed. */
  estimatedInputCostUsd: number;
  /** What the same call would have cost on the tier's own model, when
   *  the router overrode it. Null when no override happened. */
  wouldHaveCostUsd: number | null;
  /** True when the prefix will be served from cache at this model. */
  cached: boolean;
  /** The prefix this decision was made against. Carried on the decision
   *  rather than re-derived by the logger: the number that decided the
   *  route and the number recorded next to it must be the same one. */
  prefixTokens: number;
  /** Set when the deterministic rules did not decide and the caller may
   *  spend a small classifier call. */
  needsClassifier: boolean;
};

export type RouteInput = ClassifyInput & {
  /** Tokens in the cached system prefix. THE NUMBER THAT DECIDES whether
   *  a cheaper model is really cheaper. */
  prefixTokens?: number;
  /** Per (feature, model) success rates observed so far, from
   *  outcome-store. A model that keeps failing this feature is skipped. */
  successRates?: Readonly<Record<string, number>>;
  /** Below this, a model is not chosen for a feature it keeps failing.
   *  Only applied once there is enough evidence — see minSamples. */
  minSuccessRate?: number;
  /** How many observations before a success rate is allowed to change a
   *  route. Two failures out of two is not evidence. */
  sampleCounts?: Readonly<Record<string, number>>;
  minSamples?: number;
};

export const DEFAULT_MIN_SUCCESS_RATE = 0.9;
export const DEFAULT_MIN_SAMPLES = 20;

/**
 * Input cost for `tokens` of prefix at `modelId`.
 *
 * DELEGATED, never re-implemented. `rate = cached ? x * ratio : x` living
 * in two files would be two sources of truth for the number that decides
 * every route, and they would drift the first time either changed.
 *
 * NAMED routeInputCostUsd RATHER THAN inputCostUsd. cache-policy.ts has a
 * private function of that name, and scripts/tests/load-ts.mjs
 * CONCATENATES modules into one scope — two declarations of the same
 * name is a SyntaxError that kills the whole gate, not a shadowing.
 */
export function routeInputCostUsd(modelId: string | undefined, tokens: number): number | null {
  return prefixInputCostUsd(modelId, tokens);
}

export function route(input: RouteInput): RouteDecision {
  const reasons: string[] = [];
  const classification = classify(input);
  reasons.push(classification.rule);

  const tier = classification.tier;
  let modelId = TIER_MODELS[tier];
  const prefixTokens = input.prefixTokens ?? 0;

  // ---- THE CACHE-MINIMUM RULE ---------------------------------------
  //
  // Only ever applied to a DOWNGRADE. Climbing to a stronger model is a
  // quality decision and is not required to be cheaper.
  const complexModel = TIER_MODELS.complex;
  let wouldHaveCostUsd: number | null = null;
  if ((tier === "trivial" || tier === "simple") && modelId !== complexModel && prefixTokens > 0) {
    const cheap = routeInputCostUsd(modelId, prefixTokens);
    const reference = routeInputCostUsd(complexModel, prefixTokens);
    if (cheap !== null && reference !== null && cheap >= reference) {
      // THE CHEAP MODEL IS NOT CHEAPER ON THIS REQUEST. Almost always
      // because the prefix caches on one and not the other.
      reasons.push(
        `cache:downgrade-costs-more (${prefixTokens} tokens: ` +
          `${modelId} $${cheap.toFixed(6)} vs ${complexModel} $${reference.toFixed(6)})`
      );
      wouldHaveCostUsd = cheap;
      modelId = complexModel;
    }
  }

  // ---- WHAT THE ROUTER HAS LEARNED ----------------------------------
  //
  // A model that keeps failing this feature stops being chosen for it,
  // but ONLY once there is enough evidence. Two failures out of two is
  // noise, and reacting to it would make the router oscillate.
  const minRate = input.minSuccessRate ?? DEFAULT_MIN_SUCCESS_RATE;
  const minSamples = input.minSamples ?? DEFAULT_MIN_SAMPLES;
  for (let hop = 0; hop < 3; hop++) {
    const key = `${input.feature}:${modelId}`;
    const rate = input.successRates?.[key];
    const samples = input.sampleCounts?.[key] ?? 0;
    if (rate === undefined || samples < minSamples || rate >= minRate) break;
    const up = nextRung(modelId);
    if (!up) {
      reasons.push(`learned:${modelId} at ${(rate * 100).toFixed(0)}% but already at the top`);
      break;
    }
    reasons.push(`learned:${modelId} at ${(rate * 100).toFixed(0)}% over ${samples} runs -> ${up}`);
    modelId = up;
  }

  const cost = routeInputCostUsd(modelId, prefixTokens);
  return {
    modelId,
    tier,
    reasons,
    estimatedInputCostUsd: cost ?? 0,
    wouldHaveCostUsd,
    cached: cachesOn(prefixTokens, modelId),
    prefixTokens,
    needsClassifier: classification.needsClassifier,
  };
}

export type EscalationDecision =
  | { escalate: true; modelId: string; reason: string }
  | { escalate: false; reason: string };

/**
 * The cheap model failed. Climb, or stop?
 *
 * CHARGED ONCE, AND ONLY FOR WHAT SUCCEEDED. The caller settles the
 * SUCCESSFUL attempt and discards the failed one — see
 * `escalationCharge` below. A user who never chose the cheap model must
 * not pay for our having tried it; that cost is ours, and it is the price
 * of the saving we take on every request that does work.
 *
 * A REFUSAL IS NOT A FAILURE TO ESCALATE. If the model declined on
 * safety or policy grounds, retrying on a stronger one is shopping for a
 * different answer to a question that was already answered.
 */
export function decideEscalation(params: {
  modelId: string;
  failureReason: string;
  /** Attempts already made for this one request, including the failure
   *  that produced `failureReason`. */
  attempts: number;
  maxAttempts?: number;
}): EscalationDecision {
  const maxAttempts = params.maxAttempts ?? 2;
  if (!canEscalate(params.failureReason)) {
    return { escalate: false, reason: `${params.failureReason} is not evidence a stronger model would do better` };
  }
  if (params.attempts >= maxAttempts) {
    return { escalate: false, reason: `already tried ${params.attempts} models for one request` };
  }
  const up = nextRung(params.modelId);
  if (!up) return { escalate: false, reason: `${params.modelId} is already the strongest model` };
  return { escalate: true, modelId: up, reason: `${params.failureReason} on ${params.modelId}` };
}

/**
 * What the user pays after an escalation.
 *
 * THE SUCCESSFUL ATTEMPT ONLY. Never the sum, never the maximum, never
 * the cheap one "because that is what they were quoted". The rule the
 * whole billing system already follows is that a user is charged for
 * work that succeeded, and a failed cheap attempt is our routing
 * decision costing us money, exactly as it should.
 */
export function escalationCharge(attempts: readonly { modelId: string; succeeded: boolean; costUsd: number }[]): {
  chargeUsd: number;
  absorbedUsd: number;
  chargedModel: string | null;
} {
  const winner = attempts.find((a) => a.succeeded);
  const absorbedUsd = attempts.filter((a) => !a.succeeded).reduce((sum, a) => sum + a.costUsd, 0);
  return {
    chargeUsd: winner ? winner.costUsd : 0,
    absorbedUsd: Math.round(absorbedUsd * 1e8) / 1e8,
    chargedModel: winner ? winner.modelId : null,
  };
}
