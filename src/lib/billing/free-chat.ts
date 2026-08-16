import type { PlanSlug } from "@/lib/billing/plans";
import { PLANS, getPlan } from "@/lib/billing/plans";
import { CHAT_MODEL } from "@/lib/ai-models";
import {
  MODEL_PRICING_USD,
  FALLBACK_MODEL_PRICING,
  WEB_SEARCH_USD_PER_QUERY,
} from "@/lib/billing/model-pricing";
import { resolvePricingConfig, type PricingConfig } from "@/lib/billing/pricing-config";
import {
  DECLARED_ALLOWANCE_SHARES,
  FREE_PLAN_MAX_MONTHLY_COST_EUR,
  allowanceBudgetEur,
  ceilingPriceEur,
  creditCeilingEur,
} from "@/lib/billing/ceiling";

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

/**
 * The envelope as of the combined-ceiling change.
 *
 * `historyLimit` 6 -> 2 and `maxOutputTokens` 800 -> 600 are not a cost
 * cut for its own sake. The alternative was cutting the message COUNT, and
 * the arithmetic says the envelope is by far the cheaper place to take it:
 *
 *   per-message worst case  EUR 0.03136 -> EUR 0.02323   (-25.9%)
 *
 * The history window is the reason a free message costs more than the
 * EUR 0.02 cost cap suggests — 6 turns of maximum-length context is
 * EUR 0.0114 of input that the cap deliberately does not count (see
 * freeChatMessageEstimatedCostEur). Cutting it to 2 removes three quarters
 * of that without touching what the user can ASK: maxMessageChars is
 * unchanged at 2,000.
 *
 * Dropping the reply cap to 600 tokens pays for itself twice, because
 * output is charged at 5x input: it makes each message cheaper AND it
 * lowers the estimate the cost-cap gate computes, so messages that used to
 * fall through to the paid path now qualify as free. Measured against a
 * 4,000-token system prompt with a 500-character question:
 *
 *   at 800 output tokens  EUR 0.0225  -> over the EUR 0.02 cap, PAID
 *   at 600 output tokens  EUR 0.0197  -> under the cap, FREE
 */
