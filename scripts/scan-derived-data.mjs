#!/usr/bin/env node
/*
 * DERIVED DATA THAT IS ONLY EVER CHECKED AS CODE.
 *
 * The instance, 2026-09-19: search_index. Filled by triggers on 29
 * tables, backfilled once inside the migration that attaches them, and
 * read by every ⌘K keystroke. Every gate about it passed — the triggers
 * are declared, the sync function is correct, the RPC exists, the route
 * calls it, the canary finds it — while the table held nothing for an
 * account with 88 records. Not one check asked the only question that
 * mattered: DOES IT HAVE ROWS?
 *
 * The owner's generalisation: "the sync was called in 23 places and the
 * index was empty. Every 'the wiring exists' check can lie the same
 * way."
 *
 * WHAT COUNTS AS DERIVED. A table whose rows are written by the
 * DATABASE rather than by the application:
 *
 *   TRIGGER-WRITTEN  a trigger function inserts or updates into it
 *   BACKFILLED       a migration seeds it from another table
 *   AGGREGATE        its rows are counts/sums over another table
 *
 * All three share one failure: the writer can be correct, declared,
 * tested and attached, and the table can still be empty — because being
 * attached is a statement about the future and a backfill is a
 * statement about one moment that may never have happened.
 *
 * WHAT THIS CANNOT DO. It reads SQL text. A table filled by application
 * code in a way this does not model is not listed, and a table listed
 * here is a candidate, not a defect. The column that matters is the last
 * one: whether any suite in scripts/tests ASKS THE DATABASE how many
 * rows it holds.
 *
 * Run: node scripts/scan-derived-data.mjs
 *      node scripts/scan-derived-data.mjs --json
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { classify } from "./scan-gate-independence.mjs";
import { stripComments } from "./check-mutation-markers.mjs";

const MIG = "supabase/migrations";
const TESTS = "scripts/tests";

const sqlFiles = () => readdirSync(MIG).filter((f) => f.endsWith(".sql")).sort();
const allSql = () => sqlFiles().map((f) => `-- @@ ${f}\n${readFileSync(path.join(MIG, f), "utf8")}`).join("\n");

/** Comments out, so a table named in a paragraph is not a write. */
export function stripSqlComments(sql) {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .split("\n")
    .map((l) => l.replace(/--.*$/, ""))
    .join("\n");
}


/**
 * `insert into auth.users` names a table in another schema, and
 * `update x set y` puts the keyword SET where a table name goes. Both
 * appeared in the first run of this scan, as a "table" called auth and
 * a "table" called set with thirty-two suites counting it.
 */
const SQL_KEYWORDS = new Set([
  "set", "select", "values", "from", "where", "only", "table", "into", "returning",
]);
function tableName(raw) {
  const parts = raw.toLowerCase().split(".");
  const name = parts[parts.length - 1];
  const schema = parts.length > 1 ? parts[0] : "public";
  if (SQL_KEYWORDS.has(name)) return null;
  if (schema !== "public") return null;
  return name;
}

/**
 * Tables written from inside a FUNCTION body, with the functions that
 * write them. A function body is where a trigger's work lives, and it is
 * also where a backfill loop's dynamic SQL lives.
 */
