// THE DRIFT SIGNAL, AND THE LIST IT ASKS ABOUT.
//
// /dashboard/overview redirected every user to /onboarding because
// user_onboarding.home_seen_at was not in the production database. It
// never threw — the page discarded the query error and read null as "this
// user has not onboarded" — so no boundary fired, and /api/health said
// db:true because the database was answering perfectly.
//
// db:true WAS CORRECT. The probe reads a column that predates every
// migration, on purpose: an earlier version probed the NEWEST table and
// reported "database down" every time the schema was one migration
// behind, which is the most common state a deploying project is in.
//
// So drift is a second signal, `schema`, over lib/health/schema-canaries.ts
// — and a hand-written list of "recent objects" is exactly the thing that
// stops being recent. This gate derives what the newest migrations add and
// requires the list to match, the same arrangement message-slices.ts uses.
//
// Run: node scripts/tests/schema-canaries.test.mjs
import { readFileSync, readdirSync } from "node:fs";
import { loadTs } from "./load-ts.mjs";
import { stripComments } from "../check-mutation-markers.mjs";

let pass = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { failures.push(name); console.log(`  FAIL  ${name}${detail ? "\n        " + detail : ""}`); }
}

const DIR = "supabase/migrations";
const files = readdirSync(DIR).filter((f) => f.endsWith(".sql")).sort();
check(`migrations found (${files.length})`, files.length > 20, String(files.length));

// What the newest migrations ADD. Additive only — a canary must be
// something a database can be missing while everything else works.
// THE WINDOW, AND WHAT IT CANNOT SEE — stated because I got it wrong.
//
// The production database was missing merge_user_metadata, added by
// 20260910000000_merge_user_metadata.sql, which fell just outside a
// twelve-migration window. This gate therefore did not require it as a
// canary and /api/health would not have reported it. The window was a
// guess about how far behind a database can be, and the user's database
// answered: further than the guess.
//
// Widening it to 25 makes the rule demand 46 canaries. That is not a
// better gate — it is 46 probes on every health request and 46 hand-
// written "what breaks" sentences nobody will keep true, and a list
// nobody maintains is the thing this whole file exists to prevent.
//
// So the honest arrangement, with the limit named rather than papered
// over:
//
//   THIS LIST is the annotated, high-value subset — cheap enough to
//   probe on every request, and each entry says what a user loses.
//   Objects OLDER than the window can be missing and invisible here.
//
//   scripts/db-inventory.mjs is the COMPLETE answer: 106 tables, 36
//   RPCs, 1023 columns, 213 policies, 20 check constraints, no window.
//   It is the thing to run at deploy time, and running it is what would
//   have caught all five of the objects that were actually missing.
//
// Objects proven missing in a real database are canaries regardless of
// the window — see the explicit check below.
const RECENT = 12;
const recent = files.slice(-RECENT);
const added = { columns: new Set(), tables: new Set(), functions: new Set() };
for (const f of recent) {
  const sql = readFileSync(`${DIR}/${f}`, "utf8").replace(/--[^\n]*/g, "");
  for (const m of sql.matchAll(/alter\s+table\s+(?:public\.)?"?([a-z0-9_]+)"?\s+add\s+column\s+(?:if\s+not\s+exists\s+)?"?([a-z0-9_]+)"?/gi))
    added.columns.add(`${m[1]}.${m[2]}`);
  for (const m of sql.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?"?([a-z0-9_]+)"?/gi))
    added.tables.add(m[1]);
  for (const m of sql.matchAll(/create\s+(?:or\s+replace\s+)?function\s+(?:public\.)?"?([a-z0-9_]+)"?/gi))
    added.functions.add(m[1]);
}
console.log(`        newest ${RECENT} migrations add: ${added.columns.size} column(s), ${added.tables.size} table(s), ${added.functions.size} function(s)`);
check(
  "the newest migrations were parsed and add something",
  added.columns.size + added.tables.size + added.functions.size >= 5,
  "an empty derivation makes every check below pass on nothing"
);

const { SCHEMA_CANARIES } = await loadTs("src/lib/health/schema-canaries.ts");
check(`the canary list is populated (${SCHEMA_CANARIES.length})`, SCHEMA_CANARIES.length >= 3, String(SCHEMA_CANARIES.length));

// ---------------------------------------------------------------------
console.log("\n== 1. every canary is real — the migration it names adds it ==");
for (const c of SCHEMA_CANARIES) {
  const sql = files.includes(c.migration) ? readFileSync(`${DIR}/${c.migration}`, "utf8") : null;
  check(`${c.migration} exists`, sql !== null, `named by a canary but not in ${DIR}`);
  if (!sql) continue;
  const name = c.kind === "column" ? c.column : c.kind === "table" ? c.table : c.fn;
  check(`  …and it defines ${c.kind} ${name}`, new RegExp(`\\b${name}\\b`).test(sql),
    `${c.migration} never mentions ${name}`);
  check(`  …and the canary says what breaks`, typeof c.breaks === "string" && c.breaks.length > 15, c.breaks);
}

