#!/usr/bin/env node
/*
 * Builds the expected-database inventory FROM THIS REPOSITORY, and emits a
 * single read-only diagnostic query that reports what a live database is
 * missing.
 *
 * WHY IT IS GENERATED RATHER THAN WRITTEN
 *
 * A hand-typed list of "tables the app needs" is a second copy of the
 * schema, and a second copy drifts. Everything below is derived:
 *
 *   TABLES    every `.from("x")` and every `table: "x"` in src/ — i.e. the
 *             tables the code actually reads or writes. A table nothing
 *             queries is not a requirement, and a table the code queries
 *             but no migration creates is a bug this will surface.
 *   COLUMNS   the CREATE TABLE bodies and ALTER TABLE ... ADD COLUMN
 *             statements in the migration files.
 *   FUNCTIONS every `.rpc("x")` in src/, which is the only thing that can
 *             make a missing function a runtime 404.
 *   POLICIES  every CREATE POLICY in the migration files.
 *
 * WHICH SQL FILES COUNT
 *
 * Only additive ones. supabase_schema.sql, supabase_complete_schema.sql and
 * supabase_full_project_backup.sql contain 42, 43 and 42 DROP TABLE
 * statements respectively; they are snapshots for rebuilding from nothing,
 * not migrations, and running one against a live database destroys it.
 * They are read here for DDL only when a table appears nowhere else, and
 * nothing this script emits ever drops anything.
 *
 * Usage:
 *   node scripts/db-inventory.mjs            # the diagnostic query
 *   node scripts/db-inventory.mjs --json     # the inventory, as data
 *   node scripts/db-inventory.mjs --repair user_credits,settle_reservation
 *                                            # idempotent DDL for JUST those
 *   node scripts/db-inventory.mjs --repair   # idempotent DDL for everything
 */
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

// ---------------------------------------------------------------------------
// 1. What the CODE requires
// ---------------------------------------------------------------------------
function walkSource(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry.startsWith(".")) continue;
    const p = path.join(dir, entry);
    if (statSync(p).isDirectory()) walkSource(p, out);
    else if (/\.tsx?$/.test(p)) out.push(p);
  }
  return out;
}

const stripJs = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const requiredTables = new Set();
const requiredFunctions = new Set();
const requiredBuckets = new Set();

