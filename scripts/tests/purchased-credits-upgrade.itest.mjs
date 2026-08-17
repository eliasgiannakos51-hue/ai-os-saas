// THE UPGRADE PATH: a database that already ran the FIRST version.
//
// The first version of 20260815_purchased_credits.sql shipped without the
// marker column and with the function left executable by anon. Fixing the
// file is only half the job — the fixed file has to be safe to run on a
// database that already ran the broken one, and that is not the same
// question as "is it idempotent".
//
// THE TRAP, and it is a subtle one. Adding purchased_credits_backfilled_at
// to an existing database leaves it NULL on every row, which the backfill
// reads as "never considered". It would then run a SECOND time on a
// database where it has already run once — and any account that received a
// NON-purchased grant in between (goodwill, beta top-up, admin adjustment)
// would have that grant silently reclassified as permanent purchased
// credits. The fix for the idempotency bug would have caused the exact
// damage the idempotency bug caused.
//
// So this file plays out the real sequence: old version, normal activity,
// new version. The old version comes from git rather than from a copy in
// this file, so it cannot drift into a version that conveniently passes.
//
// Run: node scripts/tests/purchased-credits-upgrade.itest.mjs
import { execFile, execFileSync } from "node:child_process";
import { promisify } from "node:util";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { startEphemeralPostgres, psqlArgs } from "../lib/ephemeral-postgres.mjs";

const execFileAsync = promisify(execFile);
const ROOT = process.cwd();
const MIGRATION = "supabase/migrations/20260815_purchased_credits.sql";
// THE FIXED VERSION IS NOT ONE FILE IN THIS REPOSITORY.
//
// The branch this test came from put the overload drop and the execute
// revokes inside 20260815 itself. Here they are their own dated
// migrations, because a per-file revoke list only ever covers the
// functions that file happens to create — which is how the exposure
// happened in the first place. 20260818000000 loops over pg_proc and
// revokes on every function in the schema, and runs last.
//
// So "apply the fixed version" means applying the sequence, which is what
// `supabase db push` does. Applying one file and asserting the end state
// would be asserting something the project never does.
const FIXED_SEQUENCE = [
  MIGRATION,
  "supabase/migrations/20260817000000_drop_stale_grant_overload.sql",
  "supabase/migrations/20260817_purchased_credits_backfill_marker.sql",
  "supabase/migrations/20260818000000_function_grants.sql",
];
const applyFixed = () => FIXED_SEQUENCE.forEach((f) => applyFile(path.join(ROOT, f)));
// The commit that introduced the first version. Pinned, not "HEAD~n": the
// point is to replay what was actually shipped.
const OLD_COMMIT = "1c437e0";

const pg = startEphemeralPostgres();
if (!pg.available) {
  console.log(`purchased-credits-upgrade: SKIPPED\n  ${pg.reason}`);
  process.exit(0);
}

let oldSql;
try {
  oldSql = execFileSync("git", ["show", `${OLD_COMMIT}:${MIGRATION}`], {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 1 << 24,
  });
} catch (err) {
  console.log(`purchased-credits-upgrade: SKIPPED\n  cannot read ${OLD_COMMIT}:${MIGRATION} — ${err.message}`);
  pg.stop();
  process.exit(0);
}
const tmp = mkdtempSync(path.join(tmpdir(), "pc-upgrade-"));
const OLD_FILE = path.join(tmp, "old.sql");
writeFileSync(OLD_FILE, oldSql, "utf8");

const ARGS = psqlArgs(pg.conn);
const sql = async (s) =>
  (await execFileAsync(pg.psql, [...ARGS, "-v", "ON_ERROR_STOP=1", "-tAc", s], {
    encoding: "utf8",
    maxBuffer: 1 << 24,
  })).stdout.trim();
const applyFile = (abs) =>
  execFileSync(pg.psql, [...ARGS, "-v", "ON_ERROR_STOP=1", "-q", "-f", abs], {
    encoding: "utf8",
    stdio: "pipe",
  });

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
  goodwill: "11111111-1111-1111-1111-111111111111",
  packHolder: "22222222-2222-2222-2222-222222222222",
  plain: "33333333-3333-3333-3333-333333333333",
};
const row = async (id) =>
  sql(`select credits_remaining || ',' || purchased_credits from public.user_credits where user_id='${id}'`);

