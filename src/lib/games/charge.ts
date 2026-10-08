import "server-only";
import { NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";
import { logApiError } from "@/lib/log-error";
import { hasActiveBetaBypass } from "@/lib/beta";
import { checkBypassCeiling } from "@/lib/billing/bypass-ceiling";
import { checkAiCallAllowed, fingerprintRequest, recordAiCallForDailySpend } from "@/lib/ai-circuit-breaker";
import { getPurchasedPackCreditPriceEur, hasEnoughCredits, insufficientCreditsMessage } from "@/lib/billing/credits";
import { CostAccumulator } from "@/lib/billing/cost-accumulator";
import { estimateForAction, type ActionProfileKey } from "@/lib/billing/estimate";
import { resolvePricingConfig } from "@/lib/billing/pricing-config";
import { effectiveCreditPriceEurForAccount } from "@/lib/billing/credit-formula";
import { releaseReservation, reserveCredits, settleReservation } from "@/lib/billing/reservations";
import { GAME_MODEL } from "@/lib/games/game-plan";
import type { GameCallResult } from "@/lib/games/game-call";
import type { GameGate } from "@/lib/games/game-access";

/**
 * ONE PAID GAME STEP, in the order every paid route here keeps (package
 * 26): the breaker, the bypass ceiling, the estimate on what is sent, the
 * hold, the model, and the charge as spent — released on a stop or a
 * provider failure, settled when the model answered at all.
 *
 * Shared by api/games (the plan) and api/games/[id] (a box, the game, a
 * change), so the four steps cannot drift apart in how they charge.
 */
export type GameStep<T> =
  | { ok: true; value: T; creditsCharged: number }
  | { ok: false; response: NextResponse };

export async function chargedGameStep<T>(params: {
  user: User;
  gate: Extract<GameGate, { ok: true }>;
  action: Extract<ActionProfileKey, "gamePlan" | "gameBoxEdit" | "gameWrite" | "gameChange">;
  feature: "game_generate" | "game_edit";
  /** Every character the call sends: the system prompt and the message. */
  inputChars: number;
  fingerprint: string;
  route: string;
  metadata: Record<string, unknown>;
  run: (costs: CostAccumulator) => Promise<GameCallResult<T>>;
}): Promise<GameStep<T>> {
  const { user, gate } = params;
  const breaker = await checkAiCallAllowed(user.id, params.feature, fingerprintRequest(params.fingerprint, params.action));
  if (!breaker.allowed) return { ok: false, response: NextResponse.json({ ok: false, code: "rate_limited" }, { status: 429 }) };
  const isBeta = await hasActiveBetaBypass(user);
  const bypass = gate.isAdmin || isBeta;
  if (bypass) {
    const ceiling = await checkBypassCeiling(user.id, gate.isAdmin, isBeta);
    if (!ceiling.allowed) return { ok: false, response: NextResponse.json({ ok: false, code: "rate_limited" }, { status: 429 }) };
  }
  const plan = gate.plan;
  const pricingConfig = resolvePricingConfig();
  const estimate = estimateForAction(
    params.action,
    { model: GAME_MODEL, inputChars: params.inputChars, planSlug: plan?.slug ?? null },
    pricingConfig,
    plan ? effectiveCreditPriceEurForAccount(plan, await getPurchasedPackCreditPriceEur(user.id), pricingConfig) : undefined
  );
  let reservationId = "";
  if (!bypass && plan) {
    const enough = await hasEnoughCredits(user.id, estimate.reserveCredits, plan);
    if (!enough.ok) {
      return { ok: false, response: NextResponse.json({ ok: false, code: "insufficient_credits", detail: insufficientCreditsMessage(enough.remaining, estimate.reserveCredits) }, { status: 402 }) };
    }
    const reservation = await reserveCredits(user.id, estimate.reserveCredits, params.feature, params.metadata);
    if (!reservation.ok) return { ok: false, response: NextResponse.json({ ok: false, code: "insufficient_credits" }, { status: 402 }) };
    reservationId = reservation.reservationId;
  }
  const costs = new CostAccumulator();
  void recordAiCallForDailySpend(estimate.estimatedCredits);
  const outcome = await params.run(costs);
  if (!outcome.ok && (outcome.kind === "aborted" || outcome.kind === "provider")) {
    await releaseReservation(user.id, reservationId);
    if (outcome.kind === "aborted") return { ok: false, response: NextResponse.json({ ok: false, code: "stopped" }, { status: 499 }) };
    logApiError(params.route, new Error(outcome.detail), { action: params.action });
    return { ok: false, response: NextResponse.json({ ok: false, code: "ai_unavailable" }, { status: 503 }) };
  }
  const settlement = await settleReservation({
    userId: user.id,
    reservationId,
    feature: params.feature,
    costs,
    plan,
    bypassCharge: bypass,
    metadata: { ...params.metadata, outcome: outcome.ok ? "made" : "unusable" },
  });
  if (!outcome.ok) {
    // The model answered and it was not usable: the tokens were spent.
    logApiError(params.route, new Error(outcome.detail), { action: params.action });
    return { ok: false, response: NextResponse.json({ ok: false, code: "unusable", creditsCharged: settlement.creditsCharged }, { status: 502 }) };
  }
  return { ok: true, value: outcome.value, creditsCharged: settlement.creditsCharged };
}
