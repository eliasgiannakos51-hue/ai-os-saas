#!/usr/bin/env node
/*
 * WHICH MIGRATIONS HAS THE DATABASE NOT SEEN? — asked of the database.
 *
 * HOW MIGRATIONS ARE APPLIED IN THIS PROJECT. By hand: supabase/migrations
 * is pasted into the Supabase SQL editor, in chunks of about 7KB, one file
 * at a time. There is no Supabase CLI config, no CI step and no ledger
 * table, so nothing records what was run — and six functions from
 * migrations dated August were reported missing in September before
 * anybody looked. This is the look.
 *
 * WHAT IT DOES. For every file in supabase/migrations it reads the objects
 * the file CREATES — tables, columns, functions (by name and argument
 * count), policies, indexes, triggers, types, views — and asks the
 * database whether each exists. A migration is APPLIED when everything it
 * creates is there, PENDING when nothing is, PARTIAL when some is. The
 * question goes to the catalog (pg_proc, pg_policies, information_schema),
 * not to PostgREST, so a function that exists but takes arguments is not
 * mistaken for a missing one (see the note on /api/health).
 *
 * TWO WAYS TO ASK.
 *   DATABASE_URL=postgres://... node scripts/db/pending-migrations.mjs
 *       runs the check through psql and prints the table.
 *   node scripts/db/pending-migrations.mjs --sql
 *       prints ONE query to paste into the SQL editor; it returns every
 *       expected object that is missing, with the migration it belongs to.
 *
 * Idempotent SQL is the other half of the deal: every migration here must
 * be safe to run again, so "pending" can be fixed by pasting the file.
 *
 * Tested by scripts/tests/pending-migrations.dbtest.mjs.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const MIG_DIR = path.join(ROOT, "supabase", "migrations");

// stripSqlComments LIVES IN scripts/lib/sql-text.mjs, not here. It is
// re-exported so this module's callers keep working, and it moved because
// the gates need it too: on 2026-09-12 four of five gates that searched
// migration text for a statement were shown to accept a commented-out one.
// The header of that file carries the measurement and the reason the two
// passes run in the order they do.
export { stripSqlComments } from "../lib/sql-text.mjs";
import { stripSqlComments } from "../lib/sql-text.mjs";

/** How many top-level parameters a function declares, from the text after "(". */
export function countParams(afterParen) {
  let depth = 0, i = 0, params = 0, sawToken = false, inDollar = null;
  while (i < afterParen.length) {
    const ch = afterParen[i];
    if (inDollar) { if (afterParen.startsWith(inDollar, i)) { i += inDollar.length; inDollar = null; continue; } i++; continue; }
    if (ch === "$") { const m = /^\$[A-Za-z_]*\$/.exec(afterParen.slice(i)); if (m) { inDollar = m[0]; i += m[0].length; continue; } }
    if (ch === "'") { i++; while (i < afterParen.length && afterParen[i] !== "'") i++; i++; sawToken = true; continue; }
    if (ch === "(") depth++;
    else if (ch === ")") { if (depth === 0) return params + (sawToken ? 1 : 0); depth--; }
    else if (ch === "," && depth === 0) { params++; sawToken = false; }
    else if (!/\s/.test(ch)) sawToken = true;
    i++;
  }
  return params + (sawToken ? 1 : 0);
}

