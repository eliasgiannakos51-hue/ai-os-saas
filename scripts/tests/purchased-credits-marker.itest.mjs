// 20260817_purchased_credits_backfill_marker.sql, against a real PostgreSQL.
//
// THE DATABASE THIS IS FOR is not a hypothetical: it is the one produced by
// running the ORIGINAL 20260815 (read from git by commit, not copied here),
// then the lockdown hotfix, and nothing else. That state was diagnosed from
// a verification query showing 23 objects present and exactly one missing —
// purchased_credits_backfilled_at — with all five functions locked.
//
// FOUR THINGS THIS HAS TO GET RIGHT:
//
//   1. a goodwill grant must stay MONTHLY. The original backfill guessed
//      from the balance, and a balance cannot tell a pack from a gift. This
//      one reads the ledger, where a pack is action_type='purchase' and a
//      gift is 'admin_adjustment'.
//   2. a REAL pack bought after the original migration, which the original
//      backfill never saw, must be recovered.
//   3. an account the original backfill already credited must not be
//      lowered — greatest(), never least().
//   4. running it twice must change nothing.
//
// Run: node scripts/tests/purchased-credits-marker.itest.mjs
import { execFile, execFileSync } from "node:child_process";
import { promisify } from "node:util";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { startEphemeralPostgres, psqlArgs } from "../lib/ephemeral-postgres.mjs";

const execFileAsync = promisify(execFile);
const ROOT = process.cwd();
const ORIGINAL_COMMIT = "1c437e0";
const ORIGINAL = "supabase/migrations/20260815_purchased_credits.sql";
const HOTFIX = "supabase/migrations/20260816_credit_function_lockdown_hotfix.sql";
const MARKER = "supabase/migrations/20260817_purchased_credits_backfill_marker.sql";

const pg = startEphemeralPostgres();
if (!pg.available) {
  console.log(`purchased-credits-marker: SKIPPED\n  ${pg.reason}`);
  process.exit(0);
}

let originalSql;
try {
  originalSql = execFileSync("git", ["show", `${ORIGINAL_COMMIT}:${ORIGINAL}`], {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 1 << 24,
  });
} catch (err) {
  console.log(`purchased-credits-marker: SKIPPED\n  cannot read ${ORIGINAL_COMMIT}:${ORIGINAL} — ${err.message}`);
  pg.stop();
  process.exit(0);
}
const tmp = mkdtempSync(path.join(tmpdir(), "pc-marker-"));
const ORIGINAL_FILE = path.join(tmp, "original.sql");
writeFileSync(ORIGINAL_FILE, originalSql, "utf8");

const ARGS = psqlArgs(pg.conn);
const sql = async (s) =>
  (await execFileAsync(pg.psql, [...ARGS, "-v", "ON_ERROR_STOP=1", "-tAc", s], {
    encoding: "utf8",
    maxBuffer: 1 << 24,
  })).stdout.trim();
const applyAbs = (abs) =>
  execFileSync(pg.psql, [...ARGS, "-v", "ON_ERROR_STOP=1", "-q", "-f", abs], {
    encoding: "utf8",
    stdio: "pipe",
  });
const apply = (rel) => applyAbs(path.join(ROOT, rel));

let pass = 0;
const failures = [];
const check = (name, cond, detail = "") => {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    failures.push(name);
    console.log(`  FAIL  ${name}${detail ? "\n        " + detail : ""}`);
  }
};

const U = {
  // Bought a pack BEFORE the original migration — the original backfill
  // saw them and set purchased_credits from the balance.
  earlyPack: "11111111-1111-1111-1111-111111111111",
  // Bought a pack AFTER the original migration, so the original backfill
  // never considered them. Their credits are real and must be recovered.
  latePack: "22222222-2222-2222-2222-222222222222",
  // Was GIVEN credits after the original migration. Balance is above the
  // allotment, exactly like a pack holder, and it must stay monthly.
  goodwill: "33333333-3333-3333-3333-333333333333",
  // Bought a pack and then spent most of it. The clamp to
  // credits_remaining is what keeps the CHECK constraint satisfied.
  spentPack: "44444444-4444-4444-4444-444444444444",
  // Nothing special. Must be marked considered and otherwise untouched.
  plain: "55555555-5555-5555-5555-555555555555",
};
const row = async (id) =>
  sql(`select credits_remaining || ',' || purchased_credits from public.user_credits where user_id='${id}'`);

