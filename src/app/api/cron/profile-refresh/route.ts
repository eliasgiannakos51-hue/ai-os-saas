import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkCronAuth } from "@/lib/cron-auth";
import { logApiError } from "@/lib/log-error";
import { collectActivity } from "@/lib/profile/activity";
import { refreshProfile } from "@/lib/profile/store";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// The daily profile refresh.
//
// A CRON RATHER THAN A PAGE LOAD, and that is a correctness decision, not
// a performance one. Confidence is meant to track evidence accumulating
// over TIME: every refresh confirms what is still true and decays what is
// not. If a page view triggered a refresh, anyone could inflate their own
// profile by reloading Settings — thirty reloads would take a wild guess
// to near-certainty — and somebody who never opened Settings would never
// have anything decay.
//
// ONLY ACCOUNTS THAT DID SOMETHING. Refreshing a dormant account would
// decay its observations for its owner's absence, which is the calendar-
// based thinking this whole feature is built to avoid: a fortnight away is
// not a change of mind. The window is generous (7 days) so a light user
// who works one afternoon a week still gets confirmations.
const ACTIVE_WINDOW_DAYS = 7;
const MAX_USERS_PER_RUN = 500;

export async function GET(request: Request) {
  try {
    const auth = checkCronAuth(request);
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const admin = createAdminClient();
    const since = new Date(Date.now() - ACTIVE_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();

    // credit_transactions is the one table every AI action in the app
    // writes to, which makes it the cheapest available "this account did
    // something" index.
    const { data, error } = await admin
      .from("credit_transactions")
      .select("user_id")
      .gte("created_at", since)
      .limit(20000);
    if (error) {
      logApiError("/api/cron/profile-refresh", error, { stage: "load_active" });
      return NextResponse.json({ ok: false, error: "Could not load activity." }, { status: 500 });
    }

    const userIds = [...new Set(((data as { user_id: string }[] | null) ?? []).map((r) => r.user_id))]
      .filter(Boolean)
      .slice(0, MAX_USERS_PER_RUN);

    let refreshed = 0;
    let failed = 0;
    for (const userId of userIds) {
      try {
        const { counts, activity } = await collectActivity(userId);
        const result = await refreshProfile({ userId, counts, activity });
        if (result.ok) refreshed += 1;
        else failed += 1;
      } catch (err) {
        // One account's failure must not stop everyone else's refresh.
        logApiError("/api/cron/profile-refresh", err, { userId });
        failed += 1;
      }
    }

    return NextResponse.json({ ok: true, active: userIds.length, refreshed, failed });
  } catch (err) {
    logApiError("/api/cron/profile-refresh", err);
    return NextResponse.json({ ok: false, error: "Something went wrong." }, { status: 500 });
  }
}
