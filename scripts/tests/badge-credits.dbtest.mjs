// BADGE REMOVAL WITH CREDITS, AGAINST A REAL POSTGRES (V4 #25 extension).
//
// badge-credits.test.mjs reads the migration as TEXT and greps it. That
// catches a missing GRANT line; it cannot catch a GRANT that lands on a
// table with no matching POLICY, because that combination is not a
// syntax error — it is a door that opens onto an empty room. This file
// is the other half: the same migration, executed, with a real role
// doing the writing.
//
//   A GRANT WITHOUT A POLICY REPORTS SUCCESS AND CHANGES NOTHING. With
//   RLS on, `update` granted to authenticated and no `for update` policy
//   is not refused — it matches zero rows and returns UPDATE 0. The
//   customer's cancel button would then work perfectly in the UI, charge
//   them again next month, and leave no error anywhere. Section 2 does
//   the update as the user and then goes and LOOKS at the value.
//
//   CANCELLING MUST NOT DEPEND ON OUR API BEING UP, which is the whole
//   reason update is granted at all — and the exact reason insert and
//   delete are not: the row is what says money moved. Section 3.
//
//   FIRST OF THE MONTH, ALWAYS. The renewal query is an equality; a row
//   dated mid-month would never be found and never be renewed, and the
//   cover would lapse silently with the credits sitting there. Section 4.
//
//   AT MOST ONCE PER SITE PER MONTH. Two browser tabs must not be able
//   to charge 400 credits for one month of one site. Section 5.
//
//   THE PLAN IS CHECKED BEFORE THE PURCHASE. A Starter+ account already
//   has the badge removed by its plan; the visible result of charging it
//   credits anyway is identical — the badge is gone either way — so only
//   the order distinguishes taking money for something already sold.
//   Section 6 asks the function itself, including for a site it has
//   never heard of, which must fail TOWARDS the badge.
//
//   A BOOLEAN ABOUT SOMEBODY ELSE'S ACCOUNT. site_shows_badge is
//   SECURITY DEFINER over tables the visitor cannot read, so it is
//   service-role only. Section 7.
//
//   A CANCELLED ROW IS NOT A RENEWAL, and neither is one already
//   renewed. Section 8 runs the cron's own query.
//
//   A DELETED ACCOUNT THAT LEAVES ITS PURCHASE BEHIND — and a deleted
//   SITE, which is the one the foreign key on user_id alone would miss.
//   Section 9.
//
// Run: node scripts/tests/badge-credits.dbtest.mjs   (needs a database;
// run through `npm run test:db`, which provisions one)
import { execFileSync } from "node:child_process";

