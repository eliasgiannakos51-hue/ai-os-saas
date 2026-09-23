#!/usr/bin/env node
/*
 * WHAT MARGIN IS THIS DEPLOYMENT ACTUALLY APPLYING?
 *
 * Asked on 2026-09-23, because the answer everybody had was wrong in
 * both directions at once: the Vercel dashboard said
 * CREDIT_MARGIN_MULTIPLIER=2, which reads as "we have been charging
 * half" — and the code neither uses 2 nor uses the 4 it falls back to
 * for most settlements, because the PLAN margin is higher than both and
 * wins.
 *
 * So the question cannot be answered by reading one variable. It is a
 * max() over three sources, and this prints the whole table.
 *
 *   --env KEY=VALUE   ...as many as you like, to ask "what if".
 *   --json            the same numbers, for a gate to read.
 *
 * Run: node scripts/measure-margin.mjs
 */
import { loadTs } from "./tests/load-ts.mjs";

const args = process.argv.slice(2);
const asJson = args.includes("--json");
const env = {};
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--env" && args[i + 1]) {
    const [k, ...rest] = args[++i].split("=");
    env[k] = rest.join("=");
  }
}

const policy = await loadTs("src/lib/billing/margin-policy.ts");
const configMod = await loadTs("src/lib/billing/pricing-config.ts");
const plans = await loadTs("src/lib/billing/plans.ts");

const parsed = configMod.parsePricingConfig(env);
const config = parsed.config;

// EVERY SETTLEMENT FEATURE THE TREE NAMES, derived from the action map
// rather than typed here — a feature that stops being in it stops being
// measured, which is the failure this file would otherwise have.
const features = [...new Set(Object.values(policy.ACTION_TO_FEATURE))].sort();
const slugs = plans.PLANS.map((p) => p.slug);

const rows = [];
for (const feature of features) {
  for (const slug of slugs) {
    const r = policy.resolveMarginFor(feature, slug, config, env);
    rows.push({ feature, plan: slug, ...r });
  }
}

if (asJson) {
  console.log(
    JSON.stringify(
      {
        configured: env.CREDIT_MARGIN_MULTIPLIER ?? null,
        resolvedGeneral: config.marginMultiplier,
        warnings: parsed.warnings,
        planDefaults: policy.PLAN_MARGIN_DEFAULTS,
        min: configMod.MARGIN_MULTIPLIER_MIN,
        max: configMod.MARGIN_MULTIPLIER_MAX,
        rows,
      },
      null,
      1
    )
  );
  process.exit(0);
}

console.log("WHAT MARGIN IS APPLIED — read out of the code, with the env you gave it\n");

const configured = env.CREDIT_MARGIN_MULTIPLIER;
console.log(`  CREDIT_MARGIN_MULTIPLIER as given   ${configured === undefined ? "(not set)" : JSON.stringify(configured)}`);
console.log(`  ...as the code resolved it          ${config.marginMultiplier}`);
if (parsed.warnings.length > 0) {
  console.log("\n  AND IT WAS REFUSED:");
  for (const w of parsed.warnings) {
    console.log(`    ${w.variable}="${w.value}" — ${w.reason}`);
    console.log(`    -> the DEFAULT was used instead, not the value you set.`);
  }
  console.log(
    "\n  This warning is written once per process to the server log. Nobody\n" +
      "  reads a server log on a schedule, which is how a variable can say one\n" +
      "  thing for months while the code does another."
  );
}

console.log(`\n  the floor / ceiling on it           ${configMod.MARGIN_MULTIPLIER_MIN} / ${configMod.MARGIN_MULTIPLIER_MAX}`);
console.log(`  the per-plan defaults               ${JSON.stringify(policy.PLAN_MARGIN_DEFAULTS)}`);

console.log("\n== what each (feature, plan) actually settles at ==\n");
const width = Math.max(...features.map((f) => f.length)) + 2;
console.log("  " + "feature".padEnd(width) + slugs.map((s) => s.slice(0, 7).padStart(9)).join(""));
for (const feature of features) {
  const cells = slugs.map((slug) => {
    const r = rows.find((x) => x.feature === feature && x.plan === slug);
    return `${r.margin}${r.source === "general" ? "g" : r.source === "plan" ? "p" : "F"}`.padStart(9);
  });
  console.log("  " + feature.padEnd(width) + cells.join(""));
}
console.log("\n  g = the general multiplier  ·  p = the plan's  ·  F = a feature override");

const distinct = [...new Set(rows.map((r) => r.margin))].sort((a, b) => a - b);
const bySource = {};
for (const r of rows) bySource[r.source] = (bySource[r.source] ?? 0) + 1;

console.log(`\n== the answer ==\n`);
console.log(`  ${rows.length} (feature, plan) combinations`);
console.log(`  multipliers in use: ${distinct.join(", ")}`);
console.log(`  decided by: ${Object.entries(bySource).map(([k, v]) => `${k} ${v}`).join(", ")}`);
const generalWins = rows.filter((r) => r.source === "general").length;
console.log(
  `\n  THE GENERAL MULTIPLIER DECIDES ${generalWins} OF ${rows.length}.` +
    (generalWins === 0
      ? "\n  So CREDIT_MARGIN_MULTIPLIER is not what most settlements use at all —\n" +
        "  it is a floor under a max(), and the plan margin is above it everywhere."
      : "")
);
