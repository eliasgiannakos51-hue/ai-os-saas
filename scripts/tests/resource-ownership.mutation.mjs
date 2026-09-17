#!/usr/bin/env node
/*
 * CAN resource-ownership.test.mjs SEE A ROUTE SERVE SOMEBODY ELSE'S ROW?
 *
 * Every mutant here leaves auth.getUser() in place. That is the point:
 * this is the middle shape — not "the check is missing", not "the check
 * is wrong", but a check that answers a different question than the one
 * that matters. security-posture.test.mjs passes on all of them, because
 * it asks whether the route knows WHO is calling, and it still does.
 *
 *   1. a job is loaded by id with the admin client and the id comparison
 *      goes. Any signed-in account can continue any job.
 *   2. cancelling a website stops reading through the caller's own
 *      client, so RLS no longer decides whose site is being stopped.
 *   3. rls-coverage stops asserting the thing fifty routes lean on, and
 *      this file must notice that the half it leans on is gone. The
 *      policies THEMSELVES are mutated in rls-coverage.mutation.mjs,
 *      where the gate that reads them runs — a mutant belongs with the
 *      assertion it is meant to move, not with the one that cites it.
 *
 * Run: node scripts/tests/resource-ownership.mutation.mjs
 */
import { runMutations } from "./lib/mutation-runner.mjs";

const GATE = "scripts/tests/resource-ownership.test.mjs";
const CONTINUE = "src/app/api/jobs/[id]/continue/route.ts";
const CANCEL = "src/app/api/websites/[id]/cancel/route.ts";
const RLS_GATE = "scripts/tests/rls-coverage.test.mjs";

const MUTANTS = [
  {
    name: "a job loaded by the admin client stops being compared to its owner",
    file: CONTINUE,
    from: "      if (user.id !== job.user_id) {",
    to: "      if (false) {",
    expect: "establishes ownership first",
  },
  {
    name: "cancelling a website stops reading through the caller's own client",
    file: CANCEL,
    from: "    const supabase = createClient();",
    to: "    const supabase = createAdminClient();",
    expect: "establishes ownership first",
  },
  {
    name: "the RLS gate stops asserting the half fifty routes lean on",
    file: RLS_GATE,
    from: '  "every policy scopes its rows to auth.uid(), or says why it does not",',
    to: '  "every policy is fine",',
    expect: "asserts policies scope to auth.uid()",
  },
];

runMutations({
  name: "resource-ownership",
  gate: GATE,
  targets: [CONTINUE, CANCEL, RLS_GATE],
  mutants: MUTANTS,
});
