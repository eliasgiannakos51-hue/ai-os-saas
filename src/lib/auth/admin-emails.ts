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
function parseEnvAdminEmails(): string[] {
  const raw = process.env.ADMIN_EMAILS;
  if (!raw) return [];
  return raw
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

export const ADMIN_EMAILS: string[] = Array.from(new Set(parseEnvAdminEmails()));

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return ADMIN_EMAILS.includes(email.toLowerCase());
}
