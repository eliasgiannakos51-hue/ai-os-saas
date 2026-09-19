#!/usr/bin/env node
/*
 * CAN gate-independence.test.mjs TELL A LADDER FROM A FLAT SURFACE?
 *
 * The gate it guards holds two things: that the classifier still sorts,
 * and that the bottom rung is a named list of four settled gates. Both
 * fail in the same direction — a detector that says yes to everything
 * leaves NONE empty, and an empty bottom rung reads as "nothing is
 * wrong". That is exactly what happened to the first LITERAL detector:
 * it counted `.length > 0`, which every gate's own footer satisfies,
 * and 264 of 275 matched.
 *
 * So four of the six mutants below make a detector unconditional, one
 * empties the scan, and one puts shape 35's real defect back.
 *
 * Run: node scripts/tests/gate-independence.mutation.mjs
 */
import { readFileSync } from "node:fs";
import { writeFileSync } from "./lib/sidecar-write.mjs";
import { execFileSync } from "node:child_process";

const GATE = "scripts/tests/gate-independence.test.mjs";
const SCAN = "scripts/scan-gate-independence.mjs";
const USER_PHOTOS = "scripts/tests/user-photos.test.mjs";
const LITERAL_GATE = "scripts/tests/chat-measure.test.mjs";

const TARGETS = [GATE, SCAN, USER_PHOTOS, LITERAL_GATE];

const MUTANTS = [
  {
    // THE DEFECT THAT MADE THIS GATE NECESSARY, put back. Counting
    // `.length > 0` as an expectation matched 264 of 275 build gates.
    name: "LITERAL counts a length comparison again, so nothing reaches NONE",
    file: SCAN,
    from: "  let literal = null;",
    to: "  let literal = /\\.length\\s*(?:===|>=|>)\\s*\\d+/.test(code) ? \"a comparison\" : null;",
    expect: "is read as NONE",
  },
  {
    name: "the DISK detector fires on every gate",
    file: SCAN,
    from: "  const disk = /\\breaddirSync\\(|\\bglobSync\\(|\\bwalk\\(|readdir\\(/.test(code);",
    to: "  const disk = true;",
    expect: "is read as NONE",
  },
  {
    // The boundary bug this gate caught while it was being written:
    // BASE_URL matches inside DATABASE_URL, so every database gate was
    // filed one rung too high.
    name: "BASE_URL loses its leading boundary, so DATABASE_URL reads as NETWORK",
    file: SCAN,
    from: "\\bBASE_URL\\b/",
    to: "BASE_URL\\b/",
    expect: "is read as DB",
  },
  {
    name: "the scan returns nothing, so the bottom rung looks empty",
    file: SCAN,
    from: "export function scanAll() {",
    to: "export function scanAll() {\n  return [];",
    expect: "still at NONE",
  },
  {
    // A FIFTH GATE ARRIVES AT NONE. chat-measure's only reference is a
    // two-entry table of measured ratios; take it away and it has
    // nothing left to disagree with.
    name: "a gate loses its only reference and lands at NONE unannounced",
    file: LITERAL_GATE,
    from: "const CHARS_PER_CH = { en: 1.22, el: 1.11 };",
    to: "const CHARS_PER_CH = JSON.parse(process.env.RATIOS ?? '{}');",
    expect: "chat-measure.test.mjs is a known one",
  },
  {
    // SHAPE 35's real instance, restored: the rule is about every table
    // that carries HTML, the evidence is four table names written in
    // the gate.
    name: "user-photos names four tables again instead of deriving them",
    file: USER_PHOTOS,
    from: '  const unread = htmlTables.filter((t) => !route.includes(`"${t}"`));\n  ok("...and every table that carries HTML is read",\n    unread.length === 0,\n    `not read by the cleanup: ${unread.join(", ")}`);',
    to: '  ok("...and every table that carries HTML is read",\n    ["user_websites", "published_sites", "website_versions", "site_versions"].every((t) => route.includes(`"${t}"`)));',
    expect: "user-photos.test.mjs",
  },
];

function runGate() {
  try {
    execFileSync(process.execPath, [GATE], { encoding: "utf8", stdio: "pipe" });
    return { green: true, failed: [] };
  } catch (e) {
    const out = String(e.stdout ?? "") + String(e.stderr ?? "");
    return { green: false, failed: [...out.matchAll(/^ {2}- (.+)$/gm)].map((m) => m[1]) };
  }
}

console.log("gate-independence mutations\n");

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
    console.log(`\nBASELINE IS RED — nothing below would mean anything.\n  ${base.failed.join("\n  ")}`);
    process.exit(1);
  }

  for (const m of MUTANTS) {
    if (!originals.get(m.file).includes(m.from)) {
      missed.push({ ...m, why: `the mutation target no longer exists in ${m.file}` });
      console.log(`  STALE   ${m.name}`);
      continue;
    }
    const mutated = originals.get(m.file).replace(m.from, () => m.to);
    if (mutated === originals.get(m.file)) {
      missed.push({ ...m, why: "the mutation left the file byte-identical" });
      console.log(`  NO-OP   ${m.name}`);
      continue;
    }
    writeFileSync(m.file, mutated);
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
        why: `red, but on "${result.failed.join('", "')}" — nothing matching "${m.expect}"`,
      });
      console.log(`  WRONG   ${m.name}\n          -> red on: ${result.failed.join(" | ")}`);
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
console.log("Every clause of the gate is load-bearing.");
