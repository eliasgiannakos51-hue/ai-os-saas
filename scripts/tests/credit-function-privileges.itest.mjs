// Who may call the credit functions, and how many of them there are —
// against a REAL PostgreSQL with Supabase's own default privileges.
//
// THREE DEFECTS THIS FILE EXISTS FOR. All three were found by applying the
// migration to a real cluster; not one of them is visible by reading it.
//
// 1. TWO FUNCTIONS WHERE THERE SHOULD BE ONE. PostgreSQL identifies a
//    function by (name, argument types), so adding p_purchased did not
//    replace grant_credits_idempotent — it created a second one beside the
//    eight-argument version from 20260805. Because the ninth parameter has
//    a default, an eight-argument call then matched BOTH:
//        ERROR:  function public.grant_credits_idempotent(...) is not unique
//    A hard failure for every caller not passing all nine.
//
// 2. anon AND authenticated COULD MINT CREDITS. `revoke all ... from
//    public` removes the implicit grant. A Supabase project runs
//        alter default privileges in schema public
//          grant all on functions to anon, authenticated, service_role;
//    which gives every NEW function an EXPLICIT grant that the revoke does
//    not touch. Measured: after `revoke ... from public`,
//    has_function_privilege('anon', fn, 'execute') was still `t`. Any
//    signed-in user could call grant_credits_idempotent with the browser's
//    own key.
//
// 3. THE BACKFILL RE-FIRED. Guarded on `purchased_credits = 0`, which is a
//    fact about the row now rather than a record that the backfill ran.
//    Measured: a +440 goodwill grant went (540,0) -> (540,440) on a second
//    run, converting expiring credits into permanent purchased ones.
//
// THE ALTER DEFAULT PRIVILEGES LINE BELOW IS WHAT MAKES THIS TEST REAL.
// Without it defect 2 cannot fail, and the six privilege checks would pass
// on an empty cluster while the production database stayed wide open. The
// probe at the end asserts exactly that: it creates a function, revokes
// only from PUBLIC, and requires anon to STILL have execute. If that probe
// ever goes green-by-being-false, this whole section is vacuous and says
// so out loud.
//
// Run: node scripts/tests/credit-function-privileges.itest.mjs
import { execFile, execFileSync } from "node:child_process";
import { promisify } from "node:util";
import { startEphemeralPostgres, psqlArgs } from "/home/user/ai-os-saas/scripts/lib/ephemeral-postgres.mjs";

const execFileAsync = promisify(execFile);
const ROOT = "/home/user/ai-os-saas";
const pg = startEphemeralPostgres();
if (!pg.available) { console.log(`credit-function-privileges: SKIPPED\n  ${pg.reason}`); process.exit(0); }
const ARGS = psqlArgs(pg.conn);
const sql = async (s) =>
  (await execFileAsync(pg.psql, [...ARGS, "-v", "ON_ERROR_STOP=1", "-tAc", s], { encoding: "utf8", maxBuffer: 1 << 24 })).stdout.trim();
const file = (f) =>
  execFileSync(pg.psql, [...ARGS, "-v", "ON_ERROR_STOP=1", "-q", "-f", `${ROOT}/${f}`], { encoding: "utf8", stdio: "pipe" });

// THE CREDIT TAIL OF THE MIGRATION SEQUENCE, in the order Postgres sees it.
//
// This file used to apply 20260815 ALONE and then assert the five functions
// were locked. That was the right shape when the revokes lived inside that
// one file — and it is exactly the shape that let the defect happen in the
// first place: a per-file revoke list only covers the functions that file
// happens to create, so the next migration adds one and it ships executable
// by `authenticated`.
//
// The lock is now a single migration that loops over pg_proc and revokes on
// EVERY function in the schema, and it is dated to run LAST. So the claim
// worth checking is not "this file locks its own functions" — it is "the
// database a `supabase db push` produces has them locked", which is what
// applying the sequence checks. Applying one file out of a sequence and
// asserting the end state is asserting something the project never does.
const CREDIT_SEQUENCE = [
  "supabase/migrations/20260805_idempotent_credit_grants.sql",
  "supabase/migrations/20260815_purchased_credits.sql",
  "supabase/migrations/20260817000000_drop_stale_grant_overload.sql",
  "supabase/migrations/20260817_purchased_credits_backfill_marker.sql",
  "supabase/migrations/20260818000000_function_grants.sql",
];
const applySequence = () => CREDIT_SEQUENCE.forEach(file);

