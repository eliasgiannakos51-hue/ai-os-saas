// SAY YOUR NAME FIVE TIMES — AGAINST A REAL POSTGRESQL.
//
// The three things this has to establish cannot be established by reading
// the SQL, and two of them are the ones the brief named as gates:
//
//   a duplicate does not write a new row      (the counter goes up instead)
//   deleting one line does not delete others  (and A never sees B's memory)
//   the retention rule removes only what it says it removes
//
// RLS is the reason it needs a server. "A cannot see B's memory" is a
// policy, and a policy is only true when a session with B's claims asks
// the database. Everything here runs as `authenticated` with a jwt claim
// set, not as the owner.
//
// AND ONE MORE, WHICH IS THE JOIN BETWEEN TWO LANGUAGES. The application
// folds with lib/chat/memory-fold.ts (TypeScript) and the migration's
// backfill folds with public.search_fold() (SQL). If those two ever
// disagree, the same fact gets two rows and nothing anywhere says so — so
// they are compared here, on the shapes that matter, in both directions.
//
// Run: node scripts/tests/chat-memory-store.itest.mjs
//      (or with TEST_DATABASE_URL=... to use an existing server)
import { execFile, execFileSync } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { startEphemeralPostgres, psqlArgs } from "../lib/ephemeral-postgres.mjs";
import { loadTs } from "./load-ts.mjs";

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

const { memoryFold } = await loadTs("src/lib/chat/memory-fold.ts");

const pg = startEphemeralPostgres();
if (!pg.available) {
  console.log("chat-memory store: SKIPPED");
  console.log(`  ${pg.reason}`);
  console.log("  This test needs a real PostgreSQL server; it will not simulate one.");
  process.exit(0);
}

const ARGS = psqlArgs(pg.conn);
async function sql(statement, claims = null) {
  const prefix = claims === null
    ? ""
    : `set local role authenticated; set local request.jwt.claim.sub = '${claims}'; `;
  const body = prefix ? `begin; ${prefix} ${statement}; commit;` : statement;
  const { stdout } = await execFileAsync(
    pg.psql,
    [...ARGS, "-q", "-v", "ON_ERROR_STOP=1", "-tAc", body],
    { encoding: "utf8", maxBuffer: 8 * 1024 * 1024 }
  );
  return stdout.trim();
}
async function rows(statement, claims = null) {
  const out = await sql(statement, claims);
  return out ? out.split("\n").filter(Boolean) : [];
}
// A THROW IS A FAIL, NOT THE END OF THE RUN. These statements call the
// recorder, and the recorder is what a mutation breaks — a broken ON
// CONFLICT raises, the await rejects, and the whole itest dies leaving the
// runner with "exited non-zero with no FAIL line", which names nothing.
// Found 2026-09-12 by ai-memory.mutation.mjs making the fold index
// non-unique.
async function trySql(statement, claims = null) {
  try {
    return await sql(statement, claims);
  } catch (err) {
    const msg = String(err?.stderr ?? err?.message ?? err).trim().split("\n")[0];
    return `THREW: ${msg.slice(0, 90)}`;
  }
}
function applyFile(file) {
  execFileSync(pg.psql, [...ARGS, "-v", "ON_ERROR_STOP=1", "-q", "-f", file], {
    encoding: "utf8",
    stdio: "pipe",
  });
}

