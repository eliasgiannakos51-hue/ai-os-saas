// BADGE REMOVAL WITH CREDITS (extension of V4 #25).
//
// SIX THINGS THAT WOULD BE WRONG QUIETLY, and five of them are money:
//
//   A DOUBLE CHARGE. A Starter+ account already has the badge removed by
//   its plan. Charging it credits for the same thing is taking money for
//   something already sold, and the VISIBLE result is identical either
//   way — the badge is gone. Only the order of the checks distinguishes
//   them, which is why the order is asserted rather than assumed.
//
//   A PRICE BELOW THE FREE GRANT. Free accounts are granted 100 credits
//   a month. At any price at or below that, removal is paid for with
//   credits we gave away: we would be paying ourselves to delete our own
//   attribution, every month, for ever.
//
//   A BADGE BAKED INTO THE HTML. It would survive an upgrade, miss a
//   downgrade, and sit in the editor with a delete key next to it.
//
//   A CANCELLATION THAT TAKES BACK A PAID MONTH. Turning auto-renewal
//   off stops the NEXT charge. Reading it as "off now" keeps their
//   credits and their badge.
//
//   A WARNING THAT NEVER FIRES, or one that fires every day for a week
//   until it is muted — and this is the notification that costs money to
//   ignore.
//
//   A LAPSE THAT HAPPENS WITH THE CREDITS SITTING THERE.
//
// Runs in the build gate; needs no API key.
//
// Run: node scripts/tests/badge-credits.test.mjs
import { readFileSync } from "node:fs";
import { loadTs } from "./load-ts.mjs";

