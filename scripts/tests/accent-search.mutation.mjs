#!/usr/bin/env node
/*
 * "καφε" HAS TO FIND "Καφές", ON BOTH SIDES OF THE WIRE.
 *
 * Nine list components did `haystack.toLowerCase().includes(query)` and the
 * server did `ilike '%q%'`. Both fold case and nothing else, so a Greek word
 * typed two ordinary ways did not match itself. The fix has three parts and
 * they can fail independently: the fold in lib/text, the collator that
 * orders the results, and the SQL function with the index behind it.
 *
 * TWO GATES, because the halves cannot be proved the same way.
 * accent-search.test.mjs runs the fold and walks the component tree;
 * accent-search.itest.mjs runs the migration against a real PostgreSQL,
 * because `ilike` semantics belong to the database and not to anybody's
 * memory of them. Each mutant below says which one has to notice, and a
 * mutant that only the other gate catches is a hole in the one named.
 *
 * Run: node scripts/tests/accent-search.mutation.mjs
 */
import { readFileSync } from "node:fs";
import { writeFileSync } from "./lib/sidecar-write.mjs";
import { execFileSync } from "node:child_process";

const UNIT = "scripts/tests/accent-search.test.mjs";
const ITEST = "scripts/tests/accent-search.itest.mjs";
const FOLD = "src/lib/text/unicode-patterns.ts";
const MATCH = "src/lib/text/search-match.ts";
const SQL = "supabase/migrations/20260813_accent_insensitive_search.sql";

const MUTANTS = [
  {
    // THE BRIEF'S OWN WORD, HALF-FIXED. Strip accents but not final sigma
    // and "ΚΑΦΕΣ" still fails to find "καφές" — the two spellings a Greek
    // keyboard produces for the same word. This is the difference between
    // the fix the brief asked for and the fix that works.
    name: "final sigma stops folding, so ΚΑΦΕΣ and καφές part company again",
    gate: UNIT,
    file: FOLD,
    from: '    if (folded === "ς") folded = "σ";',
    to: "",
    expect: 'finds "ΚΑΦΕΣ"',
  },
  {
    // AN EMPTY SEARCH BOX IS NOT A FILTER. Return false and every list in
    // the application renders empty until something is typed.
    name: "an empty query stops matching everything",
    gate: UNIT,
    file: MATCH,
    from: "  if (!q) return true;",
    to: "  if (!q) return false;",
    expect: "empty query matches everything",
  },
  {
    // ORDERING THAT DISAGREES WITH SEARCHING. sensitivity "variant" makes
    // case and accents ordering signals again, so "Άλφα" and "αβγό" sort
    // by code point while the search box treats them as the same letters.
    name: "the collator starts ordering by case and accent again",
    gate: UNIT,
    file: MATCH,
    from: 'collator = new Intl.Collator(locale, { sensitivity: "base", numeric: true });',
    to: 'collator = new Intl.Collator(locale, { sensitivity: "variant", numeric: true });',
    expect: "case is not an ordering signal",
  },
  {
    // "Item 10" BEFORE "Item 2". Lexicographic ordering of digits is the
    // single most visible sorting bug a list can have.
    name: "numeric-aware ordering is switched off",
    gate: UNIT,
    file: MATCH,
    from: 'collator = new Intl.Collator(locale, { sensitivity: "base", numeric: true });\n  } catch {',
    to: 'collator = new Intl.Collator(locale, { sensitivity: "base", numeric: false });\n  } catch {',
    expect: "Item 2 sorts before Item 10",
  },
  {
    // A LOCALE FROM A URL SEGMENT. Intl.Collator throws on a malformed
    // tag, and without the fallback the whole list fails to render rather
    // than rendering in the wrong order.
    name: "a malformed locale tag is allowed to throw",
    gate: UNIT,
    file: MATCH,
    from: `  let collator: Intl.Collator;
  try {
    collator = new Intl.Collator(locale, { sensitivity: "base", numeric: true });
  } catch {
    collator = new Intl.Collator(undefined, { sensitivity: "base", numeric: true });
  }`,
    to: `  const collator: Intl.Collator = new Intl.Collator(locale, { sensitivity: "base", numeric: true });`,
    expect: "bad locale tag does not throw",
  },
  {
    // THE SWEEP THAT STOPS SWEEPING. Section 4 fills an offender list by
    // walking src/ and then asserts it is EMPTY — so a walk that returns
    // nothing passes every one of those checks while reading no files.
    // The floor in front of it is the only thing standing between this
    // gate and a vacuous pass, and this is the mutation that tests it.
    name: "the source walk stops descending into directories",
    gate: UNIT,
    file: UNIT,
    from: "    if (statSync(full).isDirectory()) walk(full, out);",
    to: "    if (statSync(full).isDirectory()) out.length += 0;",
    expect: "the source walk found files",
  },
  {
    // THE DEFECT ITSELF, PUT BACK IN A REAL COMPONENT. Section 4 exists
    // so that the tenth list written next month cannot reintroduce what
    // the other nine had fixed; this is that tenth list.
    name: "a component compares user text with toLowerCase().includes() again",
    gate: UNIT,
    file: "src/components/favorites/favorites-list.tsx",
    from: "export function FavoritesList",
    to: "function nameMatches(label: string, query: string) {\n  return label.toLowerCase().includes(query.toLowerCase());\n}\n\nexport function FavoritesList",
    expect: "toLowerCase().includes()",
  },
  {
    // THE SERVER HALF. search_fold without the sigma translate folds
    // accents and case and leaves ς alone, so the database and the browser
    // disagree about what the same word is — the worst of the three
    // outcomes, because each half looks correct on its own.
    name: "search_fold stops folding final sigma, so the two halves disagree",
    gate: ITEST,
    file: SQL,
    from: "  select translate(lower(public.immutable_unaccent(p_text)), 'ς', 'σ')",
    to: "  select lower(public.immutable_unaccent(p_text))",
    expect: "search_fold",
  },
  {
    // A FUNCTION THAT CANNOT BACK AN INDEX. Postgres refuses to build an
    // index on a STABLE function, so every folded search becomes a
    // sequential scan of the table — correct answers, at the cost of
    // reading every row.
    // The anchor names search_fold, and it has to: immutable_unaccent
    // above it has a byte-identical header, .replace() takes the first
    // match, and the first version of this mutant therefore made the
    // WRAPPER stable and left search_fold alone. The gate stayed green and
    // was right to — Postgres does not check the volatility of what an
    // immutable function calls, so the index still built.
    //
    // AND THE CATCH IS NOT WHERE IT WAS EXPECTED, which is recorded rather
    // than tidied away. The obvious answer is the provolatile assertion
    // near the end of the itest; what actually happens is that the
    // migration cannot apply at all, because Postgres refuses to build a
    // GIN index over a STABLE function. That is a stronger guarantee than
    // the assertion — the database enforces it — and the assertion still
    // earns its place for the case the index is built first and the
    // function replaced afterwards. Chasing the "right" line here would
    // have meant weakening the mutant until it stopped being a defect.
    name: "search_fold is declared STABLE, so no index can be built on it",
    gate: ITEST,
    file: SQL,
    from: "create or replace function public.search_fold(p_text text)\nreturns text\nlanguage sql\nimmutable",
    to: "create or replace function public.search_fold(p_text text)\nreturns text\nlanguage sql\nstable",
    expect: "the migration applies at all",
  },
  {
    // THE READ-ANYTHING PRIMITIVE. search_headline takes a table NAME and
    // runs dynamic SQL. Drop the row-level-security requirement and any
    // signed-in caller can point it at a table with no policies — the
    // reason the function validates three ways before format() sees the
    // identifier.
    name: "search_headline stops requiring the target table to have RLS",
    gate: ITEST,
    file: SQL,
    from: "      and c.relkind = 'r'\n      and c.relrowsecurity",
    to: "      and c.relkind = 'r'",
    expect: "refuses a table without RLS",
  },
  {
    // THE TRIGRAM INDEX. Without it every accent-folded search is a
    // sequential scan; the itest asks the PLANNER rather than pg_indexes,
    // because an index the planner will not choose is not an index.
    // `select 1` rather than a broken statement: format() ignores the
    // extra arguments and EXECUTE discards the result, so the migration
    // still applies cleanly and the ONLY thing missing is the index. A
    // mutant that makes the migration fail to apply proves nothing about
    // this check — it proved, on its first run, that a failed apply took
    // the whole itest down with no FAIL line at all, which is fixed in the
    // gate rather than here.
    name: "the trigram index on the folded column is never created",
    gate: ITEST,
    file: SQL,
    from: "      'create index if not exists %I on public.%I using gin (public.search_fold(%I) gin_trgm_ops)',",
    to: "      'select 1',",
    expect: "trigram index",
  },
];

