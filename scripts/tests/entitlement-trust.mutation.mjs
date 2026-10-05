#!/usr/bin/env node
/*
 * CAN entitlement-trust.test.mjs SEE A FIXED ACCESS CHECK COME UNDONE?
 *
 * Each mutant puts one of the 2026-10-05 fixes back the way it was, or
 * blinds the gate's own scan:
 *
 *   1. a key the billing code reads drops off the migration's list
 *   2. the guard fences every role but Supabase Auth's
 *   3. signup asks Supabase Auth for the starting plan again
 *   4. the beta code gets a default in the source again
 *   5. signup accepts a code when none is configured
 *   6. overage no longer asks for a subscription
 *   7. the plan sync no longer skips an add-on
 *   8. the scheduled-runs cron no longer checks the mission's owner
 *   9. the create job downloads every path it was handed
 *  10. a security header goes missing
 *  11. the framework announces itself again
 *  12. a hand-off secret is compared with === again
 *  13. the billing scan reads no files, so section 1 checks nothing
 *
 * Run: node scripts/tests/entitlement-trust.mutation.mjs
 */
import { runMutations } from "./lib/mutation-runner.mjs";

const GATE = "scripts/tests/entitlement-trust.test.mjs";
const MIGRATION = "supabase/migrations/20261010000000_guard_entitlement_metadata.sql";
const SIGNUP = "src/app/api/signup/route.ts";
const BETA = "src/lib/beta.ts";
const OVERAGE = "src/app/api/billing/overage/route.ts";
const WEBHOOK = "src/app/api/webhooks/stripe/route.ts";
const CRON = "src/app/api/cron/scheduled-runs/route.ts";
const CREATE_JOB = "src/lib/jobs/handlers/create.ts";
const CONFIG = "next.config.mjs";
const JOBS_CONTINUE = "src/app/api/jobs/[id]/continue/route.ts";

// Top-level declaration under the name the reader looks for — see the
// SHAPE note in scripts/tests/lib/mutation-runner.mjs.
const MUTANTS = [
  {
    name: "a key the billing code reads drops off the list",
    file: MIGRATION,
    from: "    'billing_interval',\n",
    to: "",
    expect: "every one is on the server-only list",
  },
  {
    name: "the guard fences every role but Supabase Auth's",
    file: MIGRATION,
    from: "if current_user <> 'supabase_auth_admin' then",
    to: "if current_user = 'supabase_auth_admin' then",
    expect: "the guard fences Supabase Auth's own role",
  },
  {
    name: "signup asks Supabase Auth for the starting plan again",
    file: SIGNUP,
    from: "        terms_accepted_at: new Date().toISOString(),\n",
    to: '        terms_accepted_at: new Date().toISOString(),\n        subscription_tier: isValidBetaCode ? "ultimate" : "free",\n',
    expect: "it asks Supabase Auth for no entitlement key",
  },
  {
    name: "the beta code gets a default in the source again",
    file: BETA,
    from: "return code ? code : null;",
    to: 'return code ? code : "MUTANTCODE";',
    expect: "the code is the environment's or nothing",
  },
  {
    name: "signup accepts a code when none is configured",
    file: SIGNUP,
    from: "const isValidBetaCode = Boolean(betaCode && inviteCode && inviteCode === betaCode);",
    to: "const isValidBetaCode = Boolean(inviteCode && inviteCode === betaCode);",
    expect: "signup refuses every code when none is set",
  },
  {
    name: "overage no longer asks for a subscription",
    file: OVERAGE,
    from: '    if (!isSubscriber) return NextResponse.json({ error: "needs_subscription" }, { status: 403 });\n',
    to: "",
    expect: "switching overage on refuses an account with no subscription",
  },
  {
    name: "the plan sync no longer skips an add-on",
    file: WEBHOOK,
    from: "  if (subscription.metadata?.addon_slug) return;\n",
    to: "",
    expect: "the plan sync returns on an add-on subscription",
  },
  {
    name: "the scheduled-runs cron no longer checks the mission's owner",
    file: CRON,
    from: "if (missionError || !mission || (mission as { user_id?: string }).user_id !== run.user_id) {",
    to: "if (missionError || !mission) {",
    expect: "a scheduled run whose mission is someone else's is refused",
  },
  {
    name: "the create job downloads every path it was handed",
    file: CREATE_JOB,
    from: 'await downloadAttachmentImages(admin, ownPaths, "jobs:create")',
    to: 'await downloadAttachmentImages(admin, imagePaths, "jobs:create")',
    expect: "attachment paths are filtered to the account's folder",
  },
  {
    name: "a security header goes missing",
    file: CONFIG,
    from: '  { key: "X-Content-Type-Options", value: "nosniff" },\n',
    to: "",
    expect: "no content-type guessing",
  },
  {
    name: "the framework announces itself again",
    file: CONFIG,
    from: "  poweredByHeader: false,",
    to: "  poweredByHeader: true,",
    expect: "the framework is not announced",
  },
  {
    name: "a hand-off secret is compared with === again",
    file: JOBS_CONTINUE,
    from: "secretsMatch(presented, expected)",
    to: "presented === expected",
    expect: "compared with secretsMatch",
  },
  {
    name: "the billing scan reads no files, so section 1 checks nothing",
    file: GATE,
    from: 'const BILLING_FILES = ["src/lib/beta.ts", ...BILLING_DIRS.flatMap((d) => walk(d))];',
    to: "const BILLING_FILES = [];",
    expect: "the scan found the billing code's reads",
  },
];

runMutations({
  name: "entitlement-trust",
  gate: GATE,
  targets: [GATE, MIGRATION, SIGNUP, BETA, OVERAGE, WEBHOOK, CRON, CREATE_JOB, CONFIG, JOBS_CONTINUE],
  mutants: MUTANTS,
});
