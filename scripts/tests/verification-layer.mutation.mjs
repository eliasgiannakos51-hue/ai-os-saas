#!/usr/bin/env node
/*
 * CAN THE VERIFICATION LAYER GO RED?
 *
 * The point of this layer is that quality rises without a better model.
 * That only holds while the checks actually run, so the mutations here
 * are mostly about the WIRING rather than the arithmetic: a module that
 * is correct and never called is the exact failure the workstream exists
 * to end, and it looks identical to a working one from the outside.
 *
 * Run: node scripts/tests/verification-layer.mutation.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const GATE = "scripts/tests/verification-layer.test.mjs";
const RUNNER = "src/lib/research/run-research.ts";
const LIB = "src/lib/verification/citations.ts";
const GENERATE = "src/app/api/websites/generate/process/route.ts";

const MUTANTS = [
  // ------------------------------------------------------------------
  // THE WIRING. Each of these leaves a module that still passes its own
  // unit tests and verifies nothing.
  // ------------------------------------------------------------------
  {
    name: "the check is computed and its result ignored (the classic dead verifier)",
    file: RUNNER,
    from: "    markdown: citations.ok\n      ? synthesis.markdown\n      : annotateDanglingCitations(synthesis.markdown, sources.length),",
    to: "    markdown: synthesis.markdown,",
  },
  {
    name: "the failure is swallowed instead of logged",
    file: RUNNER,
    from: '        stage: "citation_check",',
    to: '        stage: "something_else",',
  },
  {
    name: "the check moves AFTER the document is rendered, so it cannot affect it",
    file: RUNNER,
    from: "  const citations = checkCitations(synthesis.markdown, sources.length);",
    to: "  const citations = { ok: true, markers: [], issues: [] };\n  void checkCitations;",
  },
  {
    name: "a website route stops scanning for invented numbers",
    file: GENERATE,
    from: "website-invented-numbers",
    to: "website-invented-numbers-disabled",
  },
  // ------------------------------------------------------------------
  // THE ARITHMETIC.
  // ------------------------------------------------------------------
  {
    name: "a dangling marker stops being dangling (off-by-one the wrong way)",
    file: LIB,
    from: "    if (marker > sourceCount) issues.push({ kind: \"dangling\", marker, sourceCount });",
    to: "    if (marker > sourceCount + 5) issues.push({ kind: \"dangling\", marker, sourceCount });",
  },
  {
    name: "an unused source is treated as a failure (crying wolf)",
    file: LIB,
    from: '    ok: !issues.some((i) => i.kind === "dangling"),',
    to: "    ok: issues.length === 0,",
  },
  {
    name: "code fences stop being stripped, so array indices read as citations",
    file: LIB,
    from: '  const prose = markdown.replace(/```[\\s\\S]*?```/g, "").replace(/`[^`\\n]*`/g, "");',
    to: "  const prose = markdown;",
  },
  {
    name: "the annotation marks working citations too",
    file: LIB,
    from: "    if (n < 1 || n <= sourceCount) return whole;",
    to: "    if (n < 1) return whole;",
  },
];

let caught = 0;
const missed = [];
for (const m of MUTANTS) {
  const original = readFileSync(m.file, "utf8");
  if (!original.includes(m.from)) {
    missed.push({ ...m, why: "the mutation target no longer exists in the file" });
    console.log(`  STALE   ${m.name}\n          anchor not found in ${m.file}`);
    continue;
  }
  writeFileSync(m.file, original.replace(m.from, m.to));
  let detail = null;
  try {
    execFileSync("node", [GATE], { encoding: "utf8", stdio: "pipe" });
  } catch (e) {
    const out = String(e.stdout || "") + String(e.stderr || "");
    detail = (out.split("\n").find((l) => l.includes("FAIL")) || out.split("\n")[0] || "").trim();
  } finally {
    writeFileSync(m.file, original);
  }
  if (detail) {
    caught++;
    console.log(`  CAUGHT  ${m.name}\n          ${detail.slice(0, 120)}`);
  } else {
    missed.push({ ...m, why: "the gate stayed green with the defect re-introduced" });
    console.log(`  MISSED  ${m.name}\n          the gate stayed green`);
  }
}

try {
  execFileSync("node", [GATE], { stdio: "pipe" });
  console.log("\nbaseline: the gate is green on the unmutated tree");
} catch {
  console.log("\nBASELINE IS RED — a mutation was not restored. Check `git diff`.");
  process.exit(1);
}

console.log(`\n${caught} of ${MUTANTS.length} mutations caught.`);
if (missed.length) {
  console.log("\nHOLES:");
  for (const m of missed) console.log(`  - ${m.name}\n    ${m.why}`);
  process.exit(1);
}
console.log("Every re-introduced defect turned the gate red.");
