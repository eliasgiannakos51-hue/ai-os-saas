import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { logApiError } from "@/lib/log-error";
import { resolvePricingConfig } from "@/lib/billing/pricing-config";
import {
  usdToEur,
  creditsForRealCostOnAccount,
  achievedMarginOnAccount,
  effectiveCreditPriceEurForAccount,
} from "@/lib/billing/credit-formula";
import { getPurchasedPackCreditPriceEur } from "@/lib/billing/credits";
import type { Plan } from "@/lib/billing/plans";
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

  // A one-time credit pack sells credits below both the list price AND the
  // plan rate (€100 / 8,000 = €0.0125 each), so an account that bought one
  // has to be charged against THAT rate or the multiplier silently drops to
  // 2.5x. Null for every account that never bought a pack, which leaves the
  // plan-only behaviour exactly as it was.
  const packPriceEur = bypassCharge ? null : await getPurchasedPackCreditPriceEur(userId);
  const effectivePrice = effectiveCreditPriceEurForAccount(plan, packPriceEur, config);

  const creditsCharged = bypassCharge
    ? 0
    : creditsForRealCostOnAccount(realCostEur, plan, packPriceEur, config);
  const margin = bypassCharge
    ? null
    : achievedMarginOnAccount(creditsCharged, realCostEur, plan, packPriceEur, config);

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
      p_cache_write_tokens: totals.cacheWriteTokens,
      p_cache_read_tokens: totals.cacheReadTokens,
      p_web_searches: totals.webSearches,
      p_ai_calls: costs.callCount,
      p_real_cost_usd: Number(realCostUsd.toFixed(8)),
      p_real_cost_eur: Number(realCostEur.toFixed(8)),
      p_margin_multiplier: config.marginMultiplier,
      p_achieved_margin: margin,
      p_stage_breakdown: costs.breakdownByStage(),
      p_metadata: {
        ...metadata,
        planSlug: plan?.slug ?? null,
        effectiveCreditPriceEur: effectivePrice,
        packCreditPriceEur: packPriceEur,
      },
    });
    if (error) {
      logApiError("billing:settleReservation", error, { userId, feature, creditsCharged });
    }
  } catch (err) {
    logApiError("billing:settleReservation", err, { userId, feature, stage: "unhandled" });
  }

  return { creditsCharged, realCostUsd, realCostEur, achievedMargin: margin };
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
