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
import { REBUILD_MODEL } from "@/lib/rebuild/rebuild-plan";
import type { RebuildCallResult } from "@/lib/rebuild/rebuild-call";
import type { RebuildGate } from "@/lib/rebuild/access";

/**
 * ONE PAID REBUILD STEP, in the order every paid route here keeps: the
 * breaker, the bypass ceiling, the estimate on what is sent, the hold, the
 * model, and the charge as spent — RELEASED on a stop, on a provider
 * failure AND on an answer that is not a plan or not a safe app: a build
 * the check refuses charges nothing and keeps nothing (the owner,
 * 2026-10-23; unlike Games, which settles that case), held by
 * scripts/tests/rebuild.test.mjs.
 *
 * Shared by api/rebuild (the plan) and api/rebuild/[id] (a box, the app, a
 * change), so the four steps cannot drift apart in how they charge.
 */
export type RebuildStep<T> = { ok: true; value: T; creditsCharged: number } | { ok: false; response: NextResponse };

export async function chargedRebuildStep<T>(params: {
  user: User;
  gate: RebuildGate;
  action: Extract<ActionProfileKey, "rebuildPlan" | "rebuildBoxEdit" | "rebuildBuild" | "rebuildChange" | "rebuildFeatures">;
  feature: "rebuild_generate" | "rebuild_edit";
  /** Every character the call sends: the system prompt and the message. */
  inputChars: number;
  fingerprint: string;
  route: string;
  metadata: Record<string, unknown>;
  run: (costs: CostAccumulator) => Promise<RebuildCallResult<T>>;
}): Promise<RebuildStep<T>> {
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
    { model: REBUILD_MODEL, inputChars: params.inputChars, planSlug: plan?.slug ?? null },
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
  if (!outcome.ok) {
    await releaseReservation(user.id, reservationId);
    if (outcome.kind === "aborted") return { ok: false, response: NextResponse.json({ ok: false, code: "stopped" }, { status: 499 }) };
    logApiError(params.route, new Error(outcome.detail), { action: params.action, kind: outcome.kind });
    if (outcome.kind === "unusable") return { ok: false, response: NextResponse.json({ ok: false, code: "unusable", creditsCharged: 0 }, { status: 502 }) };
    return { ok: false, response: NextResponse.json({ ok: false, code: "ai_unavailable" }, { status: 503 }) };
  }
  const settlement = await settleReservation({
    userId: user.id,
    reservationId,
    feature: params.feature,
    costs,
    plan,
    bypassCharge: bypass,
    metadata: { ...params.metadata, outcome: "made" },
  });
  return { ok: true, value: outcome.value, creditsCharged: settlement.creditsCharged };
}
