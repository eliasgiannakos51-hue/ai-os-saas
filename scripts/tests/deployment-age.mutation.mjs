#!/usr/bin/env node
/*
 * CAN THE GATE SEE A FORTY-DAY-OLD DEPLOYMENT CALL ITSELF HEALTHY?
 *
 * Every mutation below is a way the instrument could go back to being
 * what it was on 2026-09-25 — present, green, and silent about a build
 * from another month.
 *
 * Run: node scripts/tests/deployment-age.mutation.mjs
 */
import { readFileSync } from "node:fs";
import { writeFileSync } from "./lib/sidecar-write.mjs";
import { execFileSync } from "node:child_process";

const GATE = "scripts/tests/deployment-age.test.mjs";
const AGE = "src/lib/health/deployment-age.ts";
const ROUTE = "src/app/api/health/route.ts";
const CONFIG = "next.config.mjs";

const TARGETS = [GATE, AGE, ROUTE, CONFIG];

const MUTANTS = [
  {
    // THE WHOLE POINT. A field beside `ok: true` is exactly what the
    // forty days looked like.
    name: "an ancient deployment stops failing the probe",
    file: ROUTE,
    from: 'if (age.known && age.level === "ancient") {',
    to: "if (false) {",
    expect: "makes the whole probe NOT ok",
  },
  {
    // AN UNSTAMPED BUILD REPORTS AS FRESH — the direction that lets
    // staleness pass unnoticed.
    name: "a missing stamp is treated as brand new",
    file: AGE,
    from: '      reason: "no_stamp",\n      detail:',
    to: '      reason: "ok",\n      detail:',
    expect: "no stamp at all is not known",
  },
  {
    // THE CACHED-BUILD TRAP. Preferring BUILD_AT means a cached build
    // that re-stamps itself reports zero days while serving old code —
    // which is the exact mechanism of the incident.
    name: "the build time is preferred over the commit date",
    file: AGE,
    from: 'const source: "commit" | "build" = commit ? "commit" : "build";\n  const raw = commit || built;',
    to: 'const source: "commit" | "build" = built ? "build" : "commit";\n  const raw = built || commit;',
    expect: "the commit date wins when both are present",
  },
  {
    // THE LINE MOVES PAST THE REAL CASE. At 45 days, forty reports ok.
    name: "the ancient threshold moves past forty days",
    file: AGE,
    from: "export const DEPLOYMENT_ANCIENT_AFTER_DAYS = 30;",
    to: "export const DEPLOYMENT_ANCIENT_AFTER_DAYS = 45;",
    // ANCHORED ON THE INCIDENT'S OWN CASE, not on the threshold check.
    // That check's label interpolates the value it asserts, so a mutated
    // threshold renames the failure and no fixed string can match it — a
    // label that carries the number is not an anchor.
    expect: "40 days old -> ancient",
  },
  {
    // ROUNDING UP fires a day early, and an alarm that cries wolf is an
    // alarm somebody turns off.
    name: "the age rounds up instead of down",
    file: AGE,
    from: "const ageDays = Math.max(0, Math.floor((now.getTime() - when) / 86_400_000));",
    to: "const ageDays = Math.max(0, Math.ceil((now.getTime() - when) / 86_400_000));",
    expect: "six days and twenty-three hours is still six days",
  },
  {
    // NOTHING IS BAKED, so the deployed bundle can never answer.
    name: "the commit date is no longer baked into the build",
    file: CONFIG,
    from: "    NEXT_PUBLIC_BUILD_COMMIT_DATE: BUILD_COMMIT_DATE,",
    to: "    NEXT_PUBLIC_BUILD_COMMIT_DATE_UNUSED: BUILD_COMMIT_DATE,",
    expect: "next.config bakes the commit date",
  },
  {
    // A HOST WITHOUT GIT breaks every build instead of degrading.
    name: "a missing git throws instead of degrading",
    file: CONFIG,
    from: "  } catch {\n    return \"\";\n  }",
    to: "  } catch (e) {\n    throw e;\n  }",
    expect: "a missing git does not break the build",
  },
  {
    // THE EXACT DATE LEAKS to an unauthenticated caller.
    name: "the detail is served to anyone",
    file: ROUTE,
    from: "  if (authorised) body.deployment = { ...(body.deployment as object), detail: age.detail };",
    to: "  body.deployment = { ...(body.deployment as object), detail: age.detail };",
    expect: "an unauthorised caller gets the level, not the detail",
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

console.log("deployment-age mutations\n");

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
      missed.push({ ...m, why: `red, but on "${result.failed.join('", "')}" — nothing matching "${m.expect}"` });
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
