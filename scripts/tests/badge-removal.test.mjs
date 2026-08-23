// "Made with Ionexa" badge removal, paid with credits (V4 #25).
//
// The feature is one sentence — pay 200 credits, the badge goes away for a
// month — and every way it can go wrong is a way it loses money silently.
// This file asserts the five properties that stop that:
//
//   1. THE BADGE IS NEVER IN THE STORED HTML. Not written by publish, not
//      by live-edit, not by rollback, not by the generator. If it were,
//      a snapshot would answer a question only the current state may
//      answer, and a lapsed customer would keep the paid product forever.
//   2. THE RULE IS THE SAME EVERYWHERE. One pure function decides it, and
//      the serve route, the purchase route, the renewal cron and the
//      dashboard all call THAT function — so the page and the panel that
//      describes the page cannot disagree.
//   3. NOBODY IS CHARGED TWICE. A plan that includes badge removal is
//      refused at purchase and skipped at renewal.
//   4. IT FAILS IN THE SAFE DIRECTION. Unknown plan, unparseable date,
//      missing row: badge SHOWN. Never given away by accident.
//   5. THE CHARGE IS INSIDE THE CREDIT SYSTEM AND OUTSIDE THE AI MARGIN
//      REPORT — it costs no tokens, so a zero-cost row in ai_cost_log
//      would distort the one number that tells us whether the AI is
//      profitable.
//
// Run: node scripts/tests/badge-removal.test.mjs
import { readFileSync } from "node:fs";

let pass = 0,
  fail = 0;
function check(name, actual, expected) {
  const a = JSON.stringify(actual),
    e = JSON.stringify(expected);
  if (a === e) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    fail++;
    console.log(`  FAIL  ${name}\n        expected ${e}\n        actual   ${a}`);
  }
}
function checkTrue(name, cond, detail) {
  check(name, Boolean(cond), true);
  if (!cond && detail !== undefined) console.log(`        ${detail}`);
}

const { loadTs } = await import("./load-ts.mjs");
const badge = await loadTs("src/lib/publishing/badge.ts");
const plans = await loadTs("src/lib/billing/plans.ts");

const read = (f) => readFileSync(f, "utf8");
const DAY = 86_400_000;
const NOW = new Date("2026-06-15T12:00:00.000Z");
const SITE_URL = "https://ionexa.ai";

const ALL_PLANS = ["free", "starter", "growth", "professional", "ultimate", "enterprise"];

// ---------------------------------------------------------------------
console.log("== 1. the rule, across all six plans x every badge state ==");
// ---------------------------------------------------------------------
//
// This is the cross-product the requirement asked for, stated as a table
// so a change to any cell is visible in the diff rather than inferred.
//
// plan          | never bought | paid (future) | lapsed (past)
// free          | badge        | NO badge      | badge
// starter+      | NO badge     | NO badge      | NO badge   (included)
const FUTURE = new Date(NOW.getTime() + 10 * DAY).toISOString();
const PAST = new Date(NOW.getTime() - 1 * DAY).toISOString();

for (const slug of ALL_PLANS) {
  const includesFree = slug !== "free";

  const never = badge.resolveBadgeState({ planSlug: slug, paidUntil: null, now: NOW });
  check(`${slug}: never bought -> badge ${includesFree ? "hidden (plan)" : "shown"}`, never.showBadge, !includesFree);
  check(`${slug}: never bought -> reason`, never.reason, includesFree ? "included_in_plan" : "never_purchased");

  const paid = badge.resolveBadgeState({ planSlug: slug, paidUntil: FUTURE, now: NOW });
  check(`${slug}: inside a paid period -> no badge`, paid.showBadge, false);
  check(`${slug}: inside a paid period -> reason`, paid.reason, includesFree ? "included_in_plan" : "paid");

  const lapsed = badge.resolveBadgeState({ planSlug: slug, paidUntil: PAST, now: NOW });
  check(`${slug}: lapsed -> badge ${includesFree ? "still hidden (plan)" : "RETURNS"}`, lapsed.showBadge, !includesFree);
  check(`${slug}: lapsed -> reason`, lapsed.reason, includesFree ? "included_in_plan" : "lapsed");
}

