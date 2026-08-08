import type { PlanSlug } from "@/lib/billing/plans";
import { PLANS, getPlan } from "@/lib/billing/plans";
import { CHAT_MODEL } from "@/lib/ai-models";
import {
  MODEL_PRICING_USD,
  FALLBACK_MODEL_PRICING,
  WEB_SEARCH_USD_PER_QUERY,
} from "@/lib/billing/model-pricing";
import { resolvePricingConfig, type PricingConfig } from "@/lib/billing/pricing-config";

/**
 * Free chat: a monthly allowance of chat messages that cost the user no
 * credits at all.
 *
 * The reason this needs its own module rather than "just don't charge for
 * the first N messages": a normal chat message has no useful cost ceiling.
 * The route allows a 10,000-character message, 20 messages of history, up
 * to 3 web searches (each one both a $0.01 tool charge AND several
 * thousand tokens of results re-sent on every subsequent tool round) and
 * 2,048 output tokens. Worst case that is roughly €0.96 for ONE message —
 * see FULL_CHAT_WORST_CASE below. At 25% of a €20 plan that would buy
 * five free messages, which is not a feature.
 *
 * So free chat runs inside a deliberately smaller envelope (FREE_CHAT_LIMITS):
 * no web search, a short history window, a shorter input and a shorter
 * reply. That makes the worst case ~28x cheaper and an allowance of
 * hundreds of messages affordable. The user gets a real, unlimited-feeling
 * conversation; what they don't get for free is research-grade answers.
 *
 * Every number here is a WORST case, not an average. Averages are what
 * make free tiers lose money.
 */

// ---------------------------------------------------------------------------
// The envelope free chat runs in
// ---------------------------------------------------------------------------

export type FreeChatLimits = {
  /** Longest message a free-chat turn accepts, in characters. */
  maxMessageChars: number;
  /** How many previous messages are re-sent as context. */
  historyLimit: number;
  /** Cap on the reply. */
  maxOutputTokens: number;
  /** Web search is off for free messages — see the note above. */
  webSearch: false;
};

export const FREE_CHAT_LIMITS: FreeChatLimits = {
  maxMessageChars: 2000,
  historyLimit: 6,
  maxOutputTokens: 800,
  webSearch: false,
};

// The paid path's limits, mirrored from api/chat/route.ts. Duplicated here
// on purpose: this file's job is to compare the two envelopes, and the
// comparison is only honest if both numbers are visible in one place.
// The test asserts these still match the route.
export const PAID_CHAT_LIMITS = {
  maxMessageChars: 10000,
  historyLimit: 20,
  maxOutputTokens: 2048,
  maxWebSearches: 3,
};

// Chars per token. Deliberately LOW (English averages ~4): fewer chars per
// token means more tokens means a higher estimated cost, and every
// rounding in this file has to fail towards over-estimating.
const CHARS_PER_TOKEN = 3.5;

// The chat system prompt is assembled from a persona, the user's memory
// summary (capped at 150 output tokens), a mentor context summary (max 15
// modules x short headlines) and up to 8 mentioned entities. Measured
// assembly runs ~1,000-2,500 tokens; 4,000 is the ceiling used here.
const SYSTEM_PROMPT_TOKENS_WORST_CASE = 4000;

// Tokens a single web search injects into the context. Anthropic returns
// several results with excerpts; 15,000 is a deliberately pessimistic
// ceiling for one search.
const WEB_SEARCH_RESULT_TOKENS = 15000;


// ---------------------------------------------------------------------------
// Worst-case cost
// ---------------------------------------------------------------------------

export type WorstCaseBreakdown = {
  inputTokens: number;
  outputTokens: number;
  webSearches: number;
  costUsd: number;
  costEur: number;
};

function pricing(model: string) {
  return MODEL_PRICING_USD[model] ?? FALLBACK_MODEL_PRICING;
}

/**
 * Worst-case cost of one FREE chat message.
 *
 * Single round trip: with the search tool absent there is no tool loop, so
 * the context is sent exactly once.
 */
