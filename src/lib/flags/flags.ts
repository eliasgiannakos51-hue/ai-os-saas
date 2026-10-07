import { createAdminClient } from "@/lib/supabase/admin";
import { isAdminEmail } from "@/lib/auth/admin-emails";
import { logApiError } from "@/lib/log-error";
import { FLAG_AUDIENCES, type FlagAudience } from "@/lib/flags/audience";

/**
 * SWITCHES FOR NEW TOOLS AND BIG CHANGES (MASTER Μέρος 13 Β, 2026-10-05).
 *
 * Every new tool and every big change ships behind one of these. The
 * owner turns it from 'staff' (himself and the test account) to
 * 'everyone', or to 'off', on /dashboard/system-health — no deploy.
 *
 * THE LIST IS HERE, THE CHOICE IS IN THE DATABASE. A switch is added to
 * FLAGS in the same commit as the code behind it; the owner's choice for
 * it lives in public.feature_flags
 * (supabase/migrations/20261017000000_feature_flags.sql).
 *
 * IT FAILS TOWARDS 'staff'. No row, an unreadable table, a migration not
 * yet run: every case reads as 'staff', so a customer never sees an
 * unfinished thing because something went wrong, and the owner still can.
 * scripts/tests/feature-flags.test.mjs runs this rule.
 */
export { FLAG_AUDIENCES, type FlagAudience };

export const FLAGS = {
  "chat-work-area": "Chat: the work area beside the conversation, and the card that reopens it (ΣΥΣΤΗΜΑ DESIGN §5, Δ.2)",
  "tool-shell": "Every tool in one shell: the conversation on the left, the work on the right, one field and at most four options (MASTER 14.3, package 3)",
} as const;

export type FlagKey = keyof typeof FLAGS;

export const DEFAULT_AUDIENCE: FlagAudience = "staff";

export function isFlagKey(value: unknown): value is FlagKey {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(FLAGS, value);
}

export function isFlagAudience(value: unknown): value is FlagAudience {
  return typeof value === "string" && (FLAG_AUDIENCES as readonly string[]).includes(value);
}

/** The owner (ADMIN_EMAILS) and the test account (TEST_ACCOUNT_EMAILS). */
export function isStaffEmail(email: string | null | undefined, testAccounts: string | undefined = process.env.TEST_ACCOUNT_EMAILS): boolean {
  if (!email) return false;
  if (isAdminEmail(email)) return true;
  const testers = (testAccounts ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return testers.includes(email.trim().toLowerCase());
}

export function audienceAllows(audience: FlagAudience, staff: boolean): boolean {
  if (audience === "everyone") return true;
  if (audience === "staff") return staff;
  return false;
}

/** Every switch with the owner's choice, or the default where there is none. */
export async function readFlagAudiences(): Promise<Record<FlagKey, FlagAudience>> {
  const out = Object.fromEntries(Object.keys(FLAGS).map((k) => [k, DEFAULT_AUDIENCE])) as Record<FlagKey, FlagAudience>;
  try {
    const { data, error } = await createAdminClient().from("feature_flags").select("key, audience");
    if (error) throw error;
    for (const row of data ?? []) {
      if (isFlagKey(row.key) && isFlagAudience(row.audience)) out[row.key] = row.audience;
    }
  } catch (err) {
    logApiError("flags:read", err);
  }
  return out;
}

export async function isFeatureOn(key: FlagKey, user: { email?: string | null } | null | undefined): Promise<boolean> {
  const audiences = await readFlagAudiences();
  return audienceAllows(audiences[key], isStaffEmail(user?.email));
}
