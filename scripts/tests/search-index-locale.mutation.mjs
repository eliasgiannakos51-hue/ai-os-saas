#!/usr/bin/env node
/*
 * WOULD THIS GATE HAVE CAUGHT THE BUG IT WAS WRITTEN FOR?
 *
 * The defect was silent in every direction that matters: a green build, a
 * green dbtest, a health endpoint saying ok, and one user's own document
 * missing from one user's own search in nine languages out of ten. The
 * gate that replaces that silence has to go red on the defect ITSELF, not
 * merely on a tidy restatement of it — so the first mutant below is the
 * tree exactly as it stood on 2026-09-11.
 *
 * The rest are the ways a declared list rots: the declaration flipped, the
 * declaration deleted, the declaration kept for a table that is gone, and
 * the backfill quietly doing nothing.
 *
 * Run: node scripts/tests/search-index-locale.mutation.mjs
 */
import { readFileSync } from "node:fs";
import { writeFileSync } from "./lib/sidecar-write.mjs";
import { execFileSync } from "node:child_process";

const GATE = "scripts/tests/search-index-locale.test.mjs";
const FIX = "supabase/migrations/20261002000000_search_index_locale_translations_only.sql";
const FILTER = "supabase/migrations/20260914000000_search_index_locale.sql";

const MUTANTS = [
  {
    // THE BUG, PUT BACK. This is the literal state of the tree between
    // 20260929 and the fix: no table guard, locale read off whatever row
    // happens to have the column.
    name: "the trigger reads locale off any table again — the 2026-09-11 defect verbatim",
    file: FIX,
    from:
      "  if tg_table_name = 'help_articles' then\n" +
      "    v_locale := nullif(v_row ->> 'locale', '');\n" +
      "  else\n" +
      "    v_locale := null;\n" +
      "  end if;",
    to: "  v_locale := nullif(v_row ->> 'locale', '');",
    expect: "names its locale tables explicitly",
  },
  {
    // The same harm reached the other way: the guard is there, and it
    // names the wrong table. A user's deck is filtered; a help article
    // is not.
    name: "the allowlist names the user's table instead of the translation table",
    file: FIX,
    from: "  if tg_table_name = 'help_articles' then",
    to: "  if tg_table_name = 'ai_presentations' then",
    expect: "reaches its owner in every language",
  },
  {
    // The declaration and the trigger disagreeing is the state that
    // produced the bug — a comment saying one thing, code doing another.
    name: "the declaration says help_articles is not a translation table while the trigger filters it",
    file: GATE,
    from: "    translations: true,",
    to: "    translations: false,",
    expect: "exactly the declared translation tables",
  },
  {
    // A map that only has to cover what somebody remembered is the
    // hand-written list this repository keeps finding.
    name: "a table gains a locale column and nothing declares what it means",
    file: GATE,
    from: "  ai_presentations: {\n    translations: false,",
    to: "  ai_presentations_removed_by_mutation: {\n    translations: false,",
    expect: "ai_presentations.locale is declared",
  },
  {
    // ...and the same list checked in only one direction goes stale in
    // the other, which is why 2b exists.
    name: "the map keeps an entry for a table that has no locale column",
    file: GATE,
    from: "const LOCALE_COLUMN_MEANING = {",
    to:
      "const LOCALE_COLUMN_MEANING = {\n" +
      "  ideas: { translations: false, why: \"a stale entry, long enough to clear the reason-length check, for a table that never had a locale column at all\" },",
    expect: "still has a locale column",
  },
  {
    // The fix without the backfill leaves every deck indexed before it
    // invisible until its owner edits it — a repair that reads as done.
    name: "the backfill stops clearing the rows the generic pickup already stamped",
    file: FIX,
    from: "   set locale = null",
    to: "   set group_key = group_key",
    expect: "nulls the locale already written",
  },
  {
    // Fixing the source is only enough while the filter keeps letting
    // null through. If that arm goes, every user row vanishes at once.
    name: "the filter stops passing a null locale, so every user row disappears",
    file: FILTER,
    from: "      or s.locale is null\n",
    to: "",
    expect: "a null locale still passes",
  },
];

function runGate() {
  try {
    execFileSync(process.execPath, [GATE], { encoding: "utf8", stdio: "pipe" });
    return { green: true, failed: [] };
  } catch (e) {
    const out = String(e.stdout ?? "") + String(e.stderr ?? "");
    const failed = [...out.matchAll(/^ {2}FAIL {2}(.+)$/gm)].map((m) => m[1].trim());
    return { green: false, failed: failed.length ? failed : ["(exited non-zero with no FAIL line)"] };
  }
}

console.log("search-index-locale mutations\n");
const TARGETS = [...new Set(MUTANTS.map((m) => m.file))];
const originals = new Map(TARGETS.map((f) => [f, readFileSync(f, "utf8")]));
const restoreAll = () => { for (const [f, t] of originals) writeFileSync(f, t); };

let caught = 0;
const missed = [];
try {
  const base = runGate();
  console.log(`baseline: the gate is ${base.green ? "GREEN" : "RED"} on the unmutated tree`);
  if (!base.green) {
    console.log(`\nBASELINE IS RED — no result below would mean anything.\n  ${base.failed.join("\n  ")}`);
    process.exit(1);
  }
  for (const m of MUTANTS) {
    const original = originals.get(m.file);
    if (!original.includes(m.from)) {
      missed.push({ ...m, why: `the mutation target no longer exists in ${m.file}` });
      console.log(`  STALE   ${m.name}`);
      continue;
    }
    writeFileSync(m.file, original.replace(m.from, m.to));
    let result;
    try { result = runGate(); } finally { restoreAll(); }
    if (result.green) {
      missed.push({ ...m, why: "the gate stayed green — nothing here is load-bearing" });
      console.log(`  MISSED  ${m.name}`);
      continue;
    }
    const onTarget = result.failed.filter((f) => f.includes(m.expect));
    if (onTarget.length === 0) {
      missed.push({ ...m, why: `red on "${result.failed.slice(0, 3).join('", "')}" — nothing matching "${m.expect}"` });
      console.log(`  WRONG   ${m.name}\n          -> red on: ${result.failed.slice(0, 3).join(" | ")}`);
      continue;
    }
    caught++;
    console.log(`  CAUGHT  ${m.name}\n          -> ${onTarget[0]}`);
  }
} finally {
  restoreAll();
}

const after = runGate();
console.log(after.green ? "\nbaseline: green again on the restored tree" : "\nBASELINE IS RED — a mutation was not restored.");
console.log(`\n${caught} of ${MUTANTS.length} mutations caught.`);
if (missed.length > 0 || !after.green) {
  if (missed.length) { console.log("\nHOLES:"); for (const m of missed) console.log(`  - ${m.name}\n    ${m.why}`); }
  process.exit(1);
}
console.log("A user's own row cannot be filtered out of a user's own search without this going red.");
