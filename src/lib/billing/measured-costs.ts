import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { MeasuredCostsByFeature } from "@/lib/billing/plan-allowance";

// The real per-action cost, read back out of ai_cost_log.
//
// WHY A MEDIAN AND WHY AN RPC. The pricing page claims "~19 websites a
// month". That claim has to come from what a website generation has
// actually cost, or it is marketing. But the raw rows are per-user and
// RLS is select-own, so no request-scoped client can compute a
// cross-account median — and no client should be handed the rows to
// compute it from either. A `security definer` function that returns ONLY
// aggregates (feature, count, median, p80) is the whole exposure: it
// cannot leak whose actions they were, and it is granted to service_role
// alone.
//
// The window is deliberately long (90 days) and the sample floor
// deliberately low but non-zero: this number changes when the product
// changes, not hour to hour, and a fresh deployment with three rows in
// the table must fall back to the estimator rather than publish one
// person's afternoon as a fact.

const WINDOW_DAYS = 90;

// Long enough that the pricing page is not a database query, short enough
// that a real shift in cost shows up the same day. Module-level, so it is
// per server instance — there is nothing to invalidate and nothing that
// breaks if two instances disagree for half an hour.
const CACHE_TTL_MS = 30 * 60 * 1000;

type CacheEntry = { at: number; value: MeasuredCostsByFeature };
let cache: CacheEntry | null = null;

type StatsRow = {
  feature: string | null;
  samples: number | string | null;
  median_usd: number | string | null;
  p80_usd: number | string | null;
};

function num(value: number | string | null | undefined): number {
  // numeric(18,8) comes back from PostgREST as a STRING, not a number —
  // reading it as a number without this returns NaN and every median
  // silently becomes "no data", which looks exactly like a healthy
  // fallback and is not one.
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

/**
 * Median USD per settled action, by ai_cost_log.feature.
 *
 * Returns an EMPTY object rather than throwing when the RPC is missing or
 * fails — a pricing page that 500s because a stats function was not
 * migrated yet is a far worse outcome than one that quotes estimator
 * figures, and the caller cannot tell the difference apart from the
 * `source` field it passes on to the UI.
 */
export async function getMeasuredCosts(): Promise<MeasuredCostsByFeature> {
  const now = Date.now();
  if (cache && now - cache.at < CACHE_TTL_MS) return cache.value;

  const out: MeasuredCostsByFeature = {};
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase.rpc("feature_cost_stats", { p_days: WINDOW_DAYS });
    if (error) throw new Error(error.message);
    for (const row of (data ?? []) as StatsRow[]) {
      if (!row?.feature) continue;
      const medianUsd = num(row.median_usd);
      const samples = Math.trunc(num(row.samples));
      if (medianUsd <= 0 || samples <= 0) continue;
      out[row.feature] = { medianUsd, samples };
    }
  } catch {
    // Deliberately silent and deliberately cached: if the function is not
    // there, it will not be there on the next request either, and a
    // pricing page should not retry a failing RPC on every visit.
  }

  cache = { at: now, value: out };
  return out;
}

/** Test seam — lets a harness prove the cache is actually used, and lets a
 *  cron-driven refresh drop it. */
export function resetMeasuredCostsCache(): void {
  cache = null;
}
