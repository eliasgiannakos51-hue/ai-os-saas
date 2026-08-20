import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { logApiError } from "@/lib/log-error";
import type { Mission } from "@/types/mission";

export const dynamic = "force-dynamic";

/**
 * Deleting a mission.
 *
 * There was no way to. Not a hidden one, not an API without a button —
 * no endpoint at all, so a mission created by mistake stayed on the list
 * for the life of the account.
 *
 * OWNERSHIP IS CHECKED TWICE, on purpose. This runs on the user's own
 * client, so the delete_own_ai_missions RLS policy already scopes it —
 * but an explicit `.eq("user_id", user.id)` costs nothing and does not
 * depend on a policy staying correct through the next migration. The same
 * belt-and-braces the AI-context leak taught us to write.
 *
 * THE STEPS GO WITH IT for free: they are a jsonb column of this row, not
 * separate rows. The scheduled runs are separate, and their foreign key
 * is `on delete cascade` (baseline_schema.sql:1285) — so they go too,
 * which is why the confirmation is told to count them.
 */
export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ ok: false, error: "Not authenticated." }, { status: 401 });

    const missionId = params.id;
    // Read it first, so the answer can say what was actually removed
    // rather than "done" — and so a missing row is a 404 rather than a
    // silent success on zero rows.
    const { data: mission, error: readError } = await supabase
      .from("ai_missions")
      .select("id, goal, plan_steps")
      .eq("id", missionId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (readError) {
      logApiError("/api/mission/[id]", readError, { stage: "read" });
      return NextResponse.json({ ok: false, error: "Could not delete this mission." }, { status: 500 });
    }
    if (!mission) {
      return NextResponse.json({ ok: false, error: "Mission not found." }, { status: 404 });
    }

    const { count: scheduledRuns } = await supabase
      .from("scheduled_agent_runs")
      .select("id", { count: "exact", head: true })
      .eq("mission_id", missionId)
      .eq("user_id", user.id)
      .eq("status", "pending");

    const { error: deleteError } = await supabase
      .from("ai_missions")
      .delete()
      .eq("id", missionId)
      .eq("user_id", user.id);
    if (deleteError) {
      logApiError("/api/mission/[id]", deleteError, { stage: "delete" });
      return NextResponse.json({ ok: false, error: "Could not delete this mission." }, { status: 500 });
    }

    const steps = (mission as Mission).plan_steps?.steps ?? [];
    return NextResponse.json({
      ok: true,
      deleted: {
        goal: (mission as Mission).goal,
        steps: steps.length,
        completedSteps: steps.filter((s) => s.status === "completed").length,
        scheduledRuns: scheduledRuns ?? 0,
      },
    });
  } catch (err) {
    logApiError("/api/mission/[id]", err);
    return NextResponse.json({ ok: false, error: "Something went wrong." }, { status: 500 });
  }
}
