#!/usr/bin/env node
/*
 * WOULD A COUNT THAT DRIFTED BE NOTICED?
 *
 * The first two mutations are not inventions. They restore the two
 * sentences this gate was written for: "the 13 business modules + ideas",
 * which counted Ideas twice, and "all 39 pages", which was true when it
 * was typed and is not now. Both were green in every gate this repository
 * has, because nothing connected either sentence to the thing it counts.
 *
 * The rest remove the ways the connection could quietly stop being made:
 * count with the wrong flag, read a number that is part of a bigger one,
 * lose the directory form, or stop joining a comment into the sentence it
 * actually is.
 *
 * EVERY MUTATION IS AN EDIT OF REAL CODE, never an `if (false)`:
 * scripts/check-mutation-markers.mjs fails the build on that literal.
 *
 * Run: node scripts/tests/count-claims.mutation.mjs
 */
import { readFileSync } from "node:fs";
import { writeFileSync } from "./lib/sidecar-write.mjs";
import { execFileSync } from "node:child_process";

const GATE = "scripts/tests/count-claims.test.mjs";
const TOP_MODULES = "src/app/api/create/top-modules/route.ts";
const DASH_LAYOUT = "src/app/dashboard/layout.tsx";
const MODULES = "src/lib/modules.ts";

const MUTANTS = [
  {
    // 1. THE FIRST DEFECT, RESTORED. CLASSIFIER_MODULES is 13 INCLUDING
    // ideas, so "the 13 business modules + ideas" describes fourteen.
    name: "a sentence counts the thirteenth item twice",
    file: TOP_MODULES,
    from: "// they type. Scoped to CLASSIFIER_MODULES only (the 12 business modules",
    to: "// they type. Scoped to CLASSIFIER_MODULES only (the 13 business modules",
    expect: "every marker's number is also written in the sentence it vouches for",
  },
  {
    // 2. THE SECOND, RESTORED. Two pages were added after the sentence
    // was written, and the sentence is what a reader trusts about the
    // layout's <main>. Re-anchored 42 -> 44 by redesign phase 2, which
    // added /dashboard/projects and /dashboard/projects/[id]: this
    // mutant's own text is a count claim and goes stale exactly when the
    // one it guards does.
    name: "a page count is left at what it was two pages ago",
    file: DASH_LAYOUT,
    from: "                    44 pages instead of 8, and the four components below",
    to: "                    42 pages instead of 8, and the four components below",
    expect: "every marker's number is also written in the sentence it vouches for",
  },
  {
    // 3. THE THING COUNTED CHANGES and the sentence does not — the way
    // every one of these drifts actually happens.
    name: "a module is added and the counts that name it are left alone",
    file: MODULES,
    from: '    slug: "competitors",',
    to: '    slug: "competitors",\n  },\n  {\n    slug: "brand-new-module",',
    expect: "every declared count matches what it counts",
  },
  {
    // 4. THE COUNTER STOPS COUNTING. Without the global flag, match()
    // returns the first hit and every count is one — which agrees with
    // no claim, but a reader seeing a green build would not know that.
    name: "the counter counts only the first match",
    file: GATE,
    from: '        : (readFileSync(target, "utf8").match(new RegExp(pattern, "gm")) ?? []).length;',
    to: '        : (readFileSync(target, "utf8").match(new RegExp(pattern, "m")) ?? []).length;',
    expect: "every declared count matches what it counts",
  },
  {
    // 5. A NUMBER INSIDE A BIGGER ONE reads as the number. "120" would
    // vouch for a claim of 12, which is how a check like this becomes
    // decoration.
    name: "a number is read out of the middle of a longer one",
    file: GATE,
    from: '  if (new RegExp(`(?<![\\\\d.])${n}(?![\\\\d.])`).test(text)) return true;',
    to: "  if (new RegExp(`${n}`).test(text)) return true;",
    expect: "is not fooled by a longer number",
  },
  {
    // 6. THE COMMENT STOPS BEING A SENTENCE. Marker on one line, number
    // on the next, and the binding between them is gone — every marker
    // becomes unvouched, which the gate would report as its own failure
    // rather than as a green.
    name: "a comment is read line by line instead of as a block",
    file: GATE,
    from: "      run.push(m[1]);\n      return;",
    to: "      blocks.push({ line: i + 1, text: m[1] });\n      return;",
    expect: "a comment block joins its lines",
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

console.log("count-claims mutations\n");

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
console.log("A sentence that counts something it no longer counts turns this red.");
