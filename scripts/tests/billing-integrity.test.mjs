// THE BILLING REVIEW OF 2026-11-05: what holds each repair in place.
//
// Six findings from an independent review, all in the money paths, and
// all of the same kind — something granted, kept or credited back that
// was not paid for. docs/SECURITY-AUDIT.md carries them as ΑΣ-1.16 and
// ΑΣ-4.15 to ΑΣ-4.19; this file holds the parts no older gate reaches.
// The rest lives where the code it guards already had a gate:
//
//   the credit decision          subscription-sync.test.mjs
//   the period-keyed reset       plan-reset-idempotent.test.mjs
//   the scheduled downgrade      annual-billing.test.mjs §5
//   overage after the end        revenue-engine.test.mjs
//   the team following the plan  team-grant.test.mjs §7
//
// Pure functions are DRIVEN here; wiring is read from the code with every
// comment stripped first, so an explanation of the fix cannot satisfy a
// check about the fix. billing-integrity.mutation.mjs puts each defect
// back and requires the clause that names it to go red.
//
// Run: node scripts/tests/billing-integrity.test.mjs
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadTs } from "./load-ts.mjs";

let pass = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    failures.push(name);
    console.log(`  FAIL  ${name}${detail === undefined ? "" : "\n        " + detail}`);
  }
}
const strip = (t) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const read = (f) => strip(readFileSync(f, "utf8"));
// The body of one function, from its declaration to the next top-level one.
function fn(src, name) {
  const at = src.search(new RegExp(`(async )?function ${name}\\(`));
  if (at < 0) return "";
  const next = src.slice(at + 10).search(/\n(export )?(async )?function |\nexport (async )?function /);
  return next < 0 ? src.slice(at) : src.slice(at, at + 10 + next);
}