export const FREE_CHAT_LIMITS: FreeChatLimits = {
  maxMessageChars: 2000,
  historyLimit: 2,
  maxOutputTokens: 600,
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
 * The id this quota is registered under — in FREE_ALLOWANCES
 * (lib/billing/free-allowances.ts) and in DECLARED_ALLOWANCE_SHARES
 * (lib/billing/ceiling.ts), which is where its 5% budget lives.
 */
export const FREE_CHAT_ALLOWANCE_ID = "free_chat";

/**
 * Monthly free-chat allowance per plan.
 *
 * Sized to the 5% of plan price the quota registry allocates it — the
 * remainder of the 25% combined ceiling after the credit subsystem's 20%
 * (M = 5). These are the numbers that fall out of
 * `budget / freeChatPerMessageWorstCaseEur()`; the clamp in
 * freeChatAllowance re-derives them at runtime, so they cannot drift from
 * the ceiling even if this table is edited by hand.
 *
 * They are lower than the 120/300/600/1,200 that shipped before, and that
 * is the whole point: those numbers cost 18.8% of revenue on top of a
 * credit subsystem that already cost 20-25%, for a combined 38.8-43.8%
 * against a 25% ceiling. Existing subscribers keep their old numbers —
 * see legacyFreeChatMessages below and the grandfathering migration.
 *
 * Free is not a percentage of anything (its price is zero), so it keeps a
 * flat allowance bounded by FREE_PLAN_MAX_MONTHLY_COST_EUR instead.
 * Enterprise inherits Ultimate's number rather than being unbounded.
 */
export const DEFAULT_FREE_CHAT_MESSAGES: Record<PlanSlug, number> = {
  free: 15,
  starter: 43,
  growth: 107,
  professional: 215,
  ultimate: 430,
  enterprise: 430,
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
 * The share of the plan price this quota is allocated.
 *
 * Re-exported from lib/billing/ceiling.ts rather than declared here: the
 * whole failure this change exists to fix was free chat owning its own
 * private idea of what share of revenue it could burn. There is now
 * exactly one table of shares, in one file, and the build gate checks it
 * against the credit subsystem's 1/M.
 */
export const FREE_CHAT_TARGET_SHARE = DECLARED_ALLOWANCE_SHARES[FREE_CHAT_ALLOWANCE_ID];

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
  config: PricingConfig = resolvePricingConfig(),
  env: Record<string, string | undefined> = process.env
): number {
  return Math.min(
    freeChatWorstCaseCost(FREE_CHAT_LIMITS, config).costEur,
    freeChatMaxCostEur(env) + freeChatHistoryWorstCaseEur(config)
  );
}

/**
 * The largest allowance this plan can carry without the COMBINED worst
 * case — credits plus every other free quota plus this one — breaching the
 * ceiling.
 *
 * This used to be `price * 0.2 / perMessage`: free chat's own private
 * share, computed as though nothing else spent money. That is the bug.
 * Two subsystems each sizing themselves against the full ceiling is how
 * Professional reached 43.8% with both halves reporting healthy.
 *
 * It now asks lib/billing/ceiling.ts for what is actually LEFT after the
 * credit subsystem's 1/M and every other declared quota. Three
 * consequences worth stating, because each one was a hole:
 *
 *  - Lowering CREDIT_MARGIN_<PLAN> to the floor of 4 pushes credits to the
 *    whole 25% and this returns 0. The quota turns itself off rather than
 *    letting the ceiling be breached from the environment.
 *  - Free has no price, so it is bounded by an ABSOLUTE monthly cost
 *    instead — minus what its credit grant already costs. Before this it
 *    returned null and FREE_CHAT_MESSAGES_FREE was completely unclamped.
 *  - Enterprise is measured against ENTERPRISE_MIN_PRICE_EUR. Before this
 *    it was also unclamped: FREE_CHAT_MESSAGES_ENTERPRISE=100000 was
 *    accepted and produced 809% of a EUR 400 contract.
 */
export function maxAllowanceWithinCeiling(
  planSlug: PlanSlug,
  config: PricingConfig = resolvePricingConfig(),
  env: Record<string, string | undefined> = process.env
): number | null {
  const perMessage = freeChatPerMessageWorstCaseEur(config, env);
  if (!(perMessage > 0)) return null;

  const budgetEur = allowanceBudgetEur(FREE_CHAT_ALLOWANCE_ID, planSlug, config, env);
  if (budgetEur !== null) return Math.max(0, Math.floor(budgetEur / perMessage));

  // No price to take a share of — the Free plan. Its credit grant and its
  // free messages come out of one flat acquisition budget, so what is left
  // for messages is the budget minus what the credits already cost.
  const creditCost = creditCeilingEur(planSlug, config, env) ?? 0;
  const remaining = FREE_PLAN_MAX_MONTHLY_COST_EUR - creditCost;
  return Math.max(0, Math.floor(remaining / perMessage));
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
export function freeChatAllowance(
  planSlug: PlanSlug,
  config: PricingConfig = resolvePricingConfig(),
  env: Record<string, string | undefined> = process.env
): number {
  if (env.FREE_CHAT_ENABLED === "false") return 0;

  let configured = DEFAULT_FREE_CHAT_MESSAGES[planSlug] ?? 0;
  const raw = env[ENV_KEYS[planSlug]];
  if (raw !== undefined && raw !== "") {
    const parsed = Number(raw);
    if (Number.isFinite(parsed) && parsed >= 0) configured = Math.floor(parsed);
  }

  const ceilingMax = maxAllowanceWithinCeiling(planSlug, config, env);
  return ceilingMax === null ? configured : Math.min(configured, ceilingMax);
}

export type PlanFreeChatEconomics = {
  planSlug: PlanSlug;
  planPriceEur: number | "custom";
  freeMessages: number;
  worstCaseCostEur: number;
  /**
   * Share of the price this plan is MEASURED against — the published price,
   * or ENTERPRISE_MIN_PRICE_EUR for the custom-priced tier. Null only for
   * Free, whose price is genuinely zero.
   */
  shareOfPrice: number | null;
  /** The EUR this quota was allocated on this plan; null for Free. */
  budgetEur: number | null;
  /**
   * Whether this quota fits its OWN allocated budget. Not "are we at 4x" —
   * that is combinedCeilingFor() in lib/billing/free-allowances.ts.
   */
  withinBudget: boolean;
};

/**
 * The per-plan table: allowance, worst-case cost, and what share of the
 * plan price that is.
 *
 * `withinCeiling` here answers a DELIBERATELY NARROW question — "does this
 * quota fit inside the budget it was allocated" — not "are we at 4x". The
 * second question belongs to combinedCeilingFor() in
 * lib/billing/free-allowances.ts, which is the only function that sees
 * every subsystem at once. Answering it here, from inside one subsystem,
 * with one subsystem's numbers, is precisely the mistake this file used to
 * make: it reported `withinCeiling: true` at 18.8% while the account it
 * described was really at 43.8%.
 *
 * Enterprise is no longer exempt. It has a contractual floor price
 * (ENTERPRISE_MIN_PRICE_EUR), so a share of it is defined and checked;
 * only Free — whose price is genuinely zero — falls back to the absolute
 * acquisition budget.
 */
export function freeChatEconomics(
  config: PricingConfig = resolvePricingConfig(),
  env: Record<string, string | undefined> = process.env
): PlanFreeChatEconomics[] {
  const perMessage = freeChatPerMessageWorstCaseEur(config, env);

  return PLANS.map((plan) => {
    const freeMessages = freeChatAllowance(plan.slug, config, env);
    const worstCaseCostEur = freeMessages * perMessage;

    // The price the CEILING measures against, not plan.price. Enterprise
    // used to report a null share here purely because its price is the
    // string "custom" — which is how it ended up carrying Ultimate's
    // 1,200-message allowance with nothing to check it against.
    const measuredPrice = ceilingPriceEur(plan.slug, env);
    const budgetEur = allowanceBudgetEur(FREE_CHAT_ALLOWANCE_ID, plan.slug, config, env);

    return {
      planSlug: plan.slug,
      planPriceEur: plan.price,
      freeMessages,
      worstCaseCostEur,
      shareOfPrice: measuredPrice === null ? null : worstCaseCostEur / measuredPrice,
      budgetEur,
      withinBudget:
        budgetEur === null
          ? worstCaseCostEur + (creditCeilingEur(plan.slug, config, env) ?? 0) <=
            FREE_PLAN_MAX_MONTHLY_COST_EUR + 1e-9
          : worstCaseCostEur <= budgetEur + 1e-9,
    };
  });
}

/** Convenience for the route: the allowance for a plan slug string. */
export function freeChatAllowanceForSlug(
  slug: string,
  config: PricingConfig = resolvePricingConfig(),
  env: Record<string, string | undefined> = process.env
): number {
  const plan = getPlan(slug);
  return freeChatAllowance((plan?.slug ?? "free") as PlanSlug, config, env);
}

// ---------------------------------------------------------------------------
// Grandfathering
// ---------------------------------------------------------------------------

/**
 * A grandfathered account's entitlements, as plain data.
 *
 * Structurally identical to LegacyEntitlements in
 * lib/billing/legacy-entitlements.ts, restated here so this module stays
 * free of `server-only` — every function in this file is also used by the
 * economics tables and the build gate, which have no database.
 */
export type FreeChatLegacy = {
  planTier: string | null;
  freeChatMessages: number | null;
  freeChatHistoryLimit: number | null;
  freeChatMaxOutputTokens: number | null;
  until: Date | null;
};

/**
 * An entitlement is in force only on the plan it was granted for.
 *
 * The plan check is not redundant with clearing on plan change. A beta
 * account carries plan_tier 'ultimate' and drops to Free the moment
 * beta_expires_at passes — no Stripe event, no webhook, nothing to call
 * clearLegacyEntitlements. Without this comparison such an account would
 * keep Ultimate's 1,200 free messages, EUR 37.63/month, on a plan that
 * pays nothing at all.
 */
function legacyInForce(
  legacy: FreeChatLegacy | null | undefined,
  planSlug: PlanSlug,
  now: Date
): boolean {
  if (!legacy || legacy.freeChatMessages === null) return false;
  if (legacy.planTier !== planSlug) return false;
  return legacy.until === null || legacy.until.getTime() > now.getTime();
}

/**
 * The allowance for an account, honouring a grandfathered one.
 *
 * `max`, not "legacy wins": if the published allowance ever grows past
 * what an account was grandfathered, the account should get the larger
 * number rather than being frozen at a figure that used to be generous.
 */
export function freeChatAllowanceForAccount(
  planSlug: PlanSlug,
  legacy: FreeChatLegacy | null | undefined,
  config: PricingConfig = resolvePricingConfig(),
  env: Record<string, string | undefined> = process.env,
  now: Date = new Date()
): number {
  const published = freeChatAllowance(planSlug, config, env);
  // FREE_CHAT_ENABLED=false is a kill switch, not a pricing change — it
  // has to turn the feature off for grandfathered accounts too.
  if (env.FREE_CHAT_ENABLED === "false") return 0;
  if (!legacyInForce(legacy, planSlug, now)) return published;
  return Math.max(published, legacy!.freeChatMessages!);
}

/**
 * The envelope a free message runs in for this account.
 *
 * The stored numbers are used as-is rather than "the constants as they
 * were", so the exception cannot silently start tracking a future
 * envelope change in either direction. `max` for the same reason as the
 * allowance: a later, more generous published envelope should reach
 * grandfathered accounts too.
 */
export function freeChatLimitsForAccount(
  planSlug: PlanSlug,
  legacy: FreeChatLegacy | null | undefined,
  now: Date = new Date()
): FreeChatLimits {
  if (!legacyInForce(legacy, planSlug, now)) return FREE_CHAT_LIMITS;
  return {
    ...FREE_CHAT_LIMITS,
    historyLimit: Math.max(FREE_CHAT_LIMITS.historyLimit, legacy!.freeChatHistoryLimit ?? 0),
    maxOutputTokens: Math.max(
      FREE_CHAT_LIMITS.maxOutputTokens,
      legacy!.freeChatMaxOutputTokens ?? 0
    ),
  };
}

/**
 * What one grandfathered account costs per month, worst case, ON TOP of
 * what the published numbers would have cost.
 *
 * The whole point of a bounded exception is that its size is a number
 * somebody can look at. This is that number, per account; multiplied by
 * the cohort count (a SQL query in the migration header) it is the total
 * the ceiling is knowingly over by.
 */
export function legacyExcessCostEur(
  planSlug: PlanSlug,
  legacy: FreeChatLegacy | null | undefined,
  config: PricingConfig = resolvePricingConfig(),
  env: Record<string, string | undefined> = process.env,
  now: Date = new Date()
): number {
  if (!legacyInForce(legacy, planSlug, now)) return 0;
  const publishedMessages = freeChatAllowance(planSlug, config, env);
  const publishedCost = publishedMessages * freeChatPerMessageWorstCaseEur(config, env);

  const limits = freeChatLimitsForAccount(planSlug, legacy, now);
  const perMessage = Math.min(
    freeChatWorstCaseCost(limits, config).costEur,
    freeChatMaxCostEur(env) + freeChatHistoryWorstCaseEur(config, limits)
  );
  const legacyCost = freeChatAllowanceForAccount(planSlug, legacy, config, env, now) * perMessage;
  return Math.max(0, legacyCost - publishedCost);
}
