// The monthly credit reset, against a REAL PostgreSQL.
//
// TWO THINGS HAD TO BE TRUE BEFORE /api/cron/reset-credits COULD BE PUT IN
// vercel.json, and neither was:
//
//   1. IT MUST NOT COLLIDE WITH THE STRIPE RESET. invoice.paid ->
//      syncSubscriptionToUser -> syncCreditsForPlan already resets paid
//      accounts to their plan allotment on their own billing anniversary.
//      The route reset EVERY row in user_credits, so a subscriber billed on
//      the 15th would have received a second full allowance on the 1st,
//      every month. Scheduling it unchanged would have given money away.
//
//   2. IT MUST BE IDEMPOTENT. A manual re-run, a scheduler firing twice, or
//      two runs overlapping must not grant twice.
//
// Both are properties of a SQL statement under real concurrency, so they are
// tested here rather than reasoned about.
//
// Run: node scripts/tests/monthly-credit-reset.itest.mjs
import { execFile, execFileSync } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { startEphemeralPostgres, psqlArgs } from "../lib/ephemeral-postgres.mjs";

const execFileAsync = promisify(execFile);
const ROOT = process.cwd();
const PERIOD = "2026-09-01";
const NEXT_PERIOD = "2026-10-01";

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
  console.log("monthly-credit-reset: SKIPPED");
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
async function remaining(label) {
  return Number(await sql(`select credits_remaining from public.user_credits where user_id = '${IDS[label]}'`));
}

const IDS = {
  free_spent: "11111111-1111-1111-1111-111111111111",
  free_untouched: "22222222-2222-2222-2222-222222222222",
  paid_starter: "33333333-3333-3333-3333-333333333333",
  // plan_tier says free, but Stripe still holds a subscription — the exact
  // state a mid-cancellation or an out-of-order webhook leaves behind, and
  // the one where a naive plan_tier check would double-grant.
  free_tier_but_subscribed: "44444444-4444-4444-4444-444444444444",
  beta: "55555555-5555-5555-5555-555555555555",
};

