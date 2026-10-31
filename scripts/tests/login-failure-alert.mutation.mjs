#!/usr/bin/env node
/*
 * CAN login-failure-alert.test.mjs SEE THE OWNER STOP HEARING ABOUT A
 * WAVE OF FAILED SIGN-INS, OR AN ADDRESS GET WRITTEN TO THE LOG?
 *
 * Run: node scripts/tests/login-failure-alert.mutation.mjs
 */
import { runMutations } from "./lib/mutation-runner.mjs";

const GATE = "scripts/tests/login-failure-alert.test.mjs";
// The real-Postgres behavioural proof for this same fix lives in
// scripts/tests/login-account-block.itest.mjs — it does not take a
// mutant gate here because it drives countRateLimitHits/recordRateLimitHit
// directly rather than this route, so a route-level mutant below would
// not reach it.
const ROUTE = "src/app/api/auth/login/route.ts";
const MOD = "src/lib/auth/login-failure-alert.ts";
const POLICY = "src/lib/auth/login-failure-policy.ts";

const MUTANTS = [
  {
    name: "the login route stops counting failures",
    file: ROUTE,
    from: "      await noteLoginFailure(email);\n",
    to: "",
    expect: "the failure branch counts it",
  },
  {
    // ΑΣ2-1.2. Deleting the whole guard (not just its condition) is what
    // makes this catchable by source: the NextResponse.json call this
    // test's §5 anchors on stops existing entirely, rather than merely
    // becoming unreachable.
    name: "the account block is removed — the wave the per-IP cap cannot see goes unblocked again",
    file: ROUTE,
    from: `    if (accountFailures.ok && accountFailures.count >= LOGIN_FAILURE_ALERT.accountThreshold) {
      // Same code, same status, same sentence as the IP block above —
      // deliberately indistinguishable. Supabase itself already answers
      // "wrong password" and "no such account" identically (matched below
      // by /invalid login credentials/i), so noteLoginFailure() increments
      // this same count for ANY email string that fails, real or not.
      // Giving this block its own wording would be the first thing in
      // this flow to say "this specific account exists and is locked."
      return NextResponse.json(
        { ok: false, code: "rate_limited", error: "Too many failed login attempts. Please try again later." },
        { status: 429 }
      );
    }

`,
    to: "",
    expect: "the account check runs before Supabase Auth is ever called",
  },
  {
    name: "the account block reads a second, hardcoded threshold that can drift from the alert's own",
    file: ROUTE,
    from: "accountFailures.count >= LOGIN_FAILURE_ALERT.accountThreshold",
    to: "accountFailures.count >= 20",
    expect: "one number, not two that can drift",
  },
  {
    name: "the account block's response names the account as the reason, leaking which cap was hit",
    file: ROUTE,
    from: '{ ok: false, code: "rate_limited", error: "Too many failed login attempts. Please try again later." },\n        { status: 429 }\n      );\n    }\n\n    const supabase',
    to: '{ ok: false, code: "account_locked", error: "This account has too many failed login attempts." },\n        { status: 429 }\n      );\n    }\n\n    const supabase',
    expect: "the IP block and the account block answer with the exact same body",
  },
  {
    name: "the account is logged by its address",
    file: MOD,
    from: "recordRateLimitHit({ scope: c.accountScope, identifier: account })",
    to: "recordRateLimitHit({ scope: c.accountScope, identifier: email })",
    expect: "never the address",
  },
  {
    name: "a site-wide wave never alerts",
    file: POLICY,
    from: '  if (counts.global !== null && counts.global >= c.globalThreshold) due.push("global");',
    to: '  if (false) due.push("global");',
    expect: "a site-wide wave alerts",
  },
  {
    name: "an unreadable count is treated as a wave",
    file: POLICY,
    from: '  if (counts.account !== null && counts.account >= c.accountThreshold) due.push("account");',
    to: '  if (counts.account === null || counts.account >= c.accountThreshold) due.push("account");',
    expect: "rather than guessing",
  },
];

runMutations({ name: "login-failure-alert", gate: GATE, targets: [ROUTE, MOD, POLICY], mutants: MUTANTS });
