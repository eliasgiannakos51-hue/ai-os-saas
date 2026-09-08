// A BASELINE THAT NOBODY LOWERED IS A GATE THAT HAS STOPPED WORKING.
//
// This repository holds several counts down with a number: how much
// English is still reached through a ternary, how many gates assert state
// rather than behaviour, how many interaction tests run at one viewport.
// Each is set at the size of a problem so the problem cannot grow, and
// each is only worth having while it stays AT that size. The day the
// count drops and the number does not, the gate starts permitting a
// regression back to the old bad state — silently, reporting PASS the
// whole time, because "28 <= 31" is as true as "28 <= 28".
//
// THAT IS NOT HYPOTHETICAL, and the example is in this repository's own
// history twice. i18n-coverage's header records the first: "it knew about
// three and stayed at three long after they were paid off". V5 #13 found
// the second: CLIENT_FALLBACK_BASELINE stood at 31 against a measured 28,
// so three new English fallbacks could have shipped without a check going
// red. It is 28 now.
//
// HOW IT WORKS. Each gate that owns a baseline prints one line —
// `BASELINE <NAME> declared=<n> measured=<m>` (lib/baseline.mjs) — beside
// its own check. This file runs those gates, reads the lines, and
// compares. The gate that owns a number still makes its own assertion in
// its own words; this one only asks whether the number is still the size
// of the thing it measures.
//
// WHY IT RUNS THEM RATHER THAN READING A CACHE. A sidecar written by
// whichever gate happened to run first would make this file pass
// vacuously whenever it was stale or missing, which is the shape
// gate-vacuity.test.mjs exists to refuse. Eight gates, about seven
// seconds.
//
// WHAT IS NOT IN THE REGISTER, and why that is not an oversight: a
// constant like sidebar-size's MAX_DRAWN_ITEMS or legal-pages' DETAIL_MAX
// is a DESIGN limit, not a baseline. It is not the size of a problem, it
// is a decision, and lowering it as reality moves would be nonsense.
// Likewise the REPORTED_* numbers in the forensics gates: those are what
// a real incident charged, and they are supposed to stay.
//
// Run: node scripts/tests/baselines.test.mjs
import { execFileSync } from "node:child_process";
import { BASELINE_LINE } from "./lib/baseline.mjs";

let pass = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    failures.push(name);
    console.log(`  FAIL  ${name}${detail !== undefined ? `\n        ${detail}` : ""}`);
  }
}

/**
 * Every baseline, what it guards, and how far it may sit from reality.
 *
 * `slack: 0` is the default and the honest one: a ceiling that is not AT
 * the count permits exactly that many regressions. The two entries with
 * slack are the two whose owning gates already argue for it in their own
 * comments, and the argument is quoted rather than re-invented.
 */
export const BASELINES = [
  {
    gate: "i18n-coverage",
    name: "INDIRECT_ENGLISH_BASELINE",
    direction: "ceiling",
    slack: 0,
    why: "English reached through a ternary or ??. Closing them is a translation job across ten locales; recording them is what stops the next one.",
  },
  {
    gate: "i18n-coverage",
    name: "SERVER_PROSE_BASELINE",
    direction: "ceiling",
    slack: 0,
    why: "Server-side English error prose. Same argument, two orders of magnitude bigger, which makes the ratchet more important rather than less.",
  },
  {
    gate: "i18n-coverage",
    name: "CLIENT_FALLBACK_BASELINE",
    direction: "ceiling",
    slack: 0,
    why: "Client English fallbacks. THIS IS THE ONE THAT HAD DRIFTED: 31 declared against 28 measured until V5 #13.",
  },
  {
    gate: "interaction-coverage",
    name: "SINGLE_VIEWPORT_CEILING",
    direction: "ceiling",
    slack: 0,
    why: "Interaction tests that run at one viewport. Every one of them is a test that cannot see a mobile-only break.",
  },
  {
    gate: "interaction-coverage",
    name: "MOUSE_ONLY_CEILING",
    direction: "ceiling",
    slack: 0,
    why: "Interaction tests driven by mouse events only. Each is a test that would pass on a phone that cannot perform it.",
  },
  {
    gate: "gate-state-vs-behaviour",
    name: "STATE_ONLY_CEILING",
    direction: "ceiling",
    slack: 0,
    why: "Gates that assert a value rather than an outcome. The count is small and it is meant to reach zero.",
  },
  {
    gate: "empty-states",
    name: "EMPTY_STATE_BASELINE",
    direction: "ceiling",
    slack: 0,
    why: "Modules with a generic empty state. Was 20, is 0 — and its own comment already says LOWER THE BASELINE if it fails downward, which is this rule written in prose.",
  },
  {
    gate: "mutation-anchors",
    name: "FALLBACK_CEILING",
    direction: "ceiling",
    slack: 0,
    why: "Mutation suites whose lists are read the weaker way, without their edits. The reading that cannot see edits is the one that mis-reports a code change as prose.",
  },
  {
    gate: "deep-links",
    name: "DEEP_LINK_FLOOR",
    direction: "floor",
    slack: 0,
    why: "Distinct deep links the scanner finds. A floor rather than a ceiling: the failure it guards is the scanner seeing LESS of the app, which no per-link check can report.",
  },
  {
    gate: "mutation-coverage",
    name: "RATCHET",
    direction: "floor",
    slack: 5,
    why: "Gates with a mutation suite. Its own comment sets the tolerance: five, 'so deleting one suite on purpose does not need a build fix in the same commit'.",
  },
  {
    gate: "mutation-runner-honesty",
    name: "MUTATION_SUITE_FLOOR",
    direction: "floor",
    slack: 10,
    why: "The sweep's suite floor. Ten, for the reason run-mutations.mjs gives: raised with each batch of new suites, and the point is that the gap stays small.",
  },
];