try {
  console.log("monthly-credit-reset");

  await sql(`do $$ begin
    if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
    if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
    if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
  end $$;`);

  // The schema this migration builds on, as the app defines it.
  await sql(`create schema if not exists auth`);
  await sql(`drop table if exists public.credit_transactions, public.user_credits, auth.users cascade`);
  await sql(`create table auth.users (id uuid primary key, raw_user_meta_data jsonb not null default '{}'::jsonb)`);
  await sql(`create table public.user_credits (
      user_id uuid primary key references auth.users(id) on delete cascade,
      credits_remaining integer not null default 0,
      credits_total integer not null default 0,
      plan_tier text not null default 'free',
      beta_expires_at timestamptz,
      updated_at timestamptz not null default now())`);
  await sql(`create table public.credit_transactions (
      id uuid primary key default gen_random_uuid(),
      user_id uuid not null,
      amount integer not null,
      action_type text not null,
      description text,
      created_at timestamptz not null default now())`);

  const migration = path.join(ROOT, "supabase/migrations/20260813_monthly_credit_reset.sql");
  applyFile(migration);
  applyFile(migration);
  check("migration applies twice cleanly", true, true);

  await sql(`insert into auth.users (id, raw_user_meta_data) values
    ('${IDS.free_spent}',              '{}'::jsonb),
    ('${IDS.free_untouched}',          '{}'::jsonb),
    ('${IDS.paid_starter}',            '{"stripe_subscription_id":"sub_live_1"}'::jsonb),
    ('${IDS.free_tier_but_subscribed}','{"stripe_subscription_id":"sub_live_2"}'::jsonb),
    ('${IDS.beta}',                    '{}'::jsonb)`);

  await sql(`insert into public.user_credits (user_id, credits_remaining, credits_total, plan_tier, beta_expires_at) values
    ('${IDS.free_spent}',               3, 100, 'free',    null),
    ('${IDS.free_untouched}',         100, 100, 'free',    null),
    ('${IDS.paid_starter}',            40, 2500,'starter', null),
    ('${IDS.free_tier_but_subscribed}', 5, 100, 'free',    null),
    ('${IDS.beta}',                     7, 100, 'free',    now() + interval '20 days')`);

  // ------------------------------------------------------------------
  console.log("\n== 1. no collision with the invoice.paid reset ==");
  // ------------------------------------------------------------------
  const first = await sql(`select count(*) from public.reset_monthly_credits_for_unbilled('${PERIOD}')`);
  check("granted to exactly the unbilled accounts that had spent", Number(first), 2);

  check("free account that spent is topped back up", await remaining("free_spent"), 100);
  check("beta account (plan_tier free) is topped up too", await remaining("beta"), 100);
  check("PAID subscriber is NOT touched — Stripe resets that one", await remaining("paid_starter"), 40);
  check(
    "plan_tier 'free' but an active Stripe subscription is NOT touched either",
    await remaining("free_tier_but_subscribed"),
    5
  );
  check("an account already at full is not counted as granted", await remaining("free_untouched"), 100);

  // ------------------------------------------------------------------
  console.log("\n== 2. idempotency: the second run grants nothing ==");
  // ------------------------------------------------------------------
  // Spend some again, so a non-idempotent implementation would visibly
  // top it back up and the test could not pass by accident.
  await sql(`update public.user_credits set credits_remaining = 12 where user_id = '${IDS.free_spent}'`);

  const second = await sql(`select count(*) from public.reset_monthly_credits_for_unbilled('${PERIOD}')`);
  check("second run in the same month: granted 0", Number(second), 0);
  check("...and the balance was left exactly as the user spent it", await remaining("free_spent"), 12);

  const txCount = await sql(
    `select count(*) from public.credit_transactions where action_type = 'plan_renewal'`
  );
  check("one transaction row per grant, not two", Number(txCount), 2);

  // Next month it grants again — idempotent must not mean "once, ever".
  const nextMonth = await sql(`select count(*) from public.reset_monthly_credits_for_unbilled('${NEXT_PERIOD}')`);
  check("next month grants again", Number(nextMonth), 1);
  check("...back to full", await remaining("free_spent"), 100);

  // ------------------------------------------------------------------
  console.log("\n== 3. two runs at the same instant ==");
  // ------------------------------------------------------------------
  // A scheduler that fires twice, or a manual run racing the cron. The
  // month stamp is only a guard if concurrent callers cannot both pass it.
  await sql(`update public.user_credits set credits_remaining = 1, last_monthly_reset = null`);
  const CONCURRENT = 12;
  const results = await Promise.all(
    Array.from({ length: CONCURRENT }, () =>
      sql(`select count(*) from public.reset_monthly_credits_for_unbilled('${NEXT_PERIOD}')`)
    )
  );
  const totalGranted = results.reduce((sum, r) => sum + Number(r), 0);
  console.log(`  ....  ${CONCURRENT} concurrent runs granted ${totalGranted} times in total`);
  check("across all concurrent runs, each account is granted exactly once", totalGranted, 3);

  const txAfter = await sql(
    `select count(*) from public.credit_transactions where description like '%2026-10%'`
  );
  check("and exactly one transaction row per account", Number(txAfter), 4); // 1 from the earlier run + 3 now

  // ------------------------------------------------------------------
  console.log("\n== 4. the function's posture ==");
  // ------------------------------------------------------------------
  check(
    "service_role only",
    await sql(`select coalesce(string_agg(grantee, ',' order by grantee), 'none')
               from information_schema.role_routine_grants
               where routine_schema='public' and routine_name='reset_monthly_credits_for_unbilled'
                 and grantee in ('anon','public','authenticated','service_role')`),
    "service_role"
  );
  check(
    "security definer with pinned search_path",
    await sql(`select p.prosecdef::text || '|' || coalesce(array_to_string(p.proconfig, ','), '')
               from pg_proc p join pg_namespace n on n.oid=p.pronamespace
               where n.nspname='public' and p.proname='reset_monthly_credits_for_unbilled'`),
    "true|search_path=public"
  );
} finally {
  pg.stop();
}

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
