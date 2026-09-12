#!/usr/bin/env node
/*
 * THE TABLE THAT SHOWED "—" IN EVERY ROW.
 *
 * The margin report is the one screen that says whether the business is
 * making money on each feature, and it spent a period showing a dash for
 * every one of them: PostgREST returns numerics as STRINGS, `typeof "4.2"
 * === "number"` is false, and every margin was discarded as unreadable.
 * Nothing was broken enough to fail; the answer was simply absent.
 *
 * So the mutants below are the two ways this screen lies. It can go blank
 * — a null read as unreadable, a string coerced to NaN — or it can go
 * QUIET, which is worse: a feature losing money that no longer trips the
 * below-target flag, an unknown margin rendered as 0 and averaged in as if
 * somebody had measured it.
 *
 * Run: node scripts/tests/margin-report.mutation.mjs
 */
import { readFileSync } from "node:fs";
import { writeFileSync } from "./lib/sidecar-write.mjs";
import { execFileSync } from "node:child_process";

const GATE = "scripts/tests/margin-report.test.mjs";
const LIB = "src/lib/billing/margin-report.ts";

const MUTANTS = [
  {
    // THE BUSINESS FLOOR. Below-target is the only thing on this screen
    // that asks for action; raise the bar to zero and nothing is ever
    // flagged, however much money a feature loses.
    name: "the margin target drops to zero, so no feature is ever flagged as below it",
    file: LIB,
    from: "export const MARGIN_TARGET = 4;",
    to: "export const MARGIN_TARGET = 0;",
    expect: "below",
  },
  {
    // The comparison flips. Every healthy feature is reported as a
    // problem and every failing one as fine — a screen that is exactly
    // wrong is read for longer than one that is blank.
    name: "the below-target comparison is inverted",
    file: LIB,
    from: "    if (margin < MARGIN_TARGET) belowTarget.push({ feature: row.feature, margin, hypothetical });",
    to: "    if (margin > MARGIN_TARGET) belowTarget.push({ feature: row.feature, margin, hypothetical });",
    expect: "below",
  },
  {
    // NULL IS NOT ZERO, and this is the distinction the whole file turns
    // on. An unknown margin counted as 0 drags every average down and
    // invents a below-target feature nobody can act on.
    name: "an unknown margin is read as zero instead of as unknown",
    file: LIB,
    from: "    const stored = row.achieved_margin === null ? null : Number(row.achieved_margin);",
    to: "    const stored = Number(row.achieved_margin ?? 0);",
    expect: "null",
  },
  {
    // THE REPORTED BUG. PostgREST hands numerics back as strings; a
    // typeof check on the raw value discards every one of them, which is
    // how the table came to show a dash in every row.
    name: "a numeric arriving as a string is discarded again — the dash-in-every-row bug",
    file: LIB,
    from: "  const cost = Number(row.real_cost_eur ?? 0);",
    to: "  const cost = typeof row.real_cost_eur === \"number\" ? row.real_cost_eur : 0;",
    expect: "its would-be margin is computed",
  },
  {
    // The table is sorted by cost so the expensive features are read
    // first. Reversed, the screen opens on the rows that cost nothing and
    // the ones worth acting on are below the fold.
    name: "the table is sorted cheapest-first, burying the features that cost real money",
    file: LIB,
    from: "    .sort((x, y) => y.totalCostEur - x.totalCostEur);",
    to: "    .sort((x, y) => x.totalCostEur - y.totalCostEur);",
    expect: "the costliest feature is first",
  },
  {
    // A zero or negative cost cannot produce a margin — dividing by it
    // gives Infinity, which renders as a very healthy number indeed.
    name: "a zero real cost yields Infinity instead of an unknown margin",
    file: LIB,
    from: "  if (!Number.isFinite(cost) || cost <= 0) return null;",
    to: "  if (!Number.isFinite(cost)) return null;",
    expect: "null, never Infinity",
  },
];

function runGate() {
  try {
    execFileSync(process.execPath, [GATE], { encoding: "utf8", stdio: "pipe" });
    return { green: true, failed: [] };
  } catch (e) {
    const out = String(e.stdout ?? "") + String(e.stderr ?? "");
    const failed = [...out.matchAll(/^ {2}FAIL {2}(.+)$/gm)].map((m) => m[1].trim());
    return { green: false, failed: failed.length ? failed : ["(exited non-zero with no FAIL line)"] };
  }
}

console.log("margin-report mutations\n");
const original = readFileSync(LIB, "utf8");
const restore = () => writeFileSync(LIB, original);

let caught = 0;
const missed = [];
try {
  const base = runGate();
  console.log(`baseline: the gate is ${base.green ? "GREEN" : "RED"} on the unmutated tree`);
  if (!base.green) {
    console.log(`\nBASELINE IS RED — no result below would mean anything.\n  ${base.failed.join("\n  ")}`);
    process.exit(1);
  }
  for (const m of MUTANTS) {
    if (!original.includes(m.from)) {
      missed.push({ ...m, why: `the mutation target no longer exists in ${m.file}` });
      console.log(`  STALE   ${m.name}`);
      continue;
    }
    writeFileSync(LIB, original.replace(m.from, m.to));
    let result;
    try { result = runGate(); } finally { restore(); }
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
  restore();
}

const after = runGate();
console.log(after.green ? "\nbaseline: green again on the restored tree" : "\nBASELINE IS RED — a mutation was not restored.");
console.log(`\n${caught} of ${MUTANTS.length} mutations caught.`);
if (missed.length > 0 || !after.green) {
  if (missed.length) { console.log("\nHOLES:"); for (const m of missed) console.log(`  - ${m.name}\n    ${m.why}`); }
  process.exit(1);
}
console.log("This screen cannot go blank, or go quiet about a feature losing money, without this going red.");
