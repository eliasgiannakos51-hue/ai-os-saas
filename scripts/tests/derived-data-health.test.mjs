// A DERIVED TABLE IS ONLY EVER CHECKED AS CODE.
//
// THE INCIDENT, 2026-09-19. ⌘K found no content for an account with 88
// records. Every check about search_index passed: the triggers are
// declared, the sync function is right, the RPC exists, the route calls
// it, the schema canary finds it, 29 tables are wired. The table was
// empty. Not one of those checks asked the only question that mattered
// — does it have rows? — because no gate in the build can ask a
// database anything.
//
// The owner's generalisation: "the sync was called in 23 places and the
// index was empty. Every 'the wiring exists' check can lie the same
// way."
//
// WHAT THIS HOLDS:
//
//   1. The probe that CAN ask exists, is reachable from /api/health, and
//      its verdict is a pure function a test can RUN — the lesson
//      nav-freshness learned when its own test re-implemented the
//      branches it was checking and agreed with its own copy.
//   2. The census of database-written tables is non-empty and every one
//      of them is either counted by some suite or named here with a
//      reason.
//   3. The wiring-only ratio is printed, so nobody has to guess how much
//      of the build is evidence about what the code SAYS.
//
// Run: node scripts/tests/derived-data-health.test.mjs
import { readFileSync } from "node:fs";
import { loadTs } from "./load-ts.mjs";
import { report, wiringOnlyChecks } from "../scan-derived-data.mjs";

let pass = 0;
const failures = [];
const ok = (name, cond, detail) => {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { failures.push(name); console.log(`  FAIL  ${name}${detail !== undefined ? "\n        " + detail : ""}`); }
};

const health = await loadTs("src/lib/health/derived-data.ts");

// ---------------------------------------------------------------------
console.log("== 1. the verdict is RUN, not described ==");
// Every branch, called. nav-freshness.mutation.mjs showed what happens
// otherwise: deleting a branch left the test green because the test was
// reading its own reimplementation of it.
for (const [rows, accounts, want, why] of [
  [12345, 1, "ok", "rows exist"],
  [0, 4, "EMPTY", "no rows and the product has accounts — the incident"],
  [0, 0, "quiet", "no rows and nobody has signed up"],
  [null, 3, "unchecked", "the count could not be read"],
  [0, null, "unchecked", "the account count could not be read"],
]) {
  ok(`rows=${rows} accounts=${accounts} -> ${want} (${why})`,
    health.derivedVerdict(rows, accounts) === want,
    health.derivedVerdict(rows, accounts));
}
ok("EMPTY is the loud one, spelled like nav's STALE",
  health.derivedVerdict(0, 1) === "EMPTY" && health.derivedVerdict(0, 1) === health.derivedVerdict(0, 1).toUpperCase());

