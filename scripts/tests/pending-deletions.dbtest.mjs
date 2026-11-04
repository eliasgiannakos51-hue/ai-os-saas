// ONE OPEN DELETION PER ACCOUNT, AND THE RECORD THAT OUTLIVES IT — ASKED
// OF A REAL POSTGRES.
//
// supabase/migrations/20261112000000_pending_deletions_one_open.sql makes
// four claims a reading of its text cannot settle:
//
//   - the partial unique index refuses a second OPEN row for one account,
//     and only an open one;
//   - the fold, run over duplicates written before it, keeps the EARLIEST
//     delete_after open, cancels the rest, deletes nothing, and carries
//     the cancelled rows' link digests into the kept row;
//   - pasting it again changes nothing;
//   - deleting the auth user leaves the row, with user_id null, and the
//     trigger empties both digest columns in the same update — fired by
//     the foreign key's own SET NULL, which is the part most worth
//     measuring rather than believing.
//
// scripts/tests/deferred-deletion.test.mjs holds the application half
// (lib/account/pending-deletion.ts) against a stand-in of this table,
// before and after the file.
//
// Run: DATABASE_URL=... node scripts/tests/pending-deletions.dbtest.mjs
//  or: npm run test:db -- pending-deletions
import { execFileSync } from "node:child_process";

const DB = process.env.DATABASE_URL ?? process.env.PGDATABASE;
if (!DB) {
  console.log("SKIPPED: no DATABASE_URL / PGDATABASE — this file needs a real Postgres.");
  process.exit(0);
}

let pass = 0;
const failures = [];
function check(name, cond, detail) {
  if (typeof cond !== "boolean") {
    failures.push(name);
    console.log(`  FAIL  ${name}\n        check() takes a BOOLEAN; got ${typeof cond}`);
    return;
  }
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { failures.push(name); console.log(`  FAIL  ${name}${detail !== undefined ? "\n        " + detail : ""}`); }
}
const MIGRATION = "supabase/migrations/20261112000000_pending_deletions_one_open.sql";
const base = ["-d", DB, "-v", "ON_ERROR_STOP=1"];
const sql = (q) => execFileSync("psql", [...base, "-tAc", q], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const rows = (q) => sql(q).split("\n").filter(Boolean);
/** Runs a statement that must FAIL; returns Postgres's message, or null if it succeeded. */
const refused = (q) => {
  try { sql(q); return null; } catch (e) { return String(e.stderr || e.message); }
};
const runMigration = () =>
  execFileSync("psql", [...base, "-q", "-f", MIGRATION], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });

const U = "71111111-1111-4111-8111-111111111111";
const V = "72222222-2222-4222-8222-222222222222";
const reset = () => {
  sql(`delete from public.pending_deletions where user_id in ('${U}', '${V}') or cancel_token_hash like 'pdt-%'`);
  sql(`delete from auth.users where id in ('${U}', '${V}')`);
  sql(`insert into auth.users (id, email) values ('${U}', 'pd-u@test.local'), ('${V}', 'pd-v@test.local')`);
};
reset();

console.log("== 1. the schema the file leaves ==");
{
  const col = sql(`select data_type || '|' || is_nullable || '|' || coalesce(column_default, '') from information_schema.columns
                    where table_schema = 'public' and table_name = 'pending_deletions' and column_name = 'previous_cancel_token_hashes'`);
  check(`previous_cancel_token_hashes is an array, never null, empty by default (${col})`, /^ARRAY\|NO\|'\{\}'/.test(col));
  const idx = sql(`select pg_get_indexdef(indexrelid) from pg_index
                    where indexrelid = 'public.pending_deletions_one_open_per_user'::regclass`);
  check("the one-open index is UNIQUE on user_id", /CREATE UNIQUE INDEX .* \(user_id\)/.test(idx), idx);
  check("...and partial: cancelled_at and executed_at both null", /WHERE \(\(cancelled_at IS NULL\) AND \(executed_at IS NULL\)\)/.test(idx), idx);
  const fk = rows(`select confdeltype from pg_constraint
                    where conrelid = 'public.pending_deletions'::regclass and contype = 'f'
                      and confrelid = 'auth.users'::regclass`);
  check(`exactly one foreign key to auth.users, ON DELETE SET NULL (${fk.join(",")})`, fk.length === 1 && fk[0] === "n");
  const nullable = rows(`select column_name || '=' || is_nullable from information_schema.columns
                          where table_schema = 'public' and table_name = 'pending_deletions'
                            and column_name in ('user_id', 'cancel_token_hash') order by 1`);
  check(`user_id and cancel_token_hash may be null (${nullable.join(", ")})`, nullable.join(",") === "cancel_token_hash=YES,user_id=YES");
  const trig = sql(`select count(*) from pg_trigger where tgname = 'pending_deletions_forget_tokens'
                     and tgrelid = 'public.pending_deletions'::regclass and not tgisinternal`);
  check("the trigger that forgets the digests is on the table", trig === "1");
}

