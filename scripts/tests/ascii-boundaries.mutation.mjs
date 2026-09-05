#!/usr/bin/env node
/*
 * CAN ascii-boundaries.test.mjs SEE A PATTERN GO BACK TO MATCHING NOTHING?
 *
 * Run: node scripts/tests/ascii-boundaries.mutation.mjs
 */
import { readFileSync } from "node:fs";
import { writeFileSync } from "./lib/sidecar-write.mjs";
import { execFileSync } from "node:child_process";

const GATE = "scripts/tests/ascii-boundaries.test.mjs";
const PLACEHOLDERS = "src/lib/website-image-placeholders.ts";
const RESOLVER = "src/lib/website-image-resolver.ts";
const RULES = "src/lib/trading/rules.ts";
const CONDUCT = "src/lib/trading/conduct.ts";

const MUTANTS = [
  {
    // 1. THE ENGLISH-ONLY LOGO GUARD IS THE ONLY GUARD AGAIN, so a Greek
    // site's logo placeholder is searched and something is published as
    // the business's brand mark.
    name: "a query in another script is searched instead of stripped",
    file: RESOLVER,
    from: "  const unsearchable = (p: { query: string }) => isLogoLikeQuery(p.query) || isNonLatinQuery(p.query);",
    to: "  const unsearchable = (p: { query: string }) => isLogoLikeQuery(p.query);",
    expect: "the resolver strips an unsearchable query",
  },
  {
    // 2. NON-LATIN BECOMES NON-ASCII — the plausible wrong fix, and the
    // one that strips half the legitimate photos on a European site.
    name: "the script test becomes an ASCII test, so 'café interior' is thrown away",
    file: PLACEHOLDERS,
    from: '    if (!/\\p{L}/u.test(ch)) continue;\n    if (!/\\p{Script=Latin}/u.test(ch)) return true;',
    to: "    if (ch.charCodeAt(0) > 127) return true;",
    expect: "café interior",
  },
  {
    // 3. IT STOPS DETECTING ANYTHING, which is what a `return false` stub
    // looks like six months later.
    name: "nothing is unsearchable any more",
    file: PLACEHOLDERS,
    from: "export function isNonLatinQuery(query: string): boolean {",
    to: "export function isNonLatinQuery(query: string): boolean {\n  if (query) return false;",
    expect: "is unsearchable",
  },
  {
    // 4. THE BILINGUAL RULE LOSES ITS GREEK HALF — the exact shape this
    // whole scan is about: `\b` around Greek, matching nothing, silently.
    name: "the session rule goes back to an ASCII boundary alone",
    file: RULES,
    from: 'if (/\\bonly\\b/.test(folded) || folded.includes("μονο")) {',
    to: "if (/\\bonly\\b/.test(folded) || /\\bμονο\\b/.test(folded)) {",
    expect: "the session rule matches Greek without a boundary",
  },
  {
    // 5. A BOUNDARY IS PUT BACK AROUND A GREEK ADVICE PATTERN. It compiles,
    // it looks tidier, and the advice filter stops seeing Greek.
    name: "a Greek advice pattern gains a word boundary",
    file: CONDUCT,
    from: "  /(?:σου\\s+)?(?:προτεινω|συνιστω)/i,",
    to: "  /\\b(?:σου\\s+)?(?:προτεινω|συνιστω)\\b/i,",
    expect: "no Greek advice pattern carries a word boundary",
  },
];

function runGate() {
  try {
    execFileSync(process.execPath, [GATE], { encoding: "utf8", stdio: "pipe" });
    return { green: true, failed: [] };
  } catch (e) {
    const out = String(e.stdout ?? "") + String(e.stderr ?? "");
    return { green: false, failed: [...out.matchAll(/^ {2}FAIL {2}(.+)$/gm)].map((m) => m[1].trim()) };
  }
}

console.log("ascii-boundaries mutations\n");

const TARGETS = [...new Set(MUTANTS.map((m) => m.file))];
const originals = new Map(TARGETS.map((f) => [f, readFileSync(f, "utf8")]));
const restoreAll = () => {
  for (const [file, text] of originals) writeFileSync(file, text);
};

let caught = 0;
const missed = [];
try {
  const base = runGate();
  console.log(`baseline: the gate is ${base.green ? "GREEN" : "RED"} on the unmutated tree`);
  if (!base.green) {
    console.log(`\nBASELINE IS RED — no mutation result below would mean anything.\n  ${base.failed.join("\n  ")}`);
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
    try {
      result = runGate();
    } finally {
      restoreAll();
    }
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
console.log(
  after.green
    ? "\nbaseline: the gate is green again on the restored tree"
    : "\nBASELINE IS RED — a mutation was not restored. Check `git diff`."
);

console.log(`\n${caught} of ${MUTANTS.length} mutations caught.`);
if (missed.length > 0 || !after.green) {
  if (missed.length > 0) {
    console.log("\nHOLES:");
    for (const m of missed) console.log(`  - ${m.name}\n    ${m.why}`);
  }
  process.exit(1);
}
console.log("A pattern that would silently match nothing in one language turns this red.");
