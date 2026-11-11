#!/usr/bin/env node
/*
 * CAN locale-allowed-staleness.test.mjs SEE THE STALE-EXEMPTION CHECK GO
 * AWAY AGAIN?
 *
 * Each mutation below removes one of the three ways check-i18n.js now
 * catches a stale LOCALE_ALLOWED entry (FD2, 2026-11-09), and the gate
 * must go red on the clause that names it.
 *
 * Run: node scripts/tests/locale-allowed-staleness.mutation.mjs
 */
import { readFileSync } from "node:fs";
import { writeFileSync } from "./lib/sidecar-write.mjs";
import { execFileSync } from "node:child_process";

const GATE = "scripts/tests/locale-allowed-staleness.test.mjs";
const BUILD_GATE = "scripts/check-i18n.js";
const TARGETS = [GATE, BUILD_GATE];

const MUTANTS = [
  {
    name: "the gate stops re-checking LOCALE_ALLOWED entries at all",
    file: BUILD_GATE,
    from: "for (const entry of LOCALE_ALLOWED) {",
    to: "for (const entry of []) {",
    expect: "check-i18n.js re-checks every LOCALE_ALLOWED entry against the files on disk",
  },
  {
    name: "a key missing from en.json is no longer caught",
    file: BUILD_GATE,
    from: "failures.push(`${entry}: STALE LOCALE_ALLOWED — this key no longer exists in en.json, remove the entry`);",
    to: "void 0;",
    expect: "a key the entry names that no longer exists in en.json is caught",
  },
  {
    name: "a key missing from the locale file is no longer caught",
    file: BUILD_GATE,
    from:
      "failures.push(`${entry}: STALE LOCALE_ALLOWED — this key no longer exists in ${loc}.json, remove the entry`);",
    to: "void 0;",
    expect: "a key the entry names that no longer exists in the locale file is caught",
  },
  {
    name: "a pair that no longer coincides is no longer caught",
    file: BUILD_GATE,
    from: "if (target[key] !== en[key]) {",
    to: "if (false) {",
    expect: "a pair that no longer coincides (translated, or English changed) is caught",
  },
];

function runGate() {
  try {
    execFileSync(process.execPath, [GATE], { encoding: "utf8", stdio: "pipe" });
    return { green: true, failed: [] };
  } catch (e) {
    const out = String(e.stdout ?? "") + String(e.stderr ?? "");
    return {
      green: false,
      failed: [...out.matchAll(/^ {2}FAIL {2}(.+)$/gm)].map((m) => m[1].trim()),
    };
  }
}

console.log("locale-allowed-staleness mutations\n");

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
    console.log(`\nBASELINE IS RED — no mutation result below would mean anything.\n  ${base.failed.join("\n  ")}`);
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
      missed.push({
        ...m,
        why: `the gate went red, but on "${result.failed.slice(0, 4).join('", "')}" — nothing matching "${m.expect}"`,
      });
      console.log(`  WRONG   ${m.name}\n          -> red on: ${result.failed.slice(0, 4).join(" | ")}`);
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
    : "\nBASELINE IS RED — a mutation was not restored. Check `git diff`."
);

console.log(`\n${caught} of ${MUTANTS.length} mutations caught.`);
if (missed.length > 0 || !after.green) {
  if (missed.length > 0) {
    console.log("\nHOLES:");
    for (const m of missed) console.log(`  - ${m.name}\n    ${m.why}`);
  }
  process.exit(1);
}
console.log("Every clause of locale-allowed-staleness.test.mjs that these reach is load-bearing.");
