// THE MONTHLY REFILL IS CLAIMED BEFORE IT RUNS, AND THE CLAIM IS NOT A
// MONTH ALONE.
//
// reset_monthly_credits SETS the balance to monthly + purchased. Called
// twice in one billing period it hands the customer back everything they
// spent in between — a Growth account down to 200 of 5,000 goes back to
// 5,000 — and Stripe delivers at least once by design. The ANNUAL path
// beside it (grantMonthlyPlanCredits) has had `plan_month:<user>:<month>`
// since it was written and calls the key "the whole safety property"; the
// MONTHLY path, where almost every paying customer is, had no key.
//
// Three properties, and the second is why the plan is in the key: a month
// alone would make an upgrade inside that month find the claim taken, skip
// the reset, and leave a customer who just paid for Growth on Starter's
// balance. That is a worse bug, and in the direction that costs the
// customer.
//
//   1. a redelivered event for the same plan and month does NOT reset
//   2. an upgrade inside the same month DOES reset
//   3. a reset that fails hands the claim back, so the retry can work
//
// Driven, not read: credits.ts is loaded with its database stood in, and
// the calls are counted.
//
// Run: node scripts/tests/plan-reset-idempotent.test.mjs
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadTs } from "./load-ts.mjs";

let pass = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { failures.push(name); console.log(`  FAIL  ${name}${detail === undefined ? "" : "\n        " + detail}`); }
}

// credits.ts whole, its imports stood in. The database is a recorder: it
// keeps the ledger rows that were claimed and counts the resets.
const src = readFileSync("src/lib/billing/credits.ts", "utf8");
const standIn = `
// The claims live ON the recorder, so starting a fresh scenario starts
// fresh claims. Held in a Set beside it, section 1's key survived into
// section 2 and the upgrade looked blocked when it was not.
globalThis.__db = { resets: [], inserts: [], deletes: [], failReset: false, claimed: new Set() };
const createAdminClient = () => ({
  from: (table) => ({
    insert: async (row) => {
      if (table !== "credit_transactions") return { error: null };
      globalThis.__db.inserts.push(row);
      const key = row.idempotency_key;
      if (key) {
        if (globalThis.__db.claimed.has(key)) return { error: { code: "23505", message: "duplicate key" } };
        globalThis.__db.claimed.add(key);
      }
      return { error: null };
    },
    delete: () => ({ eq: async (_col, value) => { globalThis.__db.deletes.push(value); globalThis.__db.claimed.delete(value); return { error: null }; } }),
    upsert: async () => ({ error: null }),
    update: () => ({ eq: async () => ({ error: null }) }),
    select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
  }),
  rpc: async (fn, args) => {
    if (fn === "reset_monthly_credits") {
      if (globalThis.__db.failReset) return { data: null, error: { code: "XX000", message: "reset blew up" } };
      globalThis.__db.resets.push(args);
    }
    return { data: null, error: null };
  },
});
const logApiError = () => {};
const diagLog = () => {};
const hasActiveBetaBypass = async () => false;
const isBetaTester = () => false;
const isAdminEmail = () => false;
const clearLegacyEntitlements = async () => {};
// Re-exported by credits.ts, so they must exist even though nothing here
// calls them.
const resolvePlanSlug = () => "free";
const resolvePlan = () => null;
// The real plan table: the amounts must be the product's, not invented
// here, or the gate would prove nothing about what a customer receives.
const PLAN_CREDITS = { free: 100, starter: 1000, growth: 5000, professional: 12000, ultimate: 30000 };
const getPlan = (slug) => (slug in PLAN_CREDITS ? { slug, name: slug, monthlyCredits: PLAN_CREDITS[slug] } : null);
const higherPlanSlug = (a) => a;
const annualMonthlyEquivalentEur = () => 0;
`;
// Both import shapes, and the second must be lazy and multi-line: this
// file's plan-table import spans eight lines, and a line-wise strip left
// its tail behind as a syntax error.
const runnable =
  standIn +
  "\n" +
  src
    .replace(/^import\s+"[^"]*";[ \t]*\r?\n/gm, "")
    .replace(/^import\s[\s\S]*?\sfrom\s+"[^"]*";[ \t]*\r?\n/gm, "");

const dir = mkdtempSync(join(tmpdir(), "plan-reset-"));
writeFileSync(join(dir, "credits.ts"), runnable);
const credits = await loadTs(join(dir, "credits.ts"));

const USER = "00000000-0000-4000-8000-000000000001";
const db = () => globalThis.__db;

console.log("== 1. a redelivered event for the same plan and month does not reset twice ==");
globalThis.__db = { resets: [], inserts: [], deletes: [], failReset: false, claimed: new Set() };
await credits.syncCreditsForPlan(USER, "growth", "invoice.paid");
const afterFirst = db().resets.length;
await credits.syncCreditsForPlan(USER, "growth", "invoice.paid");
check("the first delivery resets", afterFirst === 1, `resets=${afterFirst}`);
check("the second does not", db().resets.length === 1, `resets=${db().resets.length}`);
check("...and writes no second ledger row the customer can see",
  db().inserts.filter((r) => r.action_type === "plan_renewal").length === 2 && db().inserts.length === 2,
  `the duplicate insert is refused by the index, not retried: ${JSON.stringify(db().inserts.map((r) => r.idempotency_key))}`);
check("the claim names the plan and the month, not the event",
  /^plan_reset:[0-9a-f-]+:growth:\d{4}-\d{2}$/.test(String(db().inserts[0].idempotency_key)),
  String(db().inserts[0].idempotency_key));

console.log("\n== 2. an upgrade inside the same month still resets ==");
globalThis.__db = { resets: [], inserts: [], deletes: [], failReset: false, claimed: new Set() };
await credits.syncCreditsForPlan(USER, "starter", "invoice.paid");
await credits.syncCreditsForPlan(USER, "growth", "customer.subscription.updated");
check("both plans reset", db().resets.length === 2, `resets=${db().resets.length}`);
check("...and the second reset carries the new plan",
  db().resets[1]?.p_plan_tier === "growth", JSON.stringify(db().resets[1]));
check("a replay of the upgrade is still refused",
  await (async () => { await credits.syncCreditsForPlan(USER, "growth", "customer.subscription.updated"); return db().resets.length === 2; })(),
  `resets=${db().resets.length}`);

console.log("\n== 3. a reset that fails hands the claim back ==");
globalThis.__db = { resets: [], inserts: [], deletes: [], failReset: true, claimed: new Set() };
let threw = false;
await credits.syncCreditsForPlan(USER, "growth", "invoice.paid").catch(() => { threw = true; });
check("the failure is surfaced, not swallowed", threw);
check("...and the claim was released", db().deletes.length === 1, JSON.stringify(db().deletes));
globalThis.__db.failReset = false;
await credits.syncCreditsForPlan(USER, "growth", "invoice.paid");
check("so the retry works", db().resets.length === 1, `resets=${db().resets.length}`);

console.log(failures.length === 0 ? `\nALL PASS: ${pass} passed, 0 failed` : `\n${failures.length} FAILED, ${pass} passed`);
process.exit(failures.length === 0 ? 0 : 1);
