#!/usr/bin/env node
/*
 * THE RULE THAT SAYS A BOUNDARY MAY NOT TOUCH A SENTENCE — can it fail?
 *
 * The gate is a heuristic wrapped around a declaration, and every part of
 * it degrades quietly. A reader that stops matching reports a smaller
 * population and a clean result. A "looks like a machine format" test that
 * says yes to everything turns the declaration into a rubber stamp. A
 * declaration left behind after its last boundary waves the next one
 * through.
 *
 * So the two defects this round actually fixed are put back, one of them
 * with a declaration on top of it — which is the case that matters most,
 * because it is what somebody does when the gate is in their way.
 *
 * EVERY MUTATION IS AN EDIT OF REAL CODE, never an `if (false)`:
 * scripts/check-mutation-markers.mjs fails the build on that literal, so a
 * mutation written that way is "caught" by the marker gate without any
 * behavioural check having looked at it.
 *
 * Run: node scripts/tests/untrusted-boundaries.mutation.mjs
 */
import { readFileSync } from "node:fs";
import { writeFileSync } from "./lib/sidecar-write.mjs";
import { execFileSync } from "node:child_process";

const GATE = "scripts/tests/untrusted-boundaries.test.mjs";
const GATEFILE = "scripts/tests/untrusted-boundaries.test.mjs";
const AGENT = "src/lib/agents/agent-config.ts";
const CLASSIFY = "src/lib/health/classify.ts";
const HEAD = "src/lib/seo/head.ts";
const TARGETS = [...new Set([GATEFILE, AGENT, CLASSIFY, HEAD])];

const MUTANTS = [
  {
    // 1. THE MODEL'S SENTINEL GETS ITS ASCII BOUNDARY BACK, in a file
    // that declares no format — so it cannot be declared, only fixed.
    name: "the sentinel check goes back to an ASCII boundary",
    file: AGENT,
    from: "/^NO_RESULT(?![\\p{L}\\p{N}])/iu.test(text)",
    to: "/^NO_RESULT\\b/i.test(text)",
    expect: "every boundary applied to written text is declared",
  },
  {
    // 2. AND THE PROVIDER'S ERROR TEXT.
    name: "the jwt check goes back to an ASCII boundary",
    file: CLASSIFY,
    from: "/(?<![\\p{L}\\p{N}])jwt(?![\\p{L}\\p{N}])|api key|unauthorized/iu",
    to: "/\\bjwt\\b|api key|unauthorized/i",
    expect: "every boundary applied to written text is declared",
  },
  {
    // 3. THE ONE THAT MATTERS. A bare word with a boundary, inside a file
    // that ALREADY declares a format — which is what happens when the
    // declaration is treated as permission rather than as a claim about
    // the pattern. It has to be refused by the second condition.
    name: "a bare word with a boundary is smuggled into a file that declares html",
    file: HEAD,
    from: "if (/<meta\\b[^>]*\\bname\\s*=\\s*(\"viewport\"|'viewport')/i.test(html)) return html;",
    to: "if (/\\bviewport\\b/i.test(html)) return html;",
    expect: "every declaration matches the pattern it covers",
  },
  {
    // 4. A DECLARATION IS REMOVED. The seven files that parse a machine
    // format are the reason 27 boundaries are allowed at all.
    name: "a file stops declaring the format it parses",
    file: HEAD,
    from: "// BOUNDARY-FORMAT: html",
    to: "// (no format declared)",
    expect: "every boundary applied to written text is declared",
  },
  {
    // 5. THE FORMAT TEST SAYS YES TO EVERYTHING, so a declaration stops
    // being checked and becomes a rubber stamp.
    name: "looksLikeFormat accepts any pattern",
    file: GATEFILE,
    // ANCHORED ON THE SIGNATURE, not on the body. The body is three
    // backslashes deep and every attempt to quote it in a mutation string
    // came back STALE — an anchor nobody can retype is an anchor that
    // rots, which is the failure mode this whole directory reports as
    // "the suite is broken, not the code it guards".
    from: "export function looksLikeFormat(pattern) {",
    to: "export function looksLikeFormat() {\n  return true;\n}\nfunction unusedLooksLikeFormat(pattern) {",
    expect: "a bare word is NOT",
  },
  {
    // 6. THE NON-ASCII TEST STOPS SEEING GREEK, so a declared file could
    // carry a boundary around a Greek word.
    name: "the non-ASCII letter test never fires",
    file: GATEFILE,
    from: "export const hasNonAsciiLetter = (pattern) => /[^\\x00-\\x7F]/.test(pattern);",
    to: "export const hasNonAsciiLetter = () => false;",
    expect: "a Greek literal is caught",
  },
  {
    // 7. A DECLARATION IS READ FROM ANYWHERE IN THE FILE, so a sentence
    // buried three hundred lines down licenses everything above it.
    name: "a declaration is honoured wherever it appears",
    file: GATEFILE,
    from: "  const head = src.split(\"\\n\").slice(0, 40).join(\"\\n\");",
    to: "  const head = src;",
    expect: "only near the top",
  },
  {
    // 8. AND THE GOVERNED SET EMPTIES ITSELF. \B is not \b; a pattern
    // that only looks for the negated form finds almost nothing, and
    // every check below it passes over an empty list.
    name: "the governed set stops looking for \\b",
    file: GATEFILE,
    from: "const bounded = untrusted.filter((a) => /\\\\b|\\\\B/.test(a.pattern));",
    to: "const bounded = untrusted.filter((a) => /\\\\B/.test(a.pattern));",
    expect: "the governed set is not empty",
  },
];

function runGate() {
  try {
    execFileSync(process.execPath, [GATE], { encoding: "utf8", stdio: "pipe", timeout: 600_000 });
    return { green: true, failed: [] };
  } catch (e) {
    const out = String(e.stdout ?? "") + String(e.stderr ?? "");
    return { green: false, failed: [...out.matchAll(/^ {2}FAIL {2}(.+)$/gm)].map((m) => m[1].trim()) };
  }
}

console.log("untrusted-boundaries mutations\n");

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
    // An 'all' flag REPLACES EVERY OCCURRENCE. A defect that exists twice in one
    // file — the webhook returns early on a replay in two places — is not
    // re-introduced by changing the first, and the gate stays green for a
    // reason that is about the mutation rather than the code.
    const mutated = m.all
      ? originals.get(m.file).split(m.from).join(m.to)
      : originals.get(m.file).replace(m.from, m.to);
    writeFileSync(m.file, mutated);
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
console.log("A boundary on a sentence, and a declaration that would launder one, are each red.");
