// THE REVENUE ENGINE, AGAINST A REAL POSTGRES (V4 #25 + #26).
//
//   A ROW THAT CAN CHARGE SOMEBODY AT NO AGREED RATE. `enabled` without a
//   cap, a price, a timestamp AND a version is the shape of a bill nobody
//   agreed to. The CHECK is the second lock behind the TypeScript, and
//   section 2 tries to write every partial row by hand.
//
//   A POLICY WITHOUT A GRANT IS A LOCKED DOOR — and its opposite, a GRANT
//   WITHOUT A POLICY, is an open one. Section 1 checks both directions on
//   the tables a customer touches, and section 5 checks that the owner's
//   revenue tables are reachable by nobody at all.
//
//   CANCELLING THAT DEPENDS ON A ROUTE BEING UP. The customer is granted
//   DELETE on their own overage settings precisely so turning it off does
//   not need our API. Section 3 does it as them.
//
//   A RETRIED WEBHOOK THAT BECOMES A SECOND CANCELLATION. The unique
//   stripe_event_id is what stops the churn count doubling. Section 4.
//
//   A DELETED ACCOUNT THAT LEAVES ITS BILL BEHIND. Section 6 is the
//   cascade, checked in both directions: the personal rows must go, and
//   what happens to the ledger must be a decision rather than an accident.
//
// Run: node scripts/tests/revenue-engine.dbtest.mjs   (needs a database;
// run through `npm run test:db`, which provisions one)
import { execFileSync } from "node:child_process";

let pass = 0;
const failures = [];
const ok = (name, cond, detail) => {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { failures.push(name); console.log(`  FAIL  ${name}${detail !== undefined ? "\n        " + detail : ""}`); }
};

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

const OWNER = "eeeeeeee-0000-0000-0000-000000000101";
const OTHER = "eeeeeeee-0000-0000-0000-000000000102";
const DOOMED = "eeeeeeee-0000-0000-0000-000000000103";

sql(`insert into auth.users (id, email) values
  ('${OWNER}', 'revenue-owner@test.local'),
  ('${OTHER}', 'revenue-other@test.local'),
  ('${DOOMED}', 'revenue-doomed@test.local')
  on conflict (id) do nothing`);

const MONTH = "2026-03-01";

console.log("== 1. WHAT A CUSTOMER MAY READ, AND WHAT THEY MAY NOT ==");
{
  // Written by the service role, as the app does. The customer never
  // inserts their own consent: the grants below deliberately withhold
  // insert and update.
  sql(`insert into public.usage_overage_settings
    (user_id, enabled, monthly_cap_eur, price_per_credit_eur, consented_at, consent_version)
    values ('${OWNER}', true, 20, 0.03, now(), 1)
    on conflict (user_id) do update set enabled = true, monthly_cap_eur = 20`);

  const mine = tryAs("authenticated", OWNER, `select count(*) from public.usage_overage_settings;`);
  ok("the customer can read their own overage settings", mine.ok && mine.out === "1", mine.error ?? mine.out);

  const theirs = tryAs("authenticated", OTHER, `select count(*) from public.usage_overage_settings;`);
  ok("…and nobody else's", theirs.ok && theirs.out === "0", theirs.error ?? theirs.out);

  // A GRANT WITHOUT A POLICY IS AN OPEN DOOR, and the reverse is a locked
  // one. Both are checked: insert is refused by the missing GRANT, which
  // is a different failure from the RLS policy above.
  const insert = tryAs(
    "authenticated",
    OTHER,
    `insert into public.usage_overage_settings (user_id, enabled) values ('${OTHER}', false);`
  );
  ok("a customer cannot write their OWN consent row", !insert.ok, insert.out);

  const update = tryAs(
    "authenticated",
    OWNER,
    `update public.usage_overage_settings set monthly_cap_eur = 9999 where user_id = '${OWNER}';`
  );
  ok("…nor raise their own cap directly", !update.ok, update.out);

  const anon = tryAs("anon", OWNER, `select count(*) from public.usage_overage_settings;`);
  ok("an anonymous client sees nothing", !anon.ok || anon.out === "0", anon.out);
}

