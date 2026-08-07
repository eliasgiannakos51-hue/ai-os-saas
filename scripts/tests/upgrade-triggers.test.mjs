// Smart upgrade triggers (V3 Task 9).
//
// The property under test is RESTRAINT. Almost every input must produce
// silence, and the test is written that way round on purpose: it is easy
// to check that a prompt appears when you want it, and the failure that
// actually damages a product is the prompt appearing when you do not.
//
// A product that asks for money on a schedule teaches people to dismiss
// the ask without reading it — and then the one moment the suggestion is
// genuinely useful is the moment it gets ignored out of habit.
//
// Run: node scripts/tests/upgrade-triggers.test.mjs
let pass = 0,
  fail = 0;
function check(name, actual, expected) {
  const a = JSON.stringify(actual),
    e = JSON.stringify(expected);
  if (a === e) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    fail++;
    console.log(`  FAIL  ${name}\n        expected ${e}\n        actual   ${a}`);
  }
}
function checkTrue(name, cond, detail) {
  check(name, Boolean(cond), true);
  if (!cond && detail) console.log(`        ${detail}`);
}

const { loadTs } = await import("./load-ts.mjs");
const ut = await loadTs("src/lib/upgrade-triggers.ts");

const base = {
  justSucceeded: false,
  remainingOfThisAction: null,
  nextPlanName: "Growth",
  reason: "presentations",
  refusalCount: 0,
  refusedFeature: "agents",
};
const kind = (over) => ut.resolveUpgradeMoment({ ...base, ...over }).kind;

console.log("== 1. silence is the default ==");
check("an idle dashboard says nothing", kind({}), "none");
check("a success with headroom left says nothing", kind({ justSucceeded: true, remainingOfThisAction: 3 }), "none");
check("a success with unlimited headroom says nothing", kind({ justSucceeded: true, remainingOfThisAction: null }), "none");
// A ceiling hit WITHOUT a success is a failure, and the feature's own
// upgrade wall already handled it. Piling on is the nag.
check("hitting the ceiling without succeeding says nothing", kind({ remainingOfThisAction: 0 }), "none");
// The FIRST refusal is answered by the upgrade wall. Pouncing on it is
// exactly the behaviour this file exists to prevent.
check("one refusal says nothing", kind({ refusalCount: 1 }), "none");

console.log("\n== 2. the top plan is never pitched ==");
// Nothing to sell, and pretending otherwise insults the customer who
// already bought the most.
check(
  "no next plan means no prompt, even at the ceiling",
  kind({ justSucceeded: true, remainingOfThisAction: 0, nextPlanName: null }),
  "none"
);
check("...and not after repeated refusals either", kind({ refusalCount: 5, nextPlanName: null }), "none");

console.log("\n== 3. the two moments that do speak ==");
// Success AND ceiling together: they are holding the value in one hand
// and the limit in the other, and the pitch is a fact rather than a nag.
const success = ut.resolveUpgradeMoment({
  ...base,
  justSucceeded: true,
  remainingOfThisAction: 0,
  reason: "presentations",
});
check("success at the ceiling speaks", success.kind, "success_ceiling");
check("...naming what ran out", success.reason, "presentations");
check("...and what fixes it", success.nextPlan, "Growth");

const refused = ut.resolveUpgradeMoment({ ...base, refusalCount: 2, refusedFeature: "agents" });
check("a second refusal speaks", refused.kind, "repeated_refusal");
check("...naming the feature they wanted", refused.feature, "agents");

console.log("\n== 4. success outranks refusal ==");
// Somebody who just succeeded is in a better frame to consider an
// upgrade than somebody who was just told no twice, so when both are
// true the kinder moment wins.
check(
  "both at once picks the success framing",
  kind({ justSucceeded: true, remainingOfThisAction: 0, refusalCount: 4 }),
  "success_ceiling"
);

console.log("\n== 5. even the right moment has a cooldown ==");
// "The right moment" recurs. Somebody who hits their ceiling three days
// running must not be pitched three days running.
const now = new Date("2026-08-20T12:00:00Z");
checkTrue("never prompted before is allowed", ut.promptAllowedNow(null, now));
checkTrue("yesterday is too soon", !ut.promptAllowedNow("2026-08-19T12:00:00Z", now));
checkTrue("six days is too soon", !ut.promptAllowedNow("2026-08-14T12:00:00Z", now));
checkTrue("seven days is allowed", ut.promptAllowedNow("2026-08-13T12:00:00Z", now));
// A corrupt stored value must not silence the product forever.
checkTrue("garbage in storage does not lock it out", ut.promptAllowedNow("not-a-date", now));

console.log("\n== 6. the rule is pure ==");
const { readFileSync } = await import("node:fs");
const src = readFileSync("src/lib/upgrade-triggers.ts", "utf8");
checkTrue("no database", !/supabase/i.test(src));
checkTrue("no model call", !/anthropic/i.test(src));
// The cooldown is a politeness setting, not a fact about the account,
// so it lives in the browser — and losing it costs one extra prompt.
checkTrue("the cooldown is browser-side", /STORAGE_KEY/.test(src));

console.log(
  fail === 0 ? `\nALL PASS: ${pass} passed, 0 failed` : `\nFAILURES: ${pass} passed, ${fail} failed`
);
process.exit(fail === 0 ? 0 : 1);
