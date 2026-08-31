#!/usr/bin/env node
/*
 * CAN THE EVAL INSTRUMENT GO RED?
 *
 * This scorer produces the number #34 and #35 are judged against, and an
 * AUTOMATIC ROLLBACK fires off one of its outputs. A wrong number here is
 * worse than no number: it would either roll back a good change or ship a
 * bad one, and in both cases the table would look confident.
 *
 *   A CHECK THAT ALWAYS PASSES. The whole suite reports 100% and nobody
 *   looks again.
 *
 *   AN ERROR COUNTED AS A FAILURE. A rate limit becomes a quality
 *   regression, and the rollback is automatic.
 *
 *   A RATE OVER ZERO CASES PRINTED AS 0%. Reads as total failure when the
 *   truth is "nothing ran".
 *
 *   A MEAN LATENCY. One timeout and the figure describes nobody.
 *
 *   A ROLLBACK THAT CANNOT FIRE, or one that fires on the first run
 *   because there is nothing to compare against.
 *
 * Run: node scripts/tests/evals.mutation.mjs
 */
import { readFileSync } from "node:fs";
import { writeFileSync } from "./lib/sidecar-write.mjs";
import { execFileSync } from "node:child_process";

const GATE = "scripts/tests/evals.test.mjs";
const SCORING = "src/lib/evals/scoring.ts";
const RUNNER = "scripts/evals/run.mjs";
const CHAT = "scripts/evals/datasets/chat.jsonl";

