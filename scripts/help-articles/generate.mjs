// Generates supabase/migrations/20260816_help_articles_seed.sql.
//
// GENERATED, NOT HAND-WRITTEN, for the reason every generated artefact in
// this repo is: 158 INSERT rows typed by hand are 158 chances to mis-quote
// an apostrophe in a French body or drop a locale from one slug, and none
// of those mistakes is visible in review. The data lives in en.mjs /
// el.mjs / core-1.mjs / core-2.mjs, where it can be read as prose, and the
// SQL is a build product.
//
// ONE STATEMENT PER ROW IS WHAT THIS EMITS, and that shape has a known
// hazard when the file is pasted into a browser SQL editor rather than
// run with psql: a run can stop part-way and leave rows behind WITHOUT
// surfacing an error, which looks exactly like success. It happened —
// twice — while seeding this table; see TODO.md for the measurements.
//
// The file is correct and `psql -f` runs it fine. If you are pasting,
// generate the per-locale single-statement form instead (one multi-row
// insert per language, ~7 KB each): that either lands whole or fails
// loudly, and loud beats silent. Either way, count the rows per locale
// after each piece — nothing else makes a partial run visible.
//
// BUILDING IS SEPARATE FROM WRITING. buildSeedSql() returns the string
// and touches no file, so help-articles.test.mjs can compare it against
// the committed .sql byte for byte. Without that comparison the suite
// checked only the ROW COUNT — edit a French body, forget to regenerate,
// and every check stayed green while the file on disk and the source
// files said different things. That is the same class of drift that left
// chat-memory in the database and in no source file.
//
// Run: node scripts/help-articles/generate.mjs
import { writeFileSync } from "node:fs";
import { EN } from "./en.mjs";
import { EL } from "./el.mjs";
import { CORE_1, CORE_SLUGS } from "./core-1.mjs";
import { CORE_2 } from "./core-2.mjs";

export const OUT = "supabase/migrations/20260816_help_articles_seed.sql";
const CORE = { ...CORE_1, ...CORE_2 };

/** Postgres string literal. Doubling the quote is the only escape a
 *  standard_conforming_strings literal needs, and backslashes are data. */
function q(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}
function textArray(values) {
  if (!values.length) return "'{}'::text[]";
  return `array[${values.map(q).join(", ")}]::text[]`;
}

export function buildSeedSql() {
// EN is the base and carries the category and order for every slug; the
// other locales are translations of the same article and inherit both, so
// a category can never drift between languages.
const BASE = new Map(EN.map((a) => [a.slug, a]));

const rows = [];
function push(locale, slug, title, body, triggers) {
  const base = BASE.get(slug);
  if (!base) throw new Error(`${locale}/${slug}: no English base article`);
  rows.push({ slug, locale, title, body, category: base.category, order: base.order, triggers, href: base.href ?? null });
}

for (const a of EN) push("en", a.slug, a.title, a.body, a.triggers);
for (const a of EL) push("el", a.slug, a.title, a.body, a.triggers);
for (const [locale, bySlug] of Object.entries(CORE)) {
  for (const slug of CORE_SLUGS) {
    const a = bySlug[slug];
    if (!a) throw new Error(`${locale}: missing core article ${slug}`);
    push(locale, slug, a.title, a.body, a.triggers);
  }
}

// A price or a credit count in an answer is a quote a customer will hold
// us to, and it goes stale silently. Caught here, before it reaches the
// database, rather than only in the test that reads it back.
const DIGIT = /\d/;
const ALLOWED_DIGITS = /(\/pricing|ionexa|gpt|mp3|h24|24\/7)/i;
for (const r of rows) {
  const stripped = r.body.replace(ALLOWED_DIGITS, "");
  if (DIGIT.test(stripped)) {
    throw new Error(`${r.locale}/${r.slug}: body contains a digit — numbers belong on /pricing`);
  }
}

const byLocale = rows.reduce((acc, r) => ((acc[r.locale] = (acc[r.locale] ?? 0) + 1), acc), {});

const header = `-- Help Centre seed. GENERATED — do not edit by hand.
--
-- Source: scripts/help-articles/{en,el,core-1,core-2}.mjs
-- Regenerate: node scripts/help-articles/generate.mjs
--
-- IDEMPOTENT. Every row is an UPSERT on (slug, locale), which is the
-- unique index created by 20260816_help_articles.sql. Running this twice
-- updates in place and inserts nothing twice. No DELETE, no TRUNCATE — a
-- translation removed from the source files stays in the table until
-- somebody removes it deliberately, because silently deleting published
-- content from a seed is how a Help Centre loses an article nobody
-- noticed was gone.
--
-- ROWS: ${rows.length} total — ${Object.entries(byLocale).map(([l, n]) => `${l}=${n}`).join(", ")}
--
-- en is COMPLETE (all ${EN.length} slugs) because it is the fallback and there is
-- nothing behind it. el is complete because it already existed. The other
-- eight carry the ${CORE_SLUGS.length} core articles and fall back to English for the
-- rest — visibly, with a marker and a lang attribute, never silently.
--
-- NO NUMBERS THAT MOVE: the generator refuses to emit a body containing a
-- digit, so a price cannot be baked into an answer by accident.

`;

const statements = rows.map(
  (r) => `insert into public.help_articles (slug, locale, title, body, category, "order", published, triggers, href)
values (${q(r.slug)}, ${q(r.locale)}, ${q(r.title)}, ${q(r.body)}, ${q(r.category)}, ${r.order}, true, ${textArray(r.triggers)}, ${r.href ? q(r.href) : "null"})
on conflict (slug, locale) do update set
  title = excluded.title,
  body = excluded.body,
  category = excluded.category,
  "order" = excluded."order",
  published = excluded.published,
  triggers = excluded.triggers,
  href = excluded.href;`
);

return { sql: header + statements.join("\n\n") + "\n", rows, byLocale };
}

// The CLI half. Nothing above it writes anything.
if (process.argv[1] && process.argv[1].endsWith("generate.mjs")) {
  const { sql, rows, byLocale } = buildSeedSql();
  writeFileSync(OUT, sql);
  console.log(`${OUT}: ${rows.length} rows (${Object.entries(byLocale).map(([l, n]) => `${l}=${n}`).join(", ")})`);
}
