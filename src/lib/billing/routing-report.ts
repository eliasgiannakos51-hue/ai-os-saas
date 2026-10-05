import { pricingForModel } from "@/lib/billing/model-pricing";

/**
 * THE NUMBERS BEHIND /dashboard/costs' ROUTER SECTION (BUILD-SPECS 2.13 Ζ).
 *
 * Pure: rows in, figures out. The page reads ai_cost_log (one row per
 * settled action) and ai_provider_log (one row per provider attempt) and
 * hands them here, so every sum on the screen is a function this file
 * owns and scripts/tests/routing-report.test.mjs checks against figures
 * worked out by hand (scenario 11).
 *
 * TWO THINGS THIS DOES NOT PRETEND.
 *
 *   - "Escalated to a stronger model" is null, not 0. Nothing escalates
 *     yet (the router is in the shadow, lib/ai/routing/shadow.ts), and a
 *     0% would read as "measured and never needed".
 *   - The shadow projection is a projection. It reprices the SAME tokens
 *     at the shadow model's list price; it does not know whether that
 *     model would have needed more tokens, cached differently (Haiku's
 *     cache minimum is four times Sonnet's — route.ts), or failed. The
 *     page labels it as such.
 */

export type CostLogRow = {
  feature: string;
  real_cost_usd: number | string | null;
  real_cost_eur: number | string | null;
  credits_charged: number | null;
  input_tokens: number | null;
  output_tokens: number | null;
  cache_read_tokens: number | null;
  cache_write_tokens: number | null;
  metadata: Record<string, unknown> | null;
};

export type ProviderAttemptRow = {
  request_id: string;
  attempt_index: number;
  outcome: string;
};

export type Bucket = { key: string; requests: number; costEur: number; avgEur: number };

export type RoutingReport = {
  requests: number;
  costEur: number;
  avgCostPerRequestEur: number | null;
  byFeature: Bucket[];
  byCategory: Bucket[];
  byTier: Bucket[];
  byModel: Bucket[];
  /** Share of requests per tier, over the rows that carry a decision. */
  tierShare: { tier: string; share: number }[];
  /** Rows settled before the shadow existed, or for non-text features. */
  unclassified: number;
  /** Share of decided rows whose low confidence moved the tier up. */
  bumpedShare: number | null;
  escalatedShare: null;
  /** Share of provider requests answered by an attempt after the first.
   *  Null when the provider log could not be read. */
  fallbackShare: number | null;
  /** Cache reads over all prompt tokens. */
  cachedTokenShare: number | null;
  revenueEur: number;
  /** Revenue over cost; null when nothing cost anything. */
  margin: number | null;
  shadow: { projectedCostEur: number; actualCostEur: number; rows: number };
};

const num = (v: unknown): number => {
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : 0;
  return Number.isFinite(n) ? n : 0;
};

/** The price of one credit when the row does not say. lib/billing/pricing-config.ts. */
export const DEFAULT_CREDIT_PRICE_EUR = 0.02;

type Routing = { category?: unknown; tier?: unknown; bumped?: unknown; model?: unknown };

function bucketsOf(map: Map<string, { requests: number; costEur: number }>): Bucket[] {
  return [...map.entries()]
    .map(([key, v]) => ({ key, requests: v.requests, costEur: v.costEur, avgEur: v.requests > 0 ? v.costEur / v.requests : 0 }))
    .sort((a, b) => b.costEur - a.costEur || a.key.localeCompare(b.key));
}

function add(map: Map<string, { requests: number; costEur: number }>, key: string, requests: number, costEur: number) {
  const cur = map.get(key) ?? { requests: 0, costEur: 0 };
  cur.requests += requests;
  cur.costEur += costEur;
  map.set(key, cur);
}

type ModelUsage = {
  inputTokens?: unknown;
  outputTokens?: unknown;
  cacheWriteTokens?: unknown;
  cacheWrite1hTokens?: unknown;
  cacheReadTokens?: unknown;
  usdCost?: unknown;
  calls?: unknown;
};

/** The same tokens, priced at another model's list price. Web searches
 *  are left out on both sides: they cost the same on any model. */
function repriceUsd(u: ModelUsage, model: string): number {
  const p = pricingForModel(model);
  return (
    (num(u.inputTokens) / 1e6) * p.inputPerMTok +
    (num(u.outputTokens) / 1e6) * p.outputPerMTok +
    (num(u.cacheWriteTokens) / 1e6) * p.cacheWritePerMTok +
    (num(u.cacheWrite1hTokens) / 1e6) * p.cacheWrite1hPerMTok +
    (num(u.cacheReadTokens) / 1e6) * p.cacheReadPerMTok
  );
}

