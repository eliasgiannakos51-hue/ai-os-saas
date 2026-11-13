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
 * ΑΣ-4.15 (2026-11-05): and a DOWNGRADE that hands back money for a plan
 * already used. The last two mutants put the immediate, prorated
 * downgrade back.
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
    from: '            payment_behavior: "pending_if_incomplete" as const,\n',
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
    // ΑΣ-4.15 (2026-11-05): the downgrade takes the upgrade's road again —
    // changed today, with the unused part of the higher plan credited.
    name: "the downgrade is applied at once like an upgrade",
    file: CHECKOUT,
    from: '          if (direction === "downgrade") {',
    to: '          if (direction === ("never" as string)) {',
    expect: "the downgrade waits for the end of the paid period",
  },
  {
    name: "the scheduled downgrade prorates at the switch",
    file: CHECKOUT,
    from: '              { end_behavior: "release", proration_behavior: "none", phases },',
    to: '              { end_behavior: "release", proration_behavior: "create_prorations", phases },',
    expect: "with no proration at the switch",
  },
];

runMutations({ name: "plan-payment", gate: GATE, targets: [CHECKOUT], mutants: MUTANTS });
