import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPlan } from "@/lib/billing/plans";
import { logApiError } from "@/lib/log-error";
import { mergeUserMetadata } from "@/lib/auth/user-metadata";

// Best-effort, called on every dashboard page load (see dashboard/layout.tsx)
// for the currently logged-in user. A no-op for the overwhelming majority
// of requests — only does anything when this exact email has a pending
// ('invited') row in team_members. Uses the admin client since this reads/
// writes another user's (the owner's) data, which RLS would otherwise block.
export async function acceptPendingTeamInvite(userId: string, email: string): Promise<void> {
  if (!email) return;

  try {
    const admin = createAdminClient();

    const { data: pending, error: pendingError } = await admin
      .from("team_members")
      .select("id, owner_id")
      .eq("member_email", email.toLowerCase())
      .eq("status", "invited")
      .maybeSingle();

    if (pendingError || !pending) return;

    const { data: ownerData, error: ownerError } = await admin.auth.admin.getUserById(
      pending.owner_id
    );
    const ownerTier = ownerData?.user?.user_metadata?.subscription_tier as string | undefined;
    if (ownerError || !ownerTier || !getPlan(ownerTier)?.capabilities.teamCollaboration) return;

    const { error: updateInviteError } = await admin
      .from("team_members")
      .update({
        member_user_id: userId,
        status: "active",
        joined_at: new Date().toISOString(),
      })
      .eq("id", pending.id);
    if (updateInviteError) {
      logApiError("accept-pending-invite", updateInviteError, { stage: "update_invite" });
      return;
    }

    // THE GRANT GOES IN ITS OWN FIELD. It used to be written over
    // `subscription_tier` — the member's OWN plan — which destroyed the
    // only record that they paid for anything. Two consequences, both
    // silent: a member on a higher plan than the owner was downgraded the
    // moment they accepted, and leaving the team later wrote "free" over a
    // subscription Stripe was still charging for.
    //
    // resolvePlanSlug now returns the HIGHER of the two, so a grant can
    // only ever add.
    // Two keys, merged in one statement. The read that used to precede this
    // existed only to be spread back over the write, and that spread is what
    // made a concurrent Stripe webhook able to undo the grant — or be undone
    // by it. There is nothing to read here any more.
    const merged = await mergeUserMetadata(
      userId,
      { team_granted_tier: ownerTier, team_owner_id: pending.owner_id },
      { context: "accept-pending-invite" }
    );
    if (!merged) {
      logApiError("accept-pending-invite", new Error("merge_user_metadata failed"), {
        stage: "update_user",
      });
    }
  } catch (err) {
    logApiError("accept-pending-invite", err);
  }
}
