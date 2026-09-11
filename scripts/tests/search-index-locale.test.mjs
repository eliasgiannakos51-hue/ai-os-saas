// A COLUMN CALLED `locale` MEANS TWO DIFFERENT THINGS, AND THE SEARCH
// INDEX TREATED THEM AS ONE.
//
// 20260914000000_search_index_locale.sql reads the locale out of every
// indexed row generically, through to_jsonb(NEW), and says so:
//
//     -- NULL FOR EVERY USER TABLE, which is the point: their own rows are
//     -- not in a language this product knows and must never be filtered
//     -- by one.
//
// That comment is an INVARIANT the code did not enforce. It was true when
// written because no indexed user table had a `locale` column, and the
// same file called the generic pickup a feature: "a table that GAINS a
// locale column starts being filtered correctly with no migration."
//
// 20260929000000_presentation_decks.sql then added `locale` to
// ai_presentations, which 20260824 indexes. A user's Greek deck was
// stamped `el`, and search_all_localized stopped returning it to its own
// owner in the other nine languages. One row, one copy, invisible.
//
// THE DISTINCTION THE INDEX HAS TO CARRY:
//
//   help_articles.locale   — IDENTITY. One row per (slug, locale); ten
//                            rows say the same thing; show exactly one.
//   ai_presentations.locale — CHOICE. The language the owner asked for.
//                            There is one row. Filtering hides it.
//
// So "does the table have a locale column" is the wrong question and it is
// the one the trigger was asking. The right question is "are these rows
// translations of each other", which is a fact about the table that has to
// be DECLARED. 20261002000000 declares it, and this gate is what stops the
// next table from deciding it by accident.
//
// BOTH WAYS, like lib/absent-on-purpose.mjs: an indexed table that gains a
// locale column and is not in the map goes red, AND a map entry for a
// table that is not indexed or has no such column goes red. A list that
// only fails in one direction goes stale in the other.
//
// Run: node scripts/tests/search-index-locale.test.mjs
import { readFileSync } from "node:fs";
import { schemaSql, migrationFiles } from "./lib/schema-sql.mjs";

let pass = 0;
const failures = [];
const ok = (name, cond, detail) => {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { failures.push(name); console.log(`  FAIL  ${name}${detail !== undefined ? "\n        " + detail : ""}`); }
};

const INDEX_MIGRATION = "20260824000000_unified_search.sql";

// ---------------------------------------------------------------------
// WHAT EVERY INDEXED TABLE'S `locale` COLUMN MEANS.
//
// `translations: true` puts the table on the trigger's allowlist and makes
// its rows filterable by the reader's language. `false` says the column
// exists but names a CHOICE, not an identity, so the row must reach its
// owner in every language.
//
// A table with no locale column at all belongs in neither: it is not
// listed here and the gate does not ask about it.
// ---------------------------------------------------------------------
const LOCALE_COLUMN_MEANING = {
  help_articles: {
    translations: true,
    why:
      "One row per (slug, locale) by construction — 27 articles x ten " +
      "languages. A reader must be shown exactly one of the ten, which is " +
      "the whole reason search_all_localized filters at all.",
  },
  ai_presentations: {
    translations: false,
    why:
      "The language the owner asked their deck to be written in, added by " +
      "20260929000000_presentation_decks.sql. There is exactly one row and " +
      "no other copy of it, so filtering by the reader's interface language " +
      "hides a user's own document from a user's own search.",
  },
};

const sql = schemaSql();

