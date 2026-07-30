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
