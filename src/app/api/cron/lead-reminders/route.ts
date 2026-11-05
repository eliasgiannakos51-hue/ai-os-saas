import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkCronAuth } from "@/lib/cron-auth";
import { logApiError } from "@/lib/log-error";
import { createNotification } from "@/lib/notifications/store";
import { sendPushToUser } from "@/lib/push/web-push";
import { createPushBatch } from "@/lib/push/delivery";
import { emailLocaleFor, emailTranslator } from "@/lib/email/email-locale";
import { isLeadStage } from "@/lib/sales/stages";
import { suspendedIn, suspendedUserIds } from "@/lib/auth/suspended-accounts";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const maxDuration = 60; // @function-limit 60

/** One run's ceiling; a quarter-hour schedule drains a backlog in turns. */
const BATCH = 200;

/** How long the run waits, after the last bell row, for pushes still in
 *  flight. Each send is already bounded (lib/push/delivery.ts); this
 *  keeps the whole run inside maxDuration whatever a push service does. */
const PUSH_SETTLE_MS = 20_000;

/**
 * THE REMINDERS OF CONTACTS THAT ARE DUE (MASTER 16, package 18): every
 * lead whose remind_at has passed and has not been reminded gets one note
 * in the person's bell — and a push, where push is configured and they
 * opted into reminders — linking to the contact. Then reminded_at is set,
 * so it is said once (api/sales/[id]/stage clears it on the next move).
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
    // A SUSPENDED ACCOUNT'S WORK DOES NOT RUN (2026-11-05 review, A1;
    // lib/auth/suspended-accounts.ts). Excluded in the query, not after it.
    const suspended = await suspendedUserIds(admin, "/api/cron/lead-reminders");
    const { data: due, error } = await admin
      .from("leads")
      .select("id, user_id, lead_name, stage")
      .lte("remind_at", now)
      .is("reminded_at", null)
      .not("user_id", "in", suspendedIn(suspended))
      .order("remind_at", { ascending: true })
      .limit(BATCH);
    if (error) throw error;

    // QUEUED, NOT AWAITED ONE BY ONE. A push service that is slow for one
    // person used to hold every person after them in this loop.
    const pushes = createPushBatch();
    let sent = 0;
    for (const lead of due ?? []) {
      const { data: claimed } = await admin
        .from("leads")
        .update({ reminded_at: now })
        .eq("id", lead.id)
        .is("reminded_at", null)
        .select("id")
        .maybeSingle();
      if (!claimed) continue;
      const url = `/dashboard/sales?record=${encodeURIComponent(String(lead.id))}`;
      // IN THE PERSON'S OWN LANGUAGE, as their emails are.
      const t = emailTranslator(await emailLocaleFor(String(lead.user_id)));
      const title = t("dashboard.sales.reminder.title", { name: String(lead.lead_name ?? "").slice(0, 120) });
      const body = isLeadStage(lead.stage) ? t("dashboard.sales.reminder.body", { stage: t(`dashboard.sales.stages.${lead.stage}`) }) : "";
      await createNotification({ userId: String(lead.user_id), source: "sales", title, body, url });
      pushes.add(() => sendPushToUser(String(lead.user_id), "mission_reminders", { title, body, url, tag: `lead-${lead.id}` }));
      sent++;
    }
    const pushed = await pushes.settle(PUSH_SETTLE_MS);
    if (pushed.abandoned > 0) {
      logApiError("/api/cron/lead-reminders", new Error(`${pushed.abandoned} push(es) still in flight at the deadline`), { stage: "push" });
    }
    return NextResponse.json({ ok: true, due: due?.length ?? 0, sent });
  } catch (err) {
    logApiError("/api/cron/lead-reminders", err);
    return NextResponse.json({ ok: false, error: "failed" }, { status: 500 });
  }
}