function runGate(gate) {
  try {
    execFileSync(process.execPath, [gate], { encoding: "utf8", stdio: "pipe" });
    return { green: true, failed: [] };
  } catch (e) {
    const out = String(e.stdout ?? "") + String(e.stderr ?? "");
    const failed = [...out.matchAll(/^ {2}FAIL {2}(.+)$/gm)].map((m) => m[1].trim());
    return { green: false, failed: failed.length ? failed : ["(exited non-zero with no FAIL line)"] };
  }
}

console.log("accent-search mutations\n");
const TARGETS = [...new Set(MUTANTS.map((m) => m.file))];
const originals = new Map(TARGETS.map((f) => [f, readFileSync(f, "utf8")]));
const restoreAll = () => { for (const [f, t] of originals) writeFileSync(f, t); };

let caught = 0;
const missed = [];
try {
  for (const gate of [UNIT, ITEST]) {
    const base = runGate(gate);
    console.log(`baseline: ${gate.replace("scripts/tests/", "")} is ${base.green ? "GREEN" : "RED"} on the unmutated tree`);
    if (!base.green) {
      console.log(`\nBASELINE IS RED — no result below would mean anything.\n  ${base.failed.join("\n  ")}`);
      process.exit(1);
    }
  }
  for (const m of MUTANTS) {
    const original = originals.get(m.file);
    if (!original.includes(m.from)) {
      missed.push({ ...m, why: `the mutation target no longer exists in ${m.file}` });
      console.log(`  STALE   ${m.name}`);
      continue;
    }
    writeFileSync(m.file, m.all ? original.split(m.from).join(m.to) : original.replace(m.from, m.to));
    let result;
    try { result = runGate(m.gate); } finally { restoreAll(); }
    if (result.green) {
      missed.push({ ...m, why: `${m.gate} stayed green — nothing here is load-bearing` });
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

const after = [UNIT, ITEST].map(runGate);
console.log(after.every((r) => r.green) ? "\nbaseline: green again on the restored tree" : "\nBASELINE IS RED — a mutation was not restored.");
console.log(`\n${caught} of ${MUTANTS.length} mutations caught.`);
if (missed.length > 0 || !after.every((r) => r.green)) {
  if (missed.length) { console.log("\nHOLES:"); for (const m of missed) console.log(`  - ${m.name}\n    ${m.why}`); }
  process.exit(1);
}
console.log('Neither half of "καφε finds Καφές" can lapse without one of these two going red.');
