// THE CHECK THAT SEES WHAT THE MARKER CHECK CANNOT.
//
// check-mutation-markers.mjs looks for the SHAPES a defanged guard takes.
// It was measured at zero false positives before it shipped, which is why
// nobody bypasses it — and it is blind to a mutation that leaves no shape.
//
// Measured, not assumed. The exact mutant a killed run left in the tree
// during the session that wrote this:
//
//     -    if (stripped.length === ch.length) folded = stripped;
//     +    folded = stripped;
//
// produces `mutation-markers: clean (1274 files)` and exit 0. That guard
// is load-bearing for Korean, Thai, Hebrew, Devanagari and Arabic, and
// the deleted line looks exactly like a deliberate simplification.
//
// So this gate is about the OTHER check — check-mutation-tree.mjs — and
// every assertion below RUNS it against a tree it has been given, rather
// than reading its source.
//
// Run: node scripts/tests/mutation-tree.test.mjs
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync, unlinkSync } from "node:fs";
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

const CHECK = "scripts/check-mutation-tree.mjs";
const MARKERS = "scripts/check-mutation-markers.mjs";

/**
 * DOES THIS TREE HAVE A GIT WORKTREE, and the whole reason it is asked.
 *
 * Vercel hands the builder a source tarball and sets
 * VERCEL_GIT_COMMIT_SHA rather than shipping .git. check-mutation-tree's
 * third check asks "which files are uncommitted", which is a question
 * with no answer there — so the checker skips it, says so, and exits 0,
 * deliberately, in its own paragraph.
 *
 * FOUR CLAUSES IN THIS FILE DEMANDED THE WARNING ANYWAY, and on
 * 2026-09-26 that was measured as the thing failing the deploy: `npm run
 * build` in a fresh clone of the rejected commit with .git removed
 * exited 1 HERE, at gate 167 of 292, 125 gates never run. Reproduced on
 * demand, twice.
 *
 * It is the second gate of this shape found in one day — scripts/db-inventory.mjs
 * stamped its output from git alone and its gate read the stamp, fixed
 * in the morning, which is what moved the failure from gate 70 to this
 * one. Neither could see it, because both ran where .git happens to be.
 *
 * So each claim is made in the environment it is about, and which
 * environment that was is printed rather than inferred. The branch this
 * run does not take is held by
 * scripts/tests/mutation-tree-environments.test.mjs, which builds a
 * throwaway root with and without .git and asserts both in every
 * environment — so neither branch here is a way out of the other.
 */
const HAS_WORKTREE = (() => {
  try {
    return (
      execFileSync("git", ["rev-parse", "--is-inside-work-tree"], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }).trim() === "true"
    );
  } catch {
    return false;
  }
})();

function run(script, env = {}) {
  try {
    const out = execFileSync("node", [script], {
      encoding: "utf8",
      stdio: "pipe",
      env: { ...process.env, ...env },
    });
    return { code: 0, out };
  } catch (e) {
    return { code: e.status ?? 1, out: String(e.stdout ?? "") + String(e.stderr ?? "") };
  }
}

// ---------------------------------------------------------------------
console.log("== 1. the premise: the marker check really is blind to this ==");
// IF THIS EVER GOES RED, the marker check grew a way to see a deleted
// line and half the reason for check-mutation-tree.mjs is gone. That
// would be good news, and it should be noticed rather than assumed away.
{
  const GUARD_FILE = "src/lib/text/unicode-patterns.ts";
  const GUARD = "    if (stripped.length === ch.length) folded = stripped;";
  const before = readFileSync(GUARD_FILE, "utf8");
  check("the guard the incident deleted is still there", before.includes(GUARD));
  writeFileSync(GUARD_FILE, before.replace(GUARD, "    folded = stripped;"));
  const markers = run(MARKERS);
  const tree = run(CHECK, { CI: "1" });
  const local = run(CHECK, { CI: "" });
  writeFileSync(GUARD_FILE, before);
  check("check-mutation-markers reports CLEAN with the mutant in the tree", markers.code === 0,
    `exit ${markers.code}`);
  // WHERE THIS IS ACTUALLY CAUGHT, stated honestly.
  //
  // This used to assert `tree.code === 1` with CI=1, and that assertion
  // was describing a capability that never existed. Work it through:
  //
  //   - The deletion is NOT a declared mutation — nothing in any
  //     *.mutation.mjs has it as a from/to pair (unguarded-guards.mjs
  //     mutates by scanning, not by declaring), so check 2 is blind to it.
  //   - Once COMMITTED, git status is clean, so check 3 is blind to it too.
  //   - So the only way check 3 ever fired on this was an UNCOMMITTED
  //     change — which is a developer's machine. In a fresh-clone CI an
  //     uncommitted change can only have been made by the build itself.
  //
  // Which is exactly what happened: this check failing on CI=1 is the
  // behaviour that broke every Vercel deploy of main, on `vercel.json`.
  // The test was holding the checker to a rule whose only reachable
  // outcome in CI was a false positive.
  //
  // So it is asserted where it is true — on a developer's machine, as a
  // warning that names the file.
  // …and only where the question has an answer. See HAS_WORKTREE above.
  if (HAS_WORKTREE) {
    check("check-mutation-tree WARNS about it on a developer machine",
      /WARNING \(advisory, not failing\)/.test(local.out), local.out.slice(0, 240));
    check("...naming the file", /unicode-patterns\.ts/.test(local.out), local.out.slice(0, 240));
  } else {
    check("with no worktree, the deleted guard is reported as UNANSWERABLE, not as absent",
      /no git worktree — check 3 skipped/.test(local.out), local.out.slice(0, 240));
    check("...and the build is not failed over a question nothing could answer",
      local.code === 0, `exit ${local.code}`);
  }
  check("...and does not fail a fresh-clone build over it", tree.code === 0, `exit ${tree.code}`);
  check("the tree is back", readFileSync(GUARD_FILE, "utf8") === before);
  // AND THE GAP IS NAMED RATHER THAN LEFT IMPLIED: a deleted guard that
  // gets COMMITTED is caught by none of the three checks. Closing it needs
  // unguarded-guards.mjs to run in CI, which it currently does not.
}

