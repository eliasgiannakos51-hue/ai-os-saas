#!/usr/bin/env node
/*
 * CAN external-state-reversal.test.mjs SEE THE TWO STATES DISAGREE?
 *
 * Reversibility has been checked twice in this tree and both times inside
 * the database. Every mutant here leaves Postgres perfectly consistent
 * and puts the product at odds with Stripe, which is the half that keeps
 * charging a card.
 *
 *   1. an add-on removal goes back to marking the row cancelled after
 *      Stripe refused: the product stops delivering it and the card goes
 *      on paying.
 *   2. ...and the 404 exemption goes, which is the opposite trap — a row
 *      stuck active forever with nothing behind it.
 *   3. deleting an account stops cancelling the subscription.
 *   4. the cancellation moves after deleteUser, where the id it needs is
 *      already gone.
 *   5. a refused deletion keeps the single-use token spent, leaving
 *      somebody permanently unable to delete their account.
 *   6. a new route changes Stripe state and says nothing about which way
 *      it fails.
 *
 * Run: node scripts/tests/external-state-reversal.mutation.mjs
 */
import { runMutations } from "./lib/mutation-runner.mjs";

const GATE = "scripts/tests/external-state-reversal.test.mjs";
const ADDONS = "src/app/api/billing/addons/route.ts";
const DELETION = "src/app/api/delete-account/confirm/route.ts";

const MUTANTS = [
  {
    name: "an add-on is cancelled locally after Stripe refused to stop billing it",
    file: ADDONS,
    // ANCHORED ON THE REFUSAL'S OWN SENTENCE, not on `{ status: 502 }`.
    //
    // It was the bare status line until 2026-09-19, when that route grew
    // a SECOND 502 — the refusal for a recurring add-on whose
    // subscription item id could not be recovered. The new one is earlier
    // in the file, so a first-occurrence replace silently moved to it and
    // this mutant stopped reaching the clause it is named for: 5 of 6,
    // with the gate staying green on the path it was written about.
    // Two correct refusals in one handler is not a reason to have one
    // ambiguous anchor.
    from: '                "Could not stop the billing for this add-on, so it has been left active. Nothing has changed — please try again.",\n            },\n            { status: 502 }',
    to: '                "Could not stop the billing for this add-on, so it has been left active. Nothing has changed — please try again.",\n            },\n            { status: 200 }',
    expect: "returns before the row is marked cancelled",
  },
  {
    name: "an item Stripe says is already gone starts blocking the removal",
    file: ADDONS,
    from: 'const alreadyGone = code === "resource_missing" || status === 404;',
    to: "const alreadyGone = false; void code; void status;",
    expect: "already gone",
  },
  {
    name: "deleting an account stops cancelling the subscription",
    file: DELETION,
    from: "          await stripe.subscriptions.cancel(subscriptionId);",
    to: "          void subscriptionId;",
    expect: "cancels at Stripe",
  },
  {
    name: "the cancellation moves after the account is gone",
    file: DELETION,
    from: "    const { data: authUser } = await admin.auth.admin.getUserById(claimed.user_id);",
    to: "    await admin.auth.admin.deleteUser(claimed.user_id);\n    const { data: authUser } = await admin.auth.admin.getUserById(claimed.user_id);",
    expect: "before the auth user is deleted",
  },
  {
    name: "a refused deletion keeps the single-use token spent",
    file: DELETION,
    from: "          .update({ used_at: null })",
    to: "          .update({ used_at: new Date().toISOString() })",
    expect: "releases the link",
  },
  {
    name: "a route changes Stripe state without saying which way it fails",
    file: GATE,
    from: '  "src/app/api/billing/cancel/route.ts":',
    to: '  "src/app/api/billing/cancel/route.ts.unused":',
    expect: "says which way it fails",
  },
];

runMutations({
  name: "external-state-reversal",
  gate: GATE,
  targets: [ADDONS, DELETION, GATE],
  mutants: MUTANTS,
});
