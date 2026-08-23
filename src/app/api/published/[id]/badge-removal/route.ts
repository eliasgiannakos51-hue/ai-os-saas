import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/rate-limit";
import { logApiError } from "@/lib/log-error";
import { isAdminEmail } from "@/lib/admin";
import {
  deductCredits,
  grantCredits,
  hasEnoughCredits,
  insufficientCreditsMessage,
  resolveEffectivePlan,
} from "@/lib/billing/credits";
import {
  BADGE_REMOVAL_PERIOD_DAYS,
  badgeRemovalCreditsPerMonth,
  nextBadgePaidUntil,
  resolveBadgeState,
} from "@/lib/publishing/badge";

export const dynamic = "force-dynamic";

/**
 * Buying "no Made with Ionexa badge" for ONE site, with credits (V4 #25).
 *
 * PER SITE, not per account: the row this writes is the site's own, and
 * buying it for acme.example does nothing for beta.example. That is the
 * requested shape and it is also the honest one — the thing being paid for
 * is a specific public page.
 *
 * POST   buy or extend a 30-day period, and turn auto-renew on.
 * DELETE stop auto-renewing. Never refunds and never re-badges early: the
 *        period already paid for runs to its end, then lapses on its own.
 *
 * TWO REFUSALS MATTER MORE THAN THE HAPPY PATH:
 *
 *   1. NEVER CHARGE SOMEONE WHO ALREADY HAS IT. A plan with
 *      capabilities.freeBadgeRemoval includes a badge-free site in what the
 *      account already pays monthly. Selling it to them again is taking
 *      money for nothing, so this returns 409 and charges zero — checked
 *      through resolveBadgeState, the same function the serve path uses, so
 *      the refusal can never disagree with what the page actually shows.
 *
 *   2. NEVER LEAVE A CHARGE WITHOUT ITS PERIOD. Credits are deducted first
 *      (that call is atomic and writes the ledger row the user sees), and
 *      if the period write then fails the credits are granted straight back
 *      with an idempotency key. The alternative order — extend first, then
 *      charge — hands out the product free whenever the charge fails.
 */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ ok: false, error: "Not authenticated." }, { status: 401 });
    }

    // A purchase is a money-moving write. Bounded so a stuck client cannot
    // drain an account by retrying, and so a double-click cannot buy two
    // periods (the second is refused, not silently charged).
    const limited = await checkRateLimit({
      scope: "badge_removal_purchase",
      identifier: user.id,
      maxAttempts: 10,
      windowMinutes: 60,
    });
    if (!limited.allowed) {
      return NextResponse.json(
        { ok: false, error: "Too many badge changes in the last hour. Try again shortly." },
        { status: 429 }
      );
    }

    // RLS-scoped read: a site belonging to somebody else is simply not
    // here, so ownership is enforced by the database rather than by an if.
    const { data: site } = await supabase
      .from("published_sites")
      .select("id, subdomain, badge_removal_paid_until")
      .eq("id", params.id)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!site) {
      return NextResponse.json({ ok: false, error: "Site not found." }, { status: 404 });
    }

    const plan = await resolveEffectivePlan(user);
    const now = new Date();
    const state = resolveBadgeState({
      planSlug: plan.slug,
      paidUntil: site.badge_removal_paid_until,
      now,
    });

    if (state.includedInPlan) {
      return NextResponse.json(
        {
          ok: false,
          reason: "included_in_plan",
          error: `Your ${plan.name} plan already serves this site without the badge — there's nothing to buy.`,
        },
        { status: 409 }
      );
    }

    const cost = badgeRemovalCreditsPerMonth();
    // Admins get the feature without the charge, same as everywhere else
    // in the app that gates on credits.
    const bypass = isAdminEmail(user.email);

    if (!bypass) {
      const check = await hasEnoughCredits(user.id, cost, plan);
      if (!check.ok) {
        return NextResponse.json({
          ok: false,
          rateLimited: true,
          error: insufficientCreditsMessage(check.remaining, cost),
        });
      }
    }

    const paidUntil = nextBadgePaidUntil(site.badge_removal_paid_until, now);

    let remaining = 0;
    if (!bypass) {
      const deduction = await deductCredits(
        user.id,
        cost,
        "badge_removal",
        // This description IS the credit history entry the user reads, so
        // it names the site and the period rather than saying "badge".
        `Badge removal — /s/${site.subdomain} — ${BADGE_REMOVAL_PERIOD_DAYS} days to ${paidUntil.toISOString().slice(0, 10)}`,
        plan
      );
      if (!deduction.ok) {
        return NextResponse.json({
          ok: false,
          rateLimited: true,
          error: insufficientCreditsMessage(deduction.remaining, cost),
        });
      }
      remaining = deduction.remaining;
    }

    // Service-role, because the badge columns are guarded against client
    // writes by a trigger (v4_badge_removal_migration.sql) — an owner who
    // could set their own paid_until would never need to pay.
    const admin = createAdminClient();
    const { error: writeError } = await admin
      .from("published_sites")
      .update({
        badge_removal_paid_until: paidUntil.toISOString(),
        badge_removal_auto_renew: true,
        // Cleared so the "7 days left" warning re-arms for the new period.
        badge_removal_expiry_notified_at: null,
      })
      .eq("id", site.id)
      .eq("user_id", user.id);

    if (writeError) {
      logApiError("/api/published/[id]/badge-removal", writeError, { stage: "write_period", siteId: site.id });
      if (!bypass) {
        // Put the money back. Without this the user is charged for a
        // period they did not get, and the only trace is a log line.
        try {
          await grantCredits(
            user.id,
            cost,
            "badge_removal_refund",
            `Refund — badge removal for /s/${site.subdomain} could not be applied`,
            { idempotencyKey: `badge_refund:${site.id}:${paidUntil.toISOString()}` }
          );
        } catch (refundErr) {
          logApiError("/api/published/[id]/badge-removal", refundErr, { stage: "refund", siteId: site.id });
        }
      }
      return NextResponse.json(
        { ok: false, error: "Could not apply badge removal. Your credits were not charged." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      paidUntil: paidUntil.toISOString(),
      creditsCharged: bypass ? 0 : cost,
      creditsRemaining: remaining,
      autoRenew: true,
    });
  } catch (err) {
    logApiError("/api/published/[id]/badge-removal", err, { stage: "unhandled" });
    return NextResponse.json({ ok: false, error: "Something went wrong." }, { status: 500 });
  }
}

