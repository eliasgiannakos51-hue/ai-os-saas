#!/usr/bin/env node
/*
 * THE DATABASE THE GATES RUN AGAINST IS NOT THE DATABASE THAT MATTERS.
 *
 * Every dbtest in this project runs against an ephemeral Postgres built
 * by scripts/db/bootstrap-supabase.sql plus the migrations. That stub is
 * a MODEL of what Supabase provides before any migration runs, and a
 * model is wrong in ways nothing downstream can see: a check measures the
 * model and reports on production.
 *
 * It has happened twice, in opposite directions.
 *
 *   THE STUB WAS SAFER. It set no default privileges where Supabase
 *   grants ALL on every table to anon, authenticated and service_role.
 *   db_exposure_report's `grant_without_policy` had been reporting ZERO
 *   for as long as it existed. Corrected, it reported 89 (table, verb)
 *   pairs -- user_credits, credit_transactions, ai_cost_log,
 *   affiliate_payouts, production_errors among them.
 *
 *   THE STUB WAS LOOSER. storage.objects was created here without row
 *   level security and `authenticated` had no USAGE on the storage
 *   schema, so the ten policies the migrations create were inert on two
 *   counts. Measured against the STUB before the fix: account A read
 *   account B's private file.
 *
 *   THAT LEAK WAS THE FIXTURE'S, NOT PRODUCTION'S, and the first version
 *   of this header did not say so. Asked on 2026-09-05 --
 *   `select relrowsecurity from pg_class where oid =
 *   'storage.objects'::regclass` -- production answered TRUE. The ten
 *   policies were load-bearing there the whole time. What the divergence
 *   actually cost was not a hole: it was that no gate could exercise
 *   those policies at all, because on the fixture they were inert, so
 *   one of them saying `using (true)` would have gone unnoticed.
 *
 * So this file is the register. Section 1 holds the stub to what it must
 * model, so a line nobody re-reads cannot quietly go missing. Section 2
 * carries the divergences that REMAIN, each with the direction it fails
 * in and whether a gate reads it -- and each is checked BOTH WAYS, so an
 * entry that has stopped being true is a failure rather than a comment.
 *
 * Run: node scripts/tests/stub-vs-production.test.mjs
 */
import { readFileSync, readdirSync } from "node:fs";

let pass = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    failures.push(name);
    console.log(`  FAIL  ${name}${detail !== undefined ? `\n        ${detail}` : ""}`);
  }
}

const STUB = "scripts/db/bootstrap-supabase.sql";
const MIGRATIONS = "supabase/migrations";
const stub = readFileSync(STUB, "utf8");
const migFiles = readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort();
const migrations = migFiles.map((f) => readFileSync(`${MIGRATIONS}/${f}`, "utf8")).join("\n");

console.log("stub-vs-production");

// ---------------------------------------------------------------------
console.log("\n== 1. what the stub must model, because production has it ==");
// ---------------------------------------------------------------------
// EACH ROW IS AN INCIDENT, not a preference. `why` is the thing that went
// wrong when the line was absent; `needle` is what has to be in the stub
// for it not to happen again.
const MUST_MODEL = [
  {
    needle: /grant usage on schema auth to[^;]*authenticated/i,
    what: "authenticated can reach the auth schema",
    why: "every policy is `using (user_id = auth.uid())`, evaluated AS the querying role; without USAGE a policy does not deny, it ERRORS with permission denied for schema auth",
  },
  {
    needle: /grant execute on function auth\.uid\(\)[^;]*authenticated/i,
    what: "authenticated can execute auth.uid()",
    why: "same reason: the policy calls it, so the role must hold EXECUTE",
  },
  {
    needle: /alter default privileges in schema public\s+grant all on tables to[^;]*authenticated/i,
    what: "the public schema's default privileges",
    why: "Supabase grants ALL on every table to anon, authenticated and service_role -- which is WHY row level security is mandatory there. Without this the stub was a database more locked down than production, and grant_without_policy reported 0 while 89 pairs were granted",
  },
  {
    needle: /grant usage on schema storage to[^;]*authenticated/i,
    what: "authenticated can reach the storage schema",
    why: "without it the ten storage.objects policies cannot even be evaluated: permission denied for schema storage",
  },
  {
    needle: /alter table storage\.objects enable row level security/i,
    what: "row level security on storage.objects",
    why: "a policy on a table without RLS does nothing. Measured with it off IN THIS FIXTURE: account A read account B's private file, and the ten policies were decoration. Production has it on (section 2b) -- so the line is here to make the policies testable, not to fix a production hole",
  },
  {
    needle: /create role anon/i,
    what: "the anon role",
    why: "the migrations revoke from it by name; a REVOKE naming a role that does not exist is an error, not a no-op",
  },
  {
    needle: /create role authenticated/i,
    what: "the authenticated role",
    why: "89 targeted revokes in these migrations name it",
  },
  {
    needle: /create role service_role nologin bypassrls/i,
    what: "service_role, and that it BYPASSES RLS",
    why: "the server-side paths run as service_role; a stub whose service_role obeyed RLS would fail tests production passes",
  },
];
check(`the register names ${MUST_MODEL.length} things the stub must model`, MUST_MODEL.length >= 8);
const missing = MUST_MODEL.filter((m) => !m.needle.test(stub));
check(
  "...and the stub still models every one of them",
  missing.length === 0,
  missing.map((m) => `${m.what} — ${m.why}`).join("\n        ")
);
check(
  "...each with the incident that put it there",
  MUST_MODEL.every((m) => m.why.length > 40),
  MUST_MODEL.filter((m) => m.why.length <= 40).map((m) => m.what).join(", ")
);

