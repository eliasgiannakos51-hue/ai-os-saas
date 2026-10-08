import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logApiError } from "@/lib/log-error";
import { readFlow } from "@/lib/automations/boxes";
import {
  FLOW_COLUMNS,
  MAX_ACTIVE_FLOWS,
  UUID,
  flowGate,
  missingConnections,
  nextRunFor,
  refuse,
  type FlowRecord,
} from "@/lib/automations/flow-access";

export const dynamic = "force-dynamic";

/**
 * «ΕΝΕΡΓΟΠΟΙΗΣΗ» AND «ΠΑΥΣΗ» (MASTER 16, package 30).
 *
 * On: the boxes must be a row, everything they read from or send to must
 * be connected (MASTER 5.18: a box with a missing connection shows it,
 * leads to it, and does not let the automation go on), and the person may
 * have at most MAX_ACTIVE_FLOWS on — each one spends on its own schedule,
 * with nobody pressing anything. A time automation gets its first
 * next_run_at here, in its own time zone; one a file starts has none.
 *
 * Off: no next run. A run waiting for approval stays waiting; it can
 * still be approved or cancelled.
 */
export async function POST(request: Request, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  if (!UUID.test(id)) return refuse("not_found", 404);
  let on: boolean;
  try {
    const body = (await request.json()) as Record<string, unknown>;
    if (typeof body.on !== "boolean") return refuse("invalid_body", 400);
    on = body.on;
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
    logApiError("/api/automations/flows/[id]/active", loadError, { stage: "load" });
    return refuse("load_failed", 500);
  }
  if (!found) return refuse("not_found", 404);
  const flow = found as FlowRecord;

  let patch: Record<string, unknown>;
  if (on) {
    const verdict = readFlow(flow.boxes);
    if (!verdict.ok) return refuse("bad_boxes", 409, { reason: verdict.reason });
    const missing = await missingConnections(user.id, verdict.boxes);
    if (missing.length > 0) return refuse("needs_connection", 409, { missing });
    const { count, error: countError } = await supabase
      .from("automation_flows")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("is_active", true)
      .neq("id", id);
    if (countError) {
      logApiError("/api/automations/flows/[id]/active", countError, { stage: "count" });
      return refuse("load_failed", 500);
    }
    if ((count ?? 0) >= MAX_ACTIVE_FLOWS) return refuse("too_many_active", 409, { limit: MAX_ACTIVE_FLOWS });
    patch = { is_active: true, next_run_at: nextRunFor(verdict.boxes, flow.time_zone) };
  } else {
    patch = { is_active: false, next_run_at: null };
  }

  const { error } = await createAdminClient().from("automation_flows").update(patch).eq("id", id).eq("user_id", user.id);
  if (error) {
    logApiError("/api/automations/flows/[id]/active", error, { stage: "save" });
    return refuse("save_failed", 500);
  }
  const { data: row } = await supabase.from("automation_flows").select(FLOW_COLUMNS).eq("id", id).eq("user_id", user.id).maybeSingle();
  return NextResponse.json({ ok: true, flow: row });
}
