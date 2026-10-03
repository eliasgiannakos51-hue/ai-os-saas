#!/usr/bin/env node
/*
 * ONE CREDIT, ONE SIZE — the owner's decision of 2026-10-03, held.
 *
 * Run: node scripts/tests/credit-size.test.mjs
 *
 * Until that day the same website cost 187 credits on Ultimate and 75 on
 * Starter, because every plan sold a credit at a different price and the
 * charge divided by it. The decision: a credit is EUR 0.02 everywhere, an
 * action costs the same number of credits on every plan, and a bigger
 * purchase is cheaper the honest way — MORE credits for the money, never
 * a bigger credit — with the discount capped so that bonus credits still
 * earn 4x when spent.
 *
 * Four things are held here, each over its whole population:
 *
 *   1  every published plan sells a credit at the list price
 *      (lib/billing/plans.ts, PLANS)
 *   2  the charge divides by the list price for every account, whatever
 *      plan or pack it holds (effectiveCreditPriceEurForAccount)
 *   3  every way of buying credits for money — the packs AND the credits
 *      add-on — keeps its bonus under the cap, so its credits earn >= 4x
 *      at the lowest margin any plan resolves to
 *   4  the same action is the same number of credits on every paid plan,
 *      with or without a pack, through the estimator the screens use
 */
import { readFileSync } from "node:fs";
import { loadTs } from "./load-ts.mjs";
import { stripComments } from "../check-mutation-markers.mjs";

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

const { PLANS, CREDIT_PACKS } = await loadTs("src/lib/billing/plans.ts");
const { ADDONS } = await loadTs("src/lib/billing/addons.ts");
const formula = await loadTs("src/lib/billing/credit-formula.ts");
const { DEFAULTS } = await loadTs("src/lib/billing/pricing-config.ts");
const { resolveMarginFor, PLAN_MARGIN_DEFAULTS } = await loadTs("src/lib/billing/margin-policy.ts");
const est = await loadTs("src/lib/billing/estimate.ts");

const LIST = DEFAULTS.creditPriceEur;
const eq = (a, b) => Math.abs(a - b) < 1e-12;

console.log("== 1. every published plan sells a credit at the list price ==");
check(`the list price is EUR 0.02`, LIST === 0.02, String(LIST));
const priced = PLANS.filter((p) => typeof p.price === "number" && p.price > 0);
check(`there are paid plans to hold (${priced.length})`, priced.length >= 4);
for (const plan of priced) {
  const rate = plan.price / plan.monthlyCredits;
  check(
    `${plan.slug.padEnd(13)} EUR ${plan.price} / ${plan.monthlyCredits} credits = EUR ${rate.toFixed(4)}`,
    eq(rate, LIST),
    `a plan off the list price makes its credit a different size from everyone else's`
  );
}
// The owner's own numbers, written down where a reader looks for them.
const ultimate = PLANS.find((p) => p.slug === "ultimate");
check("Ultimate is 10,000 credits for EUR 200", ultimate.monthlyCredits === 10_000 && ultimate.price === 200);

