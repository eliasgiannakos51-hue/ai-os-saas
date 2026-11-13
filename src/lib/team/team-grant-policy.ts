import { getPlan } from "@/lib/billing/plans";
import { maxSeatsForPlan } from "@/lib/team/seat-limits";
import type { PlanSlug } from "@/lib/billing/plans";

/**
 * WHAT A TEAM OWNER'S PLAN LENDS THE TEAM, RIGHT NOW (2026-11-05, ΑΣ-1.16).
 *
 * The pure half of lib/team/sync-team-grants.ts. A member's
 * team_granted_tier was copied from the owner once, when they accepted
 * (lib/team/accept-pending-invite.ts), and only ever taken back when the
 * owner's subscription stopped being active. An owner who moved DOWN kept
 * every member on the higher plan, and lib/billing/plan-resolution.ts
 * reads the higher of a member's own plan and their grant — so the lent
 * plan outlived the plan lending it.
 *
 * Now the grant follows the owner's plan on every subscription sync:
 *   - the owner's current tier, for as many members as the plan seats;
 *   - nothing, when the plan has no team collaboration or the owner has
 *     no live subscription;
 *   - when there are more members than seats, the EARLIEST to join keep
 *     theirs and the most recently added lose it first.
 *
 * Only the grant moves. A member's own plan, their data and the
 * team_members row are never touched, so an owner who adds seats or moves
 * back up gives the same people their access back on the next sync.
 */

/** How many members the owner's plan lends its tier to. */
export function teamSeatLimit(owner: { tier: string | null | undefined; seatCount: number; active: boolean }): number {
  if (!owner.active) return 0;
  const plan = owner.tier ? getPlan(owner.tier) : undefined;
  if (!plan || !plan.capabilities.teamCollaboration) return 0;
  // The two ceilings of api/team/invite: what the plan allows, and — on a
  // plan that charges per seat — what has been paid for.
  const planCap = maxSeatsForPlan(plan.slug as PlanSlug);
  const paid = plan.teamSeatsIncluded ? Number.POSITIVE_INFINITY : Math.max(0, Math.floor(owner.seatCount) || 0);
  return Math.min(planCap, paid);
}

export type TeamMemberRow = {
  id: string;
  memberUserId: string | null;
  joinedAt: string | null;
  invitedAt: string | null;
};

const time = (iso: string | null): number => {
  const t = iso ? new Date(iso).getTime() : Number.NaN;
  return Number.isFinite(t) ? t : Number.POSITIVE_INFINITY;
};

/**
 * Which members keep the lent tier and which lose it: the first `limit`
 * by join date keep it. Ties fall back to the invitation date and then
 * the row id, so the same team always splits the same way.
 */
export function splitTeamGrants(
  members: readonly TeamMemberRow[],
  limit: number
): { keep: TeamMemberRow[]; revoke: TeamMemberRow[] } {
  const ordered = members
    .filter((m) => typeof m.memberUserId === "string" && m.memberUserId.length > 0)
    .slice()
    .sort(
      (a, b) =>
        time(a.joinedAt) - time(b.joinedAt) ||
        time(a.invitedAt) - time(b.invitedAt) ||
        (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
    );
  const seats = Number.isFinite(limit) ? Math.max(0, Math.floor(limit)) : ordered.length;
  return { keep: ordered.slice(0, seats), revoke: ordered.slice(seats) };
}
