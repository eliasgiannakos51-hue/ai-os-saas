// THE RATE LIMIT, ASKED OF A REAL POSTGRES — CONCURRENTLY.
//
// A rate limiter is the one thing that cannot be tested one call at a
// time. Its whole job is to hold under simultaneous requests, and the
// bug it had was invisible to every serial test: SELECT count(*), decide
// in Node, INSERT. Fifty concurrent requests all run their SELECT before
// any INSERT commits, all fifty read the same number, all fifty are under
// the limit, all fifty proceed. Run one at a time it looks perfect.
//
// WHY IT MATTERS HERE AND NOT ONLY IN THEORY. lib/ai-circuit-breaker.ts
// is built on this. Its per-user cap of 20 AI calls an hour is the only
// thing standing between one account and MAX_DAILY_AI_CALLS — the budget
// every user shares. Enforced, one account reaches at most 20 x 24 = 480
// calls a day. Unenforced, one account with a loop can take the lot.
//
// BOTH HALVES ARE MEASURED IN THIS FILE. Section 2 runs the OLD shape
// concurrently and reports how many got through; section 3 runs the new
// function under the same load. The first is the failure, reproduced, not
// described.
//
// Run: DATABASE_URL=... node scripts/tests/rate-limit-atomicity.dbtest.mjs
//  or: npm run test:db -- rate-limit-atomicity
import { execFileSync, execFile } from "node:child_process";

