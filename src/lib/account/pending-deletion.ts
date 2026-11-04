import "server-only";
import { randomBytes, createHash } from "node:crypto";
import type { createAdminClient } from "@/lib/supabase/admin";

// EVERY HELPER HERE TAKES THE SERVICE-ROLE CLIENT, and the type says so.
// pending_deletions has RLS on and no policy (deny-all,
// 20261108000000_pending_deletions.sql): a session client would read zero
// rows with no error, which on the cron's path means deletions that never
// run and on the cancel path a link that always answers "invalid".
// security-posture.test.mjs holds this file to the admin client.
//
// ONE OPEN SCHEDULE PER ACCOUNT, and every link sent for it works. A row is
// OPEN while cancelled_at and executed_at are both null. Confirming a
// deletion that is already scheduled joins the open row instead of adding
// a second one (scheduleDeletion), and a cancel link stops every open row
// of the account it was sent to (cancelDeletion). The database holds the
// first half too, from 20261112000000_pending_deletions_one_open.sql on.
// scripts/tests/deferred-deletion.test.mjs runs all of this against a
// stand-in of the table, before and after that migration.
type AdminClient = ReturnType<typeof createAdminClient>;

export const DELETION_GRACE_DAYS = 30;

export function generateCancelToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString("hex");
  return { token, tokenHash: hashCancelToken(token) };
}

export function hashCancelToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export interface PendingDeletion {
  id: string;
  /**
   * null once the account is gone: from 20261112000000 the foreign key is
   * ON DELETE SET NULL, so the row outlives the account as the record
   * that the deletion ran (GDPR Art. 5(2)), and a trigger empties the
   * token digests at the same moment.
   */
  user_id: string | null;
  delete_after: string;
  cancelled_at: string | null;
  executed_at: string | null;
  created_at: string;
}

/** A row the cron can act on: it still has an account to delete. */
export type ActionableDeletion = PendingDeletion & { user_id: string };

// The columns the join reads besides the public ones. Not on
// PendingDeletion, because nothing outside this file may hand a digest on.
type OpenRow = PendingDeletion & {
  cancel_token_hash: string;
  previous_cancel_token_hashes?: string[] | null;
};

// Postgres's unique_violation: the one-open-row index refused a second
// open row (20261112000000), which means another confirmation got there
// first.
const UNIQUE_VIOLATION = "23505";

// A column the database does not have yet: PostgREST's schema-cache miss
// on a write (PGRST204), Postgres's undefined_column on a filter (42703).
// Both mean 20261112000000 has not been pasted, not that anything failed.
function isMissingColumn(error: { code?: string } | null): boolean {
  return error?.code === "PGRST204" || error?.code === "42703";
}

/**
 * Schedules the account's deletion, or JOINS the schedule it already has.
 *
 * A second confirmation (two confirmation emails, both clicked) used to
 * write a second row with a later date; the cancel link from one email
 * then stopped only its own row and the cron deleted the account with the
 * other. Now:
 *
 *  - no open row: insert one, DELETION_GRACE_DAYS out;
 *  - an open row: keep it, and keep its delete_after — the EARLIER date,
 *    never moved by a confirmation — and give it a fresh cancel link
 *    (joinOpenSchedule), so the email this confirmation sends works.
 *
 * `joined` says which. The returned row's delete_after is the date the
 * email must state.
 */
