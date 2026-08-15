// Which Stripe events may rewrite a credit balance.
//
// THE DEFECT, MEASURED BEFORE IT WAS FIXED.
//
// api/webhooks/stripe called syncCreditsForPlan() on every event it
// handled, including customer.subscription.updated. That function upserts
// `credits_remaining = plan.monthlyCredits` unconditionally, while credit
// PACKS increment the same column above that number
// (grant_credits_idempotent adds; it does not clamp).
//
// So on a Growth account (3,000/month) that had bought a 5,000-credit
// pack and stood at 7,400:
//
//     stripe.subscriptions.update(id, { cancel_at_period_end: true })
//       -> customer.subscription.updated
//       -> syncSubscriptionToUser  (status still "active", tier unchanged)
//       -> syncCreditsForPlan(user, "growth")
//       -> upsert credits_remaining = 3000
//
// 4,400 paid-for credits gone, from an event the user triggered by
// pressing Cancel. Stripe fires the same event for a card update, a
// coupon, and adding a team seat.
//
// The reverse leak is the same line: an account at 150 of 3,000 could
// restore a full month by touching anything on the subscription.
//
// Run: node scripts/tests/subscription-sync.test.mjs
import { readFileSync } from "node:fs";

let pass = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    failures.push(name);
    console.log(`  FAIL  ${name}${detail ? "\n        " + detail : ""}`);
  }
}

const { loadTs } = await import("./load-ts.mjs");
const { creditSyncDecision } = await loadTs("src/lib/billing/subscription-sync.ts");

const TIERS = ["free", "starter", "growth", "professional", "ultimate", "enterprise"];
// Every event the webhook's switch handles, plus two Stripe fires that it
// does not handle today — a decision function that only knows the current
// switch is one new `case` away from being wrong again.
const EVENTS = [
  "invoice.paid",
  "checkout.session.completed",
  "customer.subscription.deleted",
  "customer.subscription.updated",
  "customer.subscription.paused",
  "customer.subscription.resumed",
];

console.log("== 1. cross-product: every event against every tier pair ==");
// 6 events x 7 previous (6 tiers + null) x 6 next = 252 combinations.
// Not a sample: the bug lived in ONE of them (updated + same tier), which
// is exactly the cell a spot check omits.
let combos = 0;
const wrong = [];
for (const eventType of EVENTS) {
  for (const previousTier of [...TIERS, null]) {
    for (const nextTier of TIERS) {
      combos++;
      const actual = creditSyncDecision({ eventType, previousTier, nextTier });
      const expected =
        eventType === "invoice.paid" ||
        eventType === "checkout.session.completed" ||
        eventType === "customer.subscription.deleted" ||
        previousTier === null ||
        previousTier !== nextTier
          ? "reset"
          : "skip";
      if (actual !== expected) {
        wrong.push(`${eventType} ${previousTier}->${nextTier}: ${actual} (expected ${expected})`);
      }
    }
  }
}
check(`all ${combos} combinations decided correctly`, wrong.length === 0, wrong.slice(0, 5).join("\n        "));

console.log("\n== 2. the exact case that destroyed paid credits ==");
// Pressing Cancel sets cancel_at_period_end, which fires
// customer.subscription.updated with the status and the tier unchanged.
for (const tier of TIERS) {
  check(
    `cancel_at_period_end on ${tier} does not touch the balance`,
    creditSyncDecision({
      eventType: "customer.subscription.updated",
      previousTier: tier,
      nextTier: tier,
    }) === "skip"
  );
}
// Same event, same shape, but the plan really changed: the allowance is
// different, so the balance has to follow it.
check(
  "an upgrade through the same event still resets",
  creditSyncDecision({
    eventType: "customer.subscription.updated",
    previousTier: "starter",
    nextTier: "growth",
  }) === "reset"
);
check(
  "and so does a downgrade",
  creditSyncDecision({
    eventType: "customer.subscription.updated",
    previousTier: "ultimate",
    nextTier: "starter",
  }) === "reset"
);

console.log("\n== 3. the events that MUST still reset ==");
check(
  "a paid invoice opens a new month",
  creditSyncDecision({ eventType: "invoice.paid", previousTier: "growth", nextTier: "growth" }) === "reset"
);
check(
  "a new subscription starts from the plan's allotment",
  creditSyncDecision({
    eventType: "checkout.session.completed",
    previousTier: "free",
    nextTier: "growth",
  }) === "reset"
);
check(
  "a deleted subscription drops to Free's allotment",
  creditSyncDecision({
    eventType: "customer.subscription.deleted",
    previousTier: "growth",
    nextTier: "free",
  }) === "reset"
);
check(
  "an account with no recorded tier is initialised, not skipped",
  creditSyncDecision({
    eventType: "customer.subscription.updated",
    previousTier: null,
    nextTier: "growth",
  }) === "reset"
);

console.log("\n== 4. the webhook actually consults it ==");
// A pure function nobody calls fixes nothing. This is the half a unit
// test of the function cannot see, and it is where the bug lived.
const webhook = readFileSync("src/app/api/webhooks/stripe/route.ts", "utf8");
check("the webhook imports the decision", /creditSyncDecision/.test(webhook));
check(
  "syncCreditsForPlan is guarded by it, not called unconditionally",
  /creditSyncDecision\([\s\S]{0,400}?\)\s*===\s*"reset"/.test(webhook) ||
    /decision\s*===\s*"reset"/.test(webhook),
  "syncCreditsForPlan must sit behind the decision"
);
check(
  "the event type is threaded through rather than assumed",
  /eventType/.test(webhook)
);
// The previous tier has to be READ before the update overwrites it —
// comparing the new tier against itself would make the guard a no-op that
// still passes every test above.
check(
  "the previous tier is read from the stored user metadata",
  /subscription_tier as PlanSlug|user_metadata\?\.\subscription_tier|userData\.user\.user_metadata\.subscription_tier/.test(webhook),
  "the decision needs the tier as it was BEFORE this event"
);

console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${failures.length} failed`);
process.exit(failures.length === 0 ? 0 : 1);
