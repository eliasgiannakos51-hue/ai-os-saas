import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { logApiError } from "@/lib/log-error";

/**
 * EVERY SUSPENDED ACCOUNT, IN ONE READ, FOR THE CRONS (2026-11-05 review, A1).
 *
 * A cron runs an account's scheduled work with the service role, so no
 * session and no middleware stands between a suspended account and its
 * agents, flows and reminders. Each cron that does per-account work reads
 * this set once per run and skips those accounts
 * (scripts/tests/account-suspension.test.mjs holds the list of crons).
 *
 * `suspended_user_ids()` is in migration
 * 20261115000000_account_suspension.sql, granted to service_role only. It
 * answers from auth.users: the app_metadata flag, the older user_metadata
 * flag, or a ban still in force.
 *
 * A FAILED READ SKIPS NOBODY, and logs. Failing closed would stop every
 * account's scheduled work whenever the migration has not been pasted;
 * the sign-in and the API are refused independently of this
 * (Supabase's ban, and src/proxy.ts).
 */
/**
 * The set as a PostgREST list, for `.not("user_id", "in", suspendedIn(ids))`
 * on the query that picks the due work. IN THE QUERY, not a `continue` in
 * the loop after it: these queries are LIMITed, and work skipped after
 * the limit would be picked again on every tick, ahead of everybody
 * else's. An empty set becomes the nil uuid, which is nobody.
 */
export function suspendedIn(ids: ReadonlySet<string>): string {
  return `(${ids.size > 0 ? [...ids].join(",") : "00000000-0000-0000-0000-000000000000"})`;
}

export async function suspendedUserIds(admin: SupabaseClient, context: string): Promise<Set<string>> {
  try {
    const { data, error } = await admin.rpc("suspended_user_ids");
    if (error) {
      logApiError(context, error, { stage: "suspended_user_ids" });
      return new Set();
    }
    const rows = (data ?? []) as { user_id?: unknown }[];
    return new Set(rows.map((r) => String(r.user_id ?? "")).filter(Boolean));
  } catch (err) {
    logApiError(context, err, { stage: "suspended_user_ids" });
    return new Set();
  }
}
