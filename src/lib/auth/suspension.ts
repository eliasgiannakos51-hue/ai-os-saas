/**
 * WHETHER AN ACCOUNT IS SUSPENDED, READ FROM PLACES THE ACCOUNT CANNOT WRITE
 * (2026-11-05 review, A1).
 *
 * A suspension used to be one key in `user_metadata`, which the account
 * itself can rewrite, and only the dashboard layout looked at it — the
 * API, and the crons that run an account's scheduled work, did not. Now
 * api/admin/suspend does three things at once through Supabase Auth's
 * admin API:
 *
 *   1. a BAN (`ban_duration`), so Supabase refuses the next sign-in and
 *      the next token refresh;
 *   2. `app_metadata.suspended`, which only the service role can write,
 *      so the middleware (src/proxy.ts) can refuse every `/api/*` call and
 *      every dashboard page for the access token that is still alive —
 *      it can live up to an hour after the ban;
 *   3. nothing in `user_metadata` any more. The four `suspended*` keys an
 *      older suspension wrote there are still READ, so an account
 *      suspended before this change stays suspended, and the database
 *      keeps them for the server (migration
 *      20261115000000_account_suspension.sql adds them to the keys
 *      Supabase Auth cannot change on the account's behalf).
 *
 * The crons ask the database for the whole list at once
 * (`suspended_user_ids`, same migration) and skip those accounts' work.
 */
import type { User } from "@supabase/supabase-js";

/** What a suspension sets: long enough to read as "until lifted". */
export const SUSPEND_BAN_DURATION = "876000h";
/** What lifting it sets. */
export const LIFT_BAN_DURATION = "none";

/** The keys a suspension carries, in app_metadata (and, from before, in user_metadata). */
export const SUSPENSION_KEYS = ["suspended", "suspended_reason", "suspended_at", "suspended_by"] as const;

type SuspendableUser = Pick<User, "app_metadata" | "user_metadata"> & { banned_until?: string | null };

export function isSuspended(user: SuspendableUser | null | undefined, now = Date.now()): boolean {
  if (!user) return false;
  if (user.app_metadata?.suspended === true) return true;
  // Before 2026-11-05 the flag lived here; the database now keeps it for
  // the server, so reading it can only keep an account suspended.
  if (user.user_metadata?.suspended === true) return true;
  const banned = user.banned_until ? Date.parse(user.banned_until) : NaN;
  return Number.isFinite(banned) && banned > now;
}

/** The reason the admin wrote, for the suspended page. */
export function suspensionReason(user: SuspendableUser | null | undefined): string {
  const fromApp = user?.app_metadata?.suspended_reason;
  if (typeof fromApp === "string") return fromApp;
  const fromUser = user?.user_metadata?.suspended_reason;
  return typeof fromUser === "string" ? fromUser : "";
}
