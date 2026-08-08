// The test that would have caught "Something went wrong generating your
// website".
//
// WHAT HAPPENED. supabase_full_project_backup.sql contains
//
//     drop table if exists public.user_websites cascade;
//     create table public.user_websites ( ... );
//
// and the recreated table was missing four columns that shipped code
// reads and writes: description, is_large_request, free_retry_used and
// stuck_notified_at. Its status CHECK also forbade 'flagged', a value the
// generation worker writes at the end of every run the safety review
// rejects.
//
// Three separate production failures, one root cause:
//   * /api/websites/generate could not INSERT (PGRST204 on `description`)
//   * /api/websites/generate/process answered "Cannot coerce the result to
//     a single JSON object"
//   * /api/cron/scheduled-runs: "column user_websites.stuck_notified_at
//     does not exist", three times
//
// NOTHING IN THE BUILD COULD SEE IT. TypeScript types the ROW SHAPE
// (types/user-website.ts) but has no idea what the database actually has;
// the Supabase client is untyped here; and every suite that touches these
// routes stands in its own Supabase, which answers whatever it is told to.
// A schema file and a codebase can drift indefinitely and every gate stays
// green.
//
// So this reads both sides and compares them: every column name the code
// uses against a table, versus every column the schema file creates for
// it. It is a build-gate suite — pure file reading, no port, no network.
//
// Run: node scripts/tests/schema-drift.test.mjs
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

let pass = 0,
  fail = 0;
function check(name, actual, expected) {
  const a = JSON.stringify(actual),
    e = JSON.stringify(expected);
  if (a === e) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    fail++;
    console.log(`  FAIL  ${name}\n        expected ${e}\n        actual   ${a}`);
  }
}
function checkTrue(name, cond, detail) {
  check(name, Boolean(cond), true);
  if (!cond && detail !== undefined) console.log(`        ${detail}`);
}
const read = (p) => readFileSync(p, "utf8");

const SCHEMA_FILE = "supabase_full_project_backup.sql";
const schema = read(SCHEMA_FILE);

/**
 * Every column the schema file ends up with for a table: the CREATE TABLE
 * body plus every `alter table ... add column if not exists`.
 *
 * Both halves matter, and the second is why a naive grep of the CREATE
 * block would have declared this file healthy — several columns are only
 * ever added by a later ALTER.
 */
function schemaColumns(table) {
  const columns = new Set();

  const createRe = new RegExp(
    `create table (?:if not exists )?public\\.${table} \\(([\\s\\S]*?)\\n\\);`,
    "g"
  );
  for (const m of schema.matchAll(createRe)) {
    for (const line of m[1].split("\n")) {
      const stripped = line.replace(/--.*$/, "").trim();
      const name = stripped.match(/^([a-z_][a-z_0-9]*)\s+[a-z]/i)?.[1];
      // Table-level constraints look like columns to a loose regex.
      if (name && !["primary", "unique", "check", "foreign", "constraint"].includes(name)) {
        columns.add(name);
      }
    }
  }

  const alterRe = new RegExp(
    `alter table public\\.${table}\\s+add column (?:if not exists )?([a-z_][a-z_0-9]*)`,
    "g"
  );
  for (const m of schema.matchAll(alterRe)) columns.add(m[1]);

  return columns;
}

/** Every .ts/.tsx under src. */
function sources(dir = "src", out = []) {
  for (const entry of readdirSync(dir)) {
    const p = path.join(dir, entry);
    if (statSync(p).isDirectory()) sources(p, out);
    else if (/\.tsx?$/.test(p)) out.push(p);
  }
  return out;
}
const FILES = sources();

/**
 * Column names the code uses against one table.
 *
 * Read from the three places supabase-js names a column: the object keys
 * of .insert({...}) / .update({...}), the comma-separated field list of
 * .select("a, b, c"), and the first argument of .eq/.neq/.gt/.is/.order.
 *
 * Deliberately scoped to a WINDOW after each `.from("<table>")` rather
 * than to the whole file: one file talks to several tables, and attributing
 * every column in it to every table would produce noise nobody reads.
 */
