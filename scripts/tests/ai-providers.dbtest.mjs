// THE ROUTING LOG AND THE BATCH STATE, AGAINST A REAL POSTGRES.
//
// Two claims the database either enforces or does not, and neither can be
// checked by reading the migration text:
//
//   ONE OUTSTANDING BATCH PER AGENT. The pile-up this prevents is a race
//   between two cron invocations, and a check-then-insert in TypeScript
//   is exactly the shape that loses it. A partial unique index cannot —
//   but only if it is really partial and really unique, which is what
//   this file inserts rows to find out.
//
//   NOBODY MAY WRITE THE ROUTING LOG. A user who could insert here could
//   fabricate the record of which provider answered them, which is the
//   one record an argument about a bad answer would turn on.
//
// Run: node scripts/tests/ai-providers.dbtest.mjs   (needs a database;
// run through `npm run test:db`, which provisions one)
import { execFileSync } from "node:child_process";

if (!process.env.DATABASE_URL && !process.env.PGDATABASE) {
  console.log("SKIPPED: no DATABASE_URL or PGDATABASE — run through `npm run test:db`.");
  process.exit(0);
}

let pass = 0;
const failures = [];
const ok = (name, cond, detail) => {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { failures.push(name); console.log(`  FAIL  ${name}${detail !== undefined ? "\n        " + detail : ""}`); }
};

const PSQL_TAG = /^(BEGIN|COMMIT|ROLLBACK|SET|DO|INSERT \d+ \d+|UPDATE \d+|DELETE \d+|SELECT \d+|ALTER TABLE|CREATE INDEX)$/;
function answer(out) {
  const lines = out.split("\n").map((l) => l.trim()).filter((l) => l !== "" && !PSQL_TAG.test(l));
  return lines.length === 0 ? "" : lines[lines.length - 1];
}
const dbArgs = () =>
  process.env.DATABASE_URL ? ["-d", process.env.DATABASE_URL] : ["-d", process.env.PGDATABASE];