console.log("\n== 2. the index refuses a second OPEN row, and only that ==");
{
  sql(`insert into public.pending_deletions (user_id, delete_after, cancel_token_hash) values ('${U}', now() + interval '30 days', 'pdt-u1')`);
  const second = refused(`insert into public.pending_deletions (user_id, delete_after, cancel_token_hash) values ('${U}', now() + interval '31 days', 'pdt-u2')`);
  check("a second open row for the same account is refused", second !== null && /pending_deletions_one_open_per_user/.test(second), String(second));
  check("...with unique_violation, the code the app handles (23505)", second !== null && /duplicate key value violates unique constraint/.test(second), String(second));
  const cancelled = refused(`insert into public.pending_deletions (user_id, delete_after, cancel_token_hash, cancelled_at) values ('${U}', now(), 'pdt-u3', now())`);
  check("a cancelled row beside it is allowed", cancelled === null, String(cancelled));
  const executed = refused(`insert into public.pending_deletions (user_id, delete_after, cancel_token_hash, executed_at) values ('${U}', now(), 'pdt-u4', now())`);
  check("an executed row beside it is allowed", executed === null, String(executed));
  const otherAccount = refused(`insert into public.pending_deletions (user_id, delete_after, cancel_token_hash) values ('${V}', now(), 'pdt-v0')`);
  check("another account's open row is allowed", otherAccount === null, String(otherAccount));
  const noDigest = refused(`update public.pending_deletions set cancel_token_hash = null where cancel_token_hash = 'pdt-u1'`);
  check("a row that still belongs to somebody cannot lose its link", noDigest !== null && /pending_deletions_token_while_owned/.test(noDigest), String(noDigest));
  sql(`update public.pending_deletions set delete_after = delete_after + interval '1 second' where cancel_token_hash = 'pdt-u1'`);
  check("an update that is not the account going leaves the link alone",
    sql(`select cancel_token_hash from public.pending_deletions where user_id = '${U}' and cancelled_at is null and executed_at is null`) === "pdt-u1");
}