// ---------------------------------------------------------------------
console.log("\n== 2. the divergences that remain, and which way they fail ==");
// ---------------------------------------------------------------------
// `safer` means the stub is STRICTER than production: a defect can hide
// (the 89 grants). `looser` means the stub is more permissive: a defect
// shows up here that production does not have, or an enforcement that
// production performs is not exercised (the storage policies). Both
// blind a gate; only the direction of the surprise differs.
//
// `holds` is a predicate that must still be TRUE for the entry to be
// describing the world. An entry whose predicate has gone false is stale
// and this file fails on it — an unchecked note about a database is
// exactly what this project keeps finding in its own instruments.
const DIVERGENCES = [
  {
    name: "extensions live in `public` here; a Supabase project may keep them in `extensions`",
    direction: "either",
    lies: "no gate, and it was measured rather than assumed: the accent search reached production. ⌘K was observed returning rows through search_all, which runs public.search_fold -> public.immutable_unaccent -> public.unaccent('public.unaccent'::regdictionary). That chain cannot resolve unless unaccent is in `public` there too. 20260916000000_extension_functions_not_anon.sql is written to be correct under both layouts and says so in its own header",
    holds: () =>
      /create extension if not exists unaccent/i.test(stub) &&
      !/create extension[^;]*schema\s+extensions/i.test(stub) &&
      migFiles.includes("20260916000000_extension_functions_not_anon.sql"),
  },
  {
    name: "auth.users has 6 columns here and roughly thirty in GoTrue",
    direction: "safer",
    lies: "nothing, and the direction is why: a query naming a column the stub lacks fails LOUDLY here and works in production. The reverse would be dangerous, and cannot happen while every column the stub declares is one GoTrue really has",
    holds: () => /create table if not exists auth\.users/i.test(stub),
  },
  {
    name: "the stub has auth.uid() and auth.role(); Supabase also has auth.jwt() and auth.email()",
    direction: "safer",
    lies: "nothing WHILE nothing depends on them — which is checked below rather than asserted",
    holds: () =>
      /create or replace function auth\.uid\(\)/i.test(stub) &&
      !/create or replace function auth\.jwt\(\)/i.test(stub),
  },
  {
    name: "auth.uid() here reads the singular request.jwt.claim.sub GUC; PostgREST sets the plural request.jwt.claims JSON",
    direction: "either",
    lies: "nothing about RLS SCOPING, which is what user-isolation.dbtest.mjs proves: given auth.uid() = A, no policy leaks B. It is the reason that suite proves scoping and NOT that GoTrue populates the claim — the named remaining half of the isolation gap",
    holds: () => /request\.jwt\.claim\.sub/.test(stub),
  },
  {
    name: "five roles exist here; a Supabase project has roughly twelve",
    direction: "safer",
    lies: "the grant checks name `anon` and `authenticated` explicitly, so a grant held by authenticator, dashboard_user or supabase_storage_admin is invisible to them BOTH here and in production. Bounded twice: this repository cannot create one (a GRANT to a role the stub lacks fails here, which section 3 checks), and production was asked once, on 2026-09-05, and answered with one object -- pg_stat_statements (section 2b). Once is not a gate",
    holds: () => /create role supabase_admin/i.test(stub),
  },
];
check(`the register names ${DIVERGENCES.length} remaining divergences`, DIVERGENCES.length >= 5);
const stale = DIVERGENCES.filter((d) => !d.holds());
check(
  "...and every one of them still describes this stub",
  stale.length === 0,
  stale.map((d) => d.name).join("\n        ")
);
check(
  "...each saying which way it fails and whether a gate reads it",
  DIVERGENCES.every((d) => ["safer", "looser", "either"].includes(d.direction) && d.lies.length > 40),
  DIVERGENCES.filter((d) => d.lies.length <= 40).map((d) => d.name).join(", ")
);