console.log("\n== 2. the charge divides by the list price for every account ==");
const PACK_RATES = [
  null,
  undefined,
  ...CREDIT_PACKS.map((p) => p.price / p.credits),
  // Packs sold before 2026-10-03, honoured as they are: still one size.
  25 / 1500,
  50 / 3500,
  100 / 8000,
];
let accounts = 0;
const offList = [];
for (const plan of [...PLANS, null, undefined]) {
  for (const pack of PACK_RATES) {
    accounts++;
    const rate = formula.effectiveCreditPriceEurForAccount(plan, pack, DEFAULTS);
    if (!eq(rate, LIST)) offList.push(`${plan?.slug ?? String(plan)} + ${pack}: ${rate}`);
  }
}
check(`every plan x pack charges at EUR ${LIST} (${accounts} accounts)`, offList.length === 0, offList.slice(0, 4).join(" · "));
check(
  "Enterprise, priced per deal, charges at list too — not at the cheapest (annual) rate",
  eq(formula.effectiveCreditPriceEur(PLANS.find((p) => p.slug === "enterprise"), DEFAULTS), LIST) &&
    formula.cheapestPublishedCreditPriceEur(DEFAULTS) < LIST
);
// What a credit BROUGHT IN still sees the pack — that is where a margin
// is measured, and where the honoured old packs show up.
check(
  "...while what a credit brought in still sees the pack",
  eq(formula.revenuePerCreditEurForAccount(PLANS[1], 100 / 8000, DEFAULTS), 100 / 8000) &&
    eq(formula.revenuePerCreditEurForAccount(PLANS[1], null, DEFAULTS), LIST)
);
// No route charges at the revenue rate. The population is every source
// file: the one place it may be read for money is settlement's margin.
{
  // A directory walk, not `git ls-files`: the build runs where there is
  // no worktree (scripts/tests/no-worktree.test.mjs).
  const { readdirSync } = await import("node:fs");
  const files = readdirSync("src", { recursive: true })
    .map((f) => `src/${String(f).replace(/\\/g, "/")}`)
    .filter((f) => /\.(ts|tsx)$/.test(f));
  const readers = files.filter((f) =>
    /revenuePerCreditEurForAccount\(/.test(stripComments(readFileSync(f, "utf8")))
  );
  check(
    "the revenue rate is read only by the formula and by settlement's margin",
    readers.length === 2 &&
      readers.includes("src/lib/billing/credit-formula.ts") &&
      readers.includes("src/lib/billing/reservations.ts"),
    readers.join(", ")
  );
}

console.log("\n== 3. every way of buying credits keeps its bonus under the cap ==");
// The lowest margin any plan resolves to at the shipped defaults: the
// multiplier a bonus credit is spent at in the worst case.
const minPlanMargin = Math.min(...PLANS.map((p) => resolveMarginFor(null, p.slug, DEFAULTS, {}).margin));
check(`the lowest plan margin is ${minPlanMargin}x`, minPlanMargin === Math.min(...Object.values(PLAN_MARGIN_DEFAULTS)));
const BONUS_CAP = minPlanMargin / 4 - 1; // 5x / 4x - 1 = 25%
console.log(`        bonus cap: ${(BONUS_CAP * 100).toFixed(0)}%  (spent at ${minPlanMargin}x, a credit bought at a ${(BONUS_CAP * 100).toFixed(0)}% bonus earns exactly 4x)`);
const SOURCES = [
  ...CREDIT_PACKS.map((p) => ({ name: `pack ${p.id}`, price: p.price, credits: p.credits })),
  ...Object.values(ADDONS)
    .filter((a) => a.grants.kind === "credits")
    .map((a) => ({ name: `add-on ${a.slug}`, price: a.priceEur, credits: a.grants.amount })),
];
check(`there are credit sources to hold (${SOURCES.length})`, SOURCES.length >= 5 && SOURCES.some((s) => s.name.startsWith("add-on")));
for (const s of SOURCES) {
  const atList = s.price / LIST;
  const bonus = s.credits / atList - 1;
  const real = (minPlanMargin * (s.price / s.credits)) / LIST;
  check(
    `${s.name.padEnd(22)} EUR ${String(s.price).padStart(3)} = ${String(s.credits).padStart(5)} credits  bonus ${(bonus * 100).toFixed(1).padStart(5)}%  ${real.toFixed(2)}x`,
    Number.isInteger(s.credits) && bonus >= -1e-9 && bonus <= BONUS_CAP + 1e-9 && real >= 4 - 1e-9,
    `a bonus over ${(BONUS_CAP * 100).toFixed(0)}% earns below 4x when the credits are spent`
  );
}
{
  const byPrice = [...CREDIT_PACKS].sort((a, b) => a.price - b.price);
  const bonuses = byPrice.map((p) => p.credits / (p.price / LIST) - 1);
  check(
    `a bigger pack never gives a smaller bonus (${bonuses.map((b) => `${(b * 100).toFixed(0)}%`).join(" / ")})`,
    bonuses.every((b, i) => i === 0 || b >= bonuses[i - 1] - 1e-9)
  );
}
// The rate of every credits purchase reaches the margin: one recorder per
// paid grant in the webhook, so a source the margin cannot see cannot be
// added without this going red.
{
  const hook = stripComments(readFileSync("src/app/api/webhooks/stripe/route.ts", "utf8"));
  const paidGrants = (hook.match(/grantCredits\([^;]*?"purchase"/g) ?? []).length;
  const recorders = (hook.match(/await recordPackPurchaseRate\(/g) ?? []).length;
  check(
    `every paid credit grant in the webhook records its rate (${paidGrants} grants, ${recorders} recorders)`,
    paidGrants >= 2 && recorders === paidGrants
  );
}

console.log("\n== 4. the same action is the same number of credits on every paid plan ==");
// Through the estimator the screens and the reservation both use, with the
// rate the routes hand it (effectiveCreditPriceEurForAccount).
// EVERY action the estimator knows, not a sample: "the same action" is a
// claim about all of them.
const ACTIONS = Object.keys(est.ACTION_PROFILES);
check(`there are actions to compare (${ACTIONS.length})`, ACTIONS.length >= 20);
const paidSlugs = PLANS.filter((p) => p.slug !== "free").map((p) => p.slug);
for (const action of ACTIONS) {
  const seen = new Map();
  for (const slug of paidSlugs) {
    const plan = PLANS.find((p) => p.slug === slug);
    for (const pack of [null, ...CREDIT_PACKS.map((p) => p.price / p.credits)]) {
      const rate = formula.effectiveCreditPriceEurForAccount(plan, pack, DEFAULTS);
      const e = est.estimateForAction(action, { model: "claude-sonnet-4-6", inputChars: 400, planSlug: slug }, DEFAULTS, rate);
      seen.set(`${slug}${pack ? `+${pack.toFixed(5)}` : ""}`, e.estimatedCredits);
    }
  }
  const values = [...new Set(seen.values())];
  check(
    `${action.padEnd(16)} ${values.join(" / ")} credits on ${seen.size} plan x pack combinations`,
    values.length === 1,
    [...seen].map(([k, v]) => `${k} ${v}`).join(", ")
  );
}

console.log(failures.length ? `\nFAILURES: ${pass} passed, ${failures.length} failed` : `\nALL PASS: ${pass} passed, 0 failed`);
process.exitCode = failures.length === 0 ? 0 : 1;
