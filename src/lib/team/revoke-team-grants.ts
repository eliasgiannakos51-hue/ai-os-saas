import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { mergeUserMetadata } from "@/lib/auth/user-metadata";
import { logApiError } from "@/lib/log-error";

/**
 * WHEN THE OWNER STOPS PAYING, THE TEAM GRANT ENDS WITH THE PAID PERIOD
 * (NEEDS 24, ΑΣ-1.7, the owner's decision of 2026-10-05).
 *
 * Called by the Stripe webhook when an owner's subscription stops being
 * active: Stripe deletes a subscription cancelled at period end ON that
 * end, and a renewal that is not paid leaves it past_due — so this runs
 * when the period the owner paid for is over, not when they click cancel.
 *
 * What it does, and only this: removes team_granted_tier and team_owner_id
 * from each member whose grant came from THIS owner. Their own plan
 * (subscription_tier) is untouched, so they fall back to it or to Free
 * (lib/billing/plan-resolution.ts reads the higher of the two). Nothing
 * of theirs is deleted, and the team_members row stays, so the owner sees
 * who was on the team.
 *
 * Returns how many grants were taken back, for the webhook's log.
 */
export async function revokeTeamGrants(ownerId: string): Promise<number> {
  const admin = createAdminClient();
  const { data: members, error } = await admin
    .from("team_members")
    .select("member_user_id")
    .eq("owner_id", ownerId)
    .eq("status", "active");
  if (error) {
    logApiError("team:revoke-grants", error, { stage: "list_members", ownerId });
    return 0;
  }

  let revoked = 0;
  for (const row of members ?? []) {
    const memberId = row.member_user_id as string | null;
    if (!memberId) continue;
    const { data: memberData, error: readError } = await admin.auth.admin.getUserById(memberId);
    if (readError || !memberData?.user) {
      logApiError("team:revoke-grants", readError ?? new Error("member not found"), { stage: "read_member" });
      continue;
    }
    // Only a grant THIS owner gave: a member who has since joined another
    // team keeps that one.
    if (memberData.user.user_metadata?.team_owner_id !== ownerId) continue;
    const merged = await mergeUserMetadata(memberId, {}, {
      remove: ["team_owner_id", "team_granted_tier"],
      context: "team:revoke-grants",
    });
    if (merged) revoked += 1;
    else logApiError("team:revoke-grants", new Error("merge_user_metadata failed"), { stage: "revoke" });
  }
  return revoked;
}
