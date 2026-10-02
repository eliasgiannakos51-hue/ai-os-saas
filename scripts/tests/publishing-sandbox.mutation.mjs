#!/usr/bin/env node
/*
 * WOULD A PUBLISHED PAGE THAT CAN ACT AS OUR ORIGIN STILL PASS?
 *
 * Run: node scripts/tests/publishing-sandbox.mutation.mjs
 *
 * Each edit reads like a fix for a real complaint — "the YouTube embed
 * needs cookies", "the CSP is long, tidy it", "the new page route can
 * build its own headers" — and each hands a published page's script the
 * signed-in visitor's session again. scripts/tests/publishing-sandbox.test.mjs
 * must go red on the clause that names it.
 */
import { readFileSync } from "node:fs";
import { writeFileSync } from "./lib/sidecar-write.mjs";
import { execFileSync } from "node:child_process";

const GATE = "scripts/tests/publishing-sandbox.test.mjs";
const SERVING = "src/lib/publishing/public-serving.ts";
const PAGE_ROUTE = "src/app/s/[subdomain]/[page]/route.ts";

const MUTANTS = [
  {
    name: "the sandbox directive is dropped from the policy",
    file: SERVING,
    from: "  `sandbox ${SANDBOX_TOKENS.join(\" \")}`,\n",
    to: "",
    expect: "has a sandbox directive",
  },
  {
    // "THE EMBED NEEDS COOKIES": the one token that undoes the whole thing.
    name: "allow-same-origin is added so an embed can keep its cookies",
    file: SERVING,
    from: 'const SANDBOX_TOKENS = ["allow-scripts",',
    to: 'const SANDBOX_TOKENS = ["allow-same-origin", "allow-scripts",',
    expect: "WITHOUT allow-same-origin",
  },
  {
    name: "the page is allowed to navigate the tab that opened it",
    file: SERVING,
    from: '"allow-popups-to-escape-sandbox"];',
    to: '"allow-popups-to-escape-sandbox", "allow-top-navigation"];',
    expect: "without allow-top-navigation",
  },
  {
    // A SANDBOX THAT BREAKS THE SITE is also a defect: no forms means
    // every contact form on every published site stops working.
    name: "allow-forms is dropped, so every contact form stops submitting",
    file: SERVING,
    from: '["allow-scripts", "allow-forms",',
    to: '["allow-scripts",',
    expect: "allow-forms is granted",
  },
  {
    name: "a sub-page route builds its own headers and skips the sandbox",
    file: PAGE_ROUTE,
    from: "...publishedSiteHeaders(),",
    to: '"Content-Type": "text/html; charset=utf-8",',
    expect: "src/app/s/[subdomain]/[page]/route.ts sends publishedSiteHeaders()",
  },
];

function runGate() {
  try {
    execFileSync(process.execPath, [GATE], { encoding: "utf8", stdio: "pipe", timeout: 300_000 });
    return { green: true, failed: [] };
  } catch (e) {
    const out = String(e.stdout ?? "") + String(e.stderr ?? "");
    return { green: false, failed: [...out.matchAll(/^ {2}FAIL {2}(.+)$/gm)].map((m) => m[1].trim()) };
  }
}

console.log("publishing-sandbox mutations\n");
const TARGETS = [...new Set(MUTANTS.map((m) => m.file))];
const originals = new Map(TARGETS.map((f) => [f, readFileSync(f, "utf8")]));
const restoreAll = () => { for (const [file, text] of originals) writeFileSync(file, text); };

let caught = 0;
const missed = [];
try {
  const baseline = runGate();
  if (!baseline.green) {
    console.log("BASELINE IS ALREADY RED — fix the gate before measuring it.");
    console.log(baseline.failed.map((f) => `  ${f}`).join("\n"));
    process.exit(1);
  }
  for (const m of MUTANTS) {
    if (!originals.get(m.file).includes(m.from)) {
      missed.push({ ...m, why: `the mutation target no longer exists in ${m.file}` });
      console.log(`  STALE   ${m.name}`);
      continue;
    }
    writeFileSync(m.file, originals.get(m.file).replace(m.from, m.to));
    let result;
    try { result = runGate(); } finally { restoreAll(); }
    if (result.green) {
      missed.push({ ...m, why: "the gate stayed green — nothing here is load-bearing" });
      console.log(`  MISSED  ${m.name}`);
      continue;
    }
    const onTarget = result.failed.filter((f) => f.includes(m.expect));
    if (onTarget.length === 0) {
      missed.push({ ...m, why: `red on "${result.failed.slice(0, 3).join('", "')}" — nothing matching "${m.expect}"` });
      console.log(`  WRONG   ${m.name}\n          -> red on: ${result.failed.slice(0, 3).join(" | ")}`);
      continue;
    }
    caught++;
    console.log(`  CAUGHT  ${m.name}\n          -> ${onTarget[0]}`);
  }
} finally {
  restoreAll();
}

const after = runGate();
console.log(after.green ? "\nbaseline: the gate is green again on the restored tree" : "\nBASELINE IS RED — a mutation was not restored. Check `git diff`.");
console.log(`\n${caught} of ${MUTANTS.length} mutations caught.`);
if (missed.length > 0 || !after.green) {
  if (missed.length > 0) {
    console.log("\nHOLES:");
    for (const m of missed) console.log(`  - ${m.name}\n    ${m.why}`);
  }
  process.exit(1);
}
console.log("A published page that could act as our origin goes red here first.");
