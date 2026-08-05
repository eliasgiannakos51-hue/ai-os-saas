import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  MISSION_AGENT_MODEL,
  planMission,
  researchGoal,
  type PlanMissionResult,
} from "@/lib/mission-agents";
import { getUserFullContext, buildUserContextPromptAdditionGreek } from "@/lib/user-context";
import { logSecurityCheck } from "@/lib/security-check-log";
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
import type { MissionPlan } from "@/types/mission";

export const dynamic = "force-dynamic";

// See api/create/route.ts's comment — same platform-timeout root cause
// behind the misleading "Network error" symptom. planMission (1024
// tokens) is this route's only AI call; 90s is ample headroom.
// Two sequential Claude calls now, and the first can run up to three real
// web searches before it answers. 90s was comfortable for one call and is
// not for this.
export const maxDuration = 180;

const MAX_GOAL_LENGTH = 20000;

// Planner Agent entry point (see lib/mission-agents.ts) — Mission
// Control's first step. Creates a new ai_missions row with a freshly
// planned checklist, status "planning". Building each step and reviewing
// the finished mission are separate, user-driven actions (see
// mission-card.tsx) — this route only ever plans.
export async function POST(request: Request) {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { ok: false, error: "ANTHROPIC_API_KEY is not configured on the server." },
        { status: 500 }
      );
    }

    let goal: string;
    try {
      const body = await request.json();
      goal = typeof body?.goal === "string" ? body.goal.trim() : "";
    } catch {
      return NextResponse.json({ ok: false, error: "Invalid request body." }, { status: 400 });
    }

    if (!goal) {
      return NextResponse.json({ ok: false, error: "A goal is required." }, { status: 400 });
    }
    if (goal.length > MAX_GOAL_LENGTH) {
      return NextResponse.json(
        {
          ok: false,
          error: `Goal is too long (${goal.length}/${MAX_GOAL_LENGTH} characters) — please shorten it.`,
        },
        { status: 400 }
      );
    }

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ ok: false, error: "Not authenticated." }, { status: 401 });
    }

    // Circuit breaker: independent of credits (see lib/ai-circuit-breaker.ts).
    const breakerCheck = await checkAiCallAllowed(user.id, "mission_plan", fingerprintRequest(goal));
    if (!breakerCheck.allowed) {
      return NextResponse.json({ ok: true, planned: false, rateLimited: true, message: breakerCheck.reason });
    }

    // Credits: read-only check first (reject early, no AI call made at
    // all), the actual deduct only happens after confirmed success below
    // — either the Planner's clarification response, or a successfully
    // saved mission — never before the call. If planMission() throws
    // (network error, timeout, API error, anything), nothing below ever
    // runs and zero credits are charged. Same pattern as api/create,
    // api/chat, api/websites/edit, api/websites/generate/process.
    const isAdmin = isAdminEmail(user.email);
    const bypassCredits = isAdmin || (await hasActiveBetaBypass(user));
    let plan: Awaited<ReturnType<typeof resolveEffectivePlan>> | null = null;

    // A two-word goal and a 3,000-character one no longer cost the same
    // flat 2 credits — the Planner's real token use follows the goal.
    const pricingConfig = resolvePricingConfig();
    const accountCreditPriceEur = bypassCredits
      ? pricingConfig.creditPriceEur
      : effectiveCreditPriceEurForAccount(
          await resolveEffectivePlan(user),
          await getPurchasedPackCreditPriceEur(user.id),
          pricingConfig
        );
    const estimate = estimateForAction(
      "missionPlan",
      {
        model: MISSION_AGENT_MODEL,
        inputChars: goal.length,
        // MAX_USES on the research pass's web_search tool. Held for
        // whether or not they run — an unused hold is released at
        // settlement, an absent one is a hole in the margin.
        expectedWebSearches: 3,
      },
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
          planned: false,
          rateLimited: true,
          outOfCredits: true,
          message: insufficientCreditsMessage(check.remaining, estimate.reserveCredits),
        });
      }
      const reservation = await reserveCredits(user.id, estimate.reserveCredits, "mission_plan", {
        goalChars: goal.length,
        estimatedCredits: estimate.estimatedCredits,
      });
      if (!reservation.ok) {
        return NextResponse.json({
          ok: true,
          planned: false,
          rateLimited: true,
          outOfCredits: reservation.reason === "insufficient",
          message:
            reservation.reason === "insufficient"
              ? insufficientCreditsMessage(reservation.available, estimate.reserveCredits)
              : "Could not reserve credits for the Planner. No credits were charged — please try again.",
        });
      }
      reservationId = reservation.reservationId;
    }

    // "AI Life Context" — same consolidated user picture used by
    // api/chat/route.ts and api/create/route.ts (see lib/user-context.ts),
    // so the Planner grounds its steps in the user's real existing
    // modules/missions/products instead of the goal text in isolation.
    // Greek variant, matching PLANNER_SYSTEM_PROMPT's own language.
    // Best-effort: a lookup failure just means planning falls back to the
    // goal alone, same as before this was added.
    let userContext = "";
    try {
      const fullContext = await getUserFullContext(supabase, user.id);
      userContext = buildUserContextPromptAdditionGreek(fullContext);
    } catch (err) {
      logApiError("/api/mission/plan", err, { stage: "user_full_context" });
    }

    let planResult: PlanMissionResult;
    try {
      void recordAiCallForDailySpend(estimate.estimatedCredits);
      // Research first, plan second. Best-effort and self-limiting: it
      // searches only when the goal actually depends on external facts,
      // caps itself at 3 searches, and returns nothing on any failure —
      // in which case planning runs on the goal alone, exactly as before.
      const research = await researchGoal(apiKey, goal, costs);
      planResult = await planMission(apiKey, goal, userContext, costs, research.findings);
    } catch (err) {
      logApiError("/api/mission/plan", err, { stage: "planner_call" });
      await releaseReservation(user.id, reservationId);
      const errMessage = err instanceof Error ? err.message : "The Planner request failed.";
      return NextResponse.json(
        { ok: false, error: `${errMessage} No credits were charged — please try again.` },
        { status: 502 }
      );
    }

    let settled = false;
    async function chargeMissionPlan() {
      // Guarded — called from more than one terminal branch.
      if (settled) return;
      settled = true;
      const settlement = await settleReservation({
        userId: user!.id,
        reservationId,
        feature: "mission_plan",
        costs,
        plan,
        bypassCharge: bypassCredits || !plan,
        metadata: {
          goalChars: goal.length,
          estimatedCredits: estimate.estimatedCredits,
          reservedCredits: bypassCredits ? 0 : estimate.reserveCredits,
        },
      });
      diagLog(
        `[billing] mission_plan settled: ${JSON.stringify({
          userId: user!.id,
          realCostUsd: settlement.realCostUsd,
          creditsCharged: settlement.creditsCharged,
          achievedMargin: settlement.achievedMargin,
        })}`
      );
    }

    // Vague goal (e.g. "θέλω να πετύχω") — the Planner asked for
    // clarification instead of inventing generic filler steps. No mission
    // is created, but a real, useful AI response was still returned to
    // the user — charged now, same as api/create's "not matched"
    // classification path (a real Anthropic call happened either way).
    if (planResult.clarificationNeeded) {
      await chargeMissionPlan();
      return NextResponse.json({
        ok: true,
        planned: false,
        message: planResult.clarificationQuestion,
      });
    }

    // AI Output Protection Layer — the plan step-filtering (too-short/
    // duplicate steps dropped, see lib/mission-agents.ts's
    // parsePlanMissionToolInput) already ran as part of planMission()
    // above; this just records that it happened. resourceId is set once
    // the mission row exists below, since that's the id the badge
    // (components/security/security-checked-badge.tsx) looks up by.

    const planSteps: MissionPlan = {
      steps: planResult.steps.map((step) => ({
        text: step.text,
        status: "pending" as const,
        // Only written when the Planner actually supplied them, so a plan
        // without sub-steps stores exactly the shape it always did.
        ...(step.outcome ? { outcome: step.outcome } : {}),
        ...(step.estimatedMinutes ? { estimatedMinutes: step.estimatedMinutes } : {}),
        ...(step.substeps
          ? { substeps: step.substeps.map((text) => ({ text, status: "pending" as const })) }
          : {}),
      })),
    };

    const { data: mission, error: insertError } = await supabase
      .from("ai_missions")
      .insert({ user_id: user.id, goal, status: "planning", plan_steps: planSteps })
      .select("*")
      .single();

    if (insertError || !mission) {
      logApiError("/api/mission/plan", insertError, { stage: "insert_mission" });
      return NextResponse.json(
        { ok: false, error: "Could not save the mission plan. No credits were charged — please try again." },
        { status: 500 }
      );
    }

    void logSecurityCheck(supabase, {
      userId: user.id,
      resourceType: "mission_plan",
      resourceId: mission.id,
      result: {
        passed: true,
        checks: ["plan step validation (length + duplicate filtering)"],
        issues: [],
      },
    });

    // Only now — the Planner succeeded AND the mission is durably saved —
    // is this confirmed a success worth charging for.
    await chargeMissionPlan();

    return NextResponse.json({ ok: true, planned: true, mission });
  } catch (err) {
    logApiError("/api/mission/plan", err);
    return NextResponse.json(
      { ok: false, error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}
