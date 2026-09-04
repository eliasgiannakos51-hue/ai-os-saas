// THE PENDING-MIGRATIONS TOOL, AGAINST A DATABASE THAT HAS EVERYTHING —
// AND THEN AGAINST ONE THAT IS MISSING TWO THINGS.
//
// scripts/db/pending-migrations.mjs reads what every migration creates
// and asks the catalog whether it is there. Two things can go wrong with
// such a tool: it reports something as missing that exists (a false
// pending, which teaches people to ignore it), or it fails to notice
// something that is gone (which is the six functions of September). Both
// are checked here on the real schema: after run-dbtests applied all 63
// migrations, the query must return NOTHING; inside a transaction that
// drops one function and one column, it must return EXACTLY those two.
//
// Run: npm run test:db pending-migrations
import { execFileSync } from "node:child_process";
import { expectedObjects, missingObjectsQuery, objectsOf, countParams } from "../db/pending-migrations.mjs";

let pass = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { failures.push(name); console.log(`  FAIL  ${name}${detail !== undefined ? "\n        " + String(detail).slice(0, 600) : ""}`); }
}
const conn = process.env.DATABASE_URL ? [process.env.DATABASE_URL] : [];
const psql = (sql) => execFileSync("psql", [...conn, "-v", "ON_ERROR_STOP=1", "-At", "-F", "\t", "-c", sql], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();

console.log("== 1. the extractor reads real migration text ==");
{
  const sample = objectsOf(`
    -- create table if not exists public.in_a_comment (x int);
    create table if not exists public.real_table (id uuid primary key);
    alter table public.real_table add column if not exists note text;
    create or replace function public.two_args(p_a text, p_b integer default 3) returns void language sql as $$ select 1 $$;
    create or replace function public.no_args() returns integer language sql as $$ select 1 $$;
    create policy "own rows" on public.real_table for select using (true);
    create index if not exists real_table_note_idx on public.real_table (note);
    create trigger real_table_touch before update on public.real_table for each row execute function public.no_args();
  `);
  const has = (kind, name, extra) => sample.some((o) => o.kind === kind && o.name === name && (extra === undefined || o.extra === extra));
  check("a table inside a comment is not expected", !has("table", "in_a_comment"));
  check("table, column, policy, index, trigger are read", has("table", "real_table") && has("column", "note", "real_table") && has("policy", "own rows", "public.real_table") && has("index", "real_table_note_idx") && has("trigger", "real_table_touch"));
  check("a function is read with its argument COUNT", has("function", "two_args", "2") && has("function", "no_args", "0"));
  const storage = objectsOf(`create policy "own files" on storage.objects for select using (true); create policy "fmt_%1$s" on public.t for select using (true);`);
  check("a storage policy is checked in storage, and a format-built name is skipped", storage.some((o) => o.kind === "policy" && o.extra === "storage.objects") && !storage.some((o) => o.name.includes("%")));
  const sup = expectedObjects();
  const gci = sup.flatMap((m) => m.objects.filter((o) => o.kind === "function" && o.name === "grant_credits_idempotent").map((o) => `${m.file}:${o.extra}`));
  check(`a redefined function is expected only in its latest shape (${gci.join(", ")})`, gci.length >= 1 && new Set(gci.map((x) => x.split(":")[1])).size === 1, JSON.stringify(gci));
  check("countParams: 0 · 1 · nested types · a default with a comma inside parentheses",
    countParams(")") === 0 && countParams("p_a text)") === 1 && countParams("p_a numeric(10,2), p_b text)") === 2 && countParams("p_a jsonb default '{}'::jsonb, p_b text default coalesce('a','b'))") === 2);
  const all = expectedObjects();
  const total = all.reduce((n, m) => n + m.objects.length, 0);
  check(`the real migrations yield hundreds of objects (${total} across ${all.length} files, floor 400)`, total >= 400 && all.length >= 60);
}

console.log("\n== 2. on a database with every migration applied, nothing is pending ==");
const query = missingObjectsQuery();
const missing = psql(query);
const expectedCount = (query.match(/^\('/gm) ?? []).length;
check(`the query carries every expected object as a literal row (${expectedCount}, floor 400)`, expectedCount >= 400, String(expectedCount));
check(`no expected object is reported missing (${missing ? missing.split("\n").length : 0})`, missing === "", missing);

console.log("\n== 3. drop two things inside a transaction: exactly those two come back ==");
{
  const inTx = `begin;
drop function public.consume_rate_limit(text, text, integer, integer);
alter table public.user_websites drop column generation_notes;
${query}
rollback;`;
  const out = psql(inTx);
  const rows = out.split("\n").filter((l) => l.includes("\t")).map((l) => l.split("\t"));
  const named = rows.map((r) => `${r[1]}:${r[2]}`).sort();
  check("the dropped function is reported, by its migration", rows.some((r) => r[1] === "function" && r[2] === "consume_rate_limit" && r[0] === "20260919000000_atomic_rate_limit.sql"), JSON.stringify(rows));
  check("the dropped column is reported, by its migration", rows.some((r) => r[1] === "column" && r[2] === "generation_notes" && r[3] === "user_websites" && r[0] === "20260925000000_website_generation_notes.sql"), JSON.stringify(rows));
  check("...and nothing else", named.length === 2, JSON.stringify(named));
}
console.log("\n== 4. the transaction rolled back ==");
check("consume_rate_limit is still there", psql("select count(*) from pg_proc where proname = 'consume_rate_limit'") === "1");

console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${failures.length} failed`);
process.exit(failures.length === 0 ? 0 : 1);
