import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkCronAuth } from "@/lib/cron-auth";
import { logApiError } from "@/lib/log-error";
import { createNotification } from "@/lib/notifications/store";
import { sendPushToUser } from "@/lib/push/web-push";
import { emailLocaleFor, emailTranslator } from "@/lib/email/email-locale";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const maxDuration = 60; // @function-limit 60

/** One run's ceiling; a quarter-hour schedule drains a backlog in turns. */
const BATCH = 200;

/**
 * THE REMINDERS OF KEPT MEETING ACTIONS THAT ARE DUE (Meetings «ΝΕΑ
 * ΟΘΟΝΗ», Κομμάτι 4, 2026-10-29: «Remind me»). Same shape as
 * api/cron/lead-reminders, on purpose — one mechanism for "a time the
 * person picked has arrived, tell them in the bell and push", not two:
 * every lead whose remind_at has passed and has not been reminded gets
 * one note in the person's bell — and a push, where push is configured
 * and they opted into reminders — linking back to Meetings. Then
 * reminded_at is set, so it is said once (the remind route clears it on
 * the next pick).
 *
 * Marked BEFORE it is delivered: a run that dies half-way leaves a
 * reminder unsent rather than sent twice, and the bell row is the one
 * that matters — the push is the interrupting copy of it.
 *
 * Auth: CRON_SECRET, fail-closed, same as every other cron route.
 * Scheduled in vercel.json every 15 minutes.
 */
export async function GET(request: Request) {
  const auth = checkCronAuth(request);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  try {
    const admin = createAdminClient();
    const now = new Date().toISOString();
    const { data: due, error } = await admin
      .from("meeting_actions")
      .select("id, user_id, who, what")
      .lte("remind_at", now)
      .is("reminded_at", null)
      .order("remind_at", { ascending: true })
      .limit(BATCH);
    if (error) throw error;

    let sent = 0;
    for (const action of due ?? []) {
      const { data: claimed } = await admin
        .from("meeting_actions")
        .update({ reminded_at: now })
        .eq("id", action.id)
        .is("reminded_at", null)
        .select("id")
        .maybeSingle();
      if (!claimed) continue;
      const url = "/dashboard/meetings";
      // IN THE PERSON'S OWN LANGUAGE, as every other reminder email/push is.
      const t = emailTranslator(await emailLocaleFor(String(action.user_id)));
      const what = String(action.what ?? "").slice(0, 120);
      const title = t("dashboard.meetings.remind.notifyTitle", { what });
      const who = typeof action.who === "string" ? action.who.trim() : "";
      const body = who ? t("dashboard.meetings.remind.notifyBody", { who }) : "";
      await createNotification({ userId: String(action.user_id), source: "meetings", title, body, url });
      await sendPushToUser(String(action.user_id), "mission_reminders", { title, body, url, tag: `meeting-action-${action.id}` });
      sent++;
    }
    return NextResponse.json({ ok: true, due: due?.length ?? 0, sent });
  } catch (err) {
    logApiError("/api/cron/meeting-action-reminders", err);
    return NextResponse.json({ ok: false, error: "failed" }, { status: 500 });
  }
}
