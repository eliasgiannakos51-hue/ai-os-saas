#!/usr/bin/env node
/*
 * THREE SCRAPERS THAT COULD RETURN NOTHING AND STILL SAY 307 PASSED.
 *
 * db-migrations.test.mjs asks whether the code only reads tables, RPCs and
 * columns the migrations actually build. Every one of those questions is a
 * DIFFERENCE — the offenders are what the code asks for MINUS what the
 * migrations create — and a difference against an empty left-hand side is
 * empty. So a scraper that stops matching does not make this gate red. It
 * makes it vacuous, and vacuous prints exactly what healthy prints.
 *
 * That was true here until 2026-09-11. Replacing `usedTables` and
 * `usedRpcs` with `new Set()`, and `staticColumns` with `new Map()`, left
 * the output byte-identical to the real run: "ALL PASS: 307 passed, 0
 * failed". Three of them, in the one gate that stands between the code and
 * a schema applied by hand with no ledger.
 *
 * It was found by asking a different question than usual — not "is this
 * check wrong" but "does this gate PRINT a number it never judges", which
 * schema-canaries.test.mjs had failed the same way a day earlier.
 *
 * The first three mutants below empty those three scrapers outright. The
 * last two break them PARTIALLY — the underscore leaves the character
 * class, so nearly every real table and function name stops matching —
 * because that is the break a floor can plausibly be set too low to see.
 * The note under MUTANTS says which mutants were removed from the first
 * draft and why they were not defects at all.
 *
 * Run: node scripts/tests/db-migrations.mutation.mjs
 */
import { readFileSync } from "node:fs";
import { writeFileSync } from "./lib/sidecar-write.mjs";
import { execFileSync } from "node:child_process";

const GATE = "scripts/tests/db-migrations.test.mjs";

const MUTANTS = [
  {
    // THE DEFECT, VERBATIM. The table scraper matches nothing.
    name: "the table scraper returns nothing — sections 4 and 7 become differences against an empty set",
    from: 'const usedTables = new Set([...src.matchAll(/\\.from\\(["\'`]([a-z_]+)["\'`]\\)/g)].map((m) => m[1]));',
    to: "const usedTables = new Set();",
    expect: "the source scan found call sites",
  },
  {
    name: "the RPC scraper returns nothing, so no missing function can be reported",
    from: 'const usedRpcs = new Set([...src.matchAll(/\\.rpc\\(["\'`]([a-z_]+)["\'`]/g)].map((m) => m[1]));',
    to: "const usedRpcs = new Set();",
    expect: "the source scan found call sites",
  },
  {
    name: "the migration column parser returns nothing, so every column the code touches is 'fine'",
    from: "const staticColumns = tableColumnsFromMigrationText(commentFreeCode);",
    to: "const staticColumns = new Map();",
    expect: "columns were parsed from the migration text",
  },
  {
    // A PARTIAL BREAK, which is the one a floor can plausibly miss. Drop
    // the underscore from the character class and every table whose name
    // has one — user_websites, ai_agents, generated_posts, nearly all of
    // them — silently leaves the set. That is a real defect and a subtler
    // one than an empty scraper, so the floor has to be set low enough to
    // be reachable and high enough to catch this.
    name: "the table scraper stops matching underscores, losing most of the schema",
    from: 'const usedTables = new Set([...src.matchAll(/\\.from\\(["\'`]([a-z_]+)["\'`]\\)/g)].map((m) => m[1]));',
    to: 'const usedTables = new Set([...src.matchAll(/\\.from\\(["\'`]([a-z]+)["\'`]\\)/g)].map((m) => m[1]));',
    expect: "the source scan found call sites",
  },
  {
    name: "the RPC scraper stops matching underscores, losing nearly every function",
    from: 'const usedRpcs = new Set([...src.matchAll(/\\.rpc\\(["\'`]([a-z_]+)["\'`]/g)].map((m) => m[1]));',
    to: 'const usedRpcs = new Set([...src.matchAll(/\\.rpc\\(["\'`]([a-z]+)["\'`]/g)].map((m) => m[1]));',
    expect: "the source scan found call sites",
  },
];

// WHAT IS DELIBERATELY NOT HERE, and why — because the first draft had it
// and it was wrong.
//
// Three mutants lowered the floors themselves ("usedTables.size >= 0",
// "staticColumns.size >= 0", dropping the RPC half of the conjunction).
// All three were MISSED, and correctly so: a weakened guard is not a
// defect on a tree that does not violate it. The real tree has 86 tables
// and 110 parsed column sets, so a floor of zero and a floor of sixty
// agree on it, and there is nothing for the gate to go red about.
//
// A weakening is only visible in combination with the break it stops
// catching, which is exactly what mutants 1-3 already demonstrate from the
// other side. Keeping them would have reported three permanent HOLES in a
// suite with no holes — a mutation suite lying about its own coverage,
// which is the failure mutation-runner-honesty.test.mjs exists for.

function runGate() {
  try {
    const out = execFileSync(process.execPath, [GATE], { encoding: "utf8", stdio: "pipe" });
    return { green: true, failed: [], out };
  } catch (e) {
    const out = String(e.stdout ?? "") + String(e.stderr ?? "");
    const failed = [...out.matchAll(/^ {2}FAIL {2}(.+)$/gm)].map((m) => m[1].trim());
    return { green: false, failed: failed.length ? failed : ["(exited non-zero with no FAIL line)"], out };
  }
}

console.log("db-migrations mutations\n");
const original = readFileSync(GATE, "utf8");
const restore = () => writeFileSync(GATE, original);

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
      missed.push({ ...m, why: `the mutation target no longer exists in ${GATE}` });
      console.log(`  STALE   ${m.name}`);
      continue;
    }
    writeFileSync(GATE, original.replace(m.from, m.to));
    let result;
    try { result = runGate(); } finally { restore(); }
    if (result.green) {
      missed.push({ ...m, why: "the gate stayed green — the whole section is measuring nothing and saying PASS" });
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
console.log("No scraper in this gate can go quiet without the gate going red.");