try {
  console.log("purchased-credits-marker");
  await sql(`do $$ begin
    if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
    if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
    if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role nologin bypassrls; end if;
  end $$;`);
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
  apply("supabase/migrations/20260805_idempotent_credit_grants.sql");

  await sql(`insert into auth.users (id) values
    ('${U.earlyPack}'), ('${U.latePack}'), ('${U.goodwill}'), ('${U.spentPack}'), ('${U.plain}')`);
  await sql(`insert into public.user_credits (user_id, credits_remaining, credits_total, plan_tier) values
    ('${U.earlyPack}', 7400, 3000, 'growth'),
    ('${U.latePack}',  3000, 3000, 'growth'),
    ('${U.goodwill}',   100,  100, 'free'),
    ('${U.spentPack}', 3000, 3000, 'growth'),
    ('${U.plain}',     2400, 3000, 'growth')`);
  // earlyPack's history: a 5,000 pack, 600 spent since.
  await sql(`insert into public.credit_transactions (user_id, amount, action_type, description, idempotency_key, created_at) values
    ('${U.earlyPack}',  5000, 'purchase', 'pack', 'stripe_checkout:early', now() - interval '30 days'),
    ('${U.earlyPack}',  -600, 'chat',     'usage', null,                   now() - interval '20 days')`);

  console.log(`\n== 1. the ORIGINAL migration runs (${ORIGINAL_COMMIT}) ==`);
  applyAbs(ORIGINAL_FILE);
  check("earlyPack was backfilled from the balance", (await row(U.earlyPack)) === "7400,4400", await row(U.earlyPack));
  check("plain was not", (await row(U.plain)) === "2400,0", await row(U.plain));
  check(
    "the marker column does NOT exist yet — this is the state being diagnosed",
    (await sql(`select count(*)::int from information_schema.columns
        where table_schema='public' and table_name='user_credits'
          and column_name='purchased_credits_backfilled_at'`)) === "0"
  );

  console.log("\n== 2. the lockdown hotfix runs, and only that ==");
  apply(HOTFIX);
  check("the functions are locked", (await sql(`select has_function_privilege('authenticated',
      'public.grant_credits_idempotent(uuid,integer,text,text,text,integer,text,timestamptz,boolean)','execute')`)) === "f");
  check(
    "the marker column is STILL missing — the hotfix never mentions it",
    (await sql(`select count(*)::int from information_schema.columns
        where table_schema='public' and table_name='user_credits'
          and column_name='purchased_credits_backfilled_at'`)) === "0",
    "if this ever passes for the wrong reason, the diagnosis below is worthless"
  );

  console.log("\n== 3. life goes on: a real pack, and a gift ==");
  // A REAL pack bought after the original migration. p_purchased is false
  // on purpose: this is what a deployment lag looks like — Stripe took the
  // money, the ledger recorded a 'purchase', and the sub-ledger did not.
  await sql(`select public.grant_credits_idempotent('${U.latePack}'::uuid, 2000,
      'purchase'::text, 'pack'::text, 'stripe_checkout:late'::text,
      null::integer, null::text, null::timestamptz, false)`);
  // A gift, which must NEVER become permanent.
  await sql(`select public.grant_credits_idempotent('${U.goodwill}'::uuid, 440,
      'admin_adjustment'::text, 'goodwill'::text, 'gw1'::text,
      null::integer, null::text, null::timestamptz, false)`);
  // A pack mostly spent: bought 1,000, spent 800, so only 200 is provable
  // and the balance is what caps it.
  await sql(`insert into public.credit_transactions (user_id, amount, action_type, description, idempotency_key)
     values ('${U.spentPack}', 1000, 'purchase', 'pack', 'stripe_checkout:spent'),
            ('${U.spentPack}', -800, 'chat',     'usage', null)`);
  await sql(`update public.user_credits set credits_remaining = 150 where user_id='${U.spentPack}'`);

  check("latePack holds a real, untracked pack", (await row(U.latePack)) === "5000,0", await row(U.latePack));
  check("goodwill looks identical to a pack from the balance alone", (await row(U.goodwill)) === "540,0", await row(U.goodwill));

  console.log("\n== 4. THE FIX ==");
  apply(MARKER);

  check(
    "the gift stayed MONTHLY — the balance heuristic would have taken it",
    (await row(U.goodwill)) === "540,0",
    `${await row(U.goodwill)} — a balance-based backfill gives 540,440`
  );
  check(
    "the real late pack was recovered from the ledger",
    (await row(U.latePack)) === "5000,2000",
    await row(U.latePack)
  );
  check(
    "the early pack was not lowered",
    (await row(U.earlyPack)) === "7400,4400",
    `${await row(U.earlyPack)} — the ledger proves only 4400, and greatest() must not reduce it`
  );
  check(
    "a mostly-spent pack is clamped to the balance, not to what was bought",
    (await row(U.spentPack)) === "150,150",
    `${await row(U.spentPack)} — 1000 bought, 800 spent, balance 150; the CHECK constraint caps it at 150`
  );
  check("plain is untouched but marked", (await row(U.plain)) === "2400,0", await row(U.plain));
  check(
    "every row is now marked as considered",
    (await sql(`select count(*)::int from public.user_credits where purchased_credits_backfilled_at is null`)) === "0"
  );
  check(
    "the CHECK constraint still holds for every row",
    (await sql(`select count(*)::int from public.user_credits
        where purchased_credits < 0 or purchased_credits > credits_remaining`)) === "0"
  );

  console.log("\n== 5. running it again changes nothing ==");
  const digest = async () =>
    sql(`select md5(string_agg(user_id::text || ':' || credits_remaining || ',' || purchased_credits, '|' order by user_id))
           from public.user_credits`);
  const before = await digest();
  apply(MARKER);
  apply(MARKER);
  check("two more runs leave every balance identical", (await digest()) === before);

  console.log("\n== 6. …and the full corrected 20260815 is now safe to run on top ==");
  // The marker is what makes its balance-heuristic backfill a no-op. If
  // this changes anything, the marker is not doing its job.
  apply(ORIGINAL.replace("20260815", "20260815"));
  check(
    "the corrected 20260815 changes no balance",
    (await digest()) === before,
    "the marker column is what stops its backfill from re-firing"
  );
  check(
    "…and the gift is still monthly after it",
    (await row(U.goodwill)) === "540,0",
    await row(U.goodwill)
  );

  console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${failures.length} failed`);
  if (failures.length) for (const f of failures) console.log(`  - ${f}`);
  process.exit(failures.length === 0 ? 0 : 1);
} finally {
  pg.stop();
}
