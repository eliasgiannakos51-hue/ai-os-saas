import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logApiError } from "@/lib/log-error";
import { readFlow } from "@/lib/automations/boxes";
import { FLOW_COLUMNS, UUID, claimFlow, flowGate, refuse, releaseFlow, scheduleAfterChange, type FlowRecord } from "@/lib/automations/flow-access";

export const dynamic = "force-dynamic";

/**
 * «ΑΝΑΙΡΕΣΗ» (MASTER 16, package 30): the boxes go back to the version
 * before the one showing, and that one is what shows. The undone version
 * stays in the table until the next change replaces it
 * (lib/automations/flow-access.ts saveVersion), so undoing twice goes
 * back two. Free: no model is called.
 */
export async function POST(_request: Request, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  if (!UUID.test(id)) return refuse("not_found", 404);
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
    logApiError("/api/automations/flows/[id]/undo", loadError, { stage: "load" });
    return refuse("load_failed", 500);
  }
  if (!found) return refuse("not_found", 404);
  const flow = found as FlowRecord;
  if (flow.version <= 1) return refuse("nothing_to_undo", 409);

  const { data: previous, error: versionError } = await supabase
    .from("automation_flow_versions")
    .select("version, boxes")
    .eq("flow_id", id)
    .eq("user_id", user.id)
    .eq("version", flow.version - 1)
    .maybeSingle();
  if (versionError) {
    logApiError("/api/automations/flows/[id]/undo", versionError, { stage: "version" });
    return refuse("load_failed", 500);
  }
  if (!previous) return refuse("nothing_to_undo", 409);
  const verdict = readFlow(previous.boxes);
  if (!verdict.ok) return refuse("bad_boxes", 409, { reason: verdict.reason });

  if (!(await claimFlow(id, user.id))) return refuse("busy", 409);
  try {
    const schedule = await scheduleAfterChange(user.id, flow, verdict.boxes);
    const { error } = await createAdminClient()
      .from("automation_flows")
      .update({ boxes: verdict.boxes, version: flow.version - 1, ...schedule.patch })
      .eq("id", id)
      .eq("user_id", user.id);
    if (error) {
      logApiError("/api/automations/flows/[id]/undo", error, { stage: "save" });
      return refuse("save_failed", 500);
    }
    const { data: row } = await supabase.from("automation_flows").select(FLOW_COLUMNS).eq("id", id).eq("user_id", user.id).maybeSingle();
    return NextResponse.json({ ok: true, flow: row, paused: schedule.paused });
  } finally {
    await releaseFlow(id, user.id);
  }
}
