#!/usr/bin/env node
/*
 * A COMMENT IS NOT CODE, AND A GATE THAT GREPS CANNOT TELL.
 *
 * On 2026-09-12 security-posture.test.mjs was found matching
 *
 *     -- alter table public.chat_messages enable row level security;
 *
 * exactly as well as the live statement, over the raw concatenation of
 * every migration. Commenting out RLS on the table holding every chat
 * message left the section green, printing "109 tables checked". That is
 * shape 29 of docs/shapes.md — "comments are not code" — inside the
 * security gate.
 *
 * This scan asks how far that goes. Two questions, and they have very
 * different answers:
 *
 *   1. SQL. Which gates read migration text and look for a STATEMENT —
 *      create table, enable row level security, grant, create policy —
 *      without removing comments first? A comment satisfies every one of
 *      those searches. This list is short enough to read by hand and each
 *      entry is a real question.
 *
 *   2. Everything else. Which gates read a .ts/.tsx/.mjs file and match a
 *      regex over it without stripping comments? This list is long and
 *      MOSTLY INNOCENT: a gate asserting that a file mentions a symbol is
 *      usually right to count a mention in a comment, and many search for
 *      prose on purpose. It is printed as a census, not as a defect list.
 *
 * PRECISION, MEASURED RATHER THAN GUESSED, 2026-09-12. Six of the flagged
 * SQL gates were settled by mutation — the statement commented out in the
 * real migration, the gate run:
 *
 *     cost-alerts        GREEN   the alert log's RLS could be commented out
 *     rate-limits        GREEN   the revoke from anon could be
 *     background-jobs    GREEN   ai_jobs' RLS could be
 *     agents             GREEN   user_agents' RLS could be
 *     website-forms      RED     already load-bearing
 *     publishing         n/a     the statement it names is not in a migration
 *
 * FOUR OF THE FIVE THAT COULD BE SETTLED WERE REAL. That is nothing like
 * the 1-in-19 of scan-unjudged-numbers.mjs, and it is why the four were
 * fixed the same day rather than filed. The nineteen still listed below
 * have NOT been settled one by one.
 *
 * IT REPORTS; IT DOES NOT GATE — not because the precision is poor but
 * because the shape has honest instances: a gate may want to match text
 * that happens to be in a comment. Settle a candidate the way CLAUDE.md
 * says to settle any of them: comment the statement out in the real file,
 * run the gate, and see whether it goes red.
 *
 * Run: node scripts/scan-comment-blind-reads.mjs
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const DIR = "scripts/tests";

/** Statement shapes a SQL comment can satisfy. A gate searching for one of
 *  these is asserting that the schema DOES something, which a sentence
 *  about the schema does not. */
const SQL_STATEMENTS = [
  "create table", "alter table", "enable row level security", "create policy",
  "drop policy", "create index", "create unique index", "create function",
  "create or replace function", "create trigger", "grant ", "revoke ",
  "create type", "create view", "add column", "alter column",
];

/** Names that mean "this text came from a .sql file". */
const SQL_SOURCE = /schemaSql\(|supabase\/migrations|migrationsSql|MIGRATIONS_DIR/;

/** Anything that removes SQL comments before the search. */
const SQL_STRIPPED = /stripSqlComments|stripSql|sqlLive|replace\(\s*\/\^?\[?[^)]*--/;

/** The search itself. A statement shape sitting in a mutation payload or in
 *  a prose comment is not a search, which is why `.mutation.mjs` files are
 *  excluded outright and why the shape has to share a line with a call. */
const SEARCH = /\.(match|matchAll|test|includes|search|exec)\(/;

const files = readdirSync(DIR)
  .filter((f) => /\.(test|itest|prodtest|dbtest)\.mjs$/.test(f))
  .sort();

const reads = [];
for (const f of files) {
  const src = readFileSync(path.join(DIR, f), "utf8");
  if (!SQL_SOURCE.test(src)) continue;
  const hits = [];
  src.split("\n").forEach((line, i) => {
    if (!SEARCH.test(line)) return;
    const lower = line.toLowerCase();
    const st = SQL_STATEMENTS.find((x) => lower.includes(x));
    if (st) hits.push({ line: i + 1, statement: st, text: line.trim().slice(0, 100) });
  });
  if (hits.length) reads.push({ file: f, strips: SQL_STRIPPED.test(src), hits });
}

const blind = reads.filter((r) => !r.strips);
console.log("== 1. gates that read SQL and search it for a STATEMENT ==\n");
console.log(`  ${reads.length} gates read migration text and search it for at least one statement shape`);
console.log(`  ${reads.length - blind.length} strip comments somewhere in the file`);
console.log(`  ${blind.length} do not\n`);
for (const e of blind) {
  console.log(`  ${e.file}  (${e.hits.length})`);
  for (const h of e.hits.slice(0, 2)) console.log(`      ${h.line}: ${h.text}`);
}

// ---------------------------------------------------------------------
const JS_STRIP = /stripComments|stripJs|stripSqlComments|removeComments/;
const jsBlind = [];
for (const f of files) {
  const src = readFileSync(path.join(DIR, f), "utf8");
  if (!/readFileSync\(/.test(src)) continue;
  if (JS_STRIP.test(src)) continue;
  if (!/\.(test|match|matchAll|exec|replace|split)\(\s*\//.test(src)) continue;
  jsBlind.push(f);
}

console.log("\n== 2. the census: gates that read a file and regex it, unstripped ==\n");
console.log(`  ${jsBlind.length} of ${files.length} gates`);
console.log("  A census, not a defect list. A gate asserting that a file MENTIONS");
console.log("  something is usually right to count a mention in a comment, and");
console.log("  several search prose on purpose. The number is here to be watched.");
console.log("  Settle any one of them the way CLAUDE.md says: comment the thing out");
console.log("  in the real file, run the gate, see whether it goes red.\n");
for (const f of jsBlind) console.log(`    ${f}`);
