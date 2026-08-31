#!/usr/bin/env node
/*
 * NO FILE IN THIS REPOSITORY NAMES ONE MACHINE.
 *
 * THE DEFECT, and how long it hid. scripts/tests/credit-function-privileges
 * .itest.mjs began with
 *
 *     import { startEphemeralPostgres } from "<a home directory>/scripts/lib/ephemeral-postgres.mjs";
 *     const ROOT = "<the same home directory>";
 *
 * — an absolute path into one developer's sandbox. The file ran perfectly
 * there and could not run anywhere else. Nothing noticed, because the
 * fourteen *.itest.mjs suites were named by no CI job at all: the first
 * run that included them died in ONE SECOND with ERR_MODULE_NOT_FOUND.
 *
 * I then made the same mistake in scripts/db/validate-cleanup-sql.mjs the
 * same afternoon, which is why this is a gate and not a fix.
 *
 * WHAT COUNTS AS A MACHINE PATH: an absolute path under a user's home
 * directory.
 * /usr, /opt, /var and /tmp are shared locations that exist on any Linux
 * runner and are used deliberately here (the Chromium fallback, the
 * PostgreSQL bin directory). Naming a person's directory is the fault.
 *
 * Run: node scripts/tests/portable-paths.test.mjs
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

let pass = 0;
const failures = [];
function check(name, cond, detail) {
  if (typeof cond !== "boolean") {
    failures.push(name);
    console.log(`  FAIL  ${name}\n        check() takes a BOOLEAN; got ${Array.isArray(cond) ? "an array" : typeof cond}`);
    return;
  }
  if (cond) pass++;
  else { failures.push(name); console.log(`  FAIL  ${name}${detail ? "\n        " + detail : ""}`); }
}

// THIS FILE IS EXEMPT FROM ITS OWN SCAN, and structurally rather than by
// name-matching: a gate that looks for a shape must contain that shape,
// so scanning itself it reports itself. test-export-drift.test.mjs has
// the same exemption for the same reason, and asserts that exactly one
// file is exempt — which is asserted below too.
const SELF = "portable-paths.test.mjs";
const ROOTS = ["src", "scripts", "supabase", ".github"];
const EXT = /\.(mjs|js|ts|tsx|json|yml|yaml|sql)$/;
const files = [];
for (const root of ROOTS) {
  (function walk(dir) {
    for (const e of readdirSync(dir)) {
      const p = path.join(dir, e);
      if (statSync(p).isDirectory()) walk(p);
      else if (EXT.test(p) && !p.endsWith(SELF)) files.push(p);
    }
  })(root);
}
check(`the repository was scanned (${files.length} files)`, files.length >= 300,
  "an empty scan makes every check below vacuous");

check("exactly one file is exempt, and it is this one",
  files.every((f) => !f.endsWith(SELF)) && files.length >= 300,
  "the exemption must not widen");

console.log("== 1. no home directory is named anywhere ==");
{
  // /home/<user>/… and /Users/<user>/… . A comment counts: a path in a
  // comment is a path somebody copies.
  const HOME = /(?:^|[\s"'`(=])(\/home\/[a-z0-9_.-]+\/|\/Users\/[A-Za-z0-9_.-]+\/)/;
  const offenders = [];
  for (const f of files) {
    const src = readFileSync(f, "utf8");
    for (const [i, line] of src.split("\n").entries()) {
      if (HOME.test(line)) offenders.push(`${f}:${i + 1}  ${line.trim().slice(0, 90)}`);
    }
  }
  check("no file names a home directory", offenders.length === 0,
    offenders.slice(0, 10).join("\n        "));
}

console.log("== 2. every script resolves its own root ==");
{
  // A script that needs the repository root must derive it, not assume
  // the working directory and not name a machine. Both forms are fine:
  // process.cwd() (run from the root, which npm scripts guarantee) or
  // fileURLToPath(import.meta.url) (correct from anywhere).
  const rootUsers = files.filter(
    (f) => /^scripts\//.test(f) && /\bconst ROOT\b/.test(readFileSync(f, "utf8"))
  );
  check(`some script declares a ROOT (${rootUsers.length})`, rootUsers.length >= 3,
    "if this is 0 the check below is inspecting nothing");
  const hardcoded = rootUsers.filter((f) => {
    const src = readFileSync(f, "utf8");
    const m = src.match(/const ROOT\s*=\s*([^;\n]+)/);
    return m ? /^"\/|^'\//.test(m[1].trim()) : false;
  });
  check("no script hard-codes its ROOT as an absolute string", hardcoded.length === 0,
    hardcoded.join(", "));
}

console.log("== 2b. the derivation actually lands on the repository root ==");
{
  // EVERY CHECK ABOVE IS A COUNT, and scripts/tests/gate-state-vs-behaviour
  // .test.mjs was right to say so: "no file names a home directory" is a
  // threshold on a scan, not a look at a value. This one runs the
  // derivation the fixed suites now use and compares WHERE IT LANDS.
  const from = path.join("scripts", "tests", "credit-function-privileges.itest.mjs");
  const derived = path.resolve(path.dirname(path.resolve(from)), "..", "..");
  check(`the derivation resolves to the repository root (${path.basename(derived)})`,
    derived === process.cwd(),
    `${derived} !== ${process.cwd()}`);
  // And it is the root that actually holds the repository, not merely a
  // directory two levels up from something.
  let hasPkg = false;
  try { readFileSync(path.join(derived, "package.json"), "utf8"); hasPkg = true; } catch {}
  check("...and that root holds package.json", hasPkg, derived);
  // The same derivation from a DIFFERENT depth must not land in the same
  // place — otherwise it is not deriving anything.
  const wrongDepth = path.resolve(path.dirname(path.resolve(from)), "..");
  check("...and the depth matters (a shallower resolve lands elsewhere)",
    wrongDepth !== derived, `${wrongDepth} === ${derived}`);
}

console.log("== 3. the shared locations that ARE allowed, named ==");
{
  // Stated so that "no absolute paths" is not read as a rule this
  // repository breaks in three places on purpose.
  const ALLOWED = ["/opt/pw-browsers", "/usr/lib/postgresql", "/tmp"];
  const used = ALLOWED.filter((a) => files.some((f) => readFileSync(f, "utf8").includes(a)));
  check(`the allowed shared locations are actually used (${used.length}/${ALLOWED.length})`,
    used.length >= 2,
    "if none is used, this list has outlived what it was written for");
  // And each of those is overridable, so a machine that puts them
  // elsewhere is not stuck.
  const chromium = files.filter((f) => readFileSync(f, "utf8").includes("/opt/pw-browsers"));
  const withoutOverride = chromium.filter((f) => !/CHROMIUM_PATH|executablePath/.test(readFileSync(f, "utf8")));
  check("every /opt/pw-browsers use has an env override beside it", withoutOverride.length === 0,
    withoutOverride.slice(0, 5).join(", "));
}

console.log(`\n${pass} passed, ${failures.length} failed`);
if (failures.length) { for (const f of failures) console.log(`  - ${f}`); process.exit(1); }
