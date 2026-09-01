// THE CHECKER, RUN IN THE ENVIRONMENTS IT ACTUALLY RUNS IN.
//
// scripts/check-mutation-tree.mjs runs inside `npm run build`, which means
// it runs on Vercel, in GitHub Actions, and on a laptop. It failed every
// Vercel deploy of main with:
//
//     MUTATION LEFT IN THE TREE:
//       - 1 file(s) a mutation suite touches are uncommitted:
//           vercel.json
//       In CI the tree starts clean, so this can only be a leftover.
//
// The message contains its own refutation. A "leftover" is a mutant that a
// killed mutation run left on the machine that ran it. In a fresh clone no
// mutation suite has run at build time, so a leftover cannot exist —
// BECAUSE the tree started clean. The sentence used to justify failing was
// the reason it could not be right.
//
// This gate builds a throwaway repository and runs the real checker in it,
// under each environment, asserting the exit code. It deliberately asserts
// BOTH directions: a checker that simply always exited 0 would pass the
// Vercel cases and fail cases 3 and 4, which is the point — the fix must
// stop the false alarm WITHOUT giving up the two checks that can be true
// in a fresh clone.
//
// Run: node scripts/tests/mutation-tree-environments.test.mjs
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";

let pass = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { failures.push(name); console.log(`  FAIL  ${name}${detail ? "\n        " + detail : ""}`); }
}

const CHECKER = "scripts/check-mutation-tree.mjs";
const TARGET_REL = "fixture/thing.ts";
const GOOD = 'export const x = 1;\nif (guard === 0) run();\nexport const y = 2;\n';
const MUTATED = 'export const x = 1;\nif (guard === -99) run();\nexport const y = 2;\n';

/** A throwaway project the checker can run against. */
function makeProject({ git }) {
  const root = mkdtempSync(join(tmpdir(), "mt-env-"));
  mkdirSync(join(root, "scripts", "tests"), { recursive: true });
  mkdirSync(join(root, "fixture"), { recursive: true });
  copyFileSync(CHECKER, join(root, CHECKER));
  writeFileSync(join(root, TARGET_REL), GOOD);
  // A suite declaring one literal mutation, in the shape the checker parses.
  writeFileSync(
    join(root, "scripts/tests/fake.mutation.mjs"),
    'const TARGET = "fixture/thing.ts";\nexport const mutations = [\n  {\n    name: "the guard stops guarding",\n    file: TARGET,\n    from: "if (guard === 0) run();",\n    to: "if (guard === -99) run();",\n  },\n];\n'
  );
  if (git) {
    const q = { cwd: root, stdio: ["ignore", "ignore", "ignore"] };
    execFileSync("git", ["init", "-q"], q);
    execFileSync("git", ["config", "user.email", "t@t"], q);
    execFileSync("git", ["config", "user.name", "t"], q);
    execFileSync("git", ["add", "-A"], q);
    execFileSync("git", ["commit", "-qm", "base"], q);
  }
  return root;
}

