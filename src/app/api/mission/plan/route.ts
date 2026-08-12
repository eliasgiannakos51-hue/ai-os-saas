import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  MISSION_AGENT_MODEL,
  planMission,
  researchGoal,
  type PlanMissionResult,
} from "@/lib/mission-agents";
import { getUserFullContext, buildUserContextPromptAdditionGreek } from "@/lib/user-context";
import { logApiError } from "@/lib/log-error";
import { startJob } from "@/lib/jobs/start-job";
import { CostAccumulator } from "@/lib/billing/cost-accumulator";
import { estimateForAction } from "@/lib/billing/estimate";
import { resolvePricingConfig } from "@/lib/billing/pricing-config";
import { effectiveCreditPriceEurForAccount } from "@/lib/billing/credit-formula";
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
export const maxDuration = 180; // @function-limit 180

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
          (plan = await resolveEffectivePlan(user)),
          await getPurchasedPackCreditPriceEur(user.id),
          pricingConfig
        );
    const estimate = estimateForAction(
      "missionPlan",
      {
        model: MISSION_AGENT_MODEL,
        inputChars: goal.length,
        planSlug: plan?.slug ?? null,
        // MAX_USES on the research pass's web_search tool. Held for
        // whether or not they run — an unused hold is released at
        // settlement, an absent one is a hole in the margin.
        expectedWebSearches: 3,
      },
      pricingConfig,
      accountCreditPriceEur
    );
    // FROM HERE THE ROUTE DOES NOT PLAN.
    //
    // It used to await a web-search pass AND a planning call under a
    // 180-second ceiling — two sequential model calls under a limit that
    // only just covers them, which is the shape that produces a kill. A
    // kill runs no catch block: no mission, no settlement, and the hold
    // left standing against work the user never received.
    const started = await startJob({
      userId: user.id,
      kind: "mission_plan",
      reserve: bypassCredits || !plan ? 0 : estimate.reserveCredits,
      reserveMetadata: { goalChars: goal.length, estimatedCredits: estimate.estimatedCredits },
      input: { goal },
    });

    if (!started.ok) {
      if (started.reason === "insufficient") {
        return NextResponse.json(
          {
            ok: false,
            insufficientCredits: true,
            message: insufficientCreditsMessage(started.available, started.needed),
          },
          { status: 402 }
        );
      }
      return NextResponse.json({ ok: false, error: started.message }, { status: 500 });
    }

    void recordAiCallForDailySpend(estimate.estimatedCredits);

    return NextResponse.json({ ok: true, jobId: started.jobId, queued: true }, { status: 202 });
  } catch (err) {
    logApiError("/api/mission/plan", err);
    return NextResponse.json(
      { ok: false, error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}
