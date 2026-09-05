// WHAT -1 MEANS, IN THE FIVE PLACES IT MEANT SOMETHING ELSE.
//
// indexOf, lastIndexOf, findIndex and search all answer "not here" with
// -1, and -1 is a legal array index, a legal argument to slice and
// substring, and one away from 0. So the not-found answer does not throw
// and does not look wrong — it silently becomes a different answer.
//
// `node scripts/scan-index-of.mjs` lists all 60 call sites in src/ and
// says how each result is used. Reading them found five where -1 was never
// a branch somebody wrote:
//
//   1. components/ui/card-menu.tsx — focus is on the TRIGGER when a menu
//      opens, so `list.indexOf(document.activeElement)` is -1 on the first
//      arrow press. ArrowDown was right by accident (-1 + 1 = 0);
//      ArrowUp computed `(-1 - 1 + len) % len`, the SECOND-TO-LAST item.
//      A three-item menu opened on its middle entry. Keyboard-only users
//      met this every time and are the least likely to report it.
//   2. components/ui/detail-panel.tsx — the same arithmetic, plus
//      `tabs[next].key` with no guard: an empty tab list made `next` NaN
//      and read a property off undefined.
//   3. lib/billing/plans.ts — `PLAN_RANK.indexOf(minimum)`. The array was
//      annotated `PlanSlug[]`, which checks that every entry is a plan and
//      NOT that every plan is an entry. A slug added to the union and
//      forgotten there would answer -1, and `tierRank >= -1` is true for
//      every plan: every paywall keyed to the new tier opens for free
//      accounts, on a green build.
//   4. lib/ai/providers/catalog.ts — `order.indexOf(m.tier) >= -1` stops
//      filtering, so a request for a large model is answered by the
//      cheapest one in the catalogue.
//   5. lib/data-analysis/charts.ts — a profile/header mismatch made
//      `row[-1]` undefined for every row, and the chart rendered empty:
//      identical on screen to a file with no usable data.
//
// THE ARITHMETIC IS TESTED, NOT THE SHAPE OF THE CODE. rovingIndex is a
// pure function now, so the not-found case is a value this file can ask
// for rather than a line it can grep.
//
// Run: node scripts/tests/not-found-index.test.mjs
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { loadTs } from "./load-ts.mjs";

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
const eq = (name, actual, expected) =>
  check(`${name} → ${JSON.stringify(expected)}`, Object.is(actual, expected), `got ${JSON.stringify(actual)}`);

// ---------------------------------------------------------------------
console.log("== 1. an arrow key, when nothing in the list is focused ==");
const { rovingIndex } = await loadTs("src/lib/ui/roving-index.ts");

// THE DEFECT, AS A VALUE. This is the assertion that was false before the
// fix: a freshly opened three-item menu answered 1.
eq("rovingIndex(-1, 3, 'previous')", rovingIndex(-1, 3, "previous"), 2);
eq("rovingIndex(-1, 2, 'previous')", rovingIndex(-1, 2, "previous"), 1);
eq("rovingIndex(-1, 1, 'previous')", rovingIndex(-1, 1, "previous"), 0);
eq("rovingIndex(-1, 3, 'next')", rovingIndex(-1, 3, "next"), 0);

console.log("\n== 2. and when something is ==");
eq("rovingIndex(0, 3, 'next')", rovingIndex(0, 3, "next"), 1);
eq("rovingIndex(2, 3, 'next') wraps", rovingIndex(2, 3, "next"), 0);
eq("rovingIndex(0, 3, 'previous') wraps", rovingIndex(0, 3, "previous"), 2);
eq("rovingIndex(1, 3, 'previous')", rovingIndex(1, 3, "previous"), 0);

console.log("\n== 3. every number a caller can actually produce ==");
// 0 · 1 · -1 · the length itself · NaN · Infinity · undefined — a list
// that is not rendered yet, a stale index, a querySelectorAll that
// answered nothing.
for (const dir of ["next", "previous"]) {
  eq(`rovingIndex(0, 0, '${dir}') — nothing to focus`, rovingIndex(0, 0, dir), null);
  eq(`rovingIndex(-1, 0, '${dir}')`, rovingIndex(-1, 0, dir), null);
  eq(`rovingIndex(0, -1, '${dir}') — a negative count`, rovingIndex(0, -1, dir), null);
  eq(`rovingIndex(0, NaN, '${dir}')`, rovingIndex(0, NaN, dir), null);
  eq(`rovingIndex(0, Infinity, '${dir}')`, rovingIndex(0, Infinity, dir), null);
  eq(`rovingIndex(0, undefined, '${dir}')`, rovingIndex(0, undefined, dir), null);
}
// An index past the end is "not in the list", same as -1.
eq("rovingIndex(3, 3, 'previous') — index === length", rovingIndex(3, 3, "previous"), 2);
eq("rovingIndex(9, 3, 'next') — index past the end", rovingIndex(9, 3, "next"), 0);
eq("rovingIndex(NaN, 3, 'previous')", rovingIndex(NaN, 3, "previous"), 2);
eq("rovingIndex(NaN, 3, 'next')", rovingIndex(NaN, 3, "next"), 0);
eq("rovingIndex(Infinity, 3, 'next')", rovingIndex(Infinity, 3, "next"), 0);
eq("rovingIndex(undefined, 3, 'next')", rovingIndex(undefined, 3, "next"), 0);
eq("rovingIndex(1.5, 3, 'next') — not an integer", rovingIndex(1.5, 3, "next"), 0);
// A fractional length is a count somebody computed wrong; floor it rather
// than let `% 2.5` produce a fractional index.
eq("rovingIndex(0, 2.5, 'next')", rovingIndex(0, 2.5, "next"), 1);
eq("rovingIndex(1, 2.5, 'next') wraps at 2", rovingIndex(1, 2.5, "next"), 0);

