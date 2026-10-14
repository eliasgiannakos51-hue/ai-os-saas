/**
 * HOW FULL THE BALANCE IS, IN ONE PLACE FOR EVERY SCREEN THAT SAYS SO.
 *
 * Two places draw it: the top bar's low-credits notice from 640px up
 * (components/credits/low-credits-banner.tsx) and the phone's bottom bar
 * below 768px (components/dashboard/mobile-tab-bar.tsx, the You tab). Both
 * read this, so a phone and a desktop can never disagree about when a
 * balance is low. scripts/tests/mobile-tabs.test.mjs runs it.
 *
 * Pure, and free of anything server-only: the bottom bar is a client
 * component and takes its numbers from the credits context
 * (components/credits/credits-context.tsx), which the dashboard layout
 * seeds — no request of its own.
 */

// Below this share of the monthly allowance, the balance is low. 20% is
// early enough to act on and late enough not to nag.
export const LOW_CREDITS_THRESHOLD = 0.2;

/**
 * - "unlimited": an admin-listed account, which is never charged
 *   (lib/auth/admin-emails.ts) — its stored number means nothing.
 * - "unknown":   nothing to say. The balance has not been read, or it
 *   reads 0 of 0, which is also what app/dashboard/layout.tsx falls back
 *   to when it could not read the row at all — so a zero there is not
 *   evidence of an empty account.
 * - "empty":     nothing left of a known allowance.
 * - "low":       at or below LOW_CREDITS_THRESHOLD of it.
 * - "ok":        anything else, including a balance whose allowance is
 *   unknown (a custom plan): the number is real, its scale is not.
 */
export type CreditLevel = "unlimited" | "unknown" | "ok" | "low" | "empty";

export function creditLevel({
  credits,
  total,
  isAdmin,
}: {
  credits: number | null;
  total: number | null;
  isAdmin: boolean;
}): CreditLevel {
  if (isAdmin) return "unlimited";
  if (credits === null || !Number.isFinite(credits)) return "unknown";
  if (total === null || !(total > 0)) return credits > 0 ? "ok" : "unknown";
  if (credits <= 0) return "empty";
  return credits / total <= LOW_CREDITS_THRESHOLD ? "low" : "ok";
}
