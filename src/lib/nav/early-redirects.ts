/**
 * REDIRECTS THAT HAVE TO HAPPEN BEFORE THE PAGE STARTS STREAMING.
 *
 * Issue #61, React #310 ("rendered more hooks than during the previous
 * render") on /dashboard/overview — measured 2026-10-04 with
 * scripts/tests/hook-order.repro.mjs and a router-action log: every crash
 * was on a page that called redirect() from its server component. Every
 * dashboard page renders inside app/dashboard/loading.tsx, so by the time
 * such a page decides to redirect, the shell is already on its way and
 * Next can no longer answer 307. It delivers the redirect to the browser
 * instead, as a client-side `navigate`, while the freshly hydrated router
 * is still queueing the prefetches of every visible link. In Next 14.2
 * each of those actions turns the router's state into a promise that
 * app-router.js unwraps with a conditional use(); a navigate landing in
 * that window is what tips React into #310. A new account opening Home
 * before finishing onboarding is exactly that page.
 *
 * The cure is to decide these in middleware.ts, before any byte of the
 * page exists, so the browser gets an ordinary HTTP redirect and the
 * router never sees one. The pages keep their own check as a fallback,
 * through the same functions here, so the two cannot drift.
 */
import { getPlan } from "@/lib/billing/plans";

/** Old dashboard addresses that now live elsewhere, for good (308). */
export const PERMANENT_MOVES: Readonly<Record<string, string>> = {
  // app/dashboard/memory/page.tsx explains the move.
  "/dashboard/memory": "/dashboard/search",
};

export type OnboardingRead = {
  error: unknown;
  state: { completed_at?: string | null; skipped_at?: string | null } | null;
};

/**
 * Where Home sends someone who has not finished onboarding, or null.
 *
 * ONLY A SUCCESSFUL READ MAY SEND SOMEBODY TO ONBOARDING — a failed one
 * means we do not know what they decided, and "not onboarded" is the
 * guess that bounces an established user out of the product
 * (app/dashboard/overview/page.tsx has the incident).
 */
export function onboardingRedirectTarget(read: OnboardingRead): string | null {
  if (read.error) return null;
  if (read.state?.completed_at || read.state?.skipped_at) return null;
  return "/onboarding";
}

export type TeamAccess = {
  /** isAdminEmail() — admin accounts get Enterprise without a subscription. */
  isAdmin: boolean;
  userMetadata: Record<string, unknown> | null | undefined;
  /** ?setup= on the URL. "success" is the return from the team checkout. */
  setupParam: string | null | undefined;
};

/**
 * Where /dashboard/team sends someone who cannot manage a team, or null.
 *
 * Team collaboration is a Professional+ capability and for the plan's
 * OWNER: a member who joined by invite has subscription_tier set too, but
 * no stripe_subscription_id of their own. Arriving straight from the team
 * checkout (?setup=success) is let through once, because the webhook that
 * writes the tier may not have landed yet; /api/team/invite enforces the
 * real check either way.
 */
export function teamRedirectTarget(access: TeamAccess): string | null {
  if (access.setupParam === "success") return null;
  const meta = access.userMetadata ?? {};
  const tier = access.isAdmin
    ? "enterprise"
    : typeof meta.subscription_tier === "string"
      ? meta.subscription_tier
      : undefined;
  const ownsSubscription = access.isAdmin || Boolean(meta.stripe_subscription_id);
  if (!ownsSubscription || !tier || !getPlan(tier)?.capabilities.teamCollaboration) return "/dashboard/settings";
  return null;
}
