import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkCronAuth } from "@/lib/cron-auth";
import { logApiError } from "@/lib/log-error";

export const dynamic = "force-dynamic";

// Monthly credit reset for accounts Stripe never bills.
//
// SCHEDULED, as of this change, in vercel.json: "0 3 1 * *" — 03:00 UTC on
// the 1st of each month. Until now it was a placeholder wired to nothing,
// which meant Free accounts got 100 credits once, at signup, and never
// again. That is the defect this fixes.
//
// WHY IT DOES NOT COLLIDE WITH THE STRIPE RESET. The webhook already resets
// paid accounts: invoice.paid -> syncSubscriptionToUser ->
// syncCreditsForPlan sets credits_remaining = credits_total = the plan's
// monthly allotment, on the subscriber's own billing anniversary. This route
// used to reset EVERY row in user_credits, so scheduling it unchanged would
// have given a subscriber billed on the 15th a second full allowance on the
// 1st — every month, forever. The route now grants only where plan_tier is
// 'free' AND the account has no active Stripe subscription; see
// supabase/migrations/20260813_monthly_credit_reset.sql for both guards.
//
// IDEMPOTENT. The reset stamps last_monthly_reset with the period it granted
// and the UPDATE excludes rows already stamped, so a second run in the same
// month reports granted: 0 and changes nothing. That covers a manual re-run,
// a scheduler that fires twice, and two runs overlapping in time — the row
// lock serialises them and the second re-reads the stamp.
//
// Callers must send CRON_SECRET as `Authorization: Bearer <CRON_SECRET>`
// (the header Vercel Cron sends automatically when a cron job has a secret
// configured) or as `x-cron-secret`. If CRON_SECRET is not configured the
// route refuses to run at all on any deployment — see lib/cron-auth.ts for
// why that has to fail closed rather than open.
export async function GET(request: Request) {
  try {
    const auth = checkCronAuth(request);
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    // The period being granted, in UTC, so a run at 03:00 on the 1st can
    // never be attributed to the previous month by a server-side timezone.
    const now = new Date();
    const period = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-01`;

    const admin = createAdminClient();
    const { data, error } = await admin.rpc("reset_monthly_credits_for_unbilled", {
      p_period: period,
    });

    if (error) {
      logApiError("/api/cron/reset-credits", error, { stage: "reset_rpc", period });
      return NextResponse.json({ ok: false, error: "Could not reset credits." }, { status: 500 });
    }

    const rows = (data ?? []) as { user_id: string; credits_granted: number }[];
    return NextResponse.json({
      ok: true,
      period,
      // `granted` rather than `reset`: on a replay this is 0, and the name
      // should make that read as "nothing was handed out", not "nothing was
      // looked at".
      granted: rows.length,
      creditsGranted: rows.reduce((sum, row) => sum + (row.credits_granted ?? 0), 0),
    });
  } catch (err) {
    logApiError("/api/cron/reset-credits", err);
    return NextResponse.json({ ok: false, error: "Something went wrong." }, { status: 500 });
  }
}