console.log("\n== 4. both menus use it, so neither can drift back ==");
for (const file of ["src/components/ui/card-menu.tsx", "src/components/ui/detail-panel.tsx"]) {
  const src = readFileSync(file, "utf8");
  check(`${file} calls rovingIndex`, /rovingIndex\(/.test(src));
  // The exact arithmetic that was wrong, in either menu's spelling.
  check(
    `${file} does not compute it inline again`,
    !/\(current - 1 \+ (?:list|tabs)\.length\) %/.test(src),
    "the `(current - 1 + len) % len` that sent ArrowUp to the wrong item"
  );
}

// ---------------------------------------------------------------------
console.log("\n== 5. a paywall that opens is the direction that costs money ==");
const { planMeetsMinimum, higherPlanSlug } = await loadTs("src/lib/billing/plans.ts");

check("free does not meet starter", planMeetsMinimum("free", "starter") === false);
check("starter meets starter", planMeetsMinimum("starter", "starter") === true);
check("ultimate meets starter", planMeetsMinimum("ultimate", "starter") === true);
check("starter does not meet ultimate", planMeetsMinimum("starter", "ultimate") === false);
// THE ONE THAT WAS TRUE FOR EVERYTHING. A minimum nobody ranked used to
// pass every plan, free included.
check(
  "an unranked minimum lets NOBODY through, not everybody",
  planMeetsMinimum("free", "team") === false &&
    planMeetsMinimum("ultimate", "team") === false &&
    planMeetsMinimum("enterprise", "") === false,
  JSON.stringify([planMeetsMinimum("free", "team"), planMeetsMinimum("ultimate", "team")])
);
check(
  "...including the prototype names a plain object answers to",
  ["constructor", "toString", "__proto__", "hasOwnProperty"].every(
    (k) => planMeetsMinimum("ultimate", k) === false && planMeetsMinimum(k, "starter") === false
  )
);
check("a tier that is not a plan meets nothing", planMeetsMinimum("legendary", "free") === false);
check("...and neither does an empty one", planMeetsMinimum("", "free") === false);

console.log("\n== 5b. the rank table cannot lose a plan ==");
// The array this replaced type-checked its ENTRIES and not its
// COMPLETENESS, which is exactly why the defect could arrive later.
const plansSrc = readFileSync("src/lib/billing/plans.ts", "utf8");
check(
  "PLAN_RANK is keyed by the slug union, so a missing plan is a type error",
  /const PLAN_RANK: Record<PlanSlug, number>/.test(plansSrc)
);
const slugs = [...(plansSrc.match(/export type PlanSlug = ([^;]+);/)?.[1] ?? "").matchAll(/"([a-z]+)"/g)].map(
  (m) => m[1]
);
check(`the slug union was read (${slugs.length})`, slugs.length >= 5, slugs.join(", "));
check(
  "every slug in the union ranks, and ranks distinctly",
  slugs.every((s) => planMeetsMinimum(s, s) === true) &&
    new Set(slugs.map((s) => slugs.filter((o) => planMeetsMinimum(s, o)).length)).size === slugs.length,
  slugs.map((s) => `${s}:${slugs.filter((o) => planMeetsMinimum(s, o)).length}`).join(" ")
);
check("higherPlanSlug still prefers the higher of two", higherPlanSlug("free", "growth") === "growth");
check("...and falls to free when neither is a plan", higherPlanSlug("nonsense", null) === "free");

// ---------------------------------------------------------------------
console.log("\n== 6. a tier nobody ranked does not buy a cheaper model ==");
const catalog = readFileSync("src/lib/ai/providers/catalog.ts", "utf8");
check(
  "an unknown tier returns null instead of dropping the filter",
  /const wanted = order\.indexOf\(tier\);[\s\S]{0,600}?if \(wanted < 0\) return null;/.test(catalog)
);
const charts = readFileSync("src/lib/data-analysis/charts.ts", "utf8");
check(
  "a column the headers do not have says so instead of drawing an empty chart",
  /if \(xIndex < 0 \|\| \(yColumn && yIndex < 0\)\) return/.test(charts)
);

// ---------------------------------------------------------------------
console.log("\n== 7. the population is still what was read ==");
// NOT A CEILING ON THE COUNT — a new indexOf is ordinary code. What this
// pins is that the scanner still finds them, so "the sites were reviewed"
// stays a statement about a list somebody can regenerate.
const scan = JSON.parse(
  execFileSync("node", ["scripts/scan-index-of.mjs", "--json"], { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 })
);
check(`the scanner finds the call sites (${scan.hits.length})`, scan.hits.length >= 50, String(scan.hits.length));
check(
  "...and classifies how each result is used",
  scan.hits.every((h) => typeof h.use === "string" && h.use.length > 0)
);
const inMenus = scan.hits.filter((h) => /card-menu|detail-panel/.test(h.file));
check(
  "neither menu computes an index it does not compare",
  inMenus.every((h) => h.use !== "arithmetic"),
  inMenus.map((h) => `${h.file}:${h.line} ${h.use}`).join(", ")
);

console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILED"}: ${pass} passed, ${failures.length} failed`);
if (failures.length > 0) process.exit(1);
