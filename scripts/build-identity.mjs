#!/usr/bin/env node
/*
 * WHICH TREE IS THIS BUILD?
 *
 * On 2026-09-19 a Vercel failure arrived naming
 * `plan-feature-matrix.test.mjs` and a check called "no feature is
 * marked available on a plan that lacks it". That file exists in no
 * commit on any of this repository's 32 branches, and the string
 * appears nowhere in its history. `npm run build` was green on main,
 * which was byte-identical to the branch it merged.
 *
 * Every one of those facts took a search to establish, and the only
 * reason the question was answerable at all is that `npm run test:unit`
 * prints the file it is running. What it does not print is WHICH TREE.
 *
 * So the build says so in one line: the commit, the branch and how many
 * gate files are about to run.
 *
 * SECOND, NOT FIRST, and that was a decision rather than an accident.
 * function-limits.test.mjs asserts `scripts.build` STARTS WITH the
 * maxDuration rewriter, and putting a console.log in front of it turned
 * that gate red. The gate's anchor is positional where its claim is
 * about ordering against the steps that consume the rewriter's output —
 * a pure logger breaks neither — but loosening a gate so a cosmetic
 * line fits is the wrong trade, and the line is as useful second. A pasted failure then carries
 * its own provenance, and "is this from my tree?" stops being an
 * afternoon.
 *
 * READ FROM THE PLATFORM FIRST. Vercel sets VERCEL_GIT_COMMIT_SHA and
 * checks out a detached HEAD, so `git rev-parse --abbrev-ref HEAD` says
 * "HEAD" there and the branch has to come from the platform too. On a
 * machine with neither, this prints "unknown" rather than guessing —
 * a wrong SHA in a build log is worse than none.
 *
 * Run: node scripts/build-identity.mjs
 */
import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";

/** A git value, or null when git cannot answer (no .git, no binary). */
export function gitValue(args) {
  try {
    return execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim() || null;
  } catch {
    return null;
  }
}

export function identity(env = process.env, git = gitValue) {
  const sha = env.VERCEL_GIT_COMMIT_SHA ?? git(["rev-parse", "HEAD"]) ?? null;
  const branchRaw = env.VERCEL_GIT_COMMIT_REF ?? git(["rev-parse", "--abbrev-ref", "HEAD"]) ?? null;
  // Detached HEAD answers "HEAD", which names nothing.
  const branch = branchRaw === "HEAD" ? null : branchRaw;
  return { sha, branch };
}

export function gateCounts(dir = "scripts/tests") {
  const files = readdirSync(dir);
  return {
    gates: files.filter((f) => f.endsWith(".test.mjs")).length,
    mutations: files.filter((f) => f.endsWith(".mutation.mjs")).length,
  };
}

export function line(id = identity(), counts = gateCounts()) {
  const sha = id.sha ? id.sha.slice(0, 12) : "unknown";
  const branch = id.branch ?? "unknown";
  return `build: ${sha} on ${branch} · ${counts.gates} gates, ${counts.mutations} mutation suites`;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log(line());
}
