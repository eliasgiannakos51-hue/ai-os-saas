import { PLANS, type Plan, type PlanSlug } from "@/lib/billing/plans";
import { creditsForRealCostOnRate, effectiveCreditPriceEur, usdToEur } from "@/lib/billing/credit-formula";
import { estimateForAction, type ActionProfileKey } from "@/lib/billing/estimate";
import { resolvePricingConfig, type PricingConfig } from "@/lib/billing/pricing-config";
import { WEBSITE_BUILDER_MODEL } from "@/lib/ai-models";

// "1,000 credits/month" tells a buyer nothing. It is a unit they have
// never used, priced against work they have not seen, and the only way to
// find out what it buys is to spend it — which is the worst possible
// moment to discover the answer.
//
// This file turns the allowance into the sentence a buyer can actually
// act on: "~19 websites, or 330 chat messages, or 40 missions a month".
//
// THE ONE RULE IT MUST NOT BREAK. Nothing here prices anything. Every
// number is derived by running the SAME estimator the reservation uses
// (lib/billing/estimate.ts) through the SAME formula settlement uses
// (creditsForRealCostOnRate) at the SAME per-credit rate the plan already
// implies. It is a READ of the pricing model, never a second copy of it.
// Change the multiplier and these numbers move with it; they cannot drift
// away from what is charged, because there is no second source of truth
// to drift from. scripts/tests/plan-allowance.test.mjs pins that
// property by re-deriving every figure from the formula and by asserting
// the 4x floor still holds on every row it produces.

/** The actions a buyer recognises. Deliberately not every billable call —
 *  nobody chooses a plan by how many column-mapping calls it buys. */
export type AllowanceActionKey =
  | "website"
  | "chatMessage"
  | "mission"
  | "agentRun"
  | "deepResearch"
  | "fileAsk";

export type AllowanceAction = {
  key: AllowanceActionKey;
  /** The estimator profile this action actually reserves against. */
  profile: ActionProfileKey;
  /** The `feature` string this action writes to ai_cost_log, so a measured
   *  median can be matched back to it. Several features can map to one
   *  action (an agent run is billed under two different names depending on
   *  whether a human or the cron started it). */
  features: string[];
  /**
   * A TYPICAL request, in characters, used only when there is no measured
   * data yet. These are not upper bounds like the reservation profiles use
   * — a hold must lean high, but a "what can I do this month" figure that
   * leans high tells the buyer they can do LESS than they really can, and
   * that is the lie that loses the sale honestly earned. Sized at what a
   * real request in this product looks like.
   */
  typicalInputChars: number;
  expectedWebSearches?: number;
  /** Plans that cannot use this action at all never quote it. */
  requires?: (plan: Plan) => boolean;
};

export const ALLOWANCE_ACTIONS: AllowanceAction[] = [
  {
    key: "website",
    profile: "websiteGenerate",
    features: ["website_generate"],
    // A description someone actually types into the Website Builder: a
    // paragraph about the business and a list of the sections they want.
    typicalInputChars: 600,
    requires: (p) => p.capabilities.websiteBuilder,
  },
  {
    key: "chatMessage",
    profile: "chatMessage",
    features: ["chat_message"],
    typicalInputChars: 300,
  },
  {
    key: "mission",
    profile: "missionPlan",
    features: ["mission_plan"],
    typicalInputChars: 200,
    // lib/mission-agents.ts's research pass runs a handful of searches
    // before planning, and Anthropic bills those per query rather than per
    // token — leaving them out understates a mission by a real amount.
    expectedWebSearches: 3,
  },
  {
    key: "agentRun",
    profile: "agentRun",
    features: ["agent_run", "scheduled_agent_run"],
    typicalInputChars: 400,
    expectedWebSearches: 2,
    requires: (p) => p.capabilities.maxAiAgents === "unlimited" || p.capabilities.maxAiAgents > 0,
  },
  {
    key: "deepResearch",
    profile: "deepResearch",
    features: ["deep_research"],
    typicalInputChars: 200,
    expectedWebSearches: 12,
  },
  {
    key: "fileAsk",
    profile: "fileAsk",
    features: ["file_ask"],
    // A question is short; the cost is the documents. ~15,000 characters
    // is a handful of pages, which is what people actually attach.
    typicalInputChars: 15000,
  },
];

export function getAllowanceAction(key: AllowanceActionKey): AllowanceAction | undefined {
  return ALLOWANCE_ACTIONS.find((a) => a.key === key);
}

/** Where a per-action cost came from. Surfaced so the UI can be honest
 *  about it and so a test can tell the two apart. */
export type CostSource = "measured" | "estimated";

export type ActionCostUsd = {
  usd: number;
  source: CostSource;
  /** How many settled actions the median was taken over (0 when estimated). */
  samples: number;
};

/** Measured medians, keyed by ai_cost_log.feature. Produced by
 *  lib/billing/measured-costs.ts; absent everywhere it has no data. */
export type MeasuredCostsByFeature = Record<string, { medianUsd: number; samples: number }>;

/** Below this, a median is one person's afternoon rather than a fact
 *  about the product, and the estimator is the better guess. */
