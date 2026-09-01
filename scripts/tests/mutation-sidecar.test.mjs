// EVERY MUTATION SUITE HEALS, NOT JUST THE ONES WHERE THE ACCIDENT
// ALREADY HAPPENED.
//
// Sixty suites in this directory edit real source files and put them
// back. Fifty-eight did it in a `finally`, which does not run when the
// process is killed, and this repository has lost that bet FOUR times —
// the fourth during the session that wrote this file, when a timeout
// killed unguarded-guards.mjs and left `stripped.length === ch.length`
// deleted from lib/text/unicode-patterns.ts. That guard is load-bearing
// for five writing systems.
//
// The fix already existed and had been applied to five suites: the ones
// where an accident had happened. The other fifty-five had the identical
// shape and no sidecar. That is not a different bug — it is the same one,
// unfixed everywhere it had not yet bitten, which is what "safe by
// coincidence" looks like when the coincidence is "nobody killed that
// particular suite yet".
//
// Run: node scripts/tests/mutation-sidecar.test.mjs
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

let pass = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    failures.push(name);
    console.log(`  FAIL  ${name}${detail !== undefined ? "\n        " + detail : ""}`);
  }
}
const { stripComments } = await import("../check-mutation-markers.mjs");

/**
 * COMMENTS ARE NOT CODE, AND NEITHER ARE STRING LITERALS.
 *
 * This gate scans mutation suites, and a mutation suite's whole job is to
 * carry the defect it re-introduces AS A STRING. Twice while writing this
 * file a check read one of those strings as if the suite did the thing:
 * once an `import ... from "node:fs"` inside a `to:` property, once a
 * `mkdtempSync("scripts/tests/…")`. Both were the gate accusing a suite of
 * what it was testing FOR.
 *
 * The import checks are anchored to column zero, which settles that one.
 * A call can legitimately be indented, so this is the other half: for
 * checks about what a suite DOES, the literals come out first. The quotes
 * are kept so the code still parses as shapes; only the contents go.
 */
function stripLiterals(src) {
  return src
    .replace(/`(?:[^`\\]|\\.)*`/g, "``")
    .replace(/"(?:[^"\\\n]|\\.)*"/g, '""')
    .replace(/'(?:[^'\\\n]|\\.)*'/g, "''");
}

const DIR = "scripts/tests";
const suites = readdirSync(DIR).filter((f) => f.endsWith(".mutation.mjs"));

// ---------------------------------------------------------------------
console.log("== 1. every suite that writes source goes through the sidecar ==");
check(`the suites were found (${suites.length})`, suites.length >= 55, String(suites.length));

const writers = [];
const unprotected = [];
for (const f of suites) {
  const src = stripComments(readFileSync(join(DIR, f), "utf8"));
  if (!/\bwriteFileSync\s*\(/.test(src)) continue;
  writers.push(f);
  // The name must come from the helper, not from node:fs. Importing it
  // from both would resolve to whichever line is last, which is a
  // coincidence rather than a decision.
  // ANCHORED TO THE START OF A LINE, and that is not cosmetic. Without
  // the `^`, this file's own mutation suite failed the check: it carries
  // the string `import { readFileSync, writeFileSync } from "node:fs";`
  // inside a mutation's `to:` property, as the defect it re-introduces.
  // Comments are stripped above; STRING LITERALS are not, and a scanner
  // that reads data as code is the same failure one layer along. A real
  // import statement is at column zero.
  const fromHelper = /^import \{[^}]*\bwriteFileSync\b[^}]*\} from "\.\/lib\/sidecar-write\.mjs"/m.test(src);
  const fromFs = /^import \{[^}]*\bwriteFileSync\b[^}]*\} from "node:fs"/m.test(src);
  if (!fromHelper || fromFs) unprotected.push(`${f}${fromFs ? " (still takes it from node:fs)" : " (does not import the helper)"}`);
}
// A FLOOR on the scan, on the variable the emptiness is asserted over.
check(`suites that write source files (${writers.length})`, writers.length >= 55, String(writers.length));
check(
  "every one of them takes writeFileSync from the sidecar helper",
  unprotected.length === 0,
  unprotected.join("\n        ")
);

// ---------------------------------------------------------------------
console.log("\n== 2. the helper does what the suites are trusting it to do ==");
const helper = "scripts/tests/lib/sidecar-write.mjs";
check("the helper exists", existsSync(helper));
const hsrc = stripComments(readFileSync(helper, "utf8"));
// THE ORDER IS THE WHOLE MECHANISM. Recording after the write leaves the
// same gap the `finally` had, only smaller.
check(
  "the original is persisted BEFORE the mutation reaches disk",
  hsrc.indexOf("persist();") < hsrc.indexOf("return fsWriteFileSync("),
);
check("it heals at import time, not on request", /^healFromSidecar\(\);$/m.test(hsrc));
check("...and says so out loud rather than healing silently",
  /console\.log\(\s*\n?\s*`sidecar: healed/.test(hsrc));