// ---------------------------------------------------------------------
console.log("\n== 2. a killed run's sidecar ==");
{
  // INHERITS the flag deliberately. This asks whether the REAL tree is
  // clean, and during an unguarded-guards.mjs run it deliberately is not
  // — one guard is removed and a sidecar holds the original. Clearing the
  // flag here made that experiment's every verdict depend on whether this
  // check happened to run before the guard was restored.
  const clean = run(CHECK);
  check("a clean tree passes", clean.code === 0, clean.out);

  const DIR = "scripts/tests/.guard-sidecar";
  const existed = existsSync(DIR);
  if (!existed) mkdirSync(DIR, { recursive: true });
  const probe = `${DIR}/.mutation-tree-probe.json`;
  writeFileSync(probe, JSON.stringify({ file: "x", text: "y" }));
  // EXPLICITLY NOT A RUN IN PROGRESS. check-mutation-tree.mjs skips the
  // sidecar complaint while UNGUARDED_GUARDS_RUNNING=1, because
  // unguarded-guards.mjs legitimately holds a sidecar for the seconds its
  // child suite is running — and this file is IN that suite, so without
  // the exemption every guard that experiment tested reddened here for a
  // reason that had nothing to do with the guard. This check is about the
  // KILLED-run case, so it clears the flag rather than inheriting it.
  const guard = run(CHECK, { UNGUARDED_GUARDS_RUNNING: "" });
  unlinkSync(probe);
  if (!existed) rmSync(DIR, { recursive: true, force: true });
  check("the guard scanner's sidecar fails it", guard.code === 1, `exit ${guard.code}`);
  check("...and says how to heal it", /restores from the sidecar on startup/.test(guard.out));

  const SHARED = "scripts/tests/.mutation-sidecar.json";
  check("no shared sidecar is lying around right now", !existsSync(SHARED));
  writeFileSync(SHARED, JSON.stringify({ "src/lib/nav/nav-path.ts": "whatever" }));
  const shared = run(CHECK);
  unlinkSync(SHARED);
  check("the shared sidecar fails it too", shared.code === 1, `exit ${shared.code}`);
  check("...naming the file it holds", /nav-path\.ts/.test(shared.out));
}

// ---------------------------------------------------------------------
console.log("\n== 3. a declared mutation, actually applied ==");
{
  const F = "src/lib/nav/nav-path.ts";
  const before = readFileSync(F, "utf8");
  const FROM = "  if (!known) return NAV_UNKNOWN_PATH;";
  const TO = "  if (!known) return `/dashboard/${first}`;";
  check("the anchor is real", before.includes(FROM));
  writeFileSync(F, before.replace(FROM, TO));
  const r = run(CHECK);
  writeFileSync(F, before);
  check("it is found", r.code === 1, `exit ${r.code}`);
  check("...and the suite that declares it is named", /nav-events\.mutation\.mjs/.test(r.out), r.out.slice(0, 300));
}

