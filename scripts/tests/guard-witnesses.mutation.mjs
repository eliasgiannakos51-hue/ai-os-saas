#!/usr/bin/env node
/*
 * THE GUARDS NOTHING WAS WATCHING, AND WHETHER ANYTHING WATCHES THEM NOW.
 *
 * scripts/tests/unguarded-guards.mjs removed one guard at a time and ran
 * the whole unit suite. Nine were probed and SEVEN could be deleted with
 * the suite still green. guard-witnesses.test.mjs is the answer written
 * after reading each one: they are load-bearing, and here is a check that
 * fails without them.
 *
 * That claim is exactly the kind this repository does not take on trust.
 * If a witness is itself a shape nothing enforces, the file has moved the
 * problem one level up rather than solved it — so every mutant below
 * removes the guard the witness was written for, and the witness has to
 * be the thing that goes red.
 *
 * Run: node scripts/tests/guard-witnesses.mutation.mjs
 */
import { readFileSync } from "node:fs";
import { writeFileSync } from "./lib/sidecar-write.mjs";
import { execFileSync } from "node:child_process";

const GATE = "scripts/tests/guard-witnesses.test.mjs";
const COLLECTIONS = "src/app/api/files/collections/route.ts";
const UNSPLASH = "src/lib/unsplash.ts";
const TRADING = "src/lib/trading/load.ts";
const SEARCH = "src/app/api/search/route.ts";

const MUTANTS = [
  {
    // A SILENT PARTIAL SUCCESS. Ask for five files, get a collection with
    // three and a 200. Nobody else's file is added — the SELECT is
    // filtered — so this is not a leak, it is the request quietly meaning
    // something other than what was sent.
    name: "the file-count comparison goes, so a collection is built from whatever survived the filter",
    file: COLLECTIONS,
    from: ".length !== requested.length",
    to: ".length !== -1",
    expect: "the count is compared",
  },
  {
    // The mismatch downgraded to a 200. The guard still runs and the
    // caller is still told the wrong thing.
    name: "a partial match answers 200 instead of 404",
    file: COLLECTIONS,
    from: "status: 404",
    to: "status: 200",
    expect: "a 404, not a shrug",
  },
  {
    // THE ONE THAT WOULD MAKE IT AN IDOR. The insert switching from the
    // OWNED list to the REQUESTED one turns a UX fault into another
    // user's files landing in this user's collection — the witness pins
    // it precisely because the guard's severity depends on it.
    name: "the insert uses the requested ids instead of the owned ones",
    file: COLLECTIONS,
    from: "ownedIds.map((fileId) => ({",
    to: "requested.map((fileId) => ({",
    expect: "the insert uses the OWNED list",
  },
  {
    // WHITESPACE IS NOT A VALUE. Without the trim a photo whose every
    // field is three spaces is a photo, and the attribution the Unsplash
    // licence requires renders as blank.
    name: "a whitespace-only photo becomes a real photo again",
    file: UNSPLASH,
    from: ".trim()",
    to: "",
    expect: "not a photo",
  },
  {
    // The same shape in the trading loader, where a symbol of three
    // spaces reads as a symbol.
    name: "a whitespace-only trading field stops reading as absent",
    file: TRADING,
    from: "value.trim() ? value : null",
    to: "value ? value : null",
    expect: "reads as absent",
  },
  {
    // `?since=banana` reaching Postgres as a timestamp comparison. The
    // parse is what stands between a query string and a database error.
    name: "an unparseable date is passed to the query unchecked",
    file: SEARCH,
    from: "!Number.isNaN(Date.parse(sinceRaw))",
    to: "sinceRaw !== undefined",
    expect: "parsed before it is used",
  },
];

function runGate() {
  try {
    execFileSync(process.execPath, [GATE], { encoding: "utf8", stdio: "pipe" });
    return { green: true, failed: [] };
  } catch (e) {
    const out = String(e.stdout ?? "") + String(e.stderr ?? "");
    const failed = [...out.matchAll(/^ {2}FAIL {2}(.+)$/gm)].map((m) => m[1].trim());
    return { green: false, failed: failed.length ? failed : ["(exited non-zero with no FAIL line)"] };
  }
}

console.log("guard-witnesses mutations\n");
const TARGETS = [...new Set(MUTANTS.map((m) => m.file))];
const originals = new Map(TARGETS.map((f) => [f, readFileSync(f, "utf8")]));
const restoreAll = () => { for (const [f, t] of originals) writeFileSync(f, t); };

let caught = 0;
const missed = [];
try {
  const base = runGate();
  console.log(`baseline: the gate is ${base.green ? "GREEN" : "RED"} on the unmutated tree`);
  if (!base.green) {
    console.log(`\nBASELINE IS RED — no result below would mean anything.\n  ${base.failed.join("\n  ")}`);
    process.exit(1);
  }
  for (const m of MUTANTS) {
    const original = originals.get(m.file);
    if (!original.includes(m.from)) {
      missed.push({ ...m, why: `the mutation target no longer exists in ${m.file}` });
      console.log(`  STALE   ${m.name}`);
      continue;
    }
    writeFileSync(m.file, m.all ? original.split(m.from).join(m.to) : original.replace(m.from, m.to));
    let result;
    try { result = runGate(); } finally { restoreAll(); }
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
console.log(after.green ? "\nbaseline: green again on the restored tree" : "\nBASELINE IS RED — a mutation was not restored.");
console.log(`\n${caught} of ${MUTANTS.length} mutations caught.`);
if (missed.length > 0 || !after.green) {
  if (missed.length) { console.log("\nHOLES:"); for (const m of missed) console.log(`  - ${m.name}\n    ${m.why}`); }
  process.exit(1);
}
console.log("Every witness in that file is watching something real.");
