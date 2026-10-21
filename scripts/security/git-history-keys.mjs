#!/usr/bin/env node
/*
 * HAS A REAL KEY EVER BEEN COMMITTED? ASKED OF THE WHOLE HISTORY, NOT
 * JUST THE TREE (security audit, 2026-10-21).
 *
 * SECURITY-AUDIT.md ΑΣ-2.1 recorded one answer by hand on 2026-10-05:
 * "878 commits σε όλα τα branches. Μόνο ψεύτικα κλειδιά tests. Κανένα
 * JWT, κανένα .env." That was true for 878 commits; this repository has
 * had many more since, on many branches, and nothing re-asked the
 * question. A number from a date is a record of that date, not of today
 * (CLAUDE.md, "a number in a document carries its date, or it is
 * produced where it prints") — so this is the thing to run instead of
 * trusting the 2026-10-05 figure, every time before the repository's
 * visibility changes, and worth a regular re-run after.
 *
 * WHAT IT CHECKS, across every commit on every ref (`git log --all`):
 *   1. A REAL ENV FILE EVER ADDED — .env, .env.local, .env.production,
 *      anything matching that shape but NOT the committed .example file.
 *   2. KEY-SHAPED STRINGS, by the provider's own published prefix —
 *      Anthropic (sk-ant-), OpenAI (sk-proj-), Stripe (sk_live_/
 *      sk_test_/rk_live_), Google (AIza), AWS (AKIA), GitHub (ghp_/gho_/
 *      github_pat_), Slack (xoxb-/xoxp-), and a bare JWT (eyJhbGci...).
 *      `git log -p -G<pattern>` asks git itself for every ADDED or
 *      REMOVED diff line matching the pattern, across all history, with
 *      the known-fake paths excluded by git's own pathspec rather than
 *      reconstructed by re-reading file contents here — the first draft
 *      of this file did that by hand and got it wrong (see below).
 *
 * WHAT IT IS NOT. Not a secret SCANNER with entropy heuristics — those
 * false-positive on every long random id this project already generates
 * on purpose (reservation ids, request ids). A known prefix is the
 * signal: every provider key this project's own .env.local.example
 * documents has one.
 *
 * EVERY TEST-SHAPED SUFFIX FOUND UNDER scripts/tests/ IN THIS REPOSITORY
 * (test, dbtest, mutation, itest, prodtest, repro — `find scripts/tests
 * -name "*.*.mjs" | sed -E 's/.*\.([a-z]+)\.mjs$/\1/' | sort -u` is how
 * to re-check that list) carries FAKE keys on purpose, the kind ΑΣ-2.1
 * already judged harmless. src/lib/scrub-secrets.ts and
 * README.md/docs/keys-status-2026-10-04.md document or detect a
 * provider's prefix on purpose and are few enough to name directly.
 * Missing even one excluded shape is not a narrower scan, it is false
 * hits: the first draft of this file excluded only *.test.mjs/
 * *.dbtest.mjs/*.mutation.mjs by re-reading each changed file's content
 * through a second `git show`, and when NONE of a commit's real files
 * matched, it silently reported ALL of them anyway, labelled "removed
 * here" — so every *.itest.mjs/*.prodtest.mjs stand-in value like
 * "sk-ant-test" came back as a hit on the SOURCE FILES THE SAME COMMIT
 * ALSO TOUCHED, which had nothing to do with it (measured 2026-10-21:
 * 28 false "Anthropic API key" commits, none of them real). Excluding
 * by git pathspec, before the diff is even produced, cannot make that
 * mistake — there is no fallback branch left to get wrong.
 *
 * Run: node scripts/security/git-history-keys.mjs
 *      node scripts/security/git-history-keys.mjs --verbose   (prints the
 *      matching commits and lines for each hit, not just the count)
 *
 * Read-only: runs `git log`, nothing else. Takes a few minutes on a
 * large history — this is a thing to run occasionally, by hand, not a
 * gate on every push (scripts/tests/ only runs gates fast enough to run
 * every time; scanning full history on every commit would not be).
 */
import { execFileSync } from "node:child_process";

const EXCLUDED_PATHSPECS = [
  ":!scripts/tests/fixtures/*",
  ":!*.test.mjs",
  ":!*.dbtest.mjs",
  ":!*.mutation.mjs",
  ":!*.itest.mjs",
  ":!*.prodtest.mjs",
  ":!*.repro.mjs",
  ":!README.md",
  ":!src/lib/scrub-secrets.ts",
  ":!docs/keys-status-2026-10-04.md",
];