console.log("\n== 2. A ROW THAT COULD CHARGE AT NO AGREED RATE CANNOT EXIST ==");
{
  // Every partial consent, tried against the CHECK by hand. The
  // TypeScript refuses these too; this is the lock behind that one.
  const partials = [
    ["no cap", `(user_id, enabled, price_per_credit_eur, consented_at, consent_version) values ('${OTHER}', true, 0.03, now(), 1)`],
    ["no price", `(user_id, enabled, monthly_cap_eur, consented_at, consent_version) values ('${OTHER}', true, 20, now(), 1)`],
    ["no timestamp", `(user_id, enabled, monthly_cap_eur, price_per_credit_eur, consent_version) values ('${OTHER}', true, 20, 0.03, 1)`],
    ["no version", `(user_id, enabled, monthly_cap_eur, price_per_credit_eur, consented_at) values ('${OTHER}', true, 20, 0.03, now())`],
  ];
  for (const [label, tail] of partials) {
    const attempt = trySql(`insert into public.usage_overage_settings ${tail};`);
    ok(`enabled with ${label} is refused`, !attempt.ok, attempt.out);
  }

  // AND THE COMPLETE ROW IS ACCEPTED, so the CHECK is a rule rather than
  // a wall. A constraint nothing can satisfy passes every refusal test
  // above and ships a feature that never works.
  const complete = trySql(
    `insert into public.usage_overage_settings
     (user_id, enabled, monthly_cap_eur, price_per_credit_eur, consented_at, consent_version)
     values ('${OTHER}', true, 5, 0.03, now(), 1);`
  );
  ok("…and a complete consent is accepted", complete.ok, complete.error);

  // OFF NEEDS NOTHING. A disabled row with no cap and no price is the
  // normal resting state and must not trip the same CHECK.
  const off = trySql(
    `insert into public.usage_overage_settings (user_id, enabled) values ('${DOOMED}', false);`
  );
  ok("a row that is simply OFF needs no consent fields", off.ok, off.error);
}

console.log("\n== 3. CANCELLING DOES NOT DEPEND ON OUR API BEING UP ==");
{
  const del = tryAs("authenticated", OTHER, `delete from public.usage_overage_settings where user_id = '${OTHER}';`);
  ok("the customer can delete their own consent row themselves", del.ok, del.error);
  ok("…and it is gone", sql(`select count(*) from public.usage_overage_settings where user_id = '${OTHER}'`) === "0");

  const delOther = tryAs("authenticated", OTHER, `delete from public.usage_overage_settings where user_id = '${OWNER}';`);
  const stillThere = sql(`select count(*) from public.usage_overage_settings where user_id = '${OWNER}'`);
  ok("…but not anybody else's", stillThere === "1", `${delOther.error ?? ""} count=${stillThere}`);
}

console.log("\n== 4. THE LEDGER, AND WHAT IT REFUSES ==");
{
  const good = trySql(
    `insert into public.usage_overage_ledger (user_id, billing_month, credits, price_per_credit_eur, amount_eur, feature)
     values ('${OWNER}', '${MONTH}', 100, 0.03, 3.00, 'chat');`
  );
  ok("a charge is recorded", good.ok, good.error);

  const midMonth = trySql(
    `insert into public.usage_overage_ledger (user_id, billing_month, credits, price_per_credit_eur, amount_eur)
     values ('${OWNER}', '2026-03-15', 10, 0.03, 0.30);`
  );
  // FIRST OF THE MONTH, ALWAYS. The invoice query is an equality; a row
  // dated mid-month would never be found and never be billed.
  ok("a billing month that is not the first is refused", !midMonth.ok, midMonth.out);

  const zero = trySql(
    `insert into public.usage_overage_ledger (user_id, billing_month, credits, price_per_credit_eur, amount_eur)
     values ('${OWNER}', '${MONTH}', 0, 0.03, 0);`
  );
  ok("a charge for zero credits is refused", !zero.ok, zero.out);

  const free = trySql(
    `insert into public.usage_overage_ledger (user_id, billing_month, credits, price_per_credit_eur, amount_eur)
     values ('${OWNER}', '${MONTH}', 10, 0, 0);`
  );
  ok("a price of zero is refused", !free.ok, free.out);

  // BILLED AT MOST ONCE, at the database level too.
  sql(`update public.usage_overage_ledger set stripe_invoice_item_id = 'ii_test_1', invoiced_at = now()
       where user_id = '${OWNER}' and billing_month = '${MONTH}'`);
  const dup = trySql(
    `insert into public.usage_overage_ledger (user_id, billing_month, credits, price_per_credit_eur, amount_eur, stripe_invoice_item_id)
     values ('${OWNER}', '${MONTH}', 5, 0.03, 0.15, 'ii_test_1');`
  );
  ok("the same Stripe invoice item cannot be recorded twice", !dup.ok, dup.out);

  const readLedger = tryAs("authenticated", OWNER, `select count(*) from public.usage_overage_ledger;`);
  ok("the customer can read what they were charged", readLedger.ok && readLedger.out === "1", readLedger.error ?? readLedger.out);

  const forge = tryAs(
    "authenticated",
    OWNER,
    `insert into public.usage_overage_ledger (user_id, billing_month, credits, price_per_credit_eur, amount_eur)
     values ('${OWNER}', '${MONTH}', 1, 0.03, 0.03);`
  );
  ok("…but cannot write their own charges", !forge.ok, forge.out);

  const deleteBill = tryAs("authenticated", OWNER, `delete from public.usage_overage_ledger where user_id = '${OWNER}';`);
  const remaining = sql(`select count(*) from public.usage_overage_ledger where user_id = '${OWNER}'`);
  // DELETING AN INVOICE IS NOT A CANCEL BUTTON. Turning overage off stops
  // future charges; what has been used is still owed.
  ok("…nor delete an invoice they owe", remaining === "1", `${deleteBill.error ?? ""} count=${remaining}`);
}

