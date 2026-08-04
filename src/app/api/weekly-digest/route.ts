import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { CLASSIFIER_MODULES } from "@/lib/classifier-modules";
import { sendWeeklyDigestEmail } from "@/lib/email/send-weekly-digest-email";
import { logApiError } from "@/lib/log-error";

export const dynamic = "force-dynamic";

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

// PLACEHOLDER — not wired to any scheduler yet. Nothing in this app calls
// this route; it's meant to be hit periodically by a scheduled trigger
// (Vercel Cron, a GitHub Action, etc.) once that's set up separately.
//
// If CRON_SECRET is set, callers must send it as `Authorization: Bearer
// <CRON_SECRET>` (the header Vercel Cron sends automatically when a cron
// job has a secret configured). If CRON_SECRET is unset, the route runs
// unauthenticated — fine for local testing, but set CRON_SECRET before
// exposing this in production so a stray request can't email every user.
export async function GET(request: Request) {
  try {
    const secret = process.env.CRON_SECRET;
    if (secret) {
      const authHeader = request.headers.get("authorization");
      if (authHeader !== `Bearer ${secret}`) {
        return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
      }
    }

    const admin = createAdminClient();
    const { data: usersData, error: usersError } = await admin.auth.admin.listUsers();

    if (usersError) {
      logApiError("/api/weekly-digest", usersError, { stage: "list_users" });
      return NextResponse.json({ ok: false, error: "Could not load users." }, { status: 500 });
    }

    const since = new Date(Date.now() - SEVEN_DAYS_MS).toISOString();
    let sent = 0;

    for (const user of usersData.users) {
      if (!user.email) continue;

      const moduleCounts = await Promise.all(
        CLASSIFIER_MODULES.map(async (m) => {
          const { count } = await admin
            .from(m.table)
            .select("id", { count: "exact", head: true })
            .eq("user_id", user.id)
            .gte("created_at", since);
          return { title: m.title, count: count ?? 0 };
        })
      );

      await sendWeeklyDigestEmail({ email: user.email, userId: user.id, moduleCounts, periodLabel: "7d" });
      sent++;
    }

    return NextResponse.json({ ok: true, sent });
  } catch (err) {
    logApiError("/api/weekly-digest", err);
    return NextResponse.json(
      { ok: false, error: "Something went wrong." },
      { status: 500 }
    );
  }
}
