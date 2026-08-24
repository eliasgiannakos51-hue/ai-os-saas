#!/usr/bin/env node
/*
 * A SCHEDULE THAT NEVER FIRES, AND A SCHEDULE WRONGLY CALLED IMPOSSIBLE.
 *
 * One root cause produced two opposite defects, and both were live.
 *
 * WHAT WAS ACCEPTED AND SHOULD NOT HAVE BEEN. "0 8 31 2 *" parses
 * cleanly — 31 is inside dayOfMonth's 1-31 range and 2 is inside month's
 * 1-12 — so validateAgentCron passed it. The 31st of February is not a
 * date. Two of the three routes that create an agent then noticed,
 * because they tested nextRunAt() themselves and rejected a null. The
 * third, api/agents/templates/adopt, wrote `next_run_at: null` and
 * carried on, AFTER reserving credits for the template fill. The
 * dispatcher selects `.not("next_run_at","is",null).lte(...)`, so that
 * row is invisible to it for ever, and nothing recomputes the column —
 * there was no eventual consistency to wait for. A charged agent, shown
 * as active, that could never run once.
 *
 * WHAT WAS REJECTED AND SHOULD NOT HAVE BEEN. "0 0 29 2 *" is a real
 * schedule. nextRunAt scanned MAX_DAYS_AHEAD = 400 days for a firing and
 * returned null when it found none, and every caller reads null as
 * "impossible" — so on any date more than 400 days before the next 29
 * February the product told the user their schedule never fires and
 * refused to create the agent. Measured from 2026-08-23 the next leap
 * day is 2028-02-29, 554 days away: rejected.
 *
 * THE FIX IS ONE ORACLE AND ONE HORIZON. canEverFire() asks the CALENDAR
 * whether a day/month pair can exist, so impossibility is decided by
 * arithmetic instead of by how far a search happened to look; and the
 * horizon grew to the worst REAL gap between two firings, which is 2921
 * days, because 2100 is not a leap year.
 *
 * THE CHECK MOVED INTO validateAgentCron ON PURPOSE. A guard repeated at
 * three call sites is a guard the fourth forgets — which is exactly how
 * the adopt route came to be the one without it.
 *
 * Run: node scripts/tests/cron-firing.test.mjs
 */
import { readFileSync } from "node:fs";
import { loadTs } from "./load-ts.mjs";

let pass = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) {
    pass++;
  } else {
    failures.push(name);
    console.log(`  FAIL  ${name}${detail ? "\n        " + detail : ""}`);
  }
}
const read = (p) => readFileSync(p, "utf8");

// The three doors through which an agent can be created or rescheduled.
// api/agents/templates/adopt is the one that had no guard at all.
const ROUTE_FILES = [
  "src/app/api/agents/route.ts",
  "src/app/api/agents/[id]/route.ts",
  "src/app/api/agents/templates/adopt/route.ts",
];

const cron = await loadTs("src/lib/agents/cron-expression.ts");
const { validateAgentCron, parseCronExpression, nextRunAt, canEverFire } = cron;

// ---------------------------------------------------------------------
console.log("== 1. the calendar decides, over every day/month pair ==");
//
// CROSS-PRODUCT, NOT SAMPLES. All 31 x 12 = 372 day/month pairs, with the
// impossible set DERIVED here from a leap-year rule written independently
// of the one in the module under test. Six pairs are impossible. If the
// module and this test agreed by both being wrong, the count below would
// have to be wrong too, and it is stated as a number.
const isLeap = (y) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
function dayMonthEverExists(day, month) {
  // Asked of Date itself across a leap cycle rather than from a table.
  for (let y = 2024; y <= 2032; y++) {
    if (month === 2 && day === 29 && !isLeap(y)) continue;
    const d = new Date(Date.UTC(y, month - 1, day));
    if (d.getUTCMonth() === month - 1 && d.getUTCDate() === day) return true;
  }
  return false;
}

