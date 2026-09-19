#!/usr/bin/env node
/*
 * A GATE THAT READS THE SAME ARTEFACT AS THE CODE IT CHECKS.
 *
 * The instance, 2026-09-19: every sidebar gate read lib/sidebar-nav.ts,
 * the file the sidebar itself is built from. All of them were green and
 * all of them were right — the declaration said Run had three rows, and
 * it did. The screen showed a heading and nothing, because the rows
 * were collapsed. A check on the declaration cannot see a renderer.
 *
 * ---------------------------------------------------------------------
 * WHAT IS AND IS NOT THE SHAPE, because "reads the same file" alone is
 * not a defect and flagging it would make this scan useless.
 * ---------------------------------------------------------------------
 *
 * A gate that reads lib/sidebar-nav.ts and asserts the group order
 * equals a list WRITTEN IN THE GATE is a real check: two independent
 * statements, and the gate goes red when they disagree. That is most of
 * this directory and it is fine.
 *
 * The shape is a gate with NO INDEPENDENT REFERENCE — nothing to
 * disagree with. Four things count as one, and a gate needs at least
 * one of them:
 *
 *   LITERAL    an expectation written in the gate: a const array, a
 *              number, a string the source must match.
 *   SECOND     a second artefact of a DIFFERENT KIND — the migrations
 *              against the TypeScript, the translations against the
 *              components, the rendered page against the config. Two
 *              files that are both app source do not count; two that
 *              must be kept in step by a human do.
 *   EXECUTED   the gate runs the code (loadTs + a call) rather than
 *              reading it. Behaviour disagreeing with text is a real
 *              disagreement.
 *   EXTERNAL   a database, a browser, a network — the strongest, and
 *              why the prodtests and dbtests are not in this scan.
 *
 * A gate with none of these can only confirm that a file equals itself.
 *
 * ---------------------------------------------------------------------
 * PRECISION IS NOT HIGH AND THE NUMBER IS PRINTED, NOT GATED.
 * ---------------------------------------------------------------------
 *
 * The literal detector cannot tell an expectation from a helper, and a
 * gate can hold a real independent fact in a regex nobody would call a
 * literal. Every finding here is a CANDIDATE, and CLAUDE.md says how to
 * settle one: mutate the source, do not read it. Break the thing the
 * gate claims to protect and see whether it goes red. If it stays
 * green, the gate was confirming the file against itself.
 *
 * Run: node scripts/scan-self-confirming-gates.mjs
 *      node scripts/scan-self-confirming-gates.mjs --json
 */
