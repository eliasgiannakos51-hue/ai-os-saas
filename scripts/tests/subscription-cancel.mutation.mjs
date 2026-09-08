#!/usr/bin/env node
/*
 * LEAVING, AND THE FOUR WAYS IT TURNS INTO A PUNISHMENT.
 *
 * Cancelling a subscription is the one flow where every shortcut costs
 * the customer rather than the owner: ending access the same second
 * instead of at the period they paid for, gating the button on a survey,
 * letting a failed email roll back the cancellation, or recording that
 * they left before the cancellation actually happened.
 *
 * None of those is a crash. Each is a line that reads fine and behaves
 * badly exactly once per customer, on the way out, where nobody is
 * watching. So each is a mutation here.
 *
 * EVERY MUTATION IS AN EDIT OF REAL CODE, never an `if (false)`:
 * scripts/check-mutation-markers.mjs fails the build on that literal, so a
 * mutation written that way is "caught" by the marker gate without any
 * behavioural check having looked at it.
 *
 * Run: node scripts/tests/subscription-cancel.mutation.mjs
 */
import { readFileSync } from "node:fs";
import { writeFileSync } from "./lib/sidecar-write.mjs";
import { execFileSync } from "node:child_process";

const GATE = "scripts/tests/subscription-cancel.test.mjs";
const CANCEL = "src/app/api/billing/cancel/route.ts";
const RESUME = "src/app/api/billing/resume/route.ts";
const PANEL = "src/components/settings/cancel-subscription.tsx";
const SUMMARY = "src/components/settings/billing-summary.tsx";
const TARGETS = [...new Set([CANCEL, RESUME, PANEL, SUMMARY])];

const MUTANTS = [
  {
    // 1. CANCEL BECOMES CUT OFF. Stripe's subscriptions.cancel() ends it
    // the same second and refunds nothing — the customer paid for the
    // month and loses the rest of it.
    name: "cancel ends the subscription immediately instead of at the period end",
    file: CANCEL,
    from: "cancel_at_period_end: true",
    to: "cancel_at_period_end: false",
    expect: "cancel sets cancel_at_period_end",
  },
  {
    // 2. RESUME RE-SUBSCRIBES. Creating a subscription charges again, on
    // a click whose whole meaning is "I changed my mind, keep what I have".
    name: "resume creates a new subscription rather than clearing the flag",
    file: RESUME,
    from: "cancel_at_period_end: false",
    to: "cancel_at_period_end: true",
    expect: "resume clears the flag rather than re-subscribing",
  },
  {
    // 3. THE SURVEY BECOMES A GATE. Refusing to let somebody leave until
    // they say why is the dark pattern this gate exists to refuse.
    name: "the confirm button is disabled until a reason is chosen",
    file: PANEL,
    from: "onClick={confirm}",
    to: "disabled={!reason} onClick={confirm}",
    expect: "the confirm button is not disabled by a missing reason",
  },
  {
    // 4. THE SURVEY INSERT LOSES ITS CATCH, so a write to an unrelated
    // table can fail a cancellation the customer already paid for and
    // Stripe has already accepted.
    name: "recording the survey can fail the cancellation",
    file: CANCEL,
    from: "subscription_cancellations",
    to: "zz_survey_table_without_a_catch",
    expect: "recording the survey cannot fail the cancellation",
  },
  {
    // 5. AND THE ORDER INVERTS. Writing "they left" BEFORE the Stripe
    // call leaves the row behind when the call fails — a cancellation
    // that exists only in this product's own records.
    name: "the Stripe call is dropped and only the survey is recorded",
    file: CANCEL,
    from: "await stripe.subscriptions.update(subscriptionId, {",
    to: "await Promise.resolve(subscriptionId, {",
    expect: "the Stripe update happens before anything is recorded",
  },
  {
    // 6. A SECOND CONFIRMATION IS STACKED ON THE PANEL — "are you sure?"
    // twice, which is the pattern the panel was built to replace.
    name: "a window.confirm is stacked on top of the panel",
    file: PANEL,
    from: "onClick={confirm}",
    to: "onClick={() => window.confirm('Are you sure?') && confirm()}",
    expect: "no window.confirm stacked on top of the panel",
  },
  {
    // 7. THE BUTTON GOES BACK BEHIND THE STRIPE PORTAL, which is two
    // clicks and a different site to leave.
    name: "cancelling moves back behind the Stripe portal",
    file: SUMMARY,
    from: "<CancelSubscription endsAt=",
    to: "<HiddenBehindPortal endsAt=",
    expect: "the button sits in the billing panel, not behind the Stripe portal",
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

console.log("subscription-cancel mutations\n");

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
console.log("A cancellation that cuts access early, or that a survey can block, turns this red.");
