// The affiliate programme, and the four ways it could be robbed.
//
// This is the first feature in the app that PAYS MONEY OUT rather than
// taking it in, and every rule that stands between it and being farmed is
// exercised here against the situation an affiliate would construct
// deliberately:
//
//   1. Refer yourself, buy a plan, take 25% off your own subscription.
//   2. Re-refer somebody already referred, to restart the twelve months.
//   3. Get paid twice for one invoice by replaying a webhook.
//   4. Keep earning after month twelve.
//
// Rules 1, 2 and 4 are pure functions in lib/affiliate/rules.ts and are
// tested directly. Rule 3 is tested in two places on purpose — the
// function refuses a duplicate AND the database has a unique index —
// because a money rule enforced in one place is enforced until the next
// code path, and this data is written by a webhook, a cron and a signup
// handler, all of which can be reached twice for the same event.
//
// Run: node scripts/tests/affiliate.test.mjs
import { readFileSync, readdirSync } from "node:fs";
import { loadTs } from "./load-ts.mjs";

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
const read = (p) => readFileSync(p, "utf8");
const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const rules = await loadTs("src/lib/affiliate/rules.ts");
const {
  attributionDecision,
  commissionForInvoice,
  monthsSinceConversion,
  payoutDecision,
  clampRate,
  codeFromBytes,
  isValidCodeShape,
  formatCents,
  COMMISSION_MONTHS,
  MIN_RATE,
  MAX_RATE,
  DEFAULT_RATE,
  MIN_PAYOUT_CENTS,
} = rules;

const AFFILIATE = "aaaaaaaa-0000-4000-8000-000000000001";
const REFERRED = "bbbbbbbb-0000-4000-8000-000000000002";

console.log("== 1. the terms are what the brief promises ==");
{
  check("commission runs for twelve months", COMMISSION_MONTHS, 12);
  check("the band is 20-30%", [MIN_RATE, MAX_RATE], [0.2, 0.3]);
  checkTrue("the default sits inside it", DEFAULT_RATE >= MIN_RATE && DEFAULT_RATE <= MAX_RATE);
  // A misconfigured rate costs a wrong-but-bounded payout rather than an
  // unbounded one.
  check("a rate above the band is clamped", clampRate(0.9), 0.3);
  check("a rate below it is clamped", clampRate(0.01), 0.2);
  check("nonsense falls back to the default", clampRate(Number.NaN), DEFAULT_RATE);
}

console.log("\n== 2. referral codes are readable out loud ==");
{
  const code = codeFromBytes(new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7]));
  checkTrue(`generated codes pass their own shape check (${code})`, isValidCodeShape(code));
  // 0/O and 1/I/L are the characters that get misread off a screen and
  // mistyped from a phone call, and a mistyped code credits nobody.
  for (const forbidden of ["0", "O", "1", "I", "L"]) {
    let seen = false;
    for (let i = 0; i < 64; i++) {
      if (codeFromBytes(new Uint8Array([i, i + 1, i + 2, i + 3, i + 4, i + 5, i + 6, i + 7])).includes(forbidden)) {
        seen = true;
      }
    }
    checkTrue(`"${forbidden}" never appears in a code`, !seen);
  }
  check("lowercase is rejected", isValidCodeShape("abcdefgh"), false);
  check("the wrong length is rejected", isValidCodeShape("ABC"), false);
  check("a non-string is rejected", isValidCodeShape(null), false);
  check("an injection attempt is rejected", isValidCodeShape("' OR 1=1--"), false);
}

console.log("\n== 3. FRAUD 1: you cannot refer yourself ==");
{
  check(
    "the same account on both sides is refused",
    attributionDecision({ affiliateUserId: AFFILIATE, referredUserId: AFFILIATE }),
    { attribute: false, reason: "self_referral" }
  );
  check(
    "a different account is fine",
    attributionDecision({ affiliateUserId: AFFILIATE, referredUserId: REFERRED }),
    { attribute: true }
  );
}