check("the sidecar path is anchored to this file, not to process.cwd()",
  /fileURLToPath\(import\.meta\.url\)/.test(hsrc) && !/path\.join\("scripts"/.test(hsrc));
// NOT /isTemp/.test(source). That is a check that the IDENTIFIER exists,
// and `const isTemp = false` satisfies it — which is how both of these
// survived their own mutations. The helper is imported with a sidecar of
// its own and asked.
{
  const SIDE = "scripts/tests/.sidecar-classify.json";
  const { writeFileSync: rawWrite, existsSync: exists, unlinkSync, readFileSync: rawRead } = await import("node:fs");
  const probe = (target, body) => {
    const script = `
      import { writeFileSync } from ${JSON.stringify(process.cwd() + "/scripts/tests/lib/sidecar-write.mjs")};
      process.chdir(${JSON.stringify(process.cwd())});
      writeFileSync(${JSON.stringify(target)}, ${JSON.stringify(body)});
    `;
    const tmp = "scripts/tests/.sidecar-classify.mjs";
    rawWrite(tmp, script);
    execFileSync(process.execPath, [tmp], {
      stdio: "pipe",
      env: { ...process.env, MUTATION_SIDECAR_PATH: SIDE },
    });
    const recorded = exists(SIDE) ? Object.keys(JSON.parse(rawRead(SIDE, "utf8"))) : [];
    unlinkSync(tmp);
    if (exists(SIDE)) unlinkSync(SIDE);
    return recorded;
  };

  const tempTarget = `${process.env.TMPDIR || "/tmp"}/sidecar-probe.txt`;
  rawWrite(tempTarget, "ORIGINAL");
  check("a file outside the repository is never recorded", probe(tempTarget, "CHANGED").length === 0,
    "a heal would point at a path the next run has no reason to have");
  unlinkSync(tempTarget);

  const otherSidecar = "scripts/tests/.some-other-sidecar.json";
  rawWrite(otherSidecar, "{}");
  check("...and neither is another sidecar", probe(otherSidecar, '{"a":1}').length === 0);
  unlinkSync(otherSidecar);

  // AND THE CONTROL, without which both checks above pass over a helper
  // that records nothing at all.
  const real = "scripts/tests/.sidecar-real-source.txt";
  rawWrite(real, "ORIGINAL");
  check("a real source file IS recorded", probe(real, "CHANGED").length === 1);
  unlinkSync(real);
}
// AND THE PROPERTY THAT MAKES "outside the repository" SUFFICIENT.
//
// The helper used to carry a second guard for temp paths. It could not
// fire — every fixture any suite builds goes under os.tmpdir(), which the
// repository test already excludes — so it was a guard with no reachable
// case and a check that could not go red. It is gone, and this is what
// keeps its removal correct: the day a suite builds a fixture INSIDE the
// tree, this goes red rather than the deleted guard quietly mattering.
{
  const offenders = [];
  for (const f of suites) {
    // LITERALS OUT TOO — see stripLiterals. A suite that carries this
    // defect as the string it re-introduces is testing for it, not doing
    // it, and the first version of this check could not tell the two
    // apart.
    const src = stripLiterals(stripComments(readFileSync(join(DIR, f), "utf8")));
    // TO THE END OF THE LINE, not to the first ")". The first version
    // stopped at the parenthesis inside `tmpdir()` itself, so every call
    // captured `path.join(tmpdir(` and no call ever looked like it used
    // tmpdir — four false accusations, in a check written to prove
    // something safe to delete.
    for (const m of src.matchAll(/mkdtempSync\(([^\n]*)/g)) {
      // A LITERAL PATH IS THE TELL. With the contents stripped, a call
      // built from os.tmpdir() still reads `path.join(tmpdir(), "")`,
      // while one given a path in the tree reads `mkdtempSync("")` — no
      // tmpdir() anywhere in it.
      if (!/tmpdir\(\)/.test(m[1])) offenders.push(`${f}: ${m[0].slice(0, 70)}`);
    }
  }
  check("no suite builds a fixture inside the repository", offenders.length === 0, offenders.join("\n        "));
}

check("and the default sidecar path is the anchored one, not the override",
  /process\.env\.MUTATION_SIDECAR_PATH \|\| path\.join\(HERE/.test(hsrc));

// ---------------------------------------------------------------------
console.log("\n== 3. the experiment: kill a process holding a mutant ==");
// NOT A CLAIM ABOUT THE CODE — the code is run, killed with SIGKILL so no
// handler of any kind can fire, and the tree is read afterwards.
{
  const VICTIM = "scripts/tests/.sidecar-victim.txt";
  const script = `
    import { writeFileSync } from "${process.cwd()}/scripts/tests/lib/sidecar-write.mjs";
    process.chdir(${JSON.stringify(process.cwd())});
    writeFileSync(${JSON.stringify(VICTIM)}, "MUTATED");
    process.kill(process.pid, "SIGKILL");
  `;
  const { writeFileSync: rawWrite, unlinkSync, existsSync: exists } = await import("node:fs");
  rawWrite(VICTIM, "ORIGINAL");
  const tmp = "scripts/tests/.sidecar-experiment.mjs";
  rawWrite(tmp, script);
  // ITS OWN SIDECAR, and this is not tidiness. Both processes below
  // import the helper, and the helper heals at import. Pointed at the
  // SHARED sidecar they would restore whatever the mutation harness
  // running this gate had mutated a moment earlier — which is exactly
  // what happened: mutation-sidecar.mutation.mjs reported four survivors
  // because this section was quietly undoing them.
  const SIDE = "scripts/tests/.sidecar-experiment.json";
  const env = { ...process.env, MUTATION_SIDECAR_PATH: SIDE };
  let killed = false;
  try {
    execFileSync(process.execPath, [tmp], { stdio: "pipe", env });
  } catch (e) {
    killed = e.signal === "SIGKILL" || e.status === null;
  }
  check("the experiment process really died un-gracefully", killed);
  check("...leaving the mutant on disk", readFileSync(VICTIM, "utf8") === "MUTATED");
  check("...and a sidecar recording the original", exists(SIDE));

  // The next process to import the helper is the one that repairs it.
  execFileSync(process.execPath, ["--input-type=module", "-e",
    `await import(${JSON.stringify(process.cwd() + "/scripts/tests/lib/sidecar-write.mjs")})`],
    { stdio: "pipe", cwd: process.cwd(), env });
  check("the NEXT process puts it back", readFileSync(VICTIM, "utf8") === "ORIGINAL");
  check("...and clears the sidecar, so its presence always means trouble", !exists(SIDE));

  unlinkSync(VICTIM);
  unlinkSync(tmp);
}

// ---------------------------------------------------------------------
console.log("\n== 4. and it is not in a commit ==");
const ignore = readFileSync(".gitignore", "utf8");
check("the sidecar is gitignored", /\.mutation-sidecar\.json/.test(ignore), "otherwise a killed run dirties the tree twice over");

console.log("");
if (failures.length > 0) {
  console.log(`${pass} passed, ${failures.length} FAILED:`);
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
console.log(`${pass} checks passed. All ${writers.length} suites heal a killed run.`);
