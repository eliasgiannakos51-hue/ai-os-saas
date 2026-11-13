import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { logApiError } from "@/lib/log-error";
import { isFlowMode, readFlow } from "@/lib/automations/boxes";
import { FLOW_COLUMNS, UUID, claimFlow, flowGate, isColumnMissing, refuse, releaseFlow, saveVersion, scheduleAfterChange, type FlowRecord } from "@/lib/automations/flow-access";
import { createAdminClient } from "@/lib/supabase/admin";
import { isFeatureOn } from "@/lib/flags/flags";
import { MAX_MINUTES, MIN_MINUTES, readMinutes } from "@/lib/automations/time-saved";

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
 *
 * `minutes_saved` IS ITS OWN WRITE, after the switch "automation-time-saved"
 * (the owner, 2026-11-05): how many minutes the job used to take, the
 * person's own figure, 1-480 or null to clear it. Its own update and not
 * one more key in `plain`, because the column arrives with a migration
 * pasted by hand (20261114000000): a database without it refuses that
 * update whole, and the limit or the name sent with it must not be
 * refused with it. Without the column the answer is `not_ready`, and the
 * screen never offers the field then anyway (lib/automations/page-data.ts).
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

  let mode: string | undefined;
  if (body.mode !== undefined) {
    if (!(await isFeatureOn("agents-automations-pro", user))) return refuse("not_enabled", 403);
    if (!isFlowMode(body.mode)) return refuse("bad_mode", 400);
    mode = body.mode;
    const { error } = await createAdminClient().from("automation_flows").update({ mode }).eq("id", id).eq("user_id", user.id);
    if (error) {
      if (isColumnMissing(error)) return refuse("not_ready", 409);
      logApiError("/api/automations/flows/[id]", error, { stage: "mode" });
      return refuse("save_failed", 500);
    }
  }

  let minutesSaved: number | null | undefined;
  if (body.minutes_saved !== undefined) {
    if (!(await isFeatureOn("automation-time-saved", user))) return refuse("not_enabled", 403);
    minutesSaved = body.minutes_saved === null ? null : readMinutes(body.minutes_saved);
    if (body.minutes_saved !== null && minutesSaved === null) return refuse("bad_minutes", 400, { min: MIN_MINUTES, max: MAX_MINUTES });
    const { error } = await createAdminClient().from("automation_flows").update({ minutes_saved: minutesSaved }).eq("id", id).eq("user_id", user.id);
    if (error) {
      if (isColumnMissing(error)) return refuse("not_ready", 409);
      logApiError("/api/automations/flows/[id]", error, { stage: "minutes_saved" });
      return refuse("save_failed", 500);
    }
  }

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
      const schedule = await scheduleAfterChange(user, flow, verdict.boxes);
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
  } else if (minutesSaved === undefined && mode === undefined) {
    return refuse("nothing_to_change", 400);
  }

  const { data: row } = await supabase.from("automation_flows").select(FLOW_COLUMNS).eq("id", id).eq("user_id", user.id).maybeSingle();
  return NextResponse.json({ ok: true, flow: row, paused, ...(minutesSaved !== undefined ? { minutesSaved } : {}), ...(mode !== undefined ? { mode } : {}) });
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
