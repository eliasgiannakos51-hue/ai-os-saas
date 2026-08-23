import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkCronAuth } from "@/lib/cron-auth";
import { logApiError } from "@/lib/log-error";
import { payoutDecision, MIN_PAYOUT_CENTS } from "@/lib/affiliate/rules";
import { getAffiliateStats, type AffiliateRow } from "@/lib/affiliate/store";
import { connectConfigured, payoutAffiliate, refreshPayoutsEnabled } from "@/lib/affiliate/connect";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // @function-limit 300

// Monthly payouts.
//
// A cron rather than a button, for the reason every money-moving job is:
// a button is pressed by a person who may press it twice, at a moment
// nobody recorded, and the person who presses it is the person who
// benefits from pressing it again. A schedule pays everybody on the same
// day whether or not anyone is looking.
//
// THE ORDER MATTERS AND IS NOT OBVIOUS. For each affiliate:
//
//   1. Re-read payouts_enabled from STRIPE, not from our column. Our copy
//      is a cache of a fact Stripe owns, and an account can be restricted
//      between one run and the next.
//   2. Decide with payoutDecision, which refuses a suspended account
//      BEFORE it looks at whether onboarding is complete — an account
//      suspended for fraud must not be paid because it happens to have a
//      verified bank account.
//   3. Claim the accrued rows atomically, then transfer only what the
//      claim returned. Two concurrent runs cannot both send the same
//      balance because the second claims nothing.
//
// Below MIN_PAYOUT_CENTS the balance is carried forward: Stripe charges
// per transfer, and moving EUR 0.80 costs more than it moves.
const MAX_AFFILIATES_PER_RUN = 200;

export async function GET(request: Request) {
  try {
    const auth = checkCronAuth(request);
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }
    if (!connectConfigured()) {
      return NextResponse.json({ ok: false, error: "Stripe is not configured." }, { status: 503 });
    }

    const admin = createAdminClient();
    // Only affiliates who could conceivably be paid: active, onboarded.
    // The balance check happens per affiliate below, because it needs the
    // commission sum rather than a column.
    const { data, error } = await admin
      .from("affiliates")
      .select("*")
      .eq("status", "active")
      .not("stripe_account_id", "is", null)
      .limit(MAX_AFFILIATES_PER_RUN);
    if (error) {
      logApiError("/api/cron/affiliate-payouts", error, { stage: "load_affiliates" });
      return NextResponse.json({ ok: false, error: "Could not load affiliates." }, { status: 500 });
    }

    const affiliates = (data as AffiliateRow[] | null) ?? [];
    let paid = 0;
    let paidCents = 0;
    const skipped: Record<string, number> = {};

    for (const affiliate of affiliates) {
      try {
        const payoutsEnabled = await refreshPayoutsEnabled(affiliate);
        const stats = await getAffiliateStats(affiliate.id);
        const decision = payoutDecision({
          accruedCents: stats.accruedCents,
          stripeAccountId: affiliate.stripe_account_id,
          payoutsEnabled,
          status: affiliate.status,
        });
        if (!decision.pay) {
          skipped[decision.reason] = (skipped[decision.reason] ?? 0) + 1;
          continue;
        }
        const result = await payoutAffiliate(affiliate);
        if (result.ok) {
          paid += 1;
          paidCents += result.amountCents;
        } else {
          skipped[result.reason] = (skipped[result.reason] ?? 0) + 1;
        }
      } catch (err) {
        // One affiliate's failure must not stop everybody else's payout.
        logApiError("/api/cron/affiliate-payouts", err, { affiliateId: affiliate.id });
        skipped.error = (skipped.error ?? 0) + 1;
      }
    }

    return NextResponse.json({
      ok: true,
      considered: affiliates.length,
      paid,
      paidCents,
      minimumCents: MIN_PAYOUT_CENTS,
      skipped,
    });
  } catch (err) {
    logApiError("/api/cron/affiliate-payouts", err);
    return NextResponse.json({ ok: false, error: "Something went wrong." }, { status: 500 });
  }
}
