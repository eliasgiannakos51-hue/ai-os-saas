// WHO MAY EXECUTE THIS PROJECT'S FUNCTIONS — and the one that takes
// somebody else's user id.
//
// grants-vs-policies.dbtest.mjs already owns the TABLE half of this
// territory, and owns it better: it walks every granted verb against the
// policies that could satisfy it. This file is the half it does not
// cover — function EXECUTE privileges, which fail differently. Postgres
// grants EXECUTE to PUBLIC by DEFAULT, so "no GRANT line in the
// migration" does not mean "not callable"; only an explicit REVOKE does.
// A function nobody revoked is reachable by every signed-in user.
//
// AND IT CANNOT BE READ OFF THE SQL. This project issues its grants
// inside `execute format(...)` loops over a list of names, so the string
// "grant execute on function public.search_all" appears in no migration.
// A regex sweep over the SQL reported search_all as ungranted and the
// unified search as broken — which was completely false. The database is
// asked instead.
//
// Run: DATABASE_URL=... node scripts/tests/grants-and-policies.dbtest.mjs
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const DB = process.env.DATABASE_URL ?? process.env.PGDATABASE;
if (!DB) { console.log("SKIPPED: no DATABASE_URL / PGDATABASE — this file needs a real Postgres."); process.exit(0); }

let pass = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { failures.push(name); console.log(`  FAIL  ${name}${detail !== undefined ? "\n        " + detail : ""}`); }
}
const sql = (q) => execFileSync("psql", ["-d", DB, "-v", "ON_ERROR_STOP=1", "-tAF|", "-c", q], { encoding: "utf8" }).trim();
const rows = (q) => sql(q).split("\n").filter(Boolean).map((l) => l.split("|"));

console.log("== 1. who may execute what ==");
// SCOPED TO THE FUNCTIONS THIS PROJECT DEFINES. `public` also holds
// pgcrypto, pg_trgm and unaccent, whose functions Supabase exposes to
// anon and authenticated as a matter of course. Asserting over all 119
// would be asserting about Postgres extensions, and the first draft of
// this file did exactly that and reported 79 "findings", none of them
// this product's.
const PROJECT_FNS = new Set();
for (const f of readdirSync("supabase/migrations")) {
  const src = readFileSync(path.join("supabase/migrations", f), "utf8").replace(/--.*$/gm, "");
  for (const m of src.matchAll(/create\s+(?:or\s+replace\s+)?function\s+(?:public\.)?(\w+)/gi)) PROJECT_FNS.add(m[1]);
}
const fns = rows(`
  select p.proname,
         has_function_privilege('authenticated', p.oid, 'execute'),
         has_function_privilege('anon', p.oid, 'execute'),
         has_function_privilege('service_role', p.oid, 'execute')
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname='public' and p.prokind = 'f'
  order by p.proname`).filter((r) => PROJECT_FNS.has(r[0]));
console.log(`        ${fns.length} of this project's functions are installed`);
check(`the project's functions were found (${fns.length})`, fns.length >= 30);
check("every one is executable by service_role", fns.every((r) => r[3] === "t"),
  fns.filter((r) => r[3] !== "t").map((r) => r[0]).join(", "));
const anonCan = fns.filter((r) => r[2] === "t").map((r) => r[0]);
check("none is executable by anon — the signed-OUT public", anonCan.length === 0, anonCan.join(", "));

// The short, deliberate list a SIGNED-IN user may call directly. Anything
// else runs behind a server route on the service role, which is where the
// "who is asking" check lives. A new name appearing here is a new piece
// of the database exposed straight to the browser, and should have to be
// argued for.
const EXPECTED = {
  search_all: "the unified search itself",
  search_query: "parses a search string; pure, no data",
  search_fold: "accent folding; pure, no data",
  search_headline: "renders the snippet; pure, no data",
  immutable_unaccent: "index support, wrapping unaccent()",
  immutable_join: "index support",
  match_agent_templates: "the ready-made agent library, which is public content",
  voice_usage_this_month: "the caller's own voice minutes — SECURITY INVOKER, so RLS answers (proved below)",
};
const authCan = fns.filter((r) => r[1] === "t").map((r) => r[0]).sort();
const unexpected = authCan.filter((n) => !(n in EXPECTED));
const stale = Object.keys(EXPECTED).filter((n) => !authCan.includes(n));
check(`only the ${Object.keys(EXPECTED).length} argued-for functions are callable by a signed-in user (${authCan.length})`,
  unexpected.length === 0, "unexpected: " + unexpected.join(", "));
