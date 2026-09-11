#!/usr/bin/env node
/*
 * WOULD THIS PROBE GO QUIET THE WAY THE ONE IT WATCHES DID?
 *
 * The failure it exists to catch is a measurement that stops and says
 * nothing. The failure IT could have is the same shape one level up: a
 * verdict that never says STALE, a threshold that never trips, a second
 * table that is really the first one. Each mutant is one of those.
 *
 * Run: node scripts/tests/nav-freshness.mutation.mjs
 */
import { readFileSync } from "node:fs";
import { writeFileSync } from "./lib/sidecar-write.mjs";
import { execFileSync } from "node:child_process";

const GATE = "scripts/tests/nav-freshness.test.mjs";
const FRESH = "src/lib/health/nav-freshness.ts";
const HEALTH = "src/app/api/health/route.ts";

const MUTANTS = [
  {
    // THE ONE THAT MATTERS. A probe whose worst verdict is "quiet" is a
    // probe nobody ever acts on — exactly the state nav_events was in
    // for four days.
    name: "STALE is never reached, so a dead tracker reads as a quiet weekend",
    file: FRESH,
    // Re-anchored: the four branches moved into the exported navVerdict
    // when this suite showed the gate was checking its own copy of them.
    from: '  if (activityAgeHours !== null && activityAgeHours <= NAV_STALE_HOURS) return "STALE";',
    to: '  if (false) return "STALE";',
    expect: "THE FAULT -> STALE",
  },
  {
    name: "the comparison table is dropped, so the two causes merge again",
    file: FRESH,
    from: 'newestAt(supabase, "rate_limit_log"),',
    to: 'newestAt(supabase, "nav_events"),',
    expect: "it reads a SECOND table",
  },
  {
    name: "the window widens to a week, so four days of silence passes",
    file: FRESH,
    from: "export const NAV_STALE_HOURS = 48;",
    to: "export const NAV_STALE_HOURS = 168;",
    expect: "it is 48 hours, as asked",
  },
  {
    name: "a question that could not be asked answers ok",
    file: FRESH,
    from: '    return { navAgeHours: null, activityAgeHours: null, verdict: "unchecked" };',
    to: '    return { navAgeHours: null, activityAgeHours: null, verdict: "ok" };',
    expect: "never as ok",
  },
  {
    name: "the verdict starts paging: a quiet weekend becomes a 503",
    file: HEALTH,
    from: "    status: probe.ok ? 200 : 503,",
    to: "    status: probe.ok && body.nav !== undefined ? 200 : 503,",
    expect: "does not touch ok or the status code",
  },
  {
    name: "it is asked before the database is known to answer",
    file: HEALTH,
    from: "  if (probe.dbAnswered) {\n    body.schema = await currentSchemaSweep();",
    to: "  body.nav = { navAgeHours: null, activityAgeHours: null, verdict: \"ok\" };\n  if (probe.dbAnswered) {\n    body.schema = await currentSchemaSweep();",
    expect: "only when the database actually answered",
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

console.log("nav-freshness mutations\n");
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
    writeFileSync(m.file, original.replace(m.from, m.to));
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
console.log("The probe cannot go quiet the way the thing it watches did.");
