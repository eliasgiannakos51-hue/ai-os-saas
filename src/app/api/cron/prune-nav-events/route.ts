import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkCronAuth } from "@/lib/cron-auth";
import { logApiError } from "@/lib/log-error";

export const dynamic = "force-dynamic";

/**
 * Ninety days of navigation history, and not a day more.
 *
 * SCHEDULED in vercel.json: "30 3 * * *" — daily, half an hour after the
 * monthly credit reset's slot so the two never contend for the same
 * connection burst on the 1st.
 *
 * WHY A RETENTION SWEEP AND NOT "keep it, storage is cheap". Storage is
 * cheap; holding personal data you have stopped needing is not a storage
 * question. Every question this table exists to answer has a window of
 * 30 days or less (see the migration header) — nothing asks about last
 * spring. Data kept past its purpose is data that can only ever be a
 * liability: it can leak, it can be subpoenaed, it has to be exported,
 * and none of that buys a single additional answer.
 *
 * SERVICE ROLE, because this deletes across every account and no user
 * session can or should be able to do that. The filter is age alone —
 * there is deliberately no user_id in this query, so there is no shape
 * of it that singles anyone out.
 *
 * IDEMPOTENT by construction: it deletes rows older than a cutoff
 * computed from now(). Running it twice in a minute deletes nothing the
 * second time; missing a day just means the next run removes a slightly
 * larger slice. Nothing accumulates state, so there is nothing to get
 * out of step.
 */
export const RETENTION_DAYS = 90;

export async function GET(request: Request) {
  try {
    const auth = checkCronAuth(request);
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();

    const admin = createAdminClient();
    const { error, count } = await admin
      .from("nav_events")
      .delete({ count: "exact" })
      .lt("at", cutoff);

    if (error) {
      logApiError("/api/cron/prune-nav-events", error, { stage: "delete", cutoff });
      return NextResponse.json({ ok: false, error: "Could not prune navigation events." }, { status: 500 });
    }

    return NextResponse.json({ ok: true, deleted: count ?? 0, cutoff });
  } catch (err) {
    logApiError("/api/cron/prune-nav-events", err);
    return NextResponse.json({ ok: false, error: "Something went wrong." }, { status: 500 });
  }
}
