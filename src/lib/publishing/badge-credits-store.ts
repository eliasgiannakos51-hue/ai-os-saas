import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { logApiError } from "@/lib/log-error";
import {
  BADGE_REMOVAL_CREDITS_PER_MONTH,
  monthStart,
  type BadgeRemovalRow,
} from "@/lib/publishing/badge-credits";

/**
 * READING AND WRITING BADGE REMOVAL, with the decisions left to
 * badge-credits.ts.
 *
 * The split is the one every money-touching module in this app uses: the
 * rules are pure and testable, and this file does the IO. What is here
 * that is NOT in the pure half is the one thing that cannot be pure —
 * THE ORDER OF THE WRITES.
 *
 * THE CREDITS ARE DEDUCTED BEFORE THE ROW IS WRITTEN, which is the
 * opposite of the overage ledger and deliberately so. Overage records a
 * DEBT and then does the work: a crash there bills for work that did not
 * happen, which is visible and refundable. Here the credits are the
 * payment and the row is the entitlement: a crash between them leaves
 * somebody who paid and did not get the month, which they can see (the
 * badge is still there) and tell us about. The other order gives away the
 * entitlement for free and nothing anywhere would ever notice.
 */

export type SiteBadgeState = {
  siteId: string;
  removal: BadgeRemovalRow | null;
};

/**
 * The removal covering the current month for one site, if any.
 *
 * FAILS TO "NO REMOVAL", so the badge shows. An unreadable row must not
 * hide the badge — the same direction badge-decision.ts fails in, for
 * the same reason: a hiccup that shows a badge on a paid site is visible
 * to someone who can tell us; one that hides it on a free site costs us
 * the upsell silently on every view.
 */
export async function loadRemoval(siteId: string, now = new Date()): Promise<BadgeRemovalRow | null> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("site_badge_removals")
      .select("site_id, covers_month, cancelled_at")
      .eq("site_id", siteId)
      .eq("covers_month", monthStart(now))
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    return {
      siteId: String(data.site_id),
      coversMonth: String(data.covers_month).slice(0, 10),
      // A ROW FOR THIS MONTH IS ACTIVE EVEN IF AUTO-RENEWAL WAS
      // CANCELLED. Cancelling stops the NEXT charge; it never takes back
      // a month already paid for. Reading cancelled_at as "off now"
      // would be keeping their credits and their badge.
      active: true,
      cancelledAt: (data.cancelled_at as string | null) ?? null,
    };
  } catch (err) {
    logApiError("publishing:badge-credits", err, { stage: "load", siteId });
    return null;
  }
}

export type PurchaseResult =
  | { ok: true; creditsCharged: number; coversMonth: string }
  | { ok: false; reason: string };

/**
 * Buys one month of badge removal for one site.
 *
 * DEDUCT FIRST, THEN RECORD, THEN RECONCILE. deductCredits is a single
 * atomic RPC that refuses to go negative, so it is the lock: two tabs
 * racing produce one success and one "insufficient". If the row write
 * then fails, the credits are REFUNDED here rather than left spent —
 * that is the one case where an automatic reversal is right, because
 * nothing was delivered and both sides of it are ours.
 */
