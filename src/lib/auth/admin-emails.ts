// WHICH EMAIL ADDRESSES BELONG TO US — not the client that ignores RLS.
//
// RENAMED FROM lib/admin.ts, and this pair was the more dangerous of the
// two. lib/supabase/admin.ts exports createAdminClient(), the SERVICE-ROLE
// client that bypasses row-level security entirely. This file exports
// isAdminEmail(), a plain allowlist of who counts as staff.
//
// Fourteen files import BOTH. "admin" meaning two things in one import
// block — one a permission question, one a key that reads any row in the
// database — is a mix-up waiting for a tired afternoon.
import "server-only";

// WHO IS STAFF COMES FROM THE ENVIRONMENT, AND ONLY FROM THERE.
//
// Until 2026-10-04 the owner's address was a literal here, in a public
// repository. It now lives in the deployment's ADMIN_EMAILS variable
// (comma-separated), set in Vercel → Settings → Environment Variables. An
// unset variable means NO admins: the owner-only pages answer 404 and the
// cost-bypass is off for everyone, which is the safe way for it to fail.
// docs/NEEDS-FROM-ELIAS.md has the steps.
// The OWNER_EMAIL is the one address that always has full access,
// regardless of env vars, plans, credits or flags. Set by the owner
// in the database: UPDATE auth.users SET raw_user_meta_data =
// raw_user_meta_data || '{"is_owner": true}' WHERE email = '...';
// This is NOT in the code as a literal — it is read from the user's
// own row at runtime.

function parseEnvAdminEmails(): string[] {
  const raw = process.env.ADMIN_EMAILS;
  if (!raw) return [];
  return raw
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

export const ADMIN_EMAILS: string[] = Array.from(new Set(parseEnvAdminEmails()));

/**
 * True when this user is the platform owner (is_owner in user_metadata)
 * or listed in the ADMIN_EMAILS env var.
 */
export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return ADMIN_EMAILS.includes(email.toLowerCase());
}

/** Checks user_metadata.is_owner — works even without ADMIN_EMAILS env var. */
export function isOwner(user: { email?: string | null; user_metadata?: Record<string, unknown> | null } | null | undefined): boolean {
  if (!user) return false;
  // Database-level owner flag: no env var needed.
  if (user.user_metadata?.is_owner === true) return true;
  // Env-var admin: first in the list is the owner.
  if (user.email && ADMIN_EMAILS.length > 0 && user.email.toLowerCase() === ADMIN_EMAILS[0]) return true;
  return false;
}

/** Checks both is_owner metadata AND ADMIN_EMAILS env var. */
export function isAdminOrOwner(user: { email?: string | null; user_metadata?: Record<string, unknown> | null } | null | undefined): boolean {
  if (!user) return false;
  if (isOwner(user)) return true;
  if (user.email && isAdminEmail(user.email)) return true;
  return false;
}

export function isOwnerEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return ADMIN_EMAILS.length > 0 && email.toLowerCase() === ADMIN_EMAILS[0];
}
