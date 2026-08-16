// THE BUG THAT SURVIVED BECAUSE IT WAS SILENT.
//
// One shared list of canned answers, all of them Greek, and trigger lists
// that legitimately contained English product nouns — "pricing",
// "credits", "cancel" — because a Greek user types those words. An
// English, French or Japanese user typing one of them scored 0.975
// against a 0.85 threshold and was handed a Greek paragraph. No model
// call, no credits charged, no error, no log line: the cheapest possible
// way to answer the wrong person in the wrong language, and nothing
// anywhere said it had happened.
//
// It was patched with a whole-language guard — CANNED_ANSWER_LOCALE =
// "el", refuse everyone else — which was correct and cost nine locales
// their canned answers entirely.
//
// The articles have a locale column now. THE CENTRAL TEST IN THIS FILE is
// the one that would go red if that ever regressed: feed an English
// trigger to a matcher holding English articles and prove the answer that
// comes back is not Greek. It is checked per locale, in both directions,
// against the real seeded rows.
//
// Run: node scripts/tests/help-articles.test.mjs
import { readFileSync } from "node:fs";

let pass = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    failures.push(name);
    console.log(`  FAIL  ${name}${detail ? "\n        " + detail : ""}`);
  }
}
function checkList(name, actual) {
  check(name, actual.length === 0, actual.slice(0, 6).join("\n        "));
}

const LOCALES = ["en", "el", "es", "fr", "de", "it", "pt", "zh", "ja", "ar"];
const CORE_LOCALES = ["es", "fr", "de", "it", "pt", "zh", "ja", "ar"];

const { loadTs } = await import("./load-ts.mjs");
const { matchCannedAnswer, normalize } = await loadTs("src/lib/support/knowledge-base.ts");
const { EN } = await import("../help-articles/en.mjs");
const { EL } = await import("../help-articles/el.mjs");
const { CORE_1, CORE_SLUGS } = await import("../help-articles/core-1.mjs");
const { CORE_2 } = await import("../help-articles/core-2.mjs");
const CORE = { ...CORE_1, ...CORE_2 };

// The rows exactly as the seed builds them, so this tests the data that
// ships rather than a second copy of it.
function rowsFor(locale) {
  const base = new Map(EN.map((a) => [a.slug, a]));
  const shape = (slug, a) => ({
    slug, locale, title: a.title, body: a.body,
    category: base.get(slug).category, order: base.get(slug).order,
    triggers: a.triggers, href: base.get(slug).href ?? null, isFallback: false,
  });
  if (locale === "en") return EN.map((a) => shape(a.slug, a));
  if (locale === "el") return EL.map((a) => shape(a.slug, a));
  return CORE_SLUGS.map((slug) => shape(slug, CORE[locale][slug]));
}
const BY_LOCALE = Object.fromEntries(LOCALES.map((l) => [l, rowsFor(l)]));

// Greek has a script of its own, which makes "did a Greek answer reach a
// non-Greek user" a question with a mechanical answer rather than a
// judgement call.
const GREEK = /[Ͱ-Ͽἀ-῿]/;
const HAN_KANA = /[぀-ヿ一-鿿]/;
const ARABIC = /[؀-ۿ]/;