export const MIN_SAMPLES_FOR_MEASURED = 5;

/**
 * What one typical run of this action costs us, in USD.
 *
 * Prefers the MEDIAN of what it has really cost — the median rather than
 * the mean because one runaway generation should not make the plan look
 * half as capable as it is, and one trivial retry should not make it look
 * twice as capable.
 */
export function actionCostUsd(
  action: AllowanceAction,
  measured: MeasuredCostsByFeature | undefined,
  config: PricingConfig,
  minSamples: number = MIN_SAMPLES_FOR_MEASURED
): ActionCostUsd {
  if (measured) {
    let usdWeighted = 0;
    let samples = 0;
    for (const feature of action.features) {
      const row = measured[feature];
      if (!row || !Number.isFinite(row.medianUsd) || row.medianUsd <= 0 || row.samples <= 0) continue;
      usdWeighted += row.medianUsd * row.samples;
      samples += row.samples;
    }
    if (samples >= minSamples && usdWeighted > 0) {
      return { usd: usdWeighted / samples, source: "measured", samples };
    }
  }

  const estimate = estimateForAction(
    action.profile,
    {
      model: WEBSITE_BUILDER_MODEL,
      inputChars: action.typicalInputChars,
      expectedWebSearches: action.expectedWebSearches,
    },
    config
  );
  return { usd: estimate.estimatedUsd, source: "estimated", samples: 0 };
}

export type AllowanceRow = {
  key: AllowanceActionKey;
  /** Credits ONE run of this action costs on this plan. */
  creditsPerAction: number;
  /** How many of them the monthly allowance buys. */
  perMonth: number;
  source: CostSource;
  samples: number;
};

export type PlanAllowance = {
  slug: PlanSlug;
  /** null for Enterprise, whose allowance is negotiated per deal. */
  monthlyCredits: number | null;
  rows: AllowanceRow[];
};

/**
 * How many of each action a plan's monthly credits buy.
 *
 * The per-credit rate is the plan's OWN rate, the same one settlement
 * divides by — which is why the answer is not simply "the cheaper plan
 * gets proportionally more". A Professional credit is worth half a
 * Starter credit, so the same generation costs twice as many credits
 * there; the allowance is 10x larger, so the real ratio is 5x, and that
 * is the number a buyer needs rather than the 10x the credit counts imply.
 */
export function planAllowance(
  plan: Plan,
  measured: MeasuredCostsByFeature | undefined,
  config?: PricingConfig
): PlanAllowance {
  const c = config ?? resolvePricingConfig();
  const rate = effectiveCreditPriceEur(plan, c);
  const monthly = typeof plan.monthlyCredits === "number" ? plan.monthlyCredits : null;

  const rows: AllowanceRow[] = [];
  for (const action of ALLOWANCE_ACTIONS) {
    if (action.requires && !action.requires(plan)) continue;
    const cost = actionCostUsd(action, measured, c);
    const creditsPerAction = creditsForRealCostOnRate(usdToEur(cost.usd, c), rate, c);
    if (creditsPerAction <= 0) continue;
    rows.push({
      key: action.key,
      creditsPerAction,
      // floor, never round: telling someone they get 2 websites when the
      // second one runs out of credits halfway is the exact failure this
      // whole file exists to prevent.
      perMonth: monthly === null ? 0 : Math.floor(monthly / creditsPerAction),
      source: cost.source,
      samples: cost.samples,
    });
  }
  return { slug: plan.slug, monthlyCredits: monthly, rows };
}

export function allAllowances(
  measured: MeasuredCostsByFeature | undefined,
  config?: PricingConfig
): PlanAllowance[] {
  const c = config ?? resolvePricingConfig();
  return PLANS.map((p) => planAllowance(p, measured, c));
}

/**
 * The two or three actions worth putting on a pricing card.
 *
 * Chosen by what the plan can actually do and what a buyer of THAT plan
 * is buying it for, not by cost: quoting Free's allowance in websites
 * would be quoting a feature Free does not have, and quoting Ultimate in
 * chat messages ("21,000 messages") is a number so large it stops meaning
 * anything.
 */
export const HEADLINE_ACTIONS: Record<PlanSlug, AllowanceActionKey[]> = {
  free: ["chatMessage", "mission"],
  starter: ["website", "chatMessage", "mission"],
  growth: ["website", "chatMessage", "agentRun"],
  professional: ["website", "agentRun", "deepResearch"],
  ultimate: ["website", "agentRun", "deepResearch"],
  enterprise: [],
};

export function headlineRows(allowance: PlanAllowance): AllowanceRow[] {
  const wanted = HEADLINE_ACTIONS[allowance.slug] ?? [];
  const out: AllowanceRow[] = [];
  for (const key of wanted) {
    const row = allowance.rows.find((r) => r.key === key);
    // A row that buys nothing at all is not a selling point, and "0
    // websites" on a card is worse than saying nothing — it is the
    // sentence that made this whole exercise necessary.
    if (row && row.perMonth > 0) out.push(row);
  }
  return out;
}
