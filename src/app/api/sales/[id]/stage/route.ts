import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { logApiError } from "@/lib/log-error";
import { isFeatureOn } from "@/lib/flags/flags";
import { isUuid } from "@/lib/projects/project";
import { isLeadStage, readReminder } from "@/lib/sales/stages";

export const dynamic = "force-dynamic";

/**
 * A CONTACT MOVED TO A STAGE, WITH A REMINDER (MASTER 16, package 18),
 * behind the switch "finance-sales".
 *
 * Through the person's own session, by id AND owner: another account's
 * contact is not there (404). The reminder is a time in the future within
 * a year, or none (lib/sales/stages.ts); a move clears reminded_at, so the
 * new reminder goes out (api/cron/lead-reminders). No model, no charge.
 */
export async function PATCH(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, code: "bad_request" }, { status: 400 });
  }
  if (!isUuid(params.id) || !isLeadStage(body.stage)) return NextResponse.json({ ok: false, code: "bad_request" }, { status: 400 });
  const reminder = readReminder(body.remindAt, new Date());
  if (!reminder.ok) return NextResponse.json({ ok: false, code: "bad_reminder" }, { status: 400 });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, code: "unauthenticated" }, { status: 401 });
  if (!(await isFeatureOn("finance-sales", user))) return NextResponse.json({ ok: false, code: "not_enabled" }, { status: 403 });

  try {
    const limited = await checkRateLimit({ scope: "lead_stage", identifier: user.id, maxAttempts: 240, windowMinutes: 60 });
    if (!limited.allowed) return NextResponse.json({ ok: false, code: "rate_limited" }, { status: 429 });

    const { data: row, error } = await supabase
      .from("leads")
      .update({ stage: body.stage, stage_changed_at: new Date().toISOString(), remind_at: reminder.at, reminded_at: null })
      .eq("id", params.id)
      .eq("user_id", user.id)
      .select("id, lead_name, stage, remind_at")
      .maybeSingle();
    if (error) throw error;
    if (!row) return NextResponse.json({ ok: false, code: "not_found" }, { status: 404 });
    return NextResponse.json({ ok: true, lead: row });
  } catch (err) {
    logApiError("/api/sales/[id]/stage", err);
    return NextResponse.json({ ok: false, code: "failed" }, { status: 500 });
  }
}
