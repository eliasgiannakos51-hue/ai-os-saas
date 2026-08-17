// THE MIGRATIONS BUILD A WORKING DATABASE — AND THE CODE ONLY USES WHAT
// THEY BUILD.
//
// This file runs in two modes, and both matter.
//
// WITHOUT a database it is still a real gate: it reads every table name,
// RPC name and column the application source refers to, reads what the
// migrations create, and fails if the code needs something no migration
// makes. That is the check that would have caught the state this
// repository was in — twenty unordered .sql files in the root, none of
// them a migration, `reserve_credits` reachable from the code and from no
// migration at all.
//
// WITH a database (DATABASE_URL) it stops reading and starts measuring:
// object counts, idempotency across a second run, and the absence of
// anything destructive.
//
// WHY BOTH. A static scan cannot tell a function that exists from one
// that works. A live check cannot run on a laptop with no Postgres, and a
// gate that only runs in one place is a gate half the pushes skip.
//
// Run: node scripts/tests/db-migrations.test.mjs
//      DATABASE_URL=postgres://… node scripts/tests/db-migrations.test.mjs
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";

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
function checkList(name, actual) {
  check(name, actual.length === 0, actual.slice(0, 12).join("\n        "));
}

const MIG_DIR = "supabase/migrations";
const files = readdirSync(MIG_DIR).filter((f) => f.endsWith(".sql")).sort();
const migrations = files.map((f) => ({ name: f, sql: readFileSync(`${MIG_DIR}/${f}`, "utf8") }));
const allSql = migrations.map((m) => m.sql).join("\n");
// Comments in these files quote the statements they removed — "IT OPENED
// WITH 42 drop table statements" — so a scan of the raw text finds the
// explanation and reports the crime it documents.
const stripSqlComments = (s) => s.replace(/^\s*--.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
const code = stripSqlComments(allSql);

console.log("== 1. the migration directory is an ordered, complete path ==");
check(`there are ${files.length} migrations`, files.length >= 18, files.join(", "));
// Filename order has to be run order, so the names must sort the way the
// dependencies do. A file that does not start with a timestamp sorts
// unpredictably against ones that do.
checkList(
  "every migration is date-prefixed",
  files.filter((f) => !/^\d{8}/.test(f))
);
const sorted = [...files].sort();
check("filename order is already sorted order", JSON.stringify(files) === JSON.stringify(sorted));
// The baseline has to come first or nothing it creates exists yet.
check("the baseline sorts first", files[0].startsWith("20260803"), files[0]);
// And nothing may be left in the repository root pretending to be one.
checkList(
  "no loose .sql files in the repository root",
  readdirSync(".").filter((f) => f.endsWith(".sql"))
);
check("the old ones are archived with a README", existsSync("archive/README.md"));

console.log("\n== 2. nothing in the path destroys data ==");
// The rule that made the root files unrunnable. DROP TABLE and TRUNCATE
// are banned outright; DELETE is allowed only inside a function body with
// a WHERE clause, which is what retention and GDPR erasure need.
for (const m of migrations) {
  const body = stripSqlComments(m.sql);
  const drops = [...body.matchAll(/^\s*drop\s+table\b.*$/gim)].map((x) => x[0].trim());
  const truncs = [...body.matchAll(/^\s*truncate\b.*$/gim)].map((x) => x[0].trim());
  const bareDeletes = [...body.matchAll(/^\s*delete\s+from\s+(\S+)\s*;/gim)].map((x) => x[0].trim());
  checkList(`${m.name}: no DROP TABLE`, drops);
  checkList(`${m.name}: no TRUNCATE`, truncs);
  checkList(`${m.name}: no unqualified DELETE`, bareDeletes);
}

console.log("\n== 3. every function is revoked from anon and authenticated ==");
// The standing rule, which was being followed in one migration out of
// fourteen. It is a loop over pg_proc now rather than a line somebody has
// to remember, so the assertion is that the loop exists and covers the
// schema rather than that each file repeats it.
const grants = migrations.find((m) => m.name.includes("function_grants"));
check("a migration normalises grants across the whole schema", Boolean(grants));
if (grants) {
  const g = stripSqlComments(grants.sql);
  check("it loops over pg_proc rather than naming functions", /from pg_proc/.test(g) && /for .* in/.test(g));
  check("it revokes from public", /revoke all on function %s from public/.test(g));
  check("and from anon", /from anon/.test(g));
  check("and from authenticated", /from authenticated/.test(g));
  check("it grants to service_role", /grant execute on function %s to service_role/.test(g));
  // Extension-owned functions must be left alone or pg_trgm's operators break.
  check("extension-owned functions are excluded", /deptype = 'e'/.test(g));
}

console.log("\n== 4. the code only asks for what the migrations build ==");
// THE GATE THE USER ASKED FOR. Read what src/ touches, read what the
// migrations create, and report the difference.
function sourceFiles(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = `${dir}/${e.name}`;
    if (e.isDirectory()) sourceFiles(p, out);
    else if (/\.(ts|tsx)$/.test(e.name)) out.push(p);
  }
  return out;
}
const src = sourceFiles("src").map((f) => readFileSync(f, "utf8")).join("\n");

