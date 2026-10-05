#!/usr/bin/env node
/*
 * CAN login-failure-alert.test.mjs SEE THE OWNER STOP HEARING ABOUT A
 * WAVE OF FAILED SIGN-INS, OR AN ADDRESS GET WRITTEN TO THE LOG?
 *
 * Run: node scripts/tests/login-failure-alert.mutation.mjs
 */
import { runMutations } from "./lib/mutation-runner.mjs";

const GATE = "scripts/tests/login-failure-alert.test.mjs";
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