// ---------------------------------------------------------------------
console.log("\n== 2b. what production answered, once, by hand ==");
// ---------------------------------------------------------------------
// THREE THINGS THIS REPOSITORY CANNOT ASK. Nothing here can reach the
// real database: no credentials, no network path, and deliberately so.
// The owner ran these three by hand on the date each names and reported
// the answers, which is the only reason anything below is known rather
// than modelled.
//
// A FACT IN THIS LIST IS NOT A GATE, and the distinction is the whole
// point of the file it lives in. Nothing re-runs these; production can
// change the hour after they were asked and this suite will keep
// passing. So each one is stamped with the date it was true and with
// what it BOUNDS -- never with what it proves -- and every entry in
// section 1 stays enforced regardless of what production answered. The
// check at the end of this section is what holds that: a production
// answer may not retire a line the stub must model.
const PRODUCTION_FACTS = [
  {
    asked: "2026-09-05",
    query: "select relrowsecurity from pg_class where oid = 'storage.objects'::regclass",
    answer: "true",
    bounds: "row level security on storage.objects",
    means:
      "the ten policies are load-bearing in production and always were. The leak measured in this repository was the FIXTURE's. The divergence was 'production is stricter', and what it cost was coverage, not safety",
  },
  {
    asked: "2026-09-05",
    query: "select rolname, rolbypassrls from pg_roles order by 1",
    answer: "no role carries an unexpected rolbypassrls",
    bounds: "five roles exist here; a Supabase project has roughly twelve",
    means:
      "the roles the stub does not model cannot read past a policy, which is the way the missing seven could have mattered most",
  },
  {
    asked: "2026-09-05",
    query:
      "select grantee, table_schema, table_name, privilege_type from information_schema.role_table_grants where grantee not in ('anon','authenticated','service_role','postgres') order by 1,2,3",
    answer: "one object: pg_stat_statements -- SELECT to PUBLIC, all privileges to dashboard_user. No table holding user data",
    bounds: "five roles exist here; a Supabase project has roughly twelve",
    means:
      "the sharpest thing the grant checks cannot see -- a privilege held by a role they do not name -- was looked at once and held nothing. Supabase's own diagnostics, not this schema",
  },
];

const factTargets = new Set([...MUST_MODEL.map((m) => m.what), ...DIVERGENCES.map((d) => d.name)]);
check(`production answered ${PRODUCTION_FACTS.length} questions this repository cannot ask`, PRODUCTION_FACTS.length >= 3);
const undated = PRODUCTION_FACTS.filter((f) => !/^\d{4}-\d{2}-\d{2}$/.test(f.asked));
check(
  "...each stamped with the date it was true, because none of them is re-asked",
  undated.length === 0,
  undated.map((f) => f.query).join("\n        ")
);
// THE QUERY IS QUOTED SO IT CAN BE RUN AGAIN. A recorded answer whose
// question is a paraphrase cannot be reproduced, which is the same
// unreproducible-number shape this project has corrected three times in
// its own documents.
const notReadable = PRODUCTION_FACTS.filter((f) => !/^select\s/i.test(f.query.trim()) || f.query.includes(";"));
check(
  "...each carrying the exact read-only query, runnable as written",
  notReadable.length === 0,
  notReadable.map((f) => f.query).join("\n        ")
);
const dangling = PRODUCTION_FACTS.filter((f) => !factTargets.has(f.bounds));
check(
  "...and each bounding a line of this register rather than floating free",
  dangling.length === 0,
  dangling.map((f) => `${f.bounds} — names nothing in section 1 or 2`).join("\n        ")
);
// A PRODUCTION ANSWER MAY NOT RETIRE A MODELLED LINE. `relrowsecurity =
// true` in production is exactly the argument for deleting the stub's
// `enable row level security` -- and deleting it would make the ten
// policies untestable again, which is what the divergence cost in the
// first place. So the needle it bounds is asserted here a second time,
// on purpose.
const retired = PRODUCTION_FACTS.map((f) => MUST_MODEL.find((m) => m.what === f.bounds)).filter(
  (m) => m && !m.needle.test(stub)
);
check(
  "...and none of them has been used as a reason to stop modelling it",
  retired.length === 0,
  retired.map((m) => m.what).join("\n        ")
);

