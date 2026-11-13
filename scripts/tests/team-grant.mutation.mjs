#!/usr/bin/env node
/*
 * CAN team-grant.test.mjs SEE A TEAM GRANT OUTLIVE THE OWNER'S PAYMENT?
 *
 * NEEDS 24 (2026-10-05): when an owner's subscription stops being active,
 * the members' team grants go with it — and only the grants.
 *
 * ΑΣ-1.16 (2026-11-05): and while it is active, the grants follow the
 * owner's plan — its tier, its team capability and its seats.
 *
 * Run: node scripts/tests/team-grant.mutation.mjs
 */
import { runMutations } from "./lib/mutation-runner.mjs";

const GATE = "scripts/tests/team-grant.test.mjs";
const HOOK = "src/app/api/webhooks/stripe/route.ts";
const REVOKE = "src/lib/team/revoke-team-grants.ts";
const POLICY = "src/lib/team/team-grant-policy.ts";
const SYNC = "src/lib/team/sync-team-grants.ts";
const ACCEPT = "src/lib/team/accept-pending-invite.ts";

const MUTANTS = [
  {
    name: "the webhook stops revoking when the owner's subscription ends",
    file: HOOK,
    from: "  if (!isActive) {\n    const revoked = await revokeTeamGrants(supabaseUserId);",
    to: "  if (false) {\n    const revoked = await revokeTeamGrants(supabaseUserId);",
    expect: "takes the members' grants with it",
  },
  {
    name: "a grant from another team is taken back too",
    file: REVOKE,
    from: "    if (memberData.user.user_metadata?.team_owner_id !== ownerId) continue;\n",
    to: "",
    expect: "only a grant THIS owner gave is taken back",
  },
  {
    name: "the member's own plan is removed with the grant",
    file: REVOKE,
    from: 'remove: ["team_owner_id", "team_granted_tier"],',
    to: 'remove: ["team_owner_id", "team_granted_tier", "subscription_tier"],',
    expect: "never the member's own plan",
  },
  // ΑΣ-1.16 (2026-11-05): the grant follows the owner's plan.
  {
    name: "a live owner's sync no longer touches the team",
    file: HOOK,
    from: "    const team = await syncTeamGrants(supabaseUserId, { tier: planSlug, seatCount, active: true });",
    to: "    const team = { members: 0, grantedBefore: 0, grantedAfter: 0, restamped: 0, revoked: 0 };",
    expect: "a live owner's every sync re-stamps the team",
  },
  {
    name: "over the seats, the newest members keep the grant",
    file: POLICY,
    from: "  return { keep: ordered.slice(0, seats), revoke: ordered.slice(seats) };",
    to: "  return { keep: ordered.slice(-seats || ordered.length), revoke: ordered.slice(0, ordered.length - seats) };",
    expect: "the earliest to join keep the grant",
  },
  {
    name: "a per-seat plan lends to members nobody paid a seat for",
    file: POLICY,
    from: "  const paid = plan.teamSeatsIncluded ? Number.POSITIVE_INFINITY : Math.max(0, Math.floor(owner.seatCount) || 0);",
    to: "  const paid = Number.POSITIVE_INFINITY;",
    expect: "Professional lends what was paid for",
  },
  // NOT MUTATED: dropping the teamCollaboration test in teamSeatLimit.
  // Measured 2026-11-05 as EQUIVALENT under the shipped seat table —
  // every plan without team has a seat ceiling of 0 in
  // lib/team/seat-limits.ts, so min(0, paid) is 0 either way and no gate
  // could tell. It only differs if SEAT_LIMIT_<PLAN> is set for such a plan.
  {
    name: "a kept member keeps the OLD tier",
    file: SYNC,
    from: "          { team_granted_tier: owner.tier, team_owner_id: ownerId },",
    to: "          { team_owner_id: ownerId },",
    expect: "re-stamps a kept member to the owner's current tier",
  },
  {
    name: "accepting ignores the seats the owner has now",
    file: ACCEPT,
    from: "      if (countError || (count ?? 0) >= seatLimit) return;",
    to: "      if (countError) return;",
    expect: "accepting an invitation respects the seats",
  },
];

runMutations({ name: "team-grant", gate: GATE, targets: [HOOK, REVOKE, POLICY, SYNC, ACCEPT], mutants: MUTANTS });