try {
  console.log("purchased-credits-upgrade");
  await sql(`do $$ begin
    if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
    if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
    if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role nologin bypassrls; end if;
  end $$;`);
  // Supabase's own bootstrap. Without it the privilege half of this test
  // cannot fail and would prove nothing.
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
  applyFile(path.join(ROOT, "supabase/migrations/20260805_idempotent_credit_grants.sql"));

  await sql(`insert into auth.users (id) values ('${U.goodwill}'), ('${U.packHolder}'), ('${U.plain}')`);
  await sql(`insert into public.user_credits (user_id, credits_remaining, credits_total, plan_tier) values
      ('${U.goodwill}',   100,  100, 'free'),
      ('${U.packHolder}', 7400, 3000, 'growth'),
      ('${U.plain}',      2400, 3000, 'growth')`);

  console.log(`\n== 1. the OLD version runs, as it did in production (${OLD_COMMIT}) ==`);
  applyFile(OLD_FILE);
  check("the pack holder was backfilled", (await row(U.packHolder)) === "7400,4400", await row(U.packHolder));
  check("the plain account was not", (await row(U.plain)) === "2400,0", await row(U.plain));
  const staleOverloads = Number(await sql(`select count(*)::int from pg_proc p
      join pg_namespace n on n.oid=p.pronamespace
     where n.nspname='public' and p.proname='grant_credits_idempotent'`));
  check("…and left TWO grant_credits_idempotent overloads behind", staleOverloads === 2, String(staleOverloads));
  const exposed = await sql(`select has_function_privilege('authenticated',
      'public.grant_credits_idempotent(uuid,integer,text,text,text,integer,text,timestamptz,boolean)', 'execute')`);
  check("…and left it executable by authenticated", exposed === "t", exposed);

  console.log("\n== 2. normal activity happens afterwards ==");
  // A goodwill grant that must EXPIRE with the month. This is the row the
  // naive fix would have quietly turned into permanent purchased credits.
  await sql(`select public.grant_credits_idempotent('${U.goodwill}'::uuid, 440,
      'admin_adjustment'::text, 'goodwill'::text, 'gw1'::text,
      null::integer, null::text, null::timestamptz, false)`);
  check("the goodwill grant is monthly, not purchased", (await row(U.goodwill)) === "540,0", await row(U.goodwill));

  console.log("\n== 3. the FIXED version runs on that database ==");
  applyFixed();

  check(
    "the goodwill grant is STILL monthly — the backfill did not re-fire",
    (await row(U.goodwill)) === "540,0",
    `${await row(U.goodwill)} — a naive marker column would give 540,440`
  );
  check("the pack holder is untouched", (await row(U.packHolder)) === "7400,4400", await row(U.packHolder));
  check("the plain account is untouched", (await row(U.plain)) === "2400,0", await row(U.plain));
  check(
    "every row is now marked as considered",
    (await sql(`select count(*)::int from public.user_credits where purchased_credits_backfilled_at is null`)) === "0"
  );

  console.log("\n== 4. …and the three defects are closed on the upgraded database ==");
  const overloads = Number(await sql(`select count(*)::int from pg_proc p
      join pg_namespace n on n.oid=p.pronamespace
     where n.nspname='public' and p.proname='grant_credits_idempotent'`));
  check(`exactly one overload remains (was ${staleOverloads})`, overloads === 1, String(overloads));
  for (const fn of [
    "public.grant_credits_idempotent(uuid,integer,text,text,text,integer,text,timestamptz,boolean)",
    "public.reset_monthly_credits(uuid,integer,text)",
    "public.reset_monthly_credits_for_unbilled(date)",
    "public.deduct_credits_atomic(uuid,integer,integer,text)",
    "public.settle_reservation(uuid,uuid,integer,text,integer,integer,integer,integer,integer,integer,numeric,numeric,numeric,numeric,jsonb,jsonb)",
  ]) {
    const short = fn.split("(")[0].replace("public.", "");
    for (const role of ["anon", "authenticated"]) {
      check(`${role} can no longer execute ${short}`, (await sql(`select has_function_privilege('${role}', '${fn}', 'execute')`)) === "f");
    }
    check(`service_role still can execute ${short}`, (await sql(`select has_function_privilege('service_role', '${fn}', 'execute')`)) === "t");
  }

  console.log("\n== 5. and running it again changes nothing ==");
  const digest = await sql(`select md5(string_agg(user_id::text || credits_remaining || ',' || purchased_credits, '|' order by user_id)) from public.user_credits`);
  applyFixed();
  applyFixed();
  check("two more runs leave every balance identical", (await sql(`select md5(string_agg(user_id::text || credits_remaining || ',' || purchased_credits, '|' order by user_id)) from public.user_credits`)) === digest);

  console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${failures.length} failed`);
  if (failures.length) for (const f of failures) console.log(`  - ${f}`);
  process.exit(failures.length === 0 ? 0 : 1);
} finally {
  pg.stop();
}