export async function scheduleDeletion(
  admin: AdminClient,
  userId: string,
): Promise<{ row: PendingDeletion; cancelToken: string; joined: boolean } | null> {
  const { token, tokenHash } = generateCancelToken();

  // Three rounds: each retry means another confirmation of the SAME
  // account changed the open row between our read and our write, which
  // takes two clicks landing within milliseconds of each other.
  for (let round = 0; round < 3; round++) {
    const { data: open, error: readError } = await admin
      .from("pending_deletions")
      .select("*")
      .eq("user_id", userId)
      .is("cancelled_at", null)
      .is("executed_at", null)
      .order("delete_after", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (readError) return null;

    if (open) {
      const joined = await joinOpenSchedule(admin, userId, open as OpenRow, tokenHash);
      if (joined === "changed") continue;
      if (!joined) return null;
      return { row: joined, cancelToken: token, joined: true };
    }

    const deleteAfter = new Date(
      Date.now() + DELETION_GRACE_DAYS * 24 * 60 * 60 * 1000,
    ).toISOString();
    const { data, error } = await admin
      .from("pending_deletions")
      .insert({
        user_id: userId,
        delete_after: deleteAfter,
        cancel_token_hash: tokenHash,
      })
      .select()
      .single();

    if (!error && data) return { row: data as PendingDeletion, cancelToken: token, joined: false };
    // Two first confirmations raced and the other one's row is in: the
    // next round reads it and joins it.
    if (error?.code === UNIQUE_VIOLATION) continue;
    return null;
  }
  return null;
}

/**
 * Gives the open row a new cancel link and KEEPS the old one working.
 *
 * Only the SHA-256 of a link is stored, so the email this confirmation
 * sends needs a new token. The digest it replaces moves into
 * previous_cancel_token_hashes, where cancelDeletion still finds it — the
 * first email's link goes on cancelling the same schedule. The write is a
 * compare-and-swap on the digest it read: a concurrent join makes it miss
 * ("changed") instead of dropping one of the two links.
 *
 * BEFORE 20261112000000 the array column does not exist, and there is no
 * way to keep both links on one row. The fallback is a second row with
 * the SAME (earlier) delete_after: both links work because a cancel stops
 * every open row of the account, the cron runs both on the same day, and
 * the migration folds them into one.
 */
async function joinOpenSchedule(
  admin: AdminClient,
  userId: string,
  open: OpenRow,
  tokenHash: string,
): Promise<PendingDeletion | "changed" | null> {
  const previous = Array.isArray(open.previous_cancel_token_hashes)
    ? open.previous_cancel_token_hashes
    : [];
  const { data, error } = await admin
    .from("pending_deletions")
    .update({
      cancel_token_hash: tokenHash,
      previous_cancel_token_hashes: [...previous, open.cancel_token_hash],
    })
    .eq("id", open.id)
    .eq("user_id", userId)
    .eq("cancel_token_hash", open.cancel_token_hash)
    .is("cancelled_at", null)
    .is("executed_at", null)
    .select()
    .maybeSingle();

  if (!error) return data ? (data as PendingDeletion) : "changed";
  if (!isMissingColumn(error)) return null;

  const { data: second, error: insertError } = await admin
    .from("pending_deletions")
    .insert({
      user_id: userId,
      delete_after: open.delete_after,
      cancel_token_hash: tokenHash,
    })
    .select()
    .single();
  if (insertError || !second) return null;
  return second as PendingDeletion;
}

/**
 * The account an emailed cancel link belongs to, while its schedule is
 * still open: the link's own row, or a row it was folded into when a
 * later confirmation joined the schedule. A link whose schedule was
 * cancelled or carried out resolves to nobody, so an old email can never
 * stop a deletion asked for after it.
 */
async function ownerOfOpenLink(admin: AdminClient, tokenHash: string): Promise<string | null> {
  const { data: own, error } = await admin
    .from("pending_deletions")
    .select("user_id")
    .eq("cancel_token_hash", tokenHash)
    .is("cancelled_at", null)
    .is("executed_at", null)
    .not("user_id", "is", null)
    .limit(1)
    .maybeSingle();
  if (error) return null;
  if (own?.user_id) return own.user_id as string;

  // Before 20261112000000 this column is missing and the read errors,
  // which is the right answer: nothing has been folded yet.
  const { data: joined, error: joinedError } = await admin
    .from("pending_deletions")
    .select("user_id")
    .contains("previous_cancel_token_hashes", [tokenHash])
    .is("cancelled_at", null)
    .is("executed_at", null)
    .not("user_id", "is", null)
    .limit(1)
    .maybeSingle();
  if (joinedError) return null;
  return (joined?.user_id as string | undefined) ?? null;
}

/**
 * Cancels the deletion an emailed link was sent for — EVERY open row of
 * that account, in one update. A link used to stop only its own row,
 * which left the other schedule of a twice-confirmed deletion alive.
 * Returns null when the link resolves to no open schedule (wrong, already
 * used, or already carried out).
 */
export async function cancelDeletion(
  admin: AdminClient,
  cancelToken: string,
): Promise<{ userId: string; cancelled: number } | null> {
  const ownerId = await ownerOfOpenLink(admin, hashCancelToken(cancelToken));
  if (!ownerId) return null;

  const { data, error } = await admin
    .from("pending_deletions")
    .update({ cancelled_at: new Date().toISOString() })
    .eq("user_id", ownerId)
    .is("cancelled_at", null)
    .is("executed_at", null)
    .select("id");

  if (error || !data || data.length === 0) return null;
  return { userId: ownerId, cancelled: data.length };
}

/**
 * Settings' cancel: every open row of the signed-in account. Returns how
 * many it stopped, or null when the write failed.
 *
 * NO .maybeSingle() HERE. supabase-js checks the row count AFTER the
 * update has run, so with two open rows it cancelled both and reported an
 * error — and Settings said «not found» about a deletion it had just
 * stopped.
 */
export async function cancelDeletionByUserId(
  admin: AdminClient,
  userId: string,
): Promise<number | null> {
  const { data, error } = await admin
    .from("pending_deletions")
    .update({ cancelled_at: new Date().toISOString() })
    .eq("user_id", userId)
    .is("cancelled_at", null)
    .is("executed_at", null)
    .select("id");

  if (error) return null;
  return data?.length ?? 0;
}

/**
 * The account's open schedule, by the date that will actually run: with
 * two open rows (written before 20261112000000), the earlier one.
 */
export async function getActivePendingDeletion(
  admin: AdminClient,
  userId: string,
): Promise<PendingDeletion | null> {
  const { data } = await admin
    .from("pending_deletions")
    .select("id, user_id, delete_after, cancelled_at, executed_at, created_at")
    .eq("user_id", userId)
    .is("cancelled_at", null)
    .is("executed_at", null)
    .order("delete_after", { ascending: true })
    .limit(1)
    .maybeSingle();

  return (data as PendingDeletion) ?? null;
}

/**
 * What the cron runs: not cancelled, past its date, and with an account
 * still attached. executed_at is NOT required to be null: the cron writes
 * it before it deletes anything (claimExecution), so a row that says
 * executed while its account still exists is a run that stopped half-way
 * — it is picked up again here and finished. A row whose deletion did
 * finish has no account left (user_id null) and is never returned.
 */
export async function getActionableDeletions(
  admin: AdminClient,
): Promise<ActionableDeletion[]> {
  const { data } = await admin
    .from("pending_deletions")
    .select("id, user_id, delete_after, cancelled_at, executed_at, created_at")
    .is("cancelled_at", null)
    .not("user_id", "is", null)
    .lt("delete_after", new Date().toISOString())
    .order("delete_after", { ascending: true })
    .limit(50);

  return (data as ActionableDeletion[]) ?? [];
}

/**
 * Writes executed_at BEFORE the cron erases anything, so the record
 * exists by the time the account — and with it the row's user_id — goes.
 * Conditional on the row still being uncancelled with an account, which
 * also stops a deletion the person cancelled while this run was under
 * way: "not_open" means leave it alone.
 */
export async function claimExecution(
  admin: AdminClient,
  id: string,
): Promise<"claimed" | "not_open" | "error"> {
  const { data, error } = await admin
    .from("pending_deletions")
    .update({ executed_at: new Date().toISOString() })
    .eq("id", id)
    .is("cancelled_at", null)
    .not("user_id", "is", null)
    .select("id")
    .maybeSingle();

  if (error) return "error";
  return data ? "claimed" : "not_open";
}

/**
 * Takes a claim back after a step failed, so the row is open again: the
 * person's cancel link works, and the next run retries. ONLY while the
 * account still exists — a deleteUser that reported an error after doing
 * its work has already set user_id to null, and then the row stays
 * executed, because it was.
 */
export async function releaseExecution(
  admin: AdminClient,
  id: string,
): Promise<boolean> {
  const { error } = await admin
    .from("pending_deletions")
    .update({ executed_at: null })
    .eq("id", id)
    .not("user_id", "is", null);

  return !error;
}
