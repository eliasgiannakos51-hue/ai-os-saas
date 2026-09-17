#!/usr/bin/env node
/*
 * CAN charged-party.test.mjs SEE A STRANGER GET THE BILL?
 *
 * Every mutant below keeps the amount right, the margin intact and the
 * receipt accurate. billing-coverage, charge-sees-input, credit-flow and
 * credit-visibility all stay green: they ask HOW MUCH, and how much is
 * still correct. The account is what changed.
 *
 *   1. running an agent bills the agent's OWNER instead of the person who
 *      pressed the button. One character.
 *   2. the same shape at a reservation rather than a job.
 *   3. a grant moves onto an ordinary authenticated route, which is a way
 *      to mint credits for any account a request can name.
 *   4. the badge renewal charges a different row's owner.
 *   5. the agent-run route stops settling ownership through RLS before it
 *      charges — the two ids are both in scope there, which is what makes
 *      that route the one worth naming.
 *
 * Run: node scripts/tests/charged-party.mutation.mjs
 */
import { runMutations } from "./lib/mutation-runner.mjs";

const GATE = "scripts/tests/charged-party.test.mjs";
const RUN = "src/app/api/agents/[id]/run/route.ts";
const CODING = "src/app/api/coding/run/route.ts";
const SIGNUP = "src/app/api/signup/route.ts";
const RENEWAL = "src/lib/publishing/badge-renewal.ts";

const MUTANTS = [
  {
    name: "running an agent bills the agent's owner instead of the caller",
    file: RUN,
    from: "      userId: user.id,",
    to: "      userId: agent.user_id,",
    expect: "charged to the caller",
  },
  {
    name: "a code run is reserved against somebody else",
    file: CODING,
    from: "await reserveCredits(user.id, estimate.reserveCredits, \"code_assist\"",
    to: "await reserveCredits(body.userId, estimate.reserveCredits, \"code_assist\"",
    expect: "charged to the caller",
  },
  {
    name: "a grant appears where a request can name the account",
    file: CODING,
    from: "  const supabase = createClient();",
    to: "  await grantCredits(body.userId, 1000, \"gift\");\n  const supabase = createClient();",
    expect: "grants credits to an account a request named",
  },
  {
    name: "the badge renewal charges a different row's owner",
    file: RENEWAL,
    from: "        const bought = await purchaseRemoval({\n          userId: row.userId,",
    to: "        const bought = await purchaseRemoval({\n          userId: otherRow.userId,",
    expect: "charged to the caller",
  },
  {
    name: "the agent-run route stops settling ownership before it charges",
    file: RUN,
    from: '      .eq("id", agentId)',
    to: '      .eq("id", String(agentId))',
    expect: "after RLS has settled whose agent it is",
  },
];

runMutations({
  name: "charged-party",
  gate: GATE,
  targets: [RUN, CODING, SIGNUP, RENEWAL],
  mutants: MUTANTS,
});
