import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { MISSION_AGENT_MODEL, reviewMission } from "@/lib/mission-agents";
import { logApiError } from "@/lib/log-error";
import { CostAccumulator } from "@/lib/billing/cost-accumulator";
import { estimateForAction } from "@/lib/billing/estimate";
import { resolvePricingConfig } from "@/lib/billing/pricing-config";
import { effectiveCreditPriceEurForAccount } from "@/lib/billing/credit-formula";
import { reserveCredits, settleReservation, releaseReservation } from "@/lib/billing/reservations";
import { diagLog } from "@/lib/diag";

import { isAdminEmail } from "@/lib/admin";
import { hasActiveBetaBypass } from "@/lib/beta";
import { checkAiCallAllowed, fingerprintRequest, recordAiCallForDailySpend } from "@/lib/ai-circuit-breaker";
import {
  getPurchasedPackCreditPriceEur,
  hasEnoughCredits,
  insufficientCreditsMessage,
  resolveEffectivePlan,
} from "@/lib/billing/credits";
import type { Mission, MissionPlan } from "@/types/mission";

export const dynamic = "force-dynamic";

// Same platform-timeout reasoning as api/create/route.ts. reviewMission
// (700 tokens) is this route's only AI call; 90s is ample headroom.
export const maxDuration = 90; // @function-limit 90