/** The checker's exit code in `root`, under `env`. */
function run(root, env = {}) {
  try {
    execFileSync("node", [CHECKER], {
      cwd: root,
      env: { ...process.env, CI: "", VERCEL: "", GITHUB_ACTIONS: "", ...env },
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return 0;
  } catch (e) {
    return e.status ?? -1;
  }
}

const made = [];
function project(opts) { const r = makeProject(opts); made.push(r); return r; }

// ---------------------------------------------------------------------
console.log("== 1. no .git at all — the checker must not go red ==");
// The case asked for by name. A build directory with no git worktree
// cannot answer "is this uncommitted", and a checker that answers anyway
// is inventing a finding.
{
  const root = project({ git: false });
  check("a clean project with no .git exits 0", run(root) === 0);
  // AND IT SAYS SO IN THOSE WORDS. Without this the `hasGit` guard is
  // untestable: with no .git, `git status` throws and the inner catch
  // already leaves `dirty` empty, so removing the guard changes no exit
  // code — a mutation that survived until this assertion existed. The
  // guard's whole value is that "no git worktree" reads as an expected
  // state rather than "git status could not be read", which reads as a
  // broken tool and is what sends someone debugging the wrong thing.
  const noGitOut = execFileSync("node", [CHECKER], {
    cwd: root,
    env: { ...process.env, CI: "", VERCEL: "", GITHUB_ACTIONS: "" },
    encoding: "utf8",
  });
  check("...and reports the absence of git as an expected state, not an error",
    noGitOut.includes("no git worktree — check 3 skipped"),
    noGitOut.split("\n")[0]);
  check("...and still exits 0 with CI=1", run(root, { CI: "1" }) === 0);
  check("...and still exits 0 on Vercel (CI=1 VERCEL=1)", run(root, { CI: "1", VERCEL: "1" }) === 0);
  check("...and still exits 0 in GitHub Actions", run(root, { CI: "1", GITHUB_ACTIONS: "true" }) === 0);
}

console.log("\n== 2. a fresh clone whose build dirtied a mutation target ==");
// THIS GATE RUNS INSIDE `npm run build`, WHICH RUNS ON VERCEL. A section
// that needs `git init` must not throw where git is absent — that would
// be a second way to break the deploy, written while fixing the first.
// Skipped loudly rather than silently: a section that quietly does
// nothing looks exactly like a section that passed.
let gitAvailable = true;
try {
  execFileSync("git", ["--version"], { stdio: ["ignore", "ignore", "ignore"] });
} catch {
  gitAvailable = false;
}
if (!gitAvailable) console.log("  SKIP  git is not on PATH here — the four git-backed cases cannot run");
// EXACTLY THE VERCEL FAILURE. The target file is committed, then modified
// — which is what git status reported on Vercel — and the checker used to
// fail because CI was set.
if (gitAvailable) {
  const root = project({ git: true });
  writeFileSync(join(root, TARGET_REL), GOOD + "\n// touched by the build\n");
  check("a dirty mutation target does not fail the build on Vercel",
    run(root, { CI: "1", VERCEL: "1" }) === 0,
    "this is the exact failure that blocked every deploy");
  check("...nor in GitHub Actions", run(root, { CI: "1", GITHUB_ACTIONS: "true" }) === 0);
  check("...nor on a developer machine", run(root) === 0);
}

console.log("\n== 3. AND THE CHECKS THAT CAN BE TRUE IN A FRESH CLONE STILL FAIL ==");
// Without these, the fix above would be indistinguishable from deleting
// the checker. Both read the FILESYSTEM, not git, so both work anywhere.
{
  const root = project({ git: false });
  writeFileSync(join(root, TARGET_REL), MUTATED);
  check("an APPLIED declared mutation fails, with no .git", run(root) === 1);
  check("...and fails on Vercel too", run(root, { CI: "1", VERCEL: "1" }) === 1,
    "a mutant reaching production is what this checker is for");
}
{
  const root = project({ git: false });
  writeFileSync(join(root, "scripts/tests/.mutation-sidecar.json"), '{"fixture/thing.ts":"original"}');
  check("a leftover sidecar fails, with no .git", run(root) === 1);
  check("...and fails on Vercel too", run(root, { CI: "1", VERCEL: "1" }) === 1);
}

console.log("\n== 4. the fixture is a real one ==");
// If the throwaway project were malformed the checker might exit 0 for
// reasons that have nothing to do with the rule under test, and every
// assertion above would be green on nothing.
{
  const root = project({ git: false });
  check("the checker actually ran and parsed the fake suite",
    execFileSync("node", [CHECKER], { cwd: root, encoding: "utf8" }).includes("1 literal mutation(s) declared"),
    "the fixture's suite was not parsed, so checks 1-3 proved nothing");
  check("the target file exists in the fixture", existsSync(join(root, TARGET_REL)));
}

for (const r of made) rmSync(r, { recursive: true, force: true });
console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${failures.length} failed`);
process.exit(failures.length === 0 ? 0 : 1);
