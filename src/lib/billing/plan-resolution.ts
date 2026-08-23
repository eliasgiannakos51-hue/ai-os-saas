import { getPlan, PLANS, type PlanSlug } from "./plans";

/**
 * Which plan an account is on — the rule, with no database, no logger and
 * no server-only import in it, so it can be tested for what it is.
 *
 * Split out of credits.ts for the same reason lib/jobs/resumable.ts is
 * split out of the jobs route: credits.ts pulls in the Supabase admin
 * client and `server-only`, so the decision underneath could not be
 * exercised directly. What could not be exercised was this:
 *
 *   if (getPlan(raw)) return raw;
 *   ...
 *   return "free";
 *
 * THE SILENT DOWNGRADE. The only way getPlan fails on a non-empty string
 * is that PLANS no longer contains that slug — somebody renamed or removed
 * a tier by editing a TypeScript file. Stripe never hears about that. The
 * customer's card keeps being charged on the old subscription while, in
 * the product, every planMeetsMinimum gate closes, the monthly allowance
 * collapses to the free one, and settlement begins dividing by the free
 * credit price so their credits are worth less too. No log, no banner, no
 * way for them or for us to see why.
 *
 * Under-serving a paying customer by a tier is visible and fixable.
 * Charging them while handing them the free product is neither.
 */

/**
 * The lowest plan that is still a PAID plan.
 *
 * Derived from PLANS rather than written down, so removing or reordering a
 * tier cannot leave a stale slug behind HERE — which would be the same
 * bug this file exists to survive, one level up.
 */
export function lowestPaidSlug(): PlanSlug {
  const paid = PLANS.find((p) => p.slug !== "free" && p.slug !== "enterprise");
  return (paid?.slug ?? "free") as PlanSlug;
}

export type PlanResolution = {
  slug: PlanSlug;
  /**
   * The raw tier that PLANS did not recognise, when that is why `slug` is
   * what it is. Non-null means a config/data mismatch on a live account
   * and is what the caller logs — the decision itself stays pure.
   */
  unknownTier: string | null;
};

export type PlanUser = {
  email?: string | null;
  user_metadata?: Record<string, unknown> | null;
} | null | undefined;

export function resolvePlanResolution(user: PlanUser, opts: { isAdmin: boolean }): PlanResolution {
  const raw = user?.user_metadata?.subscription_tier;

  if (typeof raw === "string" && getPlan(raw)) {
    return { slug: raw as PlanSlug, unknownTier: null };
  }

  // Set to something PLANS no longer knows about.
  //
  // THE STRIPE CHECK IS NOT CAUTION FOR ITS OWN SAKE. user_metadata is
  // writable by the account holder through supabase.auth.updateUser, so a
  // blanket "any unrecognised string earns a paid plan" would hand a paid
  // tier to anyone who typed one. Requiring a stripe_customer_id means the
  // fallback can only ever reach an account with a real payment
  // relationship behind it — which is precisely the account the old
  // behaviour was hurting.
  if (typeof raw === "string" && raw.trim() && user?.user_metadata?.stripe_customer_id) {
    return { slug: lowestPaidSlug(), unknownTier: raw };
  }

  // An owner/admin account has no subscription_tier, because it never
  // bought a subscription — admin status lives in ADMIN_EMAILS, which is
  // an entirely separate axis. Falling through to "free" therefore
  // labelled the owner a free user, and the plan is what settlement
  // divides by: an owner's generation reported wouldHaveChargedCredits at
  // the FREE/list rate when their real tier prices it far lower.
  //
  // "enterprise" rather than a paid tier because that is already what the
  // rest of the app calls an admin — see pricing/page.tsx, team/invite and
  // dashboard/team. Billing was the only place that disagreed.
  if (opts.isAdmin) return { slug: "enterprise", unknownTier: null };

  return { slug: "free", unknownTier: null };
}