function sql(query) {
  return answer(
    execFileSync("psql", [...dbArgs(), "-v", "ON_ERROR_STOP=1", "-tAc", query], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    })
  );
}
function tryStatement(query) {
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

// Emails namespaced per suite: every dbtest runs against the SAME
// throwaway database in sequence, and auth.users.email is unique.
const USER = "eeeeeeee-0000-0000-0000-000000000001";
const OTHER = "eeeeeeee-0000-0000-0000-000000000002";
sql(`insert into auth.users (id, email) values
  ('${USER}', 'providers-user@test.local'), ('${OTHER}', 'providers-other@test.local')
  on conflict (id) do nothing`);
const cleanup = () => {
  sql(`delete from public.ai_provider_log where user_id in ('${USER}', '${OTHER}')`);
  sql(`delete from public.agent_runs where user_id in ('${USER}', '${OTHER}')`);
  sql(`delete from public.user_agents where user_id in ('${USER}', '${OTHER}')`);
};
cleanup();

// ===========================================================================
console.log("== 1. the routing log holds routing, and nothing a model said ==");
// ===========================================================================

ok("ai_provider_log exists", sql(`select to_regclass('public.ai_provider_log') is not null`) === "t");

const columns = sql(
  `select string_agg(column_name, ',' order by column_name) from information_schema.columns
    where table_schema = 'public' and table_name = 'ai_provider_log'`
).split(",");
ok(`it holds exactly the routing columns (${columns.length})`,
  JSON.stringify(columns) === JSON.stringify([
    "attempt_index", "cache_kept", "created_at", "http_status", "id", "latency_ms",
    "model", "outcome", "provider", "purpose", "reason", "request_id", "user_id",
  ]),
  columns.join(","));
ok("no column could hold a prompt, a completion, or anything the model was shown",
  columns.every((c) => !/prompt|completion|content|message|output|response|system/i.test(c)),
  columns.filter((c) => /prompt|completion|content|message|output|response|system/i.test(c)).join(","));
ok("no jsonb or bytea column exists on it",
  sql(`select count(*) from information_schema.columns
        where table_schema='public' and table_name='ai_provider_log'
          and data_type in ('bytea','json','jsonb')`) === "0");
ok("RLS is on", sql(`select relrowsecurity from pg_class where oid='public.ai_provider_log'::regclass`) === "t");
ok("deleting the account takes its routing log with it",
  sql(`select confdeltype from pg_constraint
       where conrelid='public.ai_provider_log'::regclass and contype='f'`) === "c");
ok("cache_kept is nullable — a request with no cached prefix has nothing to report",
  sql(`select is_nullable from information_schema.columns
        where table_schema='public' and table_name='ai_provider_log' and column_name='cache_kept'`) === "YES");

// EVERY OUTCOME THE CLASSIFIER CAN PRODUCE MUST BE INSERTABLE. A state
// the code emits and the table rejects is a log line that vanishes at the
// exact moment somebody needs it.
const OUTCOMES = [
  "success", "unsupported", "server_error", "rate_limited", "timeout",
  "network_error", "bad_request", "auth_error", "overloaded", "unknown_error",
];
let rejected = [];
for (const [i, outcome] of OUTCOMES.entries()) {
  const r = tryStatement(
    `insert into public.ai_provider_log
       (user_id, request_id, attempt_index, purpose, provider, model, outcome, latency_ms)
     values ('${USER}', gen_random_uuid(), ${i}, 'chat', 'anthropic', 'claude-sonnet-4-6', '${outcome}', 10)`
  );
  if (!r.ok) rejected.push(outcome);
}
ok(`every one of the ${OUTCOMES.length} outcomes the classifier emits is accepted`,
  rejected.length === 0, rejected.join(","));
ok("an outcome nobody defined is REJECTED, so the check is a real constraint",
  !tryStatement(
    `insert into public.ai_provider_log
       (user_id, request_id, attempt_index, purpose, provider, model, outcome, latency_ms)
     values ('${USER}', gen_random_uuid(), 0, 'chat', 'anthropic', 'x', 'went_fine_probably', 1)`
  ).ok);
ok("a negative latency is rejected",
  !tryStatement(
    `insert into public.ai_provider_log
       (user_id, request_id, attempt_index, purpose, provider, model, outcome, latency_ms)
     values ('${USER}', gen_random_uuid(), 0, 'chat', 'anthropic', 'x', 'success', -1)`
  ).ok);
ok("a negative attempt index is rejected",
  !tryStatement(
    `insert into public.ai_provider_log
       (user_id, request_id, attempt_index, purpose, provider, model, outcome, latency_ms)
     values ('${USER}', gen_random_uuid(), -1, 'chat', 'anthropic', 'x', 'success', 1)`
  ).ok);

// A CRON POLL HAS NO USER. A sentinel uuid would make "the system did
// this" and "this user did this" the same query.
ok("a row with no user is allowed, because a scheduled poll has nobody in the room",
  tryStatement(
    `insert into public.ai_provider_log
       (user_id, request_id, attempt_index, purpose, provider, model, outcome, latency_ms)
     values (null, gen_random_uuid(), 0, 'agent_run', 'anthropic', 'claude-sonnet-4-6', 'success', 5)`
  ).ok);
sql(`delete from public.ai_provider_log where user_id is null and purpose='agent_run'`);

// ===========================================================================
console.log("\n== 2. who may read it, and who may not write it ==");
// ===========================================================================

sql(`insert into public.ai_provider_log
       (user_id, request_id, attempt_index, purpose, provider, model, outcome, latency_ms)
     values ('${OTHER}', gen_random_uuid(), 0, 'chat', 'openai', 'openai/gpt-5', 'success', 7)`);

const ownRead = tryAs("authenticated", USER, `select count(*) from public.ai_provider_log;`);
ok("a user reads their own routing rows", ownRead.ok && Number(ownRead.out) === OUTCOMES.length, JSON.stringify(ownRead));
const otherRead = tryAs("authenticated", USER,
  `select count(*) from public.ai_provider_log where user_id = '${OTHER}';`);
ok("...and cannot see anybody else's", otherRead.ok && otherRead.out === "0", JSON.stringify(otherRead));

const forge = tryAs("authenticated", USER,
  `insert into public.ai_provider_log (user_id, request_id, attempt_index, purpose, provider, model, outcome, latency_ms)
   values ('${USER}', gen_random_uuid(), 0, 'chat', 'groq', 'groq/llama-3.1-8b-instant', 'success', 1);`);
ok("A USER CANNOT WRITE THE RECORD OF WHO ANSWERED THEM", !forge.ok, JSON.stringify(forge).slice(0, 160));
const edit = tryAs("authenticated", USER, `update public.ai_provider_log set outcome = 'success';`);
ok("nor edit it", !edit.ok, JSON.stringify(edit).slice(0, 160));
const wipe = tryAs("authenticated", USER, `delete from public.ai_provider_log;`);
ok("nor delete it", !wipe.ok, JSON.stringify(wipe).slice(0, 160));
const anonRead = tryAs("anon", USER, `select count(*) from public.ai_provider_log;`);
ok("anon cannot read it at all", !anonRead.ok, JSON.stringify(anonRead).slice(0, 160));

sql(`delete from public.ai_provider_log where user_id in ('${USER}', '${OTHER}')`);

// ===========================================================================
console.log("\n== 3. 'queued' is a real state, and only one per agent ==");
// ===========================================================================

const AGENT = "eeeeeeee-1111-0000-0000-000000000001";
const AGENT2 = "eeeeeeee-1111-0000-0000-000000000002";
for (const [id, name] of [[AGENT, "batch-a"], [AGENT2, "batch-b"]]) {
  sql(`insert into public.user_agents
         (id, user_id, name, prompt, schedule_cron, timezone, status, delivery_method, delivery_target)
       values ('${id}', '${USER}', '${name}', 'do the thing', '0 6 * * *', 'UTC', 'active',
               'email', 'providers-user@test.local')
       on conflict (id) do nothing`);
}

ok("a run may be inserted as 'queued'",
  tryStatement(
    `insert into public.agent_runs (agent_id, user_id, status, queued_at, batch_id)
     values ('${AGENT}', '${USER}', 'queued', now(), 'msgbatch_1')`
  ).ok);
ok("a status nobody defined is still rejected",
  !tryStatement(
    `insert into public.agent_runs (agent_id, user_id, status) values ('${AGENT}', '${USER}', 'thinking')`
  ).ok);
ok("the three original statuses still work",
  ["running", "success", "failed"].every(
    (s) => tryStatement(
      `insert into public.agent_runs (agent_id, user_id, status) values ('${AGENT2}', '${USER}', '${s}')`
    ).ok
  ));

// THE PILE-UP GUARD, tested by trying to break it.
const second = tryStatement(
  `insert into public.agent_runs (agent_id, user_id, status, queued_at, batch_id)
   values ('${AGENT}', '${USER}', 'queued', now(), 'msgbatch_2')`
);
ok("A SECOND QUEUED RUN FOR THE SAME AGENT IS REFUSED BY THE DATABASE",
  !second.ok, JSON.stringify(second).slice(0, 200));
ok("...and the first is still there, untouched",
  sql(`select count(*) from public.agent_runs where agent_id='${AGENT}' and status='queued'`) === "1");
ok("A DIFFERENT agent may queue at the same time — the index is per agent, not global",
  tryStatement(
    `insert into public.agent_runs (agent_id, user_id, status, queued_at, batch_id)
     values ('${AGENT2}', '${USER}', 'queued', now(), 'msgbatch_3')`
  ).ok);
ok("...and the SAME agent may have many finished runs — the index is partial, not a one-run-per-agent rule",
  [1, 2, 3].every(() =>
    tryStatement(
      `insert into public.agent_runs (agent_id, user_id, status) values ('${AGENT}', '${USER}', 'success')`
    ).ok
  ) && Number(sql(`select count(*) from public.agent_runs where agent_id='${AGENT}'`)) >= 4);

// Once the queued run is closed, the agent may queue again.
sql(`update public.agent_runs set status='failed' where agent_id='${AGENT}' and status='queued'`);
ok("closing the queued run frees the agent to batch again",
  tryStatement(
    `insert into public.agent_runs (agent_id, user_id, status, queued_at, batch_id)
     values ('${AGENT}', '${USER}', 'queued', now(), 'msgbatch_4')`
  ).ok);

ok("batch_fallbacks cannot go negative",
  !tryStatement(`update public.agent_runs set batch_fallbacks = -1 where agent_id='${AGENT}'`).ok);
ok("batch_fallbacks defaults to zero on every existing row",
  sql(`select count(*) from public.agent_runs where batch_fallbacks is null`) === "0");

// THE SWEEPER IS ACTUALLY RUN, not merely counted against.
//
// api/cron/agent-runs closes runs still 'running' an hour after they
// started. A queued batch sits for up to 24 hours by design, so the
// sweeper must walk straight past it — and the way to know is to age
// every row and run the sweeper's own UPDATE.
sql(`update public.agent_runs set started_at = now() - interval '3 hours'
      where agent_id in ('${AGENT}', '${AGENT2}')`);
const queuedBefore = sql(`select count(*) from public.agent_runs
      where status='queued' and agent_id in ('${AGENT}', '${AGENT2}')`);
ok("there are queued rows old enough to be swept, so the next check is not vacuous",
  Number(queuedBefore) > 0, queuedBefore);
sql(`update public.agent_runs
       set status='failed', finished_at=now(), error='swept'
     where status='running' and started_at < now() - interval '1 hour'
       and agent_id in ('${AGENT}', '${AGENT2}')`);
ok("the stuck-run sweeper leaves every queued row alone, however old",
  sql(`select count(*) from public.agent_runs
        where status='queued' and agent_id in ('${AGENT}', '${AGENT2}')`) === queuedBefore,
  `${queuedBefore} before, ${sql(`select count(*) from public.agent_runs where status='queued' and agent_id in ('${AGENT}', '${AGENT2}')`)} after`);
ok("...and did close the genuinely stuck 'running' ones",
  Number(sql(`select count(*) from public.agent_runs where error='swept'`)) > 0);

// ===========================================================================
console.log("\n== 4. both migrations are idempotent, and re-running loses nothing ==");
// ===========================================================================

sql(`insert into public.ai_provider_log
       (user_id, request_id, attempt_index, purpose, provider, model, outcome, latency_ms, cache_kept, reason)
     values ('${USER}', gen_random_uuid(), 0, 'chat', 'anthropic', 'claude-sonnet-4-6', 'success', 42, false, 'keep me')`);

for (const migration of [
  "supabase/migrations/20260828000000_ai_provider_log.sql",
  "supabase/migrations/20260829000000_agent_run_batches.sql",
]) {
  let reapplied = true;
  let error = "";
  try {
    execFileSync("psql", [...dbArgs(), "-v", "ON_ERROR_STOP=1", "-f", migration], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (err) {
    reapplied = false;
    error = String(err.stderr || err.stdout || err.message);
  }
  ok(`${migration.split("/").pop()} applies a second time without error`, reapplied, error.slice(0, 300));
}

ok("the log row that was there is still there, with its values",
  sql(`select latency_ms || '|' || cache_kept || '|' || reason from public.ai_provider_log
        where user_id='${USER}' and reason='keep me'`) === "42|false|keep me");
ok("the queued run survived the re-run", sql(`select count(*) from public.agent_runs where status='queued'`) !== "0");
ok("the pile-up index is still unique and still partial after the re-run",
  !tryStatement(
    `insert into public.agent_runs (agent_id, user_id, status, queued_at, batch_id)
     values ('${AGENT}', '${USER}', 'queued', now(), 'msgbatch_5')`
  ).ok);
ok("the grants survived: authenticated still cannot write the log",
  sql(`select has_table_privilege('authenticated', 'public.ai_provider_log', 'insert')`) === "f" &&
  sql(`select has_table_privilege('authenticated', 'public.ai_provider_log', 'update')`) === "f" &&
  sql(`select has_table_privilege('authenticated', 'public.ai_provider_log', 'delete')`) === "f");
ok("...and can still read it", sql(`select has_table_privilege('authenticated', 'public.ai_provider_log', 'select')`) === "t");
ok("'queued' is still an accepted status after the re-run",
  sql(`select count(*) from pg_constraint
        where conrelid='public.agent_runs'::regclass
          and conname='agent_runs_status_check'
          and pg_get_constraintdef(oid) like '%queued%'`) === "1");

cleanup();
sql(`delete from public.user_agents where id in ('${AGENT}', '${AGENT2}')`);

console.log(`\n${pass} passed, ${failures.length} failed`);
if (failures.length) {
  console.log("FAILURES:\n  " + failures.join("\n  "));
  process.exit(1);
}