check("...and every entry on that list is still real", stale.length === 0, "stale: " + stale.join(", "));

console.log("\n== 1b. and the extension functions, which ARE this product's problem ==");
// SECTION 1 EXCLUDES THEM, AND ITS REASON IS HALF RIGHT.
//
// Its comment says pgcrypto, pg_trgm and unaccent "Supabase exposes to
// anon and authenticated as a matter of course", and that asserting over
// all 119 would be asserting about Postgres extensions rather than about
// this product. The premise is correct — CREATE EXTENSION grants EXECUTE
// to PUBLIC, and anon is a member of PUBLIC. The conclusion was not.
//
// It is this product's anon key that reaches them. PostgREST exposes
// `public` as an RPC surface, so a holder of the key that ships in the
// browser bundle can send
//
//     select crypt('x', gen_salt('bf', 31))
//
// which is 2^31 bcrypt rounds: one request, one pinned worker, no
// authentication, and nothing in any rate limit this app owns, because it
// never reaches this app. "It came from an extension" describes where the
// grant came from, not who is exposed by it.
//
// 20260916000000_extension_functions_not_anon takes those grants off
// PUBLIC and gives them back to authenticated and service_role by name.
// authenticated is not optional there: gen_random_uuid() is the DEFAULT
// on most primary keys in this schema, and a DEFAULT is evaluated as the
// INSERTING role.
{
  const extFns = rows(`
    select p.oid::regprocedure::text, e.extname,
           has_function_privilege('anon', p.oid, 'execute'),
           has_function_privilege('authenticated', p.oid, 'execute'),
           has_function_privilege('service_role', p.oid, 'execute')
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      join pg_depend d on d.objid = p.oid and d.classid = 'pg_proc'::regclass and d.deptype = 'e'
      join pg_extension e on e.oid = d.refobjid
     where n.nspname = 'public'
     order by 1`);
  // A FLOOR, because "none of them is executable by anon" is trivially
  // true of a database where the extensions live in another schema — and
  // that is exactly what a real Supabase project may look like. This
  // suite runs against a plain Postgres where they are in `public`, so
  // the floor says the check had something to check.
  check(`extension functions were found in public (${extFns.length})`, extFns.length >= 60, String(extFns.length));
  const anonExt = extFns.filter((r) => r[2] === "t");
  check("anon can execute NONE of them", anonExt.length === 0,
    anonExt.slice(0, 8).map((r) => r[0]).join(", "));
  // AND THE OTHER HALF. Revoking from PUBLIC without granting back is how
  // this migration would break every insert in the product.
  const authMissing = extFns.filter((r) => r[3] !== "t");
  check("authenticated can still execute them — gen_random_uuid() is a column DEFAULT",
    authMissing.length === 0, authMissing.slice(0, 8).map((r) => r[0]).join(", "));
  const svcMissing = extFns.filter((r) => r[4] !== "t");
  check("and so can service_role — bypassrls does not bypass function EXECUTE",
    svcMissing.length === 0, svcMissing.slice(0, 8).map((r) => r[0]).join(", "));
  // The specific primitive that made this worth doing.
  const bcrypt = rows(`select p.oid::regprocedure::text, has_function_privilege('anon', p.oid, 'execute')
      from pg_proc p join pg_namespace n on n.oid=p.pronamespace
     where n.nspname='public' and p.proname in ('crypt','gen_salt')`);
  check(`crypt and gen_salt are present to be checked (${bcrypt.length})`, bcrypt.length >= 3, String(bcrypt.length));
  check("...and anon can reach neither", bcrypt.every((r) => r[1] === "f"),
    bcrypt.filter((r) => r[1] === "t").map((r) => r[0]).join(", "));
}

