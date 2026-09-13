#!/usr/bin/env node
/*
 * THE HYDRATION CRASH THAT ONLY HAPPENED IN GREEK, AND THEN ONLY IN ITALIAN.
 *
 * 27 call sites formatted with a bare `value.toLocaleString()`. No locale
 * argument means the JavaScript RUNTIME decides, and this app renders every
 * one of them twice — Node on the server, the browser on the client. 1000
 * is "1,000" in Node and "1.000" in a Greek browser, React finds the text
 * does not match, and the whole server-rendered tree is thrown away.
 *
 * Then the second half, which passing the right locale did NOT fix: Node 22
 * and Chromium ship different CLDR vintages and genuinely disagree about
 * whether four digits are grouped. `useGrouping: "always"` is what makes
 * the output a pure function of (locale, value) — and /signup's plan tiers
 * are 1,000 and 3,000, squarely in the window.
 *
 * So the mutants are the two halves and the sweep that keeps them from
 * coming back: the runtime deciding again, the CLDR window reopening, a
 * call site quietly falling back to DEFAULT_LOCALE, and the walk over src/
 * that every one of those "offenders is empty" checks depends on.
 *
 * Run: node scripts/tests/locale-formatting.mutation.mjs
 */
import { readFileSync } from "node:fs";
import { writeFileSync } from "./lib/sidecar-write.mjs";
import { execFileSync } from "node:child_process";

const GATE = "scripts/tests/locale-formatting.test.mjs";
const HELPER = "src/lib/format-number.ts";
const CALLER = "src/components/agents/depth-picker.tsx";

const MUTANTS = [
  {
    // THE CLDR WINDOW, REOPENED. The locale is still correct on both
    // sides; Node and Chromium simply disagree about whether 1000 is
    // grouped, and /signup mismatches in Italian only.
    name: "useGrouping stops being pinned, so the runtime's CLDR decides again",
    file: HELPER,
    from: '  return new Intl.NumberFormat(locale, { useGrouping: "always" }).format(value);',
    to: "  return new Intl.NumberFormat(locale).format(value);",
    expect: "pins useGrouping",
  },
  {
    // NaN RENDERED AS "NaN". The guard is what turns a bad value into a
    // zero instead of into text on a plan card; without it the next bug
    // upstream ships as a visible string rather than a caught one.
    name: "formatNumber stops rejecting a non-finite value",
    file: HELPER,
    from: '  if (!Number.isFinite(value)) return "0";',
    to: "",
    expect: "non-finite value",
  },
  {
    // "Invalid Date" ON A CARD. `all: true` because three formatters
    // carry this guard and the gate now executes two of them — removing
    // one copy while the others answer for it is how the old text-regex
    // version of that check stayed green.
    // "Invalid Date" ON A CARD. new Date("") is a valid Date object with a
    // NaN time; Intl.DateTimeFormat throws a RangeError on it, which in a
    // Server Component is a 500 rather than an empty cell.
    name: "the date formatters stop rejecting an invalid date",
    file: HELPER,
    from: '  if (Number.isNaN(date.getTime())) return "";',
    to: "",
    all: true,
    expect: "reject an invalid date",
  },
  {
    // THE ORIGINAL DEFECT, PUT BACK IN A REAL COMPONENT. This is the exact
    // expression the sweep exists to keep out, in a file that renders on
    // both sides of the wire.
    name: "a component formats a number with a bare toLocaleString() again",
    file: CALLER,
    from: "{fact ? formatNumber(fact.credits, locale) : \"—\"}",
    to: "{fact ? fact.credits.toLocaleString() : \"—\"}",
    expect: "no bare toLocale",
  },
  {
    // THE QUIETER HALF. The helper still formats, the locale argument is
    // simply missing, and DEFAULT_LOCALE takes over — so a German reader
    // gets Greek grouping and the page looks merely wrong rather than
    // broken.
    name: "a call site drops the locale and falls back to DEFAULT_LOCALE",
    file: CALLER,
    from: "formatNumber(fact.credits, locale)",
    to: "formatNumber(fact.credits)",
    expect: "omits the locale",
  },
  {
    // THE SWEEP THAT SWEEPS NOTHING. Sections 2, 4 and 5 all build an
    // offender list by walking src/ and then assert it is EMPTY. A walk
    // that stops at the top level leaves every one of those green while
    // reading twelve files.
    name: "the source walk stops descending into directories",
    file: GATE,
    from: "    if (statSync(p).isDirectory()) out.push(...walk(p));",
    to: "    if (statSync(p).isDirectory()) out.push(...[]);",
    expect: "the sources scan found",
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

console.log("locale-formatting mutations\n");
const TARGETS = [...new Set(MUTANTS.map((m) => m.file))];
const originals = new Map(TARGETS.map((f) => [f, readFileSync(f, "utf8")]));
const restoreAll = () => { for (const [f, t] of originals) writeFileSync(f, t); };

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
    const original = originals.get(m.file);
    if (!original.includes(m.from)) {
      missed.push({ ...m, why: `the mutation target no longer exists in ${m.file}` });
      console.log(`  STALE   ${m.name}`);
      continue;
    }
    writeFileSync(m.file, m.all ? original.split(m.from).join(m.to) : original.replace(m.from, m.to));
    let result;
    try { result = runGate(); } finally { restoreAll(); }
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
console.log(after.green ? "\nbaseline: green again on the restored tree" : "\nBASELINE IS RED — a mutation was not restored.");
console.log(`\n${caught} of ${MUTANTS.length} mutations caught.`);
if (missed.length > 0 || !after.green) {
  if (missed.length) { console.log("\nHOLES:"); for (const m of missed) console.log(`  - ${m.name}\n    ${m.why}`); }
  process.exit(1);
}
console.log("Neither runtime can be left to decide how a number is written without this going red.");
