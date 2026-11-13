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
const { creditSyncDecision, creditPeriodKey } = await loadTs("src/lib/billing/subscription-sync.ts");

// THE ORDER IS WRITTEN HERE, not imported from plans.ts: a gate that
// borrowed the product's own ranking would agree with any ranking at all.
const TIERS = ["free", "starter", "growth", "professional", "ultimate", "enterprise"];
const rank = (t) => TIERS.indexOf(t);
// Every event the webhook's switch handles, plus two Stripe fires that it
// does not handle today — a decision function that only knows the current
// switch is one new `case` away from being wrong again.
const EVENTS = [
  "invoice.paid",
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
  "customer.subscription.deleted",
  "customer.subscription.updated",
  "customer.subscription.paused",
  "customer.subscription.resumed",
];
// Stripe's billing_reason values, and none: only a renewal and a first
// invoice open a paid period.
const REASONS = [undefined, "subscription_cycle", "subscription_create", "subscription_update", "manual"];

// THE RULE, RESTATED INDEPENDENTLY (2026-11-05). Until then a plan change
// in EITHER direction reset — and a reset SETS the balance, so a move down
// refilled an account that had spent the higher plan's allowance. A move
// down now clamps (never raises), and a reset opens only for a period
// that was paid for, or for a move up.
function expected({ eventType, previousTier, nextTier, billingReason }) {
  const newPeriod =
    eventType === "checkout.session.completed" ||
    eventType === "checkout.session.async_payment_succeeded" ||
    (eventType === "invoice.paid" && (billingReason === "subscription_cycle" || billingReason === "subscription_create"));
  if (newPeriod) return nextTier === "free" ? "clamp" : "reset";
  if (eventType === "customer.subscription.deleted") return "clamp";
  if (previousTier === null) return "reset";
  if (rank(nextTier) < rank(previousTier)) return "clamp";
  if (rank(nextTier) > rank(previousTier)) return "reset";
  return "skip";
}

console.log("== 1. cross-product: every event against every tier pair ==");
// 7 events x 5 reasons x 7 previous (6 tiers + null) x 6 next = 1,470.
// Not a sample: the first bug lived in ONE cell (updated + same tier), and
// the second in a whole row (updated + any lower tier).
let combos = 0;
const wrong = [];
for (const eventType of EVENTS) {
  for (const billingReason of REASONS) {
    for (const previousTier of [...TIERS, null]) {
      for (const nextTier of TIERS) {
        combos++;
        const input = { eventType, previousTier, nextTier, billingReason };
        const actual = creditSyncDecision(input);
        const want = expected(input);
        if (actual !== want) {
          wrong.push(`${eventType}/${billingReason ?? "-"} ${previousTier}->${nextTier}: ${actual} (expected ${want})`);
        }
      }
    }
  }
}
check(`all ${combos} combinations decided correctly`, wrong.length === 0, wrong.slice(0, 5).join("\n        "));

console.log("\n== 2. the exact cases that moved money ==");
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
// Same event, same shape, but the plan really went up: the allowance is
// bigger, so the balance follows it.
check(
  "an upgrade through the same event still resets",
  creditSyncDecision({
    eventType: "customer.subscription.updated",
    previousTier: "starter",
    nextTier: "growth",
  }) === "reset"
);
// THE SECOND DEFECT. A move down used to "reset" too, which refilled a
// spent Ultimate balance to Starter's full allowance.
check(
  "a downgrade lowers the balance and never refills it",
  creditSyncDecision({
    eventType: "customer.subscription.updated",
    previousTier: "ultimate",
    nextTier: "starter",
  }) === "clamp"
);
check(
  "…and a lapsed period (the tier drops to free) is a move down too",
  creditSyncDecision({
    eventType: "customer.subscription.updated",
    previousTier: "growth",
    nextTier: "free",
  }) === "clamp"
);

