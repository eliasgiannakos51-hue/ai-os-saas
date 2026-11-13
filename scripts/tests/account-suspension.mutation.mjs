#!/usr/bin/env node
/*
 * CAN account-suspension.test.mjs SEE A SUSPENSION STOP HOLDING?
 *
 * One mutant per wall (2026-11-05 review, A1): the rule, the ban, the
 * middleware, the dashboard's own fallback, three crons of three shapes,
 * the empty-set case of the crons' filter, and the database's key list.
 *
 * Run: node scripts/tests/account-suspension.mutation.mjs
 */
import { runMutations } from "./lib/mutation-runner.mjs";

const GATE = "scripts/tests/account-suspension.test.mjs";
const RULE = "src/lib/auth/suspension.ts";
const CRONLIB = "src/lib/auth/suspended-accounts.ts";
const ROUTE = "src/app/api/admin/suspend/route.ts";
const MW = "src/proxy.ts";
const LAYOUT = "src/app/dashboard/layout.tsx";
const AGENTS = "src/app/api/cron/agent-runs/route.ts";
const SCHEDULED = "src/app/api/cron/scheduled-runs/route.ts";
const DIGEST = "src/app/api/weekly-digest/route.ts";
const MIG = "supabase/migrations/20261115000000_account_suspension.sql";

const MUTANTS = [
  {
    name: "the rule stops reading app_metadata",
    file: RULE,
    from: "  if (user.app_metadata?.suspended === true) return true;",
    to: '  if (user.app_metadata?.suspended === "yes") return true;',
    expect: "app_metadata.suspended suspends",
  },
  {
    name: "a ban in force is not a suspension",
    file: RULE,
    from: "  return Number.isFinite(banned) && banned > now;",
    to: "  return Number.isFinite(banned) && banned < 0;",
    expect: "a ban in force suspends",
  },
  {
    name: "suspending stops banning",
    file: ROUTE,
    from: "        ban_duration: SUSPEND_BAN_DURATION,\n",
    to: "",
    expect: "suspending bans the account and writes app_metadata, in one call",
  },
  {
    name: "the middleware stops asking",
    file: MW,
    from: "  if (user && isSuspended(user)) {",
    to: "  if (user && isSuspended(null)) {",
    expect: "the middleware asks the rule, on the user it already fetched",
  },
  {
    name: "the middleware lets the API through",
    file: MW,
    from: '    if (path.startsWith("/api/")) {\n      return withRefreshedCookies(NextResponse.json({ ok: false, code: "account_suspended" }',
    to: '    if (path.startsWith("/api/never/")) {\n      return withRefreshedCookies(NextResponse.json({ ok: false, code: "account_suspended" }',
    expect: "...refuses every API call by code",
  },
  {
    name: "the dashboard's fallback stops asking",
    file: LAYOUT,
    from: '  if (isSuspended(user)) {\n    redirect("/suspended");',
    to: '  if (isSuspended(null)) {\n    redirect("/suspended");',
    expect: "src/app/dashboard/layout.tsx asks the rule",
  },
  {
    name: "the agents cron runs a suspended account's agents",
    file: AGENTS,
    from: '      .lte("next_run_at", nowIso)\n      .not("user_id", "in", suspendedIn(suspended))',
    to: '      .lte("next_run_at", nowIso)',
    expect: "/api/cron/agent-runs excludes suspended accounts from the work it picks",
  },
  {
    name: "the scheduled cron's second pick runs a suspended account's automations",
    file: SCHEDULED,
    from: '      .lte("next_run_at", nowIso)\n      .not("user_id", "in", suspendedIn(suspended))',
    to: '      .lte("next_run_at", nowIso)',
    expect: "/api/cron/scheduled-runs excludes suspended accounts from the work it picks",
  },
  {
    name: "the weekly digest mails a suspended account",
    file: DIGEST,
    from: "      if (!user.email || isSuspended(user)) continue;",
    to: "      if (!user.email) continue;",
    expect: "/api/weekly-digest excludes suspended accounts from the work it picks",
  },
  {
    name: "an empty set becomes an empty list, which PostgREST refuses",
    file: CRONLIB,
    from: '  return `(${ids.size > 0 ? [...ids].join(",") : "00000000-0000-0000-0000-000000000000"})`;',
    to: '  return `(${[...ids].join(",")})`;',
    expect: "an empty set excludes nobody",
  },
  {
    name: "the database lets the account clear one of the older keys",
    file: MIG,
    from: "    'suspended_at',\n    'suspended_by'\n",
    to: "    'suspended_at'\n",
    expect: "suspended_by is kept for the server",
  },
];

runMutations({
  name: "account-suspension",
  gate: GATE,
  targets: [RULE, CRONLIB, ROUTE, MW, LAYOUT, AGENTS, SCHEDULED, DIGEST, MIG],
  mutants: MUTANTS,
});
