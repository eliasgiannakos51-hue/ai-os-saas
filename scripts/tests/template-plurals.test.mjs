// Can somebody find a template by typing the plural?
//
// WHAT WAS WRONG. A Greek user typing "ανταγωνιστές" — the ordinary
// plural — was shown NO templates, because the keyword said
// "ανταγωνιστης". Measured on PostgreSQL 16 against the live seed, nine of
// twenty-four probes across SIX languages returned nothing, and they failed
// in both directions: "εκδήλωση" found nothing because the keyword was
// already the plural "εκδηλωσεις".
//
// WHY IT IS INVISIBLE TO EVERY OTHER GATE. Keywords are RUNTIME STRINGS in
// a SQL array literal. No compiler reads them, no type covers them, and a
// missing plural produces no error anywhere — just a search box that finds
// nothing and a user who concludes the feature is empty.
//
// WHAT THIS FILE CHECKS, and it is the property rather than the strings:
//
//   1. every keyword in every template is CLASSIFIED — either it belongs
//      to a form group, or it is written down as having no plural WITH A
//      REASON. An unclassified word fails. That is what makes a thirteenth
//      template turn this red instead of shipping half a language.
//   2. every form group is COMPLETE wherever any of its members appears.
//      One form present and the other missing is the bug itself.
//   3. the migration has not DRIFTED from the lexicon.
//   4. no migration outside the two known ones writes agent_templates
//      keywords behind this gate's back.
//
// It does not run SQL. The behaviour — that the query actually returns the
// template — is measured against a real PostgreSQL in
// scripts/tests/agent-templates.dbtest.mjs.
//
// Run: node scripts/tests/template-plurals.test.mjs
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import {
  FORMS,
  NO_PLURAL,
  TEMPLATE_KEYWORDS,
  INFLECTED_LANGS,
  UNINFLECTED_LANGS,
} from "../lib/template-plurals.mjs";

const ROOT = process.cwd();
const MIGRATIONS = path.join(ROOT, "supabase", "migrations");
const SEED_FILE = "20260826000000_agent_templates.sql";
const FIX_FILE = "20260907000000_template_keyword_plurals.sql";

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

/**
 * COMMENTS ARE NOT CODE. Every one of these files explains itself at
 * length, and the explanations contain the very words being checked —
 * "ανταγωνιστές" appears in three comment blocks. Reading the arrays out
 * of raw text would find keywords that are not keywords.
 */
function stripSql(sql) {
  let out = "";
  let i = 0;
  let inLine = false;
  let inBlock = false;
  let quote = null; // "'" or a $tag$
  while (i < sql.length) {
    const two = sql.slice(i, i + 2);
    if (quote === null && !inLine && !inBlock) {
      if (two === "--") { inLine = true; i += 2; continue; }
      if (two === "/*") { inBlock = true; i += 2; continue; }
      if (sql[i] === "'") { quote = "'"; out += sql[i++]; continue; }
      const dollar = /^\$[A-Za-z_]*\$/.exec(sql.slice(i));
      if (dollar) { quote = dollar[0]; out += dollar[0]; i += dollar[0].length; continue; }
      out += sql[i++];
      continue;
    }
    if (inLine) { if (sql[i] === "\n") { inLine = false; out += "\n"; } i++; continue; }
    if (inBlock) { if (two === "*/") { inBlock = false; i += 2; } else i++; continue; }
    // inside a literal
    if (quote === "'") {
      if (two === "''") { out += two; i += 2; continue; }
      if (sql[i] === "'") { quote = null; out += sql[i++]; continue; }
      out += sql[i++];
      continue;
    }
    if (sql.slice(i, i + quote.length) === quote) { out += quote; i += quote.length; quote = null; continue; }
    out += sql[i++];
  }
  return out;
}

/** The `array[ ... ]` that follows the first mention of a slug. */
function keywordsAfterSlug(sql, slug) {
  const at = sql.indexOf(`'${slug}'`);
  if (at < 0) return null;
  const open = sql.indexOf("array[", at);
  if (open < 0) return null;
  const close = sql.indexOf("]", open);
  if (close < 0) return null;
  return [...sql.slice(open + 6, close).matchAll(/'((?:[^']|'')*)'/g)].map((m) =>
    m[1].replace(/''/g, "'")
  );
}

