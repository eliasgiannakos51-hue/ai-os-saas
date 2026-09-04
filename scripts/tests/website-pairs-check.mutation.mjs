#!/usr/bin/env node
/*
 * CAN website-pairs-check.test.mjs SEE THE INSTRUMENT LYING?
 *
 * The pairs script is the number the templates proposal will be judged by,
 * before and after. Each mutation below re-introduces one way for that
 * number to be confidently wrong: a threshold nothing can cross, a run
 * that exits green whatever it found, a seed that draws both sites as one
 * user's first site, pairs silently dropped, a page compared with itself.
 *
 * Run: node scripts/tests/website-pairs-check.mutation.mjs
 */
import { readFileSync } from "node:fs";
import { writeFileSync } from "./lib/sidecar-write.mjs";
import { execFileSync } from "node:child_process";

const GATE = "scripts/tests/website-pairs-check.test.mjs";
const SCRIPT = "scripts/website-pairs-check.mjs";
const TARGETS = [GATE, SCRIPT];

const MUTANTS = [
  {
    // 1. THE LINE NOBODY CROSSES. A same-skeleton threshold above 1.0
    // reports every pair as its own shape, identical ones included.
    name: "the same-skeleton line moves above 1.0",
    file: SCRIPT,
    from: "const SAME_SKELETON = 0.85;",
    to: "const SAME_SKELETON = 1.01;",
    expect: "an identical pair is reported as the same skeleton",
  },
  {
    // 2. GREEN WHATEVER IT FOUND. The chart stays, the gate goes.
    name: "the run exits 0 with pairs over the hard line",
    file: SCRIPT,
    from: "process.exit(rows.length === 0 ? 2 : sameSkeleton.length > 0 || sameLook.length > 0 ? 1 : 0);",
    to: "process.exit(rows.length === 0 ? 2 : 0);",
    expect: "the run exits 1 when a pair crosses a hard line",
  },
  {
    // 3. ONE USER, TWICE. Both sites seeded as the same user's first site
    // measures a pair the product never produces.
    name: "both sites of a pair are drawn as the same user's first site",
    file: SCRIPT,
    from: ": [`pairs-check-${side}`, 0, brief];",
    to: ': ["pairs-check-a", 0, brief];',
    expect: "the two sites of a pair are drawn as two different users",
  },
  {
    // 4. SILENT DROPS. A pair with no pages disappears from the report
    // instead of being named.
    name: "pairs without pages vanish from the summary",
    file: SCRIPT,
    from: 'if (skipped.length > 0) console.log(`  skipped (no pages): ${skipped.join(", ")}`);',
    to: 'if (skipped.length > 0) console.log("");',
    expect: "pairs without pages are named as skipped",
  },
  {
    // 5. A PAGE AGAINST ITSELF. Reading the a-page for both sides scores
    // every pair 1.00 and calls the whole product one template.
    name: "the dry run compares the a-page with itself",
    file: SCRIPT,
    from: "const fileB = path.join(dryDir, `${p.slug}-b.html`);",
    to: "const fileB = path.join(dryDir, `${p.slug}-a.html`);",
    expect: "the different pair scores below the similar-skeleton line",
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

console.log("website-pairs-check mutations\n");

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
console.log("Every clause in website-pairs-check.test.mjs is load-bearing.");