// The exact requirement, spelled out: "αν τελειώσουν τα credits -> το badge
// επιστρέφει". No write makes that happen — the expiry passing is enough.
{
  const justBefore = new Date(NOW.getTime() + 1000).toISOString();
  check(
    "free: one second before expiry -> no badge",
    badge.resolveBadgeState({ planSlug: "free", paidUntil: justBefore, now: NOW }).showBadge,
    false
  );
  check(
    "free: one second after expiry -> badge is back, with no write anywhere",
    badge.resolveBadgeState({
      planSlug: "free",
      paidUntil: justBefore,
      now: new Date(NOW.getTime() + 2000),
    }).showBadge,
    true
  );
}

// Plan is checked BEFORE the paid period, so an account that bought a
// period and then upgraded is never told to buy again.
{
  const upgraded = badge.resolveBadgeState({ planSlug: "starter", paidUntil: FUTURE, now: NOW });
  checkTrue("an upgraded account with a live paid period reports includedInPlan", upgraded.includedInPlan);
  checkTrue("...so the purchase route's refusal triggers, not a second charge", upgraded.includedInPlan);
}

// ---------------------------------------------------------------------
console.log("\n== 2. it fails in the safe direction (badge SHOWN) ==");
// ---------------------------------------------------------------------
for (const [value, why] of [
  ["not-a-date", "an unparseable timestamp"],
  ["", "an empty string"],
  [undefined, "a column that does not exist yet"],
  [null, "an explicit null"],
]) {
  check(
    `free + ${why} -> badge shown`,
    badge.resolveBadgeState({ planSlug: "free", paidUntil: value, now: NOW }).showBadge,
    true
  );
}
check(
  "an unrecognised plan slug is treated as not including it",
  badge.resolveBadgeState({ planSlug: "platinum", paidUntil: null, now: NOW }).showBadge,
  true
);
check(
  "a null plan slug is treated as not including it",
  badge.resolveBadgeState({ planSlug: null, paidUntil: null, now: NOW }).showBadge,
  true
);

// ---------------------------------------------------------------------
console.log("\n== 3. strip-then-inject: a stored badge cannot decide anything ==");
// ---------------------------------------------------------------------
const PLAIN = "<!doctype html><html><body><h1>Acme</h1></body></html>";

{
  const out = badge.applyBadgeToServedHtml({
    html: PLAIN,
    planSlug: "free",
    paidUntil: null,
    now: NOW,
    siteUrl: SITE_URL,
  });
  checkTrue("an unpaid free site gets a badge", out.html.includes(badge.BADGE_MARKER));
  checkTrue("...containing the words a visitor reads", out.html.includes("Made with Ionexa"), out.html.slice(-200));
  checkTrue("...placed before </body>", /data-ionexa-badge[\s\S]*<\/body>/i.test(out.html));
  checkTrue("...and the customer's own markup is untouched", out.html.includes("<h1>Acme</h1>"));
  check("exactly one badge", out.html.split(badge.BADGE_MARKER).length - 1, 1);
}

{
  const out = badge.applyBadgeToServedHtml({
    html: PLAIN,
    planSlug: "free",
    paidUntil: new Date(NOW.getTime() + DAY).toISOString(),
    now: NOW,
    siteUrl: SITE_URL,
  });
  check("a paid site is served the bytes it stored, unchanged", out.html, PLAIN);
}

