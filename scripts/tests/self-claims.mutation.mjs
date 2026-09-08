#!/usr/bin/env node
/*
 * CAN self-claims.test.mjs SEE A COMMENT START LYING AGAIN?
 *
 * Each mutation is a real shape this scan found on its first run:
 *
 *   · a path in a comment that goes nowhere;
 *   · a README naming a module a rename removed;
 *   · a `Run:` header pointing at a different suite;
 *   · an exception in the allowlist that has gone stale in either
 *     direction — the file came back, or the comment was rewritten and
 *     nobody removed the entry.
 *
 * Run: node scripts/tests/self-claims.mutation.mjs
 */
import { readFileSync } from "node:fs";
import { writeFileSync } from "./lib/sidecar-write.mjs";
import { execFileSync } from "node:child_process";

const GATE = "scripts/tests/self-claims.test.mjs";
const TIMELINE = "src/lib/timeline.ts";
const README = "README.md";
const TRUNCATE_MUT = "scripts/tests/truncate.test.mjs";
const SCANNER = "scripts/scan-self-claims.mjs";
// The exception table moved out of the gate so gate-import-paths.test.mjs
// could read the same one; mutating it means mutating the module, not the
// suite that consumes it.
const TABLE = "scripts/tests/lib/absent-on-purpose.mjs";

// BUILT FROM PIECES, BECAUSE THE GATE READS THIS FILE TOO. A mutation
// table that spells out a path going nowhere, or a Run: line naming
// another suite, IS the defect — written down in scripts/, where
// scan-self-claims.mjs finds it. The first version of this suite turned
// its own baseline red before a single mutation was applied, which is a
// pleasingly direct proof that the gate works.
const FAKE_MODULE = ["lib", "text", "ellipsis" + "-helpers.ts"].join("/");
const RUN_PREFIX = "// R" + "un: node ";

