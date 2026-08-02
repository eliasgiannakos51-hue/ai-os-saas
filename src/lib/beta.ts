import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

// Beta testers get full Ultimate-tier access (see api/signup/route.ts,
// which sets subscription_tier: "ultimate" directly in user_metadata when
// a valid BETA_INVITE_CODE was supplied at signup) without ever touching
// Stripe. This flag is the separate "unlimited credits" bypass — mirrors
// isAdminEmail (lib/admin.ts) exactly, but is intentionally its own
// function/env var/metadata field so the two systems never conflict:
// an admin account is never also flagged is_beta_tester, and clearing
// BETA_INVITE_CODE (or an account's is_beta_tester flag) can't affect
// ADMIN_EMAILS or vice versa.
//
// This flag alone is historical only ("was this account ever granted beta
// access") — it stays true forever once set, even after the 30-day window
// closes. Whether the account STILL gets Ultimate-tier treatment right now
// is a separate, time-bound question answered by isBetaAccessActive below.
export function isBetaTester(
  user: { user_metadata?: Record<string, unknown> | null } | null | undefined
): boolean {
  return user?.user_metadata?.is_beta_tester === true;
}

export const BETA_ACCESS_DAYS = 30;

// Falls back to a hardcoded default so beta invites work out of the box
// without requiring BETA_INVITE_CODE to be configured in every environment
// — set the env var to override it (e.g. to rotate the code) without a
// code change.
export function getBetaInviteCode(): string {
  return process.env.BETA_INVITE_CODE || "IONEXA200";
}

export function computeBetaExpiresAt(): string {
  return new Date(Date.now() + BETA_ACCESS_DAYS * 24 * 60 * 60 * 1000).toISOString();
}

// Whole days remaining until `expiresAtIso`, rounded up (so "23.5 hours
// left" still reads as "1 day left" rather than "0 days left" until it
// actually passes). Negative/zero once expired.
export function daysRemaining(expiresAtIso: string): number {
  const msRemaining = new Date(expiresAtIso).getTime() - Date.now();
  return Math.ceil(msRemaining / (24 * 60 * 60 * 1000));
}

// The time-bound half of beta access: reads beta_expires_at directly from
// user_credits (set at signup — see api/signup/route.ts) and reports
// whether that window is still open. Returns false for an account that was
// never granted a beta expiry (no row / null column) as well as one whose
// window has closed — both cases should fall back to being treated as
// Free, same as if they'd never had beta access at all.
export async function isBetaAccessActive(userId: string): Promise<boolean> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("user_credits")
    .select("beta_expires_at")
    .eq("user_id", userId)
    .maybeSingle();

  if (!data?.beta_expires_at) return false;
  return new Date(data.beta_expires_at).getTime() > Date.now();
}

// Days left in the beta window, or null if the account has no beta expiry
// on file at all (never a beta tester, or a pre-expiry-column beta grant).
// Used for the Settings badge and the Home "expires soon" banner — both
// want the raw number (which can be <= 0 once expired) rather than a
// boolean, so the caller decides what "expired" should look like.
export async function getBetaDaysRemaining(userId: string): Promise<number | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("user_credits")
    .select("beta_expires_at")
    .eq("user_id", userId)
    .maybeSingle();

  if (!data?.beta_expires_at) return null;
  return daysRemaining(data.beta_expires_at);
}

// The actual "should this request be treated as unlimited/Ultimate right
// now" bypass used at every credit-deduction and plan-gating call site —
// combines the historical flag, the live expiry check, and one more
// guard: an account that's gone on to become a REAL paying subscriber
// (has a Stripe customer id) should never be downgraded just because its
// old beta window closed — Stripe's own webhook is the source of truth
// for them from that point on, same as any other paying customer.
export async function hasActiveBetaBypass(
  user: { id: string; user_metadata?: Record<string, unknown> | null } | null | undefined
): Promise<boolean> {
  if (!user || !isBetaTester(user)) return false;
  if (user.user_metadata?.stripe_customer_id) return false;
  return isBetaAccessActive(user.id);
}