// ---------------------------------------------------------------------
console.log("\n== 3. and the claims those entries rest on, measured ==");
// ---------------------------------------------------------------------
// NOT A COMMENT. Two entries above are true only while something else
// stays true, so the something else is asked rather than believed.
// ONE READER, USED TWICE. The first version of this file spelled the
// pattern here and spelled it again in section 4's fixture, so breaking
// this one left the fixture green — the self-test was exercising a copy
// of the reader rather than the reader. Its own mutation suite reported
// it MISSED.
const AUTH_FNS_THE_STUB_LACKS = () => /auth\.(jwt|email)\s*\(/g;
const authFnCalls = [...migrations.matchAll(AUTH_FNS_THE_STUB_LACKS())].map((m) => m[0]);
// THE FLOOR IS auth.uid() ITSELF. "Nothing calls auth.jwt()" is true of an
// empty string, and gate-vacuity said so — the first version of this check
// asserted the absence with nothing proving the reader was pointed at any
// SQL at all. Every scoped policy in these migrations calls auth.uid(), so
// a corpus that does not contain it is a corpus this check has not read.
const authUidCalls = [...migrations.matchAll(/auth\.uid\s*\(/g)].length;
check(
  `nothing in the migrations calls auth.jwt() or auth.email(), which the stub does not have (${authUidCalls} auth.uid() calls read)`,
  authFnCalls.length === 0 && authUidCalls >= 100,
  authFnCalls.length > 0
    ? `${authFnCalls.length} call(s): ${[...new Set(authFnCalls)].join(", ")} — add them to the stub or stop calling them`
    : `only ${authUidCalls} auth.uid() calls found in ${migFiles.length} migrations — the scan did not read them`
);

// EVERY ROLE A MIGRATION GRANTS TO MUST BE ONE THE STUB CREATES. The
// failure this prevents is not local (a GRANT to a missing role errors
// here, loudly) but the reverse reading: it keeps the stub's role list
// and the migrations' assumptions in one place instead of two.
const stubRoles = new Set([...stub.matchAll(/create role (\w+)/gi)].map((m) => m[1]));
const granted = new Set(
  [...migrations.matchAll(/\b(?:grant|revoke)\b[^;]*?\b(?:to|from)\s+([\w, ]+?)\s*;/gis)]
    .flatMap((m) => m[1].split(","))
    .map((r) => r.trim())
    .filter((r) => /^\w+$/.test(r) && !["public", "current_user", "session_user"].includes(r.toLowerCase()))
);
check(`the migrations name roles in GRANT/REVOKE (${granted.size})`, granted.size >= 3, [...granted].join(", "));
const unknownRoles = [...granted].filter((r) => !stubRoles.has(r));
check(
  `...and every one is a role the stub creates (${stubRoles.size} roles)`,
  unknownRoles.length === 0,
  `${unknownRoles.join(", ")} — add to ${STUB} or the migration fails against a fresh database`
);

// ---------------------------------------------------------------------
console.log("\n== 4. the checks can go red ==");
// ---------------------------------------------------------------------
// A REGISTER THAT CANNOT FAIL IS A COMMENT. Each reader is put through a
// fixture that should trip it.
const fakeStub = "create role anon nologin;";
check(
  "a stub missing a modelled line is reported",
  MUST_MODEL.filter((m) => !m.needle.test(fakeStub)).length === MUST_MODEL.length - 1,
  `${MUST_MODEL.filter((m) => !m.needle.test(fakeStub)).length} of ${MUST_MODEL.length}`
);
check(
  "...while the real stub trips none of them",
  MUST_MODEL.filter((m) => !m.needle.test(stub)).length === 0
);
check(
  "an auth.jwt() call would be found",
  [...`select auth.jwt() ->> 'role'`.matchAll(AUTH_FNS_THE_STUB_LACKS())].length === 1
);
check(
  "...and an ordinary auth.uid() call is not mistaken for one",
  [...`select auth.uid()`.matchAll(AUTH_FNS_THE_STUB_LACKS())].length === 0
);

console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILED"}: ${pass} passed, ${failures.length} failed`);
process.exit(failures.length === 0 ? 0 : 1);
