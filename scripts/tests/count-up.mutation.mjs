#!/usr/bin/env node
/*
 * CAN count-up.test.mjs SEE A STAT COUNT UP TO THE WRONG NUMBER?
 *
 * The old comma-only parse, and a decimal counted up as if whole.
 *
 * Run: node scripts/tests/count-up.mutation.mjs
 */
import { readFileSync } from "node:fs";
import { writeFileSync } from "./lib/sidecar-write.mjs";
import { execFileSync } from "node:child_process";

const GATE = "scripts/tests/count-up.test.mjs";
const LIB = "src/lib/leading-number.ts";
const TARGETS = [GATE, LIB];

const MUTANTS = [
  {
    name: "only English's comma is a thousands separator again",
    file: LIB,
    from: "    const grouped = /^\\d{1,3}([,.\\u00a0\\u202f' ])\\d{3}(?:\\1\\d{3})*$/.exec(digits);",
    to: "    const grouped = /^\\d{1,3}(,)\\d{3}(?:\\1\\d{3})*$/.exec(digits);\n    if (!grouped) return { prefix: match[1], number: Math.trunc(Number(digits.replace(/,/g, \"\"))), suffix: match[3] };",
    expect: "ten thousand",
  },
  {
    name: "a decimal is counted up as if it were whole",
    file: LIB,
    from: "    if (!grouped) return null;",
    to: "    if (!grouped) return { prefix: match[1], number: Math.round(Number(digits.replace(\",\", \".\"))), suffix: match[3] };",
    expect: "is not counted up",
  },
  // NOT A MUTANT: letting two different separators pass as one grouping
  // ([,.] in place of \1). It was written and stayed green, and rightly:
  // the digits are split on the FIRST separator only, so "1,234.567"
  // becomes "1234.567", which the integer check refuses — the number is
  // shown as written either way. Equivalent, so it is not in the list.
];

function runGate() {
  try {
    execFileSync(process.execPath, [GATE], { encoding: "utf8", stdio: "pipe", timeout: 60_000 });
    return { green: true, failed: [] };
  } catch (e) {
    const out = String(e.stdout ?? "") + String(e.stderr ?? "");
    return {
      green: false,
      failed: [...out.matchAll(/^ {2}FAIL {2}(.+)$/gm)].map((m) => m[1].trim()),
    };
  }
}

console.log("count-up mutations\n");

const originals = new Map(TARGETS.map((f) => [f, readFileSync(f, "utf8")]));
const restoreAll = () => {
  for (const [file, text] of originals) writeFileSync(file, text);
};

let caught = 0;
const missed = [];
try {
  const base = runGate();
  console.log(`baseline: the gate is ${base.green ? "GREEN" : "RED"} on the unmutated tree`);
  if (!base.green) {
    console.log(`\nBASELINE IS RED.\n  ${base.failed.join("\n  ")}`);
    process.exit(1);
  }

  for (const m of MUTANTS) {
    if (!originals.get(m.file).includes(m.from)) {
      missed.push({ ...m, why: `the mutation target no longer exists in ${m.file}` });
      console.log(`  STALE   ${m.name}`);
      continue;
    }
    writeFileSync(m.file, originals.get(m.file).replace(m.from, m.to));
    let result;
    try {
      result = runGate();
    } finally {
      restoreAll();
    }
    if (result.green) {
      missed.push({ ...m, why: "the gate stayed green — nothing here is load-bearing" });
      console.log(`  MISSED  ${m.name}`);
      continue;
    }
    const onTarget = result.failed.filter((f) => f.includes(m.expect));
    if (onTarget.length === 0) {
      missed.push({ ...m, why: `red on "${result.failed.slice(0, 4).join('", "')}" — nothing matching "${m.expect}"` });
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
console.log(
  after.green
    ? "\nbaseline: the gate is green again on the restored tree"
    : "\nBASELINE IS RED — a mutation was not restored. Check `git status`.",
);
console.log(`\n${caught} of ${MUTANTS.length} mutations caught.`);
if (missed.length > 0 || !after.green) {
  if (missed.length > 0) {
    console.log("\nHOLES:");
    for (const m of missed) console.log(`  - ${m.name}\n    ${m.why}`);
  }
  process.exit(1);
}
console.log("Every clause of the gate is load-bearing.");
