import "server-only";
import { randomBytes, createHash } from "crypto";
import type { createAdminClient } from "@/lib/supabase/admin";

// EVERY HELPER HERE TAKES THE SERVICE-ROLE CLIENT, and the type says so.
// pending_deletions has RLS on and no policy (deny-all,
// 20261108000000_pending_deletions.sql): a session client would read zero
// rows with no error, which on the cron's path means deletions that never
// run and on the cancel path a link that always answers "invalid".
// security-posture.test.mjs holds this file to the admin client.
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
  user_id: string;
  delete_after: string;
  cancelled_at: string | null;
  executed_at: string | null;
  created_at: string;
}

export async function scheduleDeletion(
  admin: AdminClient,
  userId: string,
): Promise<{ row: PendingDeletion; cancelToken: string } | null> {
  const { token, tokenHash } = generateCancelToken();
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

  if (error || !data) return null;
  return { row: data as PendingDeletion, cancelToken: token };
}

export async function cancelDeletion(
  admin: AdminClient,
  cancelToken: string,
): Promise<{ userId: string } | null> {
  const tokenHash = hashCancelToken(cancelToken);

  const { data, error } = await admin
    .from("pending_deletions")
    .update({ cancelled_at: new Date().toISOString() })
    .eq("cancel_token_hash", tokenHash)
    .is("cancelled_at", null)
    .is("executed_at", null)
    .select("user_id")
    .maybeSingle();

  if (error || !data) return null;
  return { userId: data.user_id };
}

export async function cancelDeletionByUserId(
  admin: AdminClient,
  userId: string,
): Promise<boolean> {
  const { data, error } = await admin
    .from("pending_deletions")
    .update({ cancelled_at: new Date().toISOString() })
    .eq("user_id", userId)
    .is("cancelled_at", null)
    .is("executed_at", null)
    .select("id")
    .maybeSingle();

  return !error && !!data;
}

export async function getActivePendingDeletion(
  admin: AdminClient,
  userId: string,
): Promise<PendingDeletion | null> {
  const { data } = await admin
    .from("pending_deletions")
    .select("*")
    .eq("user_id", userId)
    .is("cancelled_at", null)
    .is("executed_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return (data as PendingDeletion) ?? null;
}

export async function getActionableDeletions(
  admin: AdminClient,
): Promise<PendingDeletion[]> {
  const { data } = await admin
    .from("pending_deletions")
    .select("*")
    .is("cancelled_at", null)
    .is("executed_at", null)
    .lt("delete_after", new Date().toISOString())
    .order("delete_after", { ascending: true })
    .limit(50);

  return (data as PendingDeletion[]) ?? [];
}

export async function markExecuted(
  admin: AdminClient,
  id: string,
): Promise<boolean> {
  const { error } = await admin
    .from("pending_deletions")
    .update({ executed_at: new Date().toISOString() })
    .eq("id", id);

  return !error;
}
