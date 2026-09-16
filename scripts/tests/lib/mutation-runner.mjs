#!/usr/bin/env node
/*
 * THE RUNNER THE MUTATION SUITES SHARE.
 *
 * WHY IT EXISTS. Every *.mutation.mjs in this tree carried its own copy of
 * the same seventy lines: snapshot the targets, run the gate for a
 * baseline, apply one mutation, run the gate, restore, classify the
 * result, restore again in a finally, print the holes. One hundred and
 * fifty-four copies of a loop whose CORRECTNESS is the whole point — a
 * copy that forgets the `finally` leaves a mutation in the working tree,
 * which is not a hypothetical: a stopped sweep left `"presentations"`
 * rewritten to "It does not create slides." in messages/en.json on
 * 2026-09-13, one `git add -A` from shipping.
 *
 * FOUR OUTCOMES, AND THREE OF THEM ARE FAILURES:
 *
 *   CAUGHT  the gate went red AND on a check naming `expect`
 *   MISSED  the gate stayed green — nothing there is load-bearing
 *   WRONG   red, but on some other check: the defect was caught by
 *           accident, and the clause that should own it did not fire
 *   STALE   `from` no longer appears in the file, so the mutation never
 *           applied and the suite tested nothing while printing a line
 *
 * STALE IS REPORTED SEPARATELY ON PURPOSE. feature-catalog.mutation.mjs
 * carried a mutant anchored on a sidebar row without the `hintKey` it had
 * gained in a merge; it printed STALE and `12 of 13` and read as healthy
 * for as long as nobody counted. A mutant whose target has moved is a
 * check that runs and tests nothing.
 *
 * ------------------------------------------------------------------
 * THE SHAPE EVERY SUITE USING THIS MUST KEEP
 * ------------------------------------------------------------------
 *
 * Declare the mutant list as a TOP-LEVEL const, under the name
 * scripts/tests/lib/mutant-list.mjs searches for, and pass it in. That
 * reader evaluates the array statically so mutation-anchors.test.mjs can
 * judge whether each mutation changes CODE rather than a comment; a list
 * inlined as an argument cannot be found, and the suite silently drops to
 * a weaker regex reading that FALLBACK_CEILING ratchets. Three suites
 * written the other way took that ceiling from 19 to 21, and the fix was
 * the shape rather than the ceiling.
 *
 * AND DO NOT SPELL THAT NAME OUT IN A COMMENT ABOVE THE DECLARATION.
 * Doing so put the searched-for phrase in prose, `indexOf` matched the
 * comment instead, the bracket scan began inside a sentence and never
 * balanced — and all three suites went on falling back while reading as
 * fixed. scripts/tests/security-posture.test.mjs carries the same warning
 * about the two-character block-comment opener, which is the same defect
 * one layer down: a parser looking for a marker cannot tell the marker
 * from a description of it.
 *
 * AND ANY CONST THE LIST REFERS TO MUST FIT ON ONE LINE. The prelude that
 * reader evaluates the array under is built from the suite's own
 * `const NAME = ...;` declarations, and only the single-line ones, so
 * nothing with a side effect is dragged in. A shared block of replaced
 * code written as a multi-line template literal is therefore not in scope
 * when the array is evaluated, the evaluation throws on an undefined
 * name, and the suite falls back exactly as an inlined list does — with
 * no error anywhere, only FALLBACK_CEILING moving by one.
 * route-spend-inventory.mutation.mjs did this on 2026-09-16; the fix was
 * `[...].join("\n")` on one line, not a higher ceiling.
 */
import { readFileSync } from "node:fs";
import { writeFileSync } from "./sidecar-write.mjs";
import { execFileSync } from "node:child_process";

/** Run a gate; report whether it is green and which checks failed. */
export function runGate(gate) {
  try {
    const out = execFileSync(process.execPath, [gate], { encoding: "utf8", stdio: "pipe" });
    return { green: true, failed: [], body: out };
  } catch (e) {
    const out = String(e.stdout ?? "") + String(e.stderr ?? "");
    const failed = [...out.matchAll(/^ {2}FAIL {2}(.+)$/gm)].map((m) => m[1].trim());
    return { green: false, failed: failed.length ? failed : ["(exited non-zero with no FAIL line)"], body: out };
  }
}

/**
 * Apply each mutant to its file, one at a time, and require the gate to
 * go red on the named check.
 *
 * `targets` is every file any mutant touches. It is snapshotted whole
 * before anything is written and restored after every single mutation AND
 * again in a finally, because a throw between write and restore is how a
 * defect escapes into a commit.
 */
export function runMutations({ name, gate, targets, mutants }) {
  console.log(`${name} mutations\n`);
  const originals = new Map(targets.map((f) => [f, readFileSync(f, "utf8")]));
  const restoreAll = () => {
    for (const [file, text] of originals) writeFileSync(file, text);
  };

  let caught = 0;
  const missed = [];
  try {
    const base = runGate(gate);
    console.log(`baseline: the gate is ${base.green ? "GREEN" : "RED"} on the unmutated tree`);
    if (!base.green) {
      console.log(`\nBASELINE IS RED — no result below would mean anything.\n  ${base.failed.join("\n  ")}`);
      process.exit(1);
    }

    for (const m of mutants) {
      const original = originals.get(m.file);
      if (original === undefined) {
        missed.push({ ...m, why: `${m.file} is not in targets — it was never snapshotted, so it could not be restored` });
        console.log(`  STALE   ${m.name}`);
        continue;
      }
      if (!original.includes(m.from)) {
        missed.push({ ...m, why: `the mutation target no longer exists in ${m.file}` });
        console.log(`  STALE   ${m.name}`);
        continue;
      }
      writeFileSync(m.file, original.replace(m.from, m.to));
      let result;
      try {
        result = runGate(gate);
      } finally {
        restoreAll();
      }
      if (result.green) {
        missed.push({ ...m, why: "the gate stayed green — nothing here is load-bearing" });
        console.log(`  MISSED  ${m.name}`);
        continue;
      }
      const onTarget =
        result.failed.some((f) => f.includes(m.expect)) || (result.body ?? "").includes(m.expect);
      if (!onTarget) {
        missed.push({ ...m, why: `red on "${result.failed.slice(0, 3).join('", "')}" — nothing matching "${m.expect}"` });
        console.log(`  WRONG   ${m.name}\n          -> ${result.failed.slice(0, 3).join(" | ")}`);
        continue;
      }
      caught++;
      console.log(`  CAUGHT  ${m.name}\n          -> ${m.expect}`);
    }
  } finally {
    restoreAll();
  }

  const after = runGate(gate);
  console.log(
    after.green
      ? "\nbaseline: the gate is green again on the restored tree"
      : "\nBASELINE IS RED — a mutation was not restored. Check `git diff`."
  );
  console.log(`\n${caught} of ${mutants.length} mutations caught.`);
  if (missed.length > 0 || !after.green) {
    if (missed.length > 0) {
      console.log("\nHOLES:");
      for (const m of missed) console.log(`  - ${m.name}\n    ${m.why}`);
    }
    process.exit(1);
  }
  console.log(`Every clause of ${gate.replace(/^.*\//, "")} that these reach is load-bearing.`);
}
