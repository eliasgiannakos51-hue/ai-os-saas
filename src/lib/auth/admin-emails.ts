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

// Emails baked into the app that always get full Ultimate-tier access,
// regardless of what's on file in Stripe/Supabase. Extend at deploy time
// via the comma-separated ADMIN_EMAILS env var instead of editing this file
// when possible.
const HARDCODED_ADMIN_EMAILS = ["eliasgiannakos51@gmail.com"];

function parseEnvAdminEmails(): string[] {
  const raw = process.env.ADMIN_EMAILS;
  if (!raw) return [];
  return raw
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

export const ADMIN_EMAILS: string[] = Array.from(
  new Set([...HARDCODED_ADMIN_EMAILS.map((email) => email.toLowerCase()), ...parseEnvAdminEmails()])
);

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return ADMIN_EMAILS.includes(email.toLowerCase());
}
