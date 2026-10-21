// scripts/security/git-history-keys.mjs IS WELL-FORMED, AND ITS
// EXCLUSIONS STILL MATCH THE SUFFIXES THIS REPOSITORY ACTUALLY USES
// (security audit, 2026-10-21). The scan itself is not run here — it
// takes minutes against the full history, which is why it is a tool to
// run by hand (see its own header), not a gate — but what IS checked
// every time is the thing that went quietly wrong the first time this
// file existed: an exclusion list that fell out of step with the real
// set of test-shaped suffixes, which turned 0 real findings into 28
// reported ones, all of them *.itest.mjs/*.prodtest.mjs stand-in values.
//
// Run: node scripts/tests/git-history-keys.test.mjs
import { readdirSync } from "node:fs";

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

const mod = await import("../security/git-history-keys.mjs");

console.log("== 1. the function this file exports for testing is real ==");
check("matchesFor is exported", typeof mod.matchesFor === "function");

console.log("\n== 2. the excluded suffixes match what actually exists under scripts/tests/ ==");
// THE SAME DERIVATION THE SCRIPT'S OWN COMMENT NAMES — read here too,
// rather than hand-copied, so the two cannot quietly disagree.
const suffixes = new Set();
(function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = `${dir}/${entry.name}`;
    if (entry.isDirectory()) {
      walk(full);
      continue;
    }
    const m = entry.name.match(/\.([a-z]+)\.mjs$/);
    if (m) suffixes.add(m[1]);
  }
})("scripts/tests");
const SOURCE = (await import("node:fs")).readFileSync(
  new URL("../security/git-history-keys.mjs", import.meta.url),
  "utf8"
);
for (const suffix of suffixes) {
  check(`"${suffix}" is excluded`, SOURCE.includes(`*.${suffix}.mjs`), `found under scripts/tests/ but not in EXCLUDED_PATHSPECS`);
}
check("no stale suffix is excluded that no longer exists", [...SOURCE.matchAll(/":!\*\.([a-z]+)\.mjs"/g)].every((m) => suffixes.has(m[1])));

console.log("\n== 3. the key patterns are well-formed ==");
const KEY_PATTERNS_MATCH = SOURCE.match(/const KEY_PATTERNS = \[([\s\S]*?)\n\];/);
check("KEY_PATTERNS block is present", Boolean(KEY_PATTERNS_MATCH));
const names = [...(KEY_PATTERNS_MATCH?.[1] ?? "").matchAll(/name:\s*"([^"]+)"/g)].map((m) => m[1]);
check(`at least 10 provider patterns declared (${names.length})`, names.length >= 10, names.join(", "));
check("every name is unique", new Set(names).size === names.length);
check("Anthropic, Stripe, GitHub and a bare JWT are all covered", ["Anthropic API key", "Stripe live secret key", "GitHub personal access token (classic)", "JWT (eyJ... header)"].every((n) => names.includes(n)));

console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${failures.length} failed`);
process.exit(failures.length === 0 ? 0 : 1);
