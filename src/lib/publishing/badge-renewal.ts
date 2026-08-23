import "server-only";
import { logApiError } from "@/lib/log-error";
import {
  BADGE_REMOVAL_CREDITS_PER_MONTH,
  BADGE_WARNING_DAYS,
  decideRenewal,
  nextMonth,
} from "@/lib/publishing/badge-credits";
import { loadDueRemovals, markWarned, purchaseRemoval } from "@/lib/publishing/badge-credits-store";

/**
 * THE MONTHLY RENEWAL, AND THE WARNING BEFORE IT (V4 #25, rules γ and δ).
 *
 * Rides on the existing daily cron rather than taking a ninth schedule
 * slot, for the same reason the revenue snapshot and the overage
 * invoicing do: that job already runs daily, this is one query and a
 * handful of writes, and a platform's cron limit is a thing somebody
 * hits later.
 *
 * WARN BEFORE, NEVER ANNOUNCE AFTER. A user who tops up on day 6 is
 * renewed on day 0 and never sees the badge come back — which is the
 * entire point of warning early rather than telling somebody their site
 * changed yesterday.
 *
 * THE DECISION IS PURE. Everything about which action applies lives in
 * badge-credits.ts and is exercised at every month boundary by the build
 * gate without waiting for one. This file does the IO and nothing else.
 */

export type RenewalRun = {
  considered: number;
  warned: number;
  renewed: number;
  lapsed: number;
  failed: number;
};

export async function runBadgeRenewals(now = new Date()): Promise<RenewalRun> {
  const result: RenewalRun = { considered: 0, warned: 0, renewed: 0, lapsed: 0, failed: 0 };

  const due = await loadDueRemovals(BADGE_WARNING_DAYS);
  result.considered = due.length;
  if (due.length === 0) return result;

  const { dispatchNotification } = await import("@/lib/notify/dispatch");

  for (const row of due) {
    try {
      const action = decideRenewal({
        removal: {
          siteId: row.siteId,
          coversMonth: row.coversMonth,
          active: true,
          cancelledAt: null,
        },
        creditsRemaining: row.creditsRemaining,
        warnedForMonth: row.warnedForMonth,
        now,
      });

      if (action.action === "warn") {
        // MARKED BEFORE SENDING. A send that fails means one warning
        // missed; a mark that fails after a successful send means the
        // warning repeats every day until the month ends, which is what
        // makes somebody mute the channel that tells them about money.
        await markWarned(row.id, row.coversMonth);
        await dispatchNotification({
          userId: row.userId,
          // The type they already chose channels for. A new one would be
          // one more thing to opt into before a message that costs them
          // money could reach them.
          type: "credits_low",
          title: `Your site's badge returns in ${action.daysLeft} day${action.daysLeft === 1 ? "" : "s"}`,
          body:
            `Removing the "Made with Ionexa" badge costs ${BADGE_REMOVAL_CREDITS_PER_MONTH} credits a month for this site, ` +
            `and you have ${row.creditsRemaining}. Top up before it renews and nothing changes on your site.`,
          url: "/dashboard/published",
          facts: { creditsRemaining: row.creditsRemaining, daysLeft: action.daysLeft },
        });
        result.warned += 1;
        continue;
      }

      if (action.action === "renew") {
        const bought = await purchaseRemoval({
          userId: row.userId,
          siteId: row.siteId,
          creditPriceEur: null,
          // The month being bought is the NEXT one, not the one being
          // renewed from — passing `now` on the last day of the month
          // would buy the month that is ending.
          now: new Date(`${nextMonth(row.coversMonth)}T00:00:00Z`),
        });
        if (bought.ok) result.renewed += 1;
        else result.failed += 1;
        continue;
      }

      if (action.action === "lapse") {
        // NOTHING IS WRITTEN. The badge returns because no row covers the
        // new month, which is the absence of a purchase rather than a
        // state somebody has to remember to set. There is no "lapsed"
        // flag to get out of step with the truth.
        //
        // AND THE USER IS TOLD IT HAPPENED, because a site quietly
        // changing is worse than one that changes with a reason.
        await dispatchNotification({
          userId: row.userId,
          type: "credits_low",
          title: "Your site's badge is back",
          body:
            `There were not enough credits to renew badge removal for this site ` +
            `(${BADGE_REMOVAL_CREDITS_PER_MONTH} needed, ${row.creditsRemaining} available). ` +
            `Top up and remove it again whenever you like — nothing else about the site changed.`,
          url: "/dashboard/published",
          facts: { creditsRemaining: row.creditsRemaining },
        });
        result.lapsed += 1;
      }
    } catch (err) {
      // ONE ROW MUST NOT STOP THE REST. A user whose notification channel
      // is misconfigured cannot be allowed to block every other renewal
      // in the same run.
      logApiError("publishing:badge-renewal", err, { removalId: row.id });
      result.failed += 1;
    }
  }

  return result;
}