console.log("== 1. THE BUG: an English trigger must never return Greek ==");
// The exact words that did it. Each is a real trigger on a real article,
// and each was a trapdoor when one shared list served every language.
const THE_TRAPDOOR_WORDS = ["pricing", "credits", "cancel", "upgrade", "refund", "privacy"];
for (const word of THE_TRAPDOOR_WORDS) {
  const match = matchCannedAnswer(word, BY_LOCALE.en, 0.5);
  check(
    `"${word}" from an English user returns English, or nothing`,
    !match || !GREEK.test(match.article.body),
    match ? `${match.article.slug} (${match.article.locale}): ${match.article.body.slice(0, 60)}` : ""
  );
}
// And the same in every other language: whatever comes back is that
// language's row, because that language's rows are the only ones in scope.
for (const locale of LOCALES) {
  const wrongLocale = [];
  for (const article of BY_LOCALE[locale]) {
    for (const trigger of article.triggers) {
      const match = matchCannedAnswer(trigger, BY_LOCALE[locale], 0.5);
      if (match && match.article.locale !== locale) {
        wrongLocale.push(`${locale}: "${trigger}" -> ${match.article.slug} (${match.article.locale})`);
      }
    }
  }
  checkList(`${locale}: every trigger that matches returns a ${locale} article`, wrongLocale);
}
// The structural half: there is no Greek in scope for a non-Greek caller,
// so the failure is not merely unlikely, it is unreachable.
for (const locale of LOCALES.filter((l) => l !== "el")) {
  const greek = BY_LOCALE[locale].filter((a) => GREEK.test(a.body) || a.triggers.some((t) => GREEK.test(t)));
  checkList(`${locale}: no Greek text is even loaded for this locale`, greek.map((a) => a.slug));
}
// The guard that used to stand in for this is gone, and its absence is
// asserted — leaving it would mean nine locales still got nothing.
const kb = readFileSync("src/lib/support/knowledge-base.ts", "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^\s*\/\/.*$/gm, "");
check("the whole-language guard is gone", !/CANNED_ANSWER_LOCALE/.test(kb));
check("and the matcher takes the articles instead", /articles: readonly KnowledgeArticle\[\]/.test(kb));
check("it no longer reads a global list", !/KNOWLEDGE_BASE/.test(kb));
// An empty article set must match nothing rather than throw — that is
// what a locale with no rows yet looks like, and it has to fall through
// to the model quietly.
check("a locale with no articles matches nothing", matchCannedAnswer("pricing", [], 0.5) === null);

console.log("\n== 2. the seed is complete where it has to be ==");
check(`en carries every article (${EN.length})`, EN.length === 27);
const enSlugs = new Set(EN.map((a) => a.slug));
check(`el carries every article too (${EL.length})`, EL.length === 27);
checkList("and names the same slugs", EL.filter((a) => !enSlugs.has(a.slug)).map((a) => a.slug));
for (const locale of CORE_LOCALES) {
  const missing = CORE_SLUGS.filter((s) => !CORE[locale][s]);
  checkList(`${locale}: has all ${CORE_SLUGS.length} core articles`, missing);
}
checkList("every core slug exists in English", CORE_SLUGS.filter((s) => !enSlugs.has(s)));

console.log("\n== 3. translated, not copied ==");
// A locale whose article is byte-identical to English has not been
// translated, it has been filled in — and the fallback would have shown
// the same text anyway.
for (const locale of CORE_LOCALES) {
  const identical = CORE_SLUGS.filter((s) => {
    const en = EN.find((a) => a.slug === s);
    return CORE[locale][s].body === en.body || CORE[locale][s].title === en.title;
  });
  checkList(`${locale}: no article is a copy of the English one`, identical);
}
// Triggers must be in the locale's own language, which is the whole point.
// Checked where a script makes it decidable.
const SCRIPT = { el: GREEK, zh: HAN_KANA, ja: HAN_KANA, ar: ARABIC };
for (const [locale, re] of Object.entries(SCRIPT)) {
  const noNative = (locale === "el" ? EL : CORE_SLUGS.map((s) => CORE[locale][s])).filter(
    (a) => !a.triggers.some((t) => re.test(t))
  );
  checkList(`${locale}: every article has at least one trigger in its own script`, noNative.map((a) => a.slug ?? "?"));
}

console.log("\n== 4. no numbers that move ==");
// A price in a canned answer is a quote a customer will hold us to, and
// it goes stale in silence. The generator refuses to emit one; this is
// the same rule checked from the other side.
const withDigits = [];
for (const locale of LOCALES) {
  for (const a of BY_LOCALE[locale]) {
    if (/\d/.test(a.body.replace(/\/pricing/g, ""))) withDigits.push(`${locale}/${a.slug}`);
  }
}
checkList("no article body states a number", withDigits);
check("but the money articles still point at /pricing", EN.find((a) => a.slug === "pricing-overview").href === "/pricing");

console.log("\n== 5. the generated seed matches the source ==");
const seed = readFileSync("supabase/migrations/20260816_help_articles_seed.sql", "utf8").replace(/^\s*--.*$/gm, "");
const expected = LOCALES.reduce((n, l) => n + BY_LOCALE[l].length, 0);
const inserts = (seed.match(/^insert into public\.help_articles/gm) ?? []).length;
check(`the seed has one row per article (${inserts} === ${expected})`, inserts === expected);
check("every row is an upsert, so re-running is safe", (seed.match(/on conflict \(slug, locale\) do update/g) ?? []).length === inserts);
// The three statements that must never appear in a seed.
check("it never DROPs", !/\bdrop\s+table\b/i.test(seed));
check("it never TRUNCATEs", !/\btruncate\b/i.test(seed));
check("it never DELETEs", !/\bdelete\s+from\b/i.test(seed));
check("apostrophes are doubled, not escaped with a backslash", !/\\'/.test(seed));

console.log("\n== 6. the schema says what it should ==");
// Comments stripped before scanning. The file documents its own rules in
// prose — "No DROP TABLE, no TRUNCATE", "Not SECURITY DEFINER" — and a
// check that reads comments is failed by the sentence saying it passes.
const ddlRaw = readFileSync("supabase/migrations/20260816_help_articles.sql", "utf8");
const ddl = ddlRaw.replace(/^\s*--.*$/gm, "");
check("the table is created idempotently", /create table if not exists public\.help_articles/.test(ddl));
check("unique on (slug, locale)", /create unique index if not exists[\s\S]{0,120}\(slug, locale\)/.test(ddl));
check("RLS is on, and forced", /enable row level security/.test(ddl) && /force row level security/.test(ddl));
check("published rows are publicly readable", /for select[\s\S]{0,80}using \(published = true\)/.test(ddl));
// Writes are service-role only: no write policy exists, and the grants
// say so explicitly as well.
check("no write policy is created for a browser role", !/for (insert|update|delete)/i.test(ddl));
check("and writes are revoked outright", /revoke insert, update, delete on public\.help_articles from anon, authenticated/.test(ddl));
// House rule for every new function.
check("the new function has EXECUTE revoked from anon and authenticated", /revoke execute on function public\.help_articles_touch_updated_at\(\) from anon, authenticated/.test(ddl));
check("it is not SECURITY DEFINER", !/security definer/i.test(ddl));
check("and it pins search_path", /set search_path = ''/.test(ddl));
check("the schema never DROPs the table", !/\bdrop\s+table\b/i.test(ddl));

console.log("\n== 7. the fallback goes to English, and says so ==");
const loader = readFileSync("src/lib/support/help-articles.ts", "utf8");
check('the fallback locale is "en"', /HELP_FALLBACK_LOCALE = "en"/.test(loader));
check("and never el", !/"el"/.test(loader));
check("a fallback article is flagged", /isFallback: row\.locale !== requested/.test(loader));
// The chat deliberately does NOT fall back — it has the model instead.
check("the canned loader asks for one locale only", /\.eq\("locale", locale\)/.test(loader));
const help = readFileSync("src/app/help/page.tsx", "utf8");
check("/help reads from the table", /loadHelpArticles\(locale\)/.test(help));
check("and marks a fallback article visibly", /article\.isFallback &&/.test(help));
check("with a lang attribute for screen readers", /lang=\{article\.locale\}/.test(help));
// The Greek that used to be hardcoded in the page.
const helpCode = help.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
check("no Greek is left hardcoded in the page", !GREEK.test(helpCode));
check("CATEGORY_TITLES is gone from the file", !/CATEGORY_TITLES/.test(helpCode));
const messages = Object.fromEntries(LOCALES.map((l) => [l, JSON.parse(readFileSync(`messages/${l}.json`, "utf8"))]));
const CATEGORIES = [...new Set(EN.map((a) => a.category))];
for (const locale of LOCALES) {
  const missing = CATEGORIES.filter((c) => typeof messages[locale].helpCentre?.categories?.[c] !== "string");
  checkList(`${locale}: every category has a heading (${CATEGORIES.length})`, missing);
}
for (const locale of LOCALES) {
  const missing = ["title", "intro", "goThere", "shownInEnglish", "notFoundTitle", "notFoundBody", "openChat", "pricingLink", "answerCount"]
    .filter((k) => typeof messages[locale].helpCentre?.[k] !== "string");
  checkList(`${locale}: the page's own prose is translated`, missing);
}

console.log("\n== 8. the \"?\" links on, without depending on it ==");
const { HELP_TIPS } = await loadTs("src/lib/help-tips.ts");
const linked = HELP_TIPS.filter((t) => t.article);
check(`${linked.length} of ${HELP_TIPS.length} tips link to an article`, linked.length === 8);
checkList("every linked slug is a real article", linked.filter((t) => !enSlugs.has(t.article)).map((t) => t.article));
const tip = readFileSync("src/components/ui/help-tip.tsx", "utf8");
check("the link is an anchor on /help", /\/help#\$\{articleSlug\}/.test(tip));
check("and only renders when there is an article", /articleSlug && \(/.test(tip));
// The tip must still answer on its own — the link is an extra. Three
// pages have no article and have to read just as well.
for (const t of HELP_TIPS.filter((x) => !x.article)) {
  check(`${t.id}: answers with no article behind it`, typeof messages.en.help[t.id]?.doesNot === "string");
}

console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${failures.length} failed`);
process.exit(failures.length === 0 ? 0 : 1);
