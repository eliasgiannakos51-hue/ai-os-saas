#!/usr/bin/env node
/*
 * CAN canned-answers.test.mjs SEE THE GREEK FOLD BREAK AGAIN?
 *
 * The knowledge base folded accents with its own regex and not the shared
 * one, so it missed the single thing Greek needs: toLowerCase() gives
 * ΣΥΝΔΡΟΜΗΣ a FINAL sigma, while a person typing the word produces a
 * plain σ. Same letter, different position, and this file called them
 * different words — so a Greek user asking how to cancel matched no
 * canned answer and the question fell through to a paid model call.
 *
 * The gate checks the fold BOTH ways: by folding real Greek word pairs,
 * and by requiring the shared fold in the source. Two mutations, one per
 * clause — the defect itself, which the word pairs catch, and a private
 * copy that gets THESE three pairs right, which only the source check
 * catches.
 *
 * A THIRD WAS TRIED AND DROPPED, because it cannot exist: undoing the
 * sigma fold after calling it (foldForMatch(text).replace(/σ/g,"ς")) maps
 * both sides of every pair the same way, so the pairs still match. Any
 * pure function that breaks a pair also fails "normalize strips accents"
 * or is a private copy, which is mutation 2. Writing a mutant that cannot
 * bite and calling it a hole would be worse than saying so here.
 *
 * Run: node scripts/tests/canned-answers.mutation.mjs
 */
import { readFileSync } from "node:fs";
import { writeFileSync } from "./lib/sidecar-write.mjs";
import { execFileSync } from "node:child_process";

const GATE = "scripts/tests/canned-answers.test.mjs";
const KB = "src/lib/support/knowledge-base.ts";
const TARGETS = [GATE, KB];

const MUTANTS = [
  {
    // 1. THE DEFECT ITSELF: the private fold comes back, final sigma and
    // all. Every Greek word ending in ς stops matching its trigger.
    name: "the knowledge base folds with its own regex again",
    file: KB,
    from: "  return foldForMatch(text)\n",
    to: '  return text\n    .toLowerCase()\n    .normalize("NFD")\n    .replace(/[\\u0300-\\u036f]/g, "")\n',
    expect: "fold to the same word",
  },
  {
    // 2. THE SOURCE CLAUSE, ISOLATED. A private copy of the fold that
    // happens to get these three pairs right: the word pairs pass, and
    // only "it uses the shared fold" can catch it. That is the clause
    // that stops the next drift, not this round's three words.
    name: "a private copy of the fold replaces the shared one",
    file: KB,
    from: "  return foldForMatch(text)\n",
    to: '  return String(text).replace(/\u03c2/g, "\u03c3").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")\n',
    expect: "the knowledge base folds with lib/text/unicode-patterns, not its own regex",
  },
];

function runGate() {
  try {
    execFileSync(process.execPath, [GATE], { encoding: "utf8", stdio: "pipe" });
    return { green: true, failed: [] };
  } catch (e) {
    const out = String(e.stdout ?? "") + String(e.stderr ?? "");
    return { green: false, failed: [...out.matchAll(/^ {2}FAIL {2}(.+)$/gm)].map((m) => m[1].trim()) };
  }
}

console.log("canned-answers mutations\n");

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
console.log("The Greek fold in canned-answers.test.mjs is load-bearing.");
