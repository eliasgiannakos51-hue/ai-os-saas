// "I press the star and it does not appear in favourites."
//
// V4.6 #11.2, against a real PostgreSQL rather than a mock — because
// every plausible cause of this report is a database fact.
//
// WHAT THE READ ACTUALLY DOES. lib/favorites.ts's loadAllFavorites reads
// user_favorites, groups the ids by table, then for each table does
// `.from(table).select("*").in("id", ids)` and looks up a headline. When
// a headline cannot be resolved it does `continue` — it SKIPS the row,
// silently, with no error anywhere. The comment says why, and it is the
// right call for a record that was deleted after being starred.
//
// It is also exactly what a missing SELECT policy looks like from the
// outside: the star writes, the row is in user_favorites, and the
// favourites page shows nothing. No error, no empty state that mentions
// it, nothing in the log. So the two cases this file separates are:
//
//   1. the star could not be written at all (no INSERT policy/grant on
//      user_favorites) — loud;
//   2. the star was written and the RECORD cannot be read back (no
//      SELECT policy on the record's own table) — silent, and the shape
//      of the report.
//
// Twenty-three tables are starrable (lib/favoritable.ts). One of them
// missing a policy is one module where the star does nothing and says
// nothing.
//
// Run: DATABASE_URL=... node scripts/tests/favorites.dbtest.mjs
import { execFileSync } from "node:child_process";

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
const sql = (q) =>
  execFileSync("psql", ["-d", DB, "-v", "ON_ERROR_STOP=1", "-tAF|", "-c", q], { encoding: "utf8" }).trim();
const rows = (q) => sql(q).split("\n").filter(Boolean).map((l) => l.split("|"));

const { loadTs } = await import("./load-ts.mjs");
const { FAVORITABLE } = await loadTs("src/lib/favoritable.ts");
const TABLES = FAVORITABLE.map((f) => f.table);

// ---------------------------------------------------------------------
console.log("== 1. the starrable set is real ==");
check(`lib/favoritable.ts lists tables (${TABLES.length})`, TABLES.length >= 20, String(TABLES.length));
const present = new Set(
  rows(`select tablename from pg_tables where schemaname='public'`).map((r) => r[0])
);
const ghosts = TABLES.filter((t) => !present.has(t));
check(
  "every starrable table exists in the database",
  ghosts.length === 0,
  `${ghosts.join(", ")} — the star writes a row pointing at a table that is not there, and the favourites page skips it in silence`
);

// DIAGNOSTIC FIRST: is `authenticated` even a role in this database?
// A has_table_privilege() call against a role that does not exist is not
// a finding about the product.
const roleRows = rows(`select rolname from pg_roles where rolname in ('authenticated','anon','service_role')`);
console.log(`        roles present: ${roleRows.map((r) => r[0]).join(", ") || "NONE"}`);
console.log(`        ideas relacl: ${sql(`select coalesce(array_to_string(relacl,' '),'(null)') from pg_class where relname='ideas'`)}`);
const HAS_SUPABASE_ROLES = roleRows.some((r) => r[0] === "authenticated");

console.log("\n== 2. the star can be written ==");
// user_favorites needs insert AND delete for a toggle, and select for the
// page to read its own rows back.
const favPolicies = rows(`
  select cmd, count(*) from pg_policies
  where schemaname='public' and tablename='user_favorites'
  group by cmd order by cmd`);
const byCmd = Object.fromEntries(favPolicies.map((r) => [r[0].toUpperCase(), Number(r[1])]));
console.log(`        user_favorites policies: ${favPolicies.map((r) => `${r[0]}×${r[1]}`).join(" ") || "NONE"}`);
for (const cmd of ["SELECT", "INSERT", "DELETE"]) {
  check(`user_favorites has a ${cmd} policy`, (byCmd[cmd] ?? 0) > 0, "the toggle fails, or the page cannot read its own stars");
}
check(
  "and RLS is actually on",
  rows(`select relrowsecurity from pg_class where relname='user_favorites'`)[0]?.[0] === "t",
  "policies on a table without RLS enforce nothing"
);
// A GRANT WITHOUT A POLICY IS A SILENT NO-OP, and a policy without a
// grant is a permission nobody can use. Both together or neither.
// REPORTED, NOT ASSERTED, and the reason is that the measurement cannot
// answer the question here.
//
// The ephemeral cluster scripts/db/run-dbtests.mjs provisions applies
// this repository's migrations. It does NOT apply Supabase's own schema
// defaults, and the module tables get their `authenticated` privileges
// from those rather than from a GRANT in a migration — `ideas` comes out
// with relacl `postgres=arwdDxt/postgres`, i.e. nothing granted to
// anybody. So has_table_privilege() answers "f" for all twenty-three,
// and it would answer "f" whether production were healthy or broken.
//
// Asserting on it would produce twenty-three findings about the test
// harness wearing the costume of a product bug. The tables whose grants
// ARE issued by a migration are checked properly elsewhere —
// scripts/tests/grants-vs-policies.dbtest.mjs reads
// information_schema.table_privileges and owns that rule.
for (const priv of ["SELECT", "INSERT", "DELETE"]) {
  const granted = HAS_SUPABASE_ROLES
    ? sql(`select has_table_privilege('authenticated', 'public.user_favorites', '${priv}')`)
    : "no role";
  console.log(
    `  ....  authenticated ${priv} on user_favorites: ${granted}` +
      (granted === "f" ? " (this cluster has no Supabase default grants — see the note above)" : "")
  );
}

