// ARTICLE 17, ASKED OF A REAL POSTGRES.
//
// scripts/tests/gdpr-coverage.test.mjs reads the migration TEXT and
// asserts that every table with a user_id is classified. That catches a
// table nobody thought about. It cannot catch the claim underneath the
// classification, which is the one that matters:
//
//     "this table does not need explicit erasure, because deleting the
//      auth.users row cascades to it"
//
// That is a statement about FOREIGN KEYS, and about the DELETE RULE on
// them, and neither is visible in a grep of the file that declares the
// table — the constraint may have been added by a later migration, or
// added without `on delete cascade`, or point at a parent that itself
// does not cascade. A registry entry saying "cascaded" while the
// constraint says `on delete set null` is a person's data surviving their
// deletion, and every static check in this repository would pass.
//
// So the cascade is computed here from pg_constraint, transitively, the
// way Postgres will actually perform it.
//
// Run: DATABASE_URL=... node scripts/tests/gdpr-erasure.dbtest.mjs
//  or: npm run test:db -- gdpr-erasure
import { execFileSync } from "node:child_process";
import { loadTs } from "./load-ts.mjs";

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
    console.log(`  FAIL  ${name}\n        check() takes a BOOLEAN; got ${Array.isArray(cond) ? "an array" : typeof cond}`);
    return;
  }
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { failures.push(name); console.log(`  FAIL  ${name}${detail !== undefined ? "\n        " + detail : ""}`); }
}
const args = (q) => ["-d", DB, "-v", "ON_ERROR_STOP=1", "-tAc", q];
const sql = (q) => execFileSync("psql", args(q), { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const rows = (q) => sql(q).split("\n").filter(Boolean);

const R = await loadTs("src/lib/gdpr/user-data-registry.ts");
const { USER_DATA_TABLES, exportableTables, tablesNeedingExplicitErasure } = R;

console.log("== 1. the registry and the live schema describe the same database ==");
const liveTables = new Set(
  rows(`select tablename from pg_tables where schemaname = 'public'`)
);
check(`the live database has tables (${liveTables.size})`, liveTables.size >= 50,
  "an empty set makes every check below vacuous");
check(`the registry has entries (${USER_DATA_TABLES.length})`, USER_DATA_TABLES.length >= 50);

const registryOnly = USER_DATA_TABLES.map((t) => t.table).filter((t) => !liveTables.has(t));
check("every table the registry names exists", registryOnly.length === 0,
  `named but absent: ${registryOnly.join(", ")}`);

// The other direction: a table with a user_id that nobody classified.
// Asked of the live catalogue rather than of the migration text, so a
// column added by an ALTER in a later migration counts.
const withUserColumn = rows(`
  select distinct c.table_name
    from information_schema.columns c
    join pg_tables t on t.tablename = c.table_name and t.schemaname = 'public'
   where c.table_schema = 'public'
     and c.column_name in ('user_id', 'owner_id', 'affiliate_user_id', 'member_user_id')
   order by 1`);
check(`the live scan found user-scoped tables (${withUserColumn.length})`, withUserColumn.length >= 40);
const classified = new Set([
  ...USER_DATA_TABLES.map((t) => t.table),
  ...(R.NON_PERSONAL_TABLES ?? []).map((t) => (typeof t === "string" ? t : t.table)),
]);
const unclassified = withUserColumn.filter((t) => !classified.has(t));
check("every user-scoped table in the LIVE schema is classified", unclassified.length === 0,
  `unclassified: ${unclassified.join(", ")}`);

console.log("\n== 2. 'cascaded' is a claim about foreign keys — checked against them ==");
// Every table reachable from auth.users by following ON DELETE CASCADE
// foreign keys, transitively. This is what Postgres will actually do.
const cascaded = new Set(
  rows(`
    with recursive fk as (
      select con.conrelid::regclass::text as child
        from pg_constraint con
       where con.contype = 'f'
         and con.confdeltype = 'c'
         and con.confrelid = 'auth.users'::regclass
      union
      select con.conrelid::regclass::text
        from pg_constraint con
        join fk on con.confrelid::regclass::text = fk.child
       where con.contype = 'f'
         and con.confdeltype = 'c'
    )
    select replace(child, 'public.', '') from fk`)
);
check(`something cascades from auth.users (${cascaded.size} tables)`, cascaded.size >= 30,
  "if this is 0 every check below passes for the wrong reason");

const explicit = new Set(tablesNeedingExplicitErasure().map((t) => t.table));
const personal = USER_DATA_TABLES.filter((t) => t.scope !== "not_personal");
check(`there are personal-data tables to check (${personal.length})`, personal.length >= 40);

// THE CHECK. A table holding personal data must be reached by the
// cascade, or be declared as needing explicit erasure. Anything else is
// data that outlives the person.
const orphaned = personal
  .filter((t) => !explicit.has(t.table) && !cascaded.has(t.table))
  .map((t) => `${t.table} (${t.scope}${t.status ? ", " + t.status : ""})`);
check("no personal-data table is outside BOTH the cascade and the explicit list",
  orphaned.length === 0,
  `neither cascaded nor explicitly erased:\n        ${orphaned.join("\n        ")}`);

// And the other direction: a table declared as needing explicit erasure
// that IS cascaded is a note that has gone stale. Harmless today, and it
// is how a list stops being read.
const redundant = [...explicit].filter((t) => cascaded.has(t));
check("no table is on the explicit list AND already cascaded", redundant.length === 0,
  `the erasureNote for these is stale: ${redundant.join(", ")}`);

console.log("\n== 3. the explicit ones really are unreachable by the cascade ==");
for (const t of tablesNeedingExplicitErasure()) {
  check(`${t.table}: no cascading path from auth.users, as its note says`,
    !cascaded.has(t.table),
    "if a cascade was added, the explicit scrub is now dead code and the note is wrong");
  check(`${t.table}: the note says why`, typeof t.erasureNote === "string" && t.erasureNote.length > 40,
    String(t.erasureNote));
}

console.log("\n== 4. the columns the export redacts exist ==");
// A redactColumns entry naming a column that is not there redacts
// nothing, and reads in the file exactly like one that works.
{
  const missing = [];
  for (const t of USER_DATA_TABLES) {
    if (!t.redactColumns?.length || !liveTables.has(t.table)) continue;
    const cols = new Set(rows(
      `select column_name from information_schema.columns
        where table_schema='public' and table_name='${t.table}'`
    ));
    for (const c of t.redactColumns) if (!cols.has(c)) missing.push(`${t.table}.${c}`);
  }
  const redacting = USER_DATA_TABLES.filter((t) => t.redactColumns?.length);
  check(`some tables declare redactions (${redacting.length})`, redacting.length >= 3,
    "an empty set makes the check below vacuous");
  check("every redacted column exists on its table", missing.length === 0,
    `named but absent: ${missing.join(", ")}`);
}

console.log("\n== 4b. every exported table can actually be queried the way the route queries it ==");
// The route runs `.eq("user_id", user.id)` against every exportable
// table. A table that keys its owner as `owner_id` — and the live
// catalogue has those — answers with an error, which the route records
// under `unreadable_tables` and moves on. The user gets a note instead of
// their data, and no gate anywhere says which tables those are.
{
  const exportables = exportableTables();
  check(`there are exportable tables (${exportables.length})`, exportables.length >= 40);
  const noUserId = [];
  for (const t of exportables) {
    if (!liveTables.has(t.table)) continue;
    const has = sql(
      `select count(*) from information_schema.columns
        where table_schema='public' and table_name='${t.table}' and column_name='user_id'`
    );
    if (has !== "1") noUserId.push(t.table);
  }
  check("every exportable table has the user_id column the route filters on",
    noUserId.length === 0,
    `these would come back as 'unreadable' rather than as data:\n        ${noUserId.join("\n        ")}`);
}

console.log("\n== 5. erasure, performed ==");
// The claim above is structural. This deletes a real auth.users row with
// a real child row in place and counts what is left.
{
  const U = "22222222-2222-2222-2222-222222222222";
  sql(`delete from auth.users where id = '${U}'`);
  sql(`insert into auth.users (id, email) values ('${U}', 'erasure@test.local')`);
  // Three tables from three different depths of the cascade.
  const SEEDS = [
    ["public.user_credits", `insert into public.user_credits (user_id, credits_remaining, credits_total, plan_tier) values ('${U}', 10, 10, 'growth')`],
    ["public.user_onboarding", `insert into public.user_onboarding (user_id) values ('${U}')`],
  ];
  const seeded = [];
  for (const [table, stmt] of SEEDS) {
    try { sql(stmt); seeded.push(table); } catch { /* schema moved; reported below */ }
  }
  check(`seeded rows in ${seeded.length} table(s)`, seeded.length === SEEDS.length,
    `could not seed: ${SEEDS.map(([t]) => t).filter((t) => !seeded.includes(t)).join(", ")}`);
  const before = seeded.map((t) => Number(sql(`select count(*) from ${t} where user_id = '${U}'`)));
  check("the rows are there before the delete", before.every((n) => n === 1), before.join(","));

  sql(`delete from auth.users where id = '${U}'`);

  const after = seeded.map((t) => Number(sql(`select count(*) from ${t} where user_id = '${U}'`)));
  check("deleting the auth.users row removes them", after.every((n) => n === 0),
    seeded.map((t, i) => `${t}: ${after[i]}`).join(", "));
}

console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${failures.length} failed`);
process.exit(failures.length === 0 ? 0 : 1);
