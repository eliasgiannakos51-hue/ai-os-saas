#!/usr/bin/env node
/*
 * CAN plan-reset-idempotent.test.mjs SEE THE MONTHLY REFILL GO BACK TO
 * BEING FREE MONEY?
 *
 * reset_monthly_credits SETS the balance to monthly + purchased, so a
 * second run inside one billing period hands back everything spent in
 * between. Each mutant removes one part of the guard that stops it, and
 * one removes the part that keeps the guard from becoming a different
 * bug — an upgrade blocked by its own month's claim.
 *
 * Run: node scripts/tests/plan-reset-idempotent.mutation.mjs
 */
import { runMutations } from "./lib/mutation-runner.mjs";

const GATE = "scripts/tests/plan-reset-idempotent.test.mjs";
const CREDITS = "src/lib/billing/credits.ts";

const MUTANTS = [
  {
    name: "the reset is claimed with no key at all, as it was",
    file: CREDITS,
    from: "    idempotency_key: resetKey,\n",
    to: "",
    expect: "the second does not",
  },
  {
    // The `to` must DROP the throw as well. Leaving it reachable made a
    // replay raise instead of double-resetting, so the gate died with no
    // FAIL line and the runner called it a hole — the mutant was wrong,
    // not the gate.
    name: "a duplicate claim is ignored and the reset runs anyway",
    file: CREDITS,
    from: '    if (claimError.code === "23505") return;\n    throw claimError;',
    to: '    if (claimError.code === "23505") { /* ignored */ } else throw claimError;',
    expect: "the second does not",
  },
  {
    // The guard turning into a different bug: keyed by month alone, an
    // upgrade inside that month finds the claim taken and the customer
    // who just paid for Growth keeps Starter's balance.
    name: "the key drops the plan, so an upgrade is blocked by its own month",
    file: CREDITS,
    from: "const resetKey = `plan_reset:${userId}:${planSlug}:${creditMonthKey()}`;",
    to: "const resetKey = `plan_reset:${userId}:${creditMonthKey()}`;",
    expect: "both plans reset",
  },
  {
    name: "the claim is taken AFTER the reset, so the first run is unguarded",
    file: CREDITS,
    from: "  if (resetError) {\n    await admin.from(\"credit_transactions\").delete().eq(\"idempotency_key\", resetKey);\n    throw resetError;\n  }",
    to: "  if (resetError) throw resetError;",
    expect: "the claim was released",
  },
];

runMutations({ name: "plan-reset-idempotent", gate: GATE, targets: [CREDITS], mutants: MUTANTS });