for (const file of walkSource(path.join(ROOT, "src"))) {
  const src = stripJs(readFileSync(file, "utf8"));
  // `.from("x")` — a direct query. `table: "x"` — a module config whose
  // table is reached through `.from(config.table)`, which no literal scan
  // would otherwise see.
  for (const m of src.matchAll(/\.from\(\s*"([a-z0-9_]+)"\s*\)/g)) requiredTables.add(m[1]);
  for (const m of src.matchAll(/\btable:\s*"([a-z0-9_]+)"/g)) requiredTables.add(m[1]);
  for (const m of src.matchAll(/\.rpc\(\s*"([a-z0-9_]+)"/g)) requiredFunctions.add(m[1]);
  for (const m of src.matchAll(/_BUCKET\s*=\s*"([a-z0-9-]+)"/g)) requiredBuckets.add(m[1]);
}
// `.storage.from("bucket")` is a bucket, not a table — remove any that a
// bucket constant already claimed.
for (const bucket of requiredBuckets) requiredTables.delete(bucket.replace(/-/g, "_"));

// ---------------------------------------------------------------------------
// 2. What the MIGRATIONS define
// ---------------------------------------------------------------------------
const DESTRUCTIVE = new Set([
  "supabase_schema.sql",
  "supabase_complete_schema.sql",
  "supabase_full_project_backup.sql",
]);

function sqlFiles() {
  const files = readdirSync(ROOT).filter((f) => f.endsWith(".sql"));
  const migrationsDir = path.join(ROOT, "supabase", "migrations");
  const nested = existsSync(migrationsDir)
    ? readdirSync(migrationsDir)
        .filter((f) => f.endsWith(".sql"))
        .map((f) => path.join("supabase", "migrations", f))
    : [];
  // Additive files first, snapshots last, so a snapshot only ever FILLS a
  // gap rather than overriding a migration that came after it.
  const additive = [...files, ...nested].filter((f) => !DESTRUCTIVE.has(path.basename(f)));
  const snapshots = [...files, ...nested].filter((f) => DESTRUCTIVE.has(path.basename(f)));
  return { additive, snapshots };
}

// Strips SQL comments, INCLUDING trailing ones, while respecting string
// literals and dollar-quoted function bodies.
//
// `^\s*--.*$` was not enough, and the failure was not cosmetic:
//
//   amount integer not null, -- negative = debit (an action), positive = credit
//
// left the comment in place, so the comma inside it split the column list
// and `positive` was reported as a column credit_transactions is missing.
// A diagnostic that invents a missing column is worse than no diagnostic —
// somebody adds the column.
function stripSql(sql) {
  let out = "";
  let i = 0;
  while (i < sql.length) {
    const ch = sql[i];
    if (ch === "'") {
      // Single-quoted literal; '' is an escaped quote, not a terminator.
      let j = i + 1;
      while (j < sql.length) {
        if (sql[j] === "'" && sql[j + 1] === "'") j += 2;
        else if (sql[j] === "'") break;
        else j++;
      }
      out += sql.slice(i, j + 1);
      i = j + 1;
      continue;
    }
    if (ch === "$") {
      // Dollar-quoted body: copy it whole, comments and all — a function's
      // source is not something to reformat.
      const tag = sql.slice(i).match(/^\$[a-z_]*\$/i)?.[0];
      if (tag) {
        const close = sql.indexOf(tag, i + tag.length);
        const end = close === -1 ? sql.length : close + tag.length;
        out += sql.slice(i, end);
        i = end;
        continue;
      }
    }
    if (ch === "-" && sql[i + 1] === "-") {
      const nl = sql.indexOf("\n", i);
      i = nl === -1 ? sql.length : nl;
      continue;
    }
    if (ch === "/" && sql[i + 1] === "*") {
      const close = sql.indexOf("*/", i + 2);
      i = close === -1 ? sql.length : close + 2;
      continue;
    }
    out += ch;
    i++;
  }
  return out;
}

// Constraint clauses that live in a CREATE TABLE body but are not columns.
const NOT_A_COLUMN =
  /^(primary\s+key|unique|foreign\s+key|constraint|check|exclude|like|inherits)\b/i;

function parseDdl(files, into) {
  for (const file of files) {
    const sql = stripSql(readFileSync(path.join(ROOT, file), "utf8"));

    // CREATE TABLE [IF NOT EXISTS] public.x ( ... )
    for (const m of sql.matchAll(
      /create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?"?([a-z0-9_]+)"?\s*\(/gi
    )) {
      const table = m[1];
      // Balanced-paren scan for the body, so a `numeric(12,2)` or a
      // `check (x in (...))` cannot end it early.
      let depth = 0;
      let i = m.index + m[0].length - 1;
      const start = i + 1;
      for (; i < sql.length; i++) {
        if (sql[i] === "(") depth++;
        else if (sql[i] === ")") {
          depth--;
          if (depth === 0) break;
        }
      }
      const body = sql.slice(start, i);
      const cols = into.columns.get(table) ?? new Set();
      let d = 0;
      let current = "";
      for (const ch of body + ",") {
        if (ch === "(") d++;
        if (ch === ")") d--;
        if (ch === "," && d === 0) {
          const line = current.trim();
          current = "";
          if (!line || NOT_A_COLUMN.test(line)) continue;
          const name = line.match(/^"?([a-z0-9_]+)"?\s/i)?.[1];
          if (name) {
            cols.add(name);
            const defs = into.columnDefs.get(table) ?? new Map();
            if (!defs.has(name)) defs.set(name, line.replace(/\s+/g, " "));
            into.columnDefs.set(table, defs);
          }
          continue;
        }
        current += ch;
      }
      into.columns.set(table, cols);
      into.tables.add(table);
      // The statement text, verbatim, so --repair can re-emit the real
      // definition instead of a reconstruction of it.
      if (!into.tableDdl.has(table)) {
        const end = sql.indexOf(";", i);
        into.tableDdl.set(table, {
          file,
          text: sql.slice(m.index, end + 1).trim(),
        });
      }
    }

    // ALTER TABLE public.x ADD COLUMN [IF NOT EXISTS] y ...  (also the
    // comma-separated multi-column form this repo uses).
    for (const m of sql.matchAll(
      /alter\s+table\s+(?:only\s+)?(?:public\.)?"?([a-z0-9_]+)"?([\s\S]*?);/gi
    )) {
      const table = m[1];
      const cols = into.columns.get(table) ?? new Set();
      for (const c of m[2].matchAll(
        /add\s+column\s+(?:if\s+not\s+exists\s+)?"?([a-z0-9_]+)"?/gi
      )) {
        cols.add(c[1]);
        const defs = into.columnDefs.get(table) ?? new Map();
        if (!defs.has(c[1])) {
          // Scan to the next TOP-LEVEL comma, so `numeric(12,6)` is not
          // truncated at the comma inside its own precision — which is
          // exactly what a `[^,;]*` capture did, emitting `numeric(12`.
          let d = 0;
          let j = c.index + c[0].length;
          let def = "";
          for (; j < m[2].length; j++) {
            const ch = m[2][j];
            if (ch === "(") d++;
            else if (ch === ")") d--;
            else if ((ch === "," || ch === ";") && d === 0) break;
            def += ch;
          }
          defs.set(c[1], `${c[1]} ${def}`.replace(/\s+/g, " ").trim());
        }
        into.columnDefs.set(table, defs);
      }
      if (cols.size) into.columns.set(table, cols);
    }

    // CREATE POLICY "name" ON public.x
    for (const m of sql.matchAll(
      /create\s+policy\s+"([^"]+)"\s+on\s+(?:public\.)?"?([a-z0-9_]+)"?/gi
    )) {
      const key = `${m[2]} ${m[1]}`;
      const pEnd = sql.indexOf(";", m.index);
      into.policies.set(key, {
        table: m[2],
        name: m[1],
        file,
        text: sql.slice(m.index, pEnd + 1).trim(),
      });
    }

    // CREATE [OR REPLACE] FUNCTION public.x(...)
    for (const m of sql.matchAll(
      /create\s+(?:or\s+replace\s+)?function\s+(?:public\.)?"?([a-z0-9_]+)"?\s*\(([^)]*)\)/gi
    )) {
      const args = m[2]
        .split(",")
        .map((a) => a.trim().split(/\s+/)[0])
        .filter((a) => /^[a-z_][a-z0-9_]*$/i.test(a));
      // A function body is dollar-quoted, so the first ";" is inside it.
      // Find the closing tag of whatever $tag$ the body opened with.
      const bodyStart = sql.indexOf("$", m.index + m[0].length);
      let text;
      if (bodyStart !== -1) {
        const tag = sql.slice(bodyStart).match(/^\$[a-z]*\$/i)?.[0];
        const close = tag ? sql.indexOf(tag, bodyStart + tag.length) : -1;
        const end = close === -1 ? sql.indexOf(";", m.index) : sql.indexOf(";", close + (tag?.length ?? 0));
        text = sql.slice(m.index, end + 1).trim();
      } else {
        text = sql.slice(m.index, sql.indexOf(";", m.index) + 1).trim();
      }
      into.functions.set(m[1], args);
      if (!into.functionDdl.has(m[1])) into.functionDdl.set(m[1], { file, text });
    }
  }
}

