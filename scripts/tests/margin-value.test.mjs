#!/usr/bin/env node
/*
 * THE MARGIN'S VALUE, NOT ITS EXISTENCE.
 *
 * THE REPORT, 2026-09-23: "CREDIT_MARGIN_MULTIPLIER is 2, not 4 — for
 * months I have been charging half." Both halves of that sentence were
 * wrong, and the gates in this repository could not have told anybody:
 *
 *   billing-coverage.test.mjs asserts that the variable is DOCUMENTED,
 *   that an out-of-range value is FLAGGED, and that a complete
 *   environment reports nothing missing. Every one of those passes
 *   whatever number is actually in force. It is docs/shapes.md's
 *   "a wiring check that never sees a VALUE".
 *
 * So this file asks the question the other one does not: what number
 * comes out, for which feature, on which plan, and out of which source.
 *
 * WHAT WAS ACTUALLY TRUE, measured by scripts/measure-margin.mjs:
 *
 *   - "2" is outside the allowed range 4-10, so it is REFUSED and the
 *     default 4 is used. The margin was never 2.
 *   - and 4 is not what settles either: resolveMarginFor takes the
 *     max() of the general multiplier and the PLAN's, and every plan's
 *     default is higher. 150 of 150 (feature, plan) pairs settle at the
 *     plan margin — 6 on free, 5 on every paid plan.
 *
 * So the general multiplier decides NOTHING today. That is a fact worth
 * a gate of its own: the day somebody lowers a plan margin to 4, this
 * file is what says the general number started mattering.
 *
 * Run: node scripts/tests/margin-value.test.mjs
 */
import { readFileSync } from "node:fs";
import { loadTs } from "./load-ts.mjs";

let pass = 0;
const failures = [];
const check = (name, cond, detail) => {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    failures.push(name);
    console.log(`  FAIL  ${name}${detail !== undefined ? "\n        " + detail : ""}`);
  }
};

const config = await loadTs("src/lib/billing/pricing-config.ts");
const policy = await loadTs("src/lib/billing/margin-policy.ts");
const envCheck = await loadTs("src/lib/env-check.ts");

// ---------------------------------------------------------------------
console.log("== 1. the general multiplier is a VALUE, and the value is 4 ==");
// ---------------------------------------------------------------------
check(
  `the default is exactly 4 (${config.DEFAULTS.marginMultiplier})`,
  config.DEFAULTS.marginMultiplier === 4,
  String(config.DEFAULTS.marginMultiplier)
);
check(`the floor is exactly 4 (${config.MARGIN_MULTIPLIER_MIN})`, config.MARGIN_MULTIPLIER_MIN === 4);
check(`the ceiling is exactly 10 (${config.MARGIN_MULTIPLIER_MAX})`, config.MARGIN_MULTIPLIER_MAX === 10);

// THE TWO THE REPORT NAMED, asked of the code rather than of a comment.
for (const refused of ["2", "3"]) {
  const r = config.parsePricingConfig({ CREDIT_MARGIN_MULTIPLIER: refused });
  check(
    `CREDIT_MARGIN_MULTIPLIER=${refused} does NOT become the margin (${r.config.marginMultiplier})`,
    r.config.marginMultiplier === 4,
    String(r.config.marginMultiplier)
  );
  check(
    `...and it is REFUSED out loud, not clamped in silence`,
    r.warnings.some((w) => w.variable === "CREDIT_MARGIN_MULTIPLIER" && /outside the allowed range/.test(w.reason)),
    JSON.stringify(r.warnings)
  );
}
// ...and the other direction, so "it always returns 4" cannot pass this.
check(
  "a legal value IS taken (5 -> 5)",
  config.parsePricingConfig({ CREDIT_MARGIN_MULTIPLIER: "5" }).config.marginMultiplier === 5
);
check(
  "...and an over-range one is refused too (11 -> 4)",
  config.parsePricingConfig({ CREDIT_MARGIN_MULTIPLIER: "11" }).config.marginMultiplier === 4
);

// ---------------------------------------------------------------------
console.log("\n== 2. what every (feature, plan) actually settles at ==");
// ---------------------------------------------------------------------
// THE POPULATION, derived from the action map rather than listed here: a
// feature that joins the product is measured the day it does.
const features = [...new Set(Object.values(policy.ACTION_TO_FEATURE))].sort();
const plans = await loadTs("src/lib/billing/plans.ts");
const slugs = plans.PLANS.map((p) => p.slug);
check(`features were found to check (${features.length})`, features.length >= 20, "an empty list measures nothing");
check(`plans were found to check (${slugs.length})`, slugs.length === 6, slugs.join(", "));

