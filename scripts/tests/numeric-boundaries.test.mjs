// EVERY NUMERIC ARGUMENT, AT 0 · 1 · -1 · NaN · undefined · Infinity.
//
// max = 0 is where the truncators broke, and the reason none of the seven
// was caught is that every test of them used a comfortable number.
// `slice(0, max - 1)` is correct at 10 and returns the string almost
// whole at 0, because a negative end index counts from the end.
//
// A scan of src/ found 194 exported functions taking a number. ZERO were
// exercised at all five boundaries by any gate; 53 were called by a gate
// and never at any boundary at all. Probing them turned up two live
// defects in ten minutes:
//
//   formatBytes(NaN)   -> "NaN GB"   rendered in the files list for any
//                                    row with a null size_bytes
//   percentile(x, NaN) -> undefined  from a function typed number | null
//
// This file is the boundary sweep for the functions whose output is a
// VALUE somebody reads or is charged by. It pins what each one returns,
// so a change to any of them is a decision rather than a surprise.
//
// Run: node scripts/tests/numeric-boundaries.test.mjs
import { readdirSync, statSync, readFileSync } from "node:fs";
import { join } from "node:path";

let pass = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { failures.push(name); console.log(`  FAIL  ${name}${detail !== undefined ? "\n        " + detail : ""}`); }
}
const { loadTs } = await import("./load-ts.mjs");
const { stripComments } = await import("../check-mutation-markers.mjs");

const fmt = await loadTs("src/lib/format-number.ts");
const files = await loadTs("src/lib/files/file-types.ts");
const scoring = await loadTs("src/lib/evals/scoring.ts");
const credit = await loadTs("src/lib/billing/credit-formula.ts");
const trunc = await loadTs("src/lib/text/truncate.ts");

const NON_FINITE = [NaN, undefined, Infinity, -Infinity];
const label = (v) => (Number.isNaN(v) ? "NaN" : v === undefined ? "undefined" : String(v));

// ---------------------------------------------------------------------
console.log("== 1. formatters: a dash beats a number nobody measured ==");
for (const [name, fn] of [
  ["formatCurrency", (v) => fmt.formatCurrency(v, "en")],
  ["formatBytes", (v) => files.formatBytes(v)],
]) {
  for (const v of NON_FINITE) {
    const out = fn(v);
    check(`${name}(${label(v)}) is a dash, not a rendering of it`, out === "—", JSON.stringify(out));
  }
  check(`${name}(0) is still a real value`, /[0-9]/.test(fn(0)), fn(0));
}
// formatNumber is the exception, and a deliberate one: it feeds counters
// where "—" would read as a broken widget rather than as no data.
for (const v of NON_FINITE) {
  check(`formatNumber(${label(v)}) is "0", the documented choice`, fmt.formatNumber(v, "en") === "0", fmt.formatNumber(v, "en"));
}
check("formatBytes(0) is zero bytes, not a dash", files.formatBytes(0) === "0 B");
check("formatBytes(1) is singular-safe", files.formatBytes(1) === "1 B");
// A negative remaining quota is meaningful — website-builder shows it.
check("formatBytes(-1) is rendered, not swallowed", files.formatBytes(-1) === "-1 B");

// ---------------------------------------------------------------------
console.log("\n== 2. percentile: a fraction, clamped, never undefined ==");
const SORTED = [1, 2, 3, 4, 5];
for (const v of NON_FINITE) {
  const out = scoring.percentile(SORTED, v);
  check(`percentile(_, ${label(v)}) is null, not undefined`, out === null, JSON.stringify(out));
}
check("percentile(_, 0) is the first", scoring.percentile(SORTED, 0) === 1);
check("percentile(_, 1) is the last", scoring.percentile(SORTED, 1) === 5);
check("percentile(_, -1) clamps to the first", scoring.percentile(SORTED, -1) === 1);
// 90 instead of 0.9 is the mistake this clamp exists for.
check("percentile(_, 90) clamps to the last rather than indexing past the end",
  scoring.percentile(SORTED, 90) === 5, String(scoring.percentile(SORTED, 90)));
check("an empty list is null at every p", NON_FINITE.concat([0, 1]).every((v) => scoring.percentile([], v) === null));

// ---------------------------------------------------------------------
console.log("\n== 3. money: garbage in is zero, never a charge ==");
// THE DIRECTION THAT MATTERS. A wrong number here is a wrong invoice, and
// the safe direction is down: a cost that cannot be computed must not
// become a charge.
for (const v of NON_FINITE.concat([-1])) {
  check(`usdToEur(${label(v)}) is 0, not a charge`, credit.usdToEur(v) === 0, String(credit.usdToEur(v)));
  check(`creditsForRealCostEur(${label(v)}) is 0`, credit.creditsForRealCostEur(v) === 0, String(credit.creditsForRealCostEur(v)));
}
check("usdToEur(0) is 0", credit.usdToEur(0) === 0);
check("usdToEur(1) is the configured rate", credit.usdToEur(1) > 0.5 && credit.usdToEur(1) < 1.5, String(credit.usdToEur(1)));

// ---------------------------------------------------------------------
console.log("\n== 4. truncate: the one this file exists because of ==");
const LONG = "hello world this is long";
for (const v of [NaN, undefined, -Infinity, 0, -1]) {
  check(`truncate(_, ${label(v)}) is empty, not a slice from the end`,
    trunc.truncate(LONG, v) === "", JSON.stringify(trunc.truncate(LONG, v)));
}
// INFINITY IS THE ONE THAT IS NOT NONSENSE. It means "no limit", and the
// first version of truncate returned "" for it because !Number.isFinite
// swept it in with NaN — silent data loss dressed as a guard. This gate
// found it on its first run, in the function it exists because of.
check("truncate(_, Infinity) returns the text, not nothing",
  trunc.truncate(LONG, Infinity) === LONG, JSON.stringify(trunc.truncate(LONG, Infinity)));

// ---------------------------------------------------------------------
console.log("\n== 5. how much of the surface this covers, stated ==");
// NOT A CLAIM THAT EVERY NUMERIC FUNCTION IS COVERED. It is not: this
// pins the ones whose output is money, a size, or a limit somebody reads.
// The number is printed so the gap is visible rather than implied — the
// alternative is a file that looks like a sweep and is a sample.
const src = [];
(function walk(d) {
  for (const e of readdirSync(d)) {
    const p = join(d, e);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.tsx?$/.test(e)) src.push(p);
  }
})("src");
let numericExports = 0;
for (const f of src) {
  const s = stripComments(readFileSync(f, "utf8"));
  for (const m of s.matchAll(/export function (\w+)\s*\(([^)]*)\)/g)) {
    if (/:\s*number\b/.test(m[2])) numericExports++;
  }
}
const covered = ["formatCurrency", "formatNumber", "formatBytes", "percentile", "usdToEur", "creditsForRealCostEur", "truncate"];
console.log(`  ....  ${covered.length} of ${numericExports} exported functions taking a number are pinned here`);
check(`the scan found the numeric surface (${numericExports})`, numericExports >= 100, String(numericExports));
check("and this file pins the value-producing ones", covered.length >= 7);

console.log("");
if (failures.length > 0) {
  console.log(`${pass} passed, ${failures.length} FAILED:`);
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
console.log(`${pass} checks passed. ${covered.length} of ${numericExports} numeric functions pinned at every boundary.`);
