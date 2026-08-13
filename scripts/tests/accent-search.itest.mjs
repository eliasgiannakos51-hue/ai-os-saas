// The server half of accent-insensitive search, against a REAL PostgreSQL.
//
// `ilike` semantics are the database's, not something to assert from memory
// — and the whole defect was a wrong belief about what `ilike` does. So this
// applies the real migration to a real server and asks it.
//
// Run: node scripts/tests/accent-search.itest.mjs
//      (or with TEST_DATABASE_URL=... to use an existing server)
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
  console.log("accent-search (server): SKIPPED");
  console.log(`  ${pg.reason}`);
  console.log("  This test needs a real PostgreSQL server; it will not simulate one.");
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
async function rows(statement) {
  const out = await sql(statement);
  return out ? out.split("\n") : [];
}
function applyFile(file) {
  execFileSync(pg.psql, [...ARGS, "-v", "ON_ERROR_STOP=1", "-q", "-f", file], { encoding: "utf8", stdio: "pipe" });
}

try {
  console.log("accent-search (server)");

  await sql(`do $$ begin
    if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
    if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
    if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
  end $$;`);

  // Two tables: one shaped like a real module table, one deliberately not.
  await sql(`drop table if exists public.ideas, public.unprotected cascade`);
  await sql(`create table public.ideas (
      id uuid primary key default gen_random_uuid(),
      user_id uuid not null default gen_random_uuid(),
      name text,
      created_at timestamptz not null default now())`);
  await sql(`alter table public.ideas enable row level security`);
  await sql(`create table public.unprotected (id uuid primary key default gen_random_uuid(), user_id uuid, name text)`);

  const migration = path.join(ROOT, "supabase/migrations/20260813_accent_insensitive_search.sql");
  applyFile(migration);
  applyFile(migration); // must be idempotent
  check("migration applies twice cleanly", true, true);

  await sql(`insert into public.ideas (name) values
    ('Καφές'), ('ΚΑΦΕΣ'), ('καφές'), ('Καφε Bar'), ('ΚΑΦΈΣ'),
    ('Τσάι'), ('Müller GmbH'), ('Crème brûlée')`);

  // ------------------------------------------------------------------
  console.log("\n== the brief's own case ==");
  // ------------------------------------------------------------------
  const before = (await rows(`select name from public.ideas where name ilike '%καφε%' order by name`)).sort();
  check("BEFORE — plain ilike missed both accented forms", before, ["ΚΑΦΕΣ", "Καφε Bar"].sort());

  const after = (await rows(`select headline from public.search_headline('ideas','name','%καφε%',20)`)).sort();
  check(
    'AFTER — "καφε" finds Καφές, ΚΑΦΕΣ, καφές (and ΚΑΦΈΣ, Καφε Bar)',
    after,
    ["Καφές", "ΚΑΦΕΣ", "καφές", "ΚΑΦΈΣ", "Καφε Bar"].sort()
  );

  // The three the brief names, checked one at a time so a failure says which.
  for (const target of ["Καφές", "ΚΑΦΕΣ", "καφές"]) {
    check(`"καφε" finds "${target}"`, after.includes(target), true);
  }

  // ------------------------------------------------------------------
  console.log("\n== other scripts, and the sigma edge case ==");
  // ------------------------------------------------------------------
  check("'muller' finds 'Müller GmbH'", await rows(`select headline from public.search_headline('ideas','name','%muller%',20)`), ["Müller GmbH"]);
  check("'creme' finds 'Crème brûlée'", await rows(`select headline from public.search_headline('ideas','name','%creme%',20)`), ["Crème brûlée"]);
  // Searching the full accented word finds all four spellings of it —
  // including "ΚΑΦΕΣ", which is the final-sigma fold doing its job. It does
  // NOT find "Καφε Bar", which really does not contain the word: folding
  // removes accents and normalises ς to σ, it does not truncate letters.
  check(
    "an accented query finds every spelling of the same word",
    (await rows(`select headline from public.search_headline('ideas','name','%καφές%',20)`)).sort(),
    ["Καφές", "ΚΑΦΕΣ", "καφές", "ΚΑΦΈΣ"].sort()
  );
  check("unrelated text is not returned", await rows(`select headline from public.search_headline('ideas','name','%τσαγι%',20)`), []);

  // search_fold must agree with foldForMatch on the client.
  check("search_fold('Καφές')", await sql(`select public.search_fold('Καφές')`), "καφεσ");
  check("search_fold('ΚΑΦΕΣ')", await sql(`select public.search_fold('ΚΑΦΕΣ')`), "καφεσ");
  check("search_fold('ΚΑΦΈΣ')", await sql(`select public.search_fold('ΚΑΦΈΣ')`), "καφεσ");

  // ------------------------------------------------------------------
  console.log("\n== the wildcard escaping still means something ==");
  // ------------------------------------------------------------------
  await sql(`insert into public.ideas (name) values ('100% Ελληνικό'), ('100 τοις εκατό')`);
  // The route escapes a literal % as \\% before wrapping the pattern.
  check(
    "a literal % is matched literally, not as a wildcard",
    await rows(`select headline from public.search_headline('ideas','name','%100\\%%',20)`),
    ["100% Ελληνικό"]
  );

  // ------------------------------------------------------------------
  console.log("\n== the guards on the dynamic table name ==");
  // ------------------------------------------------------------------
  for (const [label, target, column] of [
    ["a table without RLS", "unprotected", "name"],
    ["a catalog table", "pg_authid", "rolname"],
    ["a table that does not exist", "definitely_not_here", "name"],
  ]) {
    let refused = false;
    try {
      await sql(`select * from public.search_headline('${target}','${column}','%a%',5)`);
    } catch {
      refused = true;
    }
    check(`refuses ${label}`, refused, true);
  }

  // ------------------------------------------------------------------
  console.log("\n== function properties the app depends on ==");
  // ------------------------------------------------------------------
  check(
    "search_headline is SECURITY INVOKER, so RLS still applies",
    await sql(`select prosecdef::text from pg_proc p join pg_namespace n on n.oid=p.pronamespace
               where n.nspname='public' and p.proname='search_headline'`),
    "false"
  );
  check(
    "anon cannot call it",
    await sql(`select coalesce(string_agg(grantee, ',' order by grantee), 'none')
               from information_schema.role_routine_grants
               where routine_schema='public' and routine_name='search_headline'
                 and grantee in ('anon','public','authenticated','service_role')`),
    "authenticated,service_role"
  );
  check(
    "search_fold is IMMUTABLE, so it can back an index",
    await sql(`select provolatile from pg_proc p join pg_namespace n on n.oid=p.pronamespace
               where n.nspname='public' and p.proname='search_fold'`),
    "i"
  );
  check(
    "the trigram index on the folded column exists",
    await sql(`select count(*) from pg_indexes where schemaname='public' and indexname='ideas_name_search_fold_idx'`),
    "1"
  );

  // And it is actually usable — a GIN index the planner can never choose is
  // decoration. Forced, because at eight rows a seq scan is genuinely
  // cheaper and the planner is right to say so.
  const plan = await sql(`set enable_seqscan = off;
    explain (costs off) select id from public.ideas
    where public.search_fold(name) like public.search_fold('%καφε%') escape '\\'`);
  check("the planner can use the trigram index", /ideas_name_search_fold_idx/.test(plan), true);
} finally {
  pg.stop();
}

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
