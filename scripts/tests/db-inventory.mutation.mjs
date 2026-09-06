#!/usr/bin/env node
/*
 * CAN db-inventory.test.mjs SEE THE INVENTORY GO BLIND?
 *
 * scripts/db-inventory.mjs is the file this repo points at when it wants
 * the COMPLETE answer about the schema — the thing to run before a
 * deploy, as against the annotated subset in schema-canaries. That claim
 * is only worth anything while the extraction is complete, and on
 * 2026-09-06 it was not: the policy pattern required the double quotes
 * around a policy name, which Postgres treats as optional, so 70 of the
 * 206 literal `create policy` statements in this repo — a third of every
 * RLS policy the migrations define — were never in expected_policies.
 * The generated query's MISSING POLICY finding could not fire for any of
 * them. It reported nothing, and nothing is what a working schema looks
 * like.
 *
 * That is the same failure the health route's function sweep had twice,
 * one instrument over: an answer that cannot distinguish "all present"
 * from "never looked". So the mutations below are the ways back into it —
 * seeing one spelling of a statement, or losing a whole file's worth.
 *
 * Run: node scripts/tests/db-inventory.mutation.mjs
 */
import { readFileSync } from "node:fs";
import { writeFileSync } from "./lib/sidecar-write.mjs";
import { execFileSync } from "node:child_process";

const GATE = "scripts/tests/db-inventory.test.mjs";
const INV = "scripts/db-inventory.mjs";

const MUTANTS = [
  {
    // THE DEFECT ITSELF, put back. The quotes are optional in Postgres
    // and this repo writes them both ways, so requiring them loses every
    // policy in fifteen migration files at once.
    name: "the policy pattern requires the double quotes again",
    file: INV,
    from: '/create\\s+policy\\s+(?:"([^"]+)"|([a-z0-9_]+))\\s+on\\s+(?:public\\.)?"?([a-z0-9_]+)"?/gi',
    to: '/create\\s+policy\\s+(?:"([^"]+)")\\s+on\\s+(?:public\\.)?"?([a-z0-9_]+)"?/gi',
    expect: "reaches expected_policies",
  },
  {
    // THE MIRROR IMAGE, which would be just as blind and just as quiet:
    // seeing only the unquoted ones loses the other 136.
    name: "...or reads only the quoted half of the alternation",
    file: INV,
    from: "      const name = m[1] ?? m[2];",
    to: "      const name = m[1];",
    expect: "reaches expected_policies",
  },
  {
    // AND THE CHEAPEST WAY TO GO BLIND: stop reading the migrations at
    // all past some point. A window is how the annotated subset misses
    // old objects, and it must not be how this one does.
    // THE ONE THAT WALKED THROUGH THE FIRST VERSION OF THE GATE. A
    // filter dropping every `_own` policy left the derived COUNT above
    // the floor, because the count mixed literal and loop-created
    // policies and carried 78 of slack. Comparing names instead is what
    // makes this red.
    name: "a filter quietly drops every policy whose name ends in _own",
    file: INV,
    from: "      const name = m[1] ?? m[2];",
    to: "      const name = m[1] ?? m[2];\n      if (name.endsWith('_own')) continue;",
    expect: "reaches expected_policies",
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

console.log("db-inventory mutations\n");

const TARGETS = [...new Set(MUTANTS.map((m) => m.file))];
const originals = new Map(TARGETS.map((f) => [f, readFileSync(f, "utf8")]));
const restoreAll = () => {
  for (const [file, text] of originals) writeFileSync(file, text);
};

let caught = 0;
const missed = [];
try {
  const baseline = runGate();
  if (!baseline.green) {
    console.log("BASELINE IS ALREADY RED — fix the gate before measuring it.");
    console.log(baseline.failed.map((f) => `  ${f}`).join("\n"));
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
console.log("An inventory that can see only one spelling of a policy is red.");
