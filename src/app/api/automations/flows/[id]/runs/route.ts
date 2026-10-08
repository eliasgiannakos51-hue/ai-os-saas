import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { logApiError } from "@/lib/log-error";
import { RUN_COLUMNS, UUID, flowGate, refuse } from "@/lib/automations/flow-access";

export const dynamic = "force-dynamic";

/** How many runs the history shows. */
const RUNS_SHOWN = 20;

/**
 * THE HISTORY OF ONE AUTOMATION (MASTER 16, package 30): its last runs,
 * each with what started it, every box's step, how it ended and what it
 * cost. Read under the person's own select policy.
 */
export async function GET(_request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const id = params.id;
  if (!UUID.test(id)) return refuse("not_found", 404);
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return refuse("not_signed_in", 401);
    const gate = await flowGate(user);
    if (gate instanceof NextResponse) return gate;
    const { data, error } = await supabase
      .from("automation_runs")
      .select(RUN_COLUMNS)
      .eq("flow_id", id)
      .eq("user_id", user.id)
      .order("started_at", { ascending: false })
      .limit(RUNS_SHOWN);
    if (error) {
      logApiError("/api/automations/flows/[id]/runs", error);
      return refuse("load_failed", 500);
    }
    return NextResponse.json({ ok: true, runs: data ?? [] });
  } catch (err) {
    logApiError("/api/automations/flows/[id]/runs", err);
    return refuse("load_failed", 500);
  }
}
