import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { planMission } from "@/lib/mission-agents";
import { logApiError } from "@/lib/log-error";
import { isAdminEmail } from "@/lib/admin";
import { hasActiveBetaBypass } from "@/lib/beta";
import {
  CREDIT_COSTS,
  deductCredits,
  insufficientCreditsMessage,
  resolveEffectivePlan,
} from "@/lib/billing/credits";
import type { MissionPlan } from "@/types/mission";

export const dynamic = "force-dynamic";

const MAX_GOAL_LENGTH = 500;

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

    const isAdmin = isAdminEmail(user.email);
    if (!isAdmin && !(await hasActiveBetaBypass(user))) {
      const plan = await resolveEffectivePlan(user);
      const deduction = await deductCredits(
        user.id,
        CREDIT_COSTS.missionPlan,
        "mission_plan",
        "Mission Control: Planner Agent",
        plan
      );
      if (!deduction.ok) {
        return NextResponse.json({
          ok: true,
          planned: false,
          rateLimited: true,
          message: insufficientCreditsMessage(deduction.remaining, CREDIT_COSTS.missionPlan),
        });
      }
    }

    let steps: string[];
    try {
      steps = await planMission(apiKey, goal);
    } catch (err) {
      logApiError("/api/mission/plan", err, { stage: "planner_call" });
      const errMessage = err instanceof Error ? err.message : "The Planner request failed.";
      return NextResponse.json({ ok: false, error: errMessage }, { status: 502 });
    }

    const planSteps: MissionPlan = {
      steps: steps.map((text) => ({ text, status: "pending" as const })),
    };

    const { data: mission, error: insertError } = await supabase
      .from("ai_missions")
      .insert({ user_id: user.id, goal, status: "planning", plan_steps: planSteps })
      .select("*")
      .single();

    if (insertError || !mission) {
      logApiError("/api/mission/plan", insertError, { stage: "insert_mission" });
      return NextResponse.json(
        { ok: false, error: "Could not save the mission plan." },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, planned: true, mission });
  } catch (err) {
    logApiError("/api/mission/plan", err);
    return NextResponse.json(
      { ok: false, error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}