console.log("\n== 4. FRAUD 2: first touch wins, permanently ==");
{
  check(
    "an already-referred person cannot be re-referred",
    attributionDecision({
      affiliateUserId: AFFILIATE,
      referredUserId: REFERRED,
      existingReferralAffiliateId: "cccccccc-0000-4000-8000-000000000003",
    }),
    { attribute: false, reason: "already_attributed" }
  );
  // The subtle one: re-attributing to the SAME affiliate would move
  // converted_at and hand out a fresh twelve months. It is refused too.
  check(
    "not even by the same affiliate, which would restart the clock",
    attributionDecision({
      affiliateUserId: AFFILIATE,
      referredUserId: REFERRED,
      existingReferralAffiliateId: AFFILIATE,
    }),
    { attribute: false, reason: "already_attributed" }
  );
  check(
    "an unknown code attributes nothing",
    attributionDecision({ affiliateUserId: null, referredUserId: REFERRED }),
    { attribute: false, reason: "unknown_code" }
  );
  check(
    "a suspended affiliate earns nothing new",
    attributionDecision({
      affiliateUserId: AFFILIATE,
      affiliateStatus: "suspended",
      referredUserId: REFERRED,
    }),
    { attribute: false, reason: "affiliate_inactive" }
  );
}

console.log("\n== 5. FRAUD 3: one invoice, one commission ==");
{
  const base = {
    referralStatus: "converted",
    convertedAt: new Date("2026-01-15T00:00:00Z"),
    invoiceAmountCents: 2000,
    rate: 0.25,
    alreadyRecorded: false,
    paidAt: new Date("2026-01-15T00:00:00Z"),
  };
  check("a fresh invoice pays", commissionForInvoice(base), {
    pay: true,
    commissionCents: 500,
    rate: 0.25,
    periodMonth: 1,
  });
  check(
    "the same invoice a second time pays nothing",
    commissionForInvoice({ ...base, alreadyRecorded: true }),
    { pay: false, reason: "already_paid_for_invoice" }
  );
}

console.log("\n== 6. FRAUD 4: the window really closes ==");
{
  const convertedAt = new Date("2026-01-15T00:00:00Z");
  const at = (iso) => commissionForInvoice({
    referralStatus: "converted",
    convertedAt,
    invoiceAmountCents: 2000,
    rate: 0.25,
    alreadyRecorded: false,
    paidAt: new Date(iso),
  });

  check("month 1 pays", at("2026-01-15T00:00:00Z").periodMonth, 1);
  check("month 12 still pays", at("2026-12-15T00:00:00Z").periodMonth, 12);
  check("month 13 does not", at("2027-01-15T00:00:00Z"), { pay: false, reason: "window_expired" });
  check("and neither does much later", at("2030-01-15T00:00:00Z").pay, false);

  // Calendar months, not 30-day blocks. A conversion on the 31st must not
  // quietly earn a thirteenth month.
  check("the day before the anniversary is still the previous month", monthsSinceConversion(convertedAt, new Date("2026-02-14T23:00:00Z")), 1);
  check("the anniversary starts the next month", monthsSinceConversion(convertedAt, new Date("2026-02-15T00:00:00Z")), 2);
}

console.log("\n== 7. the arithmetic is in cents and rounds towards the company ==");
{
  const c = (amount, rate) =>
    commissionForInvoice({
      referralStatus: "converted",
      convertedAt: new Date("2026-01-01T00:00:00Z"),
      invoiceAmountCents: amount,
      rate,
      alreadyRecorded: false,
      paidAt: new Date("2026-01-01T00:00:00Z"),
    });
  // 999 * 0.25 = 249.75. Rounding UP would let a large number of tiny
  // invoices pay out more commission than was ever charged.
  check("a fractional cent rounds down", c(999, 0.25).commissionCents, 249);
  check("the result is always an integer", Number.isInteger(c(1234, 0.27).commissionCents), true);
  // An out-of-band rate is clamped, and the payout follows the clamp.
  check("a 90% rate pays 30%", c(1000, 0.9), { pay: true, commissionCents: 300, rate: 0.3, periodMonth: 1 });
  check("a zero invoice pays nothing", c(0, 0.25), { pay: false, reason: "zero_amount" });
  check("a negative invoice pays nothing", c(-5000, 0.25), { pay: false, reason: "zero_amount" });
  // 1 cent at 25% floors to 0 — paying zero is not a payment.
  check("an amount too small to earn a cent pays nothing", c(1, 0.25), { pay: false, reason: "zero_amount" });
  check("cents format as euros", formatCents(1234), "€12.34");
  check("zero formats too", formatCents(0), "€0.00");
}

