#!/usr/bin/env node
/*
 * CAN feature-flags.test.mjs SEE A SWITCH THAT LETS THE WRONG PEOPLE IN?
 *
 * Each mutant puts back one way a switch could fail the owner: 'staff'
 * opening to customers, 'off' still letting the owner in, the test account
 * not counted, a missing row reading as 'everyone', the switch writable by
 * anyone, the page reading the switches before its own owner check.
 *
 * Run: node scripts/tests/feature-flags.mutation.mjs
 */
import { runMutations } from "./lib/mutation-runner.mjs";

const GATE = "scripts/tests/feature-flags.test.mjs";
const LIB = "src/lib/flags/flags.ts";
const ROUTE = "src/app/api/system-health/flags/route.ts";

const MUTANTS = [
  {
    name: "'staff' opens to customers",
    file: LIB,
    from: '  if (audience === "staff") return staff;',
    to: '  if (audience === "staff") return true;',
    expect: "'staff' lets the owner in and a customer not",
  },
  {
    name: "'off' still lets the owner in",
    file: LIB,
    from: "  return false;\n}\n\n/** Every switch",
    to: "  return staff;\n}\n\n/** Every switch",
    expect: "'off' lets nobody in",
  },
  {
    name: "the test account is not counted as staff",
    file: LIB,
    from: "  return testers.includes(email.trim().toLowerCase());",
    to: "  return false;",
    expect: "the test account is staff",
  },
  {
    name: "a switch with no row opens to everyone",
    file: LIB,
    from: 'export const DEFAULT_AUDIENCE: FlagAudience = "staff";',
    to: 'export const DEFAULT_AUDIENCE: FlagAudience = "everyone";',
    expect: "a switch with no row reads as staff",
  },
  {
    name: "anyone signed in can turn a switch",
    file: ROUTE,
    from: "  if (!isAdminEmail(user.email)) return NextResponse.json({ ok: false }, { status: 404 });\n",
    to: "",
    expect: "a 404 to anyone but the owner",
  },
  {
    name: "any key from the request is written",
    file: ROUTE,
    from: "  if (!isFlagKey(body?.key) || !isFlagAudience(body?.audience)) {",
    to: "  if (!isFlagAudience(body?.audience)) {",
    expect: "only a declared key and a valid setting are written",
  },
];

runMutations({ name: "feature-flags", gate: GATE, targets: [LIB, ROUTE], mutants: MUTANTS });
