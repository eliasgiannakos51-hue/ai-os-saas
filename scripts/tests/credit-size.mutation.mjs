#!/usr/bin/env node
/*
 * WOULD A CREDIT THAT CHANGED SIZE SOMEWHERE STILL PASS?
 *
 * Run: node scripts/tests/credit-size.mutation.mjs
 *
 * Each defect is an edit with a reason behind it — "reward our biggest
 * customers", "honour the pack they paid for", "Enterprise is a bulk
 * deal" — and each one makes the same action cost a different number of
 * credits for someone, or sells credits that earn below 4x when spent.
 * scripts/tests/credit-size.test.mjs must go red on the clause that names it.
 */
import { readFileSync } from "node:fs";
import { writeFileSync } from "./lib/sidecar-write.mjs";
import { execFileSync } from "node:child_process";

const GATE = "scripts/tests/credit-size.test.mjs";
const PLANS_FILE = "src/lib/billing/plans.ts";
const FORMULA = "src/lib/billing/credit-formula.ts";
const ADDONS_FILE = "src/lib/billing/addons.ts";
const WEBHOOK = "src/app/api/webhooks/stripe/route.ts";
const CHAT = "src/app/api/chat/route.ts";
const POLICY = "src/lib/billing/margin-policy.ts";

const MUTANTS = [
  {
    name: "Ultimate goes back to 25,000 credits — a bigger credit for the biggest plan",
    file: PLANS_FILE,
    from: "    price: 200,\n    monthlyCredits: 10000,",
    to: "    price: 200,\n    monthlyCredits: 25000,",
    expect: "ultimate      EUR 200 /",
  },
  {
    name: "the EUR 100 pack gets a 40% bonus",
    file: PLANS_FILE,
    from: '{ id: "credits_100", price: 100, credits: 5500 }',
    to: '{ id: "credits_100", price: 100, credits: 7000 }',
    expect: "pack credits_100",
  },
  {
    name: "the charge honours the pack rate again — a pack holder's credit is bigger",
    file: FORMULA,
    from: "  void purchasedPackPriceEur;\n  return effectiveCreditPriceEur(plan, config ?? resolvePricingConfig());",
    to: "  return revenuePerCreditEurForAccount(plan, purchasedPackPriceEur, config);",
    expect: "every plan x pack charges at EUR 0.02",
  },
  {
    name: "Enterprise prices at the cheapest published rate again",
    file: FORMULA,
    from: "    return c.creditPriceEur;\n  }\n  // Free (price 0)",
    to: "    return Math.min(c.creditPriceEur, cheapestPublishedCreditPriceEur(c));\n  }\n  // Free (price 0)",
    expect: "Enterprise, priced per deal",
  },
  {
    // THE SECOND DOOR: the add-on is not a pack, so a check over packs
    // alone passes it.
    name: "the credits add-on goes back to 1,000 for EUR 15",
    file: ADDONS_FILE,
    from: 'grants: { kind: "credits", amount: 750 }',
    to: 'grants: { kind: "credits", amount: 1_000 }',
    expect: "add-on credits_1000",
  },
  {
    name: "the add-on stops recording what its credits cost",
    file: WEBHOOK,
    from: "        await recordPackPurchaseRate(supabaseUserId, ADDONS[slug].priceEur / grants.amount);",
    to: "        void slug;",
    expect: "every paid credit grant in the webhook records its rate",
  },
  {
    name: "a route charges at what a credit brought in instead of the list price",
    file: CHAT,
    from: "      : effectiveCreditPriceEurForAccount(\n          plan,\n          await getPurchasedPackCreditPriceEur(user.id),",
    to: "      : revenuePerCreditEurForAccount(\n          plan,\n          await getPurchasedPackCreditPriceEur(user.id),",
    expect: "the revenue rate is read only by",
  },
  {
    // The cap is derived from the lowest plan margin: lower one plan to the
    // floor and every bonus above 0% stops earning 4x.
    name: "Growth's margin drops to the 4x floor under bonus packs",
    file: POLICY,
    from: "  growth: 5,",
    to: "  growth: 4,",
    expect: "pack credits_25",
  },
];

function runGate() {
  try {
    execFileSync(process.execPath, [GATE], { encoding: "utf8", stdio: "pipe", timeout: 300_000 });
    return { green: true, failed: [] };
  } catch (e) {
    const out = String(e.stdout ?? "") + String(e.stderr ?? "");
    return { green: false, failed: [...out.matchAll(/^ {2}FAIL {2}(.+)$/gm)].map((m) => m[1].trim()) };
  }
}

console.log("credit-size mutations\n");
const TARGETS = [...new Set(MUTANTS.map((m) => m.file))];
const originals = new Map(TARGETS.map((f) => [f, readFileSync(f, "utf8")]));
const restoreAll = () => { for (const [file, text] of originals) writeFileSync(file, text); };

let caught = 0;
const missed = [];
try {
  const baseline = runGate();
  if (!baseline.green) {
    console.log("BASELINE IS ALREADY RED — fix the gate before measuring it.");
    console.log(baseline.failed.map((f) => `  ${f}`).join("\n"));
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
    try { result = runGate(); } finally { restoreAll(); }
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
console.log(after.green ? "\nbaseline: the gate is green again on the restored tree" : "\nBASELINE IS RED — a mutation was not restored. Check `git diff`.");
console.log(`\n${caught} of ${MUTANTS.length} mutations caught.`);
if (missed.length > 0 || !after.green) {
  if (missed.length > 0) {
    console.log("\nHOLES:");
    for (const m of missed) console.log(`  - ${m.name}\n    ${m.why}`);
  }
  process.exit(1);
}
console.log("A credit that changes size somewhere goes red here first.");