console.log("\n== 8. a referral that has not paid, or was voided, earns nothing ==");
{
  const base = {
    invoiceAmountCents: 2000,
    rate: 0.25,
    alreadyRecorded: false,
    paidAt: new Date("2026-01-15T00:00:00Z"),
  };
  check(
    "pending earns nothing",
    commissionForInvoice({ ...base, referralStatus: "pending", convertedAt: null }),
    { pay: false, reason: "not_converted" }
  );
  check(
    "void earns nothing, even inside the window",
    commissionForInvoice({ ...base, referralStatus: "void", convertedAt: new Date("2026-01-01T00:00:00Z") }),
    { pay: false, reason: "referral_void" }
  );
}

console.log("\n== 9. who gets paid, and in what order the reasons are checked ==");
{
  const ready = {
    accruedCents: 5000,
    stripeAccountId: "acct_123",
    payoutsEnabled: true,
    status: "active",
  };
  check("a verified affiliate over the minimum is paid", payoutDecision(ready), {
    pay: true,
    amountCents: 5000,
  });
  check(
    "below the minimum it is carried forward",
    payoutDecision({ ...ready, accruedCents: MIN_PAYOUT_CENTS - 1 }),
    { pay: false, reason: "below_minimum" }
  );
  check(
    "no Connect account, no payout",
    payoutDecision({ ...ready, stripeAccountId: null }),
    { pay: false, reason: "no_connect_account" }
  );
  check(
    "Stripe has not verified them yet",
    payoutDecision({ ...ready, payoutsEnabled: false }),
    { pay: false, reason: "payouts_disabled" }
  );
  // ORDER MATTERS: suspension is checked before everything else, so an
  // account suspended for fraud is not paid merely because it happens to
  // have a verified bank account and a healthy balance.
  check(
    "suspension beats a perfectly good Connect account",
    payoutDecision({ ...ready, status: "suspended" }),
    { pay: false, reason: "suspended" }
  );
  checkTrue(`the minimum is worth a transfer fee (${MIN_PAYOUT_CENTS} cents)`, MIN_PAYOUT_CENTS >= 1000);
}

console.log("\n== 10. the database enforces the same rules ==");
{
  // Renumbered into main's ordered migration chain when this feature
  // was salvaged onto main; the old root-level file is the convention
  // main abandoned.
  const sql = read("supabase/migrations/20260820000000_affiliate.sql");
  // Rule 2, as an index. This is the line that makes "first touch wins"
  // true rather than intended.
  checkTrue(
    "one referrer per person, ever",
    /referred_user_id uuid not null unique references auth\.users\(id\)/.test(sql)
  );
  // Rule 3, as an index. Stripe documents that a webhook can be delivered
  // more than once for the same event.
  checkTrue("one commission per invoice", /stripe_invoice_id text not null unique/.test(sql));
  checkTrue("one affiliate account per user", /user_id uuid not null unique references auth\.users\(id\)/.test(sql));
  // Rule: the band, as a CHECK. A rate outside 20-30% must not be
  // STORABLE, not merely un-writable by today's code.
  checkTrue(
    "the commission band is a database constraint",
    /commission_rate[\s\S]{0,120}check \(commission_rate >= 0\.200 and commission_rate <= 0\.300\)/.test(sql)
  );
  checkTrue("the window is a database constraint", /period_month integer not null check \(period_month between 1 and 12\)/.test(sql));
  checkTrue("money is stored as integer cents", /commission_cents integer not null check \(commission_cents > 0\)/.test(sql));
  checkTrue("the code's alphabet is a database constraint", /check \(code ~ '\^\[A-HJ-NP-Z2-9\]\{8\}\$'\)/.test(sql));

  // Every table readable by its owner and writable by nobody. This is
  // money: the only writers are service-role paths with a Stripe event or
  // a verified session behind them.
  for (const table of ["affiliates", "affiliate_referrals", "affiliate_commissions", "affiliate_payouts"]) {
    checkTrue(`${table}: RLS is on`, new RegExp(`alter table public\\.${table} enable row level security`).test(sql));
    const policies = [...sql.matchAll(new RegExp(`create policy "[^"]+" on public\\.${table}\\s+for (\\w+)`, "g"))].map((m) => m[1]);
    check(`${table}: read-only to its owner`, policies, ["select"]);
  }

  // The claim has to be one statement, or two concurrent payout runs both
  // read the same accrued rows and both send the money.
  checkTrue("claiming commissions for a payout is atomic", /create or replace function public\.claim_affiliate_commissions/.test(sql));
  checkTrue(
    "...and is service-role only",
    /grant execute on function public\.claim_affiliate_commissions[^;]*to service_role/i.test(sql) &&
      /revoke all on function public\.claim_affiliate_commissions[^;]*from authenticated/i.test(sql)
  );
  checkTrue("the migration is idempotent", !/create table (?!if not exists)/.test(sql));

  // On main the schema of record is the ORDERED MIGRATION CHAIN, not the
  // root backup file — that file is a snapshot nothing ever built a
  // database from, and main archived it for exactly that reason (see
  // security-posture.test.mjs's header). So the invariant here is that
  // every affiliate table is created by a file the migration runner
  // actually executes.
  const chain = readdirSync("supabase/migrations")
    .filter((f) => f.endsWith(".sql"))
    .map((f) => read(`supabase/migrations/${f}`))
    .join("\n");
  for (const table of ["affiliates", "affiliate_referrals", "affiliate_commissions", "affiliate_payouts"]) {
    checkTrue(
      `${table} is created by the migration chain`,
      chain.includes(`create table if not exists public.${table}`)
    );
  }
}