console.log("template-plurals");

// ---------------------------------------------------------------------
console.log("\n== 1. the lexicon is well-formed ==");
// ---------------------------------------------------------------------
// A WORD MAY BELONG TO TWO GROUPS, in two languages. "evento" is both
// Spanish (eventos) and Italian (eventi), and both plurals have to be
// there — the first version of this gate assumed one group per word and
// failed on exactly that. Two groups in the SAME language sharing a word
// is still a mistake, because then neither says which plural is meant.
const wordToGroups = new Map();
const dupes = [];
for (const g of FORMS) {
  for (const f of g.forms) {
    const existing = wordToGroups.get(f) ?? [];
    if (existing.some((o) => o.lang === g.lang)) dupes.push(`${g.lang}:${f}`);
    existing.push(g);
    wordToGroups.set(f, existing);
  }
}
check("no word belongs to two form groups in one language", dupes, []);
check(
  "every form group has at least two distinct forms",
  FORMS.filter((g) => new Set(g.forms).size < 2).map((g) => g.forms.join("/")),
  []
);
check(
  "every form group names an inflected language",
  FORMS.filter((g) => !(g.lang in INFLECTED_LANGS)).map((g) => `${g.lang}:${g.forms[0]}`),
  []
);

const noPlural = new Map(NO_PLURAL.map((n) => [n.word, n]));
check(
  "nothing is both a form and a no-plural",
  NO_PLURAL.filter((n) => wordToGroups.has(n.word)).map((n) => n.word),
  []
);
// A REASON, NOT A LIST. "no plural" and "nobody wrote the plural" look
// identical in a keyword array; the reason is what tells them apart, and a
// blank one would let the second hide inside the first.
check(
  "every no-plural entry gives a reason",
  NO_PLURAL.filter((n) => typeof n.why !== "string" || n.why.trim().length < 4).map((n) => n.word),
  []
);
check(
  "every no-plural entry names a known language",
  NO_PLURAL.filter((n) => !(n.lang in INFLECTED_LANGS) && !(n.lang in UNINFLECTED_LANGS)).map(
    (n) => `${n.lang}:${n.word}`
  ),
  []
);

// ---------------------------------------------------------------------
console.log("\n== 2. every keyword is classified, in every template ==");
// ---------------------------------------------------------------------
const unclassified = [];
for (const [slug, kws] of Object.entries(TEMPLATE_KEYWORDS)) {
  for (const k of kws) {
    if (!wordToGroups.has(k) && !noPlural.has(k)) unclassified.push(`${slug}: ${k}`);
  }
}
check("no keyword is missing from the lexicon", unclassified, []);

// ---------------------------------------------------------------------
console.log("\n== 3. THE BUG ITSELF: no half-present form group ==");
// ---------------------------------------------------------------------
// If any form of a word is in a template's keywords, all of them must be.
// One present and the other absent IS the reported bug, expressed as a
// property rather than as a list of the words that were wrong in August.
const halfPresent = [];
for (const [slug, kws] of Object.entries(TEMPLATE_KEYWORDS)) {
  const have = new Set(kws);
  for (const g of FORMS) {
    const present = g.forms.filter((f) => have.has(f));
    if (present.length === 0 || present.length === g.forms.length) continue;
    halfPresent.push(
      `${slug} [${g.lang}] has ${present.join(",")} but not ${g.forms
        .filter((f) => !have.has(f))
        .join(",")}`
    );
  }
}
check("every template carries both numbers of every word it uses", halfPresent, []);

check(
  "no template lost a keyword to a duplicate",
  Object.entries(TEMPLATE_KEYWORDS)
    .filter(([, k]) => new Set(k).size !== k.length)
    .map(([s]) => s),
  []
);

