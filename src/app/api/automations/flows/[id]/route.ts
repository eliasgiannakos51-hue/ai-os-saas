import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { logApiError } from "@/lib/log-error";
import { readFlow } from "@/lib/automations/boxes";
import { FLOW_COLUMNS, UUID, claimFlow, flowGate, refuse, releaseFlow, saveVersion, scheduleAfterChange, type FlowRecord } from "@/lib/automations/flow-access";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/** The most one run may cost, in credits: the same bounds as the column's check. */
const LIMIT_MIN = 1;
const LIMIT_MAX = 5000;
/** What a version made by hand says it was made from. */
const BY_HAND = "manual";

/**
 * AN AUTOMATION CHANGED BY HAND, AND DELETED (MASTER 16, package 30).
 *
 * PATCH takes the whole row of boxes as the screen edited it — a time, a
 * source, an instruction, an action, chosen from lists — and keeps it
 * only if it is still a row (lib/automations/boxes.ts readFlow). No model
 * is called and nothing is charged; it is a new version, so «Αναίρεση»
 * takes it back like a change with words. The limit and the name change
 * on their own, without a version.
 *
 * DELETE takes its versions and runs with it (on delete cascade). A run
 * waiting for approval is not sent.
 */
export async function PATCH(request: Request, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  if (!UUID.test(id)) return refuse("not_found", 404);
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return refuse("invalid_body", 400);
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return refuse("not_signed_in", 401);
  const gate = await flowGate(user);
  if (gate instanceof NextResponse) return gate;

  const { data: found, error: loadError } = await supabase
    .from("automation_flows")
    .select(FLOW_COLUMNS)
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (loadError) {
    logApiError("/api/automations/flows/[id]", loadError, { stage: "load" });
    return refuse("load_failed", 500);
  }
  if (!found) return refuse("not_found", 404);
  const flow = found as FlowRecord;

  const plain: Record<string, unknown> = {};
  if (body.cost_limit !== undefined) {
    const limit = Number(body.cost_limit);
    if (!Number.isInteger(limit) || limit < LIMIT_MIN || limit > LIMIT_MAX) return refuse("bad_limit", 400, { min: LIMIT_MIN, max: LIMIT_MAX });
    plain.cost_limit = limit;
  }
  if (body.name !== undefined) {
    const name = typeof body.name === "string" ? body.name.trim().slice(0, 60) : "";
    if (!name) return refuse("bad_name", 400);
    plain.name = name;
  }

  let paused: string[] = [];
  if (body.boxes !== undefined) {
    const verdict = readFlow(body.boxes);
    if (!verdict.ok) return refuse("bad_boxes", 400, { reason: verdict.reason });
    if (!(await claimFlow(id, user.id))) return refuse("busy", 409);
    try {
      const schedule = await scheduleAfterChange(user.id, flow, verdict.boxes);
      paused = schedule.paused;
      const saved = await saveVersion({ flowId: id, userId: user.id, version: flow.version + 1, boxes: verdict.boxes, said: BY_HAND, extra: { ...schedule.patch, ...plain } });
      if (!saved) return refuse("save_failed", 500);
    } finally {
      await releaseFlow(id, user.id);
    }
  } else if (Object.keys(plain).length > 0) {
    const { error } = await createAdminClient().from("automation_flows").update(plain).eq("id", id).eq("user_id", user.id);
    if (error) {
      logApiError("/api/automations/flows/[id]", error, { stage: "plain" });
      return refuse("save_failed", 500);
    }
  } else {
    return refuse("nothing_to_change", 400);
  }

  const { data: row } = await supabase.from("automation_flows").select(FLOW_COLUMNS).eq("id", id).eq("user_id", user.id).maybeSingle();
  return NextResponse.json({ ok: true, flow: row, paused });
}

export async function DELETE(_request: Request, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  if (!UUID.test(id)) return refuse("not_found", 404);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return refuse("not_signed_in", 401);
  const gate = await flowGate(user);
  if (gate instanceof NextResponse) return gate;
  // The person's own delete, under their own policy
  // (automation_flows_delete_own): nothing here can reach another's row.
  const { data, error } = await supabase.from("automation_flows").delete().eq("id", id).eq("user_id", user.id).select("id");
  if (error) {
    logApiError("/api/automations/flows/[id]", error, { stage: "delete" });
    return refuse("delete_failed", 500);
  }
  if (!data || data.length === 0) return refuse("not_found", 404);
  return NextResponse.json({ ok: true });
}