import { readdirSync, readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { stripComments } from "./check-mutation-markers.mjs";

const DIR = "scripts/tests";
const gates = readdirSync(DIR)
  .filter((f) => f.endsWith(".test.mjs"))
  .sort();

/** Which kind of artefact a path is. Two files of the same kind are not
 *  independent of each other for this purpose: both are the same
 *  author's statement of the same intent, edited in the same commit. */
function kindOf(p) {
  if (p.startsWith("src/")) return "app";
  if (p.startsWith("messages/")) return "i18n";
  if (p.startsWith("supabase/")) return "sql";
  if (p.startsWith("docs/")) return "docs";
  if (p.startsWith("scripts/")) return "gate";
  if (p.startsWith("public/")) return "public";
  if (p === "package.json" || p === "vercel.json" || p.endsWith(".json")) return "config";
  return "other";
}

const rows = [];
for (const file of gates) {
  const raw = readFileSync(path.join(DIR, file), "utf8");
  const src = stripComments(raw);

  // Paths the gate opens. Both spellings, plus the loadTs form that
  // EXECUTES rather than reads.
  //
  // A PATH HELD IN A CONST COUNTS. The first version matched only a
  // quoted literal inside the call, and roadmap-hidden.test.mjs — which
  // runs `loadTs(FOOTER)` — came back as reading nothing it executes and
  // was flagged as self-confirming. It is not: it executes the real
  // FOOTER_LINKS array, which is the strongest thing in this whole
  // classification.
  //
  // This repository has been bitten by the same blind spot twice and
  // written it down both times: env-documented.test.mjs found that 79 of
  // 130 environment variables are read as `process.env[name]` with the
  // name in a string, and env-independence.test.mjs resolves a path held
  // in a const because the gate that broke a CI build spawns
  // `[RUNNER, ...args]`. A scanner about gates missing their subject had
  // no business missing its own.
  const consts = new Map();
  for (const m of src.matchAll(/const\s+([A-Za-z_$][\w$]*)\s*=\s*["'`]([^"'`]+)["'`]\s*;/g)) {
    consts.set(m[1], m[2]);
  }
  const resolve = (token) => (token.startsWith('"') || token.startsWith("'") || token.startsWith("`")
    ? token.slice(1, -1)
    : consts.get(token) ?? null);

  const read = new Set();
  for (const m of src.matchAll(/readFileSync\(\s*((?:["'`][^"'`]+["'`])|(?:[A-Za-z_$][\w$]*))\s*[,)]/g)) {
    const p2 = resolve(m[1]);
    if (p2 && p2.includes("/")) read.add(p2);
  }
  const executed = new Set();
  for (const m of src.matchAll(/loadTs\(\s*((?:["'`][^"'`]+["'`])|(?:[A-Za-z_$][\w$]*))\s*[,)]/g)) {
    const p2 = resolve(m[1]);
    if (!p2 || !p2.includes("/")) continue;
    executed.add(p2);
    read.add(p2);
  }
  // A gate that walks a directory reads whatever is under it.
  for (const m of src.matchAll(/(?:readdirSync|walk)\(\s*((?:["'`][^"'`]+["'`])|(?:[A-Za-z_$][\w$]*))\s*[,)]/g)) {
    const p2 = resolve(m[1]);
    if (p2) read.add(p2 + "/**");
  }

  const kinds = new Set([...read].map(kindOf));
  const appOnly = kinds.size > 0 && [...kinds].every((k) => k === "app");

  // LITERAL: a const holding an array or object of strings, or a
  // comparison against a quoted string / number, used inside a check.
  // Crude on purpose — it over-counts, which makes a flag rarer and a
  // flag that survives worth reading.
  const hasLiteralTable =
    /const\s+[A-Z][A-Z0-9_]*\s*=\s*[[{]/.test(src) ||
    // A NAMED CONSTANT STRING COMPARED AGAINST THE SOURCE is an
    // expectation as much as a table is: `const GUARD = "...";
    // src.includes(GUARD)` is the gate stating what the file must
    // contain. mutation-tree.test.mjs is exactly this and was flagged.
    /\.includes\(\s*[A-Z][A-Z0-9_]*\s*\)/.test(src);
  const hasInlineExpectation =
    /(?:check|checkTrue|ok)\([^)]*===\s*["'`]/.test(src) ||
    /(?:check|checkTrue|ok)\([^)]*\.length\s*(?:===|>=|<=|>|<)\s*\d/.test(src) ||
    /(?:check|checkTrue|ok)\([^)]*,\s*\d+\s*[,)]/.test(src) ||
    // A CEILING OR FLOOR ON A MEASURED COUNT. design-density.test.mjs
    // holds `r.counts.borders <= 581`, which is a number written in the
    // gate and the strongest kind of independent statement it makes —
    // and the three patterns above all missed it because the comparison
    // is on a property rather than on `.length`.
    /(?:check|checkTrue|ok)\([^)]*[a-z)\]]\s*(?:<=|>=|<|>)\s*\d+/.test(src);

  // A GATE THAT RUNS A PROGRAM IS MEASURING BEHAVIOUR, not text — the
  // same reason `loadTs` + a call counts. mutation-tree.test.mjs writes
  // a mutant into the tree and runs check-mutation-markers against it,
  // which is the strongest thing in this directory, and the first
  // version of this scan called it self-confirming because it models
  // only two ways of reading a file.
  const spawns = /execFileSync\(|spawnSync\(|execSync\(/.test(src);

  const evidence = [];
  if (hasLiteralTable) evidence.push("LITERAL");
  if (hasInlineExpectation) evidence.push("EXPECT");
  if (!appOnly && kinds.size > 1) evidence.push(`SECOND(${[...kinds].filter((k) => k !== "app").join("+")})`);
  if (executed.size > 0) evidence.push("EXECUTED");
  if (spawns) evidence.push("RUNS");

  rows.push({
    file,
    reads: [...read],
    kinds: [...kinds],
    appOnly,
    executed: executed.size > 0 || spawns,
    evidence,
    selfConfirming: evidence.length === 0 && read.size > 0,
  });
}

const noReads = rows.filter((r) => r.reads.length === 0);
const flagged = rows.filter((r) => r.selfConfirming);
const appOnlyNoExec = rows.filter((r) => r.appOnly && !r.executed && !r.evidence.includes("LITERAL"));

if (process.argv.includes("--json")) {
  console.log(JSON.stringify({ gates: rows.length, flagged, appOnlyNoExec }, null, 2));
  process.exit(0);
}

console.log(`== ${rows.length} gates in ${DIR} ==\n`);
console.log("-- 1. WHAT EACH GATE HAS TO DISAGREE WITH --\n");
console.log(`  read at least one artefact        ${rows.length - noReads.length}`);
console.log(`  read nothing (pure logic/unit)    ${noReads.length}`);
console.log(`  read ONLY app source              ${rows.filter((r) => r.appOnly).length}`);
console.log(`  ...of those, also EXECUTE or RUN  ${rows.filter((r) => r.appOnly && r.executed).length}`);
console.log(`  hold a second KIND of artefact    ${rows.filter((r) => r.kinds.length > 1).length}`);

console.log(`\n  candidates with no independent reference at all: ${flagged.length}`);
for (const r of flagged) console.log(`     ${r.file}  <- ${r.reads.slice(0, 3).join(", ")}`);
console.log(
  "\n  THIS CLASSIFICATION IS WEAK IN BOTH DIRECTIONS AND THE NUMBER IS NOT\n" +
    "  A FINDING. On 2026-09-19 all eight of its candidates were run down by\n" +
    "  mutation and every one HELD; the one gate that was really confirming\n" +
    "  a file against itself — navigation-cost.test.mjs — it did not flag,\n" +
    "  because a const string comparison elsewhere in the file counted as an\n" +
    "  independent reference. Precision 0 of 8, recall 0 of 1. Section 2 is\n" +
    "  the half that works."
);

// ---------------------------------------------------------------------
// 2. THE MECHANISM, WHICH IS EXACT.
// ---------------------------------------------------------------------
//
// A gate reads a source file and tests a regex against it. If that
// regex's ONLY match in the file is inside a comment, the check is
// being satisfied by prose right now — today, not hypothetically.
//
// That is what navigation-cost.test.mjs was doing: a check named
// "…behind requestIdleCallback, so it never competes with hydration"
// was `/requestIdleCallback/.test(bridge)` over the raw file, and the
// component's header explains the decision in those words. Replacing
// both real calls with setTimeout left the gate green.
//
// A gate may legitimately assert that a COMMENT exists — comment-claims
// and roadmap-hidden both do, and the prose is their subject. So the
// findings are split: a pattern that looks like CODE and matches only
// prose is a candidate; a pattern that is a sentence probably is not.
console.log("\n-- 2. PATTERNS WHOSE ONLY MATCH IN THEIR TARGET IS A COMMENT --\n");
const pairs = [];
for (const file of gates) {
  const src = readFileSync(path.join(DIR, file), "utf8");
  const vars = new Map();
  for (const m of src.matchAll(
    /const\s+([A-Za-z_$][\w$]*)\s*=\s*readFileSync\(\s*["'`]([^"'`]+)["'`]\s*,\s*"utf8"\s*\)\s*;/g
  )) {
    vars.set(m[1], m[2]);
  }
  if (vars.size === 0) continue;
  for (const m of src.matchAll(/(!?)\/((?:[^/\\\n]|\\.)+)\/([gimsuy]*)\s*\.test\(\s*([A-Za-z_$][\w$]*)\s*\)/g)) {
    const [, neg, body, flags, v] = m;
    const target = vars.get(v);
    if (!target || !existsSync(target)) continue;
    let re;
    try {
      re = new RegExp(body, flags.replace(/[gy]/g, ""));
    } catch {
      continue;
    }
    const raw = readFileSync(target, "utf8");
    if (!re.test(raw) || re.test(stripComments(raw))) {
      pairs.push({ file, target, body, neg: neg === "!", proseOnly: false });
      continue;
    }
    // CODE-SHAPED vs SENTENCE-SHAPED.
    const codeish = /[(){}[\]=;]|\\s\*|[a-z][A-Z]|\.\w|_\w/.test(body);
    const words = body.replace(/\\[a-zA-Z]|[^\w\s]/g, " ").trim().split(/\s+/).filter((w) => /^[A-Za-z]{2,}$/.test(w));
    const sentenceish = words.length >= 4 && !/[(){}[\]=;]/.test(body);
    pairs.push({ file, target, body, neg: neg === "!", proseOnly: true, codeish: codeish && !sentenceish });
  }
}
const proseOnly = pairs.filter((p) => p.proseOnly);
const codeShaped = proseOnly.filter((p) => p.codeish);
console.log(`  ${pairs.length} /regex/.test(fileVariable) pairs resolved to a real target`);
console.log(`  ${proseOnly.length} match ONLY inside a comment · ${codeShaped.length} of those look like code\n`);
for (const p2 of codeShaped) {
  console.log(`   ${p2.file}`);
  console.log(`       ${p2.target}`);
  console.log(`       /${p2.body}/${p2.neg ? "   [negated]" : ""}`);
}
console.log(
  "\n  REPORTED, NOT GATED, and the split above is a heuristic: several of\n" +
    "  these deliberately span a comment AND the code under it, which is a\n" +
    "  legitimate anchor. CLAUDE.md says how to settle one — MUTATE the\n" +
    "  source, never read it. Break what the check claims to protect and\n" +
    "  require it to go red."
);
