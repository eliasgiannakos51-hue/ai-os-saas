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

console.log("\n== 4. the function check asks the API for its list, and says so when it cannot ==")
// THREE STATES, AND ONLY ONE OF THEM IS AN ACCUSATION.
//
// Two versions of this probe called each function with no arguments and
// read the failure. Six of the canaries take a required argument, so
// PostgREST answered "Could not find the function public.f without
// parameters in the schema cache" — the words it also uses for a function
// that is genuinely absent. The second version tried to separate them by
// the `hint`; production kept listing the same six, with the schema cache
// already reloaded and ⌘K visibly returning rows through search_all.
//
// A probe that says "six missing" when nothing is missing is worse than
// no probe: the four columns that WERE missing on 2026-09-04 arrived in
// that noise. So the question is now asked directly — PostgREST's root is
// an OpenAPI document listing one /rpc/<name> per function it can see —
// and when it cannot be asked, the sweep says "unchecked" rather than
// naming anything.
{
  const route = stripComments(readFileSync("src/app/api/health/route.ts", "utf8"));
  check("the function list comes from the API's own root document", /fetch\(`\$\{url\.replace\([^)]*\)\}\/rest\/v1\/`/.test(route));
  check("...read as OpenAPI", /Accept: "application\/openapi\+json"/.test(route));
  check("...and turned into the set of /rpc names it declares", /\/\^\\\/rpc\\\/\(\[A-Za-z0-9_\]\+\)\$\//.test(route));
  check(
    "a canary is missing only when the list came back and does not name it",
    /if \(!apiFunctions\) return;\s*if \(!apiFunctions\.has\(c\.fn as string\)\) \{/.test(route)
  );
  check("an unreachable or non-OK root is 'could not ask', not 'missing'", /if \(!res\.ok\) return null;/.test(route));
  check("...as is an unparseable one", /if \(!paths \|\| typeof paths !== "object"\) return null;/.test(route));
  check("...and so is a document that names no functions at all", /return names\.size > 0 \? names : null;/.test(route));
  check("the sweep reports which of the two happened", /functions: functionsListed \? "listed" : "unchecked"/.test(route));
  check(
    "...and counts only what it actually looked at",
    /checked: functionsListed \? SCHEMA_CANARIES\.length : SCHEMA_CANARIES\.length - functionCanaries/.test(route)
  );
  // The old probe called every function to find out whether it was there.
  // settle_reservation is not something to poke to see if it exists.
  check("no canary function is called to find out whether it exists", !/admin\.rpc\(c\.fn/.test(route));
  check("...and the hint heuristic that was wrong twice is gone", !/presentWithOtherArgs/.test(route));
  const fnCanaries = SCHEMA_CANARIES.filter((c) => c.kind === "function");
  check(`there are function canaries for this to be about (${fnCanaries.length})`, fnCanaries.length >= 6);
  check("every function canary names a function, not a table", fnCanaries.every((c) => typeof c.fn === "string" && c.fn.length > 0 && !c.table));
}

console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${failures.length} failed`);
process.exit(failures.length === 0 ? 0 : 1);
