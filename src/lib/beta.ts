import "server-only";

// Beta testers get full Ultimate-tier access (see api/signup/route.ts,
// which sets subscription_tier: "ultimate" directly in user_metadata when
// a valid BETA_INVITE_CODE was supplied at signup) without ever touching
// Stripe. This flag is the separate "unlimited credits" bypass — mirrors
// isAdminEmail (lib/admin.ts) exactly, but is intentionally its own
// function/env var/metadata field so the two systems never conflict:
// an admin account is never also flagged is_beta_tester, and clearing
// BETA_INVITE_CODE (or an account's is_beta_tester flag) can't affect
// ADMIN_EMAILS or vice versa.
export function isBetaTester(
  user: { user_metadata?: Record<string, unknown> | null } | null | undefined
): boolean {
  return user?.user_metadata?.is_beta_tester === true;
}
