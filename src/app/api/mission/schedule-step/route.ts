import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isAgentRole, type AgentRole } from "@/lib/agent-roles";
import { logApiError } from "@/lib/log-error";
import type { Mission } from "@/types/mission";

export const dynamic = "force-dynamic";

// "Schedule for tomorrow" (see mission-card.tsx) — records the user's
// explicit choice to run this exact step's "Create with AI" a day later,
// via the daily cron job (api/cron/scheduled-runs/route.ts) instead of
// live in the browser right now. No credit check or AI call happens
// here — this route only ever writes a 'pending' row; the cron job is
// solely responsible for checking credits and actually running the step
// when its scheduled day arrives.
export async function POST(request: Request) {
  try {
    let missionId: string;
    let stepIndex: number;
    let agentRole: AgentRole;
    try {
      const body = await request.json();
      missionId = typeof body?.missionId === "string" ? body.missionId : "";
      stepIndex = typeof body?.stepIndex === "number" ? body.stepIndex : -1;
      agentRole = isAgentRole(body?.agentRole) ? body.agentRole : "general";
    } catch {
      return NextResponse.json({ ok: false, error: "Invalid request body." }, { status: 400 });
    }

    if (!missionId || stepIndex < 0) {
      return NextResponse.json({ ok: false, error: "missionId and stepIndex are required." }, { status: 400 });
    }

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ ok: false, error: "Not authenticated." }, { status: 401 });
    }

    // RLS scopes this to the caller's own mission — a stranger's id simply
    // won't be found, same pattern as api/mission/review's lookup.
    const { data: mission, error: loadError } = await supabase
      .from("ai_missions")
      .select("*")
      .eq("id", missionId)
      .maybeSingle();

    if (loadError) {
      logApiError("/api/mission/schedule-step", loadError, { stage: "load_mission" });
      return NextResponse.json({ ok: false, error: "Could not load the mission." }, { status: 500 });
    }
    if (!mission) {
      return NextResponse.json({ ok: false, error: "Mission not found." }, { status: 404 });
    }

    const typedMission = mission as Mission;
    const step = typedMission.plan_steps?.steps?.[stepIndex];
    if (!step) {
      return NextResponse.json({ ok: false, error: "Step not found." }, { status: 404 });
    }
    if (step.status === "completed") {
      return NextResponse.json({ ok: false, error: "This step is already completed." }, { status: 400 });
    }

    // Tomorrow relative to the server's own clock (date-only — the cron
    // runs once/day, so a precise time-of-day here wouldn't be actionable
    // anyway). Same "no reliable per-user timezone" honesty as
    // lib/trading-pattern.ts's hour-of-day pattern.
    const tomorrow = new Date();
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    const scheduledFor = tomorrow.toISOString().slice(0, 10);

    const { data: run, error: insertError } = await supabase
      .from("scheduled_agent_runs")
      .insert({
        user_id: user.id,
        mission_id: missionId,
        step_index: stepIndex,
        step_text: step.text,
        agent_role: agentRole,
        status: "pending",
        scheduled_for: scheduledFor,
      })
      .select()
      .single();

    if (insertError) {
      logApiError("/api/mission/schedule-step", insertError, { stage: "insert" });
      return NextResponse.json({ ok: false, error: "Could not schedule this step. Please try again." }, { status: 500 });
    }

    return NextResponse.json({ ok: true, run });
  } catch (err) {
    logApiError("/api/mission/schedule-step", err);
    return NextResponse.json({ ok: false, error: "Something went wrong." }, { status: 500 });
  }
}
