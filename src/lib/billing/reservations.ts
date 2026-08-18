import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { logApiError } from "@/lib/log-error";
import { diagLog } from "@/lib/diag";
import { resolvePricingConfig } from "@/lib/billing/pricing-config";
import {
  usdToEur,
  creditsForRealCostOnAccount,
  achievedMarginOnAccount,
  effectiveCreditPriceEurForAccount,
} from "@/lib/billing/credit-formula";
import { getPurchasedPackCreditPriceEur } from "@/lib/billing/credits";
import { resolveMarginFor } from "@/lib/billing/margin-policy";
import type { Plan } from "@/lib/billing/plans";
import { sendMarginAlertEmail } from "@/lib/email/margin-alert";
import type { CostAccumulator } from "@/lib/billing/cost-accumulator";

// Three-phase billing: RESERVE -> EXECUTE -> SETTLE.
//
// The problem with charging only at the end: the balance check and the
// charge are separated by the whole duration of the action (a website
// generation runs for minutes). Two actions started in that window both
// see the full balance, both pass the check, and both charge — the user
// goes negative and the second action was effectively free.
//
// Reserving closes that window. The hold is taken atomically before any
// AI call, so a concurrent action sees a balance that already excludes
// it. Settlement then charges the REAL measured cost and releases
// whatever is left of the hold.
//
// Crash safety: a reservation that is never settled would strand credits
// forever, so every row carries expires_at and releaseExpiredReservations
// (called from the existing daily cron) returns anything abandoned.

export const RESERVATION_TTL_MINUTES = 60;

export type ReservationResult =
  | { ok: true; reservationId: string; reserved: number }
  | { ok: false; reason: "insufficient"; available: number; needed: number }
  | { ok: false; reason: "error"; message: string };

/**
 * Holds `credits` against the user's balance.
 *
 * The reserve itself is a single atomic RPC (reserve_credits, see the SQL
 * migration): it re-reads the balance, checks it against existing holds,
 * and inserts the reservation row inside one statement. Doing the check
 * in TypeScript and the insert afterwards would reopen exactly the race
 * this exists to close.
 */
export async function reserveCredits(
  userId: string,
  credits: number,
  action: string,
  metadata: Record<string, unknown> = {}
): Promise<ReservationResult> {
  if (credits <= 0) {
    // Nothing to hold. Still returns ok so callers don't need a special
    // case for free/admin paths.
    return { ok: true, reservationId: "", reserved: 0 };
  }

  try {
    const admin = createAdminClient();
    const expiresAt = new Date(Date.now() + RESERVATION_TTL_MINUTES * 60_000).toISOString();
    const { data, error } = await admin.rpc("reserve_credits", {
      p_user_id: userId,
      p_credits: credits,
      p_action: action,
      p_expires_at: expiresAt,
      p_metadata: metadata,
    });

    if (error) {
      logApiError("billing:reserveCredits", error, { userId, action, credits });
      return { ok: false, reason: "error", message: error.message };
    }

    const row = Array.isArray(data) ? data[0] : data;
    if (!row?.reservation_id) {
      return {
        ok: false,
        reason: "insufficient",
        available: Number(row?.available ?? 0),
        needed: credits,
      };
    }
    return { ok: true, reservationId: String(row.reservation_id), reserved: credits };
  } catch (err) {
    logApiError("billing:reserveCredits", err, { userId, action, credits, stage: "unhandled" });
    return { ok: false, reason: "error", message: "Could not reserve credits." };
  }
}

export type SettlementResult = {
  creditsCharged: number;
  realCostUsd: number;
  realCostEur: number;
  achievedMargin: number | null;
  /** True when this account is not charged at all (admin, beta tester).
   *  A caller that reports "0 credits" without this cannot tell "free for
   *  you" from "billing did nothing", and neither can the user. */
  bypassCharge: boolean;
  /** On a bypass settlement, what the charge WOULD have been. Null when
   *  the account really was charged (creditsCharged is the answer then).
   *  Already stored in the cost-log row's metadata; returned as well so
   *  the surface that just ran the action can say it out loud instead of
   *  showing a bare zero. */
  wouldHaveChargedCredits: number | null;
  /** False when the RPC failed — nothing was charged and no cost-log row
   *  exists, however healthy the other fields look. Callers that report a
   *  charge to the user must check this. */
  settled: boolean;
};

/**
 * Converts measured usage into the final charge, releases the hold, and
 * writes the cost-log row.
 *
 * Ordering matters and is enforced inside the settle_reservation RPC:
 * release-and-charge happen in one transaction, so a failure cannot leave
 * a user both holding credits and charged for them.
 *
 * `bypassCharge` (admins, beta testers) still logs the real cost — those
 * users cost real money and their spend has to appear in the margin
 * report — but charges nothing.
 */
