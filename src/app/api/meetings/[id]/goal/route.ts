import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { logApiError } from "@/lib/log-error";
import { isFeatureOn } from "@/lib/flags/flags";
import { IN_PROJECT, MAX_MEMBERS, PROJECTS_TABLE, isUuid } from "@/lib/projects/project";
import { chosenIndexes, goalPlan, goalText } from "@/lib/meetings/meeting-goal";
import type { ProposedAction } from "@/lib/meetings/meeting-analysis";

export const dynamic = "force-dynamic";

/**
 * A MEETING'S CHOSEN ACTIONS BECOME THE STEPS OF A GOAL IN A PROJECT
 * (MASTER 16, package 17), behind the switch "meeting-goal".
 *
 * EVERYTHING THROUGH THE PERSON'S OWN CLIENT: the meeting, the project and
 * the new goal are read and written under their RLS, so another account's
 * meeting or project is simply not there (404), and the goal is theirs by
 * the insert policy. The actions are re-read from the meeting by index —
 * the browser sends which, never what (lib/meetings/meeting-goal.ts).
 *
 * A NEW PROJECT IS NOT MADE HERE: the screen makes it first through
 * api/projects, so the plan's project cap is applied in one place.
 *
 * No model, no charge: the meeting was analysed already, and the steps
 * are its own words. Bounded by the same scope as keeping actions.
 */
export async function POST(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, code: "bad_request" }, { status: 400 });
  }
  const indexes = chosenIndexes(body.keep);
  if (indexes.length === 0) return NextResponse.json({ ok: false, code: "nothing_chosen" }, { status: 400 });
  const projectId = isUuid(body.projectId) ? body.projectId : null;
  if (!projectId) return NextResponse.json({ ok: false, code: "no_project" }, { status: 400 });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, code: "unauthenticated" }, { status: 401 });
  if (!(await isFeatureOn("meeting-goal", user))) return NextResponse.json({ ok: false, code: "not_enabled" }, { status: 403 });

  try {
    const limited = await checkRateLimit({ scope: "meeting_actions", identifier: user.id, maxAttempts: 120, windowMinutes: 60 });
    if (!limited.allowed) return NextResponse.json({ ok: false, code: "rate_limited" }, { status: 429 });

    const { data: meeting, error: readError } = await supabase
      .from("meetings")
      .select("id, title, proposed_actions")
      .eq("id", params.id)
      .eq("user_id", user.id)
      .maybeSingle();
    if (readError) throw readError;
    if (!meeting) return NextResponse.json({ ok: false, code: "not_found" }, { status: 404 });

    const proposals = Array.isArray(meeting.proposed_actions) ? (meeting.proposed_actions as ProposedAction[]) : [];
    const plan = goalPlan(proposals, indexes);
    if (!plan) return NextResponse.json({ ok: false, code: "nothing_chosen" }, { status: 400 });

    const { data: project, error: projectError } = await supabase
      .from(PROJECTS_TABLE)
      .select("id")
      .eq("id", projectId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (projectError) throw projectError;
    if (!project) return NextResponse.json({ ok: false, code: "no_such_project" }, { status: 404 });

    const { count } = await supabase
      .from("entity_links")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("relationship_type", IN_PROJECT)
      .eq("target_table", PROJECTS_TABLE)
      .eq("target_id", projectId);
    if ((count ?? 0) >= MAX_MEMBERS) return NextResponse.json({ ok: false, code: "project_full" }, { status: 400 });

    const { data: mission, error: missionError } = await supabase
      .from("ai_missions")
      .insert({ user_id: user.id, goal: goalText(body.goal, String(meeting.title ?? "")), status: "planning", plan_steps: plan })
      .select("id")
      .single();
    if (missionError || !mission) throw missionError ?? new Error("no mission returned");

    const { error: linkError } = await supabase.from("entity_links").insert({
      user_id: user.id,
      source_table: "ai_missions",
      source_id: mission.id,
      target_table: PROJECTS_TABLE,
      target_id: projectId,
      relationship_type: IN_PROJECT,
    });
    if (linkError) {
      // A GOAL OUTSIDE THE PROJECT IT WAS MADE FOR is not what was asked:
      // it is taken back, and the person is told nothing was made.
      await supabase.from("ai_missions").delete().eq("id", mission.id).eq("user_id", user.id);
      throw linkError;
    }

    return NextResponse.json({ ok: true, missionId: mission.id, projectId, steps: plan.steps.length });
  } catch (err) {
    logApiError("/api/meetings/[id]/goal", err);
    return NextResponse.json({ ok: false, code: "failed" }, { status: 500 });
  }
}