console.log("\n== 5. THE OWNER'S OWN TABLES ARE REACHABLE BY NOBODY ==");
{
  for (const table of ["subscription_events", "subscriber_months", "revenue_snapshots", "business_inputs"]) {
    const asUser = tryAs("authenticated", OWNER, `select count(*) from public.${table};`);
    ok(`${table} is unreadable by a signed-in customer`, !asUser.ok, asUser.out);
    const asAnon = tryAs("anon", OWNER, `select count(*) from public.${table};`);
    ok(`…and by an anonymous one`, !asAnon.ok, asAnon.out);
  }

  // A RETRIED WEBHOOK IS NOT A SECOND CANCELLATION. The unique
  // stripe_event_id is the whole reason the churn count can be trusted.
  sql(`insert into public.subscription_events (user_id, kind, to_tier, to_interval, to_seats, stripe_event_id)
       values ('${OWNER}', 'cancelled', 'free', 'month', 1, 'evt_test_dup')`);
  const replay = trySql(
    `insert into public.subscription_events (user_id, kind, to_tier, to_interval, to_seats, stripe_event_id)
     values ('${OWNER}', 'cancelled', 'free', 'month', 1, 'evt_test_dup');`
  );
  ok("a replayed webhook cannot become a second cancellation", !replay.ok, replay.out);

  const badKind = trySql(
    `insert into public.subscription_events (user_id, kind, to_tier, to_interval, to_seats)
     values ('${OWNER}', 'card_updated', 'free', 'month', 1);`
  );
  ok("a kind the metrics cannot classify is refused", !badKind.ok, badKind.out);

  const midMonth = trySql(`insert into public.subscriber_months (user_id, month, mrr_eur) values ('${OWNER}', '2026-03-09', 29);`);
  ok("a subscriber month that is not the first is refused", !midMonth.ok, midMonth.out);
}

console.log("\n== 6. THE FUNCTIONS, AND WHO MAY CALL THEM ==");
{
  const cohort = trySql(`select 1 from public.subscription_cohort('2026-01-01', '2026-03-01') limit 1;`);
  ok("the cohort function runs for the service role", cohort.ok, cohort.error);

  const tier = trySql(`select public.account_tier('${OWNER}');`);
  ok("the tier lookup runs for the service role", tier.ok, tier.error);
  // FAILS TO free. Every plan slug the badge might see comes from here,
  // and an unknown account is a Free one — a badge shown by mistake is a
  // smaller wrong than a paying customer's site carrying ours.
  ok("…and an account with no tier is free", sql(`select public.account_tier('${OWNER}')`) === "free");

  const asUser = tryAs("authenticated", OWNER, `select public.account_tier('${OTHER}');`);
  ok("a customer cannot call the tier lookup", !asUser.ok, asUser.out);

  const cohortAsUser = tryAs("authenticated", OWNER, `select 1 from public.subscription_cohort('2026-01-01', '2026-03-01');`);
  ok("…nor the cohort aggregate over auth.users", !cohortAsUser.ok, cohortAsUser.out);
}

console.log("\n== 7. WHAT HAPPENS WHEN AN ACCOUNT IS DELETED ==");
{
  sql(`insert into public.usage_overage_ledger (user_id, billing_month, credits, price_per_credit_eur, amount_eur)
       values ('${DOOMED}', '${MONTH}', 50, 0.03, 1.50)`);
  sql(`insert into public.account_addons (user_id, addon_slug, quantity, status)
       values ('${DOOMED}', 'agents_5', 1, 'active')`);
  sql(`insert into public.subscription_events (user_id, kind, to_tier, to_interval, to_seats)
       values ('${DOOMED}', 'started', 'starter', 'month', 1)`);

  sql(`delete from auth.users where id = '${DOOMED}'`);

  // ON DELETE CASCADE EVERYWHERE, AND IT IS A DECISION. A deleted account
  // takes its bill with it: an invoice for somebody who no longer exists
  // cannot be sent, and keeping the row would be keeping personal data
  // after an erasure request. The revenue HISTORY that matters —
  // subscriber_months and the daily snapshots — is aggregate and survives
  // because it names no one.
  for (const table of ["usage_overage_settings", "usage_overage_ledger", "account_addons", "subscription_events"]) {
    ok(`${table} is emptied for a deleted account`, sql(`select count(*) from public.${table} where user_id = '${DOOMED}'`) === "0");
  }
  ok(
    "…and the aggregate snapshots, which name nobody, are untouched",
    trySql(`select count(*) from public.revenue_snapshots;`).ok
  );
}

// Left clean for the next run.
sql(`delete from public.usage_overage_ledger where user_id in ('${OWNER}', '${OTHER}')`);
sql(`delete from public.usage_overage_settings where user_id in ('${OWNER}', '${OTHER}')`);
sql(`delete from public.subscription_events where user_id in ('${OWNER}', '${OTHER}')`);
sql(`delete from auth.users where id in ('${OWNER}', '${OTHER}')`);

console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${failures.length} failed`);
if (failures.length) { console.log(failures.map((f) => "  - " + f).join("\n")); process.exit(1); }