console.log("== 1. every registered baseline is still emitted, with its numbers ==");
const seen = new Map();
const gates = [...new Set(BASELINES.map((b) => b.gate))];
for (const gate of gates) {
  let out = "";
  try {
    out = execFileSync(process.execPath, [`scripts/tests/${gate}.test.mjs`], {
      encoding: "utf8",
      stdio: "pipe",
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch (e) {
    // A GATE THAT IS RED STILL PUBLISHES ITS NUMBERS, and they are the
    // interesting ones: a baseline breached is exactly when somebody
    // wants to know how far.
    out = String(e.stdout ?? "") + String(e.stderr ?? "");
  }
  for (const m of out.matchAll(BASELINE_LINE)) {
    seen.set(m[1], { gate, declared: Number(m[2]), measured: Number(m[3]) });
  }
}
check(
  `the ${gates.length} gates that own baselines were run and printed ${seen.size}`,
  seen.size >= BASELINES.length,
  [...seen.keys()].join(", ")
);

console.log("\n== 2. and none of them has drifted away from what it measures ==");
const drifted = [];
for (const b of BASELINES) {
  const hit = seen.get(b.name);
  if (!hit) {
    drifted.push(`${b.name}: ${b.gate} printed no BASELINE line for it`);
    continue;
  }
  const gap = b.direction === "ceiling" ? hit.declared - hit.measured : hit.measured - hit.declared;
  console.log(
    `        ${b.name.padEnd(26)} declared ${String(hit.declared).padStart(4)}  ` +
      `measured ${String(hit.measured).padStart(4)}  slack ${gap} of ${b.slack}`
  );
  if (gap < 0) drifted.push(`${b.name}: breached — declared ${hit.declared}, measured ${hit.measured}`);
  else if (gap > b.slack) {
    drifted.push(
      `${b.name}: ${gap} of room where ${b.slack} is allowed — declared ${hit.declared}, ` +
        `measured ${hit.measured}. Lower it to ${hit.measured}.`
    );
  }
}
check("no baseline has more room than it is allowed", drifted.length === 0, drifted.join("\n        "));

console.log("\n== 3. and the register cannot go stale in either direction ==");
const unregistered = [...seen.keys()].filter((n) => !BASELINES.some((b) => b.name === n));
check(
  "every baseline a gate emits is in the register",
  unregistered.length === 0,
  unregistered.join(", ")
);
for (const b of BASELINES) {
  check(`${b.name}: the register says what it guards`, typeof b.why === "string" && b.why.length > 40);
  check(
    `${b.name}: it is a ceiling or a floor`,
    b.direction === "ceiling" || b.direction === "floor",
    b.direction
  );
}
// SLACK IS THE EXCEPTION, SO IT NEEDS THE ARGUMENT. A register where
// every entry could quietly grow a tolerance is a register that permits
// the drift it exists to catch.
const looseWithoutReason = BASELINES.filter(
  (b) => b.slack > 0 && !/its own comment|the reason|tolerance/i.test(b.why)
);
check(
  "a baseline allowed slack quotes the argument for it",
  looseWithoutReason.length === 0,
  looseWithoutReason.map((b) => b.name).join(", ")
);

console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILED"}: ${pass} passed, ${failures.length} failed`);
if (failures.length > 0) process.exit(1);
