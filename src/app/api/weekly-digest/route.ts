import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { CLASSIFIER_MODULES } from "@/lib/classifier-modules";
import { checkCronAuth } from "@/lib/cron-auth";
import { sendWeeklyDigestEmail } from "@/lib/email/send-weekly-digest-email";
import { logApiError } from "@/lib/log-error";
import { enModuleTitle } from "@/lib/module-labels";

export const dynamic = "force-dynamic";

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

// SCHEDULED, as of this change, in vercel.json: "0 8 * * 1" — 08:00 UTC
// every Monday, covering the seven days behind it. It was a placeholder
// wired to nothing, so the digest never went out.
//
// SILENT ON A QUIET WEEK. Turning this on unchanged would have mailed every
// account a table of zeroes every Monday — a weekly reminder that nothing
// happened, which is worse than no email at all and is the fastest way to
// get a sender marked as spam. An account with no activity in the window is
// skipped entirely. (Users can also switch the digest off in Settings; the
// email gate in lib/email/email-gate.ts already enforces that and the daily
// cap. This is on top of both, because "no news" is not news.)
//
// Callers must send CRON_SECRET as `Authorization: Bearer <CRON_SECRET>`
// (the header Vercel Cron sends automatically when a cron job has a secret
// configured) or as `x-cron-secret`. Without CRON_SECRET configured the
// route refuses to run on any deployment, so a stray request can't email
// every user. See lib/cron-auth.ts.
export async function GET(request: Request) {
  try {
    const auth = checkCronAuth(request);
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const admin = createAdminClient();
    const { data: usersData, error: usersError } = await admin.auth.admin.listUsers();

    if (usersError) {
      logApiError("/api/weekly-digest", usersError, { stage: "list_users" });
      return NextResponse.json({ ok: false, error: "Could not load users." }, { status: 500 });
    }

    const since = new Date(Date.now() - SEVEN_DAYS_MS).toISOString();
    let sent = 0;
    let skipped = 0;

    for (const user of usersData.users) {
      if (!user.email) continue;

      const moduleCounts = await Promise.all(
        CLASSIFIER_MODULES.map(async (m) => {
          const { count } = await admin
            .from(m.table)
            .select("id", { count: "exact", head: true })
            .eq("user_id", user.id)
            .gte("created_at", since);
          return { title: enModuleTitle(m), count: count ?? 0 };
        })
      );

      // Nothing happened this week — say nothing.
      if (moduleCounts.every((m) => m.count === 0)) {
        skipped++;
        continue;
      }

      await sendWeeklyDigestEmail({ email: user.email, userId: user.id, moduleCounts, periodLabel: "7d" });
      sent++;
    }

    return NextResponse.json({ ok: true, sent, skippedNoActivity: skipped });
  } catch (err) {
    logApiError("/api/weekly-digest", err);
    return NextResponse.json(
      { ok: false, error: "Something went wrong." },
      { status: 500 }
    );
  }
}
