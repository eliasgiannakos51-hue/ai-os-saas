import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { logApiError } from "@/lib/log-error";
import {
  deleteMissionStep,
  restoreMissionStep,
  editMissionStepText,
  moveMissionStep,
  type RemovedRun,
  type StepMutationResult,
} from "@/lib/mission-step-edits";
import type { MissionStep } from "@/types/mission";

export const dynamic = "force-dynamic";

/** Longest a step's text may be. Not a database limit — a step nobody can
 *  read at a glance is not a step, and the Planner's own are far shorter. */
const MAX_STEP_TEXT = 500;

/**
 * Editing the steps of a mission: delete, undo that delete, rewrite the
 * text, move one up or down.
 *
 * ONE ROUTE FOR THE FOUR, because all four have the same two hazards —
 * the caller must own the mission, and every one of them can invalidate
 * `scheduled_agent_runs.step_index`. Four routes would be four chances to
 * remember only the first. The index fix-up itself lives in
 * lib/mission-step-edits.ts, once per operation.
 */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ ok: false, error: "Not authenticated." }, { status: 401 });

    let body: { action?: unknown; index?: unknown; text?: unknown; direction?: unknown; step?: unknown; runs?: unknown };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ ok: false, error: "Invalid request body." }, { status: 400 });
    }

    const missionId = params.id;
    // OWNERSHIP FIRST, always — before the index is even looked at. The
    // mission is re-read on the user's own client, so RLS scopes it too;
    // the explicit filter is the part that does not depend on a policy.
    const { data: mission, error: readError } = await supabase
      .from("ai_missions")
      .select("id")
      .eq("id", missionId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (readError) {
      logApiError("/api/mission/[id]/steps", readError, { stage: "ownership" });
      return NextResponse.json({ ok: false, error: "Could not change this step." }, { status: 500 });
    }
    if (!mission) return NextResponse.json({ ok: false, error: "Mission not found." }, { status: 404 });

    const index = Number(body.index);
    if (!Number.isInteger(index) || index < 0) {
      return NextResponse.json({ ok: false, error: "Which step?" }, { status: 400 });
    }

    let result: StepMutationResult;
    switch (body.action) {
      case "delete":
        result = await deleteMissionStep(supabase, missionId, user.id, index);
        break;
      case "restore": {
        const step = body.step as MissionStep | undefined;
        if (!step || typeof step.text !== "string") {
          return NextResponse.json({ ok: false, error: "Nothing to restore." }, { status: 400 });
        }
        const runs = Array.isArray(body.runs) ? (body.runs as RemovedRun[]) : [];
        result = await restoreMissionStep(supabase, missionId, user.id, index, step, runs);
        break;
      }
      case "edit": {
        const text = String(body.text ?? "").trim();
        if (!text) return NextResponse.json({ ok: false, error: "A step needs some text." }, { status: 400 });
        if (text.length > MAX_STEP_TEXT) {
          return NextResponse.json(
            { ok: false, error: `A step can be up to ${MAX_STEP_TEXT} characters.` },
            { status: 400 }
          );
        }
        result = await editMissionStepText(supabase, missionId, user.id, index, text);
        break;
      }
      case "move": {
        const direction = body.direction === "up" ? "up" : body.direction === "down" ? "down" : null;
        if (!direction) return NextResponse.json({ ok: false, error: "Which way?" }, { status: 400 });
        result = await moveMissionStep(supabase, missionId, user.id, index, direction);
        break;
      }
      default:
        return NextResponse.json({ ok: false, error: "Unknown action." }, { status: 400 });
    }

    if (!result.ok) {
      if (result.conflict) {
        // Somebody else changed this plan while we were working — the
        // same conditional-write guard the rest of Mission Control uses.
        return NextResponse.json(
          { ok: false, conflict: true, error: "This plan changed somewhere else. Reload and try again." },
          { status: 409 }
        );
      }
      logApiError("/api/mission/[id]/steps", result.error, { stage: String(body.action) });
      return NextResponse.json({ ok: false, error: "Could not change this step." }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      ...(result.removedStep ? { removedStep: result.removedStep } : {}),
      ...(result.removedRuns ? { removedRuns: result.removedRuns } : {}),
    });
  } catch (err) {
    logApiError("/api/mission/[id]/steps", err);
    return NextResponse.json({ ok: false, error: "Something went wrong." }, { status: 500 });
  }
}
