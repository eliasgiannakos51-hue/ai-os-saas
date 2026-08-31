// EVERY CLAUSE OF mutation-sidecar.test.mjs, BROKEN ON PURPOSE.
//
// This gate is the safety net under sixty other suites, which makes it
// the one place where a check that quietly stopped working would be least
// visible: nothing else in the repository would go red, and the first
// symptom would be a mutant in somebody's commit.
//
// Run: node scripts/tests/mutation-sidecar.mutation.mjs
import { readFileSync } from "node:fs";
import { writeFileSync } from "./lib/sidecar-write.mjs";
import { execFileSync } from "node:child_process";

const GATE = "scripts/tests/mutation-sidecar.test.mjs";
const HELPER = "scripts/tests/lib/sidecar-write.mjs";
const A_SUITE = "scripts/tests/chart-datakeys.mutation.mjs";
const IGNORE = ".gitignore";

function gateIsGreen() {
  try {
    execFileSync("node", [GATE], { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

const MUTATIONS = [
  // ---- the helper's own mechanism ----
  {
    name: "the original is recorded AFTER the mutation reaches disk",
    file: HELPER,
    from: "    if (abs in saved && saved[abs] === data) delete saved[abs];\n    // BEFORE the mutation reaches disk, not after.\n    persist();",
    to: "    if (abs in saved && saved[abs] === data) delete saved[abs];",
    // With no persist() before the write, the record never reaches disk
    // at all — which the ordering check sees and the live kill proves.
    expect: "the original is persisted BEFORE the mutation reaches disk",
  },
  {
    name: "healing becomes something a caller has to ask for",
    file: HELPER,
    from: "\nhealFromSidecar();\n",
    to: "\n",
    expect: "it heals at import time",
  },
  {
    name: "the heal goes quiet, so a killed run leaves no trace in the log",
    file: HELPER,
    from: "  console.log(\n    `sidecar: healed ${files.length} file(s) a killed run left mutated:\\n  ${files.join(\"\\n  \")}\\n`\n  );",
    to: "  void files;",
    expect: "says so out loud rather than healing silently",
  },
  {
    name: "the sidecar path goes back to depending on the working directory",
    file: HELPER,
    from: '  process.env.MUTATION_SIDECAR_PATH || path.join(HERE, "..", ".mutation-sidecar.json");',
    to: '  process.env.MUTATION_SIDECAR_PATH || path.join("scripts", "tests", ".mutation-sidecar.json");',
    expect: "anchored to this file, not to process.cwd()",
  },
  {
    // WHAT REPLACED THE isTemp GUARD. That guard could not fire — every
    // fixture goes under os.tmpdir(), which the repository test already
    // excludes — so it was deleted, and the property that makes the
    // deletion safe is asserted instead. This is the mutation on THAT.
    name: "a suite starts building a fixture inside the repository",
    file: A_SUITE,
    from: 'const CHART = "src/components/data-analysis/analysis-chart.tsx";',
    to: 'const CHART = "src/components/data-analysis/analysis-chart.tsx";\nimport { mkdtempSync } from "node:fs";\nvoid (() => mkdtempSync("scripts/tests/fixture-"));',
    expect: "no suite builds a fixture inside the repository",
  },
  {
    name: "the repository test goes, so a file anywhere is recorded",
    file: HELPER,
    from: "  const inRepo = abs.startsWith(REPO + path.sep);",
    to: "  const inRepo = true;",
    expect: "a file outside the repository is never recorded",
  },
  {
    name: "another suite's sidecar is recorded as if it were source",
    file: HELPER,
    from: '  const isSidecar = /sidecar.*\\.json$/.test(abs) || abs.includes(".guard-sidecar");',
    to: "  const isSidecar = false;",
    expect: "and neither is another sidecar",
  },
  // THE ONE THAT MATTERS MOST: the whole thing stops working, and only
  // the live kill notices.
  {
    name: "nothing is recorded at all — the helper becomes a plain write",
    file: HELPER,
    from: "      saved[abs] = readFileSync(abs, \"utf8\");",
    to: "      void abs;",
    expect: "the NEXT process puts it back",
  },

  // ---- a suite falling out of the net ----
  {
    name: "a suite goes back to taking writeFileSync from node:fs",
    file: A_SUITE,
    from: 'import { readFileSync } from "node:fs";\nimport { writeFileSync } from "./lib/sidecar-write.mjs";',
    to: 'import { readFileSync, writeFileSync } from "node:fs";',
    expect: "every one of them takes writeFileSync from the sidecar helper",
  },
  {
    name: "...or imports it from both, so the last line silently wins",
    file: A_SUITE,
    from: 'import { writeFileSync } from "./lib/sidecar-write.mjs";',
    to: 'import { writeFileSync } from "./lib/sidecar-write.mjs";\nimport { writeFileSync as unusedWrite } from "node:fs";\nvoid unusedWrite;',
    expect: "every one of them takes writeFileSync from the sidecar helper",
  },

  // ---- and the record of it ----
  {
    name: "the sidecar stops being gitignored, so a killed run dirties the tree twice",
    file: IGNORE,
    from: "scripts/tests/.mutation-sidecar.json",
    to: "scripts/tests/.mutation-sidecar-elsewhere.json",
    expect: "the sidecar is gitignored",
  },

  // ---- THE INSTRUMENT'S OWN CLAUSES ----
  {
    name: "the suite scan finds nothing, so 'every one of them' is vacuous",
    file: GATE,
    from: 'const suites = readdirSync(DIR).filter((f) => f.endsWith(".mutation.mjs"));',
    to: 'const suites = readdirSync(DIR).filter((f) => f.endsWith(".no-such-suffix"));',
    expect: "the suites were found",
  },
  {
    name: "the writer scan finds nothing, so the floor under it is vacuous too",
    file: GATE,
    from: "  if (!/\\bwriteFileSync\\s*\\(/.test(src)) continue;",
    to: "  if (!/\\bwriteFileSyncNope\\s*\\(/.test(src)) continue;",
    expect: "suites that write source files",
  },
  // NO MUTATION FOR stripComments IN THE IMPORT SCAN, and saying so is
  // better than inventing one that passes.
  //
  // It was tried twice and survived both times, correctly. Once the
  // import checks were anchored to column zero, a `//` line could no
  // longer satisfy them; and the writer census it also feeds is a FLOOR,
  // which inflating cannot break. The stripper stays because a block
  // comment containing an import statement would otherwise produce a
  // confusing false failure — but it is not load-bearing for any claim
  // this gate makes, and a mutation that goes green is the honest report
  // of that rather than a pairing built to make the count look complete.
];

console.log("mutation-sidecar mutations\n");
if (!gateIsGreen()) {
  console.log("baseline: the gate is RED on the unmutated tree — fix that first.");
  process.exit(1);
}
console.log("baseline: the gate is GREEN on the unmutated tree");

let caught = 0;
const survivors = [];
const missed = [];

for (const m of MUTATIONS) {
  const before = readFileSync(m.file, "utf8");
  if (!before.includes(m.from)) {
    missed.push(`${m.name} — ANCHOR NOT FOUND in ${m.file}; the mutation never applied`);
    continue;
  }
  if (before.split(m.from).length - 1 !== 1) {
    missed.push(`${m.name} — anchor appears more than once in ${m.file}`);
    continue;
  }
  writeFileSync(m.file, before.replace(m.from, () => m.to));
  const red = !gateIsGreen();
  writeFileSync(m.file, before);

  if (red) {
    caught++;
    console.log(`  CAUGHT  ${m.name}${m.expect ? `\n          -> by ${m.expect}` : ""}`);
  } else {
    survivors.push(`${m.name} (${m.file}) — the gate stayed GREEN`);
    console.log(`  SURVIVED  ${m.name}`);
  }
}

console.log("");
if (!gateIsGreen()) {
  console.log("baseline: the gate is RED on the restored tree — a mutation was not put back.");
  process.exit(1);
}
console.log("baseline: the gate is green again on the restored tree\n");
console.log(`${caught} of ${MUTATIONS.length} mutations caught.`);
if (missed.length > 0) {
  console.log("\nMISSED ANCHORS (these mutations never ran):");
  for (const s of missed) console.log(`  - ${s}`);
}
if (survivors.length > 0) {
  console.log("\nSURVIVORS:");
  for (const s of survivors) console.log(`  - ${s}`);
}
if (missed.length > 0 || survivors.length > 0) process.exit(1);
console.log("Every clause of mutation-sidecar.test.mjs is load-bearing.");
