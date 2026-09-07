#!/usr/bin/env node
/*
 * IS isolation-probe-honesty.itest.mjs LOAD-BEARING?
 *
 * That file proves the live probe catches six leaks. This one asks the
 * question one level up: if the PROBE lost a check, would the honesty
 * test notice — or would it happily report six greens for a probe that
 * had stopped looking?
 *
 * Each mutation removes exactly one assertion from
 * user-isolation-live.prodtest.mjs. The scenario that assertion exists
 * for must then fail to be caught, and the honesty test must say so.
 *
 * WHY THIS MATTERS MORE THAN USUAL HERE. The probe cannot run against
 * production until two accounts exist, so the honesty test is the ONLY
 * evidence behind it. Evidence with nothing checking it is the shape this
 * repository keeps finding.
 *
 * Run: node scripts/tests/isolation-probe-honesty.mutation.mjs
 */
import { readFileSync } from "node:fs";
import { writeFileSync } from "./lib/sidecar-write.mjs";
import { execFileSync } from "node:child_process";

const GATE = "scripts/tests/isolation-probe-honesty.itest.mjs";
const PROBE = "scripts/tests/user-isolation-live.prodtest.mjs";
const TARGETS = [GATE, PROBE];

const MUTANTS = [
  {
    // 1. THE SUB CHECK GOES. GoTrue could issue the same subject for two
    // people and every table check would still pass — because with one
    // subject there is only one set of rows and no leak to find. This is
    // the check that makes this file different from the dbtest.
    name: "the probe stops comparing the two subs",
    file: PROBE,
    from: '  check("the two subs differ", aClaim.sub !== bClaim.sub);',
    to: "",
    expect: 'caught by the right clause ("the two subs differ")',
  },
  {
    // 2. THE ROLE CHECK GOES. A service-role token bypasses RLS
    // completely; every read below would return everything and the probe
    // would call it isolation working, because it would see no rows
    // belonging to A that it did not expect.
    // BOTH LINES, and the first draft removed only A's. B's identical
    // check still caught the service-role leak, so the gate stayed green
    // — correctly — and the mutation was reported as a hole in the gate
    // when it was a hole in the mutation. Two redundant assertions need a
    // mutation that removes both, or it is measuring the redundancy
    // rather than the check.
    name: "the probe stops checking the token role",
    file: PROBE,
    from: `  check("A's token is role=authenticated, not service_role", aClaim.role === "authenticated", String(aClaim.role));\n  check("B's token is role=authenticated, not service_role", bClaim.role === "authenticated", String(bClaim.role));`,
    to: "",
    expect: "role=authenticated, not service_role",
  },
  {
    // 3. THE POSITIVE CONTROL GOES — the one that separates "isolated"
    // from "nobody can read anything". Without it a deployment whose
    // grants are broken reports a perfect green.
    name: "the probe stops checking A can see A's own rows",
    file: PROBE,
    from: '  check("A can see every row A just created", invisibleToOwner.length === 0,',
    to: '  check("A can see every row A just created", true, "",',
    expect: "A can see every row A just created",
  },
  {
    // 4. THE ANON CHECK GOES. Two signed-in people kept apart says
    // nothing about the key that ships in the browser bundle.
    name: "the probe stops checking the bare anon key",
    file: PROBE,
    from: '  check("an unauthenticated caller reads no user-owned row", anonLeaks.length === 0,',
    to: '  check("an unauthenticated caller reads no user-owned row", true, "",',
    expect: "an unauthenticated caller reads no user-owned row",
  },
  {
    // 5. THE STORAGE CHECK GOES. Sealed tables and open files is not
    // isolation: the PDF of somebody's finance report IS the row.
    name: "the probe stops checking storage",
    file: PROBE,
    from: '  check("B can reach NONE of A\'s objects, in any bucket", storageLeaks.length === 0,',
    to: '  check("B can reach NONE of A\'s objects, in any bucket", true, "",',
    expect: "B can reach NONE of A's objects",
  },
];

// A SEVENTH MUTATION WAS WRITTEN AND REMOVED, and the reason belongs here
// rather than in a commit message.
//
// It replaced the honesty test's own sealed-deployment baseline — "the
// probe passes against a correctly isolated stub" — with a constant true.
// That baseline is what separates "the probe discriminates" from "the
// probe is red for every input", so losing it matters. But NOTHING CAN
// CATCH IT FROM HERE: the mutation is in the gate, and the gate is the
// thing being asked. It reported MISSED, correctly, and a mutation that
// cannot be caught by the file it targets is a hole in the design rather
// than in the gate.
//
// What would catch it is a second observer — scripts/tests/gate-vacuity
// .test.mjs is the one this repository already has for exactly this
// question. Recorded as a known limit of this suite rather than left as a
// permanent MISSED that everyone learns to skim past.

function runGate() {
  try {
    execFileSync(process.execPath, [GATE], { encoding: "utf8", stdio: "pipe", timeout: 600_000 });
    return { green: true, failed: [] };
  } catch (e) {
    const out = String(e.stdout ?? "") + String(e.stderr ?? "");
    return { green: false, failed: [...out.matchAll(/^ {2}FAIL {2}(.+)$/gm)].map((m) => m[1].trim()) };
  }
}

console.log("isolation-probe-honesty mutations\n");

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