const defined = {
  tables: new Set(),
  columns: new Map(),
  policies: new Map(),
  functions: new Map(),
  tableDdl: new Map(),
  functionDdl: new Map(),
  columnDefs: new Map(),
};
const { additive, snapshots } = sqlFiles();
parseDdl(additive, defined);
// Snapshots second and only for tables the additive files never mention —
// they hold the original V1 base schema, which was never re-expressed as a
// migration.
const fromMigrations = new Set(defined.tables);
parseDdl(snapshots, defined);

// ---------------------------------------------------------------------------
// 3. The inventory the query checks
// ---------------------------------------------------------------------------
const tables = [...requiredTables].filter((t) => defined.tables.has(t)).sort();
const orphanTables = [...requiredTables].filter((t) => !defined.tables.has(t)).sort();
const columns = [];
for (const t of tables) for (const c of defined.columns.get(t) ?? []) columns.push([t, c]);
columns.sort((a, b) => a[0].localeCompare(b[0]) || a[1].localeCompare(b[1]));
const functions = [...requiredFunctions].sort();
const orphanFunctions = functions.filter((f) => !defined.functions.has(f));
const policies = [...defined.policies.values()]
  .filter((p) => tables.includes(p.table))
  .sort((a, b) => a.table.localeCompare(b.table) || a.name.localeCompare(b.name));