// THE CENTRAL CASE. Stored HTML that already contains a badge — the exact
// thing the requirement forbids ever happening — must not survive into a
// response for a paying customer, and must not double up for a free one.
{
  const poisoned = badge.injectBadge(PLAIN, SITE_URL);
  checkTrue("(setup) the poisoned document really does contain a badge", poisoned.includes(badge.BADGE_MARKER));

  const paidOut = badge.applyBadgeToServedHtml({
    html: poisoned,
    planSlug: "free",
    paidUntil: new Date(NOW.getTime() + DAY).toISOString(),
    now: NOW,
    siteUrl: SITE_URL,
  });
  check(
    "a PAID site whose stored bytes carry a badge is served WITHOUT one",
    paidOut.html.includes(badge.BADGE_MARKER),
    false
  );
  check("...and gets its original document back byte for byte", paidOut.html, PLAIN);

  const freeOut = badge.applyBadgeToServedHtml({
    html: poisoned,
    planSlug: "free",
    paidUntil: null,
    now: NOW,
    siteUrl: SITE_URL,
  });
  check(
    "an UNPAID site whose stored bytes carry a badge gets exactly one, not two",
    freeOut.html.split(badge.BADGE_MARKER).length - 1,
    1
  );
}

// A badge from an OLDER deploy (different copy, different padding) is
// still removed — matched on the marker, not on the exact markup.
{
  const oldStyle = `<!doctype html><html><body><p>hi</p><a ${badge.BADGE_MARKER}="1" href="#" style="color:red">Built with Ionexa</a></body></html>`;
  const stripped = badge.stripBadge(oldStyle);
  check("a differently-styled older badge is stripped", stripped.includes(badge.BADGE_MARKER), false);
  checkTrue("...leaving the page intact", stripped.includes("<p>hi</p>"));
}

// Idempotent: serving the same document twice cannot accumulate badges.
{
  let html = PLAIN;
  for (let i = 0; i < 5; i++) {
    html = badge.applyBadgeToServedHtml({
      html,
      planSlug: "free",
      paidUntil: null,
      now: NOW,
      siteUrl: SITE_URL,
    }).html;
  }
  check("five serves in a row still produce exactly one badge", html.split(badge.BADGE_MARKER).length - 1, 1);
}

// A document with no </body> still gets its badge — a generated page whose
// closing tag the model omitted is not a reason to give the product away.
{
  const fragment = "<h1>No body tag here</h1>";
  const out = badge.injectBadge(fragment, SITE_URL);
  checkTrue("a document with no </body> still gets a badge", out.includes(badge.BADGE_MARKER));
  checkTrue("...appended after the content", out.indexOf(badge.BADGE_MARKER) > out.indexOf("No body tag"));
}

// The badge has to render under the published-site CSP, which allows no
// external host at all.
{
  const markup = badge.badgeHtml(SITE_URL);
  checkTrue("the badge loads no external stylesheet", !/<link\b/i.test(markup), markup);
  checkTrue("the badge runs no script", !/<script\b/i.test(markup), markup);
  checkTrue("the badge fetches no external image", !/<img\b/i.test(markup), markup);
  checkTrue("the badge uses an inline SVG instead", markup.includes("<svg"), markup);
  checkTrue("the badge is out of flow, so no layout reflows", markup.includes("position:fixed"), markup);
  checkTrue("the badge link cannot reach back into the opener", markup.includes('rel="noopener'), markup);
}

// ---------------------------------------------------------------------
console.log("\n== 4. NOTHING WRITES A BADGE INTO STORED HTML ==");
// ---------------------------------------------------------------------
//
// The property the whole feature rests on. Asserted against the real
// source of every path that writes published_sites.html_content or
// site_versions.html_content.
const WRITE_PATHS = [
  "src/app/api/websites/[id]/publish/route.ts",
  "src/app/api/published/[id]/live-edit/route.ts",
  "src/app/api/published/[id]/rollback/route.ts",
  "src/lib/website-builder.ts",
  "src/lib/publishing/site-versions.ts",
];
for (const file of WRITE_PATHS) {
  const src = read(file);
  checkTrue(`${file} never injects a badge`, !src.includes("injectBadge") && !src.includes("BADGE_MARKER"), file);
  checkTrue(`${file} never writes the badge text`, !src.includes("Made with Ionexa"), file);
}