const MUTANTS = [
  {
    // 1. A COMMENT NAMES A FILE THAT IS NOT THERE — the whole category.
    name: "a comment points at a module that does not exist",
    file: TIMELINE,
    from: "  // truncateWithEllipsis, not slice: a record title ending in an emoji",
    to: `  // See ${FAKE_MODULE}: a record title ending in an emoji`,
    expect: "no comment names a file that is not there",
  },
  {
    // 2. THE README GOES BACK TO THE PRE-RENAME PATH. Two lines of it did,
    // for however long the rename has been in.
    name: "the README names a module a rename removed",
    file: README,
    from: "`src/lib/auth/admin-emails.ts` defines an `ADMIN_EMAILS` allowlist",
    to: "`src/lib/admin.ts` defines an `ADMIN_EMAILS` allowlist",
    expect: "no comment names a file that is not there",
  },
  {
    // 3. A HEADER COPIED OFF A SIBLING — six of these were live, one of
    // them dragging a whole paragraph describing the wrong suite.
    name: "a Run: header names a different suite",
    file: TRUNCATE_MUT,
    from: `${RUN_PREFIX}scripts/tests/truncate.test.mjs`,
    to: `${RUN_PREFIX}scripts/tests/i18n-coverage.test.mjs`,
    expect: "every Run: header names its own file",
  },
  {
    // 4. THE SCAN STOPS SCANNING. A resolver that answers "found" for
    // everything is the shape a "this is too noisy" change takes, and the
    // zero above would stay green forever. What catches it is the OTHER
    // direction of the allowlist: with nothing reported, every exception
    // in the table describes a claim the scan no longer sees.
    name: "the resolver answers found for every path",
    file: SCANNER,
    from: "  return candidates.find((c) => existsSync(c)) ?? null;",
    to: "  return candidates[0];",
    expect: "no entry describes a claim the scan no longer sees",
  },
  {
    // 5. AN EXCEPTION FOR A FILE THAT IS BACK. The other half of a stale
    // allowlist: the comment was right when it was written, the file
    // returned, and the entry now excuses a claim that is true.
    name: "an exception names a path that exists again",
    file: TABLE,
    from: '    paths: ["lib/admin.ts", "src/app/icon.tsx", "lib/pdf/render/.test"],',
    to: '    paths: ["lib/admin.ts", "src/app/layout.tsx", "lib/pdf/render/.test"],',
    expect: "no allowed path has come back into the tree",
  },
  {
    // 6. AN ALLOWLIST ENTRY THAT NOBODY REMOVED. The i18n-coverage
    // failure mode: it knew about three and stayed at three long after
    // they were paid off. Here the comment stops making the claim and the
    // exception outlives it.
    name: "an exception outlives the comment it was written for",
    file: "scripts/tests/gate-vacuity.test.mjs",
    from: "lib/admin.ts",
    to: "lib/auth/admin-emails.ts",
    expect: "no entry describes a claim the scan no longer sees",
  },
  {
    // 7. THE DYNAMIC SEGMENT SWALLOWS ANYTHING. This is the defect that
    // let a route that has never existed, /dashboard/business, read as a
    // page for three rounds while
    // src/app/dashboard/[module]/page.tsx calls notFound() for it. With
    // the registry ignored, every dashboard slug resolves and the zero
    // above stays green on a scan that has stopped looking.
    name: "a dynamic segment resolves for any value at all",
    file: SCANNER,
    from: "    const registry = DYNAMIC_VALUES[join(dir, dynamic)];",
    to: "    const registry = null;",
    expect: "does NOT resolve for one it does not",
  },
  {
    // 8. THE NAMESPACE TEST STOPS FINDING ROUTES BENEATH A DIRECTORY.
    //
    // THIS MUTANT USED TO AIM AT THE TERNARY that calls hasChildRoute,
    // and it was a hole: measured on 2026-09-08, zero of the directories
    // under src/app lack a route somewhere beneath them, so `return
    // "namespace"` and `return hasChildRoute(dir) ? "namespace" : null`
    // give the same answer for every input resolveRoute can reach. A
    // mutation nothing can catch is not evidence of a gap in the gate; it
    // is a mutation aimed at unreachable code, and swapping it for one
    // aimed at the helper is the fix rather than lowering the count.
    name: "the namespace test stops recognising a route file",
    file: SCANNER,
    from: "      if (/^(route|page)\\.tsx?$/.test(e.name)) return true;",
    to: "      if (/^(route|page)\\.tsx?$/.test(e.name)) continue;",
    expect: "a directory with routes below it is a namespace",
  },
  {
    // 9. THE ABSENCE WINDOW WIDENS BACK. Forty characters is what
    // separates "used to list", written about the nineteen modules, from
    // the route sixty characters earlier in the same sentence. At a
    // hundred the scan suppresses the finding again — which is how the
    // second of the two wrong comments survived a round.
    name: "the route absence window grows wide enough to read another clause",
    file: SCANNER,
    from: "const ROUTE_ABSENCE_RADIUS = 40;",
    to: "const ROUTE_ABSENCE_RADIUS = 100;",
    expect: "a past tense about something else in the sentence does not excuse a route",
  },
  {
    // 10. THE ROUTE MATCHER STOPS MATCHING. The cheapest way to hold a
    // list at zero is to stop filling it, and dropping a root from the
    // pattern is a one-word edit that looks like tidying.
    name: "the route matcher forgets one of the roots the app serves",
    file: SCANNER,
    from: "((?:\\/api|\\/dashboard|\\/auth)\\/",
    to: "((?:\\/auth)\\/",
    expect: "route claims to resolve",
  },
  {
    // 11. A ROUTE EXCEPTION THAT OUTLIVED ITS COMMENT — the same
    // staleness the path table is checked for, on the table that was
    // added beside it. If it were not checked, the four corrections
    // recorded in V5 #13 could be deleted and their exemptions would
    // stay, quietly excusing whatever came next.
    name: "a route exception outlives the comment it was written for",
    file: "src/lib/module-icons.ts",
    from: "// IT SAID /dashboard/business until V5 #13, the same wrong route",
    to: "// IT SAID the wrong thing until V5 #13, the same wrong route",
    expect: "no route exception describes a comment that is gone",
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

console.log("self-claims mutations\n");

const TARGETS = [...new Set(MUTANTS.map((m) => m.file))];
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
console.log("A statement about this repository that stops being true turns the build red.");