console.log("\n== 3. the events that MUST still reset ==");
check(
  "a paid renewal opens a new period",
  creditSyncDecision({
    eventType: "invoice.paid",
    previousTier: "growth",
    nextTier: "growth",
    billingReason: "subscription_cycle",
  }) === "reset"
);
// The renewal that a scheduled downgrade starts can arrive BEFORE the
// subscription.updated that moves the tier, so the stored tier is still
// the higher one. It is a paid period at the lower plan, and must open.
check(
  "the first paid period after a scheduled downgrade opens at the lower plan",
  creditSyncDecision({
    eventType: "invoice.paid",
    previousTier: "ultimate",
    nextTier: "starter",
    billingReason: "subscription_cycle",
  }) === "reset"
);
check(
  "a proration invoice is not a new period",
  creditSyncDecision({
    eventType: "invoice.paid",
    previousTier: "growth",
    nextTier: "growth",
    billingReason: "subscription_update",
  }) === "skip"
);
check(
  "a new subscription starts from the plan's allotment",
  creditSyncDecision({
    eventType: "checkout.session.completed",
    previousTier: "growth",
    nextTier: "growth",
  }) === "reset"
);
check(
  "…and a checkout that is not paid yet refills nothing",
  creditSyncDecision({
    eventType: "checkout.session.completed",
    previousTier: "free",
    nextTier: "free",
  }) === "clamp"
);
// THE TIERS ARE THE SAME ON PURPOSE, and the first version of this check
// had them differ — growth -> free — which is a plan CHANGE, so it
// returned through the tier comparison whether or not the event was
// special-cased. Measured 2026-09-08: deleting the deleted-event rule left
// this line green. free -> free can only clamp because of the event.
check(
  "a deleted subscription drops to Free's allotment, never above what is there",
  creditSyncDecision({
    eventType: "customer.subscription.deleted",
    previousTier: "free",
    nextTier: "free",
  }) === "clamp"
);
check(
  "an account with no recorded tier is initialised, not skipped",
  creditSyncDecision({
    eventType: "customer.subscription.updated",
    previousTier: null,
    nextTier: "growth",
  }) === "reset"
);

console.log("\n== 3b. one reset per PAID PERIOD, not per calendar month ==");
check("the key is the period Stripe reports", creditPeriodKey(1761955200) === "period-1761955200", creditPeriodKey(1761955200));
check(
  "…the same in October and in November for one period",
  creditPeriodKey(1761955200, new Date("2026-10-30T00:00:00Z")) === creditPeriodKey(1761955200, new Date("2026-11-02T00:00:00Z"))
);
check(
  "…and only without a period does it fall back to the month, under its own prefix",
  creditPeriodKey(null, new Date("2026-11-02T00:00:00Z")) === "month-2026-11"
);

console.log("\n== 4. the webhook actually consults it ==");
// A pure function nobody calls fixes nothing. This is the half a unit
// test of the function cannot see, and it is where the bug lived.
const webhook = readFileSync("src/app/api/webhooks/stripe/route.ts", "utf8");
// IMPORTED **AND** CALLED. `/creditSyncDecision/` alone matches the
// import line, so a webhook that imports the decision and then never
// consults it passed — measured 2026-09-08 by renaming the call site and
// watching this stay green. The import is the cheap half; the call is the
// one the money depends on.
check("the webhook imports the decision", /import\s*\{[^}]*creditSyncDecision/.test(webhook));
check(
  "...and calls it",
  /=\s*creditSyncDecision\(/.test(webhook),
  "imported and never consulted is the state this whole file was written about"
);
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
check(
  "…and so is the invoice's billing reason",
  /creditSyncDecision\(\{ eventType, previousTier, nextTier: planSlug, billingReason \}\)/.test(webhook) &&
    /invoice\.billing_reason \?\? null/.test(webhook),
  "without it no renewal can be told from a proration invoice"
);
check(
  "a move down runs the clamp, not the reset",
  /decision === "clamp"\) \{[\s\S]{0,200}await clampCreditsToPlan\(/.test(webhook)
);
check(
  "the reset is claimed under the paid period",
  /const periodKey = creditPeriodKey\(currentPeriodStartSeconds\(subscription\)\);/.test(webhook) &&
    /await syncCreditsForPlan\([\s\S]{0,240}periodKey\s*\)/.test(webhook)
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
