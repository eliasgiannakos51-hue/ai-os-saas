// IONEXA PAYMENTS — the user's own payment platform (2026-11-11).
//
// Tests that the whole system hangs together: the migration creates the
// tables, the lib functions read/write them through createAdminClient,
// the routes check the switch and authenticate, the webhook records
// payments, the public pay page exists, and the feature catalog claims
// every route.
//
// Run: node scripts/tests/ionexa-payments.test.mjs
import { readFileSync, existsSync } from "node:fs";

let pass = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    failures.push(name);
    console.log(`  FAIL  ${name}${detail !== undefined ? `\n        ${detail}` : ""}`);
  }
}

const read = (f) => readFileSync(f, "utf8");

// --- 1. Migration ---
console.log("== 1. the migration ==");
const migrationFile = "supabase/migrations/20261125000000_ionexa_payments.sql";
check("the migration file exists", existsSync(migrationFile));
const migration = read(migrationFile);
check("creates payments_accounts", /CREATE TABLE.*payments_accounts/i.test(migration));
check("creates payments_products", /CREATE TABLE.*payments_products/i.test(migration));
check("creates payments_transactions", /CREATE TABLE.*payments_transactions/i.test(migration));
check("creates payments_payouts", /CREATE TABLE.*payments_payouts/i.test(migration));
check("enables RLS on all four", (migration.match(/ENABLE ROW LEVEL SECURITY/g) ?? []).length >= 4);
check("revokes all from anon and authenticated on all four",
  (migration.match(/REVOKE ALL.*FROM anon, authenticated/gi) ?? []).length >= 4);
check("has undo instructions", /How to undo/i.test(migration) || /DROP TABLE/i.test(migration));

// --- 2. Lib files ---
console.log("\n== 2. the lib files ==");
const libs = [
  "src/lib/payments/connect.ts",
  "src/lib/payments/products.ts",
  "src/lib/payments/checkout.ts",
  "src/lib/payments/balance.ts",
];
for (const f of libs) {
  check(`${f.split("/").pop()} exists`, existsSync(f));
  const src = read(f);
  check(`  ...imports createAdminClient`, /createAdminClient/.test(src));
  check(`  ...is server-only`, /server-only/.test(src) || /import "server-only"/.test(src));
}

// --- 3. Routes check the switch ---
console.log("\n== 3. the routes check the switch ==");
const routes = [
  "src/app/api/payments/connect/route.ts",
  "src/app/api/payments/products/route.ts",
  "src/app/api/payments/balance/route.ts",
  "src/app/api/payments/payout/route.ts",
  "src/app/api/payments/checkout/route.ts",
  "src/app/api/payments/dashboard-link/route.ts",
];
for (const f of routes) {
  check(`${f.replace("src/app/api/", "")} exists`, existsSync(f));
  const src = read(f);
  check(`  ...checks "ionexa-payments" switch`, /isFeatureOn\("ionexa-payments"/.test(src));
  check(`  ...authenticates`, /auth\.getUser\(\)/.test(src));
}

// --- 4. Public pay page ---
console.log("\n== 4. the public pay page ==");
const payPage = "src/app/pay/[productId]/page.tsx";
check("the public pay page exists", existsSync(payPage));
const payPageSrc = read(payPage);
check("  ...reads the product from the database", /payments_products/.test(payPageSrc));
check("  ...checks is_active", /is_active.*true/.test(payPageSrc));
check("  ...checks charges_enabled", /charges_enabled/.test(payPageSrc));
check("  ...shows the price", /price_cents/.test(payPageSrc));

const payApi = "src/app/api/pay/[productId]/route.ts";
check("the public pay API exists", existsSync(payApi));
const payApiSrc = read(payApi);
check("  ...creates a checkout", /createPaymentCheckout/.test(payApiSrc));
check("  ...rate-limits per IP", /identifier:\s*ip/.test(payApiSrc));
check("  ...redirects to Stripe", /redirect/.test(payApiSrc));

// --- 5. Webhook ---
console.log("\n== 5. the webhook handles payments ==");
const webhook = read("src/app/api/webhooks/stripe/route.ts");
check("the webhook handles ionexa_payments metadata", /ionexa_payments/.test(webhook));
check("  ...calls recordPayment", /recordPayment/.test(webhook));
check("  ...reads ionexa_user_id", /ionexa_user_id/.test(webhook));
check("  ...reads ionexa_product_id", /ionexa_product_id/.test(webhook));
check("  ...reads ionexa_account_id", /ionexa_account_id/.test(webhook));

// --- 6. Feature flag ---
console.log("\n== 6. the feature flag ==");
const flags = read("src/lib/flags/flags.ts");
check("the 'ionexa-payments' flag exists", /\"ionexa-payments\"/.test(flags));

// --- 7. Schema canary ---
console.log("\n== 7. the schema canary ==");
const canaries = read("src/lib/health/schema-canaries.ts");
check("payments_accounts has a canary", /payments_accounts/.test(canaries));

// --- 8. GDPR registry ---
console.log("\n== 8. GDPR registry ==");
const gdpr = read("src/lib/gdpr/user-data-registry.ts");
check("payments_accounts is registered", /payments_accounts/.test(gdpr));
check("payments_products is registered", /payments_products/.test(gdpr));
check("payments_transactions is registered", /payments_transactions/.test(gdpr));
check("payments_payouts is registered", /payments_payouts/.test(gdpr));

// --- 9. Security ---
console.log("\n== 9. security posture ==");
const connect = read("src/lib/payments/connect.ts");
check("the platform fee is declared as a constant", /PLATFORM_FEE_PERCENT/.test(read("src/lib/payments/products.ts")));
check("destination charges, not direct", /transfer_data/.test(read("src/lib/payments/checkout.ts")));
check("application_fee_amount on the checkout", /application_fee_amount/.test(read("src/lib/payments/checkout.ts")));
check("payouts_enabled is Stripe's flag, never ours", /payouts_enabled.*Stripe/i.test(connect) || /PAYOUTS_ENABLED IS STRIPE/i.test(connect));

// --- 10. i18n ---
console.log("\n== 10. i18n ==");
const en = JSON.parse(read("messages/en.json"));
check("en.json has payments section", Boolean(en.payments));
check("  ...with connect keys", Boolean(en.payments?.connect?.button));
check("  ...with products keys", Boolean(en.payments?.products?.create));
check("  ...with transactions keys", Boolean(en.payments?.transactions?.title));
check("  ...with payouts keys", Boolean(en.payments?.payouts?.cashout));
check("  ...with error keys", Boolean(en.payments?.errors?.notConfigured));
const el = JSON.parse(read("messages/el.json"));
check("el.json has payments section", Boolean(el.payments));
check("  ...translated (not English)", el.payments?.title !== en.payments?.title);

// --- 11. The page ---
console.log("\n== 11. the dashboard page ==");
const dashPage = "src/app/dashboard/payments/page.tsx";
check("the dashboard page exists", existsSync(dashPage));
const dashSrc = read(dashPage);
check("  ...checks the switch", /isFeatureOn\("ionexa-payments"/.test(dashSrc));
check("  ...uses notFound for non-flagged users", /notFound/.test(dashSrc));

// --- summary ---
console.log(`\n== summary ==\n${pass} passed, ${failures.length} failed`);
if (failures.length) {
  console.log("\nFAILED:");
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