console.log("\n== 2. the column that caused the outage is covered ==");
check(
  "user_onboarding.home_seen_at is a canary",
  SCHEMA_CANARIES.some((c) => c.kind === "column" && c.table === "user_onboarding" && c.column === "home_seen_at"),
  "the one object that has actually taken a page down is not on the list"
);

console.log("\n== 2b. objects a real database was actually missing ==");
// NOT DERIVED — OBSERVED. These five came back missing from the user's
// production database on 2026-09-02. An object that has actually been
// absent from a live database is a canary whatever the window says,
// because it is the one class of evidence a heuristic cannot argue with.
for (const name of ["nav_events", "consume_rate_limit", "db_exposure_report", "merge_user_metadata", "prune_nav_events"]) {
  check(
    `${name} is a canary (it was missing in production)`,
    SCHEMA_CANARIES.some((c) => c.fn === name || c.table === name),
    "observed absent from a live database — it must be probed"
  );
}

console.log("\n== 4. the function probe can tell 'absent' from 'present, called without its arguments' ==");
// Six of the nine function canaries take a required argument, and the
// probe calls every function with none — so PostgREST answers "Could not
// find the function public.f without parameters in the schema cache"
// for a function that is THERE. Production listed all six as missing
// while every one of them was working. The tell is PostgREST's hint,
// which names the function when it exists with other parameters.
{
  const route = stripComments(readFileSync("src/app/api/health/route.ts", "utf8"));
  check("the probe reads the hint of a not-found answer", /\.hint/.test(route) && /presentWithOtherArgs/.test(route));
  check("...matching the SAME function name followed by an argument list",
    /new RegExp\(`function\\\\s\+\(\?:public\\\\\.\)\?\$\{c\.fn\}\\\\s\*\\\\\(`, "i"\)/.test(route));
  check("...and only a hintless not-found is recorded as missing", /if \(!presentWithOtherArgs\) \{\s*missing\.push\(/.test(route));
  const requiresArgs = SCHEMA_CANARIES.filter((c) => c.kind === "function").length;
  check(`there are function canaries for this to matter (${requiresArgs})`, requiresArgs >= 6);
}

console.log("\n== 3. the list has not fallen behind the migrations ==");
// Not "every added object must be a canary" — most are harmless and a
// list of everything is a list nobody reads. The rule is narrower and is
// the one that failed: an object added by a recent migration AND read by
// src/ is a canary, because that pair is what breaks a page.
const src = readdirSync("src", { recursive: true })
  .filter((f) => typeof f === "string" && /\.(ts|tsx)$/.test(f))
  .map((f) => readFileSync(`src/${f}`, "utf8"))
  .join("\n");
const listed = new Set(
  SCHEMA_CANARIES.map((c) => (c.kind === "column" ? `${c.table}.${c.column}` : c.kind === "table" ? c.table : c.fn))
);
const unlisted = [];
for (const col of added.columns) {
  const [, column] = col.split(".");
  if (!listed.has(col) && new RegExp(`["'\`][^"'\`]*\\b${column}\\b`).test(src)) unlisted.push(`column ${col}`);
}
for (const fn of added.functions) {
  if (!listed.has(fn) && src.includes(`rpc("${fn}"`)) unlisted.push(`function ${fn}()`);
}
for (const t of added.tables) {
  if (!listed.has(t) && src.includes(`from("${t}")`)) unlisted.push(`table ${t}`);
}
check(
  `every recently-added object that src/ reads is a canary (${unlisted.length} missing)`,
  unlisted.length === 0,
  unlisted.join("\n        ") + "\n        add it to lib/health/schema-canaries.ts, with what breaks without it"
);

console.log("\n== 4. /api/health reports it, separately from db ==");
{
  const route = readFileSync("src/app/api/health/route.ts", "utf8");
  check("health imports the canaries", /SCHEMA_CANARIES/.test(route));
  check("...and puts them in the body as `schema`", /body\.schema\s*=/.test(route));
  // THE PART THAT MATTERS. Folding drift into `ok` is what drained the
  // old probe's meaning; folding it into `db` would say "database down"
  // for a lagging additive migration.
  check(
    "...without touching ok or db",
    // ANCHORED TO THE END OF THE LINE. The first version tested
    // /db:\s*probe\.dbAnswered/, which still matches
    // `db: probe.dbAnswered && missingCount === 0` — the exact mutation
    // it exists to reject, and it survived. A substring is not a value.
    /^\s*ok:\s*probe\.ok,\s*$/m.test(route) && /^\s*db:\s*probe\.dbAnswered,\s*$/m.test(route),
    "drift must be its own signal — an additive migration lagging is not an outage"
  );
  check("...and only when the database answered", /if \(probe\.dbAnswered\) \{/.test(route),
    "asking a database that did not answer produces a list of false absences");
}

console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${failures.length} failed`);
process.exit(failures.length === 0 ? 0 : 1);
