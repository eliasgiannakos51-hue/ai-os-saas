import "server-only";
import type { User } from "@supabase/supabase-js";
// createAdminClient is the only way to build the `admin` parameter this
// module takes.  Importing it here is checked by security-posture.test.mjs
// (§2): every file that touches an ADMIN_ONLY_TABLES table must name
// createAdminClient so the link from caller to deny-all table is
// grep-visible.
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdminEmail } from "@/lib/auth/admin-emails";
import { hasActiveBetaBypass } from "@/lib/beta";
import { checkBypassCeiling } from "@/lib/billing/bypass-ceiling";
import { hasEnoughCredits, resolveEffectivePlan, getPurchasedPackCreditPriceEur } from "@/lib/billing/credits";
import { resolvePricingConfig } from "@/lib/billing/pricing-config";
import { effectiveCreditPriceEurForAccount } from "@/lib/billing/credit-formula";
import { resolveMarginFor } from "@/lib/billing/margin-policy";
import { CostAccumulator } from "@/lib/billing/cost-accumulator";
import { reserveCredits, settleReservation } from "@/lib/billing/reservations";
import { voiceMinutesForPlan } from "@/lib/voice/voice-pricing";
import { consumeVoiceSeconds } from "@/lib/voice/voice-usage";
import { LIVE_COST_USD_PER_MINUTE, LIVE_MODEL, liveCreditsPerMinute } from "@/lib/voice/live-pricing";

/**
 * ONE MINUTE OF A LIVE CALL, PAID FOR BEFORE IT IS USED (FS1, Κομμάτι 6).
 *
 * The three routes that keep a call alive — start, tick, and the sweep
 * that bills a call nobody ended — all charge through this one function,
 * in the order api/voice/speak/route.ts charges: the plan includes voice,
 * the month has the seconds, the balance has the credits, and only then
 * is anything consumed. A refusal names which of the three it was.
 *
 * THE MONTH'S SECONDS ARE CONSUMED FIRST and not given back if the
 * credits then fail, for the reason lib/voice/voice-usage.ts states: the
 * cap bounds a provider bill, and the safe direction is a minute lost,
 * not a minute free.
 */

export type LiveBillRefusal =
  | "not_included"
  | "out_of_minutes"
  | "usage_unavailable"
  | "insufficient_credits"
  | "reserve_failed"
  | "capacity";

export type LiveBillResult =
  | { ok: true; creditsCharged: number; remainingSeconds: number; creditsPerMinute: number }
  | { ok: false; code: LiveBillRefusal; detail?: string };

export async function billLiveMinutes(
  admin: ReturnType<typeof createAdminClient>,
  user: User,
  minutes: number,
  metadata: Record<string, unknown>
): Promise<LiveBillResult> {
  const count = Math.max(1, Math.floor(minutes));
  const plan = await resolveEffectivePlan(user);
  const isAdmin = isAdminEmail(user.email);
  const bypassCredits = isAdmin || (await hasActiveBetaBypass(user));
  if (bypassCredits) {
    const ceiling = await checkBypassCeiling(user.id, isAdmin, bypassCredits && !isAdmin);
    if (!ceiling.allowed) return { ok: false, code: "capacity", detail: ceiling.reason };
  }

  const limitMinutes = voiceMinutesForPlan(plan.slug);
  if (limitMinutes <= 0) return { ok: false, code: "not_included" };

  const pricingConfig = resolvePricingConfig();
  const creditPriceEur = effectiveCreditPriceEurForAccount(
    plan,
    await getPurchasedPackCreditPriceEur(user.id),
    pricingConfig
  );
  const margin = resolveMarginFor("voice", plan.slug, pricingConfig).margin;
  const creditsPerMinute = liveCreditsPerMinute({ ...pricingConfig, creditPriceEur }, margin);
  const credits = creditsPerMinute * count;

  // THE BALANCE IS LOOKED AT BEFORE THE MONTH IS TOUCHED, so somebody
  // with no credits does not also lose a minute of their allowance to
  // finding that out. The reserve below is still the check that counts.
  if (!bypassCredits) {
    const affordable = await hasEnoughCredits(user.id, credits, plan);
    if (!affordable.ok) return { ok: false, code: "insufficient_credits" };
  }

  const consumed = await consumeVoiceSeconds(admin, {
    userId: user.id,
    seconds: 60 * count,
    characters: 0,
    limitMinutes,
    // The ledger knows two kinds; a live minute is speech in both
    // directions and is counted on the side that costs more.
    kind: "speak",
  });
  if (!consumed.ok) {
    return { ok: false, code: consumed.reason === "over_limit" ? "out_of_minutes" : "usage_unavailable" };
  }

  let reservationId = "";
  if (!bypassCredits) {
    const reservation = await reserveCredits(user.id, credits, "voice", { kind: "live", minutes: count, ...metadata });
    if (!reservation.ok) {
      return { ok: false, code: reservation.reason === "insufficient" ? "insufficient_credits" : "reserve_failed" };
    }
    reservationId = reservation.reservationId;
  }

  const costs = new CostAccumulator();
  costs.recordExternal("speak", {
    provider: "openai",
    usdCost: LIVE_COST_USD_PER_MINUTE * count,
    units: 60 * count,
    unit: "seconds",
  });
  const settlement = await settleReservation({
    userId: user.id,
    reservationId,
    feature: "voice",
    costs,
    plan,
    bypassCharge: bypassCredits,
    metadata: { kind: "live", minutes: count, model: LIVE_MODEL, ...metadata },
  });

  return {
    ok: true,
    creditsCharged: settlement.creditsCharged,
    remainingSeconds: consumed.remainingSeconds,
    creditsPerMinute,
  };
}

/** The HTTP status each refusal travels with. */
export function liveRefusalStatus(code: LiveBillRefusal): number {
  if (code === "not_included") return 403;
  if (code === "usage_unavailable") return 503;
  if (code === "capacity") return 429;
  return 402;
}

export type LiveSessionRow = {
  id: string;
  user_id: string;
  call_id: string;
  conversation_id: string | null;
  started_at: string;
  paid_until: string;
  minutes_billed: number;
  ended_at: string | null;
  end_reason: string | null;
  transcript_saved_at: string | null;
};

export const LIVE_SESSION_COLUMNS =
  "id, user_id, call_id, conversation_id, started_at, paid_until, minutes_billed, ended_at, end_reason, transcript_saved_at";

export const LIVE_END_REASONS = ["closed", "unpaid", "cap", "swept", "failed"] as const;
export type LiveEndReason = (typeof LIVE_END_REASONS)[number];

/** Mark a call over, once. A row already ended keeps its first reason. */
export async function closeLiveSession(admin: ReturnType<typeof createAdminClient>, id: string, reason: LiveEndReason): Promise<void> {
  await admin
    .from("voice_live_sessions")
    .update({ ended_at: new Date().toISOString(), end_reason: reason })
    .eq("id", id)
    .is("ended_at", null);
}