let impossibleCount = 0;
let wrongVerdicts = [];
for (let month = 1; month <= 12; month++) {
  for (let day = 1; day <= 31; day++) {
    const expr = `0 9 ${day} ${month} *`;
    const exists = dayMonthEverExists(day, month);
    if (!exists) impossibleCount++;
    const verdict = validateAgentCron(expr).ok;
    if (verdict !== exists) wrongVerdicts.push(`${expr} -> ${verdict ? "accepted" : "rejected"}`);
  }
}
check(
  "exactly six day/month pairs are impossible",
  impossibleCount === 6,
  `derived ${impossibleCount}, expected 6 — (30,2) (31,2) (31,4) (31,6) (31,9) (31,11)`
);
check(
  "validateAgentCron agrees with the calendar on all 372 pairs",
  wrongVerdicts.length === 0,
  wrongVerdicts.slice(0, 8).join("\n        ")
);
check(
  "the 29th of February is ACCEPTED — leap years exist",
  validateAgentCron("0 0 29 2 *").ok,
  "a list of impossible dates written from memory usually includes this one"
);
check(
  "the 30th of February is REJECTED",
  !validateAgentCron("0 0 30 2 *").ok
);
// ONE SITUATION, ONE SENTENCE — checked as a property, not as a string.
//
// This used to assert the message contained "does not exist". That is a
// check on the wording, and wording is the thing most likely to change
// for reasons that have nothing to do with correctness. What actually
// matters is that a user meeting an unschedulable cron is told the same
// thing whichever of the three doors they came through, so that is what
// is asserted: the validator's message IS the routes' message, and the
// literal is defined exactly once.
check(
  "an impossible date is refused with the product's unschedulable message",
  validateAgentCron("0 8 31 2 *").error === cron.UNSCHEDULABLE_MESSAGE
);
check(
  "that message is a real sentence, not an empty string",
  typeof cron.UNSCHEDULABLE_MESSAGE === "string" && cron.UNSCHEDULABLE_MESSAGE.length > 20
);
const LITERAL = "That schedule never fires";
const repeats = ROUTE_FILES.filter((f) => read(f).includes(LITERAL));
check(
  "no route repeats the literal — they all import the one definition",
  repeats.length === 0,
  `still written out in: ${repeats.join(", ")}`
);
check(
  "every route that can refuse a schedule imports that constant",
  ROUTE_FILES.every((f) => /UNSCHEDULABLE_MESSAGE/.test(read(f)))
);

// LISTS AND RANGES, because the 372 pairs above are all SINGLETONS.
//
// Every expression built by that loop has exactly one month and exactly
// one day, and over a one-element set `some` and `every` are the same
// function. The mutation suite proved it: swapping some->every in
// canEverFire left the 372-pair check completely green. A day/month rule
// is a rule about SETS, so it has to be asked about sets.
const SET_CASES = [
  // expression,            can it fire?, why
  ["0 9 31 1,2 *",          true,  "the 31st of January or February — January can host it"],
  ["0 9 31 2,4 *",          false, "the 31st of February or April — neither can"],
  ["0 9 30,31 2 *",         false, "the 30th or 31st of February — neither exists"],
  ["0 9 29,30 2 *",         true,  "the 29th or 30th of February — the 29th exists in a leap year"],
  ["0 9 31 2-4 *",          true,  "a RANGE of months, one of which (March) has a 31st"],
  ["0 9 31 4,6,9,11 *",     false, "the 31st of every thirty-day month"],
  ["0 9 31 2,4,6,9,11 *",   false, "all five months that cannot host a 31st"],
  ["0 9 1,31 2 *",          true,  "the 1st or 31st of February — the 1st exists"],
];
const setWrong = [];
for (const [expr, expected, why] of SET_CASES) {
  const got = validateAgentCron(expr).ok;
  if (got !== expected) setWrong.push(`${expr} -> ${got ? "accepted" : "rejected"}, expected ${expected ? "accepted" : "rejected"} (${why})`);
}
check(
  `day/month LISTS and RANGES are judged as sets (${SET_CASES.length} cases)`,
  setWrong.length === 0,
  setWrong.join("\n        ")
);
// And the sets that ARE valid still resolve to a real date, so the rule
// cannot be satisfied by accepting things nextRunAt then cannot find.
for (const [expr, expected] of SET_CASES) {
  if (!expected) continue;
  const n = nextRunAt(expr, new Date("2026-08-23T12:00:00Z"), "UTC");
  check(`${expr} resolves to a real next run`, n !== null && Number.isFinite(n?.getTime()));
}

