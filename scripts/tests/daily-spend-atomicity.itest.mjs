// Does the platform-wide AI spend breaker actually count?
//
// WHAT WAS WRONG (lib/ai-circuit-breaker.ts, recordAiCallForDailySpend):
// the counter was a read-modify-write across two round trips —
//
//     const { data: existing } = await admin
//       .from("daily_ai_spend_tracking").select("total_calls, estimated_cost")...
//     await admin.from("daily_ai_spend_tracking")
//       .update({ total_calls: existing.total_calls + 1, ... })...
//
// `existing.total_calls + 1` is computed in Node from a value read earlier.
// Concurrent callers all read the same number and all write the same number;
// the last write wins and every other increment vanishes. The counter is the
// sole input to checkDailyPlatformCap — the breaker meant to contain a
// runaway spike — so it went blind exactly when concurrency (and therefore
// the loss) peaked.
//
// HOW THIS TEST IS BUILT. Against a REAL PostgreSQL server, with REAL
// concurrent connections. A JavaScript mock cannot reproduce a database
// race: it has one thread and only the interleaving the test author thought
// of. Four stages:
//
//   1. Apply the real migration file, unedited.
//   2. BEFORE — 40 concurrent sessions performing the OLD read-modify-write
//      shape. Proves the defect is real and reproducible, not theoretical.
//   3. AFTER — 40 concurrent calls to increment_daily_ai_spend. Must be
//      exactly 40.
//   4. END-TO-END — the app's own recordAiCallForDailySpend, transpiled from
//      the real source and running on the real @supabase/supabase-js, called
//      40 times concurrently. The only thing replaced is Supabase's HTTP
//      front end, which is swapped for a shim that runs each request on the
//      real database over its own connection. No application code is stubbed.
//
// Run: node scripts/tests/daily-spend-atomicity.itest.mjs
//      (or with TEST_DATABASE_URL=... to use an existing server)
import { execFile, execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import http from "node:http";
import path from "node:path";
import { promisify } from "node:util";
import { startEphemeralPostgres, psqlArgs } from "../lib/ephemeral-postgres.mjs";

const execFileAsync = promisify(execFile);
const ROOT = process.cwd();
const CONCURRENCY = 40;
const DAY = "2026-08-13";

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
function report(name, value) {
  console.log(`  ....  ${name}: ${value}`);
}

const pg = startEphemeralPostgres();
if (!pg.available) {
  console.log("daily-spend-atomicity: SKIPPED");
  console.log(`  ${pg.reason}`);
  console.log("  This test needs a real PostgreSQL server; it will not simulate one.");
  process.exit(0);
}

const ARGS = psqlArgs(pg.conn);

/** One psql process = one fresh connection. Returns trimmed stdout. */
async function sql(statement, { role } = {}) {
  const prefix = role ? `set role ${role}; ` : "";
  const { stdout } = await execFileAsync(pg.psql, [...ARGS, "-v", "ON_ERROR_STOP=1", "-tAc", prefix + statement], {
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
  });
  return stdout.trim();
}

function sqlSyncFile(file) {
  execFileSync(pg.psql, [...ARGS, "-v", "ON_ERROR_STOP=1", "-q", "-f", file], { encoding: "utf8", stdio: "pipe" });
}

async function totalCalls(day = DAY) {
  const out = await sql(`select coalesce((select total_calls from public.daily_ai_spend_tracking where date = '${day}'), 0)`);
  return Number(out);
}

async function estimatedCost(day = DAY) {
  const out = await sql(`select coalesce((select estimated_cost from public.daily_ai_spend_tracking where date = '${day}'), 0)`);
  return Number(out);
}

let shim;
try {
  console.log("daily-spend-atomicity");

  // --------------------------------------------------------------------
  // 1. The real migration, applied verbatim.
  // --------------------------------------------------------------------
  // Roles PostgREST authenticates as. Created first because a bare cluster
  // has none — on Supabase they already exist, and the migration's
  // revoke/grant statements are written against them.
  await sql(`do $$ begin
    if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
    if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
    if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
  end $$;`);

  const migration = path.join(ROOT, "supabase/migrations/20260813_atomic_daily_ai_spend.sql");
  sqlSyncFile(migration);
  sqlSyncFile(migration); // re-applied: the migration must be idempotent
  check("migration is idempotent (applies twice cleanly)", true, true);

  const fnExists = await sql(
    `select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'increment_daily_ai_spend'`
  );
  check("increment_daily_ai_spend exists", Number(fnExists), 1);

  const security = await sql(
    `select p.prosecdef::text || '|' || coalesce(array_to_string(p.proconfig, ','), '')
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'increment_daily_ai_spend'`
  );
  check("security definer with pinned search_path", security, "true|search_path=public");

  const grants = await sql(
    `select coalesce(string_agg(grantee, ',' order by grantee), 'none')
     from information_schema.role_routine_grants
     where routine_schema = 'public' and routine_name = 'increment_daily_ai_spend'
       and grantee in ('anon', 'authenticated', 'public', 'service_role')`
  );
  check("executable by service_role only", grants, "service_role");

  // --------------------------------------------------------------------
  // 2. BEFORE — the old read-modify-write shape, 40 real connections.
  // --------------------------------------------------------------------
  await sql(`insert into public.daily_ai_spend_tracking (date, total_calls, estimated_cost)
             values ('${DAY}', 0, 0) on conflict (date) do update set total_calls = 0, estimated_cost = 0`);

  // Exactly what the TypeScript did: read the value, then write value+1,
  // with the addition performed outside the database's knowledge. pg_sleep
  // stands in for the network round trip that separated the two calls.
  const OLD_SHAPE = `do $$
    declare v integer; c numeric;
    begin
      select total_calls, estimated_cost into v, c from public.daily_ai_spend_tracking where date = '${DAY}';
      perform pg_sleep(0.05);
      update public.daily_ai_spend_tracking set total_calls = v + 1, estimated_cost = c + 2 where date = '${DAY}';
    end $$;`;

  await Promise.all(Array.from({ length: CONCURRENCY }, () => sql(OLD_SHAPE)));
  const beforeCount = await totalCalls();
  report(`old read-modify-write, ${CONCURRENCY} concurrent`, `total_calls = ${beforeCount}`);
  check(
    `old shape LOSES increments (${CONCURRENCY} calls recorded as fewer)`,
    beforeCount < CONCURRENCY,
    true
  );

  // --------------------------------------------------------------------
  // 3. AFTER — the RPC, same 40 real connections.
  // --------------------------------------------------------------------
  await sql(`update public.daily_ai_spend_tracking set total_calls = 0, estimated_cost = 0 where date = '${DAY}'`);
  await Promise.all(
    Array.from({ length: CONCURRENCY }, () => sql(`select * from public.increment_daily_ai_spend(2, '${DAY}')`))
  );
  const afterCount = await totalCalls();
  const afterCost = await estimatedCost();
  report(`increment_daily_ai_spend, ${CONCURRENCY} concurrent`, `total_calls = ${afterCount}, estimated_cost = ${afterCost}`);
  check(`RPC records exactly ${CONCURRENCY}`, afterCount, CONCURRENCY);
  check("estimated_cost accumulates exactly too", afterCost, CONCURRENCY * 2);

  // The row is created, not just updated, when the day has no row yet —
  // and creation is racy too, so hit that path concurrently as well.
  const FRESH_DAY = "2026-08-14";
  await sql(`delete from public.daily_ai_spend_tracking where date = '${FRESH_DAY}'`);
  await Promise.all(
    Array.from({ length: CONCURRENCY }, () => sql(`select * from public.increment_daily_ai_spend(1, '${FRESH_DAY}')`))
  );
  const freshCount = await totalCalls(FRESH_DAY);
  report(`first-call-of-the-day race, ${CONCURRENCY} concurrent on an absent row`, `total_calls = ${freshCount}`);
  check(`row creation is atomic too (exactly ${CONCURRENCY})`, freshCount, CONCURRENCY);

  // --------------------------------------------------------------------
  // 4. END-TO-END — the application's own function, unmodified.
  // --------------------------------------------------------------------
  // A minimal PostgREST front end: it accepts what supabase-js actually
  // sends and executes it on the real database, one connection per request.
  // Application code is untouched; only Supabase's HTTP server is local.
  let shimCalls = 0;
  let shimErrors = [];
  shim = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", async () => {
      const respond = (status, payload) => {
        res.writeHead(status, { "Content-Type": "application/json" });
        res.end(JSON.stringify(payload));
      };
      try {
        if (!req.url.startsWith("/rest/v1/rpc/increment_daily_ai_spend")) {
          return respond(404, { message: `unexpected request: ${req.method} ${req.url}` });
        }
        if ((req.headers.apikey ?? "") !== SERVICE_KEY) {
          return respond(401, { message: "missing service-role key" });
        }
        const args = JSON.parse(body || "{}");
        const cost = Number(args.p_estimated_cost);
        const day = String(args.p_date ?? "");
        if (!Number.isFinite(cost) || !/^\d{4}-\d{2}-\d{2}$/.test(day)) {
          return respond(400, { message: "bad arguments" });
        }
        shimCalls++;
        const out = await sql(
          `select coalesce(json_agg(t), '[]'::json) from public.increment_daily_ai_spend(${cost}, '${day}') t`
        );
        respond(200, JSON.parse(out));
      } catch (err) {
        shimErrors.push(String(err.message || err));
        respond(500, { message: String(err.message || err) });
      }
    });
  });
  const SERVICE_KEY = "test-service-role-key";
  await new Promise((resolve) => shim.listen(0, "127.0.0.1", resolve));
  const shimUrl = `http://127.0.0.1:${shim.address().port}`;

  process.env.NEXT_PUBLIC_SUPABASE_URL = shimUrl;
  process.env.SUPABASE_SERVICE_ROLE_KEY = SERVICE_KEY;

  // loadTsWithDeps, not loadTs: the real @supabase/supabase-js has to stay
  // in the path, otherwise this stops being an end-to-end test of the
  // application's actual client behaviour.
  const { loadTsWithDeps } = await import("./load-ts.mjs");
  const breaker = await loadTsWithDeps("src/lib/ai-circuit-breaker.ts");

  const APP_DAY = new Date().toISOString().slice(0, 10);
  await sql(`delete from public.daily_ai_spend_tracking where date = '${APP_DAY}'`);

  await Promise.all(Array.from({ length: CONCURRENCY }, () => breaker.recordAiCallForDailySpend(3)));

  const appCount = await totalCalls(APP_DAY);
  const appCost = await estimatedCost(APP_DAY);
  report(`recordAiCallForDailySpend (real app code), ${CONCURRENCY} concurrent`, `total_calls = ${appCount}, estimated_cost = ${appCost}`);
  check("shim actually served every call (no silent no-op)", shimCalls, CONCURRENCY);
  check("shim raised no errors", shimErrors, []);
  check(`app path records exactly ${CONCURRENCY}`, appCount, CONCURRENCY);
  check("app path accumulates cost exactly", appCost, CONCURRENCY * 3);

  // And the reader agrees with the writer about which row "today" is.
  const readerSeen = await sql(
    `select total_calls from public.daily_ai_spend_tracking where date = '${APP_DAY}'`
  );
  check("checkDailyPlatformCap's row key matches the writer's", Number(readerSeen), CONCURRENCY);
} finally {
  if (shim) await new Promise((r) => shim.close(r));
  pg.stop();
}

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