// Supabase table names appear only as runtime strings — invisible to the
// compiler, which is exactly why they need a check of their own.
const usedTables = new Set([...src.matchAll(/\.from\(["'`]([a-z_]+)["'`]\)/g)].map((m) => m[1]));
const usedRpcs = new Set([...src.matchAll(/\.rpc\(["'`]([a-z_]+)["'`]/g)].map((m) => m[1]));
const createdTables = new Set(
  [...code.matchAll(/create table (?:if not exists )?(?:public\.)?["']?([a-z_]+)["']?/gi)].map((m) =>
    m[1].toLowerCase()
  )
);
const createdFns = new Set(
  [...code.matchAll(/create (?:or replace )?function (?:public\.)?([a-z_]+)\s*\(/gi)].map((m) =>
    m[1].toLowerCase()
  )
);
// Tables the app reads through a different schema or a view alias.
const NOT_PROJECT_TABLES = new Set(["objects", "buckets", "users"]);
console.log(`        code touches ${usedTables.size} tables and ${usedRpcs.size} RPCs`);
checkList(
  "every table the code reads has a migration that creates it",
  [...usedTables].filter((t) => !createdTables.has(t) && !NOT_PROJECT_TABLES.has(t)).sort()
);
checkList(
  "every RPC the code calls has a migration that creates it",
  [...usedRpcs].filter((f) => !createdFns.has(f)).sort()
);

console.log("\n== 5. RLS: countable only against a live database ==");
// A STATIC COUNT CANNOT ANSWER THIS, and the first version of this check
// pretended otherwise. It counted `alter table X enable row level
// security` and reported 47 of 70, which looked like twenty-three
// unprotected tables. The live database says 70 of 70.
//
// The difference is that some of these migrations enable RLS inside a
// DO block that loops over the catalogue and executes
// `alter table public.%I enable row level security` — the table name is
// an identifier substituted at runtime, so there is nothing for a regex
// to find. A check that reported those tables as unprotected would be
// worse than no check: it would be a permanent red that everybody learns
// to scroll past.
//
// So the static half asserts only what it can see, and the live half
// below asserts the thing that matters, exactly.
check("row level security is enabled somewhere in the path", /enable row level security/i.test(code));
const rlsStatements = [...code.matchAll(/enable row level security/gi)].length;
console.log(`        ${rlsStatements} RLS statements in the migrations, some of them inside runtime loops`);
check("there are enough of them to be plausible", rlsStatements >= 40, String(rlsStatements));

// ===========================================================================
const DB = process.env.DATABASE_URL ?? process.env.PGDATABASE;
if (!DB) {
  console.log("\n== 6-8. SKIPPED: no DATABASE_URL — the live half needs a real Postgres ==");
  console.log("        See archive/README.md for how to build one from these migrations.");
} else {
  const sql = (q) =>
    execFileSync("psql", ["-d", DB, "-v", "ON_ERROR_STOP=1", "-tAc", q], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  const n = (q) => Number(sql(q));

  console.log("\n== 6. the live schema is the one the migrations describe ==");
  const tables = n(`select count(*) from pg_tables where schemaname='public'`);
  const fns = n(`select count(*) from pg_proc p join pg_namespace ns on ns.oid=p.pronamespace where ns.nspname='public'`);
  const pols = n(`select count(*) from pg_policies where schemaname='public'`);
  const polsAll = n(`select count(*) from pg_policies where schemaname in ('public','storage')`);
  console.log(`        tables ${tables} · functions ${fns} · policies ${pols} (${polsAll} with storage)`);
  check(`70 tables`, tables === 70, `got ${tables}`);
  check(`at least 18 RPC-callable functions`, fns >= 18, `got ${fns}`);
  check(`at least 200 policies in public`, pols >= 200, `got ${pols}`);

  console.log("\n== 6b. EVERY table has RLS on — measured, not counted in text ==");
  const noRls = sql(`select coalesce(string_agg(c.relname, ', '), '') from pg_class c
      join pg_namespace ns on ns.oid = c.relnamespace
     where ns.nspname='public' and c.relkind='r' and not c.relrowsecurity`);
  check("no table in public is left without row level security", noRls === "", noRls);
  // RLS ON with NO POLICY is deny-all: no client can read the table at
  // all, and only service_role gets through. For most tables that is a
  // mistake — the feature's own reads fail. For an internal ledger it is
  // exactly right, and stricter than any policy could be.
  //
  // So the question is not "does every table have a policy" but "is every
  // policy-less table one we MEANT to be unreachable". Each entry below
  // was checked: all four are written and read only through
  // createAdminClient(), and production_errors is additionally behind an
  // isAdminEmail() gate on the page that shows it.
  const DENY_ALL_BY_DESIGN = {
    rate_limit_log: "login and cron throttling — a user who could read it could time their retries",
    account_deletion_requests: "erasure queue; the requester already knows, nobody else may",
    daily_ai_spend_tracking: "the platform's own spend ledger, not the customer's",
    production_errors: "stack traces and affected user ids; admin-only page reads it via service role",
  };
  const noPolicy = sql(`select coalesce(string_agg(c.relname, ', '), '') from pg_class c
      join pg_namespace ns on ns.oid = c.relnamespace
     where ns.nspname='public' and c.relkind='r'
       and not exists (select 1 from pg_policies p where p.schemaname='public' and p.tablename=c.relname)`);
  const unexplained = noPolicy ? noPolicy.split(", ").filter((t) => !DENY_ALL_BY_DESIGN[t]) : [];
  checkList("every policy-less table is one we meant to be unreachable", unexplained);
  // And the other direction: a table on that list that GAINS a policy has
  // quietly become readable by somebody, which is the change worth
  // catching.
  const nowReadable = Object.keys(DENY_ALL_BY_DESIGN).filter(
    (t) => !(noPolicy ? noPolicy.split(", ") : []).includes(t)
  );
  checkList("and none of them has quietly gained one", nowReadable);

  console.log("\n== 7. every table the code reads really exists ==");
  const live = new Set(sql(`select tablename from pg_tables where schemaname='public'`).split("\n"));
  checkList(
    "no table is missing from the built database",
    [...usedTables].filter((t) => !live.has(t) && !NOT_PROJECT_TABLES.has(t)).sort()
  );
  const liveFns = new Set(
    sql(`select proname from pg_proc p join pg_namespace ns on ns.oid=p.pronamespace where ns.nspname='public'`).split("\n")
  );
  checkList("no RPC is missing", [...usedRpcs].filter((f) => !liveFns.has(f)).sort());

  console.log("\n== 8. grants, measured rather than assumed ==");
  // The query the rule asks for: every project function, per role.
  const leaky = sql(`
    select string_agg(sig, ', ') from (
      select p.oid::regprocedure::text as sig
        from pg_proc p
        join pg_namespace ns on ns.oid = p.pronamespace
        left join pg_depend d on d.objid = p.oid and d.deptype = 'e'
       where ns.nspname = 'public' and d.objid is null and p.prokind = 'f'
         and (has_function_privilege('anon', p.oid, 'EXECUTE')
              or has_function_privilege('authenticated', p.oid, 'EXECUTE'))
    ) s`);
  // search_headline / search_fold / immutable_unaccent are granted to
  // authenticated on purpose — they derive identity from auth.uid() and
  // read nothing RLS does not already gate.
  const ALLOWED = ["search_headline", "search_fold", "immutable_unaccent"];
  const unexpected = leaky
    ? leaky.split(", ").filter((s) => !ALLOWED.some((a) => s.startsWith(`${a}(`)))
    : [];
  checkList("no function is executable by anon or authenticated unexpectedly", unexpected);
  const noService = sql(`
    select coalesce(string_agg(sig, ', '), '') from (
      select p.oid::regprocedure::text as sig
        from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
        left join pg_depend d on d.objid = p.oid and d.deptype = 'e'
       where ns.nspname='public' and d.objid is null and p.prokind='f'
         and not has_function_privilege('service_role', p.oid, 'EXECUTE')
    ) s`);
  check("every function is executable by service_role", noService === "", noService);
  // The overload trap: CREATE OR REPLACE with a changed signature creates
  // a second function instead of replacing the first.
  const overloaded = sql(`
    select coalesce(string_agg(proname || ' x' || cnt, ', '), '') from (
      select p.proname, count(*) as cnt from pg_proc p
        join pg_namespace ns on ns.oid = p.pronamespace
        left join pg_depend d on d.objid = p.oid and d.deptype = 'e'
       where ns.nspname='public' and d.objid is null and p.prokind='f'
       group by p.proname having count(*) > 1) s`);
  check("no function in public is overloaded", overloaded === "", overloaded);
}

console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${failures.length} failed`);
process.exit(failures.length === 0 ? 0 : 1);
