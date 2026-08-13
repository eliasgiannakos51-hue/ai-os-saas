// Can running the schema file twice destroy someone's data?
//
// WHAT WAS WRONG. supabase_schema.sql, supabase_complete_schema.sql,
// supabase_full_project_backup.sql and supabase_v2_consolidated.sql opened
// with 126 `drop table if exists ... cascade` statements between them,
// covering every module table plus chat_conversations, chat_messages,
// chat_memory, ai_missions, user_websites, website_versions, ai_documents,
// ai_presentations and more — then re-created each one empty.
//
// Measured against PostgreSQL 16, running the file's own chat_memory block:
//
//     47 rows  ->  re-run the file  ->  0 rows
//
// That is exactly the reported symptom, "Settings says 0 things remembered
// despite dozens of conversations", and it would have taken the
// conversations, the websites and the documents with it.
//
// The files DID warn, in a comment: "*** CRITICAL — DO NOT RE-RUN THIS FILE
// AGAINST A LIVE PRODUCTION DATABASE ***". A comment is not a safeguard. In
// a project whose entire workflow is "paste the SQL into the Supabase
// editor", a file that is destructive on the second run will eventually be
// run a second time. So the destructiveness is gone, and this is the gate
// that keeps it gone.
//
// Run: node scripts/tests/schema-safety.test.mjs
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
let pass = 0;
let fail = 0;
function check(name, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    fail++;
    console.log(`  FAIL  ${name}\n        expected ${e}\n        actual   ${a}`);
  }
}

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".git" || entry === ".next") continue;
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (full.endsWith(".sql")) out.push(full);
  }
  return out;
}

/** SQL with `-- line comments` removed, so a warning ABOUT a dangerous
 *  statement is never mistaken for the statement. */
function codeOf(file) {
  return readFileSync(file, "utf8")
    .split("\n")
    .filter((line) => !/^\s*--/.test(line))
    .join("\n");
}

const sqlFiles = walk(ROOT).sort();
console.log("schema-safety");
console.log(`  ....  scanning ${sqlFiles.length} SQL files`);

// ---------------------------------------------------------------------
console.log("\n== 1. nothing drops a table that holds user data ==");
// ---------------------------------------------------------------------
{
  const offenders = [];
  for (const file of sqlFiles) {
    const code = codeOf(file);
    for (const m of code.matchAll(/drop\s+table\s+(?:if\s+exists\s+)?(?:public\.)?(\w+)/gi)) {
      const line = code.slice(0, m.index).split("\n").length;
      offenders.push(`${path.relative(ROOT, file)}:${line} drops ${m[1]}`);
    }
  }
  check("no DROP TABLE anywhere in the schema files", offenders, []);
}

// ---------------------------------------------------------------------
console.log("\n== 2. the other ways to empty a table ==");
// ---------------------------------------------------------------------
// DROP TABLE is the one that happened. These are the neighbours: a
// TRUNCATE, an unqualified DELETE, or dropping the schema itself would all
// produce the same silent data loss on a re-run.
{
  const patterns = [
    [/truncate\s+(?:table\s+)?/gi, "TRUNCATE"],
    [/delete\s+from\s+(?:public\.)?\w+\s*;/gi, "DELETE with no WHERE"],
    [/drop\s+schema\s+(?:if\s+exists\s+)?public/gi, "DROP SCHEMA public"],
  ];
  const offenders = [];
  for (const file of sqlFiles) {
    const code = codeOf(file);
    for (const [pattern, label] of patterns) {
      for (const m of code.matchAll(pattern)) {
        const line = code.slice(0, m.index).split("\n").length;
        offenders.push(`${path.relative(ROOT, file)}:${line} ${label}`);
      }
    }
  }
  check("no TRUNCATE, unqualified DELETE, or DROP SCHEMA", offenders, []);
}

// ---------------------------------------------------------------------
console.log("\n== 3. every CREATE TABLE is idempotent ==");
// ---------------------------------------------------------------------
// Removing the DROPs is only half of it. A bare `create table public.x (`
// on a second run raises "already exists" and — depending on where the
// editor stops — can abort the rest of the file, which is how a partially
// applied schema happens.
{
  const offenders = [];
  for (const file of sqlFiles) {
    const code = codeOf(file);
    for (const m of code.matchAll(/create\s+table\s+(?!if\s+not\s+exists)(?:public\.)?(\w+)/gi)) {
      const line = code.slice(0, m.index).split("\n").length;
      offenders.push(`${path.relative(ROOT, file)}:${line} create table ${m[1]}`);
    }
  }
  check("every CREATE TABLE says IF NOT EXISTS", offenders, []);
}

// ---------------------------------------------------------------------
console.log("\n== 4. no file still claims it must not be re-run ==");
// ---------------------------------------------------------------------
// The warning was true when it was written. Leaving it in place after the
// files became safe would be its own defect: the next person reads it,
// believes the file is dangerous, and reaches for something worse.
{
  const stale = [];
  for (const file of sqlFiles) {
    const source = readFileSync(file, "utf8");
    if (/DO NOT RE-?RUN THIS FILE/i.test(source)) stale.push(path.relative(ROOT, file));
  }
  check("no stale 'do not re-run' warning", stale, []);
}

// ---------------------------------------------------------------------
console.log("\n== 5. the gate can go red ==");
// ---------------------------------------------------------------------
// A gate nobody has watched fail is a gate nobody knows works. These are
// the exact statements that were removed.
{
  const WAS_SHIPPED = [
    "drop table if exists public.chat_memory cascade;",
    "drop table if exists public.chat_conversations cascade;",
    "create table public.chat_memory (",
  ];
  const DROP = /drop\s+table\s+(?:if\s+exists\s+)?(?:public\.)?(\w+)/i;
  const BARE_CREATE = /create\s+table\s+(?!if\s+not\s+exists)(?:public\.)?(\w+)/i;
  const caught = WAS_SHIPPED.filter((s) => DROP.test(s) || BARE_CREATE.test(s));
  check("the gate catches every statement it replaced", caught, WAS_SHIPPED);
}

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