// ---------------------------------------------------------------------
// The indexed tables, read out of the migration that declares them rather
// than retyped — the same reason check-site-spelling.mjs parses the system
// prompt out of its source instead of carrying a copy.
// ---------------------------------------------------------------------
const indexSrc = readFileSync(`supabase/migrations/${INDEX_MIGRATION}`, "utf8");
const indexedTables = [...indexSrc.matchAll(/\[\s*'([a-z_]+)'\s*,/g)].map((m) => m[1]);

console.log("== 1. the indexed tables are read, not assumed ==");
ok(`${INDEX_MIGRATION} still declares an indexed-table list (${indexedTables.length})`, indexedTables.length > 5,
  `parsed: ${JSON.stringify(indexedTables.slice(0, 5))}`);
ok("...and help_articles is one of them", indexedTables.includes("help_articles"));
ok("...and ai_presentations is one of them", indexedTables.includes("ai_presentations"),
  "the table whose locale column caused this gate to exist");

// ---------------------------------------------------------------------
// Which of them actually carry a `locale` column, derived from the whole
// migration corpus — created inline or added later by an ALTER.
// ---------------------------------------------------------------------
const hasLocaleColumn = (table) => {
  const created = new RegExp(
    `create table (?:if not exists )?(?:public\\.)?"?${table}"?\\s*\\(([\\s\\S]*?)\\n\\s*\\);`,
    "i"
  ).exec(sql);
  if (created && /^\s*locale\b/im.test(created[1])) return true;
  for (const m of sql.matchAll(
    new RegExp(`alter table (?:only )?(?:public\\.)?"?${table}"?\\b([\\s\\S]*?);`, "gi")
  )) {
    if (/add column (?:if not exists )?locale\b/i.test(m[1])) return true;
  }
  return false;
};

const withLocale = indexedTables.filter(hasLocaleColumn);

console.log("\n== 2. every indexed table with a locale column has a declared meaning ==");
console.log(`        indexed tables carrying a locale column: ${withLocale.join(", ") || "(none)"}`);
for (const t of withLocale) {
  ok(
    `${t}.locale is declared as translations-or-not`,
    Object.prototype.hasOwnProperty.call(LOCALE_COLUMN_MEANING, t),
    `${t} is indexed by ${INDEX_MIGRATION} and has a locale column, and nothing here says what it MEANS.\n` +
      `        Decide, and add it to LOCALE_COLUMN_MEANING:\n` +
      `          translations: true  — the rows are copies of each other in different languages\n` +
      `                                (then add '${t}' to the trigger allowlist too)\n` +
      `          translations: false — one row, and the column is the language it happens to be in`
  );
}
for (const [t, meaning] of Object.entries(LOCALE_COLUMN_MEANING)) {
  ok(`...and ${t} carries its reason`, typeof meaning.why === "string" && meaning.why.length > 40);
}

console.log("\n== 2b. and the map does not name a table that is gone ==");
for (const t of Object.keys(LOCALE_COLUMN_MEANING)) {
  ok(`${t} is still an indexed table`, indexedTables.includes(t),
    `LOCALE_COLUMN_MEANING names ${t}, which ${INDEX_MIGRATION} no longer indexes — drop the entry.`);
  ok(`...and still has a locale column`, withLocale.includes(t),
    `LOCALE_COLUMN_MEANING names ${t}, which no migration gives a locale column — drop the entry.`);
}

// ---------------------------------------------------------------------
// The trigger itself. The LAST definition in filename order is the live
// one, because that is the order Postgres sees them in.
// ---------------------------------------------------------------------
console.log("\n== 3. the live trigger filters by that declaration, not by the column ==");
const defs = [...sql.matchAll(/create or replace function public\.search_index_sync\(\)[\s\S]*?\n\$\$;/g)];
ok(`search_index_sync is defined at least once (${defs.length})`, defs.length >= 1);
const live = defs.length ? defs[defs.length - 1][0] : "";

const allowlisted = [...live.matchAll(/tg_table_name\s*=\s*'([a-z_]+)'/g)].map((m) => m[1]);
const declaredTranslation = Object.entries(LOCALE_COLUMN_MEANING)
  .filter(([, m]) => m.translations)
  .map(([t]) => t)
  .sort();

ok("the live trigger names its locale tables explicitly", allowlisted.length > 0,
  "The newest search_index_sync reads the locale with no table guard at all, which is the\n" +
    "        defect 20261002000000 exists to fix: `v_locale := nullif(v_row ->> 'locale', '')`\n" +
    "        stamps whatever column it finds, on any table that grows one.");
ok(
  `...and they are exactly the declared translation tables (${declaredTranslation.join(", ")})`,
  JSON.stringify([...new Set(allowlisted)].sort()) === JSON.stringify(declaredTranslation),
  `trigger allowlist: ${JSON.stringify([...new Set(allowlisted)].sort())}\n` +
    `        declared:          ${JSON.stringify(declaredTranslation)}`
);

// The specific regression. Stated as its own check so a failure names the
// user-visible symptom rather than a set difference.
const notTranslations = Object.entries(LOCALE_COLUMN_MEANING)
  .filter(([, m]) => !m.translations)
  .map(([t]) => t);
for (const t of notTranslations) {
  ok(
    `a ${t} row reaches its owner in every language`,
    !allowlisted.includes(t),
    `${t} is on the trigger's locale allowlist while LOCALE_COLUMN_MEANING says its rows are\n` +
      `        not translations of each other. That is the 2026-09-11 bug exactly: the owner's own\n` +
      `        row disappears from the owner's own search when they change interface language.`
  );
}

console.log("\n== 4. the rows stamped before the fix are cleared ==");
const backfill = /update public\.search_index[\s\S]{0,200}?set locale = null[\s\S]{0,200}?;/i.exec(sql);
ok("a migration nulls the locale already written to non-translation rows", backfill !== null,
  "The trigger only rewrites a row when that row is written again, so decks indexed between\n" +
    "        20260929 and the fix keep their locale — and stay invisible — until somebody edits them.");
if (backfill) {
  ok("...and it is scoped by source_table rather than blanket", /source_table/i.test(backfill[0]),
    backfill[0].slice(0, 160));
}

console.log("\n== 5. the filter needs no change, and that is checked rather than assumed ==");
const filterDef = /create or replace function public\.search_all_localized[\s\S]*?\n\$\$;/.exec(sql);
ok("search_all_localized exists", filterDef !== null);
if (filterDef) {
  ok("...and a null locale still passes in every language", /p_locale is null\s+or\s+s\.locale is null/i.test(filterDef[0]) || /s\.locale is null/i.test(filterDef[0]),
    "Fixing the source is only enough while the filter keeps letting null through.");
}

console.log(`\n${failures.length ? "FAILED" : "ALL PASS"}: ${pass} passed, ${failures.length} failed`);
for (const f of failures) console.log(`  - ${f}`);
process.exit(failures.length ? 1 : 0);