// ---------------------------------------------------------------------
console.log("\n== 4. the migration matches the lexicon ==");
// ---------------------------------------------------------------------
const fixSql = stripSql(readFileSync(path.join(MIGRATIONS, FIX_FILE), "utf8"));
const seedSql = stripSql(readFileSync(path.join(MIGRATIONS, SEED_FILE), "utf8"));

const drift = [];
for (const [slug, kws] of Object.entries(TEMPLATE_KEYWORDS)) {
  const inSql = keywordsAfterSlug(fixSql, slug);
  if (!inSql) { drift.push(`${slug}: absent from ${FIX_FILE}`); continue; }
  if (JSON.stringify(inSql) !== JSON.stringify(kws)) {
    drift.push(`${slug}: migration has ${inSql.length}, lexicon has ${kws.length}`);
  }
}
check("the migration writes exactly what the lexicon says", drift, []);

// Every slug the SEED creates must be covered. A thirteenth built-in added
// to the seed and not to the fix would ship with one number again.
//
// SCOPED TO THE INSERT BLOCK. Reading `('word', '` out of the whole file
// also matched `to_tsvector('simple', ...)` and the output_format literal
// 'summary' — two "slugs" that do not exist, which is how a loose regex
// turns a real check into noise. Anchored on the statement instead.
const insertAt = seedSql.indexOf("insert into public.agent_templates");
const insertEnd = seedSql.indexOf("on conflict (slug) do nothing", insertAt);
if (insertAt < 0 || insertEnd < 0) {
  fail++;
  console.log("  FAIL  could not find the seed INSERT block");
}
const insertBlock = seedSql.slice(Math.max(insertAt, 0), insertEnd < 0 ? 0 : insertEnd);
const seedSlugs = [
  ...new Set([...insertBlock.matchAll(/\(\s*'([a-z0-9][a-z0-9-]*)',\s*'/g)].map((m) => m[1])),
];
check(
  "every built-in in the seed is covered by the fix",
  seedSlugs.filter((s) => !(s in TEMPLATE_KEYWORDS)),
  []
);
check("the seed still defines twelve built-ins", seedSlugs.length, 12);

// ---------------------------------------------------------------------
console.log("\n== 5. nothing writes keywords behind this gate's back ==");
// ---------------------------------------------------------------------
// RULE: SEARCH OUTSIDE THE LIST. A future migration that inserts a
// template, or rewrites keywords, is exactly the thing this file cannot
// see — so it fails until somebody adds it here.
const KNOWN = new Set([SEED_FILE, FIX_FILE]);
const MIGRATION_FILES = readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql"));
// A FLOOR OF ONE, AND NOT MORE, DELIBERATELY. The real repository has
// forty-plus migrations, but template-plurals.mutation.mjs runs this same
// gate against a THREE-file fixture to prove the stray-migration scan
// works — so a repo-sized floor fires there on a harmless change and
// reports a false positive. One is what both contexts can promise, and it
// still catches the failure this exists for: a scan that returns nothing,
// after which the stray check below passes by reading no files.
check(`the migration scan found files (${MIGRATION_FILES.length})`, MIGRATION_FILES.length >= 1, true);
const strays = [];
for (const f of MIGRATION_FILES) {
  if (KNOWN.has(f)) continue;
  const sql = stripSql(readFileSync(path.join(MIGRATIONS, f), "utf8"));
  if (!/agent_templates/.test(sql)) continue;
  if (/\bkeywords\b/.test(sql)) strays.push(f);
}
check("no other migration touches agent_templates.keywords", strays, []);

// ---------------------------------------------------------------------
console.log("\n== 6. the languages that need this are all represented ==");
// ---------------------------------------------------------------------
// Not a count of words — a check that the fix reached every inflected
// language rather than stopping at the one that was reported.
const langsCovered = new Set(
  FORMS.filter((g) => Object.values(TEMPLATE_KEYWORDS).some((k) => g.forms.every((f) => k.includes(f))))
    .map((g) => g.lang)
);
check(
  "every inflected language has at least one completed pair in use",
  Object.keys(INFLECTED_LANGS).filter((l) => !langsCovered.has(l)),
  []
);

console.log(`\n${fail === 0 ? "PASS" : "FAIL"}  ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