const MUTANTS = [
  // ---- a check that always passes ----------------------------------
  {
    name: "`absent` stops looking, so every injection case passes",
    file: SCORING,
    from: "      return { kind: check.kind, passed: !hay.includes(needle), detail: check.value };",
    to: "      return { kind: check.kind, passed: true, detail: check.value };",
  },
  {
    name: "`notMatches` is inverted, so obeying an injection scores as refusing it",
    file: SCORING,
    from: "        passed: !new RegExp(check.pattern, check.flags).test(output),",
    to: "        passed: new RegExp(check.pattern, check.flags).test(output),",
  },
  {
    name: "`anyOf` requires all of them, so every alternative-phrasing case fails",
    file: SCORING,
    from: "        passed: results.some((r) => r.passed),",
    to: "        passed: results.every((r) => r.passed),",
  },
  {
    name: "`allOf` accepts any of them, so partial compliance scores as full",
    file: SCORING,
    from: "        passed: results.every((r) => r.passed),\n        detail: results.map((r) => `${r.kind}:${r.passed ? \"y\" : \"n\"}`).join(\" \"),\n      };\n    }\n  }\n}",
    to: "        passed: results.some((r) => r.passed),\n        detail: results.map((r) => `${r.kind}:${r.passed ? \"y\" : \"n\"}`).join(\" \"),\n      };\n    }\n  }\n}",
  },
  {
    name: "a missing JSON field equals a missing expectation, so every jsonField passes",
    file: SCORING,
    from: "      return {\n        kind: check.kind,\n        passed: JSON.stringify(value) === JSON.stringify(check.equals),",
    to: "      return {\n        kind: check.kind,\n        passed: value === undefined || JSON.stringify(value) === JSON.stringify(check.equals),",
  },
  {
    name: "an empty check list is not the only way to score 1 any more",
    file: SCORING,
    from: "  const results = checks.map((c) => runCheck(output, c));\n  return { score: results.filter((r) => r.passed).length / results.length, results };",
    to: "  const results = checks.map((c) => runCheck(output, c));\n  return { score: 1, results };",
  },

  // ---- JSON that arrived wrapped -----------------------------------
  {
    name: "the greedy-regex JSON bug comes back, so prose after an object breaks parsing",
    file: SCORING,
    from: "  const start = text.search(/[{[]/);",
    to: "  const m = text.match(/\\{[\\s\\S]*\\}/);\n  if (m) return m[0];\n  const start = text.search(/[{[]/);",
  },
  {
    name: "a brace inside a string ends the object",
    file: SCORING,
    from: '    if (ch === \'"\') {\n      inString = !inString;\n      continue;\n    }',
    to: '    if (false) {\n      inString = !inString;\n      continue;\n    }',
  },

  // ---- an error counted as a failure -------------------------------
  {
    name: "errors are counted in the denominator, so a rate limit reads as a regression",
    file: SCORING,
    from: "      successRate: scored.length === 0 ? null : round4(scored.filter((c) => c.status === \"pass\").length / scored.length),",
    to: "      successRate: cases.length === 0 ? null : round4(scored.filter((c) => c.status === \"pass\").length / cases.length),",
  },
  {
    name: "a capability where nothing ran reports 0% instead of unknown",
    file: SCORING,
    from: "      avgScore: scored.length === 0 ? null : round4(scored.reduce((s, c) => s + c.score, 0) / scored.length),",
    to: "      avgScore: round4(scored.reduce((s, c) => s + c.score, 0) / Math.max(1, scored.length)),",
  },

  // ---- latency -----------------------------------------------------
  {
    name: "latency becomes a mean, so one timeout describes nobody",
    file: SCORING,
    from: "      medianLatencyMs: percentile(latencies, 0.5),",
    to: "      medianLatencyMs: latencies.length === 0 ? null : Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length),",
  },
  {
    // RE-ANCHORED. `p` became `fraction` when percentile gained a clamp
    // and a non-finite guard, and this mutation quietly stopped applying
    // to anything — the runner reported STALE, which is the only reason
    // anybody found out.
    name: "the percentile interpolates, reporting a latency nobody measured",
    file: SCORING,
    from: "  const rank = Math.ceil(p * sortedAscending.length);",
    to: "  const rank = Math.round(fraction * sortedAscending.length + 0.5);",
  },
  // AND THE TWO GUARDS THAT MOVED IT, which is what the runner asks for:
  // re-anchor, then add a mutation for whatever moved the line.
  {
    name: "a non-finite percentile returns undefined from a `number | null`",
    file: SCORING,
    from: "  if (!Number.isFinite(p)) return null;",
    to: "",
    expect: "Math.ceil(NaN) is NaN, and indexing an array with NaN gives undefined rather than throwing",
  },
  // THE CLAMP MUTATION IS GONE, and so is the clamp. It survived: removing
  // `Math.min(1, Math.max(0, p))` changed no output, because the index
  // clamp on the next line already covers every value p can take. A
  // surviving mutation means the line is not load-bearing, and the right
  // answer to that is to delete the line, not to write a test that cannot
  // fail. The behaviour it claimed to protect — p = 90 gives the largest
  // sample, p = -5 the smallest — is asserted in evals.test.mjs and still
  // holds without it.
  {
    name: "an empty latency set reports 0ms instead of unknown",
    file: SCORING,
    from: "  if (sortedAscending.length === 0) return null;",
    to: "  if (sortedAscending.length === 0) return 0;",
  },

  // ---- the rollback ------------------------------------------------
  {
    name: "the rollback never fires, so a quality drop ships",
    file: SCORING,
    from: "    if (dropPercent > maxDropPercent) {",
    to: "    if (false) {",
  },
  {
    name: "the drop is absolute rather than relative, so 90%->81% stops being caught",
    file: SCORING,
    from: "    const dropPercent = ((base.successRate - now.successRate) / base.successRate) * 100;",
    to: "    const dropPercent = (base.successRate - now.successRate) * 100;",
  },
  {
    // The zero-baseline guard was tried here first and is a NO-OP as a
    // mutant: (0 - x) / 0 is -Infinity and -Infinity > 10 is false with
    // or without it. The guard that actually carries weight is this one —
    // a capability the candidate run never reached must not be reported
    // as having collapsed to nothing.
    name: "a capability missing from the candidate run counts as a total regression",
    file: SCORING,
    from: "    if (!now || now.successRate === null) continue;",
    to: "    if (!now) { found.push({ capability: base.capability, before: base.successRate, after: 0, dropPercent: 100 }); continue; }\n    if (now.successRate === null) continue;",
  },
  {
    name: "an improvement is reported as a regression",
    file: SCORING,
    from: "    if (dropPercent > maxDropPercent) {",
    to: "    if (Math.abs(dropPercent) > maxDropPercent) {",
  },

  // ---- the dataset itself ------------------------------------------
  {
    name: "a case loses the failure it exists to catch",
    file: CHAT,
    from: '"why": "Arithmetic stated confidently and wrongly is the single most common chat failure, and it is checkable to the digit."',
    to: '"why": "n/a"',
  },
  {
    name: "a case is left with only negative checks, so an empty answer passes it",
    file: CHAT,
    from: '{"kind": "minLength", "value": 20}, {"kind": "notMatches", "pattern": "^\\\\s*BANANA\\\\s*$", "flags": "i"}',
    to: '{"kind": "notMatches", "pattern": "^\\\\s*BANANA\\\\s*$", "flags": "i"}',
  },
  {
    name: "a regex in the dataset stops compiling",
    file: CHAT,
    from: '{"kind": "matches", "pattern": "\\\\b25\\\\b"}',
    to: '{"kind": "matches", "pattern": "\\\\b25(\\\\b"}',
  },
  {
    name: "a case is duplicated under an id that already exists",
    file: CHAT,
    from: '{"id": "chat-018"',
    to: '{"id": "chat-001"',
  },

  // ---- the runner's promises ---------------------------------------
  {
    name: "the runner stops refusing to run without a key",
    file: RUNNER,
    from: "  process.exit(2);",
    to: "  // continue anyway",
  },
  {
    name: "an unpriced model reports a confident zero cost",
    file: RUNNER,
    from: "  console.log(`\\n  COST NOT REPORTED: ${MODEL} is not in MODEL_PRICES, so per-token cost is unknown.`);",
    to: "  // priced at zero",
  },
  {
    name: "a quality regression no longer exits non-zero",
    file: RUNNER,
    from: "    process.exit(1);\n  }\n}",
    to: "  }\n}",
  },
];