console.log("\n== 3. THE SILENT ONE — every starred record can be read back ==");
// This is the case that produces the report. loadAllFavorites resolves a
// headline per record; no SELECT policy means no row, no row means no
// headline, and no headline means `continue`.
const policyRows = rows(`
  select tablename, cmd, count(*) from pg_policies
  where schemaname='public' and tablename = any(array[${TABLES.map((t) => `'${t}'`).join(",")}])
  group by tablename, cmd`);
const selectPolicies = new Set(
  policyRows.filter((r) => r[1].toUpperCase() === "SELECT").map((r) => r[0])
);
const unreadable = TABLES.filter((t) => !selectPolicies.has(t));
check(
  `all ${TABLES.length} starrable tables have a SELECT policy`,
  unreadable.length === 0,
  `${unreadable.join(", ")} — starring a record here writes the favourite and the page then skips it with no error`
);
const rlsOff = rows(`
  select relname from pg_class
  where relname = any(array[${TABLES.map((t) => `'${t}'`).join(",")}]) and relrowsecurity = false
`).map((r) => r[0]);
check(
  "and RLS enabled on every one of them",
  rlsOff.length === 0,
  `${rlsOff.join(", ")} — readable by anyone, which is a bigger problem than the star`
);
// NOT ASSERTED HERE, and section 2's note says why: this cluster has no
// Supabase default grants, so has_table_privilege() answers "f" for all
// twenty-three whether production is healthy or not. Reported as a
// number so a future run on a cluster that DOES carry them shows a
// different one.
//
// (An `if (false)` wrapper around the assertion was the first attempt at
// keeping its shape. scripts/check-mutation-markers.mjs refused it, and
// was right to: a branch that cannot execute is the exact pattern this
// repository fails the build over.)
{
  const granted = TABLES.filter(
    (t) =>
      HAS_SUPABASE_ROLES &&
      sql(`select has_table_privilege('authenticated', 'public.${t}', 'SELECT')`) === "t"
  ).length;
  console.log(
    `  ....  SELECT granted to authenticated on ${granted} of ${TABLES.length} starrable tables — ` +
      "not asserted, because this cluster has no Supabase default grants to measure against"
  );
}

console.log("\n== 4. the headline column each one is read by exists ==");
// loadAllFavorites takes `row[config.headlineKey]`. A key naming a
// column that is not there yields undefined -> the same silent skip.
const missingHeadline = [];
for (const f of FAVORITABLE) {
  const col = rows(`
    select column_name from information_schema.columns
    where table_schema='public' and table_name='${f.table}' and column_name='${f.headlineKey}'`);
  if (col.length === 0) missingHeadline.push(`${f.table}.${f.headlineKey}`);
}
check(
  `every headline column exists (${FAVORITABLE.length} checked)`,
  missingHeadline.length === 0,
  `${missingHeadline.join(", ")} — the record resolves to no headline and is skipped without a word`
);

console.log("\n== 5. the join column is the one the reader uses ==");
// user_favorites stores (table_name, record_id) and the reader matches
// record_id against the record's `id`. A table keyed on something else
// would never match.
const noId = [];
for (const t of TABLES) {
  const col = rows(`
    select data_type from information_schema.columns
    where table_schema='public' and table_name='${t}' and column_name='id'`);
  if (col.length === 0) noId.push(t);
}
check(`every starrable table has an id column (${TABLES.length})`, noId.length === 0, noId.join(", "));
const favCols = rows(`
  select column_name from information_schema.columns
  where table_schema='public' and table_name='user_favorites'`).map((r) => r[0]);
for (const col of ["user_id", "table_name", "record_id", "created_at"]) {
  check(`user_favorites.${col} exists`, favCols.includes(col), favCols.join(", "));
}

console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${failures.length} failed`);
process.exit(failures.length === 0 ? 0 : 1);
