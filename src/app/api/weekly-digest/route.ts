import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkCronAuth } from "@/lib/cron-auth";
import { sendWeeklyDigestEmail } from "@/lib/email/send-weekly-digest-email";
import { logApiError } from "@/lib/log-error";
import { collectDigestFacts } from "@/lib/notify/digest-data";
import { buildDigest } from "@/lib/notify/digest";

export const dynamic = "force-dynamic";

// SCHEDULED in vercel.json: "0 8 * * 1" — 08:00 UTC every Monday,
// covering the seven days behind it.
//
// WHAT CHANGED IN V4 #18. It used to send a table of module row counts:
// "Ideas 3, Leads 1, Research 2". Every number was true and the email
// said nothing — it was a database report with a greeting on it, and the
// brief is explicit that the digest must be built FROM REAL DATA, NEVER
// GENERIC. So it now reads what actually happened (lib/notify/digest-data.ts)
// and composes what is worth saying about it (lib/notify/digest.ts):
// agents that ran and how many found something, new records, the site's
// visits, credits spent against THIS user's own average, and a short
// "what I noticed" list — leads with no follow-up, spending that moved.
//
// SILENT ON A QUIET WEEK, still and more strictly. isDigestWorthSending
// refuses a week whose counters are all zero, and a digest with no lines
// is never handed to the sender. A weekly reminder that nothing happened
// is the fastest way to get a sending domain marked as spam.
//
// Callers must send CRON_SECRET as `Authorization: Bearer <CRON_SECRET>`
// (the header Vercel Cron sends automatically when a cron job has a
// secret configured) or as `x-cron-secret`. Without CRON_SECRET
// configured the route refuses to run on any deployment, so a stray
// request cannot email every user. See lib/cron-auth.ts.
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

    const now = new Date();
    let sent = 0;
    let skipped = 0;
    let failed = 0;

    for (const user of usersData.users) {
      if (!user.email) continue;

      try {
        const facts = await collectDigestFacts({ userId: user.id, now });
        const digest = buildDigest(facts);

        if (!digest.worth.worth || digest.lines.length === 0) {
          skipped++;
          continue;
        }

        const ok = await sendWeeklyDigestEmail({
          email: user.email,
          userId: user.id,
          digest,
          periodLabel: "7d",
        });
        if (ok) sent++;
        else skipped++;
      } catch (err) {
        // ONE USER'S BAD WEEK DOES NOT STOP EVERYONE ELSE'S DIGEST. The
        // old loop had no per-user try, so a single unreadable row would
        // have taken the whole Monday send down after the users it had
        // already reached — a partial send with no record of where it
        // stopped.
        failed++;
        logApiError("/api/weekly-digest", err, { stage: "user_digest" });
      }
    }

    return NextResponse.json({ ok: true, sent, skippedNoActivity: skipped, failed });
  } catch (err) {
    logApiError("/api/weekly-digest", err);
    return NextResponse.json({ ok: false, error: "Something went wrong." }, { status: 500 });
  }
}