try {
  console.log("chat-memory store (server)");

  await sql(`do $$ begin
    if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
    if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
    if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
  end $$;`);
  await sql(`create schema if not exists auth`);
  await sql(`create table if not exists auth.users (id uuid primary key)`);
  // The shim every itest in this tree uses: auth.uid() reads the request's
  // own claim, which is what makes "as this user" mean something.
  await sql(`create or replace function auth.uid() returns uuid language sql stable
             as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$`);
  await sql(`grant usage on schema public to anon, authenticated, service_role`);
  // Supabase grants this; the shim has to as well, or every policy that
  // calls auth.uid() fails with "permission denied for schema auth" and
  // the test measures the harness rather than the schema.
  await sql(`grant usage on schema auth to anon, authenticated, service_role`);

  await sql(`drop table if exists public.chat_memory, public.chat_conversations cascade`);
  await sql(`create table public.chat_conversations (
      id uuid primary key default gen_random_uuid(),
      user_id uuid not null)`);
  await sql(`create table public.chat_memory (
      id uuid primary key default gen_random_uuid(),
      user_id uuid not null references auth.users(id) on delete cascade,
      memory_text text not null,
      source_conversation_id uuid references public.chat_conversations(id) on delete set null,
      created_at timestamptz not null default now())`);
  await sql(`alter table public.chat_memory enable row level security`);
  await sql(`create policy "select_own_chat_memory" on public.chat_memory for select using (auth.uid() = user_id)`);
  await sql(`create policy "insert_own_chat_memory" on public.chat_memory for insert with check (auth.uid() = user_id)`);
  await sql(`create policy "delete_own_chat_memory" on public.chat_memory for delete using (auth.uid() = user_id)`);
  await sql(`grant select, insert, delete on public.chat_memory to authenticated`);
  await sql(`grant select on public.chat_conversations to authenticated`);

  applyFile(path.join(ROOT, "supabase/migrations/20260813_accent_insensitive_search.sql"));

  const A = await sql(`insert into auth.users (id) values (gen_random_uuid()) returning id`);
  const B = await sql(`insert into auth.users (id) values (gen_random_uuid()) returning id`);
  const convA = await sql(`insert into public.chat_conversations (id, user_id) values (gen_random_uuid(), '${A}') returning id`);
  const convB = await sql(`insert into public.chat_conversations (id, user_id) values (gen_random_uuid(), '${B}') returning id`);

  // Legacy rows, written the way the old `.insert()` wrote them: the same
  // fact three times, in three spellings a person actually types.
  await sql(`insert into public.chat_memory (user_id, memory_text, source_conversation_id, created_at) values
      ('${A}', 'Τον λένε Ηλία και φτιάχνει ένα SaaS.', '${convA}', now() - interval '400 days'),
      ('${A}', 'τον λενε ηλια και φτιαχνει ενα saas.', '${convA}', now() - interval '200 days'),
      ('${A}', 'ΤΟΝ ΛΕΝΕ ΗΛΙΑ ΚΑΙ ΦΤΙΑΧΝΕΙ ΕΝΑ SAAS.', '${convA}', now() - interval '3 days'),
      ('${A}', 'Δοκίμασε μία φορά τη λειτουργία εξαγωγής.', '${convA}', now() - interval '300 days'),
      ('${B}', 'Τη λένε Μαρία.', '${convB}', now() - interval '5 days')`);

  // ------------------------------------------------------------------
  console.log("\n== the migration applies, and merges what is already there ==");
  // ------------------------------------------------------------------
  let applyError = null;
  try {
    applyFile(path.join(ROOT, "supabase/migrations/20261003000000_chat_memory_dedup_and_retention.sql"));
  } catch (err) {
    applyError = err;
  }
  check("the migration applies at all", applyError === null, true);
  if (applyError !== null) {
    console.log(`        ${String(applyError.stderr ?? applyError.message).trim().split("\n").slice(-4).join("\n        ")}`);
    console.log(`\n  ${pass} passed, ${fail} failed`);
    pg.stop();
    process.exit(1);
  }

  check("the three spellings became one row", await sql(`select count(*) from public.chat_memory where user_id = '${A}'`), "2");
  check(
    "…and it says it was said three times",
    await sql(`select times_seen from public.chat_memory where user_id = '${A}' and memory_text like 'Τον λένε%'`),
    "3"
  );
  check(
    "…keeping the OLDEST created_at, which is when it was first learned",
    await sql(`select round(extract(epoch from now() - created_at) / 86400)
               from public.chat_memory where user_id = '${A}' and times_seen = 3`),
    "400"
  );
  check(
    "…and the NEWEST last_seen_at, which is what the retention rule reads",
    await sql(`select round(extract(epoch from now() - last_seen_at) / 86400)
               from public.chat_memory where user_id = '${A}' and times_seen = 3`),
    "3"
  );
  check("B's row was not touched", await sql(`select count(*) from public.chat_memory where user_id = '${B}'`), "1");

  // Re-running a hand-applied migration is the normal case in this project.
  applyFile(path.join(ROOT, "supabase/migrations/20261003000000_chat_memory_dedup_and_retention.sql"));
  check("a second application changes nothing", await sql(`select count(*) from public.chat_memory`), "3");

  // ------------------------------------------------------------------
  console.log("\n== a duplicate does not write a new row ==");
  // ------------------------------------------------------------------
  const fact = "Τον λένε Ηλία και φτιάχνει ένα SaaS.";
  const fold = memoryFold(fact);
  const firstRecord = await trySql(
    `select public.chat_memory_record('${fact}', '${fold}', '${convA}')`,
    A
  );
  check("recording an existing fact does not raise", firstRecord.startsWith("THREW:") ? firstRecord : "ok", "ok");
  check("still one row for that fact", await sql(`select count(*) from public.chat_memory where user_id = '${A}'`), "2");
  check(
    "…and the counter went up instead",
    await sql(`select times_seen from public.chat_memory where user_id = '${A}' and times_seen > 1`),
    "4"
  );

  // A DIFFERENT SPELLING OF THE SAME FACT, which is the whole point of
  // folding rather than comparing the text.
  const shouted = "ΤΟΝ ΛΕΝΕ ΗΛΙΑ ΚΑΙ ΦΤΙΑΧΝΕΙ ΕΝΑ SAAS.";
  const shoutedRecord = await trySql(`select public.chat_memory_record('${shouted}', '${memoryFold(shouted)}', '${convA}')`, A);
  check("…nor does a different spelling of it", shoutedRecord.startsWith("THREW:") ? shoutedRecord : "ok", "ok");
  check("a different spelling is the same fact", await sql(`select count(*) from public.chat_memory where user_id = '${A}'`), "2");
  check("…counted again", await sql(`select max(times_seen) from public.chat_memory where user_id = '${A}'`), "5");

  const other = "Προτιμά σύντομες απαντήσεις.";
  const otherRecord = await trySql(`select public.chat_memory_record('${other}', '${memoryFold(other)}', '${convA}')`, A);
  check("…nor a brand-new one", otherRecord.startsWith("THREW:") ? otherRecord : "ok", "ok");
  check("a genuinely new fact IS a new row", await sql(`select count(*) from public.chat_memory where user_id = '${A}'`), "3");

  // ------------------------------------------------------------------
  console.log("\n== the two folds agree, TypeScript and SQL ==");
  // ------------------------------------------------------------------
  // The backfill above used public.search_fold(); everything the app writes
  // uses memoryFold(). A disagreement means one fact in two rows.
  for (const sample of [
    "Τον λένε Ηλία",
    "ΤΟΝ ΛΕΝΕ ΗΛΙΑ",
    "Crème brûlée",
    "Müller GmbH",
    "Señor Álvarez",
    "Prefers short answers",
  ]) {
    const inSql = await sql(`select public.search_fold('${sample}')`);
    check(`fold agrees on "${sample}"`, memoryFold(sample), inSql);
  }

  // ------------------------------------------------------------------
  console.log("\n== A does not see B's memory, and delete is one row ==");
  // ------------------------------------------------------------------
  check("A sees only A's rows", await sql(`select count(*) from public.chat_memory`, A), "3");
  check("B sees only B's row", await sql(`select count(*) from public.chat_memory`, B), "1");

  const bRowId = await sql(`select id from public.chat_memory where user_id = '${B}'`);
  await sql(`delete from public.chat_memory where id = '${bRowId}'`, A);
  check("A deleting B's row by id deletes nothing", await sql(`select count(*) from public.chat_memory where user_id = '${B}'`), "1");

  const oneOfA = await sql(`select id from public.chat_memory where user_id = '${A}' and times_seen = 1 order by created_at limit 1`);
  await sql(`delete from public.chat_memory where id = '${oneOfA}'`, A);
  check("A deleting one of their own removes exactly one", await sql(`select count(*) from public.chat_memory where user_id = '${A}'`), "2");
  check("…and B still has theirs", await sql(`select count(*) from public.chat_memory where user_id = '${B}'`), "1");

  // The function resolves the user from the session, never from an
  // argument — so it cannot be pointed at somebody else.
  const asBviaA = await sql(
    `select public.chat_memory_record('Κάτι για τη Μαρία', '${memoryFold("Κάτι για τη Μαρία")}', null)`,
    A
  );
  check("a row written through the function belongs to the caller",
    await sql(`select user_id from public.chat_memory where id = '${asBviaA}'`), A);

  // ------------------------------------------------------------------
  console.log("\n== the retention rule removes only what it says ==");
  // ------------------------------------------------------------------
  // Set the stage explicitly rather than relying on what happens to be
  // there: one repeated old fact, one said-once old fact, one said-once
  // recent fact.
  await sql(`delete from public.chat_memory where user_id = '${A}'`);
  await sql(`insert into public.chat_memory (user_id, memory_text, memory_fold, source_conversation_id, created_at, last_seen_at, times_seen) values
      ('${A}', 'repeated and old', 'repeated and old', '${convA}', now() - interval '400 days', now() - interval '400 days', 4),
      ('${A}', 'once and old',     'once and old',     '${convA}', now() - interval '400 days', now() - interval '400 days', 1),
      ('${A}', 'once and recent',  'once and recent',  '${convA}', now() - interval '10 days',  now() - interval '10 days',  1),
      ('${A}', 'once old confirmed','once old confirmed','${convA}', now() - interval '400 days', now() - interval '400 days', 1)`);
  await sql(`update public.chat_memory set confirmed_at = now() where memory_text = 'once old confirmed'`);

  // p_window = 1 so only the newest row is inside the window; everything
  // else is judged on its own merits rather than being protected by a
  // window wider than the fixture.
  const prunable = await rows(
    `select memory_text from public.chat_memory_prunable(180, 1) order by 1`,
    A
  );
  check("only the said-once, old, unconfirmed row is prunable", prunable, ["once and old"]);

  const removed = await sql(`select public.prune_chat_memory(180, 1)`, A);
  check("prune removes exactly that one", removed, "1");
  check(
    "…and the repeated one, the recent one and the confirmed one stay",
    (await rows(`select memory_text from public.chat_memory where user_id = '${A}' order by 1`)).join("|"),
    "once and recent|once old confirmed|repeated and old"
  );

  // A DELETED CONVERSATION TAKES ITS ONE-OFF EXTRACTION WITH IT. The FK is
  // `on delete set null`, so this is what "the context is gone" looks like.
  await sql(`insert into public.chat_memory (user_id, memory_text, memory_fold, source_conversation_id, times_seen)
             values ('${A}', 'from a conversation about to go', 'from a conversation about to go', '${convA}', 1)`);
  await sql(`delete from public.chat_conversations where id = '${convA}'`);
  const orphaned = await rows(`select memory_text from public.chat_memory_prunable(180, 100) order by 1`, A);
  check(
    "a row whose conversation was deleted is prunable however recent",
    orphaned.includes("from a conversation about to go"),
    true
  );
  check(
    "…but a REPEATED one is not, even with its conversation gone",
    orphaned.includes("repeated and old"),
    false
  );

  // ------------------------------------------------------------------
  console.log("\n== the table is still append/delete-only for a session ==");
  // ------------------------------------------------------------------
  // The counter needed an UPDATE and did not get an update policy: that is
  // the whole reason chat_memory_record exists. If a policy is ever added,
  // this goes red and somebody has to say why.
  check(
    "there is no update policy on chat_memory",
    await sql(`select count(*) from pg_policies where tablename = 'chat_memory' and cmd = 'UPDATE'`),
    "0"
  );
  let updateRefused = false;
  try {
    await sql(`update public.chat_memory set memory_text = 'rewritten' where user_id = '${A}'`, A);
  } catch {
    updateRefused = true;
  }
  const rewritten = await sql(`select count(*) from public.chat_memory where memory_text = 'rewritten'`);
  check("a session cannot rewrite a stored fact", updateRefused || rewritten === "0", true);

  check(
    "anon cannot execute the recorder",
    await sql(`select coalesce(string_agg(grantee, ',' order by grantee), 'none')
               from information_schema.role_routine_grants
               where routine_schema = 'public' and routine_name = 'chat_memory_record'
                 and grantee in ('anon','public','authenticated','service_role')`),
    "authenticated,service_role"
  );
  check(
    "the recorder is SECURITY DEFINER, which is why the identity comes from auth.uid()",
    await sql(`select prosecdef::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
               where n.nspname = 'public' and p.proname = 'chat_memory_record'`),
    "true"
  );
  check(
    "…and prunable is NOT, so RLS scopes it",
    await sql(`select prosecdef::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
               where n.nspname = 'public' and p.proname = 'chat_memory_prunable'`),
    "false"
  );
} finally {
  pg.stop();
}

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
