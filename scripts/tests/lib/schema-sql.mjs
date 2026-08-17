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
