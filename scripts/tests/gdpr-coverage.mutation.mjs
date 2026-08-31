#!/usr/bin/env node
/*
 * CAN gdpr-coverage.test.mjs TELL A LABELLED TABLE FROM A DROPPED ONE?
 *
 * Scope: the `status` clauses, added when the instruction was to take six
 * "dead" tables OUT of the registry with a comment. Two of them hold rows
 * from replaced features, so dropping them would have stopped those rows
 * being exported (Art. 15) and stopped them being deleted with the
 * account (Art. 17); a third is written every time somebody presses Quick
 * Start on the home screen. The field records the state instead, and
 * these mutations are what stop it turning back into an exemption.
 *
 * The first mutant is the instruction itself, carried out: a table
 * removed from the registry. It has to go red, and it does — on the check
 * that reads the SCHEMA rather than the registry.
 *
 * The other 50-odd checks in that gate predate this file and are not
 * covered here.
 *
 * Run: node scripts/tests/gdpr-coverage.mutation.mjs
 */
import { readFileSync } from "node:fs";
import { writeFileSync } from "./lib/sidecar-write.mjs";
import { execFileSync } from "node:child_process";

const GATE = "scripts/tests/gdpr-coverage.test.mjs";
const REGISTRY = "src/lib/gdpr/user-data-registry.ts";
const TARGETS = [GATE, REGISTRY];

const MUTANTS = [
  {
    name: "a legacy table is dropped from the registry, as instructed",
    file: REGISTRY,
    from: '    table: "ai_documents",\n    label: "ai_documents",\n    scope: "user_content",',
    to: '    table: "ai_documents_removed",\n    label: "ai_documents",\n    scope: "user_content",',
    expect: "no table with a user_id is missing from the registry",
  },
  {
    name: "a live table is relabelled as legacy",
    file: REGISTRY,
    from: '  { table: "ai_coding_requests", label: "ai_coding_requests", scope: "user_content" },',
    to: '  { table: "ai_coding_requests", label: "ai_coding_requests", scope: "user_content", status: "legacy", statusNote: "Long enough to pass the length floor on its own, which is exactly why the claim is checked against the code as well." },',
    expect: "no table called legacy is a live module table or seeded by a template",
  },
  {
    name: "a table stops being written and nothing says so",
    file: REGISTRY,
    from: '    status: "legacy",\n    statusNote:\n      "The Build-module tracker /dashboard/agents used to render',
    to: '    statusNote:\n      "The Build-module tracker /dashboard/agents used to render',
    expect: "every ai_* table is named in the code or labelled",
  },
  {
    name: "a status arrives with no reason",
    file: REGISTRY,
    from: '    statusNote: "V4 #15, same as bank_connections — schema present, nothing writes it yet.",',
    to: '    statusNote: "dead",',
    expect: "every status is one of legacy/provisioned and carries a reason",
  },
  {
    // THE DRIFT THIS CLAUSE EXISTS FOR, written the way it would really
    // arrive: "it is legacy anyway, leave it out of the export".
    //
    // The first version of this mutant defanged the CHECK's own guard
    // instead, which simply stopped it running — a skipped check is not a
    // failing one, and the suite reported it as a hole. Correctly: to show
    // a clause is load-bearing you have to make the thing it asserts
    // false, not stop it being asserted.
    name: "a labelled table is quietly taken out of the export",
    file: REGISTRY,
    from: '    (t) => t.scope !== "not_personal" && t.scope !== "derived_index"',
    to: '    (t) => t.scope !== "not_personal" && t.scope !== "derived_index" && !t.status',
    expect: "still exported despite being",
  },
  {
    name: "the scan of src reads nothing",
    file: GATE,
    from: '    else if (/\\.tsx?$/.test(entry.name)) srcFiles.push(full);',
    to: "    else if (false) srcFiles.push(full);",
    expect: "every ai_* table is named in the code or labelled",
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

console.log("gdpr-coverage (status clauses) mutations\n");

const originals = new Map(TARGETS.map((f) => [f, readFileSync(f, "utf8")]));
const restoreAll = () => {
  for (const [file, text] of originals) writeFileSync(file, text);
};

let caught = 0;
const missed = [];
try {
  const base = runGate();
  console.log(
    `baseline: the gate is ${base.green ? "GREEN" : "RED"} on the unmutated tree`,
  );
  if (!base.green) {
    console.log(
      `\nBASELINE IS RED — no mutation result below would mean anything.\n  ${base.failed.join("\n  ")}`,
    );
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
      console.log(
        `  WRONG   ${m.name}\n          -> red on: ${result.failed.slice(0, 4).join(" | ")}`,
      );
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
    : "\nBASELINE IS RED — a mutation was not restored. Check `git diff`.",
);

console.log(`\n${caught} of ${MUTANTS.length} mutations caught.`);
if (missed.length > 0 || !after.green) {
  if (missed.length > 0) {
    console.log("\nHOLES:");
    for (const m of missed) console.log(`  - ${m.name}\n    ${m.why}`);
  }
  process.exit(1);
}
console.log("Every status clause is load-bearing.");
