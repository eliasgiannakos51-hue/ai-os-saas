#!/usr/bin/env node
/*
 * IS THE SEARCH INDEX ACTUALLY FULL?
 *
 * Asked from production on 2026-09-19: "⌘K finds nothing — does
 * search_index have rows for my account, or is it empty?"
 *
 * WHAT THIS DOES NOT ANSWER, said first because the question that
 * prompted it has a different answer. The two queries reported —
 * «θέλω να δω τα έσοδά μου» and «οικο» — are PAGE NAVIGATION. They never
 * reach this table: the palette matches page names in the browser
 * (lib/command-palette-match.ts) and only calls /api/search for CONTENT.
 * An empty search_index cannot explain either of them, and
 * scripts/tests/palette-aliases.test.mjs now holds both as named cases.
 *
 * WHAT IT DOES ANSWER: whether typing a word that IS in your data finds
 * it. search_index is filled by triggers attached in
 * 20260824000000_unified_search.sql, which also backfills every existing
 * row in the same loop. If that migration was never pasted — there is no
 * runner, see CLAUDE.md — the table does not exist and every content
 * search returns nothing, silently, because /api/search catches and
 * reports "Search failed" once rather than saying the index is missing.
 *
 * THREE ANSWERS, IN ORDER OF WHAT THEY RULE OUT:
 *
 *   the table exists at all     -> the migration ran
 *   rows per source_table       -> the backfill ran, and for what
 *   rows per user               -> whether YOUR account has any
 *
 * A table that exists with zero rows is the interesting case: the
 * triggers are attached and the backfill did not run, so anything
 * written since the migration is findable and everything older is not.
 *
 * Run: npm run db:search-rows              # needs DATABASE_URL
 *      npm run db:search-rows -- --sql     # prints the query to paste
 */
import { execFileSync } from "node:child_process";

export const QUERY = `
-- 1. does the table exist, and how big is it?
select 'total' as scope, null as key, count(*)::text as rows
from public.search_index
union all
-- 2. which source tables contributed — an empty one is a trigger that
--    never fired or a backfill that never ran
select 'source_table', source_table, count(*)::text
from public.search_index
group by source_table
union all
-- 3. and per account, so "is it MY rows that are missing" has an answer
select 'user', user_id::text, count(*)::text
from public.search_index
group by user_id
order by 1, 3 desc nulls last;
`.trim();

function parseArgs(argv) {
  return { sqlOnly: argv.includes("--sql") };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { sqlOnly } = parseArgs(process.argv.slice(2));
  if (sqlOnly) {
    console.log(QUERY);
    console.log(
      "\n-- Paste this into the Supabase SQL editor. If it errors with\n" +
        '-- \'relation "public.search_index" does not exist\', the migration\n' +
        "-- 20260824000000_unified_search.sql has never been run, and every\n" +
        "-- content search in the product returns nothing."
    );
    process.exit(0);
  }
  const DB = process.env.DATABASE_URL ?? process.env.PGDATABASE;
  if (!DB) {
    console.log("No DATABASE_URL / PGDATABASE. Run with --sql to print the query instead.");
    process.exit(1);
  }
  const out = execFileSync("psql", ["-d", DB, "-v", "ON_ERROR_STOP=1", "-tAF|", "-c", QUERY], {
    encoding: "utf8",
  });
  const rows = out.trim().split("\n").filter(Boolean).map((l) => l.split("|"));
  const total = rows.find((r) => r[0] === "total");
  console.log(`search_index holds ${total?.[2] ?? "?"} row(s)\n`);
  for (const [scope, key, n] of rows) {
    if (scope === "total") continue;
    console.log(`  ${scope.padEnd(13)} ${String(key).padEnd(40)} ${n}`);
  }
  if (total && Number(total[2]) === 0) {
    console.log(
      "\nZERO ROWS AND THE TABLE EXISTS: the triggers are attached and the\n" +
        "backfill did not run. Anything written since the migration is\n" +
        "findable; everything older is not."
    );
  }
}
