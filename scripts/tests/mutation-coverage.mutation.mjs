#!/usr/bin/env node
/*
 * THE COUNTER THAT SAYS HOW MANY GATES CAN FAIL — can it fail?
 *
 * mutation-coverage.test.mjs prints one number on every build, and that
 * number is the one the next person will trust when deciding whether the
 * gates mean anything. Every way it can go quietly wrong makes the number
 * MOVE rather than break: a reader that stops matching lowers it, a
 * ratchet left behind stops noticing, an exemption check that no longer
 * checks lets a bare gate be waved through with a sentence.
 *
 * The first draft of that file exempted ITSELF from having a suite, on
 * the ground that mutating a counter to prove the counter notices is
 * ritual. It reads well and it is wrong: a lowered number gets the
 * RATCHET lowered, not the reader fixed. This is the file that stops that.
 *
 * EVERY MUTATION IS AN EDIT OF REAL CODE, never an `if (false)`:
 * scripts/check-mutation-markers.mjs fails the build on that literal, so a
 * mutation written that way is "caught" by the marker gate without any
 * behavioural check having looked at it.
 *
 * Run: node scripts/tests/mutation-coverage.mutation.mjs
 */
import { readFileSync } from "node:fs";
import { writeFileSync } from "./lib/sidecar-write.mjs";
import { execFileSync } from "node:child_process";

const GATE = "scripts/tests/mutation-coverage.test.mjs";
const COV = "scripts/tests/mutation-coverage.test.mjs";
const TARGETS = [...new Set([COV])];

const MUTANTS = [
  {
    // 1. THE READER STOPS SEEING ANYTHING BUT .test.mjs, so every suite
    // driving an itest, dbtest or prodtest vanishes from the count and
    // the ratio silently drops.
    name: "the reader stops recognising anything but a plain .test.mjs target",
    file: COV,
    from: '/"scripts\\/tests\\/([a-z0-9-]+\\.(?:db|i|prod)?test\\.mjs)"/g',
    to: '/"scripts\\/tests\\/([a-z0-9-]+\\.test\\.mjs)"/g',
    all: true,
    expect: "mutation coverage is",
  },
  {
    // 2. THE RATCHET IS LEFT BEHIND — the "baseline set to the size of
    // the problem" shape, which stops noticing most of the suites going
    // missing while still printing a green line.
    name: "the ratchet drifts far below the real count",
    file: COV,
    from: "const RATCHET = ",
    to: "const RATCHET = 30 + 0 * ",
    expect: "is within 5 of the real count",
  },
  {
    // 3. THE ASSERTION COUNTER LOSES ITS LINE ANCHOR, so a commented-out
    // check and an identifier merely ENDING in "check" both count — and
    // the "small" exemption ground stops meaning anything.
    name: "the assertion counter stops anchoring at the start of the line",
    file: COV,
    from: "/^[ \\t]*(?:check|ok|eq|expect)\\w*\\(/gm",
    to: "/(?:check|ok|eq|expect)\\w*\\(/gm",
    expect: "the assertion counter counts calls, not the word",
  },
  {
    // 4. AN EXEMPTION FOR A GATE THAT NO LONGER EXISTS STOPS BEING A
    // FAULT, so the register keeps sentences about files nobody has.
    name: "the validator stops noticing an exemption for a gate that is gone",
    file: COV,
    from: "if (!known.includes(gate)) out.push(`${gate}: exempted, but no such gate`);",
    to: "if (false !== false) out.push(`${gate}: exempted, but no such gate`);",
    expect: "an exemption for a gate that is gone",
  },
  {
    // 5. AND THE "SMALL" GROUND STOPS BEING MEASURED, which is the whole
    // difference between an argued exemption and a silent one: a gate
    // exempted at two assertions keeps the exemption at forty.
    name: "a \"small\" exemption is no longer measured against the gate",
    file: COV,
    from: "      if (n > SMALL_CEILING) out.push(",
    to: "      if (n < 0) out.push(",
    expect: "a \"small\" exemption for a gate that is not small",
  },
  {
    // 6. THE GATE LIST ITSELF NARROWS. A denominator that quietly drops
    // forty files makes the percentage rise for no reason at all.
    name: "the gate list stops counting prodtests",
    file: COV,
    from: "const KIND = /\\.(test|dbtest|itest|prodtest)\\.mjs$/;",
    to: "const KIND = /\\.(test|dbtest|itest)\\.mjs$/;",
    expect: "the gates were found",
  },
];

function runGate() {
  try {
    execFileSync(process.execPath, [GATE], { encoding: "utf8", stdio: "pipe", timeout: 600_000 });
    return { green: true, failed: [] };
  } catch (e) {
    const out = String(e.stdout ?? "") + String(e.stderr ?? "");
    return { green: false, failed: [...out.matchAll(/^ {2}FAIL {2}(.+)$/gm)].map((m) => m[1].trim()) };
  }
}

console.log("mutation-coverage mutations\n");

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
    // An 'all' flag REPLACES EVERY OCCURRENCE. A defect that exists twice in one
    // file — the webhook returns early on a replay in two places — is not
    // re-introduced by changing the first, and the gate stays green for a
    // reason that is about the mutation rather than the code.
    const mutated = m.all
      ? originals.get(m.file).split(m.from).join(m.to)
      : originals.get(m.file).replace(m.from, m.to);
    writeFileSync(m.file, mutated);
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
console.log("A coverage number that can drift, and a ratchet that stops noticing, are each red.");
