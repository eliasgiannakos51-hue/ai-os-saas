#!/usr/bin/env node
/*
 * CAN ionexa-payments.test.mjs SEE THE PAYMENTS SYSTEM'S PROTECTIONS
 * GO AWAY?
 *
 * Each mutation removes or breaks one piece of the system and expects
 * the named check to go red.
 *
 * Run: node scripts/tests/ionexa-payments.mutation.mjs
 */
import { runMutations } from "./lib/mutation-runner.mjs";

const GATE = "scripts/tests/ionexa-payments.test.mjs";

const CONNECT_ROUTE = "src/app/api/payments/connect/route.ts";
const PRODUCTS_ROUTE = "src/app/api/payments/products/route.ts";
const BALANCE_ROUTE = "src/app/api/payments/balance/route.ts";
const PAYOUT_ROUTE = "src/app/api/payments/payout/route.ts";
const CHECKOUT_ROUTE = "src/app/api/payments/checkout/route.ts";
const DASHBOARD_LINK_ROUTE = "src/app/api/payments/dashboard-link/route.ts";
const WEBHOOK = "src/app/api/webhooks/stripe/route.ts";
const PAY_PAGE = "src/app/pay/[productId]/page.tsx";
const PAY_API = "src/app/api/pay/[productId]/route.ts";
const CHECKOUT_LIB = "src/lib/payments/checkout.ts";
const MIGRATION = "supabase/migrations/20261125000000_ionexa_payments.sql";
const CANARIES = "src/lib/health/schema-canaries.ts";
const GDPR = "src/lib/gdpr/user-data-registry.ts";
const DASH_PAGE = "src/app/dashboard/payments/page.tsx";

const MUTANTS = [
  {
    name: "the switch check is removed from the connect route",
    file: CONNECT_ROUTE,
    from: 'const on = await isFeatureOn("ionexa-payments", user);',
    to: "const on = true;",
    expect: 'checks "ionexa-payments" switch',
  },
  {
    name: "the switch check is removed from the products route",
    file: PRODUCTS_ROUTE,
    from: 'const on = await isFeatureOn("ionexa-payments", user);',
    to: "const on = true;",
    expect: 'checks "ionexa-payments" switch',
  },
  {
    name: "the switch check is removed from the balance route",
    file: BALANCE_ROUTE,
    from: 'const on = await isFeatureOn("ionexa-payments", user);',
    to: "const on = true;",
    expect: 'checks "ionexa-payments" switch',
  },
  {
    name: "the switch check is removed from the payout route",
    file: PAYOUT_ROUTE,
    from: 'const on = await isFeatureOn("ionexa-payments", user);',
    to: "const on = true;",
    expect: 'checks "ionexa-payments" switch',
  },
  {
    name: "the switch check is removed from the checkout route",
    file: CHECKOUT_ROUTE,
    from: 'const on = await isFeatureOn("ionexa-payments", user);',
    to: "const on = true;",
    expect: 'checks "ionexa-payments" switch',
  },
  {
    name: "the switch check is removed from the dashboard-link route",
    file: DASHBOARD_LINK_ROUTE,
    from: 'const on = await isFeatureOn("ionexa-payments", user);',
    to: "const on = true;",
    expect: 'checks "ionexa-payments" switch',
  },
  {
    name: "the webhook stops handling ionexa payments",
    file: WEBHOOK,
    from: 'session.metadata?.platform === "ionexa_payments"',
    to: 'session.metadata?.platform === "REMOVED"',
    expect: "the webhook handles ionexa_payments metadata",
  },
  {
    name: "the public pay API stops rate-limiting per IP",
    file: PAY_API,
    from: "identifier: ip,",
    to: 'identifier: "fixed",',
    expect: "rate-limits per IP",
  },
  {
    name: "destination charges are removed",
    file: CHECKOUT_LIB,
    from: "application_fee_amount: platformFee,",
    to: "amount_NOT_fee: platformFee,",
    expect: "application_fee_amount on the checkout",
  },
  {
    name: "the RLS revoke is removed from the migration",
    file: MIGRATION,
    from: "REVOKE ALL ON public.payments_accounts FROM anon, authenticated;",
    to: "-- REVOKE removed",
    expect: "revokes all from anon and authenticated on all four",
  },
  {
    name: "the canary is removed",
    file: CANARIES,
    from: 'table: "payments_accounts",',
    to: 'table: "DELETED_payments_accounts",',
    expect: "payments_accounts has a canary",
  },
  {
    name: "the GDPR registry entry is removed",
    file: GDPR,
    from: 'table: "payments_accounts",',
    to: 'table: "DELETED_payments_accounts",',
    expect: "payments_accounts is registered",
  },
  {
    name: "the dashboard page stops checking the switch",
    file: DASH_PAGE,
    from: 'const on = await isFeatureOn("ionexa-payments", user);',
    to: "const on = true;",
    expect: "checks the switch",
  },
];

runMutations({
  name: "ionexa-payments",
  gate: GATE,
  targets: [
    CONNECT_ROUTE, PRODUCTS_ROUTE, BALANCE_ROUTE, PAYOUT_ROUTE,
    CHECKOUT_ROUTE, DASHBOARD_LINK_ROUTE, WEBHOOK, PAY_PAGE, PAY_API,
    CHECKOUT_LIB, MIGRATION, CANARIES, GDPR, DASH_PAGE,
  ],
  mutants: MUTANTS,
});
