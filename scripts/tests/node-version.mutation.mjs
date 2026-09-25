#!/usr/bin/env node
/*
 * CAN node-version.test.mjs SEE A NODE PIN THAT HAS COME APART?
 *
 * The defect it exists for is the one the owner named: ".nvmrc says 22 and
 * package.json says 20". That is mutant 1. The rest ask the harder
 * question — whether the OTHER three clauses are load-bearing, or whether
 * the gate is one real check wearing four hats.
 *
 *   1. the two repository files disagree — the defect, put in
 *   2. the pin drops below what an installed dependency needs
 *   3. the running-runtime clause stops comparing anything — this is the
 *      clause that makes a Vercel dashboard mismatch visible, and a gate
 *      that cannot go red on it is a checklist pretending to be a gate
 *   4. the dependency scan reads nothing — the vacuity control, because
 *      an empty scan produces an empty offender list and a green line.
 *      gate-vacuity.test.mjs failed the build over exactly this before the
 *      floor moved onto the population, which is where it can break
 *   5. the README loses the sentence about the setting no gate can reach
 *
 * Run: node scripts/tests/node-version.mutation.mjs
 */
import { readFileSync } from "node:fs";
import { writeFileSync } from "./lib/sidecar-write.mjs";
import { execFileSync } from "node:child_process";

const GATE = "scripts/tests/node-version.test.mjs";
const PKG = "package.json";
const NVMRC = ".nvmrc";
const README = "README.md";

const TARGETS = [GATE, PKG, NVMRC, README];

const MUTANTS = [
  {
    // THE ONE ASKED FOR BY NAME.
    name: ".nvmrc says 22 and package.json says 20",
    file: PKG,
    from: '"node": "22.x"',
    to: '"node": "20.x"',
    expect: "...and it names the same major as .nvmrc",
  },
  {
    // A PIN BELOW WHAT THE TREE NEEDS. @supabase/supabase-js and five
    // siblings declare >=22.0.0, so pinning 18 is a real, checkable
    // mistake rather than a hypothetical one.
    name: "the pin drops to a major an installed dependency refuses",
    file: NVMRC,
    from: "22",
    to: "18",
    expect: "no installed dependency needs a newer Node than this repository pins",
  },
  {
    // THE CLAUSE THAT REACHES OUTSIDE THE REPOSITORY. On the builder, the
    // runtime it reads IS the Vercel dashboard's answer.
    //
    // ITS ONLY INPUT IS process.versions.node, and this machine has one
    // Node. So the mutation moves the PIN rather than the runtime: 24 is a
    // major every installed dependency still accepts (they ask for >=22),
    // which is what lands this on the runtime clause rather than on the
    // dependency one.
    //
    // The first version of this mutant rewrote the comparison to a literal
    // true. That cannot work: replacing a check with something always true
    // leaves the gate green BY CONSTRUCTION, and the harness correctly
    // called it MISSED. A mutant has to break the WORLD a check reads,
    // never the check.
    name: "the pin moves to a major nothing is running",
    file: NVMRC,
    from: "22",
    to: "24",
    expect: "the running Node is the major this repository pins",
  },
  {
    // THE VACUITY CONTROL. Settle it by emptying the collection, never by
    // reading the code — CLAUDE.md's rule, and the reason the second
    // clause in that section exists at all.
    name: "the dependency scan reads nothing at all",
    file: GATE,
    from: 'if (existsSync("node_modules")) scanDir("node_modules", "");',
    to: 'if (false) scanDir("node_modules", "");',
    expect: "the dependency scan read packages that declare a Node range",
  },
  {
    // THE CHECKLIST ITEM ITSELF. The one place nothing can be gated is
    // the one place a sentence has to survive, so its absence is red.
    // This mutant is why the clause it tests got narrower. It used to
    // delete the sentence and the gate stayed GREEN, because the old check
    // wanted the words "Node.js Version" and "dashboard" anywhere in the
    // file and the Deploy section already carried the second one. Half the
    // check was free. It now wants the path a person clicks.
    name: "the README stops naming the path to the setting",
    file: README,
    from: "Settings \u2192 General \u2192 Node.js\nVersion",
    to: "some setting in the hosting provider's dashboard",
    expect: "the README names the dashboard setting by its path",
  },
];

function runGate() {
  try {
    execFileSync(process.execPath, [GATE], { encoding: "utf8", stdio: "pipe", timeout: 300_000 });
    return { green: true, failed: [] };
  } catch (e) {
    const out = String(e.stdout ?? "") + String(e.stderr ?? "");
    return {
      green: false,
      failed: [...out.matchAll(/^ {2}FAIL {2}(.+)$/gm)].map((m) => m[1].trim()),
      body: out,
    };
  }
}

console.log("node-version mutations\n");
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
    const onTarget =
      result.failed.some((f) => f.includes(m.expect)) || (result.body ?? "").includes(m.expect);
    if (!onTarget) {
      missed.push({ ...m, why: `red on "${result.failed.slice(0, 3).join('", "')}" — nothing matching "${m.expect}"` });
      console.log(`  WRONG   ${m.name}\n          -> ${result.failed.slice(0, 3).join(" | ")}`);
      continue;
    }
    caught++;
    console.log(`  CAUGHT  ${m.name}`);
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
console.log("A Node pin that has come apart is red before it reaches the builder.");