const ident = (s) => s.replace(/^public\./i, "").replace(/"/g, "").toLowerCase();

/** The objects one migration file creates. */
export function objectsOf(sql) {
  const text = stripSqlComments(sql);
  const out = [];
  const seen = new Set();
  // `at` IS THE CHARACTER OFFSET OF THE STATEMENT, and it is the whole
  // fix for the defect described above expectedObjects(). Without it,
  // "this file also drops the object" cannot tell `drop … ; create …`
  // (idempotent, the object exists afterwards) from `create … ; drop …`
  // (a probe, it does not).
  //
  // ON A REPEAT, THE LATEST POSITION WINS. A file that creates X, drops
  // it, and creates it again must be remembered by its LAST create, or
  // the drop in the middle would look like it came afterwards.
  const add = (kind, name, extra = "", at = 0) => {
    const key = `${kind}:${name}:${extra}`;
    if (seen.has(key)) {
      const prev = out.find((o) => `${o.kind}:${o.name}:${o.extra}` === key);
      if (prev && at > prev.at) prev.at = at;
      return;
    }
    seen.add(key);
    out.push({ kind, name, extra, at });
  };
  for (const m of text.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?(public\.)?("?[A-Za-z_][A-Za-z0-9_]*"?)/gi)) add("table", ident(m[2]), "", m.index);
  // EVERY add-column CLAUSE, NOT THE FIRST ONE OF EACH STATEMENT.
  //
  // `alter table t add column a …, add column b …, add column c …;` is one
  // statement with three columns, and the pattern this replaces —
  // `alter table <t> add column <c>` — matched only `a`. Nine columns in
  // this repo were invisible that way, among them
  // user_integrations.consent_scopes and consent_withdrawn_at.
  //
  // WHICH IS THE EXACT FAILURE THIS TOOL EXISTS TO PREVENT. A migration
  // that adds three columns and was never pasted would be reported as
  // APPLIED the moment the first column existed. CLAUDE.md's opening
  // story is user_websites.generation_notes missing with nothing saying
  // so; a tool that checks one column in three is how that happens again.
  for (const stmt of text.matchAll(/alter\s+table\s+(?:only\s+)?(?:if\s+exists\s+)?(?:public\.)?("?[A-Za-z_][A-Za-z0-9_]*"?)([\s\S]*?);/gi)) {
    const table = ident(stmt[1]);
    for (const c of stmt[2].matchAll(/add\s+column\s+(?:if\s+not\s+exists\s+)?("?[A-Za-z_][A-Za-z0-9_]*"?)/gi)) {
      add("column", ident(c[1]), table, stmt.index);
    }
  }
  for (const m of text.matchAll(/create\s+(?:or\s+replace\s+)?function\s+(?:public\.)?("?[A-Za-z_][A-Za-z0-9_]*"?)\s*\(/gi)) {
    const after = text.slice(m.index + m[0].length);
    add("function", ident(m[1]), String(countParams(after)), m.index);
  }
  // A policy carries its table's SCHEMA: storage.objects policies live in
  // storage, not public. A name with a format placeholder (%1$s) is built
  // by a DO block at run time and cannot be checked by name — skipped.
  // THE QUOTES AROUND A POLICY NAME ARE OPTIONAL, and this repo uses both:
  // 148 policies quoted, 70 not. Requiring them made a third of every RLS
  // policy invisible to this tool — the same blind spot found in
  // scripts/db-inventory.mjs on 2026-09-06, in a second file, and this is
  // the one CLAUDE.md says to run before a deploy.
  for (const m of text.matchAll(/create\s+policy\s+(?:"([^"]+)"|([A-Za-z_][A-Za-z0-9_]*))\s+on\s+(?:([A-Za-z_][A-Za-z0-9_]*)\.)?("?[A-Za-z_][A-Za-z0-9_]*"?)/gi)) {
    const name = m[1] ?? m[2];
    if (name.includes("%")) continue;
    add("policy", name, `${(m[3] ?? "public").toLowerCase()}.${ident(m[4])}`, m.index);
  }
  for (const m of text.matchAll(/create\s+(?:unique\s+)?index\s+(?:concurrently\s+)?(?:if\s+not\s+exists\s+)?("?[A-Za-z_][A-Za-z0-9_]*"?)\s+on\s/gi)) add("index", ident(m[1]), "", m.index);
  for (const m of text.matchAll(/create\s+(?:or\s+replace\s+)?trigger\s+("?[A-Za-z_][A-Za-z0-9_]*"?)\s/gi)) add("trigger", ident(m[1]), "", m.index);
  for (const m of text.matchAll(/create\s+type\s+(?:public\.)?("?[A-Za-z_][A-Za-z0-9_]*"?)\s+as/gi)) add("type", ident(m[1]), "", m.index);
  for (const m of text.matchAll(/create\s+(?:or\s+replace\s+)?(?:materialized\s+)?view\s+(?:public\.)?("?[A-Za-z_][A-Za-z0-9_]*"?)/gi)) add("view", ident(m[1]), "", m.index);
  return out;
}

/** The objects one migration file DROPS (so an earlier expectation is void). */
export function dropsOf(sql) {
  const text = stripSqlComments(sql);
  const out = [];
  for (const m of text.matchAll(/drop\s+function\s+(?:if\s+exists\s+)?(?:public\.)?("?[A-Za-z_][A-Za-z0-9_]*"?)\s*\(/gi)) {
    const after = text.slice(m.index + m[0].length);
    out.push({ kind: "function", name: ident(m[1]), extra: String(countParams(after)), at: m.index });
  }
  // AND THE SAME ON THE DROP SIDE, WHERE IT WAS WORSE. 204 of the 351
  // `drop policy` statements in this repo write the name bare and 147
  // quote it — so the majority form was the invisible one, and this list
  // is what VOIDS an earlier expectation. A drop nobody saw leaves the
  // tool still expecting a policy that a later migration deliberately
  // removed: a PENDING that is not pending. "A probe that names something
  // missing when it is not is worse than no probe" is CLAUDE.md's rule
  // about exactly this, written after the health route did it twice.
  for (const m of text.matchAll(/drop\s+policy\s+(?:if\s+exists\s+)?(?:"([^"]+)"|([A-Za-z_][A-Za-z0-9_]*))\s+on\s+(?:([A-Za-z_][A-Za-z0-9_]*)\.)?("?[A-Za-z_][A-Za-z0-9_]*"?)/gi)) out.push({ kind: "policy", name: m[1] ?? m[2], extra: `${(m[3] ?? "public").toLowerCase()}.${ident(m[4])}`, at: m.index });
  for (const m of text.matchAll(/drop\s+index\s+(?:concurrently\s+)?(?:if\s+exists\s+)?(?:public\.)?("?[A-Za-z_][A-Za-z0-9_]*"?)/gi)) out.push({ kind: "index", name: ident(m[1]), extra: "", at: m.index });
  for (const m of text.matchAll(/drop\s+table\s+(?:if\s+exists\s+)?(?:public\.)?("?[A-Za-z_][A-Za-z0-9_]*"?)/gi)) out.push({ kind: "table", name: ident(m[1]), extra: "", at: m.index });
  for (const m of text.matchAll(/drop\s+trigger\s+(?:if\s+exists\s+)?("?[A-Za-z_][A-Za-z0-9_]*"?)\s+on/gi)) out.push({ kind: "trigger", name: ident(m[1]), extra: "", at: m.index });
  // Every drop-column clause of a multi-action statement, for the reason
  // objectsOf carries above. There are none in this repo today — which is
  // why this one is symmetry rather than a fix, and why the gate that
  // covers it says so instead of pretending to have measured something.
  for (const stmt of text.matchAll(/alter\s+table\s+(?:only\s+)?(?:if\s+exists\s+)?(?:public\.)?("?[A-Za-z_][A-Za-z0-9_]*"?)([\s\S]*?);/gi)) {
    const table = ident(stmt[1]);
    for (const c of stmt[2].matchAll(/drop\s+column\s+(?:if\s+exists\s+)?("?[A-Za-z_][A-Za-z0-9_]*"?)/gi)) {
      out.push({ kind: "column", name: ident(c[1]), extra: table, at: stmt.index });
    }
  }
  return out;
}

/**
 * Every migration with its expected objects, oldest first — MINUS what a
 * later migration dropped or redefined. A function created with three
 * parameters in August and recreated with four in September exists with
 * four; expecting the August shape would report a healthy database as
 * pending. Policies are dropped-and-recreated across files the same way.
 */
export function expectedObjects(dir = MIG_DIR) {
  const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  const perFile = files.map((file) => {
    const sql = readFileSync(path.join(dir, file), "utf8");
    return { file, objects: objectsOf(sql), drops: dropsOf(sql) };
  });
  const same = (a, b) => a.kind === b.kind && a.name === b.name && a.extra === b.extra;
  for (let i = 0; i < perFile.length; i += 1) {
    const later = perFile[i];
    // A probe object created and dropped INSIDE one migration (20260909's
    // zz_anon_default_probe) is not expected to exist afterwards either.
    //
    // ONLY WHEN THE DROP COMES AFTER THE CREATE, and the missing half of
    // that sentence cost this tool almost everything it was written to
    // check. Every idempotent policy in this repository is written
    //
    //     drop policy if exists "x" on t;
    //     create policy "x" on t ...;
    //
    // which is the standard shape for "safe to paste twice" — and to a
    // rule that only asked "does this file also drop it", it looked
    // exactly like a probe. Measured on 2026-09-08: the migrations
    // contain 218 CREATE POLICY statements and this tool expected 14.
    // 204 policies — every one on the trading journal, the notification
    // tables, data analysis, the bank and crypto tables, and all seven
    // scoped storage policies — were objects it could not report missing,
    // in the file CLAUDE.md names as the answer to "what else have I not
    // run?".
    //
    // The positions come from objectsOf/dropsOf, which is why they carry
    // `at`. Cross-file, below, position is meaningless and file order is
    // the order — so that comparison is deliberately left alone.
    later.objects = later.objects.filter((o) => !later.drops.some((d) => same(d, o) && d.at > o.at));
    for (let j = 0; j < i; j += 1) {
      const earlier = perFile[j];
      earlier.objects = earlier.objects.filter((o) => {
        if (later.drops.some((d) => same(d, o))) return false;
        // A function redefined later with another arity supersedes this one.
        if (o.kind === "function" && later.objects.some((n) => n.kind === "function" && n.name === o.name && n.extra !== o.extra)) return false;
        return true;
      });
    }
  }
  return perFile.map(({ file, objects }) => ({ file, objects }));
}

const q = (s) => `'${String(s).replace(/'/g, "''")}'`;

/**
 * ONE query: every expected object that the catalog does not have. Names
 * are literal values, so the same text works in psql and in the editor.
 */
export function missingObjectsQuery(migrations = expectedObjects()) {
  const rows = [];
  for (const m of migrations) for (const o of m.objects) rows.push(`(${q(m.file)}, ${q(o.kind)}, ${q(o.name)}, ${q(o.extra)})`);
  if (rows.length === 0) return "select null::text as migration, null::text as kind, null::text as name, null::text as extra where false;";
  return `with expected(migration, kind, name, extra) as (values
${rows.join(",\n")}
)
select e.migration, e.kind, e.name, e.extra
from expected e
where not (
  case e.kind
    when 'table' then to_regclass('public.' || e.name) is not null
    when 'view' then to_regclass('public.' || e.name) is not null
    when 'column' then exists (select 1 from information_schema.columns c where c.table_schema = 'public' and c.table_name = e.extra and c.column_name = e.name)
    when 'function' then exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = e.name and p.pronargs = e.extra::int)
    when 'policy' then exists (select 1 from pg_policies p where p.schemaname = split_part(e.extra, '.', 1) and p.tablename = split_part(e.extra, '.', 2) and p.policyname = e.name)
    when 'index' then exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'i' and c.relname = e.name)
    when 'trigger' then exists (select 1 from pg_trigger t where t.tgname = e.name and not t.tgisinternal)
    when 'type' then exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace where n.nspname = 'public' and t.typname = e.name)
    else true
  end
)
order by e.migration, e.kind, e.name;`;
}

/** Run the query through psql and fold the result per migration. */
export function report(psqlArgs, migrations = expectedObjects()) {
  const sql = missingObjectsQuery(migrations);
  const out = execFileSync("psql", [...psqlArgs, "-v", "ON_ERROR_STOP=1", "-At", "-F", "\t", "-c", sql], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  const missing = out.trim() ? out.trim().split("\n").map((l) => { const [migration, kind, name, extra] = l.split("\t"); return { migration, kind, name, extra }; }) : [];
  const byFile = new Map(migrations.map((m) => [m.file, { file: m.file, expected: m.objects.length, missing: [] }]));
  for (const x of missing) byFile.get(x.migration)?.missing.push(x);
  return [...byFile.values()].map((r) => ({
    ...r,
    status: r.expected === 0 ? "nothing to check" : r.missing.length === 0 ? "applied" : r.missing.length === r.expected ? "PENDING" : "PARTIAL",
  }));
}

function psqlArgsFromEnv() {
  if (process.env.DATABASE_URL) return [process.env.DATABASE_URL];
  if (process.env.PGDATABASE) return [];
  return null;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const migrations = expectedObjects();
  if (process.argv.includes("--sql")) {
    console.log(missingObjectsQuery(migrations));
    process.exit(0);
  }
  const args = psqlArgsFromEnv();
  if (!args) {
    console.error("Set DATABASE_URL (or PGDATABASE/PGHOST/...) to ask the database, or pass --sql to print the query for the SQL editor.");
    process.exit(2);
  }
  const rows = report(args, migrations);
  const pending = rows.filter((r) => r.status === "PENDING" || r.status === "PARTIAL");
  for (const r of rows) {
    const tag = r.status.padEnd(16);
    console.log(`${tag} ${r.file}${r.missing.length ? `  (${r.missing.length}/${r.expected} missing)` : ""}`);
    for (const m of r.missing) console.log(`                   - ${m.kind} ${m.name}${m.extra ? ` (${m.kind === "function" ? `${m.extra} args` : m.extra})` : ""}`);
  }
  console.log(`\n${rows.length} migrations, ${pending.length} pending or partial.`);
  process.exit(pending.length === 0 ? 0 : 1);
}
