#!/usr/bin/env node
// A SECRET SCAN THAT FINISHES IN SECONDS, so it can run on every push.
//
// A full `git log --all -G<pattern>` walk of history is thorough and slow
// enough that it only makes sense on demand, not on every push. This
// script instead scans ONLY the lines a push or pull request is ABOUT TO
// ADD, by diffing against the base the event gives it, so it can sit in
// the fast path that runs on every push (CLAUDE.md, Βήμα 2: "fast checks
// + secret scan + dependency audit on EVERY push").
//
// WHAT COUNTS AS "ADDED": a line is read with `git diff --unified=0`
// against SCAN_BASE, and only `+` lines are scanned — a line someone is
// DELETING is not a new leak. If SCAN_BASE does not resolve locally (a
// brand-new branch's first push hands `before` as the all-zero SHA, or a
// force-push rewrote the history this shallow clone has), the fallback is
// a diff against git's own empty-tree hash — every line of the CURRENT
// tree reads as "added", which is a slower false-safe, not a skip.
//
// EXCLUDED: a suite that feeds a provider SDK a fake credential to test it
// (`.test.mjs` through `.repro.mjs`) and the scrubber/placeholder docs
// that legitimately print a key's SHAPE. Not excluded on purpose: this
// file itself has no key literal, only prefixes, so it does not need to
// exclude itself.
//
// Run: node scripts/security/push-secret-scan.mjs
// Env: SCAN_BASE (a commit the workflow believes is the push's parent),
//      SCAN_HEAD (default HEAD)
import { execFileSync } from "node:child_process";

const EMPTY_TREE = "4b825dc642cb6eb9a060e54bf8d69288fbee4904"; // git hash-object -t tree /dev/null
const HEAD = process.env.SCAN_HEAD || "HEAD";
const REQUESTED_BASE = (process.env.SCAN_BASE || "").trim();

const EXCLUDED_SUFFIXES = [".test.mjs", ".dbtest.mjs", ".mutation.mjs", ".itest.mjs", ".prodtest.mjs", ".repro.mjs"];
const EXCLUDED_PATHS = ["README.md", "src/lib/scrub-secrets.ts", "docs/keys-status-2026-10-04.md"];

function isExcluded(path) {
  return EXCLUDED_SUFFIXES.some((s) => path.endsWith(s)) || EXCLUDED_PATHS.includes(path);
}

function resolvableCommit(ref) {
  if (!ref) return false;
  try {
    execFileSync("git", ["rev-parse", "--verify", "--quiet", `${ref}^{commit}`], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function diffRange() {
  if (resolvableCommit(REQUESTED_BASE)) return [REQUESTED_BASE, HEAD, "the push's own base"];
  return [EMPTY_TREE, HEAD, "the whole current tree (the requested base was not reachable)"];
}

// Named so a hit says WHICH credential shape it looks like, not just
// "matched something". Shapes read off docs/api-keys.md and the common
// provider/platform prefixes this kind of leak actually takes.
const KEY_PATTERNS = [
  { name: "Anthropic API key", re: /\bsk-ant-[A-Za-z0-9_-]{20,}/ },
  { name: "OpenAI API key", re: /\bsk-[A-Za-z0-9]{20,}\b/ },
  { name: "Google API key", re: /\bAIza[0-9A-Za-z_-]{35}\b/ },
  { name: "Groq API key", re: /\bgsk_[A-Za-z0-9]{20,}/ },
  { name: "Stripe / Resend / ElevenLabs style secret key", re: /\b(sk|pk|rk|re)_[A-Za-z0-9]{16,}/ },
  { name: "Stripe webhook secret", re: /\bwhsec_[A-Za-z0-9]{16,}/ },
  { name: "Supabase secret/publishable key", re: /\b(sbp|sb)_[A-Za-z0-9_-]{16,}/ },
  { name: "a JWT (Supabase service role key's shape)", re: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/ },
  { name: "GitHub token", re: /\b(ghp|gho|ghu|ghs|ghr|github_pat)_[A-Za-z0-9_]{20,}/ },
  { name: "AWS access key id", re: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: "Slack token", re: /\bxox[baprs]-[A-Za-z0-9-]{10,}/ },
  { name: "Telegram bot token", re: /\b\d{8,12}:[A-Za-z0-9_-]{30,}\b/ },
  { name: "a private key block", re: /-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----/ },
];

function run() {
  const [base, head, why] = diffRange();
  const diff = execFileSync(
    "git",
    ["diff", "--unified=0", "--no-color", `${base}..${head}`],
    { maxBuffer: 1024 * 1024 * 64, encoding: "utf8" }
  );

  let currentPath = "";
  const hits = [];
  for (const line of diff.split("\n")) {
    const fileHeader = line.match(/^\+\+\+ b\/(.+)$/);
    if (fileHeader) {
      currentPath = fileHeader[1];
      continue;
    }
    if (!line.startsWith("+") || line.startsWith("+++")) continue;
    if (isExcluded(currentPath)) continue;
    const content = line.slice(1);
    for (const { name, re } of KEY_PATTERNS) {
      if (re.test(content)) hits.push({ path: currentPath || "(unknown file)", name });
    }
  }

  console.log(`secret scan: diffing against ${base.slice(0, 12)} (${why})`);
  if (hits.length === 0) {
    console.log("secret scan: no credential-shaped string in the lines this push adds");
    return 0;
  }
  console.log(`secret scan: ${hits.length} credential-shaped string(s) found in added lines:`);
  for (const h of hits) console.log(`  ${h.path}: looks like ${h.name}`);
  console.log(
    "\nIf this is a real credential, rotate it at the provider FIRST, then remove it from the commit — " +
      "pushing a fix commit does not remove it from history. If it is a placeholder a test needs, move the " +
      "test to a file ending in one of .test.mjs/.dbtest.mjs/.mutation.mjs/.itest.mjs/.prodtest.mjs/.repro.mjs, " +
      "or add it to EXCLUDED_PATHS in scripts/security/push-secret-scan.mjs with the reason."
  );
  return 1;
}

process.exit(run());