// ---------------------------------------------------------------------
console.log("== 2. the dom/dow OR rule is not broken by the new check ==");
//
// Vixie cron ORs the day fields when BOTH are restricted, so an
// impossible day-of-month beside a real day-of-week still fires. A naive
// impossibility check kills these, and they are legal.
for (const expr of ["0 0 30 2 1", "0 0 31 2 0", "0 0 31 4 1-5"]) {
  check(`${expr} is accepted (day-of-week still fires it)`, validateAgentCron(expr).ok);
  const n = nextRunAt(expr, new Date("2026-08-23T12:00:00Z"), "UTC");
  check(`${expr} resolves to a real next run`, n instanceof Date && Number.isFinite(n.getTime()));
}
// ...and with day-of-week unrestricted, the same pair is dead.
check("0 0 30 2 * is rejected once day-of-week stops saving it", !validateAgentCron("0 0 30 2 *").ok);

// ---------------------------------------------------------------------
console.log("== 3. the horizon reaches a real leap day ==");
//
// THE DEFECT THIS SECTION EXISTS FOR: at MAX_DAYS_AHEAD = 400 every one
// of these returned null and the user was told their schedule never
// fires. The century case is the one that makes 400 indefensible rather
// than merely unlucky: 2100 is not a leap year, so 2096 -> 2104.
const leapCases = [
  ["2026-08-23T12:00:00Z", "2028-02-29", "554 days out — the gap that was live today"],
  ["2025-03-01T00:00:00Z", "2028-02-29", "just after a leap day, ~3 years"],
  ["2096-03-01T00:00:00Z", "2104-02-29", "2100 is not a leap year — 2921 days"],
];
for (const [from, expectDay, why] of leapCases) {
  const n = nextRunAt("0 0 29 2 *", new Date(from), "UTC");
  check(
    `29 Feb from ${from.slice(0, 10)} resolves to ${expectDay} (${why})`,
    n !== null && n.toISOString().slice(0, 10) === expectDay,
    `got ${n === null ? "null — read by every caller as \"never fires\"" : n.toISOString()}`
  );
}

// ---------------------------------------------------------------------
console.log("== 4. THE PROPERTY: accepted implies resolvable ==");
//
// The one invariant every caller depends on and none of them states:
// if validateAgentCron accepts an expression, nextRunAt must return a
// date for it — from ANY instant, in ANY supported timezone. This is
// checked as a property over a cross-product rather than as three
// examples, because the failure mode is a horizon that is long enough
// for the cases someone thought to write down.
const EXPRESSIONS = [
  "0 9 * * *", "0 9 * * 1", "30 6 1 * *", "0 0 31 1 *", "0 0 29 2 *",
  "0 0 31 12 *", "15 3 29 2 *", "0 0 30 2 1", "0 12 31 10 *", "45 23 1 1 *",
];
const FROMS = [
  "2026-08-23T12:00:00Z", "2027-02-28T23:59:00Z", "2028-02-29T12:00:00Z",
  "2096-03-01T00:00:00Z", "2099-12-31T23:00:00Z",
];
const ZONES = ["UTC", "Europe/Athens", "America/Los_Angeles", "Asia/Tokyo", "Australia/Lord_Howe"];
let combos = 0;
const violations = [];
for (const expr of EXPRESSIONS) {
  if (!validateAgentCron(expr).ok) continue;
  for (const from of FROMS) {
    for (const zone of ZONES) {
      combos++;
      const n = nextRunAt(expr, new Date(from), zone);
      if (n === null || !Number.isFinite(n.getTime())) violations.push(`${expr} | ${from} | ${zone}`);
      else if (n.getTime() <= new Date(from).getTime()) violations.push(`${expr} | ${from} | ${zone} -> not after`);
    }
  }
}
check(
  `every accepted expression resolves, across ${combos} expression x instant x timezone combinations`,
  violations.length === 0,
  violations.slice(0, 8).join("\n        ")
);
check("the cross-product actually ran", combos >= 200, `only ${combos} combinations`);

// The converse, so the fix cannot be "accept nothing": a rejected
// expression is rejected because the calendar says so, not because the
// validator got strict.
const rejected = ["0 0 30 2 *", "0 0 31 2 *", "0 0 31 4 *", "0 0 31 6 *", "0 0 31 9 *", "0 0 31 11 *"];
check(
  "the six rejected expressions are exactly the impossible ones",
  rejected.every((e) => !validateAgentCron(e).ok)
);
check(
  "a plain daily schedule is still accepted",
  validateAgentCron("0 9 * * *").ok && nextRunAt("0 9 * * *", new Date("2026-08-23T12:00:00Z"), "UTC") !== null
);

