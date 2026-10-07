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

/** A relative path inside this site, or the fallback. Never another host. */
export function safeNextPath(raw: unknown, fallback = "/dashboard/overview"): string {
  if (typeof raw !== "string") return fallback;
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) return fallback;
  return raw;
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
