// THE SCHEMA, AS ONE STRING, FOR THE TESTS THAT READ IT.
//
// There used to be twenty loose .sql files at the repository root, and
// every test that wanted to assert something about the database picked
// one: agents.test.mjs read `v3_autonomous_agents_migration.sql`,
// security-posture.test.mjs read `supabase_full_project_backup.sql`,
// publishing.test.mjs read `v3_website_hosting_migration.sql`.
//
// That was already the wrong source before those files were deleted. None
// of them was what a database is built from — the backup was a snapshot of
// one project at one moment, the `v3_*` files were hand-written and ran in
// whatever order somebody pasted them in, and nothing checked that any of
// them agreed with the others. A test reading one of those was asserting
// what a FILE said, not what the database would be.
//
// supabase/migrations, in filename order, IS the database: it is what
// `supabase db push` runs and what scripts/db builds a fresh project from.
// So that is what these read, concatenated, with the filename kept in a
// comment before each so a failure can say which migration it was looking
// at.
import { readFileSync, readdirSync } from "node:fs";

const DIR = "supabase/migrations";

/** Every migration, in the order Postgres will see them. */
export function migrationFiles() {
  return readdirSync(DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();
}

/**
 * All of them as one string.
 *
 * CACHED, because eight test files call this and the corpus is ~600KB;
 * re-reading it per call turned a two-second suite into a nine-second one.
 */
let cached = null;
export function schemaSql() {
  if (cached === null) {
    cached = migrationFiles()
      .map((f) => `-- @@ ${f}\n${readFileSync(`${DIR}/${f}`, "utf8")}`)
      .join("\n");
  }
  return cached;
}

/**
 * The `enable row level security` line for one named table.
 *
 * Its own function because the assertion it replaces was a COUNT — "all
 * three tables enable RLS", written as `match(/enable row level
 * security/g).length === 3` against a file that held only those three
 * tables. Against the whole schema that number is 70, and a count of 70 is
 * not an assertion about the three tables the test is named after.
 */
export function enablesRls(sql, table) {
  return new RegExp(`alter table (?:only )?(?:public\\.)?"?${table}"?\\s+enable row level security`, "i").test(
    sql
  );
}

/**
 * Every table the migrations give a column named `column`, whether in a
 * `create table` body or a later `alter table … add column`.
 *
 * WHY THIS EXISTS. user-photos.test.mjs asserted "every table that
 * carries HTML is read" by the storage cleanup, and its evidence was
 * four table names WRITTEN IN THE GATE. The rule is about a population;
 * the check was about four examples of it. Adding a fifth table with an
 * `html_content` column to a migration on 2026-09-19 left the gate
 * green — and the consequence is stated in that gate's own comment two
 * lines above: a table the cleanup does not read contributes no
 * references, so every photograph reachable only from it is an orphan
 * and is deleted.
 *
 * The migrations are the population. Derive from them, do not list.
 */
export function tablesWithColumn(sql, column) {
  const found = new Set();
  const col = column.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  for (const m of sql.matchAll(
    /create table (?:if not exists )?(?:public\.)?"?([a-z_][a-z0-9_]*)"?\s*\(([\s\S]*?)\n\s*\)\s*;/gi
  )) {
    if (new RegExp(`^\\s*"?${col}"?\\s`, "im").test(m[2])) found.add(m[1]);
  }
  for (const m of sql.matchAll(
    new RegExp(
      `alter table (?:if exists )?(?:only )?(?:public\\.)?"?([a-z_][a-z0-9_]*)"?\\s+add column (?:if not exists )?"?${col}"?\\b`,
      "gi"
    )
  )) {
    found.add(m[1]);
  }
  return [...found].sort();
}