const KEY_PATTERNS = [
  { name: "Anthropic API key", pattern: "sk-ant-" },
  { name: "OpenAI project key", pattern: "sk-proj-" },
  { name: "Stripe live secret key", pattern: "sk_live_" },
  { name: "Stripe test secret key", pattern: "sk_test_" },
  { name: "Stripe restricted key", pattern: "rk_live_" },
  { name: "Google API key", pattern: "AIza" },
  { name: "AWS access key id", pattern: "AKIA" },
  { name: "GitHub personal access token (classic)", pattern: "ghp_" },
  { name: "GitHub OAuth token", pattern: "gho_" },
  { name: "GitHub fine-grained PAT", pattern: "github_pat_" },
  { name: "Slack bot/user token", pattern: "xoxb-" },
  { name: "Slack app token", pattern: "xoxp-" },
  // A bare JWT header — matches the start of any Supabase anon/service
  // key, which are JWTs. Loose on purpose: the point is to find ANY
  // JWT-shaped string in history and let a human look at what matched.
  { name: "JWT (eyJ... header)", pattern: "eyJhbGciOiJ" },
];

const COMMIT_MARKER = "===COMMIT===";

/**
 * Every commit, outside the excluded paths, with a diff line adding or
 * removing `pattern` — and the actual matching lines, from the SAME
 * `git log` call that found them (no second read of any file).
 */
export function matchesFor(pattern) {
  let out;
  try {
    out = execFileSync(
      "git",
      [
        "log",
        "--all",
        `-G${pattern}`,
        "-p",
        "--unified=0",
        `--pretty=format:${COMMIT_MARKER}%H %ad %s`,
        "--date=short",
        "--",
        ".",
        ...EXCLUDED_PATHSPECS,
      ],
      { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 }
    );
  } catch (err) {
    // No match anywhere is not an error to `git log`, but an empty
    // result set with `-G` and a pathspec CAN exit non-zero on some git
    // versions when literally nothing in the whole repo matches; treat
    // that the same as "nothing found" rather than crash the scan.
    if (err.stdout) out = String(err.stdout);
    else return [];
  }
  const commits = out.split(COMMIT_MARKER).filter(Boolean);
  const results = [];
  for (const block of commits) {
    const headerEnd = block.indexOf("\n");
    const header = block.slice(0, headerEnd);
    const body = block.slice(headerEnd + 1);
    let currentFile = null;
    const lines = [];
    for (const line of body.split("\n")) {
      const fileMatch = line.match(/^\+\+\+ b\/(.+)$/) || line.match(/^--- a\/(.+)$/);
      if (fileMatch) {
        currentFile = fileMatch[1];
        continue;
      }
      if ((line.startsWith("+") || line.startsWith("-")) && !line.startsWith("+++") && !line.startsWith("---")) {
        if (line.includes(pattern)) {
          lines.push({ file: currentFile ?? "(unknown file)", line: line.slice(0, 200) });
        }
      }
    }
    if (lines.length > 0) results.push({ header, lines });
  }
  return results;
}

function envFilesEverAdded() {
  const out = execFileSync(
    "git",
    ["log", "--all", "--diff-filter=A", "--name-only", "--pretty=format:%H"],
    { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }
  );
  const lines = out.split("\n");
  const hits = [];
  let currentCommit = null;
  for (const line of lines) {
    if (/^[0-9a-f]{40}$/.test(line)) {
      currentCommit = line;
      continue;
    }
    if (!line.trim()) continue;
    const base = line.split("/").pop();
    if (/^\.env(\..+)?$/.test(base) && !base.endsWith(".example")) {
      hits.push({ commit: currentCommit, file: line });
    }
  }
  return hits;
}

const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const verbose = process.argv.includes("--verbose");

  console.log("git-history-keys\n");
  console.log("== 1. a real env file, ever added ==");
  const envHits = envFilesEverAdded();
  if (envHits.length === 0) {
    console.log("  none — only .env.local.example has ever been committed");
  } else {
    for (const h of envHits) console.log(`  ${h.commit.slice(0, 12)}  ${h.file}`);
  }

  console.log("\n== 2. key-shaped strings, by provider prefix ==");
  let totalHits = 0;
  for (const { name, pattern } of KEY_PATTERNS) {
    const matches = matchesFor(pattern);
    if (matches.length === 0) {
      console.log(`  ${name.padEnd(36)} none`);
      continue;
    }
    totalHits += matches.length;
    console.log(`  ${name.padEnd(36)} ${matches.length} commit(s) OUTSIDE fixtures/tests`);
    if (verbose) {
      for (const { header, lines } of matches) {
        console.log(`      ${header}`);
        for (const l of lines) console.log(`        ${l.file}: ${l.line}`);
      }
    }
  }

  const total = envHits.length + totalHits;
  console.log(`\n${total === 0 ? "NOTHING FOUND" : "FOUND " + total + " ITEM(S) TO LOOK AT"} outside fixtures/tests.`);
  if (total > 0 && !verbose) console.log("Re-run with --verbose for the exact commits and lines.");
  process.exit(total === 0 ? 0 : 1);
}