export function writtenByFunctions(sql = stripSqlComments(allSql())) {
  const out = new Map();
  // Function bodies are $$ … $$ or $tag$ … $tag$.
  for (const m of sql.matchAll(
    /create (?:or replace )?function\s+([\w.]+)\s*\(([\s\S]*?)\)[\s\S]*?(\$[a-z_]*\$)([\s\S]*?)\3/gi
  )) {
    const [, name, , , body] = m;
    for (const w of body.matchAll(/\b(?:insert\s+into|update)\s+(?:only\s+)?["']?([a-z_][a-z0-9_.]*)/gi)) {
      const table = tableName(w[1]);
      if (!table) continue;
      if (!out.has(table)) out.set(table, new Set());
      out.get(table).add(name);
    }
  }
  // AND THE ANONYMOUS BLOCKS. A migration's backfill lives in `do $$ … $$`
  // with no name, and that is precisely where search_index was seeded.
  for (const m of sql.matchAll(/\bdo\s+(\$[a-z_]*\$)([\s\S]*?)\1/gi)) {
    const body = m[2];
    for (const w of body.matchAll(/\b(?:insert\s+into)\s+(?:only\s+)?["']?([a-z_][a-z0-9_.]*)/gi)) {
      const table = tableName(w[1]);
      if (!table) continue;
      if (!out.has(table)) out.set(table, new Set());
      out.get(table).add("(migration do-block)");
    }
  }
  return out;
}

/** Every table a trigger is attached to, with the functions it runs. */
export function triggerTargets(sql = stripSqlComments(allSql())) {
  const out = new Map();
  for (const m of sql.matchAll(
    /create trigger\s+[\w"]+[\s\S]{0,200}?\bon\s+(?:public\.)?["']?([a-z_][a-z0-9_]*)["']?[\s\S]{0,200}?execute (?:function|procedure)\s+([\w.]+)/gi
  )) {
    const table = m[1].toLowerCase();
    if (!out.has(table)) out.set(table, new Set());
    out.get(table).add(m[2]);
  }
  return out;
}

/** Does any suite ask the DATABASE how many rows this table holds? */
export function countedAnywhere(table) {
  const hits = [];
  for (const f of readdirSync(TESTS).filter((n) => /\.(dbtest|itest|prodtest|test)\.mjs$/.test(n))) {
    const src = readFileSync(path.join(TESTS, f), "utf8");
    if (!src.includes(table)) continue;
    // A count, a head:true, a length over rows, or select('*') with a
    // length assertion — the shapes this repo uses to ask "how many".
    // THE TABLE HAS TO BE ADDRESSED, NOT MENTIONED. The first version
    // matched `count` within 80 characters of the table's name, and on
    // 2026-09-19 it read the SENTENCE "Counts search_index across every
    // account" out of an exception's reason string in
    // user-scoped-queries.test.mjs and reported that suite as counting
    // the rows. A scan for checks that only read text, reading text.
    //
    // So the name must appear where a table name goes: `from("x")` in
    // PostgREST, or `from public.x` / `from x` in SQL.
    const addressed = new RegExp(
      `from\\(\\s*["'\`]${table}["'\`]|from\\s+(?:public\\.)?${table}\\b`,
      "i"
    );
    if (!addressed.test(src)) continue;
    const asksCount =
      /count\(\*\)|count:\s*["']exact["']|head:\s*true|\.length/i.test(src);
    if (asksCount) hits.push(f);
  }
  return hits;
}


/**
 * THE GENERAL CASE THE OWNER NAMED: "the sync was called in 23 places
 * and the index was empty. Every 'the wiring exists' check can lie the
 * same way."
 *
 * A WIRING-ONLY CHECK is one whose evidence is that a CALL SITE appears
 * in a source file — `/reserveCredits\(/.test(route)`,
 * `src.includes("syncSearchIndex(")` — inside a gate that reaches none
 * of NETWORK, DOM, DB or EXECUTION (the ladder in
 * scan-gate-independence.mjs). It proves that somebody wrote the call.
 * It cannot see whether the call ran, whether it succeeded, or whether
 * anything came out the other end.
 *
 * That is not a defect on its own — for most of these the result is
 * checked elsewhere, and a structural check is often the only affordable
 * one. It is a CENSUS, printed so the ratio is visible: how much of this
 * build is evidence about what the code says, rather than about what it
 * does.
 */
export function wiringOnlyChecks() {
  const out = [];
  for (const file of readdirSync(TESTS).filter((n) => n.endsWith(".test.mjs")).sort()) {
    const raw = readFileSync(path.join(TESTS, file), "utf8");
    const rung = classify(raw).rung;
    const strong = ["NETWORK", "DOM", "DB", "EXECUTION"].includes(rung);
    const code = stripComments(raw);
    let checks = 0;
    let wiring = 0;
    for (const m of code.matchAll(
      /\b(?:check|ok)\(\s*[`"']([^`"']{6,140})[`"']\s*,\s*([\s\S]{0,200}?)\)\s*[,;)]/g
    )) {
      checks += 1;
      const arg = m[2];
      const callSite =
        /\/[^/\n]*[A-Za-z_$][\w$]*\\?\([^/\n]*\/[gimsuy]*\s*\.test\(|\.includes\(\s*[`"'][A-Za-z_$][\w$.]*\(/.test(arg);
      if (callSite && !strong) wiring += 1;
    }
    out.push({ file, rung, checks, wiring });
  }
  return out;
}

export function report() {
  const sql = stripSqlComments(allSql());
  const byFn = writtenByFunctions(sql);
  const byTrigger = triggerTargets(sql);
  const derived = [...byFn.keys()].filter((t) => t !== "search_index" || true).sort();
  return derived.map((table) => ({
    table,
    writers: [...(byFn.get(table) ?? [])],
    triggersOnIt: [...(byTrigger.get(table) ?? [])],
    countedIn: countedAnywhere(table),
  }));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const rows = report();
  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(rows, null, 2));
    process.exit(0);
  }
  console.log(`== ${rows.length} tables are written from inside the database ==\n`);
  const unchecked = rows.filter((r) => r.countedIn.length === 0);
  console.log(`  ${rows.length - unchecked.length} have a suite that asks how many rows they hold`);
  console.log(`  ${unchecked.length} do not\n`);
  console.log("-- WRITTEN BY THE DATABASE, AND NOBODY COUNTS THE ROWS --\n");
  for (const r of unchecked) {
    console.log(`   ${r.table}`);
    console.log(`       written by: ${r.writers.slice(0, 3).join(", ")}`);
  }
  console.log("\n-- AND THE ONES THAT ARE COUNTED --\n");
  for (const r of rows.filter((x) => x.countedIn.length > 0)) {
    console.log(`   ${r.table.padEnd(28)} ${r.countedIn.join(", ")}`);
  }
  // -------------------------------------------------------------------
  const wiring = wiringOnlyChecks();
  const totalChecks = wiring.reduce((n, g) => n + g.checks, 0);
  const totalWiring = wiring.reduce((n, g) => n + g.wiring, 0);
  const gatesWith = wiring.filter((g) => g.wiring > 0);
  console.log("\n-- AND THE GENERAL CASE: CHECKS THAT READ A CALL SITE --\n");
  console.log(`  ${totalWiring} of ${totalChecks} checks (${((100 * totalWiring) / totalChecks).toFixed(1)}%)`);
  console.log(`  in ${gatesWith.length} of ${wiring.length} gates\n`);
  for (const g of [...gatesWith].sort((a, b) => b.wiring - a.wiring).slice(0, 10)) {
    console.log(`   ${String(g.wiring).padStart(3)}  ${g.file.padEnd(34)} ${g.rung}`);
  }
  console.log(
    "\n  unified-search.test.mjs is on that list, and it is the gate that\n" +
      "  watched an empty index for weeks: ten of its checks prove somebody\n" +
      "  wrote the call. A structural check is often the only affordable one\n" +
      "  and most of these have their result checked elsewhere — the number\n" +
      "  is printed so the ratio is visible, not because it is a defect list."
  );

  console.log(
    "\n  A CANDIDATE, NOT A DEFECT. Most of these are written by a trigger\n" +
      "  that maintains a column on the SAME row (updated_at, a counter), and\n" +
      "  an empty table there means no data, not a broken pipeline. The ones\n" +
      "  that matter are the tables whose rows exist ONLY because something\n" +
      "  else was copied into them: an index, a cache, an aggregate, a\n" +
      "  snapshot. For those, empty and correct look identical from the code."
  );
}
