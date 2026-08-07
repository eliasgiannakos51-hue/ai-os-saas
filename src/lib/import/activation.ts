import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { logApiError } from "@/lib/log-error";

/**
 * The one free import and analysis.
 *
 * The spec calls it an activation investment, and treating it as one
 * means it has to be exactly one — per account, ever, across every entry
 * point. Three things follow from that, and all three are load-bearing:
 *
 * 1. IT IS CLAIMED IN THE DATABASE, by a conditional UPDATE
 *    (`claim_activation_run`), not by reading a flag and then writing
 *    it. Two requests that both read "not used yet" would both get a
 *    free run — and this is the flag that decides whether real money is
 *    spent for free, so a race here is a way to spend ours.
 *
 * 2. IT IS CLAIMED WITH THE ADMIN CLIENT. The user owns their
 *    `user_onboarding` row and can update it — they need to, for the
 *    flow's own progress fields. The RPC is SECURITY DEFINER and granted
 *    only to service_role so the billing flag specifically is out of
 *    reach.
 *
 * 3. IT IS CLAIMED BEFORE THE WORK, not after. A run that claims on
 *    success would hand a second free run to anyone whose first one
 *    failed — including anyone who can make it fail.
 *
 * A failure to claim FAILS CLOSED: the caller charges normally. Being
 * charged for a run that should have been free is a support ticket; a
 * free run per request is a bill.
 */
export async function claimFreeActivationRun(userId: string): Promise<boolean> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("claim_activation_run", { target_user_id: userId });
    if (error) {
      logApiError("import:activation", error, { stage: "claim" });
      return false;
    }
    return data === true;
  } catch (err) {
    logApiError("import:activation", err, { stage: "claim" });
    return false;
  }
}

/** Whether the free run is still available, for display only. Never used
 *  to decide billing — that is what the claim above is for, and a read
 *  here followed by a write elsewhere is the race it exists to close. */
export async function activationAvailable(userId: string): Promise<boolean> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("user_onboarding")
      .select("activation_used_at")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) {
      logApiError("import:activation", error, { stage: "read" });
      return false;
    }
    return !data || data.activation_used_at === null;
  } catch {
    return false;
  }
}