const DB = process.env.DATABASE_URL ?? process.env.PGDATABASE;
if (!DB) {
  console.log("SKIPPED: no DATABASE_URL / PGDATABASE — this file needs a real Postgres.");
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

const args = (q) => ["-d", DB, "-v", "ON_ERROR_STOP=1", "-tAc", q];
function sql(q) {
  return execFileSync("psql", args(q), { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}
/** One psql process per call — a real, separate connection. */
function sqlAsync(q) {
  return new Promise((resolve) => {
    execFile("psql", args(q), { encoding: "utf8" }, (err, stdout) =>
      resolve(err ? { ok: false, out: String(stdout).trim() } : { ok: true, out: String(stdout).trim() })
    );
  });
}

const SCOPE = "dbtest_atomicity";
const clean = () => sql(`delete from public.rate_limit_log where scope like '${SCOPE}%'`);

console.log("== 1. the function exists, with the signature the app calls ==");
// TYPES read off proargtypes, not pg_get_function_identity_arguments —
// which in PostgreSQL 16 returns the parameter NAMES as well
// ("p_scope text, p_identifier text, ...") and made the first version of
// this check compare a string to a different string and call the function
// missing while it sat there working. The instrument was wrong, not the
// migration.
check(
  "consume_rate_limit(text, text, integer, integer) is present",
  sql(`select array_to_string(array(select format_type(u, null) from unnest(p.proargtypes) u), ',')
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname='public' and p.proname='consume_rate_limit'`) === "text,text,integer,integer",
  "src/lib/rate-limit.ts calls it with exactly these four parameters"
);
// And the NAMES, separately — supabase-js sends named arguments, so a
// renamed parameter is a runtime failure that a type check cannot see.
check(
  "...with the parameter names src/lib/rate-limit.ts passes",
  sql(`select array_to_string(p.proargnames, ',') from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
       where n.nspname='public' and p.proname='consume_rate_limit'`) ===
    "p_scope,p_identifier,p_max_attempts,p_window_minutes",
  "supabase-js rpc() sends { p_scope: ..., ... } — a rename is PGRST202 at runtime"
);
check(
  "it is executable by service_role and by nobody else",
  sql(`select has_function_privilege('service_role', 'public.consume_rate_limit(text,text,integer,integer)', 'execute')::text
       || ':' || has_function_privilege('anon', 'public.consume_rate_limit(text,text,integer,integer)', 'execute')::text
       || ':' || has_function_privilege('authenticated', 'public.consume_rate_limit(text,text,integer,integer)', 'execute')::text`) ===
    "true:false:false",
  "rate_limit_log has RLS with no policies; the function is security definer, so the grant IS the boundary"
);

console.log("\n== 2. THE OLD SHAPE, under load — the bug, reproduced ==");
// Each session counts, waits, then inserts if it was under the limit.
// The wait stands in for the network round trip that Node actually has
// between its SELECT and its INSERT: it does not create the race, it
// makes a race that is already there happen every time instead of
// sometimes.
{
  clean();
  const MAX = 5;
  const CONCURRENCY = 30;
  const key = `${SCOPE}_legacy`;
  const legacy = `
    do $$
    declare v_count integer;
    begin
      select count(*) into v_count from public.rate_limit_log
        where scope = '${key}' and identifier = 'one'
          and created_at >= now() - interval '60 minutes';
      perform pg_sleep(0.4);
      if v_count < ${MAX} then
        insert into public.rate_limit_log (scope, identifier) values ('${key}', 'one');
      end if;
    end $$;`;
  await Promise.all(Array.from({ length: CONCURRENCY }, () => sqlAsync(legacy)));
  const got = Number(sql(`select count(*) from public.rate_limit_log where scope='${key}'`));
  console.log(`        ${CONCURRENCY} concurrent callers, limit ${MAX} — ${got} got through`);
  check(
    `the read-then-write shape lets more than ${MAX} through (${got})`,
    got > MAX,
    "if this ever passes with <= 5, the demonstration below is proving nothing and this file should say so"
  );
}

console.log("\n== 3. THE NEW FUNCTION, under the same load ==");
{
  clean();
  const MAX = 5;
  const CONCURRENCY = 30;
  const key = `${SCOPE}_atomic`;
  // Every session sleeps first so the calls overlap rather than being
  // spread out by process startup.
  // ::text on a boolean is 'true'/'false' in Postgres. psql DISPLAYS a
  // boolean as t/f, which is a different thing, and comparing against
  // "t" is how the first version of this file reported 0 allowed while
  // the database had allowed exactly 5.
  const call = `select pg_sleep(0.4); select public.consume_rate_limit('${key}', 'one', ${MAX}, 60)::text`;
  const results = await Promise.all(Array.from({ length: CONCURRENCY }, () => sqlAsync(call)));
  const allowed = results.filter((r) => r.out.split("\n").pop() === "true").length;
  const stored = Number(sql(`select count(*) from public.rate_limit_log where scope='${key}'`));
  console.log(`        ${CONCURRENCY} concurrent callers, limit ${MAX} — ${allowed} allowed, ${stored} rows written`);
  check(`exactly ${MAX} callers are allowed, not one more`, allowed === MAX, `got ${allowed}`);
  check("and exactly that many rows exist", stored === MAX, `got ${stored}`);
  check("every other caller was refused rather than erroring", results.every((r) => r.ok));
}

console.log("\n== 4. the window really is a window ==");
{
  clean();
  const key = `${SCOPE}_window`;
  sql(`insert into public.rate_limit_log (scope, identifier, created_at)
       select '${key}', 'one', now() - interval '90 minutes' from generate_series(1, 50)`);
  check(
    "50 hits from 90 minutes ago do not count against a 60-minute window",
    sql(`select public.consume_rate_limit('${key}', 'one', 5, 60)::text`) === "true"
  );
  sql(`insert into public.rate_limit_log (scope, identifier)
       select '${key}', 'two' from generate_series(1, 5)`);
  check(
    "5 hits from just now DO count against a limit of 5",
    sql(`select public.consume_rate_limit('${key}', 'two', 5, 60)::text`) === "false"
  );
  check(
    "...and a refusal writes no row, so a blocked caller cannot extend their own block",
    sql(`select count(*) from public.rate_limit_log where scope='${key}' and identifier='two'`) === "5"
  );
}

console.log("\n== 5. the arguments at their edges — 0, 1, negative, null ==");
{
  clean();
  const key = `${SCOPE}_edges`;
  check("max 0 refuses immediately", sql(`select public.consume_rate_limit('${key}', 'a', 0, 60)::text`) === "false");
  check("max 1 allows exactly one", sql(`select public.consume_rate_limit('${key}', 'b', 1, 60)::text`) === "true");
  check("...and refuses the second", sql(`select public.consume_rate_limit('${key}', 'b', 1, 60)::text`) === "false");
  check(
    "a negative max is clamped to 0 rather than allowing everything",
    sql(`select public.consume_rate_limit('${key}', 'c', -1, 60)::text`) === "false",
    "a negative limit compared with >= would refuse anyway; the clamp says so out loud"
  );
  check(
    "a 0-minute window is clamped to 1 minute, not to 'no window'",
    sql(`select public.consume_rate_limit('${key}', 'd', 5, 0)::text`) === "true"
  );
  check("a null scope fails OPEN, matching the application's tolerance",
    sql(`select public.consume_rate_limit(null, 'e', 0, 60)::text`) === "true");
  check("a null identifier fails OPEN too",
    sql(`select public.consume_rate_limit('${key}', null, 0, 60)::text`) === "true");
  check("a null max is treated as 0, not as unlimited",
    sql(`select public.consume_rate_limit('${key}', 'f', null, 60)::text`) === "false");
}

console.log("\n== 6. separate identifiers do not block each other ==");
{
  clean();
  const key = `${SCOPE}_isolation`;
  sql(`select public.consume_rate_limit('${key}', 'user-a', 1, 60)`);
  check("user-a is now at their limit", sql(`select public.consume_rate_limit('${key}', 'user-a', 1, 60)::text`) === "false");
  check("user-b is unaffected", sql(`select public.consume_rate_limit('${key}', 'user-b', 1, 60)::text`) === "true");
  check(
    "a different scope for the same identifier is unaffected",
    sql(`select public.consume_rate_limit('${key}_other', 'user-a', 1, 60)::text`) === "true"
  );
}

console.log("\n== 7. the backfill scrubber, on the shapes it was written for ==");
// Same values as scripts/tests/log-scrubbing.test.mjs, assembled the same
// way, asked of Postgres rather than of Node: \y is not \b, and a regex
// that is right in JavaScript is not automatically right here.
{
  const SHAPES = [
    ["jwt", ["eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9", "eyJyb2xlIjoiZXhhbXBsZSJ9", "c2lnbmF0dXJlX2hlcmU"].join(".")],
    ["whsec", "whse" + "c_" + "0123456789abcdefghijklmnopqrstuv"],
    ["resend", "r" + "e_" + "AbCdEfGhIjKlMnOpQrStUvWxYz012345"],
    ["telegram", "1234567890" + ":" + "AAH" + "0123456789abcdefghijklmnopqrstuvwx"],
    ["opaque", "abcdefghijklmnopqrstuvwxyz0123456789" + "ABCDEFGHIJ"],
  ];
  for (const [name, secret] of SHAPES) {
    const out = sql(`select public.scrub_secret_text('connection failed: ${secret} refused')`);
    check(`${name} is removed by the SQL scrubber too`, !out.includes(secret), `got: ${out}`);
    check(`${name}: the message survives`, out.includes("connection failed") && out.includes("refused"), out);
  }
  const url = "postgres://admin:hunter2@db.example.com:5432/postgres";
  const out = sql(`select public.scrub_secret_text('could not connect to ${url}')`);
  check("the URL password is gone", !out.includes("hunter2"), out);
  check("...and the host is kept", out.includes("db.example.com:5432/postgres"), out);
  const innocent = 'relation "public.agent_templates" does not exist';
  check("ordinary text is untouched", sql(`select public.scrub_secret_text($x$${innocent}$x$)`) === innocent);
  check("null in, null out", sql(`select coalesce(public.scrub_secret_text(null), '<null>')`) === "<null>");
  check(
    "scrubbing twice changes nothing — the backfill is idempotent",
    sql(`select (public.scrub_secret_text(public.scrub_secret_text('x ${SHAPES[0][1]} y'))
                 = public.scrub_secret_text('x ${SHAPES[0][1]} y'))::text`) === "true"
  );
}

clean();
console.log(`\n${pass} passed, ${failures.length} failed`);
if (failures.length) {
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
