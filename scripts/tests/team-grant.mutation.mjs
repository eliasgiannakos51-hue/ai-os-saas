#!/usr/bin/env node
/*
 * CAN team-grant.test.mjs SEE A TEAM GRANT OUTLIVE THE OWNER'S PAYMENT?
 *
 * NEEDS 24 (2026-10-05): when an owner's subscription stops being active,
 * the members' team grants go with it — and only the grants.
 *
 * Run: node scripts/tests/team-grant.mutation.mjs
 */
import { runMutations } from "./lib/mutation-runner.mjs";

const GATE = "scripts/tests/team-grant.test.mjs";
const HOOK = "src/app/api/webhooks/stripe/route.ts";
const REVOKE = "src/lib/team/revoke-team-grants.ts";

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
];

runMutations({ name: "team-grant", gate: GATE, targets: [HOOK, REVOKE], mutants: MUTANTS });