let pass = 0;
const failures = [];
const ok = (name, cond, detail) => {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { failures.push(name); console.log(`  FAIL  ${name}${detail !== undefined ? "\n        " + detail : ""}`); }
};
const eq = (name, actual, expected) =>
  ok(name, actual === expected, `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);

const PSQL_TAG = /^(BEGIN|COMMIT|ROLLBACK|SET|DO|INSERT \d+ \d+|UPDATE \d+|DELETE \d+|SELECT \d+)$/;
function answer(out) {
  const lines = out.split("\n").map((l) => l.trim()).filter((l) => l !== "" && !PSQL_TAG.test(l));
  return lines.length === 0 ? "" : lines[lines.length - 1];
}
const dbArgs = () => (process.env.DATABASE_URL ? ["-d", process.env.DATABASE_URL] : ["-d", process.env.PGDATABASE]);
function sql(query) {
  return answer(
    execFileSync("psql", [...dbArgs(), "-v", "ON_ERROR_STOP=1", "-tAc", query], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] })
  );
}
function trySql(query) {
  try {
    return { ok: true, out: sql(query) };
  } catch (err) {
    return { ok: false, error: String(err.stderr || err.stdout || err.message) };
  }
}
function tryAs(role, userId, query) {
  const script = `set local role ${role};
set local request.jwt.claim.sub = '${userId}';
set local request.jwt.claim.role = '${role}';
${query}`;
  try {
    return {
      ok: true,
      out: answer(
        execFileSync("psql", [...dbArgs(), "-v", "ON_ERROR_STOP=1", "-tAc", `begin; ${script}; commit;`], {
          encoding: "utf8",
          stdio: ["ignore", "pipe", "pipe"],
        })
      ),
    };
  } catch (err) {
    return { ok: false, error: String(err.stderr || err.stdout || err.message) };
  }
}

// Ids that cannot collide with anything a human or another test made.
const OWNER = "eeeeeeee-0000-0000-0000-000000000201";
const OTHER = "eeeeeeee-0000-0000-0000-000000000202";
const PAID = "eeeeeeee-0000-0000-0000-000000000203";
const DOOMED = "eeeeeeee-0000-0000-0000-000000000204";
const SITEDOOM = "eeeeeeee-0000-0000-0000-000000000205";
const CRON = "eeeeeeee-0000-0000-0000-000000000206";
const ALL_USERS = [OWNER, OTHER, PAID, DOOMED, SITEDOOM, CRON];

sql(`delete from auth.users where id in (${ALL_USERS.map((u) => `'${u}'`).join(", ")})`);
sql(`insert into auth.users (id, email) values
  ('${OWNER}', 'badge-owner@test.local'),
  ('${OTHER}', 'badge-other@test.local'),
  ('${PAID}', 'badge-paid@test.local'),
  ('${DOOMED}', 'badge-doomed@test.local'),
  ('${SITEDOOM}', 'badge-sitedoom@test.local'),
  ('${CRON}', 'badge-cron@test.local')`);

// A badge removal points at a published_site, which needs a user_website
// behind it. Both are built here with exactly their NOT NULL columns.
function makeSite(userId, n) {
  const websiteId = `eeeeeeee-0001-0000-0000-0000000002${n}`;
  const siteId = `eeeeeeee-0002-0000-0000-0000000002${n}`;
  sql(`insert into public.user_websites (id, user_id, name, html_content)
       values ('${websiteId}', '${userId}', 'badge dbtest ${n}', '<html></html>')`);
  sql(`insert into public.published_sites (id, website_id, user_id, subdomain, html_content)
       values ('${siteId}', '${websiteId}', '${userId}', 'badge-dbtest-${n}', '<html></html>')`);
  return siteId;
}

const SITE_A = makeSite(OWNER, "01");   // RLS, cancel, constraints
const SITE_B = makeSite(OWNER, "02");   // a free account's badge decision
const SITE_C = makeSite(PAID, "03");    // a paid account's badge decision
const SITE_D = makeSite(CRON, "04");    // due for renewal
const SITE_E = makeSite(CRON, "05");    // already renewed
const SITE_F = makeSite(CRON, "06");    // cancelled
const SITE_G = makeSite(CRON, "07");    // auto-renew switched off
const SITE_H = makeSite(DOOMED, "08");  // the account gets deleted
const SITE_I = makeSite(SITEDOOM, "09"); // the site gets deleted
const UNKNOWN_SITE = "eeeeeeee-0002-0000-0000-0000000002ff";

// Deliberately a month that can never BE the current month, so the
// constraint and uniqueness sections cannot collide with section 6's
// "is the badge showing right now" questions whatever day this runs.
const PAST = "2020-03-01";
const THIS_MONTH = sql(`select date_trunc('month', now() at time zone 'utc')::date`);
const PREV_MONTH = sql(`select (date_trunc('month', now() at time zone 'utc') - interval '1 month')::date`);

const ROW_A = "eeeeeeee-0003-0000-0000-000000000201";

console.log("== 1. WHAT THE BUYER MAY READ, AND WHAT EVERYBODY ELSE MAY NOT ==");
{
  // Written by the service role, as the purchase endpoint does. The
  // customer never inserts this row: it is what says money moved.
  sql(`insert into public.site_badge_removals (id, user_id, site_id, covers_month, credits_charged, credit_price_eur)
       values ('${ROW_A}', '${OWNER}', '${SITE_A}', '${PAST}', 200, 0.02)`);

  const mine = tryAs("authenticated", OWNER, `select count(*) from public.site_badge_removals;`);
  ok("the buyer can read their own purchase", mine.ok && mine.out === "1", mine.error ?? mine.out);

  const theirs = tryAs("authenticated", OTHER, `select count(*) from public.site_badge_removals;`);
  ok("…and nobody else's", theirs.ok && theirs.out === "0", theirs.error ?? theirs.out);

  const anon = tryAs("anon", OWNER, `select count(*) from public.site_badge_removals;`);
  ok("an anonymous visitor sees nothing", !anon.ok || anon.out === "0", anon.out);
}

console.log("\n== 2. CANCELLING IS A GRANT *AND* A POLICY, AND THE VALUE ACTUALLY MOVES ==");
{
  const cancel = tryAs(
    "authenticated",
    OWNER,
    `update public.site_badge_removals set auto_renew = false, cancelled_at = now() where id = '${ROW_A}';`
  );
  ok("the buyer can switch auto-renewal off themselves", cancel.ok, cancel.error);

  // THE POINT OF THIS SECTION. A granted verb with no matching policy is
  // not an error: it silently matches zero rows and psql prints UPDATE 0.
  // Believing the exit code would ship a cancel button that never
  // cancels, so go and look at the row.
  eq("…and the row actually changed", sql(`select auto_renew from public.site_badge_removals where id = '${ROW_A}'`), "f");
  eq(
    "…and the cancellation is stamped",
    sql(`select cancelled_at is not null from public.site_badge_removals where id = '${ROW_A}'`),
    "t"
  );

  // The mirror image: the same granted verb, aimed at somebody else's
  // row, IS the empty room. It reports success and must change nothing.
  const foreign = tryAs("authenticated", OTHER, `update public.site_badge_removals set auto_renew = true where id = '${ROW_A}';`);
  eq(
    "another account's update reaches no row",
    sql(`select auto_renew from public.site_badge_removals where id = '${ROW_A}'`),
    "f"
  );
  ok("…and is not an error either, which is exactly why the value was checked", foreign.ok, foreign.error);

  const steal = tryAs(
    "authenticated",
    OWNER,
    `update public.site_badge_removals set user_id = '${OTHER}' where id = '${ROW_A}';`
  );
  ok("…and the buyer cannot hand their row to somebody else", !steal.ok, steal.out);
}

console.log("\n== 3. THE ROW IS WHAT SAYS MONEY MOVED, SO ONLY THE SERVER WRITES IT ==");
{
  const forge = tryAs(
    "authenticated",
    OWNER,
    `insert into public.site_badge_removals (user_id, site_id, covers_month, credits_charged)
     values ('${OWNER}', '${SITE_A}', '${THIS_MONTH}', 200);`
  );
  ok("the customer cannot grant themselves a free month", !forge.ok, forge.out);

  const erase = tryAs("authenticated", OWNER, `delete from public.site_badge_removals where id = '${ROW_A}';`);
  ok("…nor delete a purchase", !erase.ok, erase.out);
  eq("…and the purchase is still there", sql(`select count(*) from public.site_badge_removals where id = '${ROW_A}'`), "1");

  // THE INSERT IS NOT THE ONLY WAY TO MANUFACTURE A PURCHASE. Cancelling
  // needs UPDATE, and a table-wide `grant update` hands over every
  // column: the policy's `with check` constrains user_id and nothing
  // else, so the owner of an EXPIRED row can move covers_month forward
  // and hand themselves the current month for nothing. Same outcome as
  // the refused insert above, reached through the door left open for the
  // cancel button. Only the two columns cancelling needs are writable.
  const extend = tryAs(
    "authenticated",
    OWNER,
    `update public.site_badge_removals set covers_month = '${THIS_MONTH}' where id = '${ROW_A}';`
  );
  eq(
    "…nor move an expired purchase forward into this month",
    sql(`select covers_month from public.site_badge_removals where id = '${ROW_A}'`),
    PAST
  );
  ok("…and the attempt is refused outright rather than silently ignored", !extend.ok, extend.out);

  const discount = tryAs(
    "authenticated",
    OWNER,
    `update public.site_badge_removals set credits_charged = 1 where id = '${ROW_A}';`
  );
  ok("…nor rewrite what they were charged", !discount.ok, discount.out);
  eq("…and the charge stands", sql(`select credits_charged from public.site_badge_removals where id = '${ROW_A}'`), "200");
}

console.log("\n== 4. A ROW THE RENEWAL QUERY COULD NEVER FIND CANNOT EXIST ==");
{
  const midMonth = trySql(
    `insert into public.site_badge_removals (user_id, site_id, covers_month, credits_charged)
     values ('${OWNER}', '${SITE_B}', '2020-03-15', 200);`
  );
  ok("a cover month that is not the first is refused", !midMonth.ok, midMonth.out);

  const zero = trySql(
    `insert into public.site_badge_removals (user_id, site_id, covers_month, credits_charged)
     values ('${OWNER}', '${SITE_B}', '${PAST}', 0);`
  );
  ok("a purchase for zero credits is refused", !zero.ok, zero.out);

  const negative = trySql(
    `insert into public.site_badge_removals (user_id, site_id, covers_month, credits_charged)
     values ('${OWNER}', '${SITE_B}', '${PAST}', -200);`
  );
  ok("…and one for a negative number of them too", !negative.ok, negative.out);

  // AND A REAL PURCHASE IS ACCEPTED, so the CHECK is a rule rather than a
  // wall. A constraint nothing can satisfy passes every refusal above and
  // ships a feature that never works.
  const good = trySql(
    `insert into public.site_badge_removals (user_id, site_id, covers_month, credits_charged, credit_price_eur)
     values ('${OWNER}', '${SITE_B}', '${PAST}', 200, 0.02);`
  );
  ok("…and a first-of-the-month purchase is accepted", good.ok, good.error);
}

console.log("\n== 5. ONE MONTH OF ONE SITE CANNOT BE BOUGHT TWICE ==");
{
  const dup = trySql(
    `insert into public.site_badge_removals (user_id, site_id, covers_month, credits_charged)
     values ('${OWNER}', '${SITE_A}', '${PAST}', 200);`
  );
  ok("the same site cannot have two rows for the same month", !dup.ok, dup.out);

  const nextMonth = trySql(
    `insert into public.site_badge_removals (user_id, site_id, covers_month, credits_charged)
     values ('${OWNER}', '${SITE_A}', '2020-04-01', 200);`
  );
  ok("…but the month after it can be bought", nextMonth.ok, nextMonth.error);

  // Per SITE, never per account: two sites of one owner in one month is
  // two purchases, which is the whole reason the key is (site, month).
  eq("…and one owner holds cover on two sites in the same month", sql(
    `select count(*) from public.site_badge_removals where user_id = '${OWNER}' and covers_month = '${PAST}'`
  ), "2");
}

console.log("\n== 6. DOES THIS SITE SHOW THE BADGE, RIGHT NOW ==");
{
  eq("a free account with no purchase shows the badge", sql(`select public.site_shows_badge('${SITE_B}')`), "t");

  sql(`insert into public.site_badge_removals (user_id, site_id, covers_month, credits_charged, credit_price_eur)
       values ('${OWNER}', '${SITE_B}', '${THIS_MONTH}', 200, 0.02)`);
  eq("…and with one for THIS month it does not", sql(`select public.site_shows_badge('${SITE_B}')`), "f");

  // PAID PLANS ARE ANSWERED BEFORE THE CREDIT QUESTION IS ASKED. This is
  // the observable half of that order: a Starter account that has never
  // spent a credit already has the badge off, so nothing about a purchase
  // could have produced this answer.
  sql(`update auth.users
       set raw_user_meta_data = jsonb_set(coalesce(raw_user_meta_data, '{}'::jsonb), '{subscription_tier}', '"starter"')
       where id = '${PAID}'`);
  eq("a Starter account with no purchase at all does not show it", sql(`select public.site_shows_badge('${SITE_C}')`), "f");

  sql(`insert into public.site_badge_removals (user_id, site_id, covers_month, credits_charged, credit_price_eur)
       values ('${PAID}', '${SITE_C}', '${THIS_MONTH}', 200, 0.02)`);
  eq("…and a Starter account that was charged anyway looks identical", sql(`select public.site_shows_badge('${SITE_C}')`), "f");

  // FAILS TOWARDS THE BADGE. A badge shown by mistake on a paying site is
  // visible to somebody who can tell us; one hidden by mistake on a free
  // site costs the upsell silently on every view.
  eq("a site nobody has heard of shows the badge", sql(`select public.site_shows_badge('${UNKNOWN_SITE}')`), "t");

  // THE ORDER ITSELF IS UNOBSERVABLE THROUGH THE ANSWER. Both branches
  // return false, so swapping them changes no boolean this section could
  // read — every assertion above passes with the credit question asked
  // first. It is read off the function that is IN THE DATABASE instead:
  // badge-credits.test.mjs greps the migration file, which says nothing
  // about what a hotfix left running.
  eq(
    "the deployed function asks about the plan before it asks about credits",
    sql(`select p1 > 0 and p2 > 0 and p1 < p2 from (
           select position('account_tier' in prosrc) as p1,
                  position('site_badge_removals r' in prosrc) as p2
           from pg_proc where proname = 'site_shows_badge' and pronamespace = 'public'::regnamespace
         ) q`),
    "t"
  );
}

console.log("\n== 7. THE SERVE-PATH ANSWER IS FOR THE SERVER ONLY ==");
{
  const asUser = tryAs("authenticated", OWNER, `select public.site_shows_badge('${SITE_C}');`);
  ok("a signed-in customer cannot ask about a site", !asUser.ok, asUser.out);

  const asAnon = tryAs("anon", OWNER, `select public.site_shows_badge('${SITE_C}');`);
  ok("…nor can the anonymous visitor whose page view it is for", !asAnon.ok, asAnon.out);

  const cronAsUser = tryAs("authenticated", OWNER, `select count(*) from public.badge_removals_due();`);
  ok("…and the cron's query is not callable either", !cronAsUser.ok, cronAsUser.out);

  const cronAsAnon = tryAs("anon", OWNER, `select count(*) from public.badge_removals_due();`);
  ok("…by anybody", !cronAsAnon.ok, cronAsAnon.out);
}

console.log("\n== 8. WHAT THE DAILY CRON HAS TO LOOK AT ==");
{
  const ROW_D = "eeeeeeee-0003-0000-0000-000000000204";
  const ROW_E = "eeeeeeee-0003-0000-0000-000000000205";
  const ROW_F = "eeeeeeee-0003-0000-0000-000000000206";
  const ROW_G = "eeeeeeee-0003-0000-0000-000000000207";

  sql(`insert into public.user_credits (user_id, credits_remaining, credits_total)
       values ('${CRON}', 4242, 5000)`);

  // Cover bought for LAST month ends on the first of THIS one, which is
  // already past whatever day this runs.
  sql(`insert into public.site_badge_removals (id, user_id, site_id, covers_month, credits_charged) values
       ('${ROW_D}', '${CRON}', '${SITE_D}', '${PREV_MONTH}', 200),
       ('${ROW_E}', '${CRON}', '${SITE_E}', '${PREV_MONTH}', 200),
       ('${ROW_F}', '${CRON}', '${SITE_F}', '${PREV_MONTH}', 200),
       ('${ROW_G}', '${CRON}', '${SITE_G}', '${PREV_MONTH}', 200)`);
  // Already renewed: the next month is on the books for this site.
  sql(`insert into public.site_badge_removals (user_id, site_id, covers_month, credits_charged)
       values ('${CRON}', '${SITE_E}', '${THIS_MONTH}', 200)`);
  sql(`update public.site_badge_removals set cancelled_at = now(), auto_renew = false where id = '${ROW_F}'`);
  sql(`update public.site_badge_removals set auto_renew = false where id = '${ROW_G}'`);

  eq("a cover that has run out is due", sql(`select count(*) from public.badge_removals_due() d where d.id = '${ROW_D}'`), "1");
  // The balance comes back with the row so the caller does not issue one
  // query per row — a daily job over every site otherwise does.
  eq("…and carries the owner's balance with it", sql(`select d.credits_remaining from public.badge_removals_due() d where d.id = '${ROW_D}'`), "4242");

  eq("one already renewed for the next month is not due", sql(`select count(*) from public.badge_removals_due() d where d.id = '${ROW_E}'`), "0");
  eq("a cancelled one is not due", sql(`select count(*) from public.badge_removals_due() d where d.id = '${ROW_F}'`), "0");
  eq("…nor is one with auto-renewal simply switched off", sql(`select count(*) from public.badge_removals_due() d where d.id = '${ROW_G}'`), "0");
}

console.log("\n== 9. WHAT A DELETED ACCOUNT, AND A DELETED SITE, TAKE WITH THEM ==");
{
  sql(`insert into public.site_badge_removals (user_id, site_id, covers_month, credits_charged)
       values ('${DOOMED}', '${SITE_H}', '${PAST}', 200)`);
  sql(`insert into public.site_badge_removals (user_id, site_id, covers_month, credits_charged)
       values ('${SITEDOOM}', '${SITE_I}', '${PAST}', 200)`);

  // trySql, not sql: without the cascade these are a foreign-key error
  // rather than a wrong count, and an uncaught throw here would take the
  // whole file down instead of naming the one thing that broke.
  const dropAccount = trySql(`delete from auth.users where id = '${DOOMED}';`);
  ok("a deleted account is not held back by its purchases", dropAccount.ok, dropAccount.error);
  eq("…and takes them with it", sql(`select count(*) from public.site_badge_removals where user_id = '${DOOMED}'`), "0");

  // THE FOREIGN KEY ON user_id ALONE WOULD MISS THIS ONE. The account
  // stays; only the site goes, and a purchase pointing at a site that no
  // longer exists is a row no query would ever find again.
  const dropSite = trySql(`delete from public.published_sites where id = '${SITE_I}';`);
  ok("a deleted site is not held back by them either", dropSite.ok, dropSite.error);
  eq("…and takes them with it too", sql(`select count(*) from public.site_badge_removals where site_id = '${SITE_I}'`), "0");
  eq("…and leaves the account standing", sql(`select count(*) from auth.users where id = '${SITEDOOM}'`), "1");
}

// Left clean for the next run. auth.users cascades to user_websites,
// published_sites, user_credits and the badge removals behind them.
sql(`delete from auth.users where id in (${ALL_USERS.map((u) => `'${u}'`).join(", ")})`);

console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${failures.length} failed`);
if (failures.length) { console.log(failures.map((f) => "  - " + f).join("\n")); process.exit(1); }