console.log("\n== 1c. the exposure report, and whether it can go red ==");
// A HEALTH CHECK THAT CANNOT FAIL IS A DECORATION.
//
// public.db_exposure_report() is what /dashboard/system-health asks on
// every load, and it answers the question the extension migration's
// header could only hand the reader as a query to run by hand. Eight
// counts, each with a verdict. If every verdict were computed as `true`
// the screen would say "all clear" forever and nobody would find out.
//
// So the last check here breaks something real, watches the report
// notice, and puts it back.
{
  const fn = rows(`select p.prosecdef, coalesce(array_to_string(p.proconfig, ','), '')
                     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                    where n.nspname='public' and p.proname='db_exposure_report'`);
  check("db_exposure_report exists exactly once", fn.length === 1, JSON.stringify(fn));
  check("it is SECURITY DEFINER — it reads pg_class and pg_default_acl", fn[0]?.[0] === "t");
  check("with a pinned search_path", /search_path=public/.test(fn[0]?.[1] ?? ""), fn[0]?.[1]);
  for (const role of ["anon", "authenticated", "public"]) {
    check(`${role} cannot execute it — the counts are a map of where to attack`,
      sql(`select has_function_privilege('${role}', 'public.db_exposure_report()', 'execute')`) === "f");
  }
  check("service_role can",
    sql(`select has_function_privilege('service_role', 'public.db_exposure_report()', 'execute')`) === "t");

  const report = rows(`select check_key, found, expected, ok from public.db_exposure_report() order by 1`);
  check(`it returns every check (${report.length})`, report.length === 8, report.map((r) => r[0]).join(", "));
  const notOk = report.filter((r) => r[3] !== "t");
  check("and this database passes all of them", notOk.length === 0,
    notOk.map((r) => `${r[0]}: ${r[1]} (expected ${r[2]})`).join("; "));

  // THE PART THAT MATTERS. Hand anon a table it should not have and
  // require the report to say so.
  const before = Number(rows(`select found from public.db_exposure_report() where check_key='anon_readable_relations'`)[0][0]);
  sql(`grant select on public.nav_events to anon`);
  const during = rows(`select found, ok from public.db_exposure_report() where check_key='anon_readable_relations'`)[0];
  sql(`revoke select on public.nav_events from anon`);
  const after = rows(`select found, ok from public.db_exposure_report() where check_key='anon_readable_relations'`)[0];
  check("a table handed to anon moves the count", Number(during[0]) === before + 1, `${before} -> ${during[0]}`);
  check("...and turns the verdict red", during[1] === "f", during[1]);
  check("...and revoking it puts both back", Number(after[0]) === before && after[1] === "t",
    `${after[0]}, ok=${after[1]}`);
}

console.log("\n== 5. the one that takes ANOTHER user's id, attacked ==");
// voice_usage_this_month(p_user_id) is callable by any signed-in user and
// takes an arbitrary id. That is only safe because it is SECURITY INVOKER
// — so the caller's own RLS decides — and safety by construction is worth
// proving rather than reading.
{
  const A = "41111111-1111-1111-1111-111111111111";
  const B = "41111111-1111-1111-1111-111111111112";
  sql(`insert into auth.users (id) values ('${A}'),('${B}') on conflict do nothing`);
  sql(`insert into public.voice_usage (user_id, month, transcribe_seconds, speak_seconds, speak_characters)
       values ('${A}', date_trunc('month',(now() at time zone 'utc'))::date, 999, 888, 7777)
       on conflict (user_id, month) do update set transcribe_seconds=999, speak_seconds=888, speak_characters=7777`);
  const asRole = (who, target) => sql(
    `begin; set local role authenticated; set local "request.jwt.claim.sub"='${who}';
     select * from public.voice_usage_this_month('${target}'); commit;`
  ).split("\n").map((l) => l.trim()).filter((l) => /^\d+\|/.test(l))[0] ?? "";
  check("the owner sees their own minutes", asRole(A, A) === "999|888|7777", asRole(A, A));
  check("another signed-in user asking for them sees zeros, not their data",
    asRole(B, A) === "0|0|0", asRole(B, A));
  check("it is SECURITY INVOKER, which is what makes that true",
    sql(`select prosecdef from pg_proc p join pg_namespace n on n.oid=p.pronamespace
         where n.nspname='public' and p.proname='voice_usage_this_month'`) === "f");
  sql(`delete from public.voice_usage where user_id in ('${A}','${B}')`);
  sql(`delete from auth.users where id in ('${A}','${B}')`);
}

console.log(
  failures.length === 0 ? `\nALL ${pass} CHECKS PASSED`
  : `\nFAILURES: ${pass} passed, ${failures.length} failed\n  - ` + failures.join("\n  - ")
);
process.exit(failures.length === 0 ? 0 : 1);