console.log("\n== 11. the share link is inert ==");
{
  const route = stripComments(read("src/app/r/[code]/route.ts"));
  // An unauthenticated URL anyone can hit a million times must not write a
  // row per hit, and must not become an oracle for enumerating codes.
  checkTrue("it touches no database", !/createAdminClient|createClient|from\(/.test(route));
  checkTrue("it checks the shape before setting anything", /isValidCodeShape\(code\)/.test(route));
  checkTrue("the cookie cannot be read by script", /httpOnly: true/.test(route));
  // A ?next= here would be an open redirect on a URL designed to be shared
  // by strangers.
  checkTrue("the destination is fixed", /new URL\("\/signup", url\.origin\)/.test(route));
  checkTrue("...and comes from nothing in the request", !/searchParams\.get\("next"\)/.test(route));

  const cookie = await loadTs("src/lib/affiliate/cookie.ts");
  checkTrue("the cookie name is shared, not duplicated", typeof cookie.REFERRAL_COOKIE === "string");
  checkTrue("the window is 90 days", cookie.REFERRAL_COOKIE_MAX_AGE === 90 * 24 * 60 * 60);
}

console.log("\n== 12. attribution happens once, at signup ==");
{
  for (const [label, file] of [
    ["password signup", "src/app/api/signup/route.ts"],
    ["OAuth signup", "src/app/auth/callback/route.ts"],
  ]) {
    const src = stripComments(read(file));
    checkTrue(`${label}: attributes the referral`, /attributeReferral\(\{/.test(src));
    checkTrue(`${label}: reads the shared cookie name`, /REFERRAL_COOKIE/.test(src));
    // A signup must never fail because of somebody else's commission.
    //
    // Two shapes are legitimate and both appear in the codebase: an
    // awaited call inside `try { } catch (err) {` (the OAuth callback),
    // and a promise started early with `.catch((err) => {` attached (the
    // password route, where the write is deliberately overlapped with the
    // credit grant and the sign-in — see scripts/tests/signup-latency).
    // What is checked is that the rejection is HANDLED and logged under
    // the affiliate stage, not which of the two spellings does it.
    checkTrue(
      `${label}: a failure cannot break the signup`,
      /catch\s*\(\(?err\)?\s*(?:=>\s*)?\{[\s\S]{0,200}affiliate_attribution/.test(src)
    );
  }
  // The OAuth route runs on every LOGIN, not only the first one. Attributing
  // outside the bootstrap branch would let an existing user pick up a
  // referral cookie years after signing up.
  const callback = read("src/app/auth/callback/route.ts");
  const bootstrapAt = callback.indexOf("if (needsBootstrap)");
  checkTrue(
    "OAuth attribution is inside the new-account branch only",
    bootstrapAt > 0 && callback.indexOf("await attributeReferral({") > bootstrapAt
  );
}

console.log("\n== 13. commission is earned on money actually received ==");
{
  const webhook = stripComments(read("src/app/api/webhooks/stripe/route.ts"));
  checkTrue("commission hangs off invoice.paid", /case "invoice\.paid"[\s\S]{0,900}recordAffiliateCommission/.test(webhook));
  // `total` would include amounts covered by credit or discount that the
  // company never received.
  checkTrue("it uses amount_paid, not the invoice total", /invoice\.amount_paid/.test(webhook));
  checkTrue("...and never the total", !/invoice\.total/.test(webhook));
  // A refund or a won dispute means the money went back.
  checkTrue("a refund reverses it", /case "charge\.refunded"[\s\S]{0,700}reverseCommissionForInvoice/.test(webhook));
  checkTrue("a lost dispute reverses it", /case "charge\.dispute\.closed"/.test(webhook));

  const store = stripComments(read("src/lib/affiliate/store.ts"));
  // Only ACCRUED rows reverse. A commission already transferred cannot be
  // un-transferred by a database update, and pretending otherwise makes
  // the balance wrong in the other direction.
  checkTrue(
    "only unpaid commission can be reversed",
    /update\(\{ status: "reversed" \}\)[\s\S]{0,200}\.eq\("status", "accrued"\)/.test(store)
  );
  // The first payment starts the clock; without this the very first
  // invoice would be refused as "not converted" and month 1 lost.
  checkTrue("the first paid invoice converts the referral", /status: "converted", converted_at/.test(store));
  checkTrue("a suspended affiliate stops earning", /affiliate\.status === "suspended"[\s\S]{0,120}affiliate_inactive/.test(store));
  // Lifetime earnings must not include money that was taken back.
  checkTrue("reversed commission is excluded from lifetime", /lifetimeCents: sum\("accrued"\) \+ sum\("paid"\)/.test(store));
}

console.log("\n== 14. paying out cannot double-send or silently write off ==");
{
  const connect = stripComments(read("src/lib/affiliate/connect.ts"));
  checkTrue("rows are claimed atomically before any transfer", /claim_affiliate_commissions/.test(connect));
  checkTrue(
    "...and only what the claim returned is sent",
    /const amountCents = Number\(claimed \?\? 0\)[\s\S]{0,600}amount: amountCents/.test(connect)
  );
  checkTrue("Stripe gets an idempotency key too", /idempotencyKey: `affiliate_payout_\$\{payoutId\}`/.test(connect));
  // Money not sent must not stay marked paid.
  checkTrue(
    "a failed transfer puts the commission back",
    /update\(\{ status: "accrued", payout_id: null \}\)/.test(connect)
  );
  // payouts_enabled is Stripe's fact, not ours.
  checkTrue("payability is re-read from Stripe", /stripe\.accounts\.retrieve/.test(connect));
  checkTrue(
    "...and requires no outstanding requirements",
    /account\.requirements\?\.disabled_reason == null/.test(connect)
  );
  // Express, not Custom: Stripe owns the KYC and this app never sees a
  // passport scan or an IBAN.
  checkTrue("Connect accounts are Express", /type: "express"/.test(connect));
  checkTrue("only transfers are requested", /capabilities: \{ transfers: \{ requested: true \} \}/.test(connect));

  const cron = stripComments(read("src/app/api/cron/affiliate-payouts/route.ts"));
  checkTrue("the payout run is behind the cron guard", /checkCronAuth\(request\)/.test(cron));
  checkTrue("it re-reads payability per affiliate", /refreshPayoutsEnabled\(affiliate\)/.test(cron));
  checkTrue("it uses the shared decision", /payoutDecision\(\{/.test(cron));
  checkTrue("one affiliate's failure does not stop the rest", /catch \(err\)[\s\S]{0,200}skipped\.error/.test(cron));

  const vercel = JSON.parse(read("vercel.json"));
  checkTrue(
    "payouts are scheduled",
    (vercel.crons ?? []).some((c) => c.path === "/api/cron/affiliate-payouts")
  );
}

console.log("\n== 15. the dashboard shows earnings, not other people ==");
{
  const dash = stripComments(read("src/components/affiliate/affiliate-dashboard.tsx"));
  // Somebody signing up must not have their identity handed to whoever's
  // link they clicked.
  checkTrue("no referred person's email is rendered", !/referred_user|\.email/.test(dash));
  for (const stat of ["signups", "paying", "owed", "paidOut"]) {
    checkTrue(`the ${stat} number is shown`, new RegExp(`"${stat}"`).test(dash));
  }
  checkTrue("the terms are stated on the page", /t\("terms"/.test(dash));
  // The question people actually ask.
  checkTrue("it says why a payout has not happened", /payoutsIncomplete|payoutsNotSetUp/.test(dash));
  checkTrue("a suspended account is told so", /t\("suspended"\)/.test(dash));
}

console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
