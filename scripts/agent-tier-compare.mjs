#!/usr/bin/env node
/*
 * THE SAME TASK AT ALL THREE AGENT TIERS, SIDE BY SIDE — V4.6.
 *
 * "Run the three packages on THE SAME task and show me the three answers
 * next to each other. I want to see whether the expensive one is worth
 * the difference." That is a question only real model calls can answer,
 * so this is deliberately NOT in scripts/tests/: it makes three billed
 * Anthropic calls (simple ≈ Haiku, standard ≈ Sonnet, deep ≈ Opus with
 * two research passes) and costs real money — on the order of $0.50 to
 * $2 depending on the task and on how much the research finds.
 *
 * Nothing is stubbed. It calls the real runAgentTask — the same function
 * api/agents/[id]/run and the scheduled runner use — with the real
 * CostAccumulator, so the cost column is the number the account would
 * have been charged before margin, and the credits column is what the
 * credit formula makes of it at the default margin.
 *
 * Usage:
 *   ANTHROPIC_API_KEY=sk-ant-... node scripts/agent-tier-compare.mjs "<task>"
 *   ANTHROPIC_API_KEY=sk-ant-... node scripts/agent-tier-compare.mjs "<task>" --no-search
 *   ANTHROPIC_API_KEY=sk-ant-... node scripts/agent-tier-compare.mjs "<task>" --lang Greek --out ./tiers-out
 *
 * Output: the three answers written as <out>/<tier>.md, and a table on
 * stdout: tier · model · research rounds · searches · words · real cost ·
 * credits · seconds.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const DRY_RUN = process.argv.includes("--dry-run");
const apiKey = process.env.ANTHROPIC_API_KEY ?? (DRY_RUN ? "sk-ant-dry-run" : undefined);
if (!apiKey) {
  console.error(
    "ANTHROPIC_API_KEY is not set.\n" +
      "This script makes three real, billed Anthropic calls (roughly $0.50-$2) — that is why\n" +
      "it is not part of the test suite. Set the key and run it again."
  );
  process.exit(2);
}
const argv = process.argv.slice(2);
const flag = (name) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : undefined);
const task = argv.find((a, i) => !a.startsWith("--") && (i === 0 || !argv[i - 1].startsWith("--")));
if (!task) {
  console.error('Give the task as the first argument, e.g. node scripts/agent-tier-compare.mjs "Weekly summary of EUR/USD and what moved it"');
  process.exit(2);
}
const outDir = path.resolve(flag("--out") ?? "tiers-out");
mkdirSync(outDir, { recursive: true });
const language = flag("--lang") ?? "English";
const needsWebSearch = !argv.includes("--no-search");

// Real module semantics for the whole graph — see scripts/lib/ts-loader.mjs
// for why the test bundler cannot load the provider layer.
const { register } = await import("node:module");
register("./lib/ts-loader.mjs", import.meta.url);
const runner = await import("../src/lib/agents/agent-runner.ts");
const { CostAccumulator } = await import("../src/lib/billing/cost-accumulator.ts");
const depths = await import("../src/lib/agents/agent-depth.ts");
const formula = await import("../src/lib/billing/credit-formula.ts");

if (DRY_RUN) {
  // --dry-run: prove the wiring (module loading, tier specs, the credit
  // formula) without spending anything. No model is called.
  console.log("DRY RUN — no model is called. The three tiers as the runner sees them:");
  for (const depth of depths.AGENT_DEPTHS) {
    const spec = depths.AGENT_DEPTH_SPECS[depth];
    console.log(`  ${depth.padEnd(9)} ${spec.model.padEnd(19)} research passes ${needsWebSearch ? spec.researchRounds : 0}, max searches ${spec.maxSearches}`);
  }
  console.log(`  e.g. a $0.10 real cost = ${formula.creditsForRealCostUsd(0.1)} credits at the default margin`);
  console.log(`  typeof runAgentTask: ${typeof runner.runAgentTask}`);
  process.exit(0);
}

const rows = [];
for (const depth of depths.AGENT_DEPTHS) {
  const spec = depths.AGENT_DEPTH_SPECS[depth];
  const costs = new CostAccumulator();
  const started = Date.now();
  console.log(`\n== ${depth} (${spec.model}, ${needsWebSearch ? spec.researchRounds : 0} research pass(es)) ==`);
  let outcome;
  try {
    outcome = await runner.runAgentTask({
      apiKey,
      prompt: task,
      config: { outputFormat: "markdown", language, needsWebSearch, depth },
      costs,
      depth,
    });
  } catch (e) {
    outcome = { ok: false, failure: { kind: "api_error", message: e?.message ?? String(e) } };
  }
  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  const totals = costs.totals();
  let credits = null;
  try {
    credits = formula.creditsForRealCostUsd(totals.usdCost);
  } catch {
    credits = null;
  }
  const text = outcome.ok ? outcome.output ?? "" : `FAILED (${outcome.failure.kind}): ${outcome.failure.message}`;
  writeFileSync(path.join(outDir, `${depth}.md`), `# ${depth} — ${spec.model}\n\nTask: ${task}\n\n${text}\n`);
  rows.push({
    depth,
    model: spec.model,
    rounds: needsWebSearch ? spec.researchRounds : 0,
    searches: outcome.ok ? outcome.searchCount ?? 0 : 0,
    words: text.split(/\s+/).filter(Boolean).length,
    usd: totals.usdCost.toFixed(4),
    credits: credits === null ? "—" : String(credits),
    seconds,
    ok: outcome.ok,
    stoppedAtBudget: outcome.ok ? outcome.stoppedAtBudget ?? null : null,
  });
  console.log(text.slice(0, 1200) + (text.length > 1200 ? "\n…" : ""));
}

console.log("\n== side by side ==");
console.log("  tier      model               rounds  searches  words   real $    credits  seconds  note");
for (const r of rows) {
  console.log(
    `  ${r.depth.padEnd(9)} ${r.model.padEnd(19)} ${String(r.rounds).padStart(6)}  ${String(r.searches).padStart(8)}  ${String(r.words).padStart(5)}   ${r.usd.padStart(7)}  ${String(r.credits).padStart(7)}  ${r.seconds.padStart(7)}  ${r.ok ? (r.stoppedAtBudget ? `stopped at budget: ${r.stoppedAtBudget}` : "") : "FAILED"}`
  );
}
console.log(`\nThe three answers are in ${outDir}/{simple,standard,deep}.md — open them side by side.`);
