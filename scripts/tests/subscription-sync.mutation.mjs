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
    from: '  if (input.previousTier === null) return "reset";\n  const direction = comparePlanSlugs(input.nextTier, input.previousTier);\n  if (direction < 0) return "clamp";\n  if (direction > 0) return "reset";\n  return "skip";',
    to: '  return "reset";',
    expect: "cancel_at_period_end on starter does not touch the balance",
  },
  {
    // 2. THE INVERSE, and it is the quieter of the two: a paid renewal
    // stops opening a new period, so a customer pays and receives nothing.
    // Nothing errors; the balance simply never rises.
    name: "a renewal stops opening a new period",
    file: SYNC,
    from: 'const NEW_PERIOD_INVOICE_REASONS = new Set(["subscription_cycle", "subscription_create"]);',
    to: 'const NEW_PERIOD_INVOICE_REASONS = new Set(["subscription_create"]);',
    expect: "a paid renewal opens a new period",
  },
  {
    // 3. THE TIER COMPARISON IS INVERTED. A real upgrade is treated as no
    // change, so the customer keeps the old, smaller allowance they just
    // paid to leave.
    name: "an upgrade is read as no change",
    file: SYNC,
    from: '  if (direction > 0) return "reset";\n  return "skip";',
    to: '  if (direction > 0) return "skip";\n  return "skip";',
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
    from: '  if (input.eventType === "customer.subscription.deleted") return "clamp";\n',
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
    from: "  const decision = creditSyncDecision({ eventType, previousTier, nextTier: planSlug, billingReason });",
    to: '  const decision = "reset";',
    expect: "...and calls it",
  },
  {
    // 7. THE DOWNGRADE REFILL (2026-11-05). A move down resets again,
    // which SETS a spent higher-plan balance to the lower plan's full one.
    name: "a downgrade resets the balance again",
    file: SYNC,
    from: '  if (direction < 0) return "clamp";',
    to: '  if (direction < 0) return "reset";',
    expect: "a downgrade lowers the balance and never refills it",
  },
  {
    // 8. A PRORATION INVOICE COUNTS AS A NEW PERIOD again: every paid
    // invoice opens a balance, whatever it was for.
    name: "every paid invoice opens a period, whatever its reason",
    file: SYNC,
    from: '  return input.eventType === "invoice.paid" && NEW_PERIOD_INVOICE_REASONS.has(String(input.billingReason ?? ""));',
    to: '  return input.eventType === "invoice.paid";',
    expect: "a proration invoice is not a new period",
  },
  {
    // 9. THE KEY GOES BACK TO THE CALENDAR: the webhook stops passing the
    // period, so one period straddling the 1st has two keys again.
    name: "the webhook keys the reset on the month again",
    file: WEBHOOK,
    from: "          `Subscription ${isActive ? \"active\" : \"ended\"}: ${planSlug} plan`,\n          periodKey\n        );",
    to: "          `Subscription ${isActive ? \"active\" : \"ended\"}: ${planSlug} plan`\n        );",
    expect: "the reset is claimed under the paid period",
  },
  {
    // 10. A CLAMP DECISION THAT DOES NOTHING. The decision is right and
    // the webhook drops it on the floor, leaving the higher balance.
    name: "the webhook ignores the clamp decision",
    file: WEBHOOK,
    from: "      await clampCreditsToPlan(\n        supabaseUserId,",
    to: "      await Promise.resolve(\n        supabaseUserId,",
    expect: "a move down runs the clamp, not the reset",
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
console.log("Resetting a paid balance on an event that is not a plan change, or refilling it on a move down, turns this red.");