function codeColumns(table) {
  const used = new Map(); // column -> "file:line"
  const fromRe = new RegExp(`\\.from\\("${table}"\\)`, "g");

  for (const file of FILES) {
    const src = read(file);
    for (const m of src.matchAll(fromRe)) {
      // The chain ends at whichever comes first: the statement's `;`, or
      // the NEXT .from(). The second bound is the important one — a
      // Promise.all of six queries is one statement, and without it every
      // column in the block gets attributed to the first table in it,
      // which produces a page of confident nonsense.
      const rest = src.slice(m.index + m[0].length);
      const nextFrom = rest.indexOf('.from("');
      const semicolon = rest.indexOf(";\n");
      const bounds = [nextFrom, semicolon].filter((i) => i >= 0);
      const rawChain = bounds.length ? rest.slice(0, Math.min(...bounds)) : rest.slice(0, 1400);
      // Comments stripped: a `// Truncated, not rejected: ...` inside an
      // .insert({...}) reads as a column named `rejected` to a regex, and
      // a scanner that reports a code comment as a schema drift is a
      // scanner people switch off.
      const chain = rawChain.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\n)\s*\/\/[^\n]*/g, "$1");
      const line = src.slice(0, m.index).split("\n").length;
      const where = `${file}:${line}`;

      for (const sel of chain.matchAll(/\.select\(\s*"([^"]*)"/g)) {
        for (const raw of sel[1].split(",")) {
          const name = raw.trim().split(/[\s(:]/)[0];
          if (/^[a-z_][a-z_0-9]*$/.test(name) && name !== "*") used.set(name, where);
        }
      }
      for (const write of chain.matchAll(/\.(?:insert|update|upsert)\(\s*\{([\s\S]*?)\}\)/g)) {
        for (const key of write[1].matchAll(/(?:^|[\s{,])([a-z_][a-z_0-9]*)\s*:/g)) {
          used.set(key[1], where);
        }
      }
      for (const filter of chain.matchAll(
        /\.(?:eq|neq|gt|gte|lt|lte|is|in|like|ilike|order|contains)\(\s*"([a-z_][a-z_0-9]*)"/g
      )) {
        used.set(filter[1], where);
      }
    }
  }
  return used;
}

// The tables whose drift actually broke something, plus the rest of the
// high-traffic ones. Not every table in the schema: this list is the ones
// a regression would take a paying feature down with, and a list that
// tries to be exhaustive is a list that gets an exception added to it.
const TABLES = [
  "user_websites",
  "website_versions",
  "website_reference_images",
  "published_sites",
  "user_integrations",
  "integration_consents",
  "user_agents",
  "agent_runs",
  "ai_missions",
  "user_credits",
  "credit_transactions",
  "ai_cost_log",
  "chat_conversations",
  "chat_messages",
  "chat_memory",
  "user_profile_learned",
  "affiliates",
  "affiliate_referrals",
  "affiliate_commissions",
  "help_articles",
  "support_escalations",
];

// PostgREST embedding syntax and computed aliases are not columns.
// PostgREST embedding syntax, supabase-js option keys, and the literal
// `null` a filter can be compared against — none of them are columns.
const NOT_COLUMNS = new Set([
  "count", "head", "foreignTable", "ascending", "referencedTable", "onConflict", "null", "true", "false",
]);

console.log("== 1. every column the code names exists in the schema ==");
for (const table of TABLES) {
  const declared = schemaColumns(table);
  checkTrue(`${table}: found in ${SCHEMA_FILE} (${declared.size} columns)`, declared.size > 0);
  if (declared.size === 0) continue;

  const used = codeColumns(table);
  const missing = [...used.entries()]
    .filter(([name]) => !declared.has(name) && !NOT_COLUMNS.has(name))
    .map(([name, where]) => `${name} (${where})`)
    .sort();
  check(`${table}: no column used by code is missing from the schema`, missing, []);
}

console.log("\n== 2. the four columns that were actually missing ==");
// Named individually so a regression reports the specific thing rather
// than a list, and so the reason each one matters stays attached to it.
{
  const cols = schemaColumns("user_websites");
  for (const [name, why] of [
    ["description", "api/websites/generate INSERTs it; without it generation cannot start"],
    ["is_large_request", "same INSERT, and the stale-job grace period"],
    ["free_retry_used", "the free regenerate after a flagged result"],
    ["stuck_notified_at", "api/cron/scheduled-runs filters on it"],
    ["editing_started_at", "the edit-claim lock that stops two concurrent paid edits"],
  ]) {
    checkTrue(`user_websites.${name} — ${why}`, cols.has(name));
  }
  // Two more tables the same restore left short. Found by section 1 while
  // fixing the four above; neither had been reported yet.
  checkTrue(
    "ai_missions.plan_steps_version — the step list's race check",
    schemaColumns("ai_missions").has("plan_steps_version")
  );
  for (const col of ["free_chat_used", "free_chat_period_start"]) {
    checkTrue(`user_credits.${col} — free-chat accounting`, schemaColumns("user_credits").has(col));
  }
}

console.log("\n== 3. every status the code writes is allowed by the CHECK ==");
// The other half of the same drift: a column can exist and still reject
// the value being written into it.
{
  // The LAST definition wins: the schema file drops and re-adds this
  // constraint, and reading the first one would test a statement that is
  // no longer in force by the end of the file.
  const constraints = [
    ...schema.matchAll(/add constraint user_websites_status_check\s+check \(status in \(([^)]*)\)\)/g),
  ];
  const constraint = constraints.length ? constraints[constraints.length - 1][1] : undefined;
  checkTrue("the status CHECK is in the schema", Boolean(constraint), constraint);
  const allowed = new Set([...(constraint ?? "").matchAll(/'([a-z_]+)'/g)].map((m) => m[1]));

  // Scoped by TABLE, not by filename. published_sites has its own status
  // vocabulary ('live', 'unpublished') and its own constraint, and
  // api/websites/[id]/publish writes both tables in one file — a
  // filename filter attributed its published_sites statuses to
  // user_websites and demanded one CHECK allow both.
  const written = new Set();
  for (const file of FILES) {
    const src = read(file);
    for (const m of src.matchAll(/\.from\("user_websites"\)/g)) {
      const rest = src.slice(m.index + m[0].length);
      const nextFrom = rest.indexOf('.from("');
      const semicolon = rest.indexOf(";\n");
      const bounds = [nextFrom, semicolon].filter((i) => i >= 0);
      const chain = bounds.length ? rest.slice(0, Math.min(...bounds)) : rest.slice(0, 1400);
      for (const v of chain.matchAll(/status:\s*"([a-z_]+)"/g)) written.add(v[1]);
      for (const v of chain.matchAll(/status:\s*[^,\n]*\?\s*"([a-z_]+)"\s*:\s*"([a-z_]+)"/g)) {
        written.add(v[1]);
        written.add(v[2]);
      }
    }
  }
  const rejected = [...written].filter((s) => !allowed.has(s)).sort();
  check(
    `every website status the code writes is permitted (${[...written].sort().join(", ")})`,
    rejected,
    []
  );
  // 'flagged' specifically: it is written at the end of a real, reached
  // path and was forbidden by the constraint.
  checkTrue("'flagged' is allowed", allowed.has("flagged"), [...allowed].join(","));
}

