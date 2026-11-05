import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSiteUrl } from "@/lib/site-url";
import { logApiError } from "@/lib/log-error";

/**
 * THE ADDRESS IS PROVED BEFORE THE ACCOUNT IS USED (NEEDS 22, ΑΣ-5.8,
 * the owner's decision of 2026-10-05).
 *
 * An account is created unconfirmed (src/app/api/signup/route.ts), and the
 * person is NOT signed in. They get a link at the address they typed; the
 * link lands on src/app/auth/confirm/route.ts, which verifies it, confirms
 * the address and opens the session. Until then src/proxy.ts sends
 * the account to /verify-email instead of the dashboard, and answers its
 * API calls with email_not_confirmed.
 *
 * WHY generateLink AND NOT Supabase's own confirmation mail. Supabase's
 * sender was the thing that took signup down before (the comment above
 * createUser in the signup route): this keeps every mail on Resend, in the
 * account's language, and the link is built from the hashed token so the
 * server — not a URL fragment the server cannot read — verifies it.
 */

export const CONFIRM_ROUTE = "/auth/confirm";

/**
 * A relative path inside this site, or the fallback. Never another host.
 *
 * RESOLVED, NOT PATTERN-MATCHED (2026-11-05 review, A4). The string is
 * handed to the same URL parser the redirect will use, against an origin
 * that cannot exist, and only that exact origin is accepted back. A prefix
 * test cannot see what the parser does to a string first — it drops tabs
 * and line breaks and reads a backslash as a slash — so control characters
 * and backslashes are refused before parsing, and the normalised path is
 * refused if it now starts with two slashes (a dot segment can collapse
 * into that). Every caller that follows a `next` goes through this one
 * function: auth/confirm, auth/callback and the signup route.
 */
const NEXT_PATH_BASE = "https://placeholder.invalid";
// eslint-disable-next-line no-control-regex
const NEXT_PATH_UNSAFE = /[\u0000-\u001f\u007f\\]/;

export function safeNextPath(raw: unknown, fallback = "/dashboard/overview"): string {
  if (typeof raw !== "string" || !raw.startsWith("/")) return fallback;
  if (NEXT_PATH_UNSAFE.test(raw)) return fallback;
  let resolved: URL;
  try {
    resolved = new URL(raw, NEXT_PATH_BASE);
  } catch {
    return fallback;
  }
  if (resolved.origin !== NEXT_PATH_BASE) return fallback;
  const path = `${resolved.pathname}${resolved.search}${resolved.hash}`;
  return path.startsWith("//") ? fallback : path;
}

export async function confirmLinkFor(
  admin: SupabaseClient,
  email: string,
  next: string
): Promise<string | null> {
  const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  const hashed = data?.properties?.hashed_token;
  if (error || !hashed) {
    logApiError("auth:confirm-link", error ?? new Error("generateLink returned no token"), {
      stage: "generate_link",
    });
    return null;
  }
  const params = new URLSearchParams({ token_hash: hashed, type: "magiclink", next: safeNextPath(next) });
  return `${getSiteUrl().replace(/\/+$/, "")}${CONFIRM_ROUTE}?${params.toString()}`;
}
