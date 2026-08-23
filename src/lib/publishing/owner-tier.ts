import "server-only";
import { logApiError } from "@/lib/log-error";

/**
 * The plan of the account that owns a published site.
 *
 * ON THE HOTTEST PATH IN THE PRODUCT — every public page view of every
 * site — so it does exactly one thing: one row by primary key, through
 * public.account_tier(), which returns a single string and cannot
 * enumerate anybody.
 *
 * FAILS TOWARDS THE BADGE. An unreadable tier returns "free", so a
 * database hiccup shows the badge on a paying customer's site rather than
 * hiding it on a free one. Both are wrong; only one of them costs us the
 * upsell on every free site whenever auth.users is slow, and the other is
 * visible to somebody who can tell us.
 */
// The structural type is `rpc` returning a THENABLE rather than a
// Promise: supabase-js returns a PostgrestFilterBuilder, which is
// awaitable but is not a Promise, so a Promise-typed parameter rejects
// the real client. Typed to what it is.
type RpcClient = {
  rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }>;
};

export async function readOwnerTier(admin: RpcClient, userId: string): Promise<string> {
  try {
    const { data, error } = await admin.rpc("account_tier", { p_user_id: userId });
    if (error) throw error;
    const tier = typeof data === "string" ? data.trim() : "";
    return tier || "free";
  } catch (err) {
    logApiError("publishing:owner-tier", err, { userId });
    return "free";
  }
}
