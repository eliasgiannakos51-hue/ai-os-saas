import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { logApiError } from "@/lib/log-error";

/**
 * Change some keys of a user's `user_metadata` without touching the rest.
 *
 * WHY THIS EXISTS. Supabase's admin API has no partial update:
 * `updateUserById(id, { user_metadata })` replaces the whole object. Seven
 * places in this app wanted one key each and all seven wrote the same thing:
 *
 *     const { data } = await admin.auth.admin.getUserById(id);
 *     await admin.auth.admin.updateUserById(id, {
 *       user_metadata: { ...data.user.user_metadata, one_key: value },
 *     });
 *
 * A read, a gap, a write. Anything another writer put into the gap is gone,
 * because the spread carries the old snapshot forward over it — and Stripe
 * delivers customer.subscription.updated and invoice.paid inside the same
 * second, which Vercel runs as two concurrent invocations of the same
 * handler. The keys that were at risk are the ones the app gates on:
 * team_granted_tier, terms_accepted_at, subscription_tier.
 *
 * This does the merge in ONE UPDATE statement instead, under the row lock
 * that statement takes. See
 * supabase/migrations/20260910000000_merge_user_metadata.sql.
 *
 * @param patch  keys to set. A key set to `null` is STORED as null, which is
 *               what the Stripe webhook means by
 *               `stripe_subscription_id: isActive ? id : null` — "there is
 *               no subscription", not "leave it alone". Use `remove` for
 *               "leave no trace of this key".
 * @param remove keys to delete outright. Removal happens BEFORE the patch is
 *               merged, so a key in both lists ends up set: /api/team/remove
 *               drops team_granted_tier and may set subscription_tier in the
 *               same action.
 *
 * @returns the merged metadata, or null if the write failed. Callers log and
 *          carry on the way they did with updateUserById's error — this
 *          function changes when the write is atomic, not who handles a
 *          failure.
 */
export async function mergeUserMetadata(
  userId: string,
  patch: Record<string, unknown>,
  options: { remove?: string[]; context: string } = { context: "mergeUserMetadata" }
): Promise<Record<string, unknown> | null> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("merge_user_metadata", {
    p_user_id: userId,
    p_patch: patch,
    p_remove: options.remove ?? [],
  });

  if (error) {
    logApiError(options.context, error, { stage: "merge_user_metadata", userId });
    return null;
  }
  return (data ?? null) as Record<string, unknown> | null;
}