// And the one place that DOES inject is the one place that serves.
{
  const serve = read("src/app/s/[subdomain]/route.ts");
  checkTrue("the public serve route applies the badge", serve.includes("applyBadgeToServedHtml"), serve.slice(0, 200));
  checkTrue(
    "...from the site's CURRENT paid_until, not from the stored html",
    serve.includes("paidUntil: site.badge_removal_paid_until"),
    "the serve route must read the column"
  );
  checkTrue(
    "...and from the owner's CURRENT plan",
    serve.includes("loadOwnerPlanSlug"),
    "the serve route must resolve the plan"
  );
  checkTrue(
    "...with `now` evaluated per request, not module-scope",
    /now: new Date\(\)/.test(serve),
    "a module-scope Date would freeze the decision at boot"
  );
}

// ---------------------------------------------------------------------
console.log("\n== 5. never charged twice ==");
// ---------------------------------------------------------------------
{
  const route = read("src/app/api/published/[id]/badge-removal/route.ts");
  checkTrue("the purchase route refuses when the plan includes it", route.includes("included_in_plan"), route.slice(0, 200));
  checkTrue(
    "...decided by the SAME function the page is served with",
    route.includes("resolveBadgeState"),
    "a second copy of the rule could disagree with the page"
  );
  // The refusal has to come BEFORE any deduction, or the refund path is
  // the only thing standing between a Starter customer and a double charge.
  const refusalAt = route.indexOf("included_in_plan");
  const deductAt = route.indexOf("await deductCredits");
  checkTrue("...and the refusal is reached before any deduction", refusalAt > 0 && refusalAt < deductAt, `${refusalAt} vs ${deductAt}`);

  checkTrue("a failed period write refunds the charge", route.includes("badge_removal_refund"), route);
  checkTrue("...idempotently", route.includes("idempotencyKey"), route);
  checkTrue("the route is rate limited", route.includes("checkRateLimit"), route);
  checkTrue(
    "the badge columns are written with the service-role client",
    route.includes("createAdminClient"),
    "an owner-scoped write would be blocked by the guard trigger"
  );
}
{
  const cron = read("src/app/api/cron/badge-renewals/route.ts");
  checkTrue("the renewal cron skips plans that include it", cron.includes("planIncludesBadgeRemoval"), cron.slice(0, 200));
  checkTrue("the renewal is charged through deductCredits", cron.includes("deductCredits"), cron);
  checkTrue(
    "...so it appears in credit history",
    cron.includes("badge_removal_renewal"),
    "the action_type is what the history row shows"
  );
  checkTrue("the cron is authenticated", cron.includes("checkCronAuth"), cron);
  checkTrue(
    "an unaffordable renewal does not drive the balance negative",
    cron.includes("if (!deduction.ok)"),
    "the cron must handle an insufficient balance without writing"
  );
  checkTrue("the cron warns before expiry", cron.includes("shouldWarnAboutExpiry"), cron);
}
{
  const vercel = JSON.parse(read("vercel.json"));
  const paths = (vercel.crons ?? []).map((c) => c.path);
  checkTrue(
    "the renewal cron is actually scheduled (not a placeholder nobody calls)",
    paths.includes("/api/cron/badge-renewals"),
    paths.join(", ")
  );
}

// ---------------------------------------------------------------------
console.log("\n== 6. renewal and warning arithmetic ==");
// ---------------------------------------------------------------------
check("a period is 30 days", badge.BADGE_REMOVAL_PERIOD_DAYS, 30);
check("the warning is 7 days out", badge.BADGE_EXPIRY_WARNING_DAYS, 7);

{
  const fresh = badge.nextBadgePaidUntil(null, NOW);
  check("a first purchase runs 30 days from now", fresh.toISOString(), new Date(NOW.getTime() + 30 * DAY).toISOString());

  // Renewing early must not burn the days already paid for.
  const tenLeft = new Date(NOW.getTime() + 10 * DAY).toISOString();
  const extended = badge.nextBadgePaidUntil(tenLeft, NOW);
  check(
    "renewing with 10 days left extends to 40, not 30",
    extended.toISOString(),
    new Date(NOW.getTime() + 40 * DAY).toISOString()
  );

  // Renewing a lapsed period starts from now, not from the old expiry —
  // otherwise a site dormant for a year would buy a month that had
  // already elapsed.
  const longGone = new Date(NOW.getTime() - 300 * DAY).toISOString();
  check(
    "renewing a long-lapsed period runs 30 days from now",
    badge.nextBadgePaidUntil(longGone, NOW).toISOString(),
    new Date(NOW.getTime() + 30 * DAY).toISOString()
  );
}