export function freeChatWorstCaseCost(
  limits: FreeChatLimits = FREE_CHAT_LIMITS,
  config: PricingConfig = resolvePricingConfig()
): WorstCaseBreakdown {
  const p = pricing(CHAT_MODEL);

  const messageTokens = Math.ceil(limits.maxMessageChars / CHARS_PER_TOKEN);
  // Worst-case history: every slot filled, alternating a maximum-length
  // user message and a maximum-length reply.
  const userTurns = Math.ceil(limits.historyLimit / 2);
  const assistantTurns = Math.floor(limits.historyLimit / 2);
  const historyTokens = userTurns * messageTokens + assistantTurns * limits.maxOutputTokens;

  const inputTokens = SYSTEM_PROMPT_TOKENS_WORST_CASE + historyTokens + messageTokens;
  const outputTokens = limits.maxOutputTokens;

  const costUsd =
    (inputTokens / 1_000_000) * p.inputPerMTok + (outputTokens / 1_000_000) * p.outputPerMTok;

  return {
    inputTokens,
    outputTokens,
    webSearches: 0,
    costUsd,
    costEur: costUsd * config.usdToEurRate,
  };
}

// ---------------------------------------------------------------------------
// Per-message cost cap
// ---------------------------------------------------------------------------

/**
 * The hard EUR ceiling one FREE message may be estimated to cost.
 *
 * The size envelope above bounds cost INDIRECTLY (chars in, tokens out);
 * this bounds it directly, so free chat stays affordable even if the chat
 * model is upgraded to a pricier one — a message whose estimate exceeds
 * the cap simply goes through the normal paid path, with the client told
 * why (see api/chat's largeMessageNotice). Env-tunable without a deploy.
 */
export const DEFAULT_FREE_CHAT_MAX_COST_EUR = 0.02;

let warnedMaxCost = false;

export function freeChatMaxCostEur(env: Record<string, string | undefined> = process.env): number {
  const raw = env.FREE_CHAT_MAX_COST_EUR;
  if (raw === undefined || raw.trim() === "") return DEFAULT_FREE_CHAT_MAX_COST_EUR;
  const parsed = Number(raw);
  // Above €1 per free message is treated as a typo, like the other
  // pricing envs: a silent acceptance would quietly turn the free tier
  // into an unbounded marketing spend.
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 1) {
    if (!warnedMaxCost) {
      warnedMaxCost = true;
      // eslint-disable-next-line no-console
      console.warn(
        `[free-chat] FREE_CHAT_MAX_COST_EUR="${raw}" ignored (must be a number in (0, 1]) — using ${DEFAULT_FREE_CHAT_MAX_COST_EUR}.`
      );
    }
    return DEFAULT_FREE_CHAT_MAX_COST_EUR;
  }
  return parsed;
}

/**
 * Conservative estimate of what THIS message adds to the bill: its own
 * text, the real system prompt it will be sent with, and a maximum-length
 * reply — at the chat model's real rates, rounding high (3.5 chars/token,
 * full output).
 *
 * Deliberately the message's MARGINAL cost, not the whole envelope: the
 * history window is a bounded property of the envelope (historyLimit is
 * hard-capped at 6 short turns and priced into the economics separately —
 * see freeChatPerMessageWorstCaseEur), and folding its worst case into
 * this gate would push even a two-word message over the €0.02 default
 * cap, silently turning the free tier off.
 *
 * api/chat compares this against freeChatMaxCostEur() BEFORE claiming a
 * free message — over the cap, the message falls through to the paid
 * path exactly as an over-length one does.
 */
export function freeChatMessageEstimatedCostEur(
  messageChars: number,
  systemPromptChars: number,
  config: PricingConfig = resolvePricingConfig(),
  limits: FreeChatLimits = FREE_CHAT_LIMITS
): number {
  const p = pricing(CHAT_MODEL);

  const messageTokens = Math.ceil(Math.max(0, messageChars) / CHARS_PER_TOKEN);
  const systemTokens = Math.ceil(Math.max(0, systemPromptChars) / CHARS_PER_TOKEN);
  const inputTokens = systemTokens + messageTokens;
  const outputTokens = limits.maxOutputTokens;

  const costUsd =
    (inputTokens / 1_000_000) * p.inputPerMTok + (outputTokens / 1_000_000) * p.outputPerMTok;
  return costUsd * config.usdToEurRate;
}

/**
 * Worst-case cost of the free envelope's HISTORY window alone — what the
 * cost-cap gate deliberately leaves out, priced here so the economics can
 * add it back in.
 */
