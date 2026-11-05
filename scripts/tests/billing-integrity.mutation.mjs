#!/usr/bin/env node
/*
 * CAN billing-integrity.test.mjs SEE EACH BILLING DEFECT OF 2026-11-05 COME
 * BACK?
 *
 * Every mutant below is one repair undone in real code — never an
 * `if (false)`, which scripts/check-mutation-markers.mjs would catch on
 * its own — and each must turn red the clause that names it.
 *
 * Run: node scripts/tests/billing-integrity.mutation.mjs
 */
import { runMutations } from "./lib/mutation-runner.mjs";

const GATE = "scripts/tests/billing-integrity.test.mjs";
const CHANGE = "src/lib/billing/plan-change.ts";
const CHECKOUT = "src/app/api/checkout/route.ts";
const CANCEL = "src/app/api/billing/cancel/route.ts";
const SQL = "supabase/migrations/20261117000000_billing_reversals.sql";
const ADDONS = "src/lib/billing/addons.ts";
const ROUTE = "src/app/api/billing/addons/route.ts";
const HOOK = "src/app/api/webhooks/stripe/route.ts";
const CREDITS = "src/lib/billing/credits.ts";
const BETA = "src/lib/beta.ts";
const RESOLUTION = "src/lib/billing/plan-resolution.ts";

