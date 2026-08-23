import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkCronAuth } from "@/lib/cron-auth";
import { logApiError } from "@/lib/log-error";
import { getPlan, type PlanSlug } from "@/lib/billing/plans";
import { deductCredits, resolveEffectivePlanSlug } from "@/lib/billing/credits";
import { sendBadgeExpiringEmail } from "@/lib/email/send-badge-expiring-email";
import {
  BADGE_EXPIRY_WARNING_DAYS,
  BADGE_REMOVAL_PERIOD_DAYS,
  badgeRemovalCreditsPerMonth,
  nextBadgePaidUntil,
  planIncludesBadgeRemoval,
  resolveBadgeState,
  shouldWarnAboutExpiry,
} from "@/lib/publishing/badge";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const DAY_MS = 86_400_000;
// A ceiling per run so one invocation cannot run for an unbounded time.
// Anything left over is picked up by the next run — the query is ordered by
// expiry, so the most urgent rows are always the ones handled first.
const MAX_SITES_PER_RUN = 500;

/**
 * Monthly renewal and 7-day warning for paid badge removal (V4 #25).
 *
 * Scheduled DAILY (vercel.json), not monthly. Each site's period is its
 * own 30 days ending on its own date, so there is no shared billing day to
 * hang a monthly job on — the job's real question is "which periods end in
 * the next week, and which have already ended?", and that has a fresh
 * answer every day.
 *
 * Three things happen here, in this order of importance:
 *
 *   1. RENEW what lapsed while auto-renew was on. Charged with the same
 *      deductCredits the purchase route uses, so the renewal lands in
 *      credit_transactions and shows up in the user's credit history —
 *      which is the whole of the "μηνιαία ανανέωση, ορατή στο credit
 *      history" requirement. A renewal that cannot be paid for is simply
 *      not made: the balance is never driven negative, the period stays
 *      lapsed, and the badge comes back on the next page view. That is the
 *      designed behaviour, not a failure.
 *
 *   2. WARN seven days out, once per period.
 *
 *   3. NEVER DOUBLE-CHARGE. A site whose owner is now on a plan that
 *      includes badge removal is skipped entirely — no charge, no renewal,
 *      no email. Their paid_until is left exactly as it is rather than
 *      cleared: if they downgrade next week, whatever days they had paid
 *      for are still theirs.
 *
 * Idempotent under re-runs. Renewal extends from max(now, current expiry),
 * so a second run in the same day finds the period already in the future
 * and does nothing; the warning is stamped and the stamp is checked.
 */