console.log("\n== 4. the repair migration exists and is idempotent ==");
{
  const repair = read("website_columns_repair_migration.sql");
  for (const col of ["description", "is_large_request", "free_retry_used", "stuck_notified_at"]) {
    checkTrue(`repair adds ${col}`, new RegExp(`add column if not exists ${col}\\b`).test(repair));
  }
  checkTrue("repair widens the status CHECK", /'flagged'/.test(repair));
  checkTrue("repair restores the double-submit index", /user_websites_pending_dedup_idx/.test(repair));
  // Safe to run twice, and safe to run on a healthy project.
  checkTrue("every add is guarded", !/add column (?!if not exists)/.test(repair));
  // Comments stripped: this file's own header explains that the BACKUP
  // does `drop table ... create table`, which is the defect it repairs.
  const repairSql = repair.replace(/^\s*--.*$/gm, "");
  checkTrue("it creates no table", !/create table/i.test(repairSql));
  checkTrue("it drops no table", !/drop table/i.test(repairSql));
  checkTrue("it ships a verification query", /information_schema\.columns/.test(repair));
}

console.log("\n== 5. a zero-row update is no longer an opaque failure ==");
{
  const route = read("src/app/api/websites/generate/process/route.ts");
  // .single() on an UPDATE ... RETURNING is what produced "Cannot coerce
  // the result to a single JSON object" — a message that told nobody the
  // row had gone.
  checkTrue(
    "the save no longer uses .single()",
    !/\.eq\("id", websiteId\)\s*\n\s*\.select\(\)\s*\n(?:\s*\/\/[^\n]*\n)*\s*\.single\(\)/.test(route)
  );
  checkTrue("it uses maybeSingle", /\.maybeSingle\(\);/.test(route));
  checkTrue(
    "a missing row is reported as a deleted project, not a server error",
    /if \(!updatedRecord\)[\s\S]{0,900}deleted while it was being generated/.test(route)
  );
  checkTrue("...and the hold is released rather than charged", /if \(!updatedRecord\)[\s\S]{0,700}releaseReservation/.test(route));
  checkTrue("...with a 409, not a 500", /if \(!updatedRecord\)[\s\S]{0,900}status: 409/.test(route));
  // A schema drift must be diagnosable from the log line alone.
  checkTrue("the PostgREST error code is logged", /code: updateError\.code/.test(route));
}

console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
