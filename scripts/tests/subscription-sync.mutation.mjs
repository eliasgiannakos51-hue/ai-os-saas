#!/usr/bin/env node
/*
 * THE BUG THAT DESTROYED PAID CREDITS, PUT BACK — six ways.
 *
 * `customer.subscription.updated` arrives for things that are not a plan
 * change: a seat added, a payment method swapped, and — the one that cost
 * money — a customer setting cancel_at_period_end. Resetting the balance
 * on that event throws away credits somebody had already paid for, during
 * the period they are still entitled to, in the same click where they
 * said they were leaving. There is no error and no ledger row that looks
 * wrong afterwards.
 *
 * creditSyncDecision is four lines. Four lines is exactly the size at
 * which a gate can look thorough over one branch — subscription-sync.
 * test.mjs asserts 252 combinations, and 252 combinations of a function
 * whose second clause has been deleted are still 252 green lines if the
 * gate only ever checks the first.
 *
 * EVERY MUTATION IS AN EDIT OF REAL CODE, never an `if (false)`:
 * scripts/check-mutation-markers.mjs fails the build on that literal, so a
 * mutation written that way is "caught" by the marker gate without any
 * behavioural check having looked at it.
 *
 * Run: node scripts/tests/subscription-sync.mutation.mjs
 */
import { readFileSync } from "node:fs";
import { writeFileSync } from "./lib/sidecar-write.mjs";
import { execFileSync } from "node:child_process";

const GATE = "scripts/tests/subscription-sync.test.mjs";
const SYNC = "src/lib/billing/subscription-sync.ts";
const WEBHOOK = "src/app/api/webhooks/stripe/route.ts";
const TARGETS = [SYNC, WEBHOOK];

const MUTANTS = [
  {
    // 1. THE DEFECT ITSELF. Every subscription event resets, which is
    // what the code did before this function existed.
    name: "every event resets the balance again",
    file: SYNC,
    from: '  if (input.previousTier === null) return "reset";\n  return input.previousTier === input.nextTier ? "skip" : "reset";',
    to: '  return "reset";',
    expect: "cancel_at_period_end on starter does not touch the balance",
  },
  {
    // 2. THE INVERSE, and it is the quieter of the two: a paid invoice
    // stops opening a new month, so a customer pays and receives nothing.
    // Nothing errors; the balance simply never rises.
    name: "an event that must reset stops resetting",
    file: SYNC,
    from: '  "invoice.paid",\n',
    to: "",
    expect: "a paid invoice opens a new month",
  },
  {
    // 3. THE TIER COMPARISON IS INVERTED. A real plan change is treated
    // as no change, so an upgrade leaves the customer on the old, smaller
    // allowance they just paid to leave.
    name: "a plan change is read as no change",
    file: SYNC,
    from: '  return input.previousTier === input.nextTier ? "skip" : "reset";',
    to: '  return input.previousTier === input.nextTier ? "reset" : "skip";',
    expect: "an upgrade through the same event still resets",
  },
  {
    // 4. AN ACCOUNT WITH NO RECORDED TIER IS SKIPPED. It has no balance
    // to protect, so skipping means a new customer starts at zero.
    name: "a first subscription with no recorded tier is skipped instead of granted",
    file: SYNC,
    from: '  if (input.previousTier === null) return "reset";',
    to: '  if (input.previousTier === null) return "skip";',
    expect: "an account with no recorded tier is initialised, not skipped",
  },
  {
    // 5. THE END OF A SUBSCRIPTION STOPS DROPPING TO FREE. The account
    // keeps the paid allotment for ever — the mirror of the money bug,
    // costing the owner rather than the customer.
    name: "a deleted subscription no longer drops to Free's allotment",
    file: SYNC,
    from: '  "customer.subscription.deleted",\n',
    to: "",
    expect: "a deleted subscription drops to Free's allotment",
  },
  {
    // 6. AND THE WIRING. The function can be perfect and never consulted:
    // the webhook calling syncCreditsForPlan unconditionally is exactly
    // the state this whole file was written about.
    // AND IT IS THE CALL SITE, NOT THE IMPORT. The first version of this
    // mutation renamed the first occurrence of `creditSyncDecision(`,
    // which is the import line, and the gate stayed green — because the
    // check it named was `/creditSyncDecision/`, satisfied by an import
    // that nothing consults. Both halves are asserted separately now.
    name: "the webhook stops consulting the decision and syncs unconditionally",
    file: WEBHOOK,
    from: "  const decision = creditSyncDecision({ eventType, previousTier, nextTier: planSlug });",
    to: '  const decision = "reset";',
    expect: "...and calls it",
  },
];

function runGate() {
  try {
    execFileSync(process.execPath, [GATE], { encoding: "utf8", stdio: "pipe", timeout: 600_000 });
    return { green: true, failed: [] };
  } catch (e) {
    const out = String(e.stdout ?? "") + String(e.stderr ?? "");
    return { green: false, failed: [...out.matchAll(/^ {2}FAIL {2}(.+)$/gm)].map((m) => m[1].trim()) };
  }
}

console.log("subscription-sync mutations\n");

const originals = new Map(TARGETS.map((f) => [f, readFileSync(f, "utf8")]));
const restoreAll = () => {
  for (const [file, text] of originals) writeFileSync(file, text);
};

let caught = 0;
const missed = [];
try {
  const base = runGate();
  console.log(`baseline: the gate is ${base.green ? "GREEN" : "RED"} on the unmutated tree`);
  if (!base.green) {
    console.log(`\nBASELINE IS RED — no mutation result below would mean anything.\n  ${base.failed.join("\n  ")}`);
    process.exit(1);
  }

  for (const m of MUTANTS) {
    if (!originals.get(m.file).includes(m.from)) {
      missed.push({ ...m, why: `the mutation target no longer exists in ${m.file}` });
      console.log(`  STALE   ${m.name}`);
      continue;
    }
    writeFileSync(m.file, originals.get(m.file).replace(m.from, m.to));
    let result;
    try {
      result = runGate();
    } finally {
      restoreAll();
    }
    if (result.green) {
      missed.push({ ...m, why: "the gate stayed green — nothing here is load-bearing" });
      console.log(`  MISSED  ${m.name}`);
      continue;
    }
    const onTarget = result.failed.filter((f) => f.includes(m.expect));
    if (onTarget.length === 0) {
      missed.push({ ...m, why: `red on "${result.failed.slice(0, 3).join('", "')}" — nothing matching "${m.expect}"` });
      console.log(`  WRONG   ${m.name}\n          -> red on: ${result.failed.slice(0, 3).join(" | ")}`);
      continue;
    }
    caught++;
    console.log(`  CAUGHT  ${m.name}\n          -> ${onTarget[0]}`);
  }
} finally {
  restoreAll();
}

const after = runGate();
console.log(
  after.green
    ? "\nbaseline: the gate is green again on the restored tree"
    : "\nBASELINE IS RED — a mutation was not restored. Check `git diff`."
);

console.log(`\n${caught} of ${MUTANTS.length} mutations caught.`);
if (missed.length > 0 || !after.green) {
  if (missed.length > 0) {
    console.log("\nHOLES:");
    for (const m of missed) console.log(`  - ${m.name}\n    ${m.why}`);
  }
  process.exit(1);
}
console.log("Resetting a paid balance on an event that is not a plan change turns this red.");