console.log("\n== 3. the fold, over duplicates written before the file ==");
reset();
{
  // What the old schedule wrote: no index, so three open rows for V,
  // INSERTED out of date order on purpose — the kept row is the earliest
  // delete_after, not the earliest insert.
  sql(`drop index if exists public.pending_deletions_one_open_per_user`);
  sql(`insert into public.pending_deletions (user_id, delete_after, cancel_token_hash, created_at) values
         ('${V}', '2026-12-10T00:00:00Z', 'pdt-v-mid',   '2026-11-10T00:00:00Z'),
         ('${V}', '2026-12-20T00:00:00Z', 'pdt-v-late',  '2026-11-20T00:00:00Z'),
         ('${V}', '2026-12-01T00:00:00Z', 'pdt-v-early', '2026-11-25T00:00:00Z'),
         ('${U}', '2026-12-05T00:00:00Z', 'pdt-u-only',  '2026-11-05T00:00:00Z')`);
  sql(`insert into public.pending_deletions (user_id, delete_after, cancel_token_hash, cancelled_at) values
         ('${V}', '2026-10-01T00:00:00Z', 'pdt-v-old', '2026-09-15T00:00:00Z')`);
  const snapshot = () => rows(`select cancel_token_hash || '|' || coalesce(cancelled_at::text, '-') || '|' || coalesce(array_to_string(previous_cancel_token_hashes, ','), '')
                                 from public.pending_deletions where user_id in ('${U}', '${V}') order by cancel_token_hash`);
  const before = Number(sql(`select count(*) from public.pending_deletions where user_id in ('${U}', '${V}')`));
  runMigration();
  const after = Number(sql(`select count(*) from public.pending_deletions where user_id in ('${U}', '${V}')`));
  check(`nothing was deleted (${before} rows before, ${after} after)`, before === 5 && after === before);
  const open = rows(`select cancel_token_hash || '|' || delete_after::date || '|' || array_to_string(previous_cancel_token_hashes, ',')
                       from public.pending_deletions where user_id = '${V}' and cancelled_at is null and executed_at is null`);
  check(`one open row is left for the account (${open.length})`, open.length === 1, open.join(" / "));
  check("...the one with the EARLIEST delete_after, not the earliest insert", open[0]?.startsWith("pdt-v-early|2026-12-01"), open[0]);
  check("...and it carries the links of the rows folded into it", open[0]?.endsWith("|pdt-v-mid,pdt-v-late"), open[0]);
  const foldedCancelled = sql(`select count(*) from public.pending_deletions
                                where cancel_token_hash in ('pdt-v-mid', 'pdt-v-late') and cancelled_at is not null`);
  check("the folded rows are marked cancelled, not removed", foldedCancelled === "2");
  check("a row the person had cancelled long before keeps its own date",
    sql(`select cancelled_at::date from public.pending_deletions where cancel_token_hash = 'pdt-v-old'`) === "2026-09-15");
  check("another account's single schedule is untouched",
    sql(`select coalesce(cancelled_at::text, 'open') || '|' || cardinality(previous_cancel_token_hashes)
           from public.pending_deletions where cancel_token_hash = 'pdt-u-only'`) === "open|0");
  check("the index is back after the fold",
    sql(`select count(*) from pg_indexes where indexname = 'pending_deletions_one_open_per_user'`) === "1");

  const once = snapshot();
  runMigration();
  check("pasting it again changes nothing", JSON.stringify(snapshot()) === JSON.stringify(once), `${once.join(" / ")}\n        vs ${snapshot().join(" / ")}`);
}

console.log("\n== 4. the account goes, the record stays — without anything personal ==");
{
  // The cron writes executed_at first (claimExecution), then deletes the
  // auth user. The same two writes, in the same order.
  sql(`update public.pending_deletions set executed_at = now() where cancel_token_hash = 'pdt-v-early'`);
  const ids = rows(`select id from public.pending_deletions where user_id = '${V}' order by id`);
  check(`the account has rows to outlive it (${ids.length})`, ids.length === 4);
  sql(`delete from auth.users where id = '${V}'`);
  const idList = ids.map((i) => `'${i}'`).join(",") || "null";
  const left = rows(`select coalesce(user_id::text, 'null') || '|' || coalesce(cancel_token_hash, 'null') || '|' || cardinality(previous_cancel_token_hashes)
                       from public.pending_deletions where id in (${idList})`);
  check(`every row survived the account (${left.length} of ${ids.length})`, left.length === ids.length && ids.length > 0);
  check("...with user_id null", left.length > 0 && left.every((r) => r.startsWith("null|")), left.join(" / "));
  check("...and no link digest, current or folded — the trigger fired on the foreign key's own update",
    left.length > 0 && left.every((r) => r === "null|null|0"), left.join(" / "));
  check("the executed one still says when it ran",
    sql(`select count(*) from public.pending_deletions where id in (${idList}) and executed_at is not null`) === "1");
  const columns = rows(`select column_name from information_schema.columns
                          where table_schema = 'public' and table_name = 'pending_deletions' order by 1`);
  check(`what is left has no column that could name a person (${columns.join(", ")})`,
    columns.join(",") === "cancel_token_hash,cancelled_at,created_at,delete_after,executed_at,id,previous_cancel_token_hashes,user_id",
    "a new column on this table is a new thing the record keeps after the account is gone — add it to keptWithoutOwner in src/lib/gdpr/user-data-registry.ts and to this list, or clear it in the trigger");
  sql(`delete from public.pending_deletions where id in (${idList})`);
}

reset();
sql(`delete from public.pending_deletions where user_id in ('${U}', '${V}')`);
sql(`delete from auth.users where id in ('${U}', '${V}')`);

console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${failures.length} failed`);
process.exit(failures.length === 0 ? 0 : 1);