const rows = [];
for (const feature of features) {
  for (const slug of slugs) {
    rows.push({ feature, slug, ...policy.resolveMarginFor(feature, slug, config.DEFAULTS, {}) });
  }
}

const belowFloor = rows.filter((r) => r.margin < config.MARGIN_MULTIPLIER_MIN);
check(
  `no combination settles below the business floor (${belowFloor.length})`,
  belowFloor.length === 0,
  belowFloor.map((r) => `${r.feature}/${r.slug}=${r.margin}`).join(", ")
);

// THE NUMBERS THEMSELVES, pinned. This is the clause the report needed
// and no gate had: not "a margin exists" but "it is 5, and on free 6".
const paid = rows.filter((r) => r.slug !== "free");
const free = rows.filter((r) => r.slug === "free");
check(
  `every paid plan settles at exactly 5 (${[...new Set(paid.map((r) => r.margin))].join(", ")})`,
  paid.every((r) => r.margin === 5),
  [...new Set(paid.map((r) => `${r.slug}:${r.margin}`))].join(", ")
);
check(
  `free settles at exactly 6 (${[...new Set(free.map((r) => r.margin))].join(", ")})`,
  free.every((r) => r.margin === 6),
  [...new Set(free.map((r) => r.margin))].join(", ")
);

// AND WHERE THE NUMBER COMES FROM, which is the part that makes the
// general multiplier's irrelevance visible rather than implied.
const bySource = {};
for (const r of rows) bySource[r.source] = (bySource[r.source] ?? 0) + 1;
check(
  `every combination is decided by the PLAN today (${JSON.stringify(bySource)})`,
  bySource.plan === rows.length,
  JSON.stringify(bySource) +
    " — if this moves to `general`, a plan margin was lowered to the floor and CREDIT_MARGIN_MULTIPLIER started mattering"
);

// ---------------------------------------------------------------------
console.log("\n== 3. a refused value reaches a SCREEN, not only a log ==");
// ---------------------------------------------------------------------
// THE REASON THE REPORT EXISTED. checkEnv flagged "2" from the day it
// was set. environmentWarnings — the only one of the two that reaches
// /dashboard/system-health — carried pair warnings and nothing else, so
// the refusal was written once per process to stderr and read by nobody.
{
  const warned = envCheck.environmentWarnings({ CREDIT_MARGIN_MULTIPLIER: "2" });
  const hit = warned.find((w) => w.key === "refused_value_credit_margin_multiplier");
  check("a refused margin appears in the warnings a screen renders", Boolean(hit), JSON.stringify(warned.map((w) => w.key)));
  check("...as critical, because it decides what a customer is charged", hit?.severity === "critical", hit?.severity);
  check(
    "...and it says the dashboard value is not the one in force",
    /NOT the value in force/.test(hit?.detail ?? ""),
    hit?.detail?.slice(0, 120)
  );
  check(
    "...and names the variable to go and change",
    (hit?.variables ?? []).includes("CREDIT_MARGIN_MULTIPLIER"),
    JSON.stringify(hit?.variables)
  );
  const clean = envCheck.environmentWarnings({ CREDIT_MARGIN_MULTIPLIER: "4" });
  check(
    "a legal value produces no such warning",
    !clean.some((w) => w.key.startsWith("refused_value_")),
    JSON.stringify(clean.map((w) => w.key))
  );
  // The same machinery must catch the OTHER money variable, which is the
  // one that already cost real margin once (USD_TO_EUR_RATE=0.80).
  const fx = envCheck.environmentWarnings({ USD_TO_EUR_RATE: "0.80" });
  check(
    "...and it is not special-cased to one variable",
    fx.some((w) => w.key === "refused_value_usd_to_eur_rate"),
    JSON.stringify(fx.map((w) => w.key))
  );
}

// ---------------------------------------------------------------------
console.log("\n== 4. the instrument that answers this is runnable ==");
// ---------------------------------------------------------------------
// A NUMBER IN A REPORT GOES STALE; A COMMAND DOES NOT. docs/ rules say a
// figure is either dated at the point of use or produced by the thing
// that prints it, and this is the thing that prints it.
{
  const src = readFileSync("scripts/measure-margin.mjs", "utf8");
  check("scripts/measure-margin.mjs exists", src.length > 500);
  check(
    "...and derives its features from the action map rather than a list",
    /Object\.values\(policy\.ACTION_TO_FEATURE\)/.test(src),
    "a typed list is a second copy that goes stale"
  );
  check("...and can be asked 'what if' with --env", /--env/.test(src));
  check("...and can be read by a machine with --json", /--json/.test(src));
}

console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${failures.length} failed`);
if (failures.length) {
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