// ---------------------------------------------------------------------
console.log("== 5. no route can write an active agent with no next_run_at ==");
//
// The behavioural half is above: all three routes validate through
// validateAgentCron, so all three now reject an impossible date. This
// section closes the specific hole the adopt route had — a null written
// straight into the column the dispatcher filters on.
const ROUTES = ROUTE_FILES;
for (const route of ROUTES) {
  const src = read(route);
  // Two shapes, because two of these routes insert a row and one patches
  // one: `next_run_at: <expr>` inside an insert object, and
  // `updates.next_run_at = <expr>` building a patch. Matching only the
  // first is how this check passed on a route that never wrote the
  // column at all.
  const writesNextRun = /next_run_at:\s*\S/.test(src) || /\.next_run_at\s*=/.test(src);
  check(`${route} writes next_run_at`, writesNextRun);
  // A null is legitimate ONLY for a paused/disabled agent — which is
  // what api/agents/[id] writes deliberately, on the `status !==
  // "active"` branch. What is never legitimate is DERIVING the column
  // from an unresolved schedule and letting the failure become a null.
  const nullishNextRun =
    /next_run_at:\s*[^,\n]*\?\?\s*null/.test(src) ||
    /\.next_run_at\s*=\s*[^;\n]*\?\?\s*null/.test(src) ||
    /next_run_at:\s*nextRunAt\(/.test(src);
  check(
    `${route} never derives next_run_at straight from an unchecked nextRunAt()`,
    !nullishNextRun,
    "an unchecked nextRunAt() here is an active row the dispatcher can never select"
  );
}
// The deliberate null is still there, and still only on the paused
// branch — this check exists so the fix above cannot be read as "nulls
// are banned", which would leave paused agents schedulable.
const byId = read("src/app/api/agents/[id]/route.ts");
check(
  "a paused agent still has its next_run_at cleared",
  /updates\.next_run_at\s*=\s*null/.test(byId)
);
const adopt = read("src/app/api/agents/templates/adopt/route.ts");
// SCOPED TO THE GUARD'S OWN BLOCK, by counting braces.
//
// This check used to be `adopt.split("if (!nextRun)")[1]` — everything
// AFTER the guard, which is most of the file and contains the OTHER
// releaseReservation calls on the insert-error path. Deleting the release
// from inside the guard left the check green, and the mutation suite said
// so. A substring of the rest of the file is not the block.
function blockAfter(src, anchor) {
  const start = src.indexOf(anchor);
  if (start === -1) return null;
  let i = src.indexOf("{", start);
  if (i === -1) return null;
  let depth = 0;
  for (let j = i; j < src.length; j++) {
    if (src[j] === "{") depth++;
    else if (src[j] === "}") {
      depth--;
      if (depth === 0) return src.slice(i, j + 1);
    }
  }
  return null;
}
const guardBlock = blockAfter(adopt, "if (!nextRun)");
check("adopt has an explicit !nextRun guard", guardBlock !== null);
check(
  "adopt releases the reservation INSIDE that guard",
  guardBlock !== null && /releaseReservation\(/.test(guardBlock),
  "charging for an agent that cannot run is the defect, not the null itself"
);
check(
  "adopt refuses with a 400 rather than creating the row",
  guardBlock !== null && /status:\s*400/.test(guardBlock)
);
// The block-finder is itself checked, because a helper that returns the
// whole file would make the two checks above pass on anything.
check(
  "the block-finder returns a block, not the rest of the file",
  guardBlock !== null && guardBlock.length < adopt.length / 2 && guardBlock.endsWith("}"),
  `block was ${guardBlock?.length} chars of a ${adopt.length}-char file`
);

// The oracle is exported and pure, so the preview in the browser and the
// server reach the same verdict rather than each deciding separately.
check("canEverFire is exported for the client-side preview", typeof canEverFire === "function");
check(
  "canEverFire is total — it answers for every parseable expression",
  // Guarded rather than called straight: on a tree where the export is
  // missing this used to throw, and a gate that CRASHES reports one
  // defect where it should have reported the list. A failing check has
  // to survive the failure it is checking for.
  typeof canEverFire === "function" &&
    ["0 9 * * *", "0 0 30 2 *", "0 0 29 2 *", "0 0 30 2 1"].every((e) => {
      const p = parseCronExpression(e);
      return p.ok && typeof canEverFire(p.fields) === "boolean";
    })
);

console.log(`\n${failures.length === 0 ? "PASS" : "FAIL"} — ${pass} checks passed, ${failures.length} failed`);
if (failures.length > 0) {
  console.log(failures.map((f) => `  - ${f}`).join("\n"));
  process.exit(1);
}