let fails = 0;
const check = (name, ok, detail = "") => {
  if (!ok) fails++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? `\n        ${detail}` : ""}`);
};

try {
  await sql(`do $$ begin
    if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
    if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
    if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role nologin bypassrls; end if;
  end $$;`);
  // THE REAL SUPABASE POSTURE. Without this the security case cannot fail,
  // and a test that cannot fail proves nothing — this is exactly the
  // default-privileges line a Supabase project ships with.
  await sql(`alter default privileges in schema public grant all on functions to anon, authenticated, service_role`);
  await sql(`create schema if not exists auth`);
  await sql(`create table auth.users (id uuid primary key, raw_user_meta_data jsonb not null default '{}'::jsonb)`);
  await sql(`create table public.user_credits (user_id uuid primary key references auth.users(id) on delete cascade,
      credits_remaining integer not null default 0, credits_total integer not null default 0,
      plan_tier text not null default 'free', beta_expires_at timestamptz, last_monthly_reset date,
      updated_at timestamptz not null default now())`);
  await sql(`create table public.credit_transactions (id uuid primary key default gen_random_uuid(),
      user_id uuid not null, amount integer not null, action_type text not null, description text,
      idempotency_key text, created_at timestamptz not null default now())`);
  await sql(`create unique index credit_transactions_idempotency_key_uidx
      on public.credit_transactions (idempotency_key) where idempotency_key is not null`);
  await sql(`create table public.credit_reservations (id uuid primary key default gen_random_uuid(),
      user_id uuid not null, action text not null, credits integer not null, status text not null default 'active',
      expires_at timestamptz not null, resolved_at timestamptz, metadata jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now())`);
  await sql(`create table public.ai_cost_log (id uuid primary key default gen_random_uuid(), user_id uuid,
      feature text, input_tokens integer, output_tokens integer, cache_write_tokens integer,
      cache_read_tokens integer, web_searches integer, ai_calls integer, real_cost_usd numeric,
      real_cost_eur numeric, credits_charged integer, margin_multiplier numeric, achieved_margin numeric,
      stage_breakdown jsonb, metadata jsonb, created_at timestamptz not null default now())`);

  applySequence();

  console.log("== P0-1: exactly one grant_credits_idempotent ==");
  const n = Number(await sql(`select count(*)::int from pg_proc p join pg_namespace ns on ns.oid=p.pronamespace
     where ns.nspname='public' and p.proname='grant_credits_idempotent'`));
  check(`overload count is 1 (was 2)`, n === 1, `got ${n}`);
  let eightArg;
  try {
    await sql(`select * from public.grant_credits_idempotent('00000000-0000-0000-0000-000000000000'::uuid,
      1, 'x'::text, 'y'::text, null::text, null::integer, null::text, null::timestamptz)`);
    eightArg = "resolved (no ambiguity)";
  } catch (err) {
    eightArg = String(err.stderr || err.message).split("\n").find((l) => l.startsWith("ERROR")) ?? "error";
  }
  check(`an 8-argument call is no longer ambiguous`, !/is not unique/.test(eightArg), eightArg);

  console.log("\n== P0-2: anon and authenticated cannot execute any of the five ==");
  const FNS = [
    "public.grant_credits_idempotent(uuid,integer,text,text,text,integer,text,timestamptz,boolean)",
    "public.reset_monthly_credits(uuid,integer,text)",
    "public.reset_monthly_credits_for_unbilled(date)",
    "public.deduct_credits_atomic(uuid,integer,integer,text)",
    "public.settle_reservation(uuid,uuid,integer,text,integer,integer,integer,integer,integer,integer,numeric,numeric,numeric,numeric,jsonb,jsonb)",
  ];
  for (const fn of FNS) {
    const short = fn.split("(")[0].replace("public.", "");
    for (const role of ["anon", "authenticated"]) {
      const can = await sql(`select has_function_privilege('${role}', '${fn}', 'execute')`);
      check(`${role} cannot execute ${short}`, can === "f", `has_function_privilege = ${can}`);
    }
    const svc = await sql(`select has_function_privilege('service_role', '${fn}', 'execute')`);
    check(`service_role CAN still execute ${short}`, svc === "t", `has_function_privilege = ${svc}`);
  }
  // The control: without the fix these would be `t`. Proven by the probe.
  await sql(`create or replace function public.probe_fn() returns int language sql as $$ select 1 $$`);
  await sql(`revoke all on function public.probe_fn() from public`);
  const probe = await sql(`select has_function_privilege('anon', 'public.probe_fn()', 'execute')`);
  check(
    `the case is not vacuous: a revoke-from-public-only function is STILL executable by anon`,
    probe === "t",
    `probe_fn anon execute = ${probe} — if this is f, the cluster has no default privileges and the checks above prove nothing`
  );

  console.log("\n== P1-3: the backfill does not re-fire after later activity ==");
  await sql(`insert into auth.users (id) values ('22222222-2222-2222-2222-222222222222')`);
  await sql(`insert into public.user_credits (user_id, credits_remaining, credits_total, plan_tier, purchased_credits)
      values ('22222222-2222-2222-2222-222222222222', 100, 100, 'free', 0)`);
  // The row was created AFTER the migration, so it carries no marker — the
  // same position a real account created between two runs would be in.
  await sql(`update public.user_credits set purchased_credits_backfilled_at = now()
      where user_id='22222222-2222-2222-2222-222222222222'`);
  await sql(`select public.grant_credits_idempotent('22222222-2222-2222-2222-222222222222'::uuid,
      440, 'admin_adjustment'::text, 'goodwill'::text, 'k2'::text, null::integer, null::text, null::timestamptz, false)`);
  const before = await sql(`select credits_remaining || ',' || purchased_credits from public.user_credits
      where user_id='22222222-2222-2222-2222-222222222222'`);
  applySequence();
  const after = await sql(`select credits_remaining || ',' || purchased_credits from public.user_credits
      where user_id='22222222-2222-2222-2222-222222222222'`);
  check(
    `a goodwill grant survives a re-run as monthly credits`,
    before === after,
    `before (${before}) -> after (${after}); it was (540,0) -> (540,440) before the fix`
  );

  console.log("\n== still idempotent overall ==");
  applySequence();
  applySequence();
  check("a third and fourth run of the whole sequence both apply cleanly", true);
  const n2 = Number(await sql(`select count(*)::int from pg_proc p join pg_namespace ns on ns.oid=p.pronamespace
     where ns.nspname='public' and p.proname='grant_credits_idempotent'`));
  check("…and still leave exactly one overload", n2 === 1, `got ${n2}`);

  console.log(`\n${fails === 0 ? "ALL PASS" : `${fails} FAILED`}`);
  process.exit(fails === 0 ? 0 : 1);
} finally {
  pg.stop();
}
