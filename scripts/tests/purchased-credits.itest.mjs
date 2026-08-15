// Purchased credits never expire — against a REAL PostgreSQL.
//
// THE MONEY BUG THIS CLOSES. A credit pack ADDS to
// user_credits.credits_remaining. Three paths then wrote that column back
// down to the plan's monthly allotment: invoice.paid (every renewal), a
// plan change, and the end of a cancelled subscription. A 5,000-credit
// pack bought on the 3rd was gone on the 1st, and the money was kept.
//
// Every claim here is a property of a SQL statement — "monthly is eaten
// first" is one `least()`, "purchased survives" is one `+`, and both have
// to hold under the same row lock as the balance they ride with. So they
// are executed against a real Postgres rather than reasoned about, and the
// balances are read back out of the table.
//
// Run: node scripts/tests/purchased-credits.itest.mjs
import { execFile, execFileSync } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { startEphemeralPostgres, psqlArgs } from "../lib/ephemeral-postgres.mjs";

const execFileAsync = promisify(execFile);
const ROOT = process.cwd();

let pass = 0;
let fail = 0;
function check(name, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    fail++;
    console.log(`  FAIL  ${name}\n        expected ${e}\n        actual   ${a}`);
  }
}

const pg = startEphemeralPostgres();
if (!pg.available) {
  console.log("purchased-credits: SKIPPED");
  console.log(`  ${pg.reason}`);
  process.exit(0);
}

const ARGS = psqlArgs(pg.conn);
async function sql(statement) {
  const { stdout } = await execFileAsync(pg.psql, [...ARGS, "-v", "ON_ERROR_STOP=1", "-tAc", statement], {
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
  });
  return stdout.trim();
}
function applyFile(file) {
  execFileSync(pg.psql, [...ARGS, "-v", "ON_ERROR_STOP=1", "-q", "-f", file], { encoding: "utf8", stdio: "pipe" });
}

const U = {
  packHolder: "11111111-1111-1111-1111-111111111111",
  planOnly: "22222222-2222-2222-2222-222222222222",
  backfill: "33333333-3333-3333-3333-333333333333",
  freeWithPack: "44444444-4444-4444-4444-444444444444",
};
async function row(id) {
  const out = await sql(
    `select credits_remaining || ',' || purchased_credits || ',' || credits_total
       from public.user_credits where user_id = '${id}'`
  );
  const [remaining, purchased, total] = out.split(",").map(Number);
  return { remaining, purchased, total, monthly: remaining - purchased };
}