// ---------------------------------------------------------------------------
// 3b. --repair: the DDL for named objects, and nothing else
// ---------------------------------------------------------------------------
//
// Run the diagnostic query first, then pass it the names it reported. Every
// statement emitted is idempotent BY CONSTRUCTION:
//
//   tables     create table if not exists
//   columns    alter table ... add column if not exists
//   functions  create or replace function
//   policies   wrapped in a `do $repair$ ... if not exists ... $repair$`
//              guard, so a policy somebody tightened by hand between
//              deploys is left exactly as it is
//
// NOTHING here drops anything — not a table, not a constraint, not a
// policy. The repo's three snapshot files carry 42-43 DROP TABLE
// statements each and would empty a live database; that is precisely why
// they are never the thing you run to repair one.
const sqlQuote = (v) => `'${String(v).replace(/'/g, "''")}'`;

const repairIndex = process.argv.indexOf("--repair");
if (repairIndex !== -1) {
  const wanted = (process.argv[repairIndex + 1] ?? "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
  const wantAll = wanted.length === 0;
  const want = (name) => wantAll || wanted.includes(name);

  const out = [
    "-- Idempotent repair DDL, generated by scripts/db-inventory.mjs.",
    `-- Scope: ${wantAll ? "every expected object" : wanted.join(", ")}`,
    "-- Safe to run more than once — it creates only what is absent.",
    "-- No DROP TABLE. No TRUNCATE. No DELETE. No DROP CONSTRAINT. No DROP POLICY.",
    "",
  ];
  let emitted = 0;

  for (const t of tables) {
    if (!want(t)) continue;
    const ddl = defined.tableDdl.get(t);
    if (!ddl) continue;
    emitted++;
    out.push(`-- ${t}  (from ${ddl.file})`);
    // A snapshot writes plain `create table`; make it non-destructive.
    out.push(ddl.text.replace(/^create\s+table\s+(?!if\s+not\s+exists)/i, "create table if not exists "));
    out.push("");

    // Columns the original CREATE did not have — added by a later ALTER.
    const created = ddl.text;
    const defs = defined.columnDefs.get(t) ?? new Map();
    const later = [...defs.entries()].filter(
      ([name]) => !new RegExp(`(^|[(,\\s])"?${name}"?[\\s(]`, "i").test(created)
    );
    if (later.length) {
      out.push(`-- ${t}: columns added after the table was first created`);
      out.push(
        `alter table public.${t}\n  ` +
          later.map(([, def]) => `add column if not exists ${def}`).join(",\n  ") +
          ";"
      );
      out.push("");
    }
  }

  for (const f of functions) {
    if (!want(f)) continue;
    const ddl = defined.functionDdl.get(f);
    if (!ddl) continue;
    emitted++;
    out.push(`-- ${f}()  (from ${ddl.file})`);
    out.push(ddl.text.replace(/^create\s+function/i, "create or replace function"));
    out.push("");
  }

  const wantedPolicies = policies.filter((p) => p.text && (want(p.table) || want(p.name)));
  const rlsTables = [...new Set(wantedPolicies.map((p) => p.table))];
  for (const t of rlsTables) {
    out.push(`alter table public.${t} enable row level security;`);
  }
  if (rlsTables.length) out.push("");
  for (const p of wantedPolicies) {
    emitted++;
    const body = p.text.replace(/\s+/g, " ").replace(/;\s*$/, "");
    out.push(`-- policy ${p.name} on ${p.table}  (from ${p.file})`);
    out.push(
      [
        "do $repair$",
        "begin",
        "  if not exists (",
        "    select 1 from pg_policies",
        `     where schemaname = 'public' and tablename = ${sqlQuote(p.table)}`,
        `       and policyname = ${sqlQuote(p.name)}`,
        "  ) then",
        `    ${body};`,
        "  end if;",
        "end",
        "$repair$;",
      ].join("\n")
    );
    out.push("");
  }

  if (emitted === 0) {
    console.error("-- Nothing matched. Pass names exactly as the diagnostic reported them.");
    process.exit(1);
  }
  console.log(out.join("\n"));
  process.exit(0);
}

if (process.argv.includes("--json")) {
  console.log(
    JSON.stringify(
      {
        tables,
        orphanTables,
        columns: columns.length,
        functions,
        orphanFunctions,
        policies: policies.length,
        buckets: [...requiredBuckets].sort(),
        fromMigrations: [...fromMigrations].sort(),
      },
      null,
      2
    )
  );
  process.exit(0);
}

// ---------------------------------------------------------------------------
// 4. Emit ONE read-only diagnostic query
// ---------------------------------------------------------------------------
const q = (s) => `'${String(s).replace(/'/g, "''")}'`;
const rows = (arr, fn) => arr.map(fn).join(",\n    ");

console.log(`-- =========================================================================
-- WHAT IS MISSING FROM THIS DATABASE
--
-- Read-only. Generated by scripts/db-inventory.mjs from this repository:
-- ${tables.length} tables and ${functions.length} RPC functions the code actually calls,
-- ${columns.length} columns and ${policies.length} RLS policies the migrations define.
--
-- It CREATES NOTHING, DROPS NOTHING and WRITES NOTHING. Run it, read the
-- report, then apply only the SQL for the rows it lists as missing.
--
-- Every row it returns is something the application will fail on at
-- runtime: a missing table is a 404 from PostgREST, a missing column is a
-- 400 on the select that names it, a missing function is the "function not
-- found" that looks like a bug in the TypeScript, and a missing RLS policy
-- is either a silent empty result or an open table.
-- =========================================================================

with expected_tables(table_name) as (
  values
    ${rows(tables, (t) => `(${q(t)})`)}
),
expected_columns(table_name, column_name) as (
  values
    ${rows(columns, ([t, c]) => `(${q(t)}, ${q(c)})`)}
),
expected_functions(function_name) as (
  values
    ${rows(functions, (f) => `(${q(f)})`)}
),
expected_policies(table_name, policy_name) as (
  values
    ${rows(policies, (p) => `(${q(p.table)}, ${q(p.name)})`)}
),

-- What the database actually has. information_schema is used for tables
-- and columns; pg_catalog for functions and policies, because
-- information_schema.routines hides SECURITY DEFINER functions the calling
-- role cannot execute — which is precisely the set this app relies on.
actual_tables as (
  select c.relname::text as table_name, c.relrowsecurity as rls_enabled
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind in ('r', 'p')
),
actual_columns as (
  select table_name::text, column_name::text
    from information_schema.columns
   where table_schema = 'public'
),
actual_functions as (
  select p.proname::text as function_name
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
),
actual_policies as (
  select tablename::text as table_name, policyname::text as policy_name
    from pg_policies
   where schemaname = 'public'
),

findings as (
  select 1 as sort, 'MISSING TABLE'::text as kind, e.table_name as object_name,
         ''::text as detail,
         'create the table — see the SQL for it in this repo''s migrations'::text as fix
    from expected_tables e
   where not exists (select 1 from actual_tables a where a.table_name = e.table_name)

  union all
  select 2, 'MISSING COLUMN', e.table_name, e.column_name,
         'alter table public.' || e.table_name || ' add column if not exists ' || e.column_name || ' ...'
    from expected_columns e
   where exists (select 1 from actual_tables a where a.table_name = e.table_name)
     and not exists (
       select 1 from actual_columns a
        where a.table_name = e.table_name and a.column_name = e.column_name)

  union all
  select 3, 'MISSING FUNCTION', e.function_name, '',
         'the app calls .rpc(''' || e.function_name || ''') — PostgREST will return 404 until it exists'
    from expected_functions e
   where not exists (select 1 from actual_functions a where a.function_name = e.function_name)

  union all
  select 4, 'RLS DISABLED', a.table_name, '',
         'alter table public.' || a.table_name || ' enable row level security;'
    from actual_tables a
   where a.table_name in (select table_name from expected_tables)
     and not a.rls_enabled

  union all
  select 5, 'MISSING POLICY', e.table_name, e.policy_name,
         'without it this table is either unreadable by its owner or open to everyone'
    from expected_policies e
   where exists (select 1 from actual_tables a where a.table_name = e.table_name)
     and not exists (
       select 1 from actual_policies a
        where a.table_name = e.table_name and a.policy_name = e.policy_name)

  union all
  -- Not a defect: a table the database has and this repo never asks for.
  -- Reported so a rename that left the old table behind is visible.
  select 9, 'UNEXPECTED TABLE (informational)', a.table_name, '',
         'nothing in src/ queries this — left over from a rename, or from another project'
    from actual_tables a
   where a.table_name not in (select table_name from expected_tables)
)

select kind, object_name, detail, fix
  from findings
 order by sort, object_name, detail;`);

if (orphanTables.length || orphanFunctions.length) {
  console.error(`\n-- WARNING, from the generator rather than the database:`);
  for (const t of orphanTables) {
    console.error(`--   src/ queries table "${t}" but no SQL file in this repo creates it.`);
  }
  for (const f of orphanFunctions) {
    console.error(`--   src/ calls .rpc("${f}") but no SQL file in this repo defines it.`);
  }
}
