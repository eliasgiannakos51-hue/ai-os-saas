import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

/**
 * The uptime probe (V3 Task 15 — monitoring).
 *
 * Public and unauthenticated BY DESIGN: an external uptime monitor
 * (UptimeRobot, Better Stack, Vercel checks — see docs/OPERATIONS.md)
 * has no session, and a health check behind auth monitors the auth, not
 * the app. It reveals nothing but up/down: no versions, no counts, no
 * table names, no error details.
 *
 * It answers degraded (503) when the DATABASE is unreachable, because
 * an app that renders but cannot read data is down in every way a user
 * cares about — an uptime monitor pointed at "/" would call that up.
 */
export async function GET() {
  const startedAt = Date.now();
  try {
    const admin = createAdminClient();
    // The cheapest possible real query: a head-count against a small
    // table. If this round-trips, auth+PostgREST+Postgres are all alive.
    const { error } = await admin
      .from("user_onboarding")
      .select("user_id", { count: "exact", head: true })
      .limit(1);

    if (error) {
      return NextResponse.json(
        { ok: false, db: false, ms: Date.now() - startedAt },
        { status: 503 }
      );
    }
    return NextResponse.json({ ok: true, db: true, ms: Date.now() - startedAt });
  } catch {
    return NextResponse.json({ ok: false, db: false, ms: Date.now() - startedAt }, { status: 503 });
  }
}
