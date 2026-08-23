import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkCronAuth } from "@/lib/cron-auth";
import { creditMonthKey, grantMonthlyPlanCredits, resolveBillingInterval } from "@/lib/billing/credits";
import { getPlan } from "@/lib/billing/plans";
import { logApiError } from "@/lib/log-error";
import { writeDailySnapshot } from "@/lib/billing/revenue-history";
import { billOverageForClosedMonth } from "@/lib/billing/overage-invoice";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // @function-limit 300

// THE ONLY THING THAT GIVES AN ANNUAL SUBSCRIBER THEIR MONTHLY CREDITS.
//
// Stripe fires `invoice.paid` once per billing period. For a monthly
// subscription that is once a month and the webhook can own credits
// entirely, which is how it worked before annual billing existed. For an
// ANNUAL subscription it is once a YEAR — so on that path the customer
// would receive one month's allowance in January and nothing until the
// following January.
//
// Handing them all twelve months up front instead is not the fix. A
// year's credits on day one is a year's Anthropic cost we can absorb in
// week one, with no remaining revenue to cover it and a refund request
// that has become an arithmetic problem. The product promise is a monthly
// allowance; this is what keeps it monthly.
//
// SAFE TO RUN OFTEN, AND SAFE TO MISS A RUN. Every grant is keyed
// `plan_month:<userId>:<YYYY-MM>` through grant_credits_idempotent, so a
// retry, an overlapping invocation or a manual trigger all collapse to
// one grant per calendar month. Scheduled daily rather than monthly for
// exactly that reason: a single monthly cron that fails on the 1st loses
// a customer a month of product, while a daily one that fails on the 1st
// simply grants on the 2nd.
//
// MONTHLY SUBSCRIBERS ARE DELIBERATELY NOT TOUCHED. Their credits come
// from invoice.paid, which RESETS the balance to the plan allowance on
// their own billing anniversary. Granting here as well would either
// double their allowance or reset it mid-cycle, depending on the day —
// and their anniversary is not the 1st.
export async function GET(request: Request) {
  try {
    const auth = checkCronAuth(request);
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const admin = createAdminClient();
    const monthKey = creditMonthKey();

    let granted = 0;
    let skipped = 0;
    let scanned = 0;
    let page = 1;
    const perPage = 200;

    // Paged, because listUsers caps a page and an account that fell off
    // the end would silently never be credited. The loop ends when a page
    // comes back short.
    for (;;) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
      if (error) {
        logApiError("/api/cron/monthly-credits", error, { stage: "list_users", page });
        return NextResponse.json({ ok: false, error: "Could not list users." }, { status: 500 });
      }
      const users = data?.users ?? [];
      for (const user of users) {
        scanned++;
        if (resolveBillingInterval(user) !== "year") {
          skipped++;
          continue;
        }
        const slug = typeof user.user_metadata?.subscription_tier === "string"
          ? user.user_metadata.subscription_tier
          : "";
        // An annual interval with no active PAID tier means a lapsed
        // subscription whose webhook has not landed yet. Nothing is
        // granted rather than falling back to Free's allowance, which
        // would hand a cancelled customer credits every month forever.
        const plan = getPlan(slug);
        if (!plan || plan.slug === "free") {
          skipped++;
          continue;
        }
        try {
          if (await grantMonthlyPlanCredits(user.id, plan.slug, monthKey)) granted++;
          else skipped++;
        } catch (err) {
          // One account's failure must not stop the other eleven months of
          // customers from being credited.
          logApiError("/api/cron/monthly-credits", err, { stage: "grant", userId: user.id });
        }
      }
      if (users.length < perPage) break;
      page++;
    }

    // THE DAY'S REVENUE SNAPSHOT (V4 #26). It rides on this cron rather
    // than taking its own schedule slot for the same reason the deferred
    // notification drain rides on the agent cron: this one already runs
    // daily, the work is one aggregate and one upsert per paying account,
    // and a ninth cron entry is a platform limit somebody hits later.
    //
    // AFTER the credit grants, deliberately. The snapshot records what the
    // day looked like, and looking before the grants would record a state
    // that existed for two seconds.
    let snapshot: Awaited<ReturnType<typeof writeDailySnapshot>> = null;
    try {
      snapshot = await writeDailySnapshot();
    } catch (snapshotError) {
      // A REPORT MUST NEVER BREAK A GRANT. The credits are the customer's
      // entitlement; the snapshot is our own bookkeeping.
      logApiError("/api/cron/monthly-credits", snapshotError, { stage: "revenue_snapshot" });
    }

    // LAST MONTH'S OVERAGE, ONTO THE NEXT INVOICE (V4 #25, rule δ). Only
    // ever for a month that has CLOSED, and only for ledger rows not
    // already billed. Runs after the snapshot because it changes nothing
    // the snapshot reads, and it is wrapped for the same reason: a
    // billing run that threw must not cost anybody their monthly credits.
    let overageInvoicing: Awaited<ReturnType<typeof billOverageForClosedMonth>> | null = null;
    try {
      overageInvoicing = await billOverageForClosedMonth();
    } catch (invoiceError) {
      logApiError("/api/cron/monthly-credits", invoiceError, { stage: "overage_invoice" });
    }

    return NextResponse.json({ ok: true, monthKey, scanned, granted, skipped, snapshot, overageInvoicing });
  } catch (err) {
    logApiError("/api/cron/monthly-credits", err);
    return NextResponse.json({ ok: false, error: "Something went wrong." }, { status: 500 });
  }
}
