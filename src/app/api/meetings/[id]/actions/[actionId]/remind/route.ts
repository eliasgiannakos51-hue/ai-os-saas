import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { logApiError } from "@/lib/log-error";
import { readReminder } from "@/lib/sales/stages";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const maxDuration = 60; // @function-limit 60

/**
 * A KEPT ACTION'S REMINDER (Meetings Κομμάτι 4, 2026-10-29): «Remind me».
 *
 * `readReminder` is Sales' own (api/sales/[id]/stage, lib/sales/stages.ts)
 * — a time in the future, within a year, or null for none — reused rather
 * than written twice: the rule ("a reminder is a time ahead, not a guess")
 * does not change because the row it is being set on is a meeting's
 * action instead of a contact.
 *
 * Through the person's own session, by id AND owner: another account's
 * action is not there (404). Setting a new remind_at clears reminded_at,
 * so the new reminder — not a stale one — is the one api/cron/
 * meeting-action-reminders sends.
 *
 * meeting_actions.due_date is untouched here: that column is "a date the
 * MEETING said, parsed", which this is not — this is the person's own
 * choice of when to be reminded, a second and separate thing.
 */
export async function PATCH(request: Request, props: { params: Promise<{ id: string; actionId: string }> }) {
  const params = await props.params;
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, code: "bad_request" }, { status: 400 });
  }
  const reminder = readReminder(body.remindAt, new Date());
  if (!reminder.ok) return NextResponse.json({ ok: false, code: "bad_reminder" }, { status: 400 });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, code: "unauthenticated" }, { status: 401 });

  try {
    const limited = await checkRateLimit({ scope: "meeting_action_remind", identifier: user.id, maxAttempts: 120, windowMinutes: 60 });
    if (!limited.allowed) return NextResponse.json({ ok: false, code: "rate_limited" }, { status: 429 });

    const { data: row, error } = await supabase
      .from("meeting_actions")
      .update({ remind_at: reminder.at, reminded_at: null })
      .eq("id", params.actionId)
      .eq("meeting_id", params.id)
      .eq("user_id", user.id)
      .select("id, remind_at, reminded_at")
      .maybeSingle();
    if (error) throw error;
    if (!row) return NextResponse.json({ ok: false, code: "not_found" }, { status: 404 });
    return NextResponse.json({ ok: true, action: row });
  } catch (err) {
    logApiError("/api/meetings/[id]/actions/[actionId]/remind", err);
    return NextResponse.json({ ok: false, code: "failed" }, { status: 500 });
  }
}