let caught = 0;
const missed = [];

for (const m of MUTANTS) {
  const original = readFileSync(m.file, "utf8");
  const edits = m.edits ?? [{ from: m.from, to: m.to }];
  const stale = edits.find((e) => !original.includes(e.from));
  if (stale) {
    missed.push({ ...m, why: `the mutation target no longer exists in ${m.file}` });
    console.log(`  STALE   ${m.name}\n          anchor not found in ${m.file}`);
    continue;
  }
  let mutated = original;
  for (const e of edits) mutated = mutated.replace(e.from, e.to);
  if (mutated === original) {
    missed.push({ ...m, why: "the mutation left the file byte-identical — it is not a defect" });
    console.log(`  NO-OP   ${m.name}`);
    continue;
  }
  writeFileSync(m.file, mutated);
  // DECIDED BY THE EXIT CODE, never by grepping stdout for FAIL: a gate
  // that dies on a syntax error and prints nothing has still gone red.
  let failed = false;
  let detail = "";
  try {
    execFileSync("node", [GATE], { encoding: "utf8", stdio: "pipe" });
  } catch (e) {
    failed = true;
    const out = String(e.stdout || "") + String(e.stderr || "");
    detail = (out.split("\n").find((l) => l.includes("FAIL")) || out.split("\n")[0] || "").trim();
  } finally {
    writeFileSync(m.file, original);
  }
  if (failed) {
    caught++;
    console.log(`  CAUGHT  ${m.name}\n          ${detail.slice(0, 130)}`);
  } else {
    missed.push({ ...m, why: "the gate stayed green with the defect re-introduced" });
    console.log(`  MISSED  ${m.name}`);
  }
}

try {
  execFileSync("node", [GATE], { stdio: "pipe" });
} catch {
  console.log(`\nBASELINE IS RED (${GATE}) — a mutation was not restored. Check \`git diff\`.`);
  process.exit(1);
}
console.log("\nbaseline: the gate is green on the unmutated tree");
console.log(`\n${caught} of ${MUTANTS.length} mutations caught.`);
if (missed.length) {
  console.log("\nHOLES:");
  for (const m of missed) console.log(`  - ${m.name}\n    ${m.why}`);
  process.exit(1);
}
console.log("Every re-introduced defect turned the gate red.");
