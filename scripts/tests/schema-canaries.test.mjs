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
//   scripts/db-inventory.mjs is the COMPLETE answer for the public
//   schema AND for the ten policies on storage.objects: 107 tables, 37
//   RPCs, 1035 columns, 286 policies, 23 check constraints, no window.
//   It is the thing to run at deploy time, and running it is what would
//   have caught all five of the objects that were actually missing.
//
//   THESE FIVE NUMBERS ARE READ OUT OF `db-inventory.mjs --json`, not
//   carried forward. Four of the five it replaces were wrong: the policy
//   figure said 213 when the instrument derived 276, and the function,
//   column and table figures had each been overtaken by a migration.
//   db-inventory.test.mjs pins the property that matters (every literal
//   CREATE POLICY on a public table reaches expected_policies); these
//   are prose, and prose goes stale, so they are dated rather than
//   trusted — measured 2026-09-06.
//
//   THE WORD "PUBLIC" WAS LOAD-BEARING HERE UNTIL 2026-09-08, and the
//   sentence it carried was: "the ten policies on storage.objects are
//   outside what db-inventory.mjs reports, because its policy list is
//   filtered to the public tables src/ queries... nothing in this repo
//   yet compares them against production." It was true, and it is not
//   any more. `on storage.objects` was being parsed as a table called
//   `storage`, which is in no expected-table list, so the ten policies on
//   the table where every uploaded document lives were dropped from the
//   inventory without a word; the parse carries the schema now and the
//   query asks pg_policies for both. db-inventory.dbtest.mjs drops one of
//   them against a live server and requires the query to name it.
//
//   WHAT IS STILL TRUE: nothing here compares them against PRODUCTION.
//   The one measurement anybody has is 2026-09-05, when production
//   answered relrowsecurity = true for storage.objects.
//
// Objects proven missing in a real database are canaries regardless of
// the window — see the explicit check below.
const RECENT = 12;
const recent = files.slice(-RECENT);
const added = { columns: new Set(), tables: new Set(), functions: new Set() };
for (const f of recent) {
  const sql = readFileSync(`${DIR}/${f}`, "utf8").replace(/--[^\n]*/g, "");
  // EVERY add-column CLAUSE OF THE STATEMENT, not the first one. One
  // `alter table t add column a …, add column b …, add column c …;`
  // is three columns, and the pattern this replaces saw only `a` — so
  // the canary list silently omitted the second and third column of any
  // multi-column migration. That is precisely the object this file exists
  // to notice going missing.
  for (const stmt of sql.matchAll(/alter\s+table\s+(?:only\s+)?(?:if\s+exists\s+)?(?:public\.)?"?([a-z0-9_]+)"?([\s\S]*?);/gi))
    for (const c of stmt[2].matchAll(/add\s+column\s+(?:if\s+not\s+exists\s+)?"?([a-z0-9_]+)"?/gi))
      added.columns.add(`${stmt[1]}.${c[1]}`);
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

// ---------------------------------------------------------------------
// THE DIRECTION THAT WAS MISSING UNTIL 2026-09-11, and what it cost.
//
// This file's own header says it "derives what the newest migrations add
// and requires the list to match". Half of that was true. Section 1 checks
// every canary against its migration — that a canary is REAL. Nothing
// checked the other way: that a migration in the window HAS one.
//
// The derivation above even printed the answer on every run — "newest 12
// migrations add: 10 column(s), 3 table(s), 7 function(s)" — and then
// asserted nothing about it. A number measured and not judged is the shape
// this repository keeps finding in its own instruments; it was in the line
// directly above the first check.
//
// What it cost: presentation_decks (20260929), generated_posts (20260930)
// and projects (20261001) all landed inside the window with no canary, and
// /api/health reported schema ok with missing: [] while the owner found
// all three screens broken by hand.
//
// ONE CANARY PER MIGRATION, NOT PER OBJECT. The question a canary answers
// is "was this file ever pasted into the SQL editor", and one object
// answers it for the whole file — 20260924 adds cancel_requested_at to
// three tables and three canaries would be three ways to learn one fact.
// Requiring one per object would make the list long enough to stop being
// read, which is the failure mode named at the top of schema-canaries.ts.
// ---------------------------------------------------------------------
console.log("\n== 3. every migration in the window has a canary, or says why it cannot ==");

// Migrations that ADD no probeable object. A canary asks "does this
// object exist"; a file that only revokes, grants, or replaces the body of
// a function that already existed cannot be seen that way, by anybody.
const NOT_PROBEABLE = {
  "20260926000000_revoke_authenticated_grants_without_policy.sql":
    "revokes grants; it removes rather than adds, and an object that is still THERE is what a canary detects",
  "20260928000000_privileges_rls_cannot_scope.sql":
    "revokes and re-grants privileges; nothing new exists afterwards to probe for",
  "20261002000000_search_index_locale_translations_only.sql":
    "`create or replace` on search_index_sync, which existed before it. The function is present whether or not this file ran, so its existence proves nothing — the property it changes is behavioural and only unified-search.dbtest.mjs can see it",
};

const canariedMigrations = new Set(SCHEMA_CANARIES.map((c) => c.migration));
for (const f of recent) {
  const excused = Object.prototype.hasOwnProperty.call(NOT_PROBEABLE, f);
  check(
    `${f}`,
    canariedMigrations.has(f) || excused,
    `${f} is one of the newest ${RECENT} migrations and no canary names it, so /api/health\n` +
      `        cannot tell you whether it was ever applied. Add a canary for one object it creates\n` +
      `        — one is enough for the whole file — or add it to NOT_PROBEABLE with the reason it\n` +
      `        adds nothing a probe can see.`
  );
  if (excused) {
    check(`  …and its exemption carries a reason`, NOT_PROBEABLE[f].length > 40);
    check(`  …and it really adds nothing canaried`, !canariedMigrations.has(f),
      `${f} is in NOT_PROBEABLE and ALSO has a canary — one of the two is wrong.`);
  }
}

// Both ways: an exemption for a file that has left the window, or that
// has since grown something probeable, is a stale excuse.
for (const f of Object.keys(NOT_PROBEABLE)) {
  check(`${f} is still in the window`, recent.includes(f),
    `NOT_PROBEABLE excuses ${f}, which is no longer among the newest ${RECENT} migrations — drop it.`);
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