export async function settleReservation(params: {
  userId: string;
  reservationId: string;
  feature: string;
  costs: CostAccumulator;
  /** The user's effective plan. Settlement divides by what a credit is
   *  actually worth on THIS plan, not the list price — see
   *  effectiveCreditPriceEur for why that is what makes the margin hold
   *  on real revenue rather than on a nominal number. */
  plan: Plan | null;
  bypassCharge?: boolean;
  metadata?: Record<string, unknown>;
}): Promise<SettlementResult> {
  const { userId, reservationId, feature, costs, plan, bypassCharge = false, metadata = {} } = params;
  const config = resolvePricingConfig();

  const totals = costs.totals();
  const realCostUsd = totals.usdCost;
  const realCostEur = usdToEur(realCostUsd, config);

  // A settled action that measured NOTHING.
  //
  // This is the second way — besides bypassCharge — to get a cost-log row
  // reading credits_charged = 0 and achieved_margin = null, and until now
  // it was completely silent. Both numbers come from the same early
  // return: creditsForRealCostOnAccount returns 0 when realCostEur <= 0,
  // and achievedMarginOnAccount returns null on the same condition. So a
  // settlement whose accumulator was never fed looks EXACTLY like a
  // legitimate admin bypass in the log, while being a real bug — the AI
  // call happened, we paid for it, and the charge was zero.
  //
  // It is never legitimate for a completed action: reaching settlement at
  // all means a call was made. So it is logged as an error rather than
  // left for someone to notice in a SQL query weeks later.
  const measuredNothing = !(realCostUsd > 0);
  if (measuredNothing) {
    logApiError("billing:zeroCostSettlement", new Error("settled with no measured usage"), {
      userId,
      feature,
      aiCalls: costs.callCount,
      reservationId: reservationId || "(none)",
      bypassCharge,
      // callCount 0 means nothing was ever recorded onto the accumulator
      // — a missing costs.record() at the call site. A positive count
      // with zero cost means usage came back empty or unpriced, which
      // points at model-pricing.ts instead.
      diagnosis:
        costs.callCount === 0
          ? "the accumulator was never fed — a call site is missing costs.record()"
          : "usage was recorded but priced at zero — check MODEL_PRICING_USD covers this model",
    });
  }

  // A one-time credit pack sells credits below both the list price AND the
  // plan rate (€100 / 8,000 = €0.0125 each), so an account that bought one
  // has to be charged against THAT rate or the multiplier silently drops to
  // 2.5x. Null for every account that never bought a pack, which leaves the
  // plan-only behaviour exactly as it was.
  // Fetched for bypass accounts too, which it previously was not.
  //
  // It used to be `bypassCharge ? null : await ...`, on the reasoning that
  // a bypass account is charged nothing so the rate cannot matter. It
  // does: wouldHaveChargedCredits below is supposed to answer "what would
  // a normal user on this account's plan have paid", and skipping the
  // pack lookup made that answer wrong for anyone who had bought one —
  // the cheapest pack is EUR 0.0125 a credit against a EUR 0.02 list
  // price, so the figure came out 37% low. A hypothetical charge that
  // understates is worse than none, because it reads as reassurance.
  const packPriceEur = await getPurchasedPackCreditPriceEur(userId);
  const effectivePrice = effectiveCreditPriceEurForAccount(plan, packPriceEur, config);

  // The multiplier THIS settlement applies: max(general, plan margin,
  // feature override), never below 4 — see lib/billing/margin-policy.ts
  // for the rule and why max() is the only safe combination.
  const marginPolicy = resolveMarginFor(feature, plan?.slug ?? null, config);

  const creditsCharged = bypassCharge
    ? 0
    : creditsForRealCostOnAccount(realCostEur, plan, packPriceEur, config, marginPolicy.margin);
  const margin = bypassCharge
    ? null
    : achievedMarginOnAccount(creditsCharged, realCostEur, plan, packPriceEur, config);

  // Usage priced by FALLBACK because the model is not in
  // MODEL_PRICING_USD. This is the failure the below-target margin alert
  // cannot see: an unknown model's cost is computed from guessed rates,
  // and the stored margin — computed from that same guessed cost — reads
  // healthy no matter how wrong the guess is. The one observable fact is
  // that the guess HAPPENED, so that is what alerts. (This is exactly how
  // a $0.10 chat message once settled for 2 credits without a single
  // alert firing: the served model was missing from the table.)
  // Both are the same class of incident — usage priced by a guess — and
  // both are invisible in the settled row, because the stored margin is
  // computed from the same guessed cost and reads healthy either way.
  const unknownModels = [...costs.unknownModels(), ...costs.unpricedServiceTiers()];
  if (unknownModels.length > 0) {
    logApiError(
      "billing:unknownModelPricing",
      new Error("settled usage from a model MODEL_PRICING_USD does not know"),
      {
        userId,
        feature,
        unknownModels: unknownModels.join(", "),
        realCostUsd,
        creditsCharged,
        hint: "add the model to MODEL_PRICING_USD — until then its cost is a guess and the margin guarantee is unverifiable",
      }
    );
    void sendMarginAlertEmail({
      feature,
      creditsCharged,
      realCostUsd,
      realCostEur,
      achievedMargin: margin,
      targetMargin: marginPolicy.margin,
      planSlug: plan?.slug ?? null,
      effectiveCreditPriceEur: effectivePrice,
      reason: `usage priced by fallback for unknown model(s): ${unknownModels.join(", ")}`,
    });
  }

  // A bypass row is 0 credits and a null margin BY DESIGN — an admin or
  // beta tester genuinely produces no revenue, so there is no multiplier
  // to report. That is indistinguishable in the cost log from billing
  // being broken, which is exactly how it reads when every row on an
  // owner's own account shows credits_charged = 0 and margin = null.
  //
  // So record what the charge WOULD have been. It makes the two cases
  // tellable apart at a glance, and it is the only way the margin report
  // can price bypass traffic, which is real spend either way.
  const wouldHaveCharged = bypassCharge
    ? creditsForRealCostOnAccount(realCostEur, plan, packPriceEur, config, marginPolicy.margin)
    : null;

  // The multiplier is guaranteed by construction — credits are ceil()ed
  // up, so credits * price / cost can never come out below it. That makes
  // this branch unreachable by arithmetic, which is exactly why it is
  // worth having: if it ever fires, the cause is a cost that never
  // reached the formula, and that is invisible from the settled row (the
  // stored achieved_margin is computed from the same understated cost and
  // will look healthy). A margin shortfall must never be something we
  // learn about from a user comparing an invoice to a dashboard.
  // Fires on null as well as on a low number. A null margin on a
  // CHARGING settlement is not "no data", it means the multiplier could
  // not be computed at all — and an alert that only tests `< 4` treats
  // that as healthy, because null is not less than 4. The case the alert
  // exists for is precisely the one where something upstream went wrong.
  if (!bypassCharge && (margin === null || margin < marginPolicy.margin - 1e-9)) {
    logApiError("billing:marginBelowTarget", new Error("settled below the guaranteed margin"), {
      userId,
      feature,
      creditsCharged,
      realCostUsd,
      realCostEur,
      achievedMargin: margin,
      targetMargin: marginPolicy.margin,
      marginSource: marginPolicy.source,
      effectiveCreditPriceEur: effectivePrice,
    });
    // The log line alone is only useful to someone already reading logs.
    // A shortfall keeps costing money until it is fixed, so it has to
    // reach a person. Awaited-but-never-throwing: the user has already
    // been charged by the time this runs.
    void sendMarginAlertEmail({
      feature,
      creditsCharged,
      realCostUsd,
      realCostEur,
      achievedMargin: margin,
      targetMargin: marginPolicy.margin,
      planSlug: plan?.slug ?? null,
      effectiveCreditPriceEur: effectivePrice,
    });
  }

  try {
    const admin = createAdminClient();
    const { error } = await admin.rpc("settle_reservation", {
      p_user_id: userId,
      // Empty string when nothing was reserved (free/admin path) — the
      // RPC treats that as "charge only, no hold to release".
      p_reservation_id: reservationId || null,
      p_credits_to_charge: creditsCharged,
      p_feature: feature,
      p_input_tokens: totals.inputTokens,
      p_output_tokens: totals.outputTokens,
      // The SUM of both cache-write TTLs — this column mirrors what
      // Anthropic reports as cache_creation_input_tokens, which is the
      // inclusive total. The 1-hour slice is priced separately inside
      // priceUsage and carried in metadata below, so a row can still be
      // audited against the pricing page without a schema migration.
      p_cache_write_tokens: totals.cacheWriteTokens + totals.cacheWrite1hTokens,
      p_cache_read_tokens: totals.cacheReadTokens,
      p_web_searches: totals.webSearches,
      p_ai_calls: costs.callCount,
      p_real_cost_usd: Number(realCostUsd.toFixed(8)),
      p_real_cost_eur: Number(realCostEur.toFixed(8)),
      // The multiplier this row was ACTUALLY priced at — after feature and
      // plan overrides — not the global default.
      p_margin_multiplier: marginPolicy.margin,
      p_achieved_margin: margin,
      p_stage_breakdown: costs.breakdownByStage(),
      p_metadata: {
        ...metadata,
        planSlug: plan?.slug ?? null,
        effectiveCreditPriceEur: effectivePrice,
        packCreditPriceEur: packPriceEur,
        // WHICH margin applied and WHY — "general" | "plan" | "feature" —
        // with the inputs, so a cost-log row explains its own multiplier.
        appliedMarginMultiplier: marginPolicy.margin,
        marginSource: marginPolicy.source,
        marginGeneral: marginPolicy.general,
        marginPlan: marginPolicy.planMargin,
        marginPlanFromEnv: marginPolicy.planMarginFromEnv,
        marginFeatureOverride: marginPolicy.featureMargin,
        // Models priced by fallback, if any — see billing:unknownModelPricing.
        unknownModels: unknownModels.length > 0 ? unknownModels : undefined,
        // The 1-hour slice of cache_write_tokens, which is billed at 2x
        // input rather than 1.25x. Stored so the retroactive audit in
        // scripts/ can re-derive a row's cost from its own columns.
        cacheWrite1hTokens: totals.cacheWrite1hTokens || undefined,
        webFetches: totals.webFetches || undefined,
        // Why this row charged nothing, so 0 credits is never ambiguous.
        bypassCharge,
        wouldHaveChargedCredits: wouldHaveCharged,
      },
    });
    if (error) {
      // A failed RPC used to be a log line and nothing else — the caller
      // got a SettlementResult claiming credits were charged when the
      // database had done nothing at all. Reported explicitly, and the
      // returned result now says what really happened.
      logApiError("billing:settleReservation", error, {
        userId,
        feature,
        creditsCharged,
        realCostUsd,
        stage: "rpc_error",
        // A signature mismatch is the failure mode that looks like
        // nothing: PostgREST resolves overloads by argument NAME, so a
        // stale settle_reservation in the database fails here while every
        // line of TypeScript above it ran perfectly.
        hint: "if this says the function was not found, the settle_reservation RPC in the database does not match the arguments sent here",
      });
      return {
        creditsCharged: 0,
        realCostUsd,
        realCostEur,
        achievedMargin: null,
        bypassCharge,
        wouldHaveChargedCredits: wouldHaveCharged,
        settled: false,
      };
    }
    diagLog(
      `[billing] settled ${feature}: ${JSON.stringify({
        userId,
        aiCalls: costs.callCount,
        inputTokens: totals.inputTokens,
        outputTokens: totals.outputTokens,
        cacheWriteTokens: totals.cacheWriteTokens,
        cacheReadTokens: totals.cacheReadTokens,
        realCostUsd: Number(realCostUsd.toFixed(8)),
        realCostEur: Number(realCostEur.toFixed(8)),
        effectiveCreditPriceEur: effectivePrice,
        planSlug: plan?.slug ?? null,
        bypassCharge,
        creditsCharged,
        achievedMargin: margin,
        reservationId: reservationId || "(none)",
      })}`
    );
  } catch (err) {
    logApiError("billing:settleReservation", err, { userId, feature, stage: "unhandled" });
    return {
      creditsCharged: 0,
      realCostUsd,
      realCostEur,
      achievedMargin: null,
      bypassCharge,
      wouldHaveChargedCredits: wouldHaveCharged,
      settled: false,
    };
  }

  return {
    creditsCharged,
    realCostUsd,
    realCostEur,
    achievedMargin: margin,
    bypassCharge,
    wouldHaveChargedCredits: wouldHaveCharged,
    settled: true,
  };
}

/**
 * Releases a hold without charging — for an action that failed before it
 * cost anything. Distinct from settling with a zero cost so the cost log
 * doesn't fill with rows for actions that never ran.
 */
export async function releaseReservation(userId: string, reservationId: string): Promise<void> {
  if (!reservationId) return;
  try {
    const admin = createAdminClient();
    const { error } = await admin.rpc("release_reservation", {
      p_user_id: userId,
      p_reservation_id: reservationId,
    });
    if (error) logApiError("billing:releaseReservation", error, { userId, reservationId });
  } catch (err) {
    logApiError("billing:releaseReservation", err, { userId, reservationId, stage: "unhandled" });
  }
}

/**
 * Sweeps reservations whose action died mid-flight (a crashed background
 * job, a timed-out request). Called by the daily cron.
 */
export async function releaseExpiredReservations(): Promise<number> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("release_expired_reservations");
    if (error) {
      logApiError("billing:releaseExpiredReservations", error);
      return 0;
    }
    return Number(data ?? 0);
  } catch (err) {
    logApiError("billing:releaseExpiredReservations", err, { stage: "unhandled" });
    return 0;
  }
}
