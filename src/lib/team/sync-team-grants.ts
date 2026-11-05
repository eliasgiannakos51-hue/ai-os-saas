import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { mergeUserMetadata } from "@/lib/auth/user-metadata";
import { logApiError } from "@/lib/log-error";
import { splitTeamGrants, teamSeatLimit, type TeamMemberRow } from "@/lib/team/team-grant-policy";

export type TeamGrantSync = {
  /** Active team_members rows — never changed by this function. */
  members: number;
  /** Members holding this owner's grant before and after the sync. */
  grantedBefore: number;
  grantedAfter: number;
  /** Grants moved to the owner's new tier. */
  restamped: number;
  /** Grants taken back (plan without team, or more members than seats). */
  revoked: number;
};

/**
 * THE TEAM FOLLOWS THE OWNER'S PLAN (2026-11-05, ΑΣ-1.16).
 *
 * Called by the Stripe webhook on every sync of an owner whose
 * subscription is live; the not-live case is revokeTeamGrants
 * (lib/team/revoke-team-grants.ts), which takes every grant back. The
 * decision is lib/team/team-grant-policy.ts; this only reads and writes.
 *
 * NOBODY LOSES ANYTHING BUT THE LENT PLAN. Only team_granted_tier and
 * team_owner_id move; the member's own plan, their data and their
 * team_members row are untouched, and the counts before and after are
 * returned for the webhook's log. A member whose grant came from a
 * DIFFERENT owner is left alone. Each member who loses the grant is told,
 * and so is the owner, once per sync.
 *
 * Never throws: a team sync failing must not fail the owner's own billing.
 */
export async function syncTeamGrants(
  ownerId: string,
  owner: { tier: string; seatCount: number; active: boolean }
): Promise<TeamGrantSync> {
  const outcome: TeamGrantSync = { members: 0, grantedBefore: 0, grantedAfter: 0, restamped: 0, revoked: 0 };
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("team_members")
      .select("id, member_user_id, joined_at, invited_at")
      .eq("owner_id", ownerId)
      .eq("status", "active");
    if (error) {
      logApiError("team:sync-grants", error, { stage: "list_members", ownerId });
      return outcome;
    }
    const rows: TeamMemberRow[] = (data ?? []).map((r) => ({
      id: String(r.id),
      memberUserId: (r.member_user_id as string | null) ?? null,
      joinedAt: (r.joined_at as string | null) ?? null,
      invitedAt: (r.invited_at as string | null) ?? null,
    }));
    outcome.members = rows.length;

    const { keep, revoke } = splitTeamGrants(rows, teamSeatLimit(owner));
    const revokedIds: string[] = [];

    for (const [row, shouldHold] of [
      ...keep.map((r) => [r, true] as const),
      ...revoke.map((r) => [r, false] as const),
    ]) {
      const memberId = row.memberUserId!;
      const { data: memberData, error: readError } = await admin.auth.admin.getUserById(memberId);
      if (readError || !memberData?.user) {
        logApiError("team:sync-grants", readError ?? new Error("member not found"), { stage: "read_member" });
        continue;
      }
      const meta = memberData.user.user_metadata ?? {};
      const grantOwner = meta.team_owner_id;
      // Another owner's grant is that owner's to manage.
      if (grantOwner && grantOwner !== ownerId) continue;
      const holdsOurs = grantOwner === ownerId && typeof meta.team_granted_tier === "string";
      if (holdsOurs) outcome.grantedBefore += 1;

      if (shouldHold) {
        if (holdsOurs && meta.team_granted_tier === owner.tier) {
          outcome.grantedAfter += 1;
          continue;
        }
        const merged = await mergeUserMetadata(
          memberId,
          { team_granted_tier: owner.tier, team_owner_id: ownerId },
          { context: "team:sync-grants" }
        );
        if (merged) {
          outcome.grantedAfter += 1;
          outcome.restamped += 1;
        } else {
          logApiError("team:sync-grants", new Error("merge_user_metadata failed"), { stage: "restamp" });
          if (holdsOurs) outcome.grantedAfter += 1;
        }
        continue;
      }

      if (!holdsOurs) continue;
      const merged = await mergeUserMetadata(memberId, {}, {
        remove: ["team_owner_id", "team_granted_tier"],
        context: "team:sync-grants",
      });
      if (merged) {
        outcome.revoked += 1;
        revokedIds.push(memberId);
      } else {
        logApiError("team:sync-grants", new Error("merge_user_metadata failed"), { stage: "revoke" });
        outcome.grantedAfter += 1;
      }
    }

    if (revokedIds.length > 0) {
      const { dispatchNotification } = await import("@/lib/notify/dispatch");
      for (const memberId of revokedIds) {
        await dispatchNotification({
          userId: memberId,
          type: "error_needs_attention",
          title: "Your team plan access has ended",
          body:
            "The team owner's plan no longer covers your seat, so you are back on your own plan. " +
            "Nothing of yours was deleted — ask the owner to add a seat, or choose a plan yourself.",
          url: "/dashboard/settings",
          facts: { actionable: true },
        });
      }
      await dispatchNotification({
        userId: ownerId,
        type: "error_needs_attention",
        title: `${revokedIds.length} team member${revokedIds.length === 1 ? "" : "s"} lost access to your plan`,
        body:
          "Your plan now has fewer team seats than active members, so the most recently added lost the plan's features. " +
          "Their work is untouched. Add seats or change plan and they get access back.",
        url: "/dashboard/team",
        facts: { actionable: true },
      });
    }
  } catch (err) {
    logApiError("team:sync-grants", err, { stage: "unhandled", ownerId });
  }
  return outcome;
}
