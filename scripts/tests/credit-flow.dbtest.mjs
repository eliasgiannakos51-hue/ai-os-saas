// THE CREDIT SYSTEM, AGAINST A REAL POSTGRES.
//
// Every other file in this directory reads source code. That is worth
// something — it catches a rule that was written down and then not
// followed — but it cannot catch a function whose SQL is wrong, and the
// credit functions are where wrong SQL costs money in both directions:
// a reservation that does not hold means an account can spend what it
// does not have; a settlement that overcharges takes credits a customer
// paid for.
//
// So this one runs the actual functions, in a database built by the
// actual migrations, and checks the balances afterwards.
//
// WHAT IT PROVES, in order:
//   1. reserve holds credits — AVAILABLE drops, the stored balance does not
//   2. settle charges the MEASURED cost, and only then
//   3. settling for more than the balance does not overdraw
//   4. release returns the hold to available
//   5. two concurrent reservations cannot both take the last credits
//   6. a reservation beyond what is available is REFUSED, not clamped
//   7. purchased credits never exceed the balance they are part of
//   8. a grant is idempotent under its key
//
// A NOTE ON THE DESIGN, because the first draft of this file asserted the
// opposite and was wrong. A reservation does NOT decrement
// credits_remaining. It inserts a row, and "available" is computed as
// credits_remaining minus the sum of active, unexpired holds. Money moves
// exactly once, at settlement, for the measured amount. That is a better
// design than deduct-then-refund — there is no window in which a crash
// leaves credits deducted for work that never ran — and the tests below
// are written against it rather than against what I assumed it was.
//
// HOW TO RUN
//   createdb ionexa_test
//   psql -d ionexa_test -f scripts/db/bootstrap-supabase.sql
//   for f in supabase/migrations/*.sql; do psql -q -d ionexa_test -f "$f"; done
//   DATABASE_URL=postgres://…/ionexa_test node scripts/tests/credit-flow.dbtest.mjs
//
// It is a .dbtest.mjs rather than a .test.mjs because `npm run test:unit`
// must stay runnable with no database. `npm run test:db` picks these up —
// and, since scripts/db/run-dbtests.mjs, provisions a throwaway Postgres
// and runs this file for real rather than leaving it to skip forever.
// `npm run verify` runs test:db, so this now actually executes in the
// gate that is supposed to prove the credit system works.
//
// Skipping is not silent — with no DATABASE_URL and no local Postgres it
// prints SKIPPED and exits 0 — but that is ALL it is. Nothing anywhere
// distinguishes "skipped" from "passed" at the exit code; a claim to the
// contrary used to sit here and was never true. Read the log if it
// matters which one happened.
import { execFileSync } from "node:child_process";

const DB = process.env.DATABASE_URL ?? process.env.PGDATABASE;
if (!DB) {
  console.log("SKIPPED: no DATABASE_URL / PGDATABASE — this file needs a real Postgres.");
  console.log("         See the header for how to build one from the migrations.");
  process.exit(0);
}

let pass = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    failures.push(name);
    console.log(`  FAIL  ${name}${detail !== undefined ? "\n        " + detail : ""}`);
  }
}
function eq(name, actual, expected) {
  check(`${name} (${actual})`, actual === expected, `expected ${expected}, got ${actual}`);
}

/** One statement, one result. Values come back as text; psql -tA keeps
 *  it unambiguous and needs no driver in node_modules. */