export function freeChatHistoryWorstCaseEur(
  config: PricingConfig = resolvePricingConfig(),
  limits: FreeChatLimits = FREE_CHAT_LIMITS
): number {
  const p = pricing(CHAT_MODEL);
  const capTokens = Math.ceil(limits.maxMessageChars / CHARS_PER_TOKEN);
  const userTurns = Math.ceil(limits.historyLimit / 2);
  const assistantTurns = Math.floor(limits.historyLimit / 2);
  const historyTokens = userTurns * capTokens + assistantTurns * limits.maxOutputTokens;
  return (historyTokens / 1_000_000) * p.inputPerMTok * config.usdToEurRate;
}

/**
 * Worst-case cost of one PAID chat message, for comparison.
 *
 * The tool loop is what makes this expensive: with `max_uses: 3` the model
 * can make up to 4 API round trips, and each one re-sends the whole
 * context INCLUDING the results of every search so far. So the input is
 * charged roughly four times over, growing each round.
 */
export function fullChatWorstCaseCost(
  config: PricingConfig = resolvePricingConfig()
): WorstCaseBreakdown {
  const p = pricing(CHAT_MODEL);
  const L = PAID_CHAT_LIMITS;

  const messageTokens = Math.ceil(L.maxMessageChars / CHARS_PER_TOKEN);
  const userTurns = Math.ceil(L.historyLimit / 2);
  const assistantTurns = Math.floor(L.historyLimit / 2);
  const historyTokens = userTurns * messageTokens + assistantTurns * L.maxOutputTokens;

  const baseInput = SYSTEM_PROMPT_TOKENS_WORST_CASE + historyTokens + messageTokens;

  // Round 0 sends the base context. Each search adds its results, and the
  // next round re-sends everything accumulated so far.
  let cumulativeInput = 0;
  let context = baseInput;
  for (let round = 0; round <= L.maxWebSearches; round++) {
    cumulativeInput += context;
    context += WEB_SEARCH_RESULT_TOKENS;
  }

  const outputTokens = L.maxOutputTokens * (L.maxWebSearches + 1);

  const costUsd =
    (cumulativeInput / 1_000_000) * p.inputPerMTok +
    (outputTokens / 1_000_000) * p.outputPerMTok +
    L.maxWebSearches * WEB_SEARCH_USD_PER_QUERY;

  return {
    inputTokens: cumulativeInput,
    outputTokens,
    webSearches: L.maxWebSearches,
    costUsd,
    costEur: costUsd * config.usdToEurRate,
  };
}

export const FULL_CHAT_WORST_CASE = fullChatWorstCaseCost;

// ---------------------------------------------------------------------------
// Per-plan allowance
// ---------------------------------------------------------------------------

/**
 * The share of a plan's monthly price that free chat is allowed to burn in
 * the worst case. Kept well under the 25% ceiling so a future model price
 * rise doesn't silently breach it.
 */
export const FREE_CHAT_MAX_COST_SHARE = 0.25;

/**
 * Monthly free-chat allowance per plan.
 *
 * Paid plans are sized to land at ~20% of the plan price at absolute worst
 * case, leaving headroom under the 25% ceiling. Free is not a percentage
 * of anything (its price is zero), so it gets a flat, small allowance —
 * an acquisition cost, chosen so a free account can have a real
 * conversation before hitting the paywall.
 *
 * Enterprise has no fixed price, so it inherits Ultimate's number rather
 * than being unbounded.
 */
export const DEFAULT_FREE_CHAT_MESSAGES: Record<PlanSlug, number> = {
  free: 15,
  starter: 120,
  growth: 300,
  professional: 600,
  ultimate: 1200,
  enterprise: 1200,
};

const ENV_KEYS: Record<PlanSlug, string> = {
  free: "FREE_CHAT_MESSAGES_FREE",
  starter: "FREE_CHAT_MESSAGES_STARTER",
  growth: "FREE_CHAT_MESSAGES_GROWTH",
  professional: "FREE_CHAT_MESSAGES_PROFESSIONAL",
  ultimate: "FREE_CHAT_MESSAGES_ULTIMATE",
  enterprise: "FREE_CHAT_MESSAGES_ENTERPRISE",
};

/**
 * The share of the plan price the allowance is SIZED to (headroom under
 * the 25% FREE_CHAT_MAX_COST_SHARE ceiling it must never breach).
 */
export const FREE_CHAT_TARGET_SHARE = 0.2;

