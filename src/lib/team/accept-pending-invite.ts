import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPlan } from "@/lib/billing/plans";
import { logApiError } from "@/lib/log-error";

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

    const { data: memberData } = await admin.auth.admin.getUserById(userId);
    const { error: updateUserError } = await admin.auth.admin.updateUserById(userId, {
      user_metadata: {
        ...memberData?.user?.user_metadata,
        subscription_tier: ownerTier,
        team_owner_id: pending.owner_id,
      },
    });
    if (updateUserError) {
      logApiError("accept-pending-invite", updateUserError, { stage: "update_user" });
    }
  } catch (err) {
    logApiError("accept-pending-invite", err);
  }
}
