import "server-only";
import { isAdminEmail } from "@/lib/admin";
import { getPlan, higherPlanSlug, type Plan, type PlanSlug } from "@/lib/billing/plans";

/**
 * Which plan an account is on — the whole decision, with no database, no
 * network and no Stripe in it.
 *
 * SPLIT OUT OF credits.ts SO IT CAN BE TESTED. It used to sit in a module
 * that imports the Supabase admin client, which means every unit test that
 * wanted to ask "what plan is this user on?" had to boot a database or not
 * ask at all — and not asking is what happened. The rule that decides what
 * a paying customer is entitled to had no unit test of its own, and the
 * bug it hid (a team grant written over the member's own subscription)
 * survived precisely there.
 *
 * credits.ts re-exports both functions, so every existing import is
 * unchanged.
 */

// The plan a user is on lives in user_metadata.subscription_tier, written
// by the Stripe webhook on checkout/subscription events (see
// api/webhooks/stripe/route.ts) or set to "free" directly at signup. Falls
// back to "free" for anything missing or unrecognized — same default
// dashboard/settings/page.tsx already uses to display the current plan.
//
// This is the RAW tier only — it does not know about beta access expiring.
// A beta grant sets subscription_tier: "ultimate" at signup and nothing
// ever writes it back to "free" when the 30-day window closes, so this
// alone would keep reporting "ultimate" forever. Anywhere that resolved
// plan actually gates a feature or a credit cost should use
// resolveEffectivePlanSlug/resolveEffectivePlan below instead, which layer
// the live beta-expiry check on top of this.
export function resolvePlanSlug(
  user: { email?: string | null; user_metadata?: Record<string, unknown> | null } | null | undefined
): PlanSlug {
  // TWO INDEPENDENT SOURCES, and the answer is the higher — never the one
  // written most recently.
  //
  // `subscription_tier` is what this account pays for. `team_granted_tier`
  // is what a team owner lends them. They used to be the SAME field:
  // accepting an invite overwrote the member's own tier with the owner's,
  // and leaving the team wrote "free" over whatever was there. A member on
  // their own paid plan who joined a team and later left was dropped to
  // Free while Stripe kept charging their card — a silent downgrade of
  // someone who was still paying, with nothing in the product that could
  // even notice.
  const own = user?.user_metadata?.subscription_tier;
  const granted = user?.user_metadata?.team_granted_tier;
  const best = higherPlanSlug(
    typeof own === "string" && getPlan(own) ? own : null,
    typeof granted === "string" && getPlan(granted) ? granted : null
  );
  if ((typeof own === "string" && getPlan(own)) || (typeof granted === "string" && getPlan(granted))) {
    return best;
  }

  // An owner/admin account has no subscription_tier, because it never
  // bought a subscription — admin status lives in ADMIN_EMAILS, which is
  // an entirely separate axis. Falling through to "free" therefore
  // labelled the owner a free user.
  //
  // That is not merely cosmetic. The plan is what settlement divides by,
  // so it decides what a credit is worth: an owner's generation reported
  // wouldHaveChargedCredits at the FREE/list rate (EUR 0.02 -> 53
  // credits) when their real tier prices it at EUR 0.008 -> 132. The one
  // number available for checking the margin on admin traffic was 60%
  // low, which is the opposite of what a safety figure should do.
  //
  // "enterprise" rather than a paid tier because that is already what the
  // rest of the app calls an admin — see pricing/page.tsx, team/invite
  // and dashboard/team, all of which read `isAdmin ? "enterprise" : ...`.
  // Billing was the only place that disagreed.
  if (isAdminEmail(user?.email)) return "enterprise";

  return "free";
}

export function resolvePlan(
  user: { email?: string | null; user_metadata?: Record<string, unknown> | null } | null | undefined
): Plan {
  return getPlan(resolvePlanSlug(user)) ?? getPlan("free")!;
}