// ---------------------------------------------------------------------
console.log("\n== 2. /api/health actually asks ==");
const route = readFileSync("src/app/api/health/route.ts", "utf8");
ok("the route imports the probe", /from "@\/lib\/health\/derived-data"/.test(route));
ok("...and calls it", /await derivedDataHealth\(createAdminClient\(\)\)/.test(route));
ok("...and reports 'unchecked' rather than nothing when it cannot ask",
  /body\.derived = \{[\s\S]{0,260}verdict: "unchecked"/.test(route));
ok("...outside `ok` and the status code, like schema and nav",
  !/derived[\s\S]{0,120}status:/.test(route),
  "an index that needs a backfill is not an outage");

// ---------------------------------------------------------------------
console.log("\n== 3. the census of tables the DATABASE writes ==");
const rows = report();
ok(`tables written from inside the database (${rows.length})`,
  rows.length >= 6,
  `${rows.length} — an empty census makes the check below vacuous`);
// Every one either has a suite that counts its rows, or is named here.
// EVERY ONE OF THEM IS COUNTED SOMEWHERE — and that is the finding,
// not a clean bill of health. The first run of this scan reported
// daily_ai_spend_tracking as uncounted and search_index as counted by
// two suites; both were wrong, in opposite directions, because the
// detector matched the word `count` near the table's NAME. It read the
// sentence "Counts search_index across every account" out of an
// exception's reason string in user-scoped-queries.test.mjs — a scan
// for checks that only read text, reading text. The table must now be
// ADDRESSED: `from("x")` or `from public.x`.
//
// So the question is not "is it counted" but WHERE, and by a suite that
// runs. The list below says which of these suites the build executes.
const NOT_COUNTED_IS_FINE = {};
const uncounted = rows.filter((r) => r.countedIn.length === 0);
for (const r of uncounted) {
  ok(`${r.table}: nobody counts its rows, and that is explained`,
    Object.hasOwn(NOT_COUNTED_IS_FINE, r.table),
    `written by ${r.writers.join(", ")}. Either a suite must ask how many rows it holds,\n` +
    "        or the reason an empty one is fine belongs in NOT_COUNTED_IS_FINE here.");
}
for (const table of Object.keys(NOT_COUNTED_IS_FINE)) {
  ok(`...and the entry for ${table} is still needed`,
    uncounted.some((r) => r.table === table),
    "something counts it now — delete the entry");
}
{
  // THE NUMBER THAT MATTERS. A row count that only a dbtest, an itest
  // or a prodtest performs is a row count nothing in `npm run build`
  // ever takes — 93 of this tree's suites do not run here at all.
  const runsInBuild = (f) => f.endsWith(".test.mjs");
  const onlyOutsideBuild = rows.filter(
    (r) => r.countedIn.length > 0 && !r.countedIn.some(runsInBuild)
  );
  console.log(
    `\n  ${onlyOutsideBuild.length} of ${rows.length} are counted ONLY by suites the build does not run:`
  );
  for (const r of onlyOutsideBuild) console.log(`     ${r.table.padEnd(26)} ${r.countedIn.join(", ")}`);
  ok("that number is still being measured rather than assumed",
    onlyOutsideBuild.length + rows.filter((r) => r.countedIn.some(runsInBuild)).length === rows.length);
}
{
  // THE ONE THE INCIDENT WAS ABOUT. It is counted — by a dbtest, which
  // does not run without DATABASE_URL and which counts rows IT inserted.
  // That is a fixture, not the production index, and saying so is the
  // point of this check.
  const si = rows.find((r) => r.table === "search_index");
  ok("search_index is in the census", Boolean(si));
  ok("...and the only suite that counts it is a dbtest",
    Boolean(si) && si.countedIn.every((f) => f.endsWith(".dbtest.mjs")),
    si ? si.countedIn.join(", ") : "");
  ok("...which is why /api/health had to learn to ask",
    /searchIndexRows/.test(readFileSync("src/lib/health/derived-data.ts", "utf8")));
}

// ---------------------------------------------------------------------
console.log("\n== 4. how much of the build reads a call site ==");
const wiring = wiringOnlyChecks();
const checks = wiring.reduce((n, g) => n + g.checks, 0);
const only = wiring.reduce((n, g) => n + g.wiring, 0);
ok(`the scan still finds checks (${checks})`, checks > 5000,
  `${checks} — a parser that finds nothing would pass the ratio below`);
ok(`...and still finds wiring-only ones (${only})`, only > 100,
  `${only} — the same, in the other direction`);
console.log(`\n  ${only} of ${checks} checks (${((100 * only) / checks).toFixed(1)}%) in ${wiring.filter((g) => g.wiring > 0).length} gates`);
console.log(
  "  read a call site inside a gate that reaches no network, no browser,\n" +
  "  no database and does not run the code. Printed, not gated: for most\n" +
  "  of them the result is checked elsewhere, and a structural check is\n" +
  "  often the only affordable one."
);
{
  // THE ONE THAT WATCHED THE EMPTY INDEX, by name.
  const us = wiring.find((g) => g.file === "unified-search.test.mjs");
  ok("unified-search.test.mjs is still in the census", Boolean(us));
  ok("...and still proves the call rather than the result",
    Boolean(us) && us.wiring > 0,
    us ? `${us.wiring} wiring-only checks` : "");
}

console.log("");
if (failures.length > 0) {
  console.log(`${pass} passed, ${failures.length} FAILED:`);
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
console.log(`ALL PASS: ${pass} passed, 0 failed`);