// =====================================================================
console.log("== 1. a downgrade waits for the end of the paid period (ΑΣ-4.15) ==");
// =====================================================================
{
  const { planChangeDirection, scheduledDowngradePhases } = await loadTs("src/lib/billing/plan-change.ts");
  const TIERS = ["free", "starter", "growth", "professional", "ultimate", "enterprise"];
  const wrong = [];
  for (const from of TIERS) {
    for (const to of TIERS) {
      for (const fi of ["month", "year"]) {
        for (const ti of ["month", "year"]) {
          const got = planChangeDirection({ fromSlug: from, fromInterval: fi, toSlug: to, toInterval: ti });
          const byTier = TIERS.indexOf(to) - TIERS.indexOf(from);
          const want =
            byTier > 0 ? "upgrade" : byTier < 0 ? "downgrade" : fi === ti ? "same" : ti === "year" ? "upgrade" : "downgrade";
          if (got !== want) wrong.push(`${from}/${fi} -> ${to}/${ti}: ${got}, expected ${want}`);
        }
      }
    }
  }
  check(`the direction of all ${TIERS.length ** 2 * 4} changes is the tier first, then the interval`, wrong.length === 0, wrong.slice(0, 4).join("\n        "));
  check(
    "a higher plan billed monthly to a lower one billed yearly is a DOWNGRADE",
    planChangeDirection({ fromSlug: "ultimate", fromInterval: "month", toSlug: "starter", toInterval: "year" }) === "downgrade",
    "measured on the monthly price it read as an upgrade: charged now, with the unused higher plan credited back"
  );

  const [now, next] = scheduledDowngradePhases({
    currentStart: 1_700_000_000,
    currentEnd: 1_702_592_000,
    currentItems: [
      { price: "price_professional", quantity: 1 },
      { price: "price_seat", quantity: 3 },
    ],
    currentPlanPriceId: "price_professional",
    nextPlanPriceId: "price_growth",
    nextInterval: "month",
    dropPriceIds: ["price_seat"],
    nextMetadata: { plan: "growth" },
  });
  check(
    "the paid period stays exactly as bought — same lines, same dates",
    JSON.stringify(now.items) === JSON.stringify([{ price: "price_professional", quantity: 1 }, { price: "price_seat", quantity: 3 }]) &&
      now.start_date === 1_700_000_000 &&
      now.end_date === 1_702_592_000,
    JSON.stringify(now)
  );
  check("…and nothing about it is changed for the switch", now.metadata === undefined, JSON.stringify(now));
  check(
    "the lower plan starts after it, without the seat line it cannot use",
    JSON.stringify(next.items) === JSON.stringify([{ price: "price_growth", quantity: 1 }]),
    JSON.stringify(next.items)
  );
  check("…with no proration on either side of the switch", now.proration_behavior === "none" && next.proration_behavior === "none");

  const checkout = read("src/app/api/checkout/route.ts");
  check(
    "only a subscription Stripe does not know falls through to a new checkout",
    /existing = await stripe\.subscriptions\.retrieve\(existingSubscriptionId\);\s*\} catch \(err\) \{\s*logApiError\("\/api\/checkout", err, \{ stage: "update_existing_subscription" \}\);\s*\}/.test(checkout)
  );
  check(
    "…a failure on a LIVE subscription is refused, never sold a second subscription",
    /stage: "change_existing_subscription" \}\);\s*return NextResponse\.json\(\{ ok: false, code: "plan_change_failed" \}, \{ status: 502 \}\);/.test(checkout)
  );
  check(
    "choosing the plan already paid for, with a downgrade waiting, releases it",
    /if \(planItem\.price\.id === planPriceId\) \{\s*if \(scheduleId\) \{\s*await stripe\.subscriptionSchedules\.release\(scheduleId\);/.test(checkout)
  );
  check(
    "an upgrade releases a waiting downgrade before it changes the price",
    checkout.indexOf("if (scheduleId) await stripe.subscriptionSchedules.release(scheduleId);") > 0 &&
      checkout.indexOf("if (scheduleId) await stripe.subscriptionSchedules.release(scheduleId);") <
        checkout.indexOf("stripe.subscriptions.update(existingSubscriptionId")
  );
  check(
    "the downgrade's two phases come from the pure builder",
    /const phases = scheduledDowngradePhases\(\{/.test(checkout) && /\{ end_behavior: "release", proration_behavior: "none", phases \}/.test(checkout)
  );
  const cancel = read("src/app/api/billing/cancel/route.ts");
  check(
    "cancelling releases a waiting downgrade first (Stripe refuses cancel_at_period_end on a schedule)",
    cancel.indexOf("await stripe.subscriptionSchedules.release(scheduleId)") > 0 &&
      cancel.indexOf("await stripe.subscriptionSchedules.release(scheduleId)") < cancel.indexOf("cancel_at_period_end: true")
  );
  const notice = read("src/components/billing/checkout-notice.tsx");
  check(
    "Settings says a downgrade is booked, not that a payment arrived",
    /value === "scheduled"\) setState\("scheduled"\)/.test(notice) && /redirectPath: "\/dashboard\/settings\?checkout=scheduled"/.test(checkout)
  );
  for (const locale of ["en", "el", "es", "fr", "de", "it", "pt", "zh", "ja", "ar"]) {
    const msgs = JSON.parse(readFileSync(`messages/${locale}.json`, "utf8"));
    check(`${locale}: settings.billing.checkout.scheduled`, typeof msgs.settings?.billing?.checkout?.scheduled === "string");
  }
}

// =====================================================================
console.log("\n== 2. a move down only ever lowers the balance (ΑΣ-4.15) ==");
// =====================================================================
{
  const sql = strip(readFileSync("supabase/migrations/20261117000000_billing_reversals.sql", "utf8")).replace(/^\s*--.*$/gm, "");
  const clamp = sql.slice(sql.indexOf("create or replace function public.clamp_credits_to_plan"), sql.indexOf("create or replace function public.reverse_purchased_credits"));
  check(
    "the clamp takes the SMALLER of the balance and the new allowance",
    /credits_remaining = least\(uc\.credits_remaining, greatest\(p_monthly, 0\) \+ uc\.purchased_credits\)/.test(clamp),
    "set = p_monthly + purchased is the reset, and the reset is what refilled a spent balance"
  );
  check("…moving the plan and the total with it", /plan_tier\s+= p_plan_tier/.test(clamp) && /credits_total\s+= greatest\(p_monthly, 0\)/.test(clamp));
  check("…and writing a ledger row only for what it took", /if v_after < v_before then\s*insert into public\.credit_transactions/.test(clamp));
}

// =====================================================================
console.log("\n== 3. a recurring add-on ends with its own subscription (ΑΣ-4.17) ==");
// =====================================================================
{
  const { addonStateFromSubscription, addonIsActive } = await loadTs("src/lib/billing/addons.ts");
  const now = new Date("2026-11-05T12:00:00Z");
  const end = "2026-11-20T00:00:00.000Z";
  const cases = [
    [{ status: "active", cancelAtPeriodEnd: false, periodEndIso: end }, "active", null],
    [{ status: "trialing", cancelAtPeriodEnd: false, periodEndIso: end }, "active", null],
    [{ status: "active", cancelAtPeriodEnd: true, periodEndIso: end }, "cancelled", end],
    [{ status: "canceled", cancelAtPeriodEnd: false, periodEndIso: end }, "cancelled", now.toISOString()],
    [{ status: "past_due", cancelAtPeriodEnd: false, periodEndIso: end }, "cancelled", now.toISOString()],
    [{ status: "unpaid", cancelAtPeriodEnd: false, periodEndIso: end }, "cancelled", now.toISOString()],
    [{ status: "active", cancelAtPeriodEnd: true, periodEndIso: null }, "cancelled", now.toISOString()],
  ];
  for (const [sub, status, expiresAt] of cases) {
    const got = addonStateFromSubscription(sub, now);
    check(
      `${sub.status}${sub.cancelAtPeriodEnd ? " + cancel at end" : ""}${sub.periodEndIso ? "" : " (no period)"} -> ${status}${expiresAt ? ` until ${expiresAt.slice(0, 10)}` : ""}`,
      got.status === status && got.expiresAt === expiresAt,
      JSON.stringify(got)
    );
  }
  const ended = addonStateFromSubscription({ status: "canceled", cancelAtPeriodEnd: false, periodEndIso: end }, now);
  check(
    "an ended add-on stops granting the moment its row is written",
    !addonIsActive({ slug: "agents_5", quantity: 1, status: ended.status, expiresAt: ended.expiresAt }, new Date(now.getTime() + 1000))
  );

  const hook = read("src/app/api/webhooks/stripe/route.ts");
  check(
    "every add-on subscription event reaches the add-on sync, not a bare return",
    /if \(subscription\.metadata\?\.addon_slug\) return syncAddonSubscription\(subscription\);/.test(hook)
  );
  const sync = fn(hook, "syncAddonSubscription");
  check("…which writes the row from the subscription's own state", /addonStateFromSubscription\(/.test(sync) && /\.from\("account_addons"\)\.update\(write\)/.test(sync));
  check("…found by the subscription's own items", /\.in\("stripe_subscription_item_id", itemIds/.test(sync));

  const route = read("src/app/api/billing/addons/route.ts");
  const del = route.slice(route.indexOf("export async function DELETE"));
  check(
    "the in-app cancel no longer deletes the add-on's only item",
    !/subscriptionItems\.del\(/.test(del),
    "Stripe refuses to delete the last item of a subscription, so the cancel never worked"
  );
  check(
    "…it sets the add-on's own subscription to cancel at period end",
    /await stripe\.subscriptions\.update\(subscription\.id, \{ cancel_at_period_end: true \}\)/.test(del)
  );
  check(
    "…after checking that subscription IS the add-on's",
    /if \(subscription\.metadata\?\.addon_slug !== slug \|\| subscription\.metadata\?\.supabase_user_id !== user\.id\) \{[\s\S]{0,900}?status: 502/.test(del)
  );
  const recover = fn(route, "recoverAddonSubscription");
  check(
    "a lost item is recovered from the customer's subscriptions, not the plan's",
    /stripe\.subscriptions\.list\(\{ customer: owner\.customerId/.test(recover) && !/stripe_subscription_id/.test(recover)
  );
}

// =====================================================================
console.log("\n== 4. nothing before the money, and refunds take the pack back (ΑΣ-4.18) ==");
// =====================================================================
{
  const hook = read("src/app/api/webhooks/stripe/route.ts");
  const paid = fn(hook, "sessionIsPaid");
  check("a session counts as paid only when Stripe says `paid`", /if \(session\.payment_status === "paid"\) return true;[\s\S]*return false;/.test(paid), paid);
  for (const grant of ["grantAddon", "grantPurchasedCredits"]) {
    const body = fn(hook, grant);
    const guard = body.indexOf("if (!sessionIsPaid(session, eventId)) return;");
    check(`${grant} refuses an unpaid session before it writes anything`, guard > 0 && guard < body.search(/grantCredits\(|\.insert\(/), body.slice(0, 200));
  }
  check(
    "a delayed payment that succeeds goes through the same handler",
    /case "checkout\.session\.async_payment_succeeded":\s*case "checkout\.session\.completed": \{/.test(hook)
  );
  const failedAt = hook.indexOf('case "checkout.session.async_payment_failed": {');
  const failedCase = failedAt < 0 ? "" : hook.slice(failedAt, hook.indexOf("case ", failedAt + 10));
  check("…and one that fails is handled, granting nothing", failedCase !== "" && !/await (grant\w*|syncSubscriptionToUser)\(/.test(failedCase), failedCase);
  const refunds = hook.slice(hook.indexOf('case "charge.refunded":'), hook.indexOf("default:", hook.indexOf('case "charge.refunded":')));
  check("refunds and disputes reverse the pack, not only the commission", /await reversePackForCharge\(stripe, event\);/.test(refunds));
  const reverse = fn(hook, "reversePackForCharge");
  check("…a dispute only when it is lost", /if \(dispute\.status !== "lost"\) return;/.test(reverse));
  check("…only what this webhook granted", /\.eq\("idempotency_key", grantKey\)/.test(reverse) && /if \(!granted \|\| granted\.length === 0\) return;/.test(reverse));
  check(
    "…proportionally, keyed on the running total, so a redelivery takes nothing twice",
    /const target = Math\.floor\(packCredits \* share\);/.test(reverse) &&
      /const delta = target - alreadyRequested;/.test(reverse) &&
      /`\$\{prefix\}\$\{target\}`/.test(reverse)
  );

  const sql = strip(readFileSync("supabase/migrations/20261117000000_billing_reversals.sql", "utf8")).replace(/^\s*--.*$/gm, "");
  const rev = sql.slice(sql.indexOf("create or replace function public.reverse_purchased_credits"));
  check(
    "the reversal is claimed once per key before it moves anything",
    rev.indexOf("on conflict (idempotency_key) where idempotency_key is not null do nothing") > 0 &&
      rev.indexOf("on conflict (idempotency_key)") < rev.indexOf("update public.user_credits")
  );
  check("…never below zero", /v_debit := least\(p_amount, greatest\(coalesce\(v_before, 0\), 0\)\);/.test(rev));
  check(
    "…and out of the purchased sub-ledger too, or the next reset would add it back",
    /purchased_credits = least\(greatest\(uc\.purchased_credits - p_amount, 0\), uc\.credits_remaining - v_debit\)/.test(rev)
  );
  check("…recording what was actually taken", /set amount = -v_debit/.test(rev));
  for (const f of ["clamp_credits_to_plan(uuid, integer, text, text)", "reverse_purchased_credits(uuid, integer, text, text)"]) {
    check(`${f.split("(")[0]} runs as service_role only`,
      sql.includes(`revoke all on function public.${f} from public;`) && sql.includes(`grant execute on function public.${f} to service_role;`));
  }
  check("both are security definer with a pinned search_path", (sql.match(/security definer\s*\n\s*set search_path = public/g) ?? []).length === 2);
}

// =====================================================================
console.log("\n== 5. an expired beta is a paying customer only with a live subscription (ΑΣ-4.19) ==");
// =====================================================================
{
  const resolution = await loadTs("src/lib/billing/plan-resolution.ts");
  globalThis.__realHasLiveSubscription = resolution.hasLiveSubscription;
  const opened = { id: "u1", user_metadata: { is_beta_tester: true, subscription_tier: "ultimate", stripe_customer_id: "cus_1" } };
  const paying = { id: "u1", user_metadata: { is_beta_tester: true, subscription_tier: "ultimate", stripe_customer_id: "cus_1", stripe_subscription_id: "sub_1" } };
  check("a customer id alone is not a live subscription", resolution.hasLiveSubscription(opened) === false);
  check("a webhook-written subscription id is", resolution.hasLiveSubscription(paying) === true);

  const dir = mkdtempSync(join(tmpdir(), "billing-integrity-"));
  const stripImports = (src) =>
    src.replace(/^import\s+"[^"]*";[ \t]*\r?\n/gm, "").replace(/^import\s[\s\S]*?\sfrom\s+"[^"]*";[ \t]*\r?\n/gm, "");

  // credits.ts, its database stood in: the beta window has CLOSED.
  const creditsStandIn = `
const createAdminClient = () => ({});
const logApiError = () => {};
const diagLog = () => {};
const hasActiveBetaBypass = async () => false;
const isBetaTester = (u) => u?.user_metadata?.is_beta_tester === true;
const isAdminEmail = () => false;
const isOwner = () => false;
const isAdminOrOwner = () => false;
const clearLegacyEntitlements = async () => {};
const resolvePlanSlug = (u) => u?.user_metadata?.subscription_tier ?? "free";
const resolvePlan = () => null;
const hasLiveSubscription = (u) => globalThis.__realHasLiveSubscription(u);
const getPlan = () => null;
const higherPlanSlug = (a) => a;
const annualMonthlyEquivalentEur = () => 0;
`;
  writeFileSync(join(dir, "credits.ts"), creditsStandIn + stripImports(readFileSync("src/lib/billing/credits.ts", "utf8")));
  const credits = await loadTs(join(dir, "credits.ts"));
  check(
    "an expired beta that only OPENED a checkout falls back to Free",
    (await credits.resolveEffectivePlanSlug(opened)) === "free",
    "stripe_customer_id is written when a checkout page is created, before anything is paid"
  );
  check("…while one with a live subscription keeps the plan Stripe says it pays for", (await credits.resolveEffectivePlanSlug(paying)) === "ultimate");

  // beta.ts, its database stood in: the beta window is still OPEN.
  const betaStandIn = `
const createAdminClient = () => ({
  from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { beta_expires_at: "2999-01-01T00:00:00Z" } }) }) }) }),
});
const hasLiveSubscription = (u) => globalThis.__realHasLiveSubscription(u);
`;
  writeFileSync(join(dir, "beta.ts"), betaStandIn + stripImports(readFileSync("src/lib/beta.ts", "utf8")));
  const beta = await loadTs(join(dir, "beta.ts"));
  check("a beta tester still in the window keeps the bypass after merely opening a checkout", (await beta.hasActiveBetaBypass(opened)) === true);
  check("…and loses it once a subscription is live, so Stripe's plan is what they get", (await beta.hasActiveBetaBypass(paying)) === false);
}

console.log(failures.length === 0 ? `\nALL PASS: ${pass} passed, 0 failed` : `\nFAILURES: ${pass} passed, ${failures.length} failed`);
process.exit(failures.length === 0 ? 0 : 1);
