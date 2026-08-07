// Energy-based scheduling (V3 Task 8).
//
// The energy check-in has been recorded, shown back and passed to the
// chat prompt since it was built, and nothing ever acted on it. This
// tests the part that does.
//
// The two properties worth gating are not "does it pick a step" — they
// are the two ways this feature turns from helpful into annoying, and an
// annoying suggestion panel gets ignored, which is the same as not
// shipping it:
//
//   1. STALE ENERGY IS NEVER USED. Advice built on Tuesday's check-in,
//      given on Thursday, is confident and wrong on a premise the user
//      cannot see. Worse than a blank space.
//
//   2. THE PLAN ORDER IS NEVER CHANGED. Step order carries dependencies.
//      The suggestion picks the first SUITABLE step, not the lightest
//      one, or somebody ends up doing step 9 while step 2 still blocks
//      everything.
//
// Run: node scripts/tests/energy-scheduling.test.mjs
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
const es = await loadTs("src/lib/energy-scheduling.ts");

const step = (over = {}) => ({ text: "A step", status: "pending", ...over });

console.log("== 1. demand comes from what the planner already produced ==");
check("a short step is light", es.stepDemand(step({ estimatedMinutes: 10 })), "light");
check("a step with no estimate at all is light", es.stepDemand(step()), "light");
check("half an hour is moderate", es.stepDemand(step({ estimatedMinutes: 30 })), "moderate");
check("ninety minutes is deep", es.stepDemand(step({ estimatedMinutes: 90 })), "deep");
// Substeps are the stronger signal: the planner only breaks a step down
// when it judged it big, and minute estimates are optimistic.
check(
  "three substeps make it deep whatever the estimate says",
  es.stepDemand(step({ estimatedMinutes: 5, substeps: [{}, {}, {}] })),
  "deep"
);
check("one substep makes it at least moderate", es.stepDemand(step({ substeps: [{}] })), "moderate");
check("a malformed estimate does not throw", es.stepDemand(step({ estimatedMinutes: "ages" })), "light");
check("malformed substeps do not throw", es.stepDemand(step({ substeps: "many" })), "light");

console.log("\n== 2. low energy narrows, high energy does not ==");
check("level 1 offers only light work", es.demandsForEnergy(1), ["light"]);
check("level 2 offers only light work", es.demandsForEnergy(2), ["light"]);
check("level 3 opens up moderate", es.demandsForEnergy(3), ["light", "moderate"]);
// Generous upward on purpose: telling somebody with a clear afternoon
// that a ten-minute task is beneath them is absurd.
check("level 5 offers everything, including the small things", es.demandsForEnergy(5), [
  "light",
  "moderate",
  "deep",
]);
checkTrue("a deep step is not suggested at level 2", !es.stepSuitsEnergy(step({ estimatedMinutes: 120 }), 2));
checkTrue("a light step is suggested at level 5", es.stepSuitsEnergy(step({ estimatedMinutes: 5 }), 5));

console.log("\n== 3. stale energy is never acted on ==");
const now = new Date("2026-08-07T15:00:00Z");
checkTrue("a check-in from earlier today is fresh", es.isCheckInFresh("2026-08-07T08:00:00Z", now));
checkTrue("yesterday's is not", !es.isCheckInFresh("2026-08-06T23:30:00Z", now));
// Under seven hours old and still refused. The comparison is on the
// calendar day, not on an hour count, because a check-in at 23:00 is not
// advice about the next afternoon however recent it looks.
checkTrue("last night's late check-in is not fresh this afternoon", !es.isCheckInFresh("2026-08-06T22:00:00Z", now));
checkTrue("garbage is not fresh", !es.isCheckInFresh("not a date", now));
checkTrue("an empty string is not fresh", !es.isCheckInFresh("", now));

const steps = [
  step({ text: "Blocked-on first", estimatedMinutes: 120 }),
  step({ text: "Quick win", estimatedMinutes: 10 }),
  step({ text: "Medium", estimatedMinutes: 45 }),
];

check(
  "no check-in produces its own outcome, not a step",
  es.suggestStepForEnergy({ steps, level: null, checkInAt: null, now }).kind,
  "no_checkin"
);
check(
  "a stale check-in produces its own outcome, not a step",
  es.suggestStepForEnergy({ steps, level: 5, checkInAt: "2026-08-05T09:00:00Z", now }).kind,
  "stale_checkin"
);

console.log("\n== 4. it suggests without reordering ==");
const fresh = "2026-08-07T09:00:00Z";

// At full energy the FIRST step is the answer even though a lighter one
// sits right behind it. Picking the lightest would have somebody doing
// the quick win while the two-hour blocker still blocks everything.
const high = es.suggestStepForEnergy({ steps, level: 5, checkInAt: fresh, now });
check("at high energy the first step wins", high.kind === "step" ? high.index : null, 0);
check("...and it is reported as deep", high.kind === "step" ? high.demand : null, "deep");

// At low energy the deep first step is skipped and the next SUITABLE one
// in plan order is chosen — not the lightest overall, which happens to
// be the same here, so a second case pins the difference below.
const low = es.suggestStepForEnergy({ steps, level: 1, checkInAt: fresh, now });
check("at low energy the deep step is skipped", low.kind === "step" ? low.index : null, 1);

const ordered = [
  step({ text: "Deep", estimatedMinutes: 120 }),
  step({ text: "Moderate", estimatedMinutes: 45 }),
  step({ text: "Tiny", estimatedMinutes: 5 }),
];
const mid = es.suggestStepForEnergy({ steps: ordered, level: 3, checkInAt: fresh, now });
check(
  "at mid energy it takes the first SUITABLE step, not the lightest",
  mid.kind === "step" ? mid.index : null,
  1
);

// Completed steps are not suggested.
const halfDone = [step({ text: "Done", estimatedMinutes: 5, status: "completed" }), step({ text: "Next", estimatedMinutes: 5 })];
const skipDone = es.suggestStepForEnergy({ steps: halfDone, level: 5, checkInAt: fresh, now });
check("a finished step is never suggested", skipDone.kind === "step" ? skipDone.index : null, 1);

check(
  "a finished mission says so rather than showing nothing",
  es.suggestStepForEnergy({ steps: [step({ status: "completed" })], level: 5, checkInAt: fresh, now }).kind,
  "nothing_left"
);

// The case worth handling honestly: everything left is heavier than
// today. "Come back tomorrow" is only useful if it also says what
// tomorrow needs to look like.
const heavy = es.suggestStepForEnergy({
  steps: [step({ estimatedMinutes: 120 }), step({ estimatedMinutes: 180 })],
  level: 1,
  checkInAt: fresh,
  now,
});
check("everything too heavy is its own outcome", heavy.kind, "all_too_heavy");
check("...and it names the lightest thing left", heavy.kind === "all_too_heavy" ? heavy.lightestDemand : null, "deep");

console.log("\n== 5. it is pure ==");
// No database, no model call. A suggestion that costs a credit and shows
// a spinner is one nobody waits for, and this has to be instant to be
// used at all.
const { readFileSync } = await import("node:fs");
const src = readFileSync("src/lib/energy-scheduling.ts", "utf8");
checkTrue("no Anthropic call", !/anthropic|messages\.create/i.test(src));
checkTrue("no database access", !/supabase|createClient/i.test(src));
checkTrue("no server-only guard needed", !/server-only/.test(src));

console.log(
  fail === 0 ? `\nALL PASS: ${pass} passed, 0 failed` : `\nFAILURES: ${pass} passed, ${fail} failed`
);
process.exit(fail === 0 ? 0 : 1);
