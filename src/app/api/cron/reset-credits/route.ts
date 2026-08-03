import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resetCreditsToTotal } from "@/lib/billing/credits";
import { logApiError } from "@/lib/log-error";

export const dynamic = "force-dynamic";

// PLACEHOLDER — not wired to any scheduler yet, same as api/weekly-digest.
// Meant to be hit once a month by a scheduled trigger (Vercel Cron, a
// GitHub Action, etc.). Resets every user's credits_remaining back to
// credits_total (their current plan's monthly allotment) — a safety net
// for accounts whose Stripe subscription didn't fire an invoice.paid event
// this cycle (e.g. Free accounts, which never touch Stripe at all).
//
// If CRON_SECRET is set, callers must send it as `Authorization: Bearer
// <CRON_SECRET>` (the header Vercel Cron sends automatically when a cron
// job has a secret configured). If CRON_SECRET is unset, the route runs
// unauthenticated — fine for local testing, but set CRON_SECRET before
// exposing this in production so a stray request can't reset every
// account's credits early.
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
    const { data: rows, error } = await admin.from("user_credits").select("user_id, credits_total");

    if (error) {
      logApiError("/api/cron/reset-credits", error);
      return NextResponse.json({ ok: false, error: "Could not load user credits." }, { status: 500 });
    }

    let reset = 0;
    for (const row of rows ?? []) {
      await resetCreditsToTotal(row.user_id, row.credits_total);
      reset++;
    }

    return NextResponse.json({ ok: true, reset });
  } catch (err) {
    logApiError("/api/cron/reset-credits", err);
    return NextResponse.json({ ok: false, error: "Something went wrong." }, { status: 500 });
  }
}
