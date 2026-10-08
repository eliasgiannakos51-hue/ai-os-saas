import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logApiError } from "@/lib/log-error";
import { RUN_COLUMNS, UUID, flowGate, refuse } from "@/lib/automations/flow-access";

export const dynamic = "force-dynamic";

/**
 * «ΑΚΥΡΩΣΗ» of a run waiting for approval (MASTER 16, package 30): it
 * ends there, nothing after the approval box runs, and nothing more is
 * charged. Only a waiting run can be cancelled, in one conditional update.
 */
export async function POST(_request: Request, props: { params: Promise<{ runId: string }> }) {
  const params = await props.params;
  const runId = params.runId;
  if (!UUID.test(runId)) return refuse("not_found", 404);
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return refuse("not_signed_in", 401);
    const gate = await flowGate(user);
    if (gate instanceof NextResponse) return gate;
    const { data, error } = await createAdminClient()
      .from("automation_runs")
      .update({ status: "cancelled", state: null, approval_expires_at: null, finished_at: new Date().toISOString() })
      .eq("id", runId)
      .eq("user_id", user.id)
      .eq("status", "waiting_approval")
      .select("id");
    if (error) {
      logApiError("/api/automations/runs/[runId]/cancel", error);
      return refuse("cancel_failed", 500);
    }
    if (!data || data.length !== 1) return refuse("not_waiting", 409);
    const { data: run } = await supabase.from("automation_runs").select(RUN_COLUMNS).eq("id", runId).eq("user_id", user.id).maybeSingle();
    return NextResponse.json({ ok: true, run });
  } catch (err) {
    logApiError("/api/automations/runs/[runId]/cancel", err);
    return refuse("cancel_failed", 500);
  }
}
