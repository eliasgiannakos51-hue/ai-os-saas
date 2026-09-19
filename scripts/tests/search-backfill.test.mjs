// THE BACKFILL AND THE TRIGGERS READ ONE LIST, NOT TWO.
//
// 20260824000000_unified_search.sql attaches a trigger and backfills in
// ONE loop over ONE array, and says why in its own comment: "a table
// added to only one of two lists gets a silently empty half of the
// index."
//
// 20260919000000_search_index_backfill.sql exists because that loop runs
// ONCE. Reported 2026-09-19: ⌘K found no content for an account with 88
// records. A trigger only writes a row when its SOURCE row is next
// edited, so a table that was absent, or a DO block that stopped
// partway, leaves rows that are never indexed and nothing that says so.
//
// A second backfill typed out by hand would be exactly the second list
// that migration warns about. So it is GENERATED from the first, by
// scripts/db/emit-search-backfill.mjs, and this holds the two in step
// BOTH ways.
//
// REPRODUCED AND FIXED IN A REAL POSTGRESQL 16, 2026-09-19, not
// reasoned about: 88 source rows, 0 indexed, no triggers — then 88
// indexed, a second run adding 0, a new row self-indexing through the
// re-attached trigger, and `search_fold('εσοδα')||':*'` matching 50.
//
// Run: node scripts/tests/search-backfill.test.mjs
import { readFileSync, existsSync } from "node:fs";
import { readSpecs, emit, SOURCE, TARGET } from "../db/emit-search-backfill.mjs";

let pass = 0;
const failures = [];
const ok = (name, cond, detail) => {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { failures.push(name); console.log(`  FAIL  ${name}${detail !== undefined ? "\n        " + detail : ""}`); }
};

console.log("== 1. the list is read, and it is not empty ==");
const specs = readSpecs();
ok(`the spec array parsed out of ${SOURCE} (${specs.length} tables)`,
  specs.length >= 25,
  `${specs.length} — an empty parse makes every check below vacuous`);
ok("every spec has all seven fields",
  specs.every((s) => s.length === 7),
  specs.filter((s) => s.length !== 7).map((s) => s.join(",")).join(" | "));

console.log("\n== 2. the generated migration is what the generator emits ==");
ok("the migration exists", existsSync(TARGET));
const onDisk = existsSync(TARGET) ? readFileSync(TARGET, "utf8") : "";
ok("...and is byte-identical to a fresh generation",
  onDisk === emit(specs),
  "run: node scripts/db/emit-search-backfill.mjs --write");

console.log("\n== 3. every table the triggers cover is in the backfill, and nothing else ==");
// BOTH WAYS. A table in one list and not the other is the failure the
// unified-search migration names in its own comment.
const inBackfill = [...onDisk.matchAll(/^\s{4}\['([a-z_]+)',/gm)].map((m) => m[1]);
const inTriggers = specs.map((s) => s[0]);
// A FLOOR FIRST. The two emptiness assertions below are differences
// between two scraped lists, and a scraper that finds nothing produces
// an empty difference and a green line — the shape CLAUDE.md records
// under db-migrations' three scrapers, and gate-vacuity.test.mjs
// caught this file's own first draft for exactly it.
ok(`the backfill's table list was scraped (${inBackfill.length})`,
  inBackfill.length >= 25,
  `${inBackfill.length} — an empty scrape passes both checks below`);
ok(`the backfill names as many tables as the triggers (${inBackfill.length})`,
  inBackfill.length === specs.length,
  `${inBackfill.length} vs ${specs.length}`);
const onlyTriggers = inTriggers.filter((t) => !inBackfill.includes(t));
const onlyBackfill = inBackfill.filter((t) => !inTriggers.includes(t));
ok("no table gets a trigger and no backfill", onlyTriggers.length === 0, onlyTriggers.join(", "));
ok("no table gets a backfill and no trigger", onlyBackfill.length === 0, onlyBackfill.join(", "));
ok("...and in the same order, so the two files read as one",
  inBackfill.join(",") === inTriggers.join(","));

console.log("\n== 4. it cannot destroy anything ==");
// The rule the unified-search migration set for itself, held here: this
// runs against a live database, by hand, from a SQL editor.
const body = onDisk.replace(/^--.*$/gm, "");
for (const [what, re] of [
  ["no DROP TABLE", /drop\s+table/i],
  ["no TRUNCATE", /truncate/i],
  ["no unqualified DELETE", /delete\s+from\s+(?!.*where)/i],
  ["no DROP FUNCTION", /drop\s+function/i],
]) {
  ok(what, !re.test(body), (body.match(re) ?? [])[0]);
}
ok("every insert is `on conflict do nothing`, so live rows are never overwritten",
  (body.match(/insert into public\.search_index/g) ?? []).length ===
    (body.match(/on conflict \(source_table, source_id\) do nothing/g) ?? []).length,
  "an insert without the clause would replace text the triggers keep current");
ok("the href reconcile is qualified by source_table AND by inequality",
  /update public\.search_index set href = %L where source_table = %L and href <> %L/.test(body));

console.log("\n== 5. it refuses to run on a database that is not ready ==");
// The generated `document` column calls search_fold. Without it the
// insert fails per row with a message nobody reads as "run the other
// migration first".
ok("it checks for search_fold before anything else",
  /to_regprocedure\('public\.search_fold\(text\)'\) is null/.test(onDisk));
ok("...and for the table itself", /to_regclass\('public\.search_index'\) is null/.test(onDisk));
ok("...and says which migration to run", /20260824000000_unified_search\.sql/.test(onDisk));

console.log("\n== 6. it reports, rather than finishing silently ==");
// The original backfill is silent, which is why nobody could tell it had
// not run. This one prints a line per table and a total, and ends with
// the state of the index.
ok("a line per table", /raise notice '% : % row\(s\) now indexed/.test(onDisk));
ok("a total", /raise notice 'added % row\(s\) in total'/.test(onDisk));
ok("...and says what zero means", /nothing was added/.test(onDisk));
ok("and it ends by selecting what the index now holds",
  /select source_table, count\(\*\) as rows, count\(distinct user_id\) as accounts/.test(onDisk));

console.log("\n== 7. a table absent is skipped, not fatal ==");
// Which is how 29 tables survive a partially-migrated database — and
// how the original one reached its end with half the index empty.
ok("absence is checked", /information_schema\.tables/.test(onDisk));
ok("...and reported rather than swallowed", /table absent, skipped/.test(onDisk));

console.log("");
if (failures.length > 0) {
  console.log(`${pass} passed, ${failures.length} FAILED:`);
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
console.log(`ALL PASS: ${pass} passed, 0 failed`);