export function buildRoutingReport(rows: readonly CostLogRow[], attempts: readonly ProviderAttemptRow[] | null): RoutingReport {
  const byFeature = new Map<string, { requests: number; costEur: number }>();
  const byCategory = new Map<string, { requests: number; costEur: number }>();
  const byTier = new Map<string, { requests: number; costEur: number }>();
  const byModel = new Map<string, { requests: number; costEur: number }>();

  let costEur = 0;
  let revenueEur = 0;
  let decided = 0;
  let bumped = 0;
  let unclassified = 0;
  let promptTokens = 0;
  let cacheRead = 0;
  let projectedEur = 0;
  let projectedActualEur = 0;
  let projectedRows = 0;

  for (const row of rows) {
    const eurCost = num(row.real_cost_eur);
    const usdCost = num(row.real_cost_usd);
    const meta = row.metadata ?? {};
    costEur += eurCost;
    add(byFeature, row.feature, 1, eurCost);

    // Revenue at what a credit actually brought in on this row; a bypass
    // row charged nothing and brought in nothing.
    const perCredit = num(meta.revenuePerCreditEur) || DEFAULT_CREDIT_PRICE_EUR;
    revenueEur += num(row.credits_charged) * perCredit;

    const input = num(row.input_tokens);
    const read = num(row.cache_read_tokens);
    const write = num(row.cache_write_tokens);
    promptTokens += input + read + write;
    cacheRead += read;

    const routing = (meta.routing ?? null) as Routing | null;
    if (routing && typeof routing.tier === "string" && typeof routing.category === "string") {
      decided += 1;
      if (routing.bumped === true) bumped += 1;
      add(byCategory, routing.category, 1, eurCost);
      add(byTier, routing.tier, 1, eurCost);
    } else {
      unclassified += 1;
    }

    // Per model: each model's share of the row's cost, in the row's own
    // EUR/USD ratio, so the model buckets add up to the total.
    const breakdown = (meta.modelBreakdown ?? null) as Record<string, ModelUsage> | null;
    const eurPerUsd = usdCost > 0 ? eurCost / usdCost : 0;
    if (breakdown && Object.keys(breakdown).length > 0 && usdCost > 0) {
      let rowShadowUsd = 0;
      let canProject = typeof routing?.model === "string";
      for (const [model, usage] of Object.entries(breakdown)) {
        add(byModel, model, 1, num(usage.usdCost) * eurPerUsd);
        if (canProject) {
          // External (non-token) spend cannot be repriced at a text model.
          if (num(usage.inputTokens) + num(usage.outputTokens) === 0 && num(usage.usdCost) > 0) canProject = false;
          // The token part at the shadow model's price; the rest of what
          // this model's line cost (web searches) is the same on any model.
          else rowShadowUsd += repriceUsd(usage, routing!.model as string) + Math.max(0, num(usage.usdCost) - repriceUsd(usage, model));
        }
      }
      if (canProject) {
        projectedEur += rowShadowUsd * eurPerUsd;
        projectedActualEur += eurCost;
        projectedRows += 1;
      }
    } else {
      add(byModel, "unrecorded", 1, eurCost);
    }
  }

  const tierShare = decided > 0 ? bucketsOf(byTier).map((b) => ({ tier: b.key, share: b.requests / decided })) : [];

  let fallbackShare: number | null = null;
  if (attempts) {
    const requests = new Map<string, boolean>();
    for (const a of attempts) {
      const servedLater = a.attempt_index > 0 && a.outcome === "success";
      requests.set(a.request_id, (requests.get(a.request_id) ?? false) || servedLater);
    }
    fallbackShare = requests.size > 0 ? [...requests.values()].filter(Boolean).length / requests.size : null;
  }

  return {
    requests: rows.length,
    costEur,
    avgCostPerRequestEur: rows.length > 0 ? costEur / rows.length : null,
    byFeature: bucketsOf(byFeature),
    byCategory: bucketsOf(byCategory),
    byTier: bucketsOf(byTier),
    byModel: bucketsOf(byModel),
    tierShare,
    unclassified,
    bumpedShare: decided > 0 ? bumped / decided : null,
    escalatedShare: null,
    fallbackShare,
    cachedTokenShare: promptTokens > 0 ? cacheRead / promptTokens : null,
    revenueEur,
    margin: costEur > 0 ? revenueEur / costEur : null,
    shadow: { projectedCostEur: projectedEur, actualCostEur: projectedActualEur, rows: projectedRows },
  };
}
