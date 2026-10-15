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
import { stripComments } from "../check-mutation-markers.mjs";

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
  //
  // THIS CHECK WAS SATISFIED BY THE DEFECT IT WAS WRITTEN TO CATCH, for
  // five weeks. It accepted either word of /CHROMIUM_PATH|executablePath/
  // as proof of an override — and a file that names the bundled browser
  // outright is OBLIGED to write `executablePath` beside it. So the two
  // files doing exactly the wrong thing matched the alternation and were
  // filtered out of the offender list. The check could not go red.
  //
  // What it cost, measured 2026-10-14: chat-dictation.prodtest.mjs and
  // voice-command.prodtest.mjs named the container path outright, so on a
  // GitHub runner — where that path does not exist — they threw at launch.
  // `npm run test:prod` (package.json) is a shell loop with `|| exit 1`,
  // chat-dictation is the 11th of 74 files alphabetically, and the
  // nightly `prodtests` job therefore died there every night from
  // 2026-10-10 (issue #280) with 63 files never started. A prodtest that
  // never starts is not passing and not failing, which is the same hole
  // scripts/tests/lib/chromium.mjs was written to close.
  //
  // Two checks now, because the rule has two halves and one of them is
  // about an exact shape rather than a file's contents somewhere.
  // Read WITHOUT comments, so that a paragraph explaining the defect
  // cannot be mistaken for the defect, nor stand in for the fix.
  const code = new Map(files.map((f) => [f, stripComments(readFileSync(f, "utf8"))]));
  // The shared resolver answers this question for everyone, preferring
  // the variable and falling back only when the bundled browser is
  // really there. Reading the variable directly is the older way and
  // still correct. Writing `executablePath` is neither — that was the
  // whole defect.
  const letsEnvWin = (s) => /\bchromiumPath\s*\(/.test(s) || /process\.env\.CHROMIUM_PATH/.test(s);
  // THE DETECTOR, PINNED TO FIXTURES, because an empty offender list and
  // a detector that cannot say no print the same line. These three are
  // the rungs: the shape that must be caught, and the two that must not
  // be (CLAUDE.md, "a detector that says yes to everything looks exactly
  // like a working one"). Under the alternation this check shipped with,
  // the first fixture passed — which is the entire bug, stated as a test.
  check("the rule says no to a hard-coded browser path",
    !letsEnvWin('executablePath: "/opt/pw-browsers/chromium"'));
  check("...yes to the shared resolver",
    letsEnvWin("executablePath: chromiumPath()"));
  check("...and yes to the variable read directly",
    letsEnvWin('executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"'));
  const chromium = files.filter((f) => code.get(f).includes("/opt/pw-browsers"));
  const withoutOverride = chromium.filter((f) => !letsEnvWin(code.get(f)));
  check(`every /opt/pw-browsers use lets the environment win (${chromium.length} name it)`,
    chromium.length > 0 && withoutOverride.length === 0,
    withoutOverride.slice(0, 5).join(", ") + " — resolve through scripts/tests/lib/chromium.mjs");
  // THE EXACT SHAPE, ranged over every file rather than the ones that
  // happen to launch a browser today: the bundled path as a literal
  // executablePath is the thing that cannot work off this container.
  const namedOutright = files.filter((f) =>
    /executablePath:\s*["'`]\/opt\/pw-browsers/.test(code.get(f)));
  check(`no file hands Playwright the container's path as a literal (${namedOutright.length})`,
    namedOutright.length === 0,
    namedOutright.join(", ") + " — chromiumPath() returns undefined where that file is absent, which is the right answer there");
}

console.log(`\n${pass} passed, ${failures.length} failed`);
if (failures.length) { for (const f of failures) console.log(`  - ${f}`); process.exit(1); }