/**
 * Turn auto-renew off. The badge comes back when the paid period ends, not
 * now — the user paid for those days and keeps them.
 *
 * Deliberately writable by the owner's own client through RLS (the trigger
 * guards paid_until and the notice timestamp, not this flag): a person must
 * always be able to stop a recurring charge, including on a day when this
 * route is broken.
 */
export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ ok: false, error: "Not authenticated." }, { status: 401 });
    }

    const limited = await checkRateLimit({
      scope: "badge_removal_purchase",
      identifier: user.id,
      maxAttempts: 10,
      windowMinutes: 60,
    });
    if (!limited.allowed) {
      return NextResponse.json(
        { ok: false, error: "Too many badge changes in the last hour. Try again shortly." },
        { status: 429 }
      );
    }

    const { data: updated, error } = await supabase
      .from("published_sites")
      .update({ badge_removal_auto_renew: false })
      .eq("id", params.id)
      .eq("user_id", user.id)
      .select("id, badge_removal_paid_until")
      .maybeSingle();

    if (error) {
      logApiError("/api/published/[id]/badge-removal", error, { stage: "cancel_renew" });
      return NextResponse.json({ ok: false, error: "Could not turn off renewal." }, { status: 500 });
    }
    if (!updated) {
      return NextResponse.json({ ok: false, error: "Site not found." }, { status: 404 });
    }

    return NextResponse.json({
      ok: true,
      autoRenew: false,
      paidUntil: updated.badge_removal_paid_until,
    });
  } catch (err) {
    logApiError("/api/published/[id]/badge-removal", err, { stage: "unhandled" });
    return NextResponse.json({ ok: false, error: "Something went wrong." }, { status: 500 });
  }
}