try {
  console.log("purchased-credits");

  await sql(`do $$ begin
    if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
    if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
    if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
  end $$;`);

  await sql(`create schema if not exists auth`);
  await sql(
    `drop table if exists public.ai_cost_log, public.credit_reservations, public.credit_transactions, public.user_credits, auth.users cascade`
  );
  await sql(`create table auth.users (id uuid primary key, raw_user_meta_data jsonb not null default '{}'::jsonb)`);
  await sql(`create table public.user_credits (
      user_id uuid primary key references auth.users(id) on delete cascade,
      credits_remaining integer not null default 0,
      credits_total integer not null default 0,
      plan_tier text not null default 'free',
      beta_expires_at timestamptz,
      last_monthly_reset date,
      updated_at timestamptz not null default now())`);
  await sql(`create table public.credit_transactions (
      id uuid primary key default gen_random_uuid(),
      user_id uuid not null,
      amount integer not null,
      action_type text not null,
      description text,
      idempotency_key text,
      created_at timestamptz not null default now())`);
  await sql(
    `create unique index credit_transactions_idempotency_key_uidx on public.credit_transactions (idempotency_key) where idempotency_key is not null`
  );
  await sql(`create table public.credit_reservations (
      id uuid primary key default gen_random_uuid(),
      user_id uuid not null, action text not null, credits integer not null,
      status text not null default 'active', expires_at timestamptz not null,
      resolved_at timestamptz, metadata jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now())`);
  await sql(`create table public.ai_cost_log (
      id uuid primary key default gen_random_uuid(),
      user_id uuid, feature text, input_tokens integer, output_tokens integer,
      cache_write_tokens integer, cache_read_tokens integer, web_searches integer,
      ai_calls integer, real_cost_usd numeric, real_cost_eur numeric,
      credits_charged integer, margin_multiplier numeric, achieved_margin numeric,
      stage_breakdown jsonb, metadata jsonb, created_at timestamptz not null default now())`);

  await sql(`insert into auth.users (id, raw_user_meta_data) values
    ('${U.packHolder}', '{}'::jsonb),
    ('${U.planOnly}', '{}'::jsonb),
    ('${U.backfill}', '{}'::jsonb),
    ('${U.freeWithPack}', '{}'::jsonb)`);

  // The state BEFORE the migration: a Growth account that bought a
  // 5,000-credit pack. 3,000 monthly + 5,000 bought, 600 already spent.
  await sql(`insert into public.user_credits (user_id, credits_remaining, credits_total, plan_tier)
    values ('${U.backfill}', 7400, 3000, 'growth')`);

  console.log("\n== 1. the OLD statement, measured before anything changes ==");
  // Not a claim about the past. This is the exact write syncCreditsForPlan
  // performed — upsert { credits_remaining: total } — run against a row
  // holding a 5,000-credit pack, on the schema as it was. Rolled back, so
  // the fixture below is unaffected.
  {
    // No explicit ROLLBACK: with `-c` the SELECT has to be the LAST
    // statement or psql reports the rollback's empty result instead of the
    // number. Ending the session inside an open transaction rolls it back
    // anyway, and the third assertion below is what proves it did.
    const after = await sql(`begin;
      update public.user_credits set credits_remaining = credits_total where user_id = '${U.backfill}';
      select credits_remaining from public.user_credits where user_id = '${U.backfill}'`);
    const balanceAfterOldReset = Number(after.split("\n").filter(Boolean).pop());
    check("the old reset left only the plan allotment", balanceAfterOldReset, 3000);
    check("...destroying 4,400 purchased credits", 7400 - balanceAfterOldReset, 4400);
    check(
      "and the fixture survives the rollback",
      Number(await sql(`select credits_remaining from public.user_credits where user_id = '${U.backfill}'`)),
      7400
    );
  }

  console.log("\n== 1b. the migration applies, twice ==");
  const migration = path.join(ROOT, "supabase/migrations/20260815_purchased_credits.sql");
  applyFile(migration);
  applyFile(migration);
  check("migration applies twice cleanly", true, true);

  console.log("\n== 2. the backfill recovers what is still in the balance ==");
  {
    const r = await row(U.backfill);
    check("balance untouched", r.remaining, 7400);
    check("the excess over the plan allotment is recognised as purchased", r.purchased, 4400);
    check("so the monthly part is what is left", r.monthly, 3000);
  }
  // A second run must not double-count. Re-running the whole file above
  // already did that, but assert the invariant explicitly.
  check("re-running the backfill does not double-count", (await row(U.backfill)).purchased, 4400);

  // Stronger than never running it again: the database now REFUSES it. The
  // CHECK (purchased_credits <= credits_remaining) makes the old write
  // impossible rather than merely unused, so a forgotten code path, an
  // admin script or a manual fix cannot reintroduce the same loss.
  let oldWriteRefused = false;
  try {
    await sql(`update public.user_credits set credits_remaining = credits_total where user_id = '${U.backfill}'`);
  } catch {
    oldWriteRefused = true;
  }
  check("the old reset is now rejected by the database itself", oldWriteRefused, true);
  check("and the balance is untouched by the attempt", (await row(U.backfill)).remaining, 7400);

  console.log("\n== 3. a pack raises the balance AND the sub-ledger ==");
  await sql(
    `select public.reset_monthly_credits('${U.packHolder}'::uuid, 3000, 'growth')`
  );
  check("plan allotment granted", await row(U.packHolder).then((r) => r.remaining), 3000);
  await sql(`select public.grant_credits_idempotent(
      '${U.packHolder}'::uuid, 5000, 'purchase', 'Purchased pack', 'stripe_checkout:cs_1',
      null, null, null, true)`);
  {
    const r = await row(U.packHolder);
    check("balance is monthly + purchased", r.remaining, 8000);
    check("and the sub-ledger holds only the purchased part", r.purchased, 5000);
  }
  // A plan grant is NOT purchased and must expire with its month.
  await sql(`select public.grant_credits_idempotent(
      '${U.planOnly}'::uuid, 1000, 'plan_renewal', 'Plan', 'plan:1', 1000, 'starter', null, false)`);
  check("a plan grant records nothing as purchased", (await row(U.planOnly)).purchased, 0);

  console.log("\n== 4. spending eats the MONTHLY part first ==");
  // 8,000 total = 3,000 monthly + 5,000 purchased. Spend 2,000: it must
  // all come out of the monthly part, leaving purchased untouched.
  await sql(`select public.deduct_credits_atomic('${U.packHolder}'::uuid, 2000, 0, 'growth')`);
  {
    const r = await row(U.packHolder);
    check("balance down by the spend", r.remaining, 6000);
    check("purchased untouched", r.purchased, 5000);
    check("the monthly part absorbed all of it", r.monthly, 1000);
  }
  // Spend 2,000 more: only 1,000 of monthly is left, so 1,000 has to come
  // out of purchased — and exactly 1,000, not more.
  await sql(`select public.deduct_credits_atomic('${U.packHolder}'::uuid, 2000, 0, 'growth')`);
  {
    const r = await row(U.packHolder);
    check("balance down again", r.remaining, 4000);
    check("purchased absorbed only the overflow", r.purchased, 4000);
    check("the monthly part is exhausted, not negative", r.monthly, 0);
  }

  console.log("\n== 5. a settlement obeys the same order ==");
  await sql(`select public.settle_reservation('${U.packHolder}'::uuid, null, 500, 'chat',
      0,0,0,0,0,1, 0, 0, 5, 5, '{}'::jsonb, '{}'::jsonb)`);
  {
    const r = await row(U.packHolder);
    check("balance charged", r.remaining, 3500);
    check("purchased follows it down once monthly is gone", r.purchased, 3500);
  }

  console.log("\n== 6. THE BUG: a monthly reset no longer destroys the pack ==");
  // This is the exact call syncCreditsForPlan makes on invoice.paid, on a
  // plan change, and at the end of a cancelled subscription.
  await sql(`select public.reset_monthly_credits('${U.packHolder}'::uuid, 3000, 'growth')`);
  {
    const r = await row(U.packHolder);
    check("the monthly allotment is restored", r.monthly, 3000);
    check("and the purchased credits are still there", r.purchased, 3500);
    check("so the balance is the sum", r.remaining, 6500);
  }
  // Cancellation: the plan drops to Free's 100. The pack must not.
  await sql(`select public.reset_monthly_credits('${U.packHolder}'::uuid, 100, 'free')`);
  {
    const r = await row(U.packHolder);
    check("downgrade to Free resets only the monthly part", r.monthly, 100);
    check("the pack survives the cancellation", r.purchased, 3500);
    check("balance is Free's allotment plus what they bought", r.remaining, 3600);
  }

  console.log("\n== 7. the free-tier sweeper preserves it too ==");
  // A free account that bought a pack. Before this change the sweeper set
  // credits_remaining = credits_total, which is the same deletion by
  // another route — and its "not already full" guard would have skipped
  // the account entirely once the pack put it above credits_total.
  await sql(`insert into public.user_credits (user_id, credits_remaining, credits_total, plan_tier, purchased_credits)
    values ('${U.freeWithPack}', 2050, 100, 'free', 2000)`);
  await sql(`select public.reset_monthly_credits_for_unbilled('2026-09-01'::date)`);
  {
    const r = await row(U.freeWithPack);
    check("the free monthly allotment is restored", r.monthly, 100);
    check("the pack is untouched", r.purchased, 2000);
    check("balance is the sum", r.remaining, 2100);
  }
  // Idempotent: a second run in the same period grants nothing.
  await sql(`select public.reset_monthly_credits_for_unbilled('2026-09-01'::date)`);
  check("a replay in the same period changes nothing", (await row(U.freeWithPack)).remaining, 2100);

  console.log("\n== 8. the invariant holds no matter what ==");
  // purchased_credits > credits_remaining would claim credits that are not
  // there. The CHECK is what makes every least() above load-bearing rather
  // than decorative.
  let violated = false;
  try {
    await sql(`update public.user_credits set purchased_credits = credits_remaining + 1 where user_id = '${U.packHolder}'`);
  } catch {
    violated = true;
  }
  check("the database refuses purchased > remaining", violated, true);

  // Spending everything leaves both at zero, not a negative sub-ledger.
  await sql(`select public.deduct_credits_atomic('${U.packHolder}'::uuid, 3600, 0, 'free')`);
  {
    const r = await row(U.packHolder);
    check("spending the lot leaves nothing", r.remaining, 0);
    check("and nothing purchased", r.purchased, 0);
  }

  console.log("\n== 9. concurrency: two spends cannot both take the same credits ==");
  await sql(`select public.reset_monthly_credits('${U.packHolder}'::uuid, 100, 'free')`);
  await sql(`select public.grant_credits_idempotent(
      '${U.packHolder}'::uuid, 100, 'purchase', 'pack', 'stripe_checkout:cs_2', null, null, null, true)`);
  // 200 total, 100 of it purchased. Ten concurrent 30-credit spends: six
  // can succeed (180), the rest must be refused — and the sub-ledger has to
  // land on the same answer as the balance.
  await Promise.all(
    Array.from({ length: 10 }, () =>
      sql(`select public.deduct_credits_atomic('${U.packHolder}'::uuid, 30, 0, 'free')`).catch(() => null)
    )
  );
  {
    const r = await row(U.packHolder);
    check("balance landed on a multiple of the spend", r.remaining % 30, 200 % 30);
    check("balance never went negative", r.remaining >= 0, true);
    check("the sub-ledger never exceeded the balance", r.purchased <= r.remaining, true);
    check("the monthly part is exhausted first, even under contention", r.monthly, Math.max(0, r.remaining - 100));
  }
} finally {
  pg.stop();
}

console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