// Reviewer Agent entry point (see lib/mission-agents.ts) — only callable
// once every step in the mission's plan is "completed" (mission-card.tsx
// only shows the button then; this route re-checks server-side too, since
// a client-side gate alone isn't trustworthy). Sets status "completed" and
// persists the review text inside plan_steps (see types/mission.ts — no
// separate column for it, per the given schema).
export async function POST(request: Request) {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { ok: false, error: "ANTHROPIC_API_KEY is not configured on the server." },
        { status: 500 }
      );
    }

    let missionId: string;
    try {
      const body = await request.json();
      missionId = typeof body?.missionId === "string" ? body.missionId : "";
    } catch {
      return NextResponse.json({ ok: false, error: "Invalid request body." }, { status: 400 });
    }

    if (!missionId) {
      return NextResponse.json({ ok: false, error: "A missionId is required." }, { status: 400 });
    }

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ ok: false, error: "Not authenticated." }, { status: 401 });
    }

    // RLS scopes this to the caller's own missions — a stranger's id
    // simply won't be found, same pattern as api/chat's conversation load.
    const { data: mission, error: loadError } = await supabase
      .from("ai_missions")
      .select("*")
      .eq("id", missionId)
      .maybeSingle();

    if (loadError) {
      logApiError("/api/mission/review", loadError, { stage: "load_mission" });
      return NextResponse.json({ ok: false, error: "Could not load the mission." }, { status: 500 });
    }
    if (!mission) {
      return NextResponse.json({ ok: false, error: "Mission not found." }, { status: 404 });
    }

    const typedMission = mission as Mission;
    const steps = typedMission.plan_steps?.steps ?? [];
    if (steps.length === 0 || steps.some((s) => s.status !== "completed")) {
      return NextResponse.json(
        { ok: false, error: "Every step must be completed before reviewing this mission." },
        { status: 400 }
      );
    }

    // Circuit breaker: independent of credits (see lib/ai-circuit-breaker.ts).
    const breakerCheck = await checkAiCallAllowed(user.id, "mission_review", fingerprintRequest(missionId));
    if (!breakerCheck.allowed) {
      return NextResponse.json({ ok: true, reviewed: false, rateLimited: true, message: breakerCheck.reason });
    }

    // Credits: read-only check first, actual deduct only after the
    // Reviewer call succeeds AND its result is durably saved — never
    // before. Same pattern as api/mission/plan and every other
    // AI-calling route in this app.
    const isAdmin = isAdminEmail(user.email);
    const bypassCredits = isAdmin || (await hasActiveBetaBypass(user));
    let plan: Awaited<ReturnType<typeof resolveEffectivePlan>> | null = null;

    // The Reviewer is sent the goal AND every completed step, so a mission
    // with twenty steps costs far more than one with three — the old flat
    // 2 credits charged both the same.
    const reviewInputChars =
      typedMission.goal.length +
      steps.reduce((sum, s) => sum + s.text.length + (s.moduleTitle?.length ?? 0), 0);
    const pricingConfig = resolvePricingConfig();
    const accountCreditPriceEur = bypassCredits
      ? pricingConfig.creditPriceEur
      : effectiveCreditPriceEurForAccount(
          (plan = await resolveEffectivePlan(user)),
          await getPurchasedPackCreditPriceEur(user.id),
          pricingConfig
        );
    const estimate = estimateForAction(
      "missionPlan",
      { model: MISSION_AGENT_MODEL, inputChars: reviewInputChars, planSlug: plan?.slug ?? null },
      pricingConfig,
      accountCreditPriceEur
    );
    const costs = new CostAccumulator();

    let reservationId = "";
    if (!bypassCredits) {
      plan = await resolveEffectivePlan(user);
      const check = await hasEnoughCredits(user.id, estimate.reserveCredits, plan);
      if (!check.ok) {
        return NextResponse.json({
          ok: true,
          reviewed: false,
          rateLimited: true,
          outOfCredits: true,
          message: insufficientCreditsMessage(check.remaining, estimate.reserveCredits),
        });
      }
      const reservation = await reserveCredits(user.id, estimate.reserveCredits, "mission_review", {
        missionId,
        stepCount: steps.length,
        estimatedCredits: estimate.estimatedCredits,
      });
      if (!reservation.ok) {
        return NextResponse.json({
          ok: true,
          reviewed: false,
          rateLimited: true,
          outOfCredits: reservation.reason === "insufficient",
          message:
            reservation.reason === "insufficient"
              ? insufficientCreditsMessage(reservation.available, estimate.reserveCredits)
              : "Could not reserve credits for the Reviewer. No credits were charged — please try again.",
        });
      }
      reservationId = reservation.reservationId;
    }

    let reviewText: string;
    try {
      void recordAiCallForDailySpend(estimate.estimatedCredits);
      reviewText = await reviewMission(
        apiKey,
        typedMission.goal,
        steps.map((s) => ({ text: s.text, moduleTitle: s.moduleTitle })),
        costs
      );
    } catch (err) {
      logApiError("/api/mission/review", err, { stage: "reviewer_call" });
      await releaseReservation(user.id, reservationId);
      const errMessage = err instanceof Error ? err.message : "The Reviewer request failed.";
      return NextResponse.json(
        { ok: false, error: `${errMessage} No credits were charged — please try again.` },
        { status: 502 }
      );
    }

    const nextPlanSteps: MissionPlan = { steps, review: reviewText };

    const { data: updated, error: updateError } = await supabase
      .from("ai_missions")
      .update({ status: "completed", plan_steps: nextPlanSteps })
      .eq("id", missionId)
      .select("*")
      .single();

    if (updateError || !updated) {
      logApiError("/api/mission/review", updateError, { stage: "update_mission" });
      await releaseReservation(user.id, reservationId);
      return NextResponse.json(
        { ok: false, error: "Review generated, but could not save it. No credits were charged — please try again." },
        { status: 500 }
      );
    }

    // Only now — the Reviewer succeeded AND the mission is durably saved —
    // is this confirmed a success worth charging for.
    const settlement = await settleReservation({
      userId: user.id,
      reservationId,
      feature: "mission_review",
      costs,
      plan,
      bypassCharge: bypassCredits || !plan,
      metadata: {
        missionId,
        stepCount: steps.length,
        estimatedCredits: estimate.estimatedCredits,
        reservedCredits: bypassCredits ? 0 : estimate.reserveCredits,
      },
    });
    diagLog(
      `[billing] mission_review settled: ${JSON.stringify({
        userId: user.id,
        missionId,
        realCostUsd: settlement.realCostUsd,
        creditsCharged: settlement.creditsCharged,
        achievedMargin: settlement.achievedMargin,
      })}`
    );

    return NextResponse.json({ ok: true, reviewed: true, mission: updated });
  } catch (err) {
    logApiError("/api/mission/review", err);
    return NextResponse.json(
      { ok: false, error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}