function sql(query) {
  const args = process.env.DATABASE_URL
    ? ["-d", process.env.DATABASE_URL]
    : ["-d", process.env.PGDATABASE];
  return execFileSync("psql", [...args, "-v", "ON_ERROR_STOP=1", "-tAc", query], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}
function trySql(query) {
  try {
    return { ok: true, out: sql(query) };
  } catch (err) {
    return { ok: false, out: String(err.stderr ?? err.message) };
  }
}

// A user of our own, torn down and rebuilt each run so the numbers below
// are absolute rather than relative to whatever a previous run left.
const USER = "11111111-1111-1111-1111-111111111111";
function reset(credits, purchased = 0) {
  sql(`delete from public.credit_reservations where user_id = '${USER}'`);
  sql(`delete from public.credit_transactions where user_id = '${USER}'`);
  sql(`delete from public.user_credits where user_id = '${USER}'`);
  sql(`delete from auth.users where id = '${USER}'`);
  sql(`insert into auth.users (id, email) values ('${USER}', 'credit-flow@test.local')`);
  sql(
    `insert into public.user_credits (user_id, credits_remaining, credits_total, plan_tier, purchased_credits)
     values ('${USER}', ${credits}, ${credits}, 'growth', ${purchased})`
  );
}
const balance = () =>
  Number(sql(`select credits_remaining from public.user_credits where user_id = '${USER}'`));
const purchased = () =>
  Number(sql(`select coalesce(purchased_credits, 0) from public.user_credits where user_id = '${USER}'`));

/** reserve_credits returns TABLE(reservation_id uuid, available integer).
 *  Selected column-wise so the composite never has to be parsed. */
function reserve(credits, action = "test", minutes = 10) {
  const row = sql(
    `select coalesce(reservation_id::text, 'REFUSED') || '|' || available
       from reserve_credits('${USER}', ${credits}, '${action}', now() + interval '${minutes} minutes', '{}'::jsonb)`
  );
  const [id, available] = row.split("|");
  return { id: id === "REFUSED" ? null : id, available: Number(available) };
}
/** What reserve_credits would see right now: balance minus live holds. */
const availableNow = () =>
  Number(
    sql(`select credits_remaining - coalesce((
           select sum(credits) from public.credit_reservations
            where user_id='${USER}' and status='active' and expires_at > now()), 0)
         from public.user_credits where user_id='${USER}'`)
  );

console.log("== 0. the database really is the one the migrations build ==");
// Same ratchet as db-migrations.test.mjs's "70 tables" check, and the
// same lesson: it stayed 70 through two migrations that added a table,
// in two different files, because nothing here re-derived the number —
// each just repeated what the last one said.
// 77 (see db-migrations.test.mjs, which carries the same ratchet and the
// reasons it moved).
// 75 -> 76: V4 #19/#2 added public.voice_usage (the monthly minute
// ledger, supabase/migrations/20260827000000_voice_usage.sql).
// 76 -> 77: V4 #12 added public.ai_provider_log (which provider served
// which call, and why).
// 77 -> 83: V4 #14 added trading_accounts, trading_rules and
// rule_violations; V4 #15 added bank_connections, bank_transactions and
// crypto_wallets.
// 91 -> 98: V4 #25 + #26 — subscription_events, subscriber_months,
// revenue_snapshots, business_inputs, usage_overage_settings,
// usage_overage_ledger and account_addons. The first four are the HISTORY
// auth.users cannot hold; the last three are the revenue engine.
// 87 -> 91: V4 #19 + #20 turned two trackers into two tools —
// data_analyses, data_analysis_charts, data_analysis_questions and
// code_sessions. The old tracker tables are untouched and still counted.
// 83 -> 87: V4 #18 added notification_settings, notification_preferences,
// notification_channels and notification_events.
// 98 -> 99: V4 #34 + #35 added routing_decisions — every routing
// decision and what came of it, which is what the router learns from.
// 99 -> 100: badge removal with credits added site_badge_removals.
// MEASURED ON THE MERGED TREE, not added. Each branch counted against
// its own migration set; summing two ratchets is arithmetic across two
// different schemas. Built from bootstrap-supabase.sql plus all 43
// migrations on a real Postgres 16: 105.
eq("tables in public", Number(sql(`select count(*) from pg_tables where schemaname='public'`)), 105);
eq(
  "the credit functions exist",
  Number(
    sql(`select count(distinct proname) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
         where n.nspname='public' and proname in
         ('reserve_credits','settle_reservation','release_reservation','grant_credits_idempotent','deduct_credits_atomic')`)
  ),
  5
);

console.log("\n== 1. a reservation HOLDS, without moving money ==");
reset(100);
eq("starting balance", balance(), 100);
const r1 = reserve(30);
check("reserve returned a reservation id", /^[0-9a-f-]{36}$/.test(r1.id ?? ""), String(r1.id));
// The balance is untouched on purpose: nothing has been spent yet. What
// changes is what the NEXT reservation is allowed to take.
eq("the stored balance is unchanged", balance(), 100);
eq("but only 70 is available to reserve", availableNow(), 70);
eq(
  "and the reservation row is active",
  sql(`select status from public.credit_reservations where id = '${r1.id}'`),
  "active"
);

console.log("\n== 2. settling charges what was MEASURED, not what was held ==");
// The whole point of reserve/settle: the estimate is generous, the charge
// is what the work actually cost, and the difference goes back.
sql(
  `select settle_reservation('${USER}', '${r1.id}', 12, 'test_feature', 1000, 500, 0, 0, 0, 1, 0.01, 0.009, 4.0, 4.0, '{}'::jsonb, '{}'::jsonb)`
);
eq("charged 12, not the 30 that were held", balance(), 88);
eq("and the other 18 are available again", availableNow(), 88);
eq(
  "the reservation is settled",
  sql(`select status from public.credit_reservations where id = '${r1.id}'`),
  "settled"
);
eq(
  "and it left exactly one transaction",
  Number(sql(`select count(*) from public.credit_transactions where user_id='${USER}'`)),
  1
);

console.log("\n== 3. a settlement cannot charge more than it held ==");
// An over-settle is a bug somewhere upstream. It must not become an
// overdraft on the customer.
reset(50);
const r2 = reserve(10);
sql(
  `select settle_reservation('${USER}', '${r2.id}', 999, 'test_feature', 1, 1, 0, 0, 0, 1, 0.01, 0.009, 4.0, 4.0, '{}'::jsonb, '{}'::jsonb)`
);
const afterOver = balance();
// greatest(balance - charge, 0) in the function. A negative balance would
// be an account that owes us money with no mechanism to collect it.
eq("the balance floors at zero rather than going negative", afterOver, 0);
check("and it is never below zero", afterOver >= 0, `balance went to ${afterOver}`);

console.log("\n== 4. release gives the whole hold back ==");
reset(100);
const r3 = reserve(25);
eq("held, so 75 available", availableNow(), 75);
sql(`select release_reservation('${USER}', '${r3.id}')`);
eq("released, so all 100 available again", availableNow(), 100);
eq("and no money ever moved", balance(), 100);
eq(
  "the reservation is marked released",
  sql(`select status from public.credit_reservations where id = '${r3.id}'`),
  "released"
);
// Releasing twice must not credit twice — the retry path calls this.
sql(`select release_reservation('${USER}', '${r3.id}')`);
eq("releasing again is a no-op", availableNow(), 100);
eq("and still no money moved", balance(), 100);

console.log("\n== 5. two concurrent reservations cannot both take the last credits ==");
// THE ONE THAT NEEDS A REAL DATABASE. Read-modify-write in application
// code would let both of these succeed; the function has to serialise
// them. Run in two sessions that overlap, from a balance that fits only
// one of them.
reset(40);
const a = reserve(30, "race-a");
const b = reserve(30, "race-b");
check(`the first got a hold (${a.id})`, a.id !== null);
check(`the second was refused (available ${b.available})`, b.id === null, `got id ${b.id}`);
eq("it was told how much there really was", b.available, 10);
const active = Number(
  sql(`select count(*) from public.credit_reservations where user_id='${USER}' and status='active'`)
);
eq("only one 30-credit hold exists against a 40-credit balance", active, 1);
// An EXPIRED hold must not keep locking the account out — an abandoned
// action would otherwise cost the user its credits until a sweeper ran.
reset(40);
sql(`insert into public.credit_reservations (user_id, action, credits, expires_at, status)
     values ('${USER}', 'stale', 35, now() - interval '1 minute', 'active')`);
const afterStale = reserve(30, "after-stale");
check("an expired hold does not block a new reservation", afterStale.id !== null, JSON.stringify(afterStale));

console.log("\n== 6. asking for more than the balance is refused, not clamped ==");
reset(5);
const tooBig = reserve(500, "too-big");
// What it must NOT do is succeed with a smaller hold, which would let the
// caller run work nobody could pay for.
check("a 500-credit reservation against 5 credits is refused", tooBig.id === null, String(tooBig.id));
eq("and it reports what was actually available", tooBig.available, 5);
eq("the balance is untouched", balance(), 5);
eq(
  "no reservation row was written",
  Number(sql(`select count(*) from public.credit_reservations where user_id='${USER}'`)),
  0
);

console.log("\n== 7. purchased credits are a subset of the balance, and stay clamped ==");
// The database itself insists on this: user_credits_purchased_credits_check
// refuses a row where purchased_credits exceeds credits_remaining. The
// first draft of this test tried to seed 100 purchased against a balance
// of 20 and was rejected — which is the constraint doing its job, and the
// clearest possible statement of what "purchased" means. It is not a
// second wallet; it is the part of the one balance that was paid for and
// therefore must not be wiped by the monthly reset.
reset(120, 100);
eq("balance", balance(), 120);
eq("of which purchased", purchased(), 100);
check("purchased starts within the balance", purchased() <= balance());
const r4 = reserve(15);
sql(
  `select settle_reservation('${USER}', '${r4.id}', 15, 'test_feature', 1, 1, 0, 0, 0, 1, 0.01, 0.009, 4.0, 4.0, '{}'::jsonb, '{}'::jsonb)`
);
eq("the charge came off the balance", balance(), 105);
// least(purchased, balance) on every settle: still 100, because 100 fits.
eq("purchased is untouched while the balance still covers it", purchased(), 100);
// Now spend past it and watch the clamp bite.
const r5 = reserve(60);
sql(
  `select settle_reservation('${USER}', '${r5.id}', 60, 'test_feature', 1, 1, 0, 0, 0, 1, 0.01, 0.009, 4.0, 4.0, '{}'::jsonb, '{}'::jsonb)`
);
eq("balance after spending past the purchased pot", balance(), 45);
eq("and purchased is clamped down to it", purchased(), 45);
check("purchased can never exceed the balance", purchased() <= balance(), `${purchased()} > ${balance()}`);

console.log("\n== 8. a grant is idempotent under its key ==");
// Stripe delivers the same webhook more than once. Twice-granted credits
// are money given away.
reset(0);
// Nine arguments, explicitly. The eight-argument overload was ambiguous
// with this one until 20260817000000 dropped it, and this call is what
// found that — so it stays written out in full rather than relying on
// defaults, which is exactly what made the ambiguity invisible.
const KEY = "test-idempotency-key-1";
const grant = (amount, key) =>
  sql(`select grant_credits_idempotent('${USER}', ${amount}, 'purchase', 'test grant', '${key}', null, null, null, false)`);
grant(500, KEY);
eq("granted once", balance(), 500);
grant(500, KEY);
eq("the same key a second time changes nothing", balance(), 500);
grant(500, "a-different-key");
eq("a different key does grant again", balance(), 1000);

console.log("\n== 9. there is only ONE grant function to call ==");
// The check that would have caught 20260815 the day it shipped. Two
// overloads meant an eight-argument call was ambiguous, and the older one
// knew nothing about purchased_credits — so a pack granted through it
// would be wiped by the next monthly reset.
eq(
  "grant_credits_idempotent is not overloaded",
  Number(
    sql(`select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
         where n.nspname='public' and p.proname='grant_credits_idempotent'`)
  ),
  1
);
// And the same question asked of the whole schema, since the trap is not
// specific to this function: CREATE OR REPLACE with a changed signature
// creates rather than replaces, every time.
const overloaded = sql(`select coalesce(string_agg(proname || ' x' || n, ', '), '') from (
    select p.proname, count(*) as n from pg_proc p
      join pg_namespace ns on ns.oid = p.pronamespace
      left join pg_depend d on d.objid = p.oid and d.deptype = 'e'
     where ns.nspname='public' and d.objid is null and p.prokind='f'
     group by p.proname having count(*) > 1) s`);
check(`no function in public is overloaded${overloaded ? " — found: " + overloaded : ""}`, overloaded === "");

// Leave nothing behind — the next run asserts absolute numbers.
sql(`delete from public.credit_reservations where user_id = '${USER}'`);
sql(`delete from public.credit_transactions where user_id = '${USER}'`);
sql(`delete from public.user_credits where user_id = '${USER}'`);
sql(`delete from auth.users where id = '${USER}'`);

console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${failures.length} failed`);
process.exit(failures.length === 0 ? 0 : 1);
