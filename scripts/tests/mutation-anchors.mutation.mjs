#!/usr/bin/env node
/*
 * CAN THE ANCHOR GATE STILL TELL CODE FROM PROSE?
 *
 * Its whole value is one distinction, and every cheap way of losing that
 * distinction empties a list the gate then reports as clean. So each
 * mutation below removes one of them:
 *
 *   - stop reading the mutant lists properly, and the `edits:` a suite
 *     does its real work in go unseen
 *   - count leading trivia as part of a token, and nothing is prose
 *   - judge only what a mutation removes, and every insertion is prose
 *   - let the exception table match anything, and a declaration excuses
 *     what it was never written for
 *
 * EVERY MUTATION IS AN EDIT OF REAL CODE, never an `if (false)`:
 * scripts/check-mutation-markers.mjs fails the build on that literal.
 *
 * Run: node scripts/tests/mutation-anchors.mutation.mjs
 */
import { readFileSync } from "node:fs";
import { writeFileSync } from "./lib/sidecar-write.mjs";
import { execFileSync } from "node:child_process";

const GATE = "scripts/tests/mutation-anchors.test.mjs";
const READER = "scripts/tests/lib/mutant-list.mjs";
const TABLE = "scripts/tests/lib/prose-anchors.mjs";

const MUTANTS = [
  {
    // 1. LEADING TRIVIA COUNTS AS PART OF THE TOKEN. getFullStart()
    // includes the comments before a node, so every comment falls inside
    // a span, nothing is prose, and the gate reports a clean list because
    // it has stopped being able to produce a dirty one.
    name: "a token span swallows the comments in front of it",
    file: GATE,
    from: "      const a = node.getStart(sf);",
    to: "      const a = node.getFullStart();",
    expect: "it still SEES prose-only mutations",
  },
  {
    // 2. ONLY WHAT IS REMOVED IS JUDGED. This is the version that called
    // nav-events prose: it inserts a line into an array literal, removes
    // nothing, and the insertion point belongs to no token.
    name: "an insertion is judged by what it removes, which is nothing",
    file: GATE,
    from: "  const insertEnd = at + to.length - suffix;\n  if (insertEnd <= a) return false;",
    to: "  const insertEnd = at + to.length - suffix;\n  return false;",
    expect: "inserting a line of code into an array is code",
  },
  {
    // 3. THE EDITS LIST GOES UNREAD. Ten suites put a marker in
    // `from`/`to` and the real change in `edits`; read without it,
    // agent-depth's budget mutants look like comment edits — an
    // accusation the first version of this scan actually made.
    name: "the reader stops following a mutant's edits list",
    file: READER,
    from: "        for (const e of Array.isArray(m.edits) ? m.edits : []) {",
    to: "        for (const e of []) {",
    expect: "no mutation changes only prose without saying why",
  },
  {
    // 4. NOTHING EVALUATES, SO EVERYTHING FALLS BACK. The weaker reading
    // is bounded by a ratchet rather than tolerated, because it is the
    // reading that cannot see `edits`.
    name: "every suite is read the weaker way",
    file: READER,
    from: "  if (end === -1) return null;",
    to: "  if (end === -1 || open >= 0) return null;",
    expect: "suites were read the weaker way",
  },
  {
    // 5. THE EXCEPTION TABLE MATCHES ANYTHING. An entry written for one
    // file then excuses a prose mutation anywhere in that suite, which is
    // how an allowlist becomes a place to put things.
    name: "an exception stops caring which file it was written for",
    file: GATE,
    from: "  a.file === m.file && m.edits.some((e) => e.from.includes(a.changed) || e.to.includes(a.changed));",
    to: "  a.file === m.file || m.edits.some((e) => e.from.includes(a.changed) || e.to.includes(a.changed));",
    expect: "does not cover a different mutation in the same file",
  },
  {
    // 6. AN EXCEPTION THAT NO LONGER DESCRIBES ANYTHING. The stale half:
    // the mutation was rewritten, the entry stayed, and the next prose
    // mutation in that suite hides behind it.
    name: "an exception outlives the mutation it was written for",
    file: TABLE,
    from: '{ file: "src/app/layout.tsx", changed: "rendered once and REUSED" }',
    to: '{ file: "src/app/layout.tsx", changed: "rendered once and RE-USED" }',
    expect: "no exception describes a mutation that now changes code",
  },
  {
    // 7. A FRAGMENT SO SHORT IT MATCHES EVERYTHING. "e" appears in every
    // anchor in the repository; an entry like that is not an exception,
    // it is an off switch.
    name: "an exception's fragment becomes a wildcard",
    file: TABLE,
    from: 'changed: "BOUNDARY-FORMAT"',
    to: 'changed: "T"',
    expect: "is specific enough to mean something",
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

console.log("mutation-anchors mutations\n");

const TARGETS = [...new Set(MUTANTS.map((m) => m.file))];
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
console.log("A mutation that edits a comment and calls it a defect turns this red.");