export async function GET(request: Request) {
  try {
    const auth = checkCronAuth(request);
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const admin = createAdminClient();
    const now = new Date();
    const horizon = new Date(now.getTime() + BADGE_EXPIRY_WARNING_DAYS * DAY_MS);

    // Everything that ends within the warning window OR has already ended.
    // Sites that never bought (null) are excluded by the filter and by the
    // partial index behind it.
    const { data: sites, error } = await admin
      .from("published_sites")
      .select(
        "id, user_id, subdomain, status, is_active, badge_removal_paid_until, badge_removal_auto_renew, badge_removal_expiry_notified_at"
      )
      .not("badge_removal_paid_until", "is", null)
      .lte("badge_removal_paid_until", horizon.toISOString())
      .order("badge_removal_paid_until", { ascending: true })
      .limit(MAX_SITES_PER_RUN);

    if (error) {
      logApiError("/api/cron/badge-renewals", error, { stage: "load_sites" });
      return NextResponse.json({ ok: false, error: "Could not load sites." }, { status: 500 });
    }

    const credits = badgeRemovalCreditsPerMonth();
    // Plan and email are per OWNER, and one owner can hold many sites.
    // Cached for the run so a customer with thirty sites costs one auth
    // lookup rather than thirty.
    const ownerCache = new Map<string, { planSlug: PlanSlug; email: string | null }>();

    let renewed = 0;
    let lapsed = 0;
    let warned = 0;
    let skippedIncludedInPlan = 0;

    for (const site of sites ?? []) {
      try {
        let owner = ownerCache.get(site.user_id);
        if (!owner) {
          const { data: authUser, error: authError } = await admin.auth.admin.getUserById(site.user_id);
          if (authError) {
            logApiError("/api/cron/badge-renewals", authError, { stage: "load_owner", siteId: site.id });
            continue;
          }
          const u = authUser?.user ?? null;
          owner = {
            // The effective slug, so a lapsed beta grant does not make us
            // treat a Free account as Ultimate and skip its renewal.
            planSlug: u ? await resolveEffectivePlanSlug(u) : "free",
            email: u?.email ?? null,
          };
          ownerCache.set(site.user_id, owner);
        }

        // 3. Covered by the plan — nothing to charge, nothing to warn about.
        if (planIncludesBadgeRemoval(owner.planSlug)) {
          skippedIncludedInPlan++;
          continue;
        }

        const state = resolveBadgeState({
          planSlug: owner.planSlug,
          paidUntil: site.badge_removal_paid_until,
          now,
        });

        // 1. The period has ended.
        if (state.reason === "lapsed") {
          if (!site.badge_removal_auto_renew) {
            lapsed++;
            continue;
          }

          const plan = getPlan(owner.planSlug) ?? getPlan("free")!;
          const paidUntil = nextBadgePaidUntil(site.badge_removal_paid_until, now);
          const deduction = await deductCredits(
            site.user_id,
            credits,
            "badge_removal_renewal",
            `Badge removal renewal — /s/${site.subdomain} — ${BADGE_REMOVAL_PERIOD_DAYS} days to ${paidUntil
              .toISOString()
              .slice(0, 10)}`,
            plan
          );

          if (!deduction.ok) {
            // Not an error. The user is out of credits, so the thing they
            // stopped paying for stops — the badge is already back, because
            // the serve path reads the expiry and it is in the past. No
            // write is needed to make that true, which is exactly why the
            // column is an expiry and not a boolean.
            lapsed++;
            continue;
          }

          const { error: writeError } = await admin
            .from("published_sites")
            .update({
              badge_removal_paid_until: paidUntil.toISOString(),
              badge_removal_expiry_notified_at: null,
            })
            .eq("id", site.id);

          if (writeError) {
            logApiError("/api/cron/badge-renewals", writeError, { stage: "write_renewal", siteId: site.id });
            // The charge happened and the period did not move. Logged
            // loudly rather than silently retried: a retry loop here would
            // charge again on the next daily run. The compensating grant
            // is deliberately NOT automatic, because unlike the purchase
            // route this runs unattended and a bug that both charges and
            // refunds in a loop is worse than one that stops and reports.
            continue;
          }
          renewed++;
          continue;
        }

        // 2. Still paid, but ending soon — warn once for this period.
        if (
          state.reason === "paid" &&
          shouldWarnAboutExpiry({
            paidUntil: site.badge_removal_paid_until,
            notifiedAt: site.badge_removal_expiry_notified_at,
            now,
          })
        ) {
          if (owner.email) {
            await sendBadgeExpiringEmail({
              email: owner.email,
              userId: site.user_id,
              subdomain: site.subdomain,
              daysRemaining: state.daysRemaining ?? BADGE_EXPIRY_WARNING_DAYS,
              credits,
              autoRenew: site.badge_removal_auto_renew !== false,
            });
          }
          // Stamped even when there was no address to send to: the point
          // of the stamp is "this period's warning has been dealt with",
          // and an account with no email will never have one.
          const { error: stampError } = await admin
            .from("published_sites")
            .update({ badge_removal_expiry_notified_at: now.toISOString() })
            .eq("id", site.id);
          if (stampError) {
            logApiError("/api/cron/badge-renewals", stampError, { stage: "stamp_notice", siteId: site.id });
          }
          warned++;
        }
      } catch (siteErr) {
        // One bad row must not stop the other 499.
        logApiError("/api/cron/badge-renewals", siteErr, { stage: "site_loop", siteId: site.id });
      }
    }

    return NextResponse.json({
      ok: true,
      considered: sites?.length ?? 0,
      renewed,
      lapsed,
      warned,
      skippedIncludedInPlan,
    });
  } catch (err) {
    logApiError("/api/cron/badge-renewals", err, { stage: "unhandled" });
    return NextResponse.json({ ok: false, error: "Something went wrong." }, { status: 500 });
  }
}
