#!/usr/bin/env node
/*
 * CAN annual-billing.test.mjs SEE A PLAN CHANGE THAT IS NOT PAID FOR?
 *
 * ΑΣ-4.3 (2026-10-05): an upgrade applied the bigger price at once and
 * left its invoice to be paid later, while the webhook reads the plan
 * from the price. The fix makes the upgrade a pending update and sends an
 * unpaid one to Stripe's invoice page. Each mutant below puts one half of
 * that back.
 *
 * Run: node scripts/tests/plan-payment.mutation.mjs
 */
import { runMutations } from "./lib/mutation-runner.mjs";

const GATE = "scripts/tests/annual-billing.test.mjs";
const CHECKOUT = "src/app/api/checkout/route.ts";

const MUTANTS = [
  {
    name: "the upgrade applies before it is paid again",
    file: CHECKOUT,
    from: '                payment_behavior: "pending_if_incomplete" as const,\n',
    to: "",
    expect: "an upgrade applies only once its invoice is paid",
  },
  {
    name: "an unpaid upgrade is reported as done",
    file: CHECKOUT,
    from: "          if (updated.pending_update) {",
    to: "          if (false && updated.pending_update) {",
    expect: "an unpaid upgrade sends the customer to pay",
  },
  {
    name: "the downgrade is invoiced and held like an upgrade",
    file: CHECKOUT,
    from: '                proration_behavior: "create_prorations" as const,',
    to: '                proration_behavior: "always_invoice" as const,',
    expect: "the downgrade, which costs nothing now, applies at once",
  },
];

runMutations({ name: "plan-payment", gate: GATE, targets: [CHECKOUT], mutants: MUTANTS });