export async function purchaseRemoval(params: {
  userId: string;
  siteId: string;
  creditPriceEur: number | null;
  now?: Date;
}): Promise<PurchaseResult> {
  const now = params.now ?? new Date();
  const coversMonth = monthStart(now);
  const { deductCredits, resolveEffectivePlan } = await import("@/lib/billing/credits");
  const admin = createAdminClient();

  try {
    const { data: userData } = await admin.auth.admin.getUserById(params.userId);
    if (!userData?.user) return { ok: false, reason: "unknown_user" };
    const plan = await resolveEffectivePlan(userData.user);

    const spend = await deductCredits(
      params.userId,
      BADGE_REMOVAL_CREDITS_PER_MONTH,
      // The action type the credit history renders. Named for what the
      // user bought, not for the table it wrote to.
      "badge_removal",
      `Badge removal for one site (${coversMonth.slice(0, 7)})`,
      plan
    );
    if (!spend.ok) return { ok: false, reason: "insufficient_credits" };

    const { error } = await admin.from("site_badge_removals").insert({
      user_id: params.userId,
      site_id: params.siteId,
      covers_month: coversMonth,
      credits_charged: BADGE_REMOVAL_CREDITS_PER_MONTH,
      credit_price_eur: params.creditPriceEur,
    });

    if (error) {
      // THE UNIQUE CONSTRAINT IS NOT AN ERROR — it means this site
      // already has this month, which is the guard working. Refund,
      // because the deduction that just happened was for a month they
      // already own.
      const duplicate = String(error.message ?? "").includes("duplicate key");
      await refund(params.userId, plan, duplicate ? "duplicate" : "insert_failed");
      return { ok: false, reason: duplicate ? "already_active" : "could_not_save" };
    }

    return { ok: true, creditsCharged: BADGE_REMOVAL_CREDITS_PER_MONTH, coversMonth };
  } catch (err) {
    logApiError("publishing:badge-credits", err, { stage: "purchase", siteId: params.siteId });
    return { ok: false, reason: "could_not_save" };
  }
}

async function refund(userId: string, plan: unknown, why: string): Promise<void> {
  try {
    const { grantCredits } = await import("@/lib/billing/credits");
    await grantCredits(
      userId,
      BADGE_REMOVAL_CREDITS_PER_MONTH,
      "badge_removal_refund",
      "Badge removal could not be recorded — credits returned",
      // NOT `purchased`. These credits came back from a spend, they were
      // not bought; marking them purchased would make them survive the
      // monthly reset and quietly inflate the balance.
      { idempotencyKey: `badge_refund:${userId}:${why}:${Date.now()}` }
    );
  } catch (err) {
    logApiError("publishing:badge-credits", err, { stage: "refund", userId });
  }
  void plan;
}

/** Turns auto-renewal off. The paid month is never taken back. */
export async function cancelAutoRenew(userId: string, siteId: string): Promise<boolean> {
  try {
    const admin = createAdminClient();
    const { error } = await admin
      .from("site_badge_removals")
      .update({ auto_renew: false, cancelled_at: new Date().toISOString() })
      .eq("user_id", userId)
      .eq("site_id", siteId)
      .is("cancelled_at", null);
    if (error) throw error;
    return true;
  } catch (err) {
    logApiError("publishing:badge-credits", err, { stage: "cancel", siteId });
    return false;
  }
}

export type DueRemoval = {
  id: string;
  userId: string;
  siteId: string;
  coversMonth: string;
  warnedForMonth: string | null;
  creditsRemaining: number;
};

/** Everything the daily cron has to look at, in one query. */
export async function loadDueRemovals(days = 7): Promise<DueRemoval[]> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("badge_removals_due", { p_days: days });
    if (error) throw error;
    return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
      id: String(row.id),
      userId: String(row.user_id),
      siteId: String(row.site_id),
      coversMonth: String(row.covers_month).slice(0, 10),
      warnedForMonth: row.warned_for_month ? String(row.warned_for_month).slice(0, 10) : null,
      creditsRemaining: Number(row.credits_remaining ?? 0),
    }));
  } catch (err) {
    logApiError("publishing:badge-credits", err, { stage: "load_due" });
    return [];
  }
}

/** Marks a month's warning sent, so a daily cron does not repeat it. */
export async function markWarned(removalId: string, month: string): Promise<void> {
  try {
    const admin = createAdminClient();
    await admin.from("site_badge_removals").update({ warned_for_month: month }).eq("id", removalId);
  } catch (err) {
    logApiError("publishing:badge-credits", err, { stage: "mark_warned", removalId });
  }
}