// ---------------------------------------------------------------------
console.log("\n== 4. dirty is ADVISORY, everywhere ==");
// THIS BLOCK USED TO ASSERT THE BUG.
//
// It read: `check("in CI a dirty mutation target fails", ci.code === 1)`.
// That is exactly what broke every Vercel deploy of main — the build
// failed with "1 file(s) a mutation suite touches are uncommitted:
// vercel.json" on a fresh clone, and this gate was here making sure it
// kept doing it.
//
// The reasoning it encoded — "it fails where the tree starts clean" — is
// self-defeating. A leftover is a mutant a killed run left on the machine
// that ran it. In a fresh clone no mutation suite has run at build time,
// so a leftover cannot exist BECAUSE the tree started clean. The premise
// that made it fire is the premise that made it impossible to be right.
//
// The genuine case — a suite dying mid-run — is covered by the workflow
// step "the mutation suites put the tree back", which runs git status
// AFTER npm run test:mutation, which is the only moment it can be true.
//
// Environment coverage lives in mutation-tree-environments.test.mjs,
// which runs the real checker in a throwaway repo with and without .git.
{
  const F = "src/lib/nav/nav-path.ts";
  const before = readFileSync(F, "utf8");
  // A change that is NOT any declared mutation, so only check 3 can see it.
  writeFileSync(F, before + "\n// a developer was here\n");
  const ci = run(CHECK, { CI: "1" });
  const vercel = run(CHECK, { CI: "1", VERCEL: "1" });
  const local = run(CHECK, { CI: "" });
  writeFileSync(F, before);
  check("a dirty mutation target does not fail in CI", ci.code === 0, `exit ${ci.code}`);
  check("...nor on Vercel, which is the deploy this broke", vercel.code === 0, `exit ${vercel.code}`);
  check("...nor on a developer machine", local.code === 0, `exit ${local.code}`);
  // ADVISORY IS NOT SILENT. If it stopped saying anything, a real leftover
  // on a laptop would pass unnoticed, which is the one place check 3 has
  // value.
  //
  // AND THE QUESTION ONLY HAS AN ANSWER WHERE THERE IS A WORKTREE, which
  // is what made this gate the thing that broke the deploy (2026-09-26).
  //
  // Vercel hands the builder a source tarball and sets
  // VERCEL_GIT_COMMIT_SHA instead of shipping .git. The checker is right
  // about that — it prints "no git worktree — check 3 skipped" and exits
  // 0, deliberately, see its own paragraph. These two clauses demanded
  // the warning anyway, so in a tree with no .git they could not pass:
  // `npm run build` exited 1 here, at gate 167 of 292, with 125 gates
  // never run. Reproduced on demand in a fresh clone of the commit
  // Vercel rejected, which is the first time any condition has done that
  // twice in a row.
  //
  // THE SECOND GATE OF THIS EXACT SHAPE IN ONE DAY. scripts/db-inventory.mjs
  // stamped its output from git alone and its gate read the stamp; that
  // was fixed in the morning, which moved the failure from gate 70 to
  // this one. A build that cannot run without a working tree is a build
  // that cannot run where it ships, and neither gate could see it
  // because both ran where .git happens to exist.
  //
  // So the claim is made in the environment it is about. Where there IS
  // a worktree the warning is demanded exactly as before; where there is
  // not, the ABSENCE is demanded to be stated and survivable. Neither
  // branch is a way out of the other: which one ran is printed, and
  // scripts/tests/mutation-tree-environments.test.mjs asserts the no-git
  // branch in EVERY environment by building its own throwaway root, so
  // the branch this file does not take today is still held.
  console.log(`        (this tree ${HAS_WORKTREE ? "HAS" : "has NO"} git worktree)`);
  if (HAS_WORKTREE) {
    check("...but it still says so, loudly", /WARNING \(advisory, not failing\)/.test(local.out), local.out.slice(0, 240));
    check("...and names the file", /nav-path\.ts/.test(local.out), local.out.slice(0, 240));
  } else {
    check("...and with no worktree it says THAT, rather than going quiet",
      /no git worktree — check 3 skipped/.test(local.out), local.out.slice(0, 240));
    check("...and does not invent a finding it cannot have",
      !/WARNING \(advisory, not failing\)/.test(local.out) && local.code === 0,
      local.out.slice(0, 240));
  }
  check("the tree is back", readFileSync(F, "utf8") === before);
}

// ---------------------------------------------------------------------
console.log("\n== 5. it is wired in, and it looked at something ==");
{
  const pkg = JSON.parse(readFileSync("package.json", "utf8")).scripts;
  // MOVED OUT OF `build` ON 2026-09-27. The property that matters is
  // unchanged — a mutant must not reach a bundle — but it is now two
  // facts instead of one: the check is in `gates`, and the workflow
  // runs `gates` before `build`. Asserting only the first would let the
  // workflow reorder them.
  check("the gates script runs it", pkg.gates.includes("node scripts/check-mutation-tree.mjs"));
  check("...and the build itself no longer does", !pkg.build.includes("check-mutation-tree"));
  const wf = readFileSync(".github/workflows/verify.yml", "utf8");
  check("...and CI runs the gates before it builds, so a mutant never reaches a bundle",
    wf.indexOf("run: npm run gates") > 0 && wf.indexOf("run: npm run gates") < wf.indexOf("run: npm run build"));
  const clean = run(CHECK);
  // FLOORS. "No mutation is applied" is trivially true of a check that
  // parsed no mutations and found no targets.
  const declared = Number(clean.out.match(/(\d+) literal mutation/)?.[1] ?? 0);
  const targeted = Number(clean.out.match(/(\d+) file\(s\) are mutated/)?.[1] ?? 0);
  check(`it parsed the suites' mutations (${declared})`, declared >= 800, String(declared));
  check(`it resolved their target files (${targeted})`, targeted >= 100, String(targeted));
}

console.log("");
if (failures.length > 0) {
  console.log(`${pass} passed, ${failures.length} FAILED:`);
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
console.log(`${pass} checks passed. A deleted line does not reach a bundle.`);