{
  const warn = (daysLeft, notifiedAt) =>
    badge.shouldWarnAboutExpiry({
      paidUntil: new Date(NOW.getTime() + daysLeft * DAY).toISOString(),
      notifiedAt,
      now: NOW,
    });

  check("8 days out: too early to warn", warn(8, null), false);
  check("7 days out: warn", warn(7, null), true);
  check("1 day out: warn", warn(1, null), true);
  check("already lapsed: nothing left to warn about", warn(-1, null), false);
  check("never bought: nothing to warn about", badge.shouldWarnAboutExpiry({ paidUntil: null, notifiedAt: null, now: NOW }), false);

  // Once per period, not once per cron run — the job runs daily and would
  // otherwise send the same email seven times.
  check("already warned for this period: silent", warn(5, NOW.toISOString()), false);

  // ...but a renewal re-arms it with no reset column to remember.
  const renewedUntil = new Date(NOW.getTime() + 35 * DAY);
  check(
    "a stamp from the previous period does not suppress the next one",
    badge.shouldWarnAboutExpiry({
      paidUntil: renewedUntil.toISOString(),
      notifiedAt: new Date(NOW.getTime() - 25 * DAY).toISOString(),
      now: new Date(renewedUntil.getTime() - 3 * DAY),
    }),
    true
  );
}

// ---------------------------------------------------------------------
console.log("\n== 7. the price, and the margin it has to satisfy ==");
// ---------------------------------------------------------------------
check("the default price is 200 credits/month", badge.DEFAULT_BADGE_REMOVAL_CREDITS_PER_MONTH, 200);
check("with no env set, that is the price", badge.badgeRemovalCreditsPerMonth({}), 200);
check("an env override is honoured", badge.badgeRemovalCreditsPerMonth({ BADGE_REMOVAL_CREDITS_PER_MONTH: "150" }), 150);
for (const bad of ["abc", "-5", "12.5", "999999999", " "]) {
  check(
    `a malformed price ("${bad}") falls back to the default, never to 0`,
    badge.badgeRemovalCreditsPerMonth({ BADGE_REMOVAL_CREDITS_PER_MONTH: bad }),
    200
  );
}

// The margin claim, computed rather than asserted.
//
// Badge removal makes NO model call, so its real cost is EUR 0.00 and the
// revenue/cost ratio is unbounded — >=4x holds trivially and is therefore
// not the interesting number. What IS worth pinning is that the price is
// inside the credit system (so it respects the same ceiling as everything
// else) and is a sane fraction of the plan it substitutes for.
{
  const CREDIT_PRICE_EUR_LIST = 0.02; // Free/list rate
  const price = badge.DEFAULT_BADGE_REMOVAL_CREDITS_PER_MONTH;
  const revenueEur = price * CREDIT_PRICE_EUR_LIST;
  check("200 credits at the list rate is EUR 4.00/month/site", Number(revenueEur.toFixed(2)), 4);

  const starter = plans.getPlan("starter");
  const ratio = revenueEur / starter.price;
  checkTrue(
    `priced at ${(ratio * 100).toFixed(0)}% of the Starter upgrade it substitutes for`,
    ratio > 0.1 && ratio < 0.5,
    `EUR ${revenueEur} vs EUR ${starter.price}`
  );
  // BREAK-EVEN IS EXACTLY FIVE SITES, and that is the point of the number
  // rather than an accident of it: 5 x EUR 4.00 = EUR 20.00 = Starter. Up
  // to four sites, buying badge removal is strictly cheaper than
  // upgrading; at five it is a wash; beyond that the subscription wins. A
  // price that never crossed the subscription line would leave a customer
  // buying badges forever and never upgrading.
  check("five sites cost exactly a Starter subscription", revenueEur * 5, starter.price);
  checkTrue(
    "four sites are cheaper than upgrading, six are not",
    revenueEur * 4 < starter.price && revenueEur * 6 > starter.price,
    `4 x EUR ${revenueEur} vs EUR ${starter.price}`
  );
  // ...and one site must be affordable out of a Starter's own allowance,
  // so the number is not absurd relative to what a credit is worth.
  checkTrue(
    "one site is a fifth of a Starter's monthly credit allowance",
    price / starter.monthlyCredits <= 0.25,
    `${price} of ${starter.monthlyCredits}`
  );

  // Real cost is zero AI-side, so it must NOT enter the AI margin report.
  const marginReport = read("src/lib/billing/margin-report.ts");
  checkTrue(
    "the AI margin report reads ai_cost_log, which a badge charge never touches",
    marginReport.includes("ai_cost_log"),
    "a zero-cost row here would distort the AI margin figure"
  );
  const route = read("src/app/api/published/[id]/badge-removal/route.ts");
  checkTrue("the purchase route logs no AI cost", !route.includes("ai_cost_log") && !route.includes("CostAccumulator"), route);
  checkTrue(
    "...but does go through deductCredits, so it is inside the credit ceiling",
    route.includes("deductCredits"),
    route
  );
}