const MUTANTS = [
  // ---- ΑΣ-4.15: the downgrade ---------------------------------------
  {
    name: "a lower plan billed yearly counts as an upgrade again",
    file: CHANGE,
    from: '  if (byTier < 0) return "downgrade";',
    to: '  if (byTier < 0) return params.toInterval === "year" ? "upgrade" : "downgrade";',
    expect: "is a DOWNGRADE",
  },
  {
    name: "the period already paid for is changed today",
    file: CHANGE,
    from: "      items: current,\n      start_date: params.currentStart,",
    to: "      items: next,\n      start_date: params.currentStart,",
    expect: "the paid period stays exactly as bought",
  },
  {
    name: "the lower plan keeps billing the seat line it cannot use",
    file: CHANGE,
    from: "    .filter((item) => !drop.has(item.price))",
    to: "    .filter((item) => item !== null)",
    expect: "without the seat line it cannot use",
  },
  {
    name: "the switch to the lower plan prorates",
    file: CHANGE,
    from: '      duration: { interval: params.nextInterval, interval_count: 1 },\n      proration_behavior: "none",',
    to: '      duration: { interval: params.nextInterval, interval_count: 1 },\n      proration_behavior: "create_prorations" as "none",',
    expect: "with no proration on either side of the switch",
  },
  {
    name: "a failed change on a live subscription falls through to selling a second one",
    file: CHECKOUT,
    from: '          return NextResponse.json({ ok: false, code: "plan_change_failed" }, { status: 502 });',
    to: "",
    expect: "a failure on a LIVE subscription is refused",
  },
  {
    name: "staying on the current plan leaves the downgrade waiting",
    file: CHECKOUT,
    from: "            if (scheduleId) {\n              await stripe.subscriptionSchedules.release(scheduleId);",
    to: "            if (scheduleId) {\n              void scheduleId;",
    expect: "releases it",
  },
  {
    name: "an upgrade leaves the downgrade waiting behind it",
    file: CHECKOUT,
    from: "          if (scheduleId) await stripe.subscriptionSchedules.release(scheduleId);\n",
    to: "",
    expect: "an upgrade releases a waiting downgrade",
  },
  {
    name: "cancelling no longer releases a waiting downgrade",
    file: CANCEL,
    from: "    if (scheduleId) await stripe.subscriptionSchedules.release(scheduleId);\n",
    to: "",
    expect: "cancelling releases a waiting downgrade first",
  },
  {
    name: "the clamp sets the balance like the reset, refilling it",
    file: SQL,
    from: "     set credits_remaining = least(uc.credits_remaining, greatest(p_monthly, 0) + uc.purchased_credits),",
    to: "     set credits_remaining = greatest(p_monthly, 0) + uc.purchased_credits,",
    expect: "the clamp takes the SMALLER",
  },

  // ---- ΑΣ-4.17: recurring add-ons -------------------------------------
  {
    name: "an add-on set to cancel stays active",
    file: ADDONS,
    from: "  if (live && !subscription.cancelAtPeriodEnd) return { status: \"active\", expiresAt: null };",
    to: "  if (live) return { status: \"active\", expiresAt: null };",
    expect: "active + cancel at end -> cancelled",
  },
  {
    name: "an unpaid add-on subscription keeps granting",
    file: ADDONS,
    from: '  const live = subscription.status === "active" || subscription.status === "trialing";',
    to: '  const live = subscription.status !== "canceled";',
    expect: "past_due -> cancelled",
  },
  {
    name: "the webhook returns bare on every add-on event again",
    file: HOOK,
    from: "  if (subscription.metadata?.addon_slug) return syncAddonSubscription(subscription);",
    to: "  if (subscription.metadata?.addon_slug) return;",
    expect: "every add-on subscription event reaches the add-on sync",
  },
  {
    name: "the in-app cancel deletes the add-on's only item again",
    file: ROUTE,
    from: "          : await stripe.subscriptions.update(subscription.id, { cancel_at_period_end: true });",
    to: "          : (await stripe.subscriptionItems.del(itemId), subscription);",
    expect: "no longer deletes the add-on's only item",
  },
  {
    name: "the in-app cancel stops checking whose subscription it is",
    file: ROUTE,
    from: "        if (subscription.metadata?.addon_slug !== slug || subscription.metadata?.supabase_user_id !== user.id) {",
    to: '        if (subscription.metadata?.supabase_user_id === "nobody") {',
    expect: "after checking that subscription IS the add-on's",
  },
  {
    name: "a lost item is searched for on the plan's subscription again",
    file: ROUTE,
    from: '    const list = await stripe.subscriptions.list({ customer: owner.customerId, status: "all", limit: 100 });',
    to: '    const list = { data: [await stripe.subscriptions.retrieve(String((owner as { stripe_subscription_id?: string }).stripe_subscription_id))] };',
    expect: "recovered from the customer's subscriptions, not the plan's",
  },

  // ---- ΑΣ-4.18: payment first, refunds back ---------------------------
  {
    name: "any payment status counts as paid",
    file: HOOK,
    from: '  if (session.payment_status === "paid") return true;',
    to: "  if (session.payment_status) return true;",
    expect: "a session counts as paid only when Stripe says `paid`",
  },
  {
    name: "a credit pack is granted before it is paid",
    file: HOOK,
    from: "async function grantPurchasedCredits(session: Stripe.Checkout.Session, eventId: string) {\n  // NOTHING BEFORE THE MONEY (2026-11-05, ΑΣ-4.18): see sessionIsPaid.\n  if (!sessionIsPaid(session, eventId)) return;\n",
    to: "async function grantPurchasedCredits(session: Stripe.Checkout.Session, eventId: string) {\n",
    expect: "grantPurchasedCredits refuses an unpaid session",
  },
  {
    name: "an add-on is granted before it is paid",
    file: HOOK,
    from: "async function grantAddon(session: Stripe.Checkout.Session, eventId: string) {\n  // NOTHING BEFORE THE MONEY (2026-11-05, ΑΣ-4.18): see sessionIsPaid.\n  if (!sessionIsPaid(session, eventId)) return;\n",
    to: "async function grantAddon(session: Stripe.Checkout.Session, eventId: string) {\n",
    expect: "grantAddon refuses an unpaid session",
  },
  {
    name: "a delayed payment that succeeds is never granted",
    file: HOOK,
    from: '      case "checkout.session.async_payment_succeeded":\n',
    to: "",
    expect: "a delayed payment that succeeds goes through the same handler",
  },
  {
    name: "a refund reverses only the commission again",
    file: HOOK,
    from: "        await reversePackForCharge(stripe, event);\n",
    to: "",
    expect: "refunds and disputes reverse the pack",
  },
  {
    name: "a dispute that was WON takes the credits too",
    file: HOOK,
    from: '      if (dispute.status !== "lost") return;\n',
    to: "",
    expect: "a dispute only when it is lost",
  },
  {
    name: "every refund event takes its whole share again, redeliveries included",
    file: HOOK,
    from: "    const delta = target - alreadyRequested;",
    to: "    const delta = target;",
    expect: "keyed on the running total",
  },
  {
    name: "a reversal drives the balance negative",
    file: SQL,
    from: "  v_debit := least(p_amount, greatest(coalesce(v_before, 0), 0));",
    to: "  v_debit := p_amount;",
    expect: "never below zero",
  },
  {
    name: "a reversal leaves the purchased sub-ledger, so the next reset adds it back",
    file: SQL,
    from: "           purchased_credits = least(greatest(uc.purchased_credits - p_amount, 0), uc.credits_remaining - v_debit),",
    to: "           purchased_credits = least(uc.purchased_credits, uc.credits_remaining - v_debit),",
    expect: "out of the purchased sub-ledger too",
  },

  // ---- ΑΣ-4.19: beta and a checkout page ------------------------------
  {
    name: "an opened checkout keeps an expired beta's plan again",
    file: CREDITS,
    from: "  if (hasLiveSubscription(user)) return baseSlug;",
    to: "  if (user.user_metadata?.stripe_customer_id) return baseSlug;",
    expect: "only OPENED a checkout falls back to Free",
  },
  {
    name: "an opened checkout ends the beta bypass early",
    file: BETA,
    from: "  if (hasLiveSubscription(user)) return false;",
    to: "  if (user.user_metadata?.stripe_customer_id) return false;",
    expect: "keeps the bypass after merely opening a checkout",
  },
  {
    name: "a customer id counts as a live subscription",
    file: RESOLUTION,
    from: '  return typeof id === "string" && id.length > 0;',
    to: "  return Boolean(id) || Boolean(user?.user_metadata?.stripe_customer_id);",
    expect: "a customer id alone is not a live subscription",
  },
];

runMutations({
  name: "billing-integrity",
  gate: GATE,
  targets: [CHANGE, CHECKOUT, CANCEL, SQL, ADDONS, ROUTE, HOOK, CREDITS, BETA, RESOLUTION],
  mutants: MUTANTS,
});
