#!/usr/bin/env node
/*
 * CAN env-independence.test.mjs SEE A GATE THAT WILL BREAK IN CI?
 *
 * The defect it exists for is not hypothetical — it is merge commit
 * aec56a2, red on Vercel and green here. The first mutant below is that
 * exact defect put back, and the first version of this gate did NOT
 * catch it: the spawn names `[RUNNER, ...args]` and RUNNER is a const
 * fifty lines away, so a reader that only saw string literals was blind
 * to the one file it was written for. That is why mutant 1 is first and
 * why mutants 4-6 break the reader rather than the data.
 *
 *   1. the defect that broke the build, put back
 *   2. a second gate hands a child the machine's environment
 *   3. the sweep stops probing the variable that broke it
 *   4. the reader stops resolving a path held in a const — the hole the
 *      positive control found
 *   5. the reader stops following an import, so an env read one file
 *      away is invisible
 *   6. the shorthand `{ env }` stops counting as control — the false
 *      POSITIVE, which is how a gate gets disabled by whoever is tired
 *      of its noise
 *   7. a declared exception loses its reason
 *   8. the excuse list grows by one — the cheapest way to silence a
 *      sweep is to declare the finding intentional
 *
 * Run: node scripts/tests/env-independence.mutation.mjs
 */
import { readFileSync } from "node:fs";
import { writeFileSync } from "./lib/sidecar-write.mjs";
import { execFileSync } from "node:child_process";

const GATE = "scripts/tests/env-independence.test.mjs";
const SPELLING = "scripts/tests/check-site-spelling.test.mjs";
const HYGIENE = "scripts/tests/prodtest-hygiene.test.mjs";
const SWEEP = "scripts/env-sensitivity.mjs";

const TARGETS = [GATE, SPELLING, HYGIENE, SWEEP];

const MUTANTS = [
  {
    // THE ONE THAT ACTUALLY HAPPENED. Byte-for-byte the shape of the
    // spawn in the gate that turned Vercel red.
    name: "the gate that broke the build hands the runner the machine's environment again",
    file: SPELLING,
    from: "timeout: 120_000, env }",
    to: "timeout: 120_000 }",
    expect: "none of them hands an env-reading program the machine's environment",
  },
  {
    // A SECOND ONE, so the clause is not passing because it happens to
    // know about one file.
    name: "a second gate stops controlling the environment it spawns into",
    file: HYGIENE,
    from: "const priorChromiumPath = process.env.CHROMIUM_PATH;\ndelete process.env.CHROMIUM_PATH;\nconst resolved = chromiumPath();",
    to: "const priorChromiumPath = process.env.CHROMIUM_PATH;\nconst resolved = chromiumPath();",
    expect: "the prodtest gate deletes CHROMIUM_PATH before asking what the default is",
  },
  {
    // THE SWEEP STOPS LOOKING AT THE VARIABLE THAT CAUSED ALL THIS, by
    // being declared an intentional exception — which is exactly how a
    // finding gets covered up rather than fixed.
    name: "the variable that broke the build is excused from the sweep",
    file: SWEEP,
    from: '["DATABASE_URL", "the db suites connect',
    to: '["ANTHROPIC_API_KEY", "excused for no good reason at all, which is the point"],\n  ["DATABASE_URL", "the db suites connect',
    expect: "ANTHROPIC_API_KEY is probed",
  },
  {
    // THE READER, AND THE HOLE THE POSITIVE CONTROL FOUND. Without const
    // resolution the gate is green on the very defect it exists for.
    name: "the reader stops resolving a script path held in a const",
    file: GATE,
    from: "    if (new RegExp(`\\\\b${name}\\\\b`).test(call)) found.add(path);",
    to: "    if (false) found.add(path);",
    expect: "...and a spawn that names only the const still resolves to it",
  },
  {
    // THE READER, second dimension: an env read one import away.
    // prodtest-hygiene reaches CHROMIUM_PATH through lib/chromium.mjs.
    name: "the reader stops following imports",
    file: GATE,
    // `""` AND NOT `[]`: an array has no matchAll, so that version made
    // the gate THROW, and a gate that crashes is not a gate that caught
    // anything — the runner reported red with no failing check named.
    // Same fault this branch fixed in step-flow.test.mjs an hour earlier.
    from: '  for (const m of code.matchAll(/from\\s+"(\\.[^"]+)"/g)) {',
    to: '  for (const m of "".matchAll(/from\\s+"(\\.[^"]+)"/g)) {',
    expect: "...and one behind an import",
  },
  {
    // THE FALSE POSITIVE, which is how a gate gets switched off: it
    // starts accusing correct code, somebody gets tired of it, and the
    // rule goes. The shorthand `{ env }` IS control.
    name: "the shorthand { env } stops counting as an environment",
    file: GATE,
    from: 'const givesEnv = (call) => /[{,]\\s*env\\s*[:,}]/.test(call) || /\\benv\\s*:/.test(call);',
    to: 'const givesEnv = (call) => /\\benv\\s*:/.test(call);',
    expect: "...and so is one with the shorthand",
  },
  {
    name: "a declared exception loses its reason",
    file: SWEEP,
    from: '["PGHOST", "libpq reads it when no URL is given; setting it points the db suites at a host that is not there"]',
    to: '["PGHOST", "because"]',
    expect: "every one carries a reason",
  },
  {
    // THE CHEAPEST WAY TO SILENCE THIS SWEEP: excuse one more variable.
    // The clause this hits replaced one that could not fail at all.
    name: "the excuse list grows by one",
    file: SWEEP,
    from: '  ["DATABASE_URL", "the db suites connect',
    to: '  ["BASE_URL", "a twelfth entry, added for no stated reason whatsoever"],\n  ["DATABASE_URL", "the db suites connect',
    // The ceiling it hits is the SWITCH list; the knob list has its own,
    // because conflating the two was the first version's fault and its
    // own ratchet is what said so.
    expect: "the switch list has not grown",
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

console.log("env-independence mutations\n");

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
      missed.push({
        ...m,
        why: `red on "${result.failed.slice(0, 3).join('", "')}" — nothing matching "${m.expect}"`,
      });
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
console.log("A gate that would break in CI is red here first.");