// ---------------------------------------------------------------------
console.log("\n== 8. the plan capability is the single boundary ==");
// ---------------------------------------------------------------------
for (const slug of ALL_PLANS) {
  const plan = plans.getPlan(slug);
  check(
    `${slug}.capabilities.freeBadgeRemoval is declared`,
    typeof plan.capabilities.freeBadgeRemoval,
    "boolean"
  );
  check(
    `${slug}: planIncludesBadgeRemoval agrees with the capability`,
    badge.planIncludesBadgeRemoval(slug),
    plan.capabilities.freeBadgeRemoval
  );
}
check("Free is the only plan that shows a badge", plans.PLANS.filter((p) => !p.capabilities.freeBadgeRemoval).map((p) => p.slug), ["free"]);

// The boundary must live in plans.ts and nowhere else — no hard-coded list
// of slugs anywhere in the badge code.
{
  const src = read("src/lib/publishing/badge.ts");
  for (const slug of ["starter", "growth", "professional", "ultimate"]) {
    checkTrue(
      `badge.ts hard-codes no "${slug}" check`,
      !new RegExp(`["']${slug}["']`).test(src),
      "moving the tier boundary must be one edit in plans.ts"
    );
  }
}

// ---------------------------------------------------------------------
console.log("\n== 9. the migration is idempotent and guards the columns ==");
// ---------------------------------------------------------------------
{
  const sql = read("v4_badge_removal_migration.sql");
  for (const col of [
    "badge_removal_paid_until",
    "badge_removal_auto_renew",
    "badge_removal_expiry_notified_at",
  ]) {
    checkTrue(`${col} is added if-not-exists`, new RegExp(`add column if not exists ${col}`).test(sql), sql.slice(0, 100));
  }
  checkTrue("the index is created if-not-exists", sql.includes("create index if not exists"), sql);
  checkTrue("the trigger is dropped before it is created", sql.includes("drop trigger if exists guard_badge_removal"), sql);
  checkTrue("the guard function is create-or-replace", sql.includes("create or replace function public.guard_badge_removal_columns"), sql);
  checkTrue(
    "the guard rejects a client write of paid_until",
    sql.includes("badge_removal_paid_until is set by billing"),
    sql
  );
  checkTrue("the guard function pins its search_path", sql.includes("set search_path = public"), sql);
  // The whole migration must also be in the file the schema gate reads.
  const backup = read("supabase_full_project_backup.sql");
  checkTrue(
    "the columns are in supabase_full_project_backup.sql",
    backup.includes("badge_removal_paid_until"),
    "the RLS/schema gate only reads the backup file"
  );
}

console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
