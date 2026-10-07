import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logApiError } from "@/lib/log-error";
import { isFeatureOn } from "@/lib/flags/flags";
import { IN_PROJECT, PROJECTS_TABLE } from "@/lib/projects/project";
import { STEP_STATUSES, STEP_TABLE, flowStatus, readPlan, readStepStates, type StepStatus } from "@/lib/flows/plan";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * ONE STEP OF A FLOW: STARTED, MADE, OR FAILED (package 36).
 *
 * The screen runs each step through that tool's own request, and tells
 * this route what came of it. A step that MADE something names its row;
 * the row is read back here, from the step's own table, as the person's
 * own, BEFORE it is put in the project — so a request cannot file
 * somebody else's site, or a row of another kind, into a project. Then
 * the edge into the project (entity_links, in_project) is written once.
 *
 * A step may only start once everything it waits for is done: a deck is
 * made from a finished research or not at all.
 */
export async function POST(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  if (!UUID.test(params.id)) return NextResponse.json({ ok: false, code: "not_found" }, { status: 404 });
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, code: "invalid_body" }, { status: 400 });
  }
  const stepId = typeof body.step === "string" ? body.step : "";
  const status = (STEP_STATUSES as readonly unknown[]).includes(body.status) ? (body.status as StepStatus) : null;
  const row = typeof body.row === "string" && UUID.test(body.row) ? body.row : null;
  const error = typeof body.error === "string" ? body.error.replace(/[^a-z_]/g, "").slice(0, 40) : null;
  if (!status) return NextResponse.json({ ok: false, code: "invalid_body" }, { status: 400 });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, code: "not_signed_in" }, { status: 401 });
  if (!(await isFeatureOn("flows", user))) return NextResponse.json({ ok: false, code: "not_enabled" }, { status: 403 });

  try {
    const { data: flow, error: loadError } = await supabase
      .from("project_flows")
      .select("id, project_id, plan, steps, status, updated_at")
      .eq("id", params.id)
      .eq("user_id", user.id)
      .maybeSingle();
    if (loadError) {
      logApiError("/api/flows/[id]/steps", loadError, { stage: "load" });
      return NextResponse.json({ ok: false, code: "load_failed" }, { status: 500 });
    }
    if (!flow) return NextResponse.json({ ok: false, code: "not_found" }, { status: 404 });
    const plan = readPlan(flow.plan);
    const step = plan.steps.find((s) => s.id === stepId);
    if (!step) return NextResponse.json({ ok: false, code: "no_such_step" }, { status: 400 });
    if (status === "done" && !row) return NextResponse.json({ ok: false, code: "no_row" }, { status: 400 });
    /**
     * What the step's current state allows, asked again on every attempt
     * below: a finished step is not reopened; a step starts only once what
     * it waits for is done; and a step is CLAIMED once — a second screen
     * that tries to start it while it runs is told so, and starts nothing.
     */
    const refusal = (states: Record<string, { status: string; row?: string }>): string | null => {
      const now = states[step.id];
      if (now?.status === "done") return "already_done";
      if (status === "running" && !step.after.every((a) => states[a]?.status === "done")) return "waiting";
      if (status === "running" && !row && now?.status === "running") return "already_running";
      return null;
    };
    const first = refusal(readStepStates(flow.steps, plan));
    if (first) return NextResponse.json({ ok: false, code: first }, { status: 409 });

    if (row) {
      const table = STEP_TABLE[step.kind];
      // THE PERSON'S OWN ROW, of this step's kind, or nothing goes in.
      const { data: made } = await supabase.from(table).select("id").eq("id", row).eq("user_id", user.id).maybeSingle();
      if (!made) return NextResponse.json({ ok: false, code: "not_yours" }, { status: 404 });
      if (status === "done") {
        const { count } = await supabase
          .from("entity_links")
          .select("id", { count: "exact", head: true })
          .eq("user_id", user.id)
          .eq("source_table", table)
          .eq("source_id", row)
          .eq("target_table", PROJECTS_TABLE)
          .eq("target_id", flow.project_id)
          .eq("relationship_type", IN_PROJECT);
        if ((count ?? 0) === 0) {
          const { error: linkError } = await supabase.from("entity_links").insert({
            user_id: user.id,
            source_table: table,
            source_id: row,
            target_table: PROJECTS_TABLE,
            target_id: flow.project_id,
            relationship_type: IN_PROJECT,
          });
          if (linkError) {
            logApiError("/api/flows/[id]/steps", linkError, { stage: "link" });
            return NextResponse.json({ ok: false, code: "link_failed" }, { status: 500 });
          }
        }
      }
    }

    // STEPS RUN SIDE BY SIDE, and two can finish in the same second: each
    // write is conditional on the row being as it was read, and is read
    // again and retried when another step's write came first, so neither
    // step's result is lost.
    const admin = createAdminClient();
    let current = { steps: flow.steps, updated_at: flow.updated_at as string };
    for (let attempt = 0; attempt < 4; attempt++) {
      const before = readStepStates(current.steps, plan);
      const late = attempt > 0 ? refusal(before) : null;
      if (late) return NextResponse.json({ ok: false, code: late }, { status: 409 });
      const next = { ...before, [step.id]: { status, ...(row ? { row } : {}), ...(status === "failed" && error ? { error } : {}) } };
      const overall = flowStatus(plan, next);
      const { data: saved, error: saveError } = await admin
        .from("project_flows")
        .update({ steps: next, status: overall })
        .eq("id", params.id)
        .eq("user_id", user.id)
        .eq("updated_at", current.updated_at)
        .select("id");
      if (saveError) {
        logApiError("/api/flows/[id]/steps", saveError, { stage: "save" });
        return NextResponse.json({ ok: false, code: "save_failed" }, { status: 500 });
      }
      if (saved && saved.length === 1) return NextResponse.json({ ok: true, steps: next, status: overall });
      const { data: again } = await supabase.from("project_flows").select("steps, updated_at").eq("id", params.id).eq("user_id", user.id).maybeSingle();
      if (!again) return NextResponse.json({ ok: false, code: "not_found" }, { status: 404 });
      current = { steps: again.steps, updated_at: again.updated_at as string };
    }
    return NextResponse.json({ ok: false, code: "busy" }, { status: 409 });
  } catch (err) {
    logApiError("/api/flows/[id]/steps", err);
    return NextResponse.json({ ok: false, code: "save_failed" }, { status: 500 });
  }
}
