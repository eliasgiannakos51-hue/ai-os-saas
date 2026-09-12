#!/usr/bin/env node
/*
 * THE GREEK PARAGRAPH HANDED TO AN ENGLISH USER, AND THE FIX THAT COST
 * NINE LANGUAGES THEIR ANSWERS.
 *
 * One shared list of canned answers, all of them Greek, with trigger lists
 * that legitimately held English product nouns — "pricing", "credits",
 * "cancel" — because a Greek user types those words. An English speaker
 * typing one of them scored 0.975 against a 0.85 threshold and got a Greek
 * paragraph: no model call, no credits charged, no error, no log line.
 *
 * The first patch was a whole-language guard, CANNED_ANSWER_LOCALE = "el",
 * refuse everyone else. Correct, and it left nine locales with no canned
 * answers at all. The real fix made the guarantee STRUCTURAL: the matcher
 * takes the articles for this user's language, so there is no Greek trigger
 * in scope for a French message to match.
 *
 * TWO GATES. help-articles.test.mjs runs the matcher over the real seeded
 * rows; help-articles.itest.mjs applies the DDL and the seed to a real
 * PostgreSQL and asks it what anon can read. The mutants split the same
 * way: the guarantee, the seed's re-runnability, and the row-level security
 * on a table every visitor reads.
 *
 * Run: node scripts/tests/help-articles.mutation.mjs
 */
import { readFileSync } from "node:fs";
import { writeFileSync } from "./lib/sidecar-write.mjs";
import { execFileSync } from "node:child_process";

const UNIT = "scripts/tests/help-articles.test.mjs";
const ITEST = "scripts/tests/help-articles.itest.mjs";
const KB = "src/lib/support/knowledge-base.ts";
const LOADER = "src/lib/support/help-articles.ts";
const DDL = "supabase/migrations/20260816_help_articles.sql";
const SEED = "supabase/migrations/20260816_help_articles_seed.sql";

const MUTANTS = [
  {
    // THE WHOLE-LANGUAGE GUARD, BACK. It is the correct fix to the wrong
    // problem: no Greek reaches an English user, and no French user ever
    // gets a canned answer either.
    name: "the whole-language guard returns and nine locales lose their answers",
    gate: UNIT,
    file: KB,
    from: "  const n = normalize(message);\n  if (!n) return null;",
    to: '  const CANNED_ANSWER_LOCALE = "el";\n  if (articles[0]?.locale !== CANNED_ANSWER_LOCALE) return null;\n  const n = normalize(message);\n  if (!n) return null;',
    expect: "whole-language guard is gone",
  },
  {
    // AN EMPTY SET MUST FALL THROUGH TO THE MODEL, quietly. A locale with
    // no rows yet is an ordinary state, and it must not throw inside a
    // chat request.
    name: "a locale with no articles stops matching nothing safely",
    gate: UNIT,
    file: KB,
    from: "  let best: CannedMatch | null = null;",
    to: "  let best: CannedMatch | null = null;\n  if (articles.length === 0) throw new Error(\"no articles\");",
    expect: "matches nothing",
  },
  {
    // THE FALLBACK POINTED BACK AT GREEK. This is the original bug reached
    // by the other road: the structural guarantee holds, and the loader
    // hands a French reader Greek rows because that is what it falls back
    // to.
    name: "the fallback locale becomes Greek again",
    gate: UNIT,
    file: LOADER,
    from: 'export const HELP_FALLBACK_LOCALE = "en";',
    to: 'export const HELP_FALLBACK_LOCALE = "el";',
    expect: 'fallback locale is "en"',
  },
  {
    // A FALLBACK ARTICLE THAT DOES NOT SAY SO. The reader is shown English
    // text with no indication their language has no version — which reads
    // as a broken translation rather than a missing one.
    name: "a fallback article stops being flagged as one",
    gate: UNIT,
    file: LOADER,
    from: "    isFallback: row.locale !== requested,",
    to: "    isFallback: false,",
    expect: "fallback article is flagged",
  },
  {
    // THE SEED STOPS UPDATING. `do nothing` still makes a re-run safe, and
    // makes every later correction to an article's text a no-op — the
    // quietest possible way for a fix to not ship.
    name: "the seed's upsert becomes a do-nothing",
    gate: UNIT,
    file: SEED,
    from: "on conflict (slug, locale) do update set",
    to: "on conflict (slug, locale) do nothing; -- ",
    all: true,
    expect: "every row is an upsert",
  },
  {
    // DELETE-THEN-INSERT. The shape that emptied chat_memory: a seed that
    // clears the table first is one interrupted paste away from a help
    // centre with nothing in it.
    name: "the seed clears the table before inserting",
    gate: UNIT,
    file: SEED,
    from: "insert into public.help_articles",
    to: "delete from public.help_articles;\ninsert into public.help_articles",
    expect: "never DELETEs",
  },
  {
    // ONE ROW PER SLUG, NOT PER LANGUAGE. The unique index IS the
    // multi-language design: narrow it to the slug and the second locale's
    // upsert overwrites the first, so the table ends up holding whichever
    // language was seeded last.
    name: "the unique index drops the locale, so one language overwrites the rest",
    gate: UNIT,
    file: DDL,
    from: "create unique index if not exists help_articles_slug_locale_uidx\n  on public.help_articles (slug, locale);",
    to: "create unique index if not exists help_articles_slug_locale_uidx\n  on public.help_articles (slug);",
    expect: "unique on (slug, locale)",
  },
  {
    // THE TRIGGER FUNCTION WITHOUT A PINNED search_path. It runs on every
    // write to this table; an unpinned search_path is the standard
    // resolution-order attack on a function somebody else can influence.
    name: "the updated_at trigger stops pinning its search_path",
    gate: UNIT,
    file: DDL,
    from: "set search_path = ''",
    to: "set search_path = public",
    expect: "pins search_path",
  },
  {
    // THE WRITE REVOKE. There is no write policy, so writes are already
    // denied — the revoke is the belt to that braces, and it is what
    // survives somebody adding a policy later without thinking.
    name: "writes stop being revoked from the browser roles",
    gate: UNIT,
    file: DDL,
    from: "revoke insert, update, delete on public.help_articles from anon, authenticated;",
    to: "",
    expect: "writes are revoked outright",
  },
  {
    // AN UNPUBLISHED DRAFT, PUBLIC. `using (true)` reads as "this table is
    // public", which it is — except for the rows that are not finished.
    // Only a real server can answer this, which is why it is the itest's.
    name: "the read policy stops checking that the row is published",
    gate: ITEST,
    file: DDL,
    from: "  using (published = true);",
    to: "  using (true);",
    expect: "cannot see an unpublished row",
  },
  {
    // FORCE RLS ON A TABLE THAT SEEDS ITSELF. It sounds stricter and it
    // makes the owner subject to its own policies, so the seed is refused
    // by the table it is seeding — a migration that applies and inserts
    // nothing.
    name: "the table is switched to FORCE row level security",
    gate: ITEST,
    file: DDL,
    from: "alter table public.help_articles enable row level security;",
    to: "alter table public.help_articles enable row level security;\nalter table public.help_articles force row level security;",
    expect: "does not FORCE RLS",
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

console.log("help-articles mutations\n");
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
console.log("Neither the wrong language nor an unfinished draft can reach a reader without one of these two going red.");
