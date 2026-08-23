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

// A SECOND, STRICTER STRIPPER — for parsing CREATE TABLE column lists
// only. `stripSqlComments` above only removes a comment that is the
// WHOLE line (`^\s*--`), on purpose: this file's own comments sometimes
// quote SQL text worth matching against elsewhere. But a column
// definition's TRAILING comment — `action_type text not null, -- e.g.
// 'chat_message', 'create_anything',` — is exactly what breaks a
// comma-splitting column parser: the comment's own commas get read as
// column separators, and the words after them get read as column names.
// Quote-aware, so a `--` inside a real string literal is not mistaken
// for the start of a comment.
function stripAllSqlComments(sqlText) {
  let out = "";
  let inStr = false;
  for (let i = 0; i < sqlText.length; i++) {
    const ch = sqlText[i];
    if (inStr) {
      out += ch;
      if (ch === "'") {
        if (sqlText[i + 1] === "'") { out += "'"; i++; } // escaped '' inside the string
        else inStr = false;
      }
      continue;
    }
    if (ch === "'") { inStr = true; out += ch; continue; }
    if (ch === "-" && sqlText[i + 1] === "-") {
      while (i < sqlText.length && sqlText[i] !== "\n") i++;
      out += "\n";
      continue;
    }
    if (ch === "/" && sqlText[i + 1] === "*") {
      const end = sqlText.indexOf("*/", i + 2);
      i = end === -1 ? sqlText.length : end + 1;
      continue;
    }
    out += ch;
  }
  return out;
}
const commentFreeCode = stripAllSqlComments(allSql);

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
  // IDEMPOTENCE, which is the other half of "safe to re-run" and was not
  // checked here. All 73 CREATE TABLE statements in this directory
  // already say IF NOT EXISTS; nothing was holding them there, so the
  // seventy-fourth could drop it and the second run of the migration
  // path would abort on "relation already exists".
  //
  // This assertion came from schema-safety.test.mjs on the
  // five-prioritized-fixes branch. The other four checks on that file
  // are already covered: no DROP TABLE and no TRUNCATE are the two lines
  // above, and its remaining two were about the root schema files, which
  // this repository has since moved to archive/ behind a README rather
  // than made re-runnable. Only this one had nothing equivalent.
  checkList(
    `${m.name}: every CREATE TABLE says IF NOT EXISTS`,
    [...body.matchAll(/create\s+table\s+(?!if\s+not\s+exists)([^\s(]+)/gi)].map((x) => x[1])
  );
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
  // ON ROUTINE, not ON FUNCTION — that is the spelling that accepts a
  // procedure and an aggregate as well as a function. The loop filtered
  // `prokind = 'f'` until a probe on a real cluster showed a procedure and
  // an aggregate coming out of it still executable by anon.
  check("it revokes from public", /revoke all on routine %s from public/.test(g));
  check("and from anon", /from anon/.test(g));
  check("and from authenticated", /from authenticated/.test(g));
  check("it grants to service_role", /grant execute on routine %s to service_role/.test(g));
  check(
    "and it covers procedures and aggregates, not only functions",
    /prokind in \('f', 'p', 'a', 'w'\)/.test(g),
    "credit-function-privileges.itest.mjs proves this against a real cluster"
  );
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
// Kept as (path, content) pairs — not just the joined blob the table/RPC
// checks below still use — because the column checks (== 4b) need to
// name a FILE. "user_imports.mappings does not exist" sends someone
// hunting through 300 call sites; "src/app/api/import/csv/apply/route.ts:
// user_imports.mappings" does not.
const srcFilePairs = sourceFiles("src").map((f) => [f, readFileSync(f, "utf8")]);
const src = srcFilePairs.map(([, c]) => c).join("\n");

// ===========================================================================
// COLUMN-LEVEL CHECKING — shared between the static pass below (== 4b,
// parses columns out of the migration TEXT) and the live pass in section 7
// (reads information_schema, which is authoritative). Both call the same
// two functions so "how do we decide a call site is bad" is answered once.
// ===========================================================================

/**
 * The top-level (depth-1) keys of the object literal that starts at
 * `src[open]` (which must be "{"). Keys inside a NESTED object — a jsonb
 * value like `mapping: { targetSlug, mappings }` — are invisible on
 * purpose: `mappings` there is a VALUE, not a column, and the first
 * version of this scan flagged it as one because it matched every
 * `key:` in the payload regardless of depth.
 */
function topLevelKeys(str, open) {
  const keys = [];
  let depth = 0, inStr = null, key = "", collecting = true;
  for (let i = open; i < str.length; i++) {
    const ch = str[i];
    if (inStr) { if (ch === "\\") i++; else if (ch === inStr) inStr = null; continue; }
    if (ch === '"' || ch === "'" || ch === "`") { inStr = ch; continue; }
    if (ch === "{" || ch === "[" || ch === "(") { depth++; if (depth > 1) collecting = false; continue; }
    if (ch === "}" || ch === "]" || ch === ")") {
      depth--;
      if (depth === 1) { collecting = true; key = ""; }
      if (depth === 0) break;
      continue;
    }
    if (depth !== 1) continue;
    if (ch === ",") { key = ""; collecting = true; continue; }
    if (ch === ":" && collecting) {
      const k = key.trim().replace(/^\.\.\..*/, "");
      if (/^[a-z_][a-z0-9_]*$/.test(k)) keys.push(k);
      key = ""; collecting = false;
      continue;
    }
    if (collecting) key += ch;
  }
  return keys;
}

const SUPABASE_FILTER_METHODS = "eq|neq|gt|gte|lt|lte|like|ilike|is|in|contains|containedBy|order";

/**
 * Every table.column the file's Supabase chains touch, checked against
 * `columnsByTable` (a Map<table, Set<column>>) — supplied by the caller,
 * so this same function grades both the migration TEXT (static) and the
 * live database (authoritative) without knowing which one it is looking
 * at. Runtime strings — `.eq()`, `.order()`, `.select("a, b")`,
 * `.insert({...})` — are exactly what the compiler cannot see, which is
 * the reason this check exists at all.
 */
function columnIssuesIn(fileContent, columnsByTable, knownTables) {
  const issues = [];
  for (const m of fileContent.matchAll(/\.from\(\s*["'`]([a-z_][a-z0-9_]*)["'`]\s*\)/g)) {
    const table = m[1];
    if (!knownTables.has(table)) continue; // reported separately, by section 4/7's table check
    const cols = columnsByTable.get(table);
    if (!cols) continue;
    const chainStart = m.index + m[0].length;
    const chain = fileContent.slice(chainStart, chainStart + 1200).split(/\.from\(|\n\s*\n/)[0];

    for (const f of chain.matchAll(
      new RegExp(`\\.(${SUPABASE_FILTER_METHODS})\\(\\s*["'\`]([a-zA-Z_][a-zA-Z0-9_]*)["'\`]`, "g")
    )) {
      if (!cols.has(f[2])) issues.push(`${table}.${f[2]} via .${f[1]}()`);
    }
    for (const s of chain.matchAll(/\.select\(\s*["'`]([^"'`]*)["'`]/g)) {
      if (s[1].includes("(")) continue; // embedded-resource syntax — out of scope
      for (const raw of s[1].split(",")) {
        const col = raw.trim().split(/[:\s]/)[0];
        if (!col || col === "*" || col.startsWith("count")) continue;
        if (!cols.has(col)) issues.push(`${table}.${col} via .select()`);
      }
    }
    // WRITES, not just reads. A filter on a missing column returns an
    // error object many call sites never check; an insert/update to one
    // fails outright — worse, and just as invisible to tsc. TOP-LEVEL
    // KEYS ONLY (topLevelKeys), so a jsonb value's own keys — `content:
    // { html: "" }`, `mapping: { targetSlug, mappings }` — are never
    // mistaken for columns. An earlier draft of this scan matched every
    // depth and reported both as missing; neither is.
    for (const w of chain.matchAll(/\.(insert|update|upsert)\(\s*(?:\[\s*)?\{/g)) {
      const open = chain.indexOf("{", w.index + w[0].length - 1);
      if (open === -1) continue;
      for (const k of topLevelKeys(chain, open)) {
        if (!cols.has(k)) issues.push(`${table}.${k} via .${w[1]}()`);
      }
    }
  }
  return issues;
}

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

console.log("\n== 4b. the code only writes/reads COLUMNS the migrations create ==");
// THE GAP THIS CLOSES. Section 4 above checks that a TABLE exists. It
// said nothing about whether the columns a call site actually touches
// are among the ones the table has — which is exactly how
// ai_missions.plan_steps_version, user_websites.editing_started_at,
// user_websites.stuck_notified_at and user_automations.processing_
// started_at went missing from every migration for as long as this repo
// has had migrations: the TABLES were always there, so section 4 was
// always green, while four ALTER TABLE statements that lived only in
// archive/supabase_complete_schema.sql never crossed into
// supabase/migrations/. A fresh database built from this directory alone
// broke Mission Control's optimistic lock, the website edit-claim, the
// stuck-generation notice and the automations cron claim — with nothing
// in any existing gate able to say so.
//
// PARSED FROM THE MIGRATION TEXT, best-effort. `create table (...)` and
// `alter table ... add column [if not exists] ...` cover the two shapes
// this codebase actually uses; a constraint line inside a CREATE TABLE
// (`primary key (...)`, `check (...)`, `foreign key (...)`) is excluded
// so it is never mistaken for a column named "primary" or "check". This
// is necessarily approximate — real precision needs a live database,
// which is section 7 below — but it is what runs on every push with no
// Postgres required, which is the whole point of section 4 existing.
function tableColumnsFromMigrationText(sqlText) {
  const byTable = new Map();
  const ensure = (t) => {
    if (!byTable.has(t)) byTable.set(t, new Set());
    return byTable.get(t);
  };
  const CONSTRAINT_LINE = /^(primary key|unique|check|foreign key|constraint|exclude)\b/i;

  const createRe = /create table (?:if not exists )?(?:public\.)?"?([a-z_][a-z0-9_]*)"?\s*\(/gi;
  let m;
  while ((m = createRe.exec(sqlText))) {
    const table = m[1].toLowerCase();
    const openIdx = sqlText.indexOf("(", m.index + m[0].length - 1);
    if (openIdx === -1) continue;
    let depth = 0, i = openIdx;
    for (; i < sqlText.length; i++) {
      if (sqlText[i] === "(") depth++;
      else if (sqlText[i] === ")") { depth--; if (depth === 0) break; }
    }
    const body = sqlText.slice(openIdx + 1, i);
    let d = 0, cur = "";
    const parts = [];
    for (const ch of body) {
      if (ch === "(") d++;
      else if (ch === ")") d--;
      if (ch === "," && d === 0) { parts.push(cur); cur = ""; }
      else cur += ch;
    }
    parts.push(cur);
    const cols = ensure(table);
    for (const part of parts) {
      const trimmed = part.trim();
      if (!trimmed || CONSTRAINT_LINE.test(trimmed)) continue;
      const colMatch = trimmed.match(/^"?([a-z_][a-z0-9_]*)"?\s+/i);
      if (colMatch) cols.add(colMatch[1].toLowerCase());
    }
  }

  const alterRe =
    /alter table (?:if exists )?(?:public\.)?"?([a-z_][a-z0-9_]*)"?\s+add column(?: if not exists)?\s+"?([a-z_][a-z0-9_]*)"?/gi;
  while ((m = alterRe.exec(sqlText))) {
    ensure(m[1].toLowerCase()).add(m[2].toLowerCase());
  }
  return byTable;
}

const staticColumns = tableColumnsFromMigrationText(commentFreeCode);
const staticColumnIssues = [];
for (const [file, content] of srcFilePairs) {
  for (const issue of columnIssuesIn(content, staticColumns, createdTables)) {
    staticColumnIssues.push(`${file}: ${issue}`);
  }
}
console.log(`        ${staticColumns.size} tables' columns parsed from migration text`);
checkList(
  "every column a Supabase call touches exists on the table it names (static)",
  [...new Set(staticColumnIssues)].sort()
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
  // A RATCHET, updated when a migration deliberately adds a table — most
  // recently 20260817000002 (agent_runs.would_have_charged_credits'
  // migration touches no new table, so that one didn't move this number;
  // 20260814's delivery-channels migration is what took 70 to 72;
  // 20260823's cost_alert_log took 72 to 73; 20260824's search_index
  // took 73 to 74; 20260826's agent_templates took 74 to 75). It
  // stayed 70 through two migrations that changed it, in two different
  // files, which is exactly the failure a ratchet exists to prevent and
  // exactly what a fresh count on every run below stops from happening
  // again silently.
  // 72 -> 73: 20260823000000_pwa_client_stats — one row per browser, so
  // the "native app or not" question can be answered from measurements
  // instead of impressions.
  //
  // 73 -> 77: 20260820000000_affiliate, which arrived on main and adds
  // four (affiliates, affiliate_referrals, affiliate_commissions,
  // affiliate_payouts). MAIN'S OWN COPY OF THIS RATCHET STILL SAYS 72 and
  // is therefore red on main: the affiliate merge added four tables and
  // moved neither this number nor credit-flow.dbtest's. That is exactly
  // the failure the comment below describes happening again, and it is
  // corrected here rather than carried forward.
  // 20260827's voice_usage took 75 to 76; 20260828's ai_provider_log
  // took 76 to 77; 20260830's trading journal and 20260831's bank/crypto
  // tables took 77 to 83; 20260901's notification tables took 83 to 87.
  // 20260903's revenue engine took 91 to 98; 20260904's routing_decisions
  // took 98 to 99.
  // 20260905's site_badge_removals took 99 to 100.
  // MEASURED ON THE MERGED TREE, not added. Each branch counted against
  // its own migration set; summing two ratchets is arithmetic across two
  // different schemas. Built from bootstrap-supabase.sql plus all 43
  // migrations on a real Postgres 16: 105.
  check(`105 tables`, tables === 105, `got ${tables}`);
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
    routing_decisions:
      "which model served which request, what it cost and what the failed cheap attempt cost US — the platform's own routing ledger, not the customer's; the owner-only page reads it via service role",
    rate_limit_log: "login and cron throttling — a user who could read it could time their retries",
    account_deletion_requests: "erasure queue; the requester already knows, nobody else may",
    daily_ai_spend_tracking: "the platform's own spend ledger, not the customer's",
    production_errors: "stack traces and affected user ids; admin-only page reads it via service role",
    cost_alert_log:
      "what every customer's spend triggered, with the numbers; owner-only page reads it via service role, and a customer who could read it would learn the shape of the whole business",
    // V4 #26. The four tables the financial dashboard is built from. Each
    // is deny-all rather than owner-policied on purpose: "owner" is
    // decided in TypeScript by isAdminEmail (the same gate the margin
    // report uses), and adding a second notion of owner to the database
    // would be a second thing to keep in step — one that, if it drifted,
    // would hand a customer the whole company's revenue.
    subscription_events: "who upgraded, downgraded and cancelled; a customer reading it learns every other customer's plan changes",
    subscriber_months: "per-account monthly revenue — the single most sensitive table in the product",
    revenue_snapshots: "the company's daily MRR, ARR and AI cost; nothing a customer has any claim on",
    business_inputs: "marketing spend, fixed costs and the bank balance, typed in by the owner",
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

  console.log("\n== 7b. every column a Supabase call touches really exists (live, authoritative) ==");
  // THE STATIC CHECK IN == 4b IS A BEST EFFORT — a regex parse of CREATE
  // TABLE and ADD COLUMN statements, approximate by construction. THIS is
  // the one that cannot be wrong: information_schema.columns describes
  // the database these migrations actually built, in this run, a moment
  // ago. It is what caught plan_steps_version, editing_started_at,
  // stuck_notified_at and processing_started_at in the first place — the
  // static parser would have needed to already know to look for them.
  const liveColumnRows = sql(
    `select table_name || '|' || column_name from information_schema.columns where table_schema='public'`
  );
  const liveColumns = new Map();
  for (const line of liveColumnRows ? liveColumnRows.split("\n") : []) {
    const [t, c] = line.split("|");
    if (!liveColumns.has(t)) liveColumns.set(t, new Set());
    liveColumns.get(t).add(c);
  }
  const liveColumnIssues = [];
  for (const [file, content] of srcFilePairs) {
    for (const issue of columnIssuesIn(content, liveColumns, live)) {
      liveColumnIssues.push(`${file}: ${issue}`);
    }
  }
  checkList(
    "every column a Supabase call touches exists on the table it names (live)",
    [...new Set(liveColumnIssues)].sort()
  );

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
  // search_all and search_query join them for the same reason: search_all
  // is SECURITY INVOKER, so the RLS policy on search_index is what scopes
  // every row it can see, and search_query is a pure text-to-tsquery
  // transform that touches no table at all. They are how a signed-in
  // browser searches; granting them to service_role only would mean
  // routing every keystroke through an admin client, which is the
  // arrangement that actually leaks.
  const ALLOWED = [
    "search_headline",
    "search_fold",
    "immutable_unaccent",
    "search_all",
    "search_query",
    // match_agent_templates is how a signed-in browser finds a ready-made
    // agent. SECURITY INVOKER, so the agent_templates select policy is
    // what scopes it — and that policy already lets every signed-in user
    // read every template, because a library nobody can read is not one.
    "match_agent_templates",
    // immutable_join is a pure array_to_string wrapper, needed only
    // because the built-in is STABLE and a generated column requires
    // IMMUTABLE. It reads nothing, touches no table, and is granted
    // because the generated column on agent_templates is evaluated in
    // the caller's context. Same reasoning as immutable_unaccent above.
    "immutable_join",
    // NOT record_template_use: it is SECURITY DEFINER and writes to a
    // table nobody may update, so it is service_role only and must stay
    // off this list.
    //
    // voice_usage_this_month is how the settings screen reads "12 of 90
    // minutes used". SECURITY INVOKER, so the voice_usage select policy
    // (auth.uid() = user_id) is what scopes it — passing somebody else's
    // uuid returns zeroes, which scripts/tests/voice.dbtest.mjs asserts
    // against a real database rather than assuming.
    //
    // NOT consume_voice_seconds: it is SECURITY DEFINER and writes the
    // ledger the monthly cap is enforced against, so it is service_role
    // only and must stay off this list. A signed-in user who could call
    // it could consume somebody else's month.
    "voice_usage_this_month",
  ];
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