/**
 * The worst a single FREE message can cost.
 *
 * Two independent ceilings, and the lower one wins:
 *  - the ENVELOPE's worst case (max message, full history, max reply);
 *  - the COST-CAP gate plus the history the gate deliberately excludes —
 *    a granted message's marginal cost is at most the cap, and the only
 *    cost on top of that is the bounded history window.
 */
export function freeChatPerMessageWorstCaseEur(
  config: PricingConfig = resolvePricingConfig()
): number {
  return Math.min(
    freeChatWorstCaseCost(FREE_CHAT_LIMITS, config).costEur,
    freeChatMaxCostEur() + freeChatHistoryWorstCaseEur(config)
  );
}

/**
 * The largest allowance a priced plan can carry without its worst case
 * breaching the sizing target. Null for plans with no fixed price (Free,
 * Enterprise) — they are bounded by the per-message cap instead.
 */
export function maxAllowanceWithinCeiling(
  planSlug: PlanSlug,
  config: PricingConfig = resolvePricingConfig()
): number | null {
  const plan = getPlan(planSlug);
  const price = plan?.price;
  if (typeof price !== "number" || price <= 0) return null;
  const perMessage = freeChatPerMessageWorstCaseEur(config);
  if (!(perMessage > 0)) return null;
  return Math.floor((price * FREE_CHAT_TARGET_SHARE) / perMessage);
}

/**
 * Free messages per month for a plan.
 *
 * Env override per plan, so the allowance can be tuned in production
 * without a deploy. A malformed or negative value falls back to the
 * default rather than accidentally disabling (or unbounding) the feature.
 * `FREE_CHAT_ENABLED=false` turns the whole feature off.
 *
 * Whatever the source, the result is CLAMPED to the 25%-ceiling-derived
 * maximum for priced plans. That is what makes the ceiling a property of
 * the code rather than of whoever last edited an env var: raising the
 * allowance, or the model getting pricier, cannot silently push free chat
 * past the share of plan revenue it is allowed to burn.
 */
export function freeChatAllowance(planSlug: PlanSlug): number {
  if (process.env.FREE_CHAT_ENABLED === "false") return 0;

  let configured = DEFAULT_FREE_CHAT_MESSAGES[planSlug] ?? 0;
  const raw = process.env[ENV_KEYS[planSlug]];
  if (raw !== undefined && raw !== "") {
    const parsed = Number(raw);
    if (Number.isFinite(parsed) && parsed >= 0) configured = Math.floor(parsed);
  }

  const ceilingMax = maxAllowanceWithinCeiling(planSlug);
  return ceilingMax === null ? configured : Math.min(configured, ceilingMax);
}

export type PlanFreeChatEconomics = {
  planSlug: PlanSlug;
  planPriceEur: number | "custom";
  freeMessages: number;
  worstCaseCostEur: number;
  /** null for plans with no fixed price — a share of "custom" is undefined. */
  shareOfPrice: number | null;
  withinCeiling: boolean;
};

/**
 * The per-plan table: allowance, worst-case cost, and what share of the
 * plan price that is. This is what proves the feature cannot lose money at
 * a rate the plan price doesn't cover.
 */
export function freeChatEconomics(
  config: PricingConfig = resolvePricingConfig()
): PlanFreeChatEconomics[] {
  const perMessage = freeChatPerMessageWorstCaseEur(config);

  return PLANS.map((plan) => {
    const freeMessages = freeChatAllowance(plan.slug);
    const worstCaseCostEur = freeMessages * perMessage;
    const price = plan.price;

    // A free plan has no price to take a share of, and neither does
    // Enterprise. Both are judged on the absolute number instead, so
    // shareOfPrice is null rather than Infinity or a fake 0.
    const shareOfPrice =
      typeof price === "number" && price > 0 ? worstCaseCostEur / price : null;

    return {
      planSlug: plan.slug,
      planPriceEur: price,
      freeMessages,
      worstCaseCostEur,
      shareOfPrice,
      withinCeiling: shareOfPrice === null ? true : shareOfPrice <= FREE_CHAT_MAX_COST_SHARE,
    };
  });
}

/** Convenience for the route: the allowance for a plan slug string. */
export function freeChatAllowanceForSlug(slug: string): number {
  const plan = getPlan(slug);
  return freeChatAllowance((plan?.slug ?? "free") as PlanSlug);
}
