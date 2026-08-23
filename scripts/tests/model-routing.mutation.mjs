#!/usr/bin/env node
/*
 * CAN THE ROUTING GATES GO RED?
 *
 * Every defect below saves money on a dashboard and costs it in reality,
 * or costs quality nobody measured.
 *
 *   A DOWNGRADE THAT COSTS MORE. Haiku needs 4,096 tokens of prefix to
 *   cache; Sonnet needs 1,024. Between those two numbers the "cheaper"
 *   model bills 3.3x as much for the prefix, on every call, while the
 *   per-token rate went down and every report says the change worked.
 *
 *   AN UNDER-ROUTED REQUEST. A bad answer the user paid for, against a
 *   fraction of a cent saved.
 *
 *   AN ESCALATION THE USER PAYS FOR TWICE, or one that launders a
 *   refusal into a different answer.
 *
 *   A ROUTER THAT OSCILLATES on two data points.
 *
 * Run: node scripts/tests/model-routing.mutation.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const GATE = "scripts/tests/model-routing.test.mjs";
const ROUTE = "src/lib/ai/routing/route.ts";
const CLASSIFY = "src/lib/ai/routing/classify.ts";
const TIERS = "src/lib/ai/routing/tiers.ts";
const CACHE = "src/lib/ai/providers/cache-policy.ts";

const MUTANTS = [
  // ---- the cache trap ----------------------------------------------
  {
    name: "the cache-minimum guard is removed, so a 2000-token prefix goes to haiku at 3.3x the cost",
    file: ROUTE,
    from: "    if (cheap !== null && reference !== null && cheap >= reference) {",
    to: "    if (false) {",
  },
  {
    name: "the guard compares the wrong way, so it only fires when the downgrade IS cheaper",
    file: ROUTE,
    from: "    if (cheap !== null && reference !== null && cheap >= reference) {",
    to: "    if (cheap !== null && reference !== null && cheap <= reference) {",
  },
  {
    name: "the prefix is ignored, so the cache minimum can never apply",
    file: ROUTE,
    from: "  const prefixTokens = input.prefixTokens ?? 0;",
    to: "  const prefixTokens = 0;",
  },
  {
    name: "a model's cache minimum is read as zero, so everything looks cached",
    file: CACHE,
    from: "  return model.cacheMinimumTokens;",
    to: "  return model.cacheMinimumTokens === null ? null : 0;",
  },
  {
    name: "the decision stops carrying the prefix it was made against",
    file: ROUTE,
    from: "    prefixTokens,\n    needsClassifier: classification.needsClassifier,",
    to: "    prefixTokens: 0,\n    needsClassifier: classification.needsClassifier,",
  },

  // ---- under-routing -----------------------------------------------
  {
    name: "an unknown feature defaults to trivial, silently cutting quality on whatever ships next",
    file: CLASSIFY,
    from: '  return { tier: "complex", rule: "default:unknown-feature", needsClassifier: true };',
    to: '  return { tier: "trivial", rule: "default:unknown-feature", needsClassifier: true };',
  },
  {
    name: "unattended work may run trivial, so nobody reads the bad answer",
    file: CLASSIFY,
    from: '  if (input.unattended && (byFeature === "trivial" || byFeature === "simple")) {',
    to: "  if (false) {",
  },
  {
    name: "the unattended floor drags an expert feature DOWN to complex",
    file: CLASSIFY,
    from: '  if (input.unattended && (byFeature === "trivial" || byFeature === "simple")) {',
    to: "  if (input.unattended) {",
  },
  {
    name: "a huge prefix no longer forces a stronger model",
    file: CLASSIFY,
    from: "  if ((input.systemTokens ?? 0) >= HUGE_PREFIX_TOKENS) {",
    to: "  if (false) {",
  },
  {
    name: "long user text no longer forces a stronger model",
    file: CLASSIFY,
    from: "  if (text.length >= LONG_TEXT_CHARS) {",
    to: "  if (false) {",
  },
  {
    name: "the large-prefix rule demotes an expert feature to complex",
    file: CLASSIFY,
    from: '    return { tier: byFeature === "expert" ? "expert" : "complex", rule: "prefix:large", needsClassifier: false };',
    to: '    return { tier: "complex", rule: "prefix:large", needsClassifier: false };',
  },
  {
    name: "structured output no longer lifts the floor, so malformed JSON costs a second call",
    file: CLASSIFY,
    from: '    if (input.structured && byFeature === "trivial") {',
    to: "    if (false) {",
  },
  {
    name: "a rule stops naming itself, so no routing decision can be explained",
    file: CLASSIFY,
    from: '    return { tier: byFeature, rule: `feature:${input.feature}`, needsClassifier: false };',
    to: '    return { tier: byFeature, rule: "", needsClassifier: false };',
  },

  // ---- escalation ---------------------------------------------------
  {
    name: "a safety refusal escalates, shopping for a different answer on a stronger model",
    file: TIERS,
    from: "export function canEscalate(reason: string): reason is EscalationReason {\n  return (ESCALATABLE as readonly string[]).includes(reason);",
    to: "export function canEscalate(reason: string): reason is EscalationReason {\n  return true;",
  },
  {
    name: "escalation skips to the top rung on any failure",
    file: TIERS,
    from: "  return LADDER[i + 1];",
    to: "  return LADDER[LADDER.length - 1];",
  },
  {
    name: "the attempt cap is dropped, so one request can walk the whole ladder",
    file: ROUTE,
    from: "  if (params.attempts >= maxAttempts) {",
    to: "  if (false) {",
  },

  // ---- who pays ------------------------------------------------------
  {
    name: "the user is charged for the failed cheap attempt as well as the one that worked",
    file: ROUTE,
    from: "    chargeUsd: winner ? winner.costUsd : 0,",
    to: "    chargeUsd: attempts.reduce((sum, a) => sum + a.costUsd, 0),",
  },
  {
    name: "a wholly failed request still charges the user",
    file: ROUTE,
    from: "    chargeUsd: winner ? winner.costUsd : 0,",
    to: "    chargeUsd: attempts[attempts.length - 1]?.costUsd ?? 0,",
  },
  {
    name: "what we absorbed stops being counted, so the dashboard cannot show the real saving",
    file: ROUTE,
    from: "  const absorbedUsd = attempts.filter((a) => !a.succeeded).reduce((sum, a) => sum + a.costUsd, 0);",
    to: "  const absorbedUsd = 0;",
  },

  // ---- learning ------------------------------------------------------
  {
    name: "the router reacts to two data points and oscillates",
    file: ROUTE,
    from: "    if (rate === undefined || samples < minSamples || rate >= minRate) break;",
    to: "    if (rate === undefined || rate >= minRate) break;",
  },
  {
    name: "the router climbs on GOOD success rates, so everything ends up on the top model",
    file: ROUTE,
    from: "    if (rate === undefined || samples < minSamples || rate >= minRate) break;",
    to: "    if (rate === undefined || samples < minSamples) break;",
  },
  {
    name: "learning loops forever instead of stopping at the top",
    file: ROUTE,
    from: "  for (let hop = 0; hop < 3; hop++) {",
    to: "  for (let hop = 0; hop < 0; hop++) {",
  },

  // ---- one cost model -------------------------------------------------
  {
    name: "the router re-implements the cache ratio instead of delegating",
    file: ROUTE,
    from: "export function routeInputCostUsd(modelId: string | undefined, tokens: number): number | null {\n  return prefixInputCostUsd(modelId, tokens);",
    to: "export function routeInputCostUsd(modelId: string | undefined, tokens: number): number | null {\n  void prefixInputCostUsd;\n  return tokens * 0.1;",
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
