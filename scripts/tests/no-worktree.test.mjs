#!/usr/bin/env node
/*
 * CAN THE BUILD RUN WHERE IT SHIPS — IN A TREE WITH NO .git?
 *
 * Run: node scripts/tests/no-worktree.test.mjs
 *
 * THE INCIDENT THIS IS THE GENERAL CASE OF. Vercel hands the builder a
 * source tarball and sets VERCEL_GIT_COMMIT_SHA rather than shipping
 * .git. On 2026-09-26, two separate gates were found demanding answers
 * that only a working tree can give:
 *
 *   scripts/db-inventory.mjs stamped "branch (no git) @ commit (no git)"
 *   and its gate's pattern wanted one token per field, so the stamp could
 *   not match. Fixed in the morning; the build then died at gate 70.
 *
 *   scripts/tests/mutation-tree.test.mjs made the tree dirty and required
 *   check-mutation-tree to WARN, naming the file. Without .git the
 *   question "which files are uncommitted" has no answer, the checker
 *   says so and exits 0 — correctly — and four clauses failed anyway.
 *   `npm run build` exited 1 at gate 167 of 292, 125 gates never run.
 *
 * FIFTEEN CONSECUTIVE RED DEPLOYS and neither was visible, because every
 * run of both gates had happened inside a repository. build:ci runs the
 * real build twice in two environments and both of them are inside one
 * too: the environment axis it varies is the variables, not the tree.
 *
 * WHAT THIS HOLDS. Every program the build runs that asks git anything,
 * and every gate that runs one of them, must survive git being
 * unavailable. Not "should" — the build is the thing that has to run on
 * a machine without .git, so the claim is made by RUNNING them there.
 *
 * HOW GIT IS MADE UNAVAILABLE. A PATH shim whose `git` exits 128 with
 * git's own out-of-repository message. That is what the programs see in
 * a tarball, it needs no copy of the tree, and section 0 proves the shim
 * works before anything is concluded from it — a shim that silently did
 * nothing would make every check below pass for the wrong reason.
 *
 * THE POPULATION IS DERIVED, NOT TYPED. CLAUDE.md's rule: if the rule
 * says "every X", the check must range over the same set. The set is
 * every file under scripts/ whose source invokes git, found by scanning,
 * plus every gate that names one of them.
 *
 * THE EXPENSIVE HALF, for when this is not enough:
 *
 *   git clone --no-hardlinks . /tmp/clean && cd /tmp/clean
 *   rm -rf .git && npm ci
 *   env -i PATH="$PATH" HOME="$HOME" TZ=UTC CI=1 VERCEL=1 \
 *     VERCEL_ENV=production NODE_ENV=production npm run build
 *
 * That is the full reproduction. It was RED on 9d84b80c and GREEN on the
 * commit that added this file, and the difference was one gate.
 */
