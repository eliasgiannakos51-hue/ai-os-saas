#!/usr/bin/env node
/*
 * CAN schema-canaries.test.mjs SEE THE PROBE START LYING AGAIN?
 *
 * This probe has been wrong in production twice, in the same direction
 * both times: it named six functions as missing while all six were
 * working. The first version called each function with no arguments and
 * read "could not find the function ... in the schema cache" as absence —
 * the words PostgREST also uses for a present function called wrongly.
 * The second kept the call and tried to separate the two by the `hint`;
 * production went on listing the same six with the schema cache already
 * reloaded and ⌘K visibly returning rows.
 *
 * The cost of that is not noise. The four columns that were genuinely
 * missing on 2026-09-04 — three cancel_requested_at and
 * user_websites.generation_notes, the second of which was failing every
 * website generation at its final save — arrived in the middle of six
 * false ones and were found by hand.
 *
 * So each mutation below is one way back to that: guessing instead of
 * asking, treating "could not ask" as "missing", counting canaries that
 * were skipped, or calling a function to find out whether it exists.
 *
 * Run: node scripts/tests/schema-canaries.mutation.mjs
 */
import { readFileSync } from "node:fs";
import { writeFileSync } from "./lib/sidecar-write.mjs";
import { execFileSync } from "node:child_process";

const GATE = "scripts/tests/schema-canaries.test.mjs";
const ROUTE = "src/app/api/health/route.ts";
const TARGETS = [GATE, ROUTE];

const MUTANTS = [
  {
    // 1. "COULD NOT ASK" BECOMES "MISSING" — the exact production defect,
    // rebuilt on the new shape: an unavailable root would name every
    // function canary.
    name: "an unreachable API root reports every function as missing",
    file: ROUTE,
    from: "            if (!apiFunctions) return;\n            if (!apiFunctions.has(c.fn as string)) {",
    to: "            if (!apiFunctions?.has(c.fn as string)) {",
    expect: "a canary is missing only when the list came back and does not name it",
  },
  {
    // 2. A NON-OK ROOT IS READ AS AN ANSWER. A 500 from the API would be
    // parsed as though it were the document.
    name: "a failed request for the function list is parsed anyway",
    file: ROUTE,
    from: "    if (!res.ok) return null;",
    to: "    if (!res.ok && res.status === 599) return null;",
    expect: "an unreachable or non-OK root is 'could not ask', not 'missing'",
  },
  {
    // 3. AN EMPTY DOCUMENT IS TREATED AS "NO FUNCTIONS EXIST" — which
    // names every canary, from a document that was simply the wrong one.
    name: "a document naming no functions is treated as a database with none",
    file: ROUTE,
    from: "    return names.size > 0 ? names : null;",
    to: "    return names;",
    expect: "...and so is a document that names no functions at all",
  },
  {
    // 4. THE SWEEP STOPS SAYING WHICH HAPPENED, so a reader cannot tell a
    // clean sweep from one that skipped the functions.
    name: "the sweep always claims the functions were listed",
    file: ROUTE,
    from: '      functions: functionsListed ? "listed" : "unchecked",',
    to: '      functions: "listed",',
    expect: "the sweep reports which of the two happened",
  },
  {
    // 5. THE COUNT INCLUDES CANARIES THAT WERE SKIPPED — "checked: 16" for
    // a sweep that looked at six.
    name: "skipped function canaries are counted as checked",
    file: ROUTE,
    from: "      checked: functionsListed ? SCHEMA_CANARIES.length : SCHEMA_CANARIES.length - functionCanaries,",
    to: "      checked: SCHEMA_CANARIES.length,",
    expect: "...and counts only what it actually looked at",
  },
  {
    // 6. THE FUNCTION IS CALLED TO SEE IF IT IS THERE. settle_reservation
    // is not something to poke; and this is where both earlier versions
    // started.
    name: "the probe goes back to calling each function to see if it exists",
    file: ROUTE,
    from: "            if (!apiFunctions) return;",
    to: "            if (!apiFunctions) { await admin.rpc(c.fn as string, {}); return; }",
    expect: "no canary function is called to find out whether it exists",
  },
  {
    // 7. THE GATE ITSELF STOPS READING THE ROUTE — every check above then
    // tests an empty string, which is how a gate goes quietly green.
    name: "the gate reads a file that is not the route",
    file: GATE,
    from: 'const route = stripComments(readFileSync("src/app/api/health/route.ts", "utf8"));',
    to: 'const route = stripComments(readFileSync("package.json", "utf8"));',
    expect: "the function list comes from the API's own root document",
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

console.log("schema-canaries mutations\n");

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
console.log("Every clause in schema-canaries.test.mjs section 4 is load-bearing.");
