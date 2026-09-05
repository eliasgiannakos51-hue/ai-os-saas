#!/usr/bin/env node
/*
 * CAN shape-names.test.mjs SEE THE NUMBERING COME BACK?
 *
 * The gate has two halves and each can rot on its own. One resolves every
 * reference against docs/shapes.md; the other bans a comment from
 * numbering the catalogue for itself. Both are scans, and a scan that
 * finds nothing reports the same clean line whether the repository is
 * clean or the scanner is broken — so four of the seven mutations below
 * break the READERS rather than the repository, and require the gate's own
 * fixtures to notice.
 *
 * Run: node scripts/tests/shape-names.mutation.mjs
 */
import { readFileSync } from "node:fs";
import { writeFileSync } from "./lib/sidecar-write.mjs";
import { execFileSync } from "node:child_process";

// THIS SUITE HAS TO SPELL THE PHRASES ITS GATE BANS. A mutation's `from`
// quotes the line it replaces and its `to` is the defect being put back,
// so written literally they are themselves violations — the gate went red
// before the first mutation ran, and every result below would have been
// noise. The same collision hit self-claims.mutation.mjs, whose table of
// broken paths WAS the defect it tests for, and the answer is the same:
// build the phrase at runtime. The ban is on what a comment says to a
// reader, and there is no such phrase in this file for a reader to find.
const phrase = (ordinal, noun = "shape") => `${ordinal} ${noun}`;

const GATE = "scripts/tests/shape-names.test.mjs";
const CATALOGUE = "docs/shapes.md";
const REFERRER = "scripts/tests/language-extremes.test.mjs";
const INNOCENT = "src/lib/i18n/message-slices.ts";
/** The line in INNOCENT that the allowlist excuses, quoted so it can be moved. */
const SLICES_LINE = `// Counting only the ${phrase("first")} is how a number becomes comfortable.`;

const MUTANTS = [
  {
    // 1. THE HEADING A LIVE COMMENT POINTS AT, RENAMED. This is the
    // ordinary way a catalogue and its references drift apart: somebody
    // improves a title and the reference underneath it stops resolving,
    // which under the old ordinal scheme nothing could even detect.
    name: "a shape is renamed in the catalogue while a comment still points at the old name",
    file: CATALOGUE,
    from: "## A technically-true comment that reads as complete",
    to: "## A comment that reads as complete",
    expect: "every SHAPE: reference names a shape in the catalogue",
  },
  {
    // 2. A COMMENT NUMBERS THE LIST AGAIN. The exact thing the file was
    // asked for: "the Nth shape" written in a file that has no excuse.
    name: "a comment goes back to numbering the catalogue for itself",
    file: REFERRER,
    from: "// SHAPE: a technically-true comment that reads as complete",
    to: `// THE ${phrase("NINTH", "SHAPE")}: a comment technically true that reads as complete.`,
    expect: "no comment numbers the catalogue for itself",
  },
  {
    // 3. AND IN THE DIGIT FORM, because "17th" is what somebody writes
    // when they are in a hurry and the word form is what the first
    // version of the reader knew about.
    name: "...including when it is written 17th rather than seventeenth",
    file: INNOCENT,
    from: SLICES_LINE,
    to: `// Counting only the ${phrase("3rd")} is how a number becomes comfortable.`,
    expect: "no comment numbers the catalogue for itself",
  },
  {
    // 4. AN EXCUSE THAT NO LONGER DESCRIBES ANYTHING. The allowlist is
    // the one place the ban does not apply, so an entry nobody re-reads
    // is a hole that widens quietly — and this repository has watched
    // exactly that happen to an exception table before.
    name: "a local-enumeration excuse survives the phrase it was written for",
    file: INNOCENT,
    from: SLICES_LINE,
    to: "// Counting only one of the two is how a number becomes comfortable.",
    expect: "every excuse still describes something in its file",
  },
  {
    // 5. THE ORDINAL READER STOPS READING ORDINALS. Nothing in the
    // repository changes; the scan simply finds nothing, and reports the
    // clean line it reports when the repository really is clean.
    name: "ordinalsIn loses the word forms, so only digits would ever be found",
    file: GATE,
    from: '  "first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|eleventh|twelfth|" +',
    to: '  "zeroth|" +',
    expect: "an ordinal reference is found",
  },
  {
    // 6. THE REFERENCE READER STOPS REQUIRING ITS OWN LINE, which is the
    // rule that keeps "THE REPORTED SHAPE:" out. Widening it makes six
    // innocent English sentences into unresolvable references — the gate
    // then fails, but for a reason that has nothing to do with the
    // repository, so section 4 has to be the thing that names it.
    name: "referencesIn stops requiring the marker to own its line",
    file: GATE,
    from: "const m = /^\\s*(?:\\/\\/+|\\*|--|#)?\\s*SHAPE:\\s*(.+?)\\s*$/.exec(line);",
    to: "const m = /\\bSHAPE:\\s*(.+?)\\s*$/.exec(line);",
    expect: "the word 'shape' ending an ordinary sentence is not a reference",
  },
  {
    // 7. THE CATALOGUE'S PROSE SECTIONS BECOME SHAPE NAMES. `## They have
    // names, not numbers` is a heading about the document, and counting
    // it would let a reference resolve to a section that describes no
    // defect at all — the floor in section 1 would still pass, so this is
    // the clause that has to.
    name: "headingsIn reads the headings above the rule as shape names too",
    file: GATE,
    from: 'const body = markdown.split(/^---$/m).slice(1).join("\\n---\\n");',
    to: "const body = markdown;",
    expect: "headings above the rule are not shape names",
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

console.log("shape-names mutations\n");

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
console.log("A shape numbered by hand, a reference that resolves to nothing, and a reader that stopped reading are each red.");