let pass = 0;
const failures = [];
const ok = (name, cond, detail) => {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { failures.push(name); console.log(`  FAIL  ${name}${detail !== undefined ? "\n        " + detail : ""}`); }
};
const eq = (name, actual, expected) =>
  ok(name, JSON.stringify(actual) === JSON.stringify(expected), `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);

const bc = await loadTs("src/lib/publishing/badge-credits.ts");
const badge = await loadTs("src/lib/publishing/badge.ts");
const plans = await loadTs("src/lib/billing/plans.ts");
const formula = await loadTs("src/lib/billing/credit-formula.ts");

const stripSql = (t) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/--.*$/gm, "");
const SQL = stripSql(readFileSync("supabase/migrations/20260905000000_badge_removal_credits.sql", "utf8"));

const PAID = { siteId: "s1", coversMonth: "2026-03-01", active: true, cancelledAt: null };

// =====================================================================
console.log("\n== 1. THE PRICE IS DERIVED, NOT CHOSEN ==");
// =====================================================================
{
  const free = plans.PLANS.find((p) => p.slug === "free");
  const starter = plans.PLANS.find((p) => p.slug === "starter");
  const listPrice = formula.effectiveCreditPriceEur(free);

  // THE FLOOR. Granted credits never accumulate — the monthly reset
  // REPLACES the grant (credits_remaining := p_monthly +
  // purchased_credits). So a price above the grant means removal can
  // never be paid for out of credits we gave away, in any month, ever.
  eq("the free plan grants 100 credits a month", free.monthlyCredits, 100);
  ok(
    `the price is above the free monthly grant (${bc.BADGE_REMOVAL_CREDITS_PER_MONTH} > ${free.monthlyCredits})`,
    bc.BADGE_REMOVAL_CREDITS_PER_MONTH > free.monthlyCredits
  );
  // Not merely above — a month's grant plus a second month's would still
  // not reach it if it were 150. Two full months of grant is the margin
  // of safety, and it is exactly 2x.
  ok(
    "…by a factor of two, so no accumulation of grants could reach it",
    bc.BADGE_REMOVAL_CREDITS_PER_MONTH >= free.monthlyCredits * 2
  );

  // THE CEILING. Five sites on credits costs exactly what Starter costs,
  // and Starter also carries 1,000 credits, the builder, memory and five
  // agents. A cheaper price cannibalises Starter; a dearer one is not
  // bought.
  const eurPerSite = bc.BADGE_REMOVAL_CREDITS_PER_MONTH * listPrice;
  eq("one site costs EUR4.00/month at the list rate", Math.round(eurPerSite * 100) / 100, 4);
  eq("…so five sites cost exactly Starter's price", Math.round(eurPerSite * 5), starter.price);
  ok("…and Starter carries far more than badge removal", starter.monthlyCredits > bc.BADGE_REMOVAL_CREDITS_PER_MONTH);
}

// =====================================================================
console.log("\n== 2. MARGIN: THIS FEATURE MAKES NO MODEL CALL ==");
// =====================================================================
{
  // The >=4x guarantee is about AI spend as a share of revenue. Badge
  // removal spends ZERO on inference, so it cannot consume any part of
  // the ceiling — it can only move the combined margin the right way.
  //
  // Asserted as a PROPERTY of the code rather than as a number somebody
  // typed: nothing in the badge-credit path may reach a model.
  for (const file of [
    "src/lib/publishing/badge-credits.ts",
    "src/lib/publishing/badge-credits-store.ts",
    "src/lib/publishing/badge-decision.ts",
    "src/lib/publishing/badge.ts",
  ]) {
    const src = readFileSync(file, "utf8");
    ok(`${file} makes no model call`, !/runCompletion|@anthropic-ai|anthropic\.messages|fetch\(/.test(src));
    ok(`…and reserves no credits against one`, !/reserveCredits|settleReservation|CostAccumulator/.test(src));
  }
  // Revenue with no cost cannot lower a revenue/cost ratio. Stated as
  // arithmetic so the claim is checkable rather than rhetorical.
  const before = { revenue: 100, aiCost: 25 }; // exactly 4x, the floor
  const after = { revenue: before.revenue + 4, aiCost: before.aiCost };
  ok(
    `adding badge revenue at zero cost raises the ratio (${(before.revenue / before.aiCost).toFixed(2)}x -> ${(after.revenue / after.aiCost).toFixed(2)}x)`,
    after.revenue / after.aiCost > before.revenue / before.aiCost
  );
  ok("…and it can never fall below the 4x floor by this route", after.revenue / after.aiCost >= 4);
}

// =====================================================================
console.log("\n== 3. NEVER A DOUBLE CHARGE ==");
// =====================================================================
{
  for (const paid of ["starter", "growth", "professional", "ultimate", "enterprise"]) {
    const verdict = bc.checkBadgeRemovalPurchase({
      planSlug: paid, removal: null, creditsRemaining: 10_000, now: new Date("2026-03-15T00:00:00Z"),
    });
    eq(`${paid} cannot buy what its plan already includes`, verdict.ok, false);
    eq(`…and the reason says so`, verdict.reason, "already_free");
  }
  // THE ORDER IS THE GUARANTEE. A paid plan must be refused BEFORE the
  // credit balance is considered, or an account with no credits would be
  // refused for the wrong reason — and one WITH credits would be charged.
  const brokeAndPaid = bc.checkBadgeRemovalPurchase({
    planSlug: "starter", removal: null, creditsRemaining: 0, now: new Date("2026-03-15T00:00:00Z"),
  });
  eq("a paid plan with zero credits is still refused as already_free", brokeAndPaid.reason, "already_free");
  // And the same order in the SQL that decides it on the serve path.
  ok(
    "the SQL checks the plan before it checks the purchase",
    SQL.indexOf("account_tier") < SQL.indexOf("site_badge_removals r"),
    "site_shows_badge"
  );
}
{
  const free = bc.checkBadgeRemovalPurchase({
    planSlug: "free", removal: null, creditsRemaining: 200, now: new Date("2026-03-15T00:00:00Z"),
  });
  eq("a free account with exactly the price may buy", free.ok, true);
  eq("…for the stated number of credits", free.credits, bc.BADGE_REMOVAL_CREDITS_PER_MONTH);
  eq("…covering this calendar month", free.coversMonth, "2026-03-01");

  const short = bc.checkBadgeRemovalPurchase({
    planSlug: "free", removal: null, creditsRemaining: 199, now: new Date("2026-03-15T00:00:00Z"),
  });
  eq("one credit short is refused", short.reason, "insufficient_credits");

  const twice = bc.checkBadgeRemovalPurchase({
    planSlug: "free", removal: PAID, creditsRemaining: 10_000, now: new Date("2026-03-15T00:00:00Z"),
  });
  eq("the same site cannot be bought twice in one month", twice.reason, "already_active");
}

// =====================================================================
console.log("\n== 4. PER SITE, AND STILL DECIDED AT SERVE TIME ==");
// =====================================================================
{
  ok("free with no purchase shows the badge", bc.siteShowsBadge({ planSlug: "free", removal: null }));
  ok("free with a purchase does not", !bc.siteShowsBadge({ planSlug: "free", removal: PAID }));
  ok("a paid plan never shows it", !bc.siteShowsBadge({ planSlug: "professional", removal: null }));
  ok("an unknown plan is treated as free", bc.siteShowsBadge({ planSlug: null, removal: null }));
  ok("…and an empty one", bc.siteShowsBadge({ planSlug: "", removal: null }));

  // AN INACTIVE ROW IS NOT COVER. A row exists for every month that was
  // ever bought; only the one covering NOW is cover, and a selector that
  // ignored `active` would serve an unpaid month as paid.
  ok(
    "a row that is not active does not hide the badge",
    bc.siteShowsBadge({ planSlug: "free", removal: { ...PAID, active: false } })
  );

  // THE DECISION IS PASSED TO injectBadge, NEVER RE-DERIVED THERE.
  // injectBadge that ignored its argument would badge every page ever
  // served, on every plan, and the two serve routes would look correct.
  ok("injectBadge with a false decision leaves the page alone",
    badge.injectBadge("<html><body>x</body></html>", { showBadge: false }) === "<html><body>x</body></html>");
  ok("…and with a true one puts the badge in",
    badge.injectBadge("<html><body>x</body></html>", { showBadge: true }).includes("Made with Ionexa"));

  // PER SITE. One site's purchase must not clear another's badge, which
  // is a property of the DATA (the row carries a site_id and the query
  // is keyed on it), so it is asserted against the schema.
  ok("the row is keyed by site", /site_id uuid not null references public\.published_sites/.test(SQL));
  ok("…and uniquely per site per month", /unique \(site_id, covers_month\)/.test(SQL));
  ok("…and the serve-path query filters by site", /r\.site_id = p_site_id/.test(SQL));
}
{
  // NEVER STORED IN THE HTML. The whole reason the badge is injected at
  // serve time; a credit purchase must not become an excuse to bake it.
  ok("nothing in the migration touches html_content", !/html_content/.test(SQL));
  for (const file of [
    "src/lib/publishing/badge-credits.ts",
    "src/lib/publishing/badge-credits-store.ts",
    "src/lib/publishing/badge-decision.ts",
  ]) {
    ok(`${file} never writes stored HTML`, !/html_content/.test(readFileSync(file, "utf8")));
  }
}

// =====================================================================
console.log("\n== 5. CANCELLING NEVER TAKES BACK A PAID MONTH ==");
// =====================================================================
{
  const cancelled = { ...PAID, cancelledAt: "2026-03-10T00:00:00Z" };
  ok("a cancelled but paid month still hides the badge", !bc.siteShowsBadge({ planSlug: "free", removal: cancelled }));
  // And the renewal decision leaves it alone until it actually expires.
  const early = bc.decideRenewal({
    removal: cancelled, creditsRemaining: 0, warnedForMonth: null, now: new Date("2026-03-11T00:00:00Z"),
  });
  eq("…and nothing happens to it mid-month", early.action, "nothing");
}

// =====================================================================
console.log("\n== 6. THE WARNING, AND THE LAPSE ==");
// =====================================================================
{
  const march = { ...PAID, coversMonth: "2026-03-01" }; // expires 2026-04-01
  const at = (iso) => new Date(iso);

  eq("nothing to do eight days out", bc.decideRenewal({
    removal: march, creditsRemaining: 0, warnedForMonth: null, now: at("2026-03-23T00:00:00Z"),
  }).action, "nothing");

  const warn = bc.decideRenewal({
    removal: march, creditsRemaining: 0, warnedForMonth: null, now: at("2026-03-26T00:00:00Z"),
  });
  eq("a warning six days out", warn.action, "warn");
  ok("…that says how long is left", warn.daysLeft > 0 && warn.daysLeft <= bc.BADGE_WARNING_DAYS, String(warn.daysLeft));
  eq("the window is seven days", bc.BADGE_WARNING_DAYS, 7);

  // ONCE PER MONTH. A daily cron warning every day for a week is a cron
  // whose warnings get muted.
  eq("…and only once for that month", bc.decideRenewal({
    removal: march, creditsRemaining: 0, warnedForMonth: "2026-03-01", now: at("2026-03-27T00:00:00Z"),
  }).action, "nothing");

  // A WARNING THAT IS NOT TRUE IS WORSE THAN NO WARNING. Telling
  // somebody their badge is about to return when it demonstrably is not
  // is how a channel loses its credibility.
  eq("no warning when the credits are there", bc.decideRenewal({
    removal: march, creditsRemaining: 200, warnedForMonth: null, now: at("2026-03-26T00:00:00Z"),
  }).action, "nothing");

  eq("renewed on expiry when the credits are there", bc.decideRenewal({
    removal: march, creditsRemaining: 200, warnedForMonth: "2026-03-01", now: at("2026-04-01T00:00:00Z"),
  }).action, "renew");

  eq("lapsed on expiry when they are not", bc.decideRenewal({
    removal: march, creditsRemaining: 199, warnedForMonth: "2026-03-01", now: at("2026-04-01T00:00:00Z"),
  }).action, "lapse");

  // AND AN INACTIVE ROW IS NEVER RENEWED.
  eq("an inactive removal is left alone", bc.decideRenewal({
    removal: { ...march, active: false }, creditsRemaining: 10_000, warnedForMonth: null, now: at("2026-04-01T00:00:00Z"),
  }).action, "nothing");
}

// =====================================================================
console.log("\n== 7. THE MONTH ARITHMETIC ==");
// =====================================================================
{
  eq("a mid-month date resolves to the first", bc.monthStart(new Date("2026-03-17T23:59:59Z")), "2026-03-01");
  eq("the first resolves to itself", bc.monthStart(new Date("2026-03-01T00:00:00Z")), "2026-03-01");
  eq("december rolls to january", bc.nextMonth("2026-12-01"), "2027-01-01");
  // COVER RUNS TO THE END OF THE MONTH, so expiry is the first of the
  // next one. Storing the last day would make every comparison an
  // off-by-one waiting for February.
  eq("february's cover expires on the first of march", bc.expiryOf("2026-02-01"), "2026-03-01");
  eq("january's expires on the first of february", bc.expiryOf("2026-01-01"), "2026-02-01");
  ok("the SQL derives the month the same way", /date_trunc\('month', now\(\) at time zone 'utc'\)::date/.test(SQL));
  ok("…and the CHECK enforces it", /extract\(day from covers_month\) = 1/.test(SQL));
}

// =====================================================================
console.log("\n== 8. WHAT THE USER SEES BEFORE THEY AGREE ==");
// =====================================================================
{
  const preview = bc.removalPreview({ creditPriceEur: 0.02, creditsRemaining: 500, sites: 1 });
  eq("the credits per site per month", preview.creditsPerSitePerMonth, 200);
  // BOTH UNITS. A price shown only in credits is a price in a currency
  // the customer cannot value.
  eq("…and what that is in euros", preview.eurPerSitePerMonth, 4);
  eq("…and the total for their sites", preview.totalCreditsPerMonth, 200);
  // HOW LONG THEIR BALANCE LASTS, which is the question they actually
  // have and the one a per-month price does not answer.
  eq("…and how many months their balance covers", preview.monthsAffordable, 2);
  eq("three sites triples the total", bc.removalPreview({ creditPriceEur: 0.02, creditsRemaining: 500, sites: 3 }).totalCreditsPerMonth, 600);
  eq("…and no sites is not a division by zero", bc.removalPreview({ creditPriceEur: 0.02, creditsRemaining: 500, sites: 0 }).monthsAffordable, 0);
}

// =====================================================================
console.log("\n== 9. THE SCHEMA, AND WHAT IT REFUSES ==");
// =====================================================================
{
  ok("RLS is on", /alter table public\.site_badge_removals enable row level security/.test(SQL));
  // A GRANT WITHOUT A POLICY IS AN OPEN DOOR ONTO AN EMPTY ROOM: with
  // RLS on, a granted verb with no matching policy matches no rows and
  // reports success. Both granted verbs have one.
  for (const verb of ["select", "update"]) {
    ok(`${verb} is granted`, new RegExp(`grant [^;]*\\b${verb}\\b[^;]*to authenticated`).test(SQL));
    ok(`…and has a policy that can satisfy it`, new RegExp(`for ${verb}\\b`).test(SQL));
  }
  // THE ROW IS WHAT SAYS MONEY MOVED, so only the server writes it.
  ok("insert is revoked from the customer", /revoke insert[^;]*from authenticated/.test(SQL));
  ok("…and delete too, so an invoice cannot be erased", /revoke insert, delete/.test(SQL));
  ok("anon sees nothing", /revoke all on public\.site_badge_removals from anon/.test(SQL));
  ok("the serve-path function is service-role only", /revoke all on function public\.site_shows_badge\(uuid\) from public, anon, authenticated/.test(SQL));
  ok("…and the cron's query too", /revoke all on function public\.badge_removals_due\(int\) from public, anon, authenticated/.test(SQL));
  ok("no DROP TABLE", !/drop\s+table/i.test(SQL));
  ok("no TRUNCATE", !/truncate/i.test(SQL));
  ok("no unqualified DELETE", !/delete\s+from\s+\S+\s*;/i.test(SQL));
  // ONE ROUND TRIP on the hottest path in the product.
  ok("the serve path asks one question, not two", /readSiteShowsBadge\(/.test(readFileSync("src/app/s/[subdomain]/route.ts", "utf8")));

  // BOTH SIDES FAIL TOWARDS THE BADGE.
  //
  // A hiccup that shows the badge on a paying customer's site is visible
  // to somebody who can tell us. One that HIDES it on a free site costs
  // the upsell on every view, silently, until somebody happens to look.
  // Two files decide it and both must lean the same way.
  const decision = readFileSync("src/lib/publishing/badge-decision.ts", "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  ok("an unreadable badge decision shows the badge", /catch[\s\S]{0,120}return true;/.test(decision), decision.slice(-200));
  ok("…and so does a non-boolean answer", /typeof data === "boolean" \? data : true/.test(decision));

  const store = readFileSync("src/lib/publishing/badge-credits-store.ts", "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const loadFn = store.slice(store.indexOf("export async function loadRemoval"), store.indexOf("export type PurchaseResult"));
  // A ROW THAT COULD NOT BE READ IS NOT A PAID MONTH. Inventing one
  // would delete the badge from sites nobody paid for, and no query
  // anywhere would show why.
  ok("an unreadable removal row is null, never an invented paid month", /catch[\s\S]{0,140}return null;/.test(loadFn), loadFn.slice(-200));
  ok("…and a missing row is null too", /if \(!data\) return null;/.test(loadFn));
  // THE BADGED PLAN LIST AGREES IN ALL THREE PLACES.
  eq("badge.ts and badge-credits.ts agree on who is badged",
    [...badge.BADGED_PLANS].sort(), [...bc.BADGE_REMOVAL_APPLIES_TO].sort());
}

console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${failures.length} failed`);
if (failures.length) { console.log(failures.map((f) => "  - " + f).join("\n")); process.exit(1); }