import { readFileSync, readdirSync, writeFileSync, mkdtempSync, chmodSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

let pass = 0;
const failures = [];
const check = (name, cond, detail) => {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { failures.push(name); console.log(`  FAIL  ${name}${detail !== undefined ? "\n        " + detail : ""}`); }
};

// A `git` that behaves the way git behaves outside a repository.
const shimDir = mkdtempSync(join(tmpdir(), "no-git-"));
const shim = join(shimDir, "git");
writeFileSync(
  shim,
  "#!/bin/sh\necho 'fatal: not a git repository (or any of the parent directories): .git' >&2\nexit 128\n"
);
chmodSync(shim, 0o755);
const NOGIT = { ...process.env, PATH: `${shimDir}:${process.env.PATH}` };

function run(file, env) {
  try {
    execFileSync("node", [file], { encoding: "utf8", stdio: "pipe", env, timeout: 300_000 });
    return { code: 0, out: "" };
  } catch (e) {
    return { code: e.status ?? 1, out: String(e.stdout ?? "") + String(e.stderr ?? "") };
  }
}

console.log("== 0. the shim really does hide git ==");
{
  let real = false;
  try {
    real = execFileSync("git", ["rev-parse", "--is-inside-work-tree"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim() === "true";
  } catch { real = false; }
  check("this tree really is a worktree, so the shim has something to hide", real,
    "run from inside the repository — with no worktree either way, nothing below is a comparison");
  let shimmed = "";
  try {
    execFileSync("git", ["rev-parse", "--is-inside-work-tree"], { encoding: "utf8", stdio: "pipe", env: NOGIT });
    shimmed = "(git answered)";
  } catch (e) {
    shimmed = String(e.stderr ?? "");
  }
  check("...and under the shim it does not", /not a git repository/.test(shimmed), shimmed.slice(0, 160));
}

console.log("\n== 1. the population, derived from the source ==");
const INVOKES_GIT = /execFileSync\(\s*"git"|execSync\(\s*["'`]git |spawnSync\(\s*"git"|\[\s*"git"\s*,/;
function walk(dir) {
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name.startsWith(".")) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else if (/\.(mjs|js|cjs)$/.test(e.name)) out.push(p);
  }
  return out;
}
const SELF = "scripts/tests/no-worktree.test.mjs";
const all = walk("scripts");
const gitUsers = all.filter((f) => INVOKES_GIT.test(readFileSync(f, "utf8"))).map((f) => f.replace(/\\/g, "/"));
console.log(`        asks git: ${gitUsers.map((f) => f.replace("scripts/", "")).join(", ")}`);
check(`the scan found programs that ask git (${gitUsers.length} of ${all.length} files)`,
  gitUsers.length >= 3 && gitUsers.length < all.length,
  "either the pattern stopped matching, or it now matches everything");

// WHICH OF THEM THE BUILD RUNS DIRECTLY, read out of package.json rather
// than listed here: a step added to the build joins this set by itself.
const buildScript = JSON.parse(readFileSync("package.json", "utf8")).scripts.build;
const buildSteps = gitUsers.filter((f) => buildScript.includes(f));
check(`the build runs ${buildSteps.length} of them directly (${buildSteps.map((f) => f.replace("scripts/", "")).join(", ")})`,
  buildSteps.length >= 1, buildScript);

// AND THE GATES THAT REACH ONE — SPAWN OR READ, NOT IMPORT.
//
// The first version of this link was "the gate's source mentions the
// filename", and it selected 85 of 292 gates. Sixty-odd of those are
// `import { stripComments } from "../check-mutation-markers.mjs"`, and
// that module's git code is behind `import.meta.url === file://argv[1]`
// (line 288): importing it runs no git at all. A population three times
// too big is not a safe over-approximation here, it is four minutes
// added to every build for a link that does not exist.
//
// So import and export lines are excluded, and what remains is a
// filename in a string on a line that does something with it. Ten gates,
// named in the output, and the count is floored BOTH ways below so
// neither a rule that selects nothing nor one that selects everything
// can pass as this one.
const gates = readdirSync("scripts/tests").filter((f) => f.endsWith(".test.mjs")).map((f) => `scripts/tests/${f}`);
const onBuildPath = gitUsers.filter((f) => buildScript.includes(f) || /db-inventory\.mjs$/.test(f));
const touching = gates.filter((g) => {
  // ITSELF, EXCLUDED, AND THE REASON IS NOT TIDINESS. This file invokes
  // git in section 0, so the scan finds it — and running it under the
  // shim makes it run itself under the shim, which makes it run itself.
  // Caught by watching it: the first run never returned and the box
  // filled with node processes.
  if (g === SELF) return false;
  const src = readFileSync(g, "utf8");
  if (INVOKES_GIT.test(src)) return true;
  const lines = src.split("\n").filter((l) => !/^\s*(import|export)\s/.test(l));
  return onBuildPath.some((u) => {
    const base = u.split("/").pop().replace(".", "\\.");
    return lines.some((l) => new RegExp(`["'\`][^"'\`]*${base}["'\`]`).test(l));
  });
});
check(`and ${touching.length} gates spawn or read one of them (of ${gates.length})`,
  touching.length >= 3 && touching.length <= gates.length / 4,
  `${touching.map((g) => g.replace("scripts/tests/", "")).join(", ")}\n        ` +
    "under 3 means the link stopped matching; over a quarter of the suite means it matches imports again");
console.log(`        ${touching.map((g) => g.replace("scripts/tests/", "")).join(", ")}`);

console.log("\n== 2. every one of them survives having no worktree ==");
// EXEMPTIONS CARRY A REASON AND ARE CHECKED BOTH WAYS, below: an
// exemption whose program has started passing is one to delete, and a
// deleted allowlist entry is how this becomes a place to put things.
// EMPTY, AND IT WAS NOT WHEN IT WAS WRITTEN.
//
// The one entry was mutation-tree-environments.test.mjs, exempted on the
// argument that hiding git removes the instrument's own subject — it
// builds a throwaway repository with `git init` and asserts the
// checker's behaviour with and without .git inside it. Reasonable, and
// wrong: run under the shim it passes all eleven of its checks, because
// the branch it spends most of them on is the no-git one. The both-ways
// check below said so on the first run, which is what that check is for
// and why a speculative exemption is worse than none.
//
// An entry here costs a reason over sixty characters, must still be in
// the population, and must still FAIL without git. Section 3 states the
// emptiness rather than looping over nothing, so "no exemptions" is a
// claim somebody can read instead of a section that prints no lines.
const MAY_FAIL_WITHOUT_GIT = {};
const targets = [...new Set([...buildSteps, ...touching])].sort();
const broke = [];
for (const f of targets) {
  const exempt = MAY_FAIL_WITHOUT_GIT[f];
  const r = run(f, NOGIT);
  const label = f.replace("scripts/", "").replace("tests/", "");
  if (exempt) {
    console.log(`        SKIP  ${label} — ${exempt.reason.slice(0, 60)}...`);
    continue;
  }
  if (r.code !== 0) broke.push(`${f} — exit ${r.code}\n          ${r.out.split("\n").filter(Boolean).slice(-3).join("\n          ")}`);
}
check(`${targets.length - Object.keys(MAY_FAIL_WITHOUT_GIT).length} programs run with git hidden, all exit 0`,
  broke.length === 0, broke.join("\n        "));

console.log("\n== 3. the exemptions have not gone stale ==");
const exemptions = Object.keys(MAY_FAIL_WITHOUT_GIT);
check(`there are ${exemptions.length} exemptions`, exemptions.length <= 1,
  `${exemptions.join(", ")} — more than one program the build runs that cannot run where it ships is not an allowlist, it is the finding`);
if (exemptions.length === 0) {
  console.log("        (none — every program in the population runs with git hidden)");
}
for (const [file, entry] of Object.entries(MAY_FAIL_WITHOUT_GIT)) {
  const label = file.replace("scripts/tests/", "");
  check(`${label}: the exemption says why`,
    typeof entry.reason === "string" && entry.reason.length > 60);
  check(`${label}: ...and is still in the population`, targets.includes(file),
    "an exemption for a program this gate no longer runs is a line nobody reads");
  const r = run(file, NOGIT);
  check(`${label}: ...and still needs it (exit ${r.code} with git hidden)`, r.code !== 0,
    "it passes without git now — delete the exemption rather than keep a claim that is no longer true");
}

rmSync(shimDir, { recursive: true, force: true });
console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${failures.length} failed`);
process.exit(failures.length === 0 ? 0 : 1);
