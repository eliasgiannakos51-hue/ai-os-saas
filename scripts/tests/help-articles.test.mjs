// The Help Centre: content, migration, and the one rule that matters.
//
// WHAT WAS WRONG. Twenty-seven help articles were Greek string literals in
// src/lib/support/knowledge-base.ts and were served to all ten locales. A
// Japanese reader opening /help read Greek. The same array fed the support
// chat's canned answers, so the same reader could be handed a Greek
// paragraph instead of an answer — free, instantly, with the model never
// called.
//
// THE RULE THIS FILE EXISTS TO ENFORCE:
//
//     a reader gets their own language, English where theirs is missing,
//     and NEVER Greek.
//
// Section 5 checks it as a CROSS-PRODUCT — every one of the ten locales
// against fixtures that deliberately contain Greek rows — rather than by
// sampling one or two. The bug being fixed lived in exactly the cells a
// sample would have skipped.
//
// Run: node scripts/tests/help-articles.test.mjs
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { loadTs } from "./load-ts.mjs";

let pass = 0;
const failures = [];
function check(name, cond, detail = "") {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    failures.push(name);
    console.log(`  FAIL  ${name}${detail ? "\n        " + detail : ""}`);
  }
}

const ROOT = process.cwd();
const CONTENT = path.join(ROOT, "content", "help");
const MIGRATION = path.join(ROOT, "supabase", "migrations", "20260816_help_articles.sql");

const manifest = JSON.parse(readFileSync(path.join(CONTENT, "manifest.json"), "utf8"));
const LOCALES = manifest.locales;
const SLUGS = manifest.articles.map((a) => a.slug);
const CORE = manifest.articles.filter((a) => a.core).map((a) => a.slug);
const sql = readFileSync(MIGRATION, "utf8");

const content = new Map();
for (const loc of LOCALES) {
  const f = path.join(CONTENT, `${loc}.json`);
  content.set(loc, existsSync(f) ? JSON.parse(readFileSync(f, "utf8")).articles : {});
}

// ---------------------------------------------------------------------------
console.log("== 1. the content ==");

check("the manifest lists 27 articles", SLUGS.length === 27, String(SLUGS.length));
check("no duplicate slugs", new Set(SLUGS).size === SLUGS.length);
check(
  "English is the base and is COMPLETE",
  SLUGS.every((s) => content.get("en")[s]),
  SLUGS.filter((s) => !content.get("en")[s]).join(", ")
);
check(
  "Greek is complete too, as one more translation",
  SLUGS.every((s) => content.get("el")[s]),
  SLUGS.filter((s) => !content.get("el")[s]).join(", ")
);
check(
  `at least ten articles are core (${CORE.length})`,
  CORE.length >= 10,
  String(CORE.length)
);
// The count is not the point — this is. A slug marked core that some
// language has not translated would show a fallback notice on a page that
// language's readers use daily, which is the whole reason `core` exists.
{
  const shipped = LOCALES.filter((l) => Object.keys(content.get(l)).length > 0);
  const gaps = [];
  for (const slug of CORE) {
    for (const loc of shipped) if (!content.get(loc)[slug]) gaps.push(`${loc}/${slug}`);
  }
  check(
    `every core article exists in all ${shipped.length} shipped languages (${CORE.length} x ${shipped.length})`,
    gaps.length === 0,
    gaps.join(", ")
  );
}

// NO NUMBERS THAT MOVE. A price or a credit amount in an article is a
// quote a customer will hold us to, and nobody reviews an article the way
// they review lib/billing/plans.ts. The generator refuses to emit one; this
// is the second lock, on the content itself.
{
  const offenders = [];
  for (const [loc, arts] of content) {
    for (const [slug, art] of Object.entries(arts)) {
      for (const field of ["title", "body"]) {
        if (/\d/.test(String(art[field] ?? ""))) offenders.push(`${loc}/${slug}.${field}`);
      }
    }
  }
  check("not one article states a number", offenders.length === 0, offenders.join(", "));
}

// Greek, Japanese and Arabic share no alphabet with English, so an
// identical string in any of them means nothing was translated.
{
  const suspicious = [];
  for (const loc of ["el", "ja", "ar"]) {
    for (const slug of Object.keys(content.get(loc))) {
      const a = content.get(loc)[slug];
      const en = content.get("en")[slug];
      if (!en) continue;
      if (a.title === en.title) suspicious.push(`${loc}/${slug}.title`);
      if (a.body === en.body) suspicious.push(`${loc}/${slug}.body`);
    }
  }
  check("el/ja/ar are actually translated, not copied", suspicious.length === 0, suspicious.join(", "));
}

// Every translation that exists must translate a slug the manifest knows,
// and a language that ships a partial set must ship the CORE ten — the
// ones a reader is most likely to arrive on.
{
  const problems = [];
  for (const [loc, arts] of content) {
    if (Object.keys(arts).length === 0) continue;
    for (const slug of Object.keys(arts)) {
      if (!SLUGS.includes(slug)) problems.push(`${loc}: unknown slug ${slug}`);
    }
    for (const slug of CORE) {
      if (!arts[slug]) problems.push(`${loc}: missing core article ${slug}`);
    }
  }
  check("every shipped language covers all ten core articles", problems.length === 0, problems.join("\n        "));
}

// ---------------------------------------------------------------------------
console.log("\n== 2. the migration is what the content generates ==");
{
  const regenerated = execFileSync("node", ["scripts/generate-help-seed.mjs", "--check"], {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
  // A hand-edited migration is the failure mode this catches: the SQL
  // would ship a sentence the JSON does not have, and the next
  // regeneration would silently take it away again.
  check("the committed SQL is byte-identical to the generator's output", regenerated === sql);
}

// ---------------------------------------------------------------------------
console.log("\n== 3. the migration cannot destroy anything ==");
// The absolute rules for this repo. A schema dump with 126 DROP TABLE
// statements, labelled "safe", is why these are checked mechanically
// rather than trusted to a comment.
{
  const code = sql
    .split("\n")
    .map((l) => l.replace(/--.*$/, ""))
    .join("\n");
  for (const [label, re] of [
    ["DROP TABLE", /\bdrop\s+table\b/i],
    ["TRUNCATE", /\btruncate\b/i],
    ["DROP CONSTRAINT", /\bdrop\s+constraint\b/i],
    ["DROP POLICY", /\bdrop\s+policy\b/i],
    ["DROP COLUMN", /\bdrop\s+column\b/i],
    ["DELETE", /\bdelete\s+from\b/i],
  ]) {
    check(`no ${label}`, !re.test(code));
  }
}

console.log("\n== 4. …and can be run twice ==");
check("the table is guarded", /create table if not exists public\.help_articles/.test(sql));
check("every added column is guarded", !/alter table[\s\S]{0,80}add column (?!if not exists)/i.test(sql));
check("the unique index is guarded", /create unique index if not exists help_articles_slug_locale_uidx/.test(sql));
check("the read index is guarded", /create index if not exists help_articles_locale_published_idx/.test(sql));
check("the function is CREATE OR REPLACE", /create or replace function public\.help_articles_touch_updated_at/.test(sql));
// Constraints, policies and triggers have no IF NOT EXISTS in the
// PostgreSQL versions this targets, so each one needs an explicit guard.
// Counting them is what makes a NEW unguarded one fail rather than pass by
// sitting next to three guarded ones.
{
  const constraints = (sql.match(/add constraint /g) ?? []).length;
  const constraintGuards = (sql.match(/from pg_constraint/g) ?? []).length;
  check(`every constraint is guarded (${constraintGuards}/${constraints})`, constraints > 0 && constraintGuards === constraints);

  const policies = (sql.match(/create policy /g) ?? []).length;
  const policyGuards = (sql.match(/from pg_policies/g) ?? []).length;
  check(`every policy is guarded (${policyGuards}/${policies})`, policies > 0 && policyGuards === policies);

  const triggers = (sql.match(/create trigger /g) ?? []).length;
  const triggerGuards = (sql.match(/from pg_trigger/g) ?? []).length;
  check(`every trigger is guarded (${triggerGuards}/${triggers})`, triggers > 0 && triggerGuards === triggers);
}
check(
  "the seed is an upsert, not a bare insert",
  /on conflict \(slug, locale\) do update/.test(sql)
);
check(
  "the upsert does not rewrite created_at",
  !/do update[\s\S]*?created_at\s*=/.test(sql),
  "a re-run must not change when a row first appeared"
);

console.log("\n== 5a. RLS: readable by anyone, writable by nobody with a key ==");
check("RLS is enabled", /alter table public\.help_articles enable row level security/.test(sql));
check("published rows are publicly readable", /for select[\s\S]{0,80}using \(published = true\)/.test(sql));
check("select is granted to anon", /grant select on public\.help_articles to anon/.test(sql));
// The absence is the security property. With RLS on and no write policy,
// anon and authenticated writes are refused by the database; only the
// service role (which bypasses RLS) can change content.
check(
  "there is NO insert/update/delete policy",
  !/for (insert|update|delete)/i.test(sql),
  "a write policy here would let a logged-in user rewrite the Help Centre"
);

// ---------------------------------------------------------------------------
console.log("\n== 5. the fallback: own language, then English, NEVER Greek ==");
const { mergeByLocale, localesFor } = await loadTs("src/lib/support/help-fallback.ts");

// Fixtures on purpose contain a Greek row for every slug. If the rule is
// wrong in any direction, Greek is what leaks — it is the language the old
// code shipped to everyone.
const row = (slug, locale, category = "billing", order = 10) => ({
  slug,
  locale,
  title: `${slug}:${locale}`,
  body: `body:${locale}`,
  category,
  order,
  triggers: [locale],
});

{
  // A slug that exists in Greek and English only.
  const rows = [row("cancel", "el"), row("cancel", "en")];
  for (const loc of LOCALES) {
    const merged = mergeByLocale(rows, loc);
    const got = merged[0];
    const expected = loc === "el" ? "el" : "en";
    check(
      `${loc}: gets ${expected}, not the other one`,
      got && got.locale === expected,
      got ? got.locale : "nothing"
    );
    check(
      `${loc}: isFallback is ${loc === "el" || loc === "en" ? "false" : "true"}`,
      got && got.isFallback === (loc !== "el" && loc !== "en")
    );
  }
}

{
  // THE CASE THE OLD CODE GOT WRONG: an article that exists ONLY in Greek.
  // Nobody but a Greek reader may see it. Not as a fallback, not with a
  // marker, not at all — the correct behaviour is that the article is
  // absent, because there is nothing to show in a language they read.
  const rows = [row("greek-only", "el")];
  for (const loc of LOCALES) {
    const merged = mergeByLocale(rows, loc);
    check(
      `${loc}: a Greek-only article is ${loc === "el" ? "shown" : "invisible"}`,
      loc === "el" ? merged.length === 1 : merged.length === 0,
      JSON.stringify(merged.map((m) => m.locale))
    );
  }
}

{
  // Three languages present: the reader's own must win over English.
  const rows = [row("x", "el"), row("x", "en"), row("x", "fr"), row("x", "ja")];
  check("fr reader gets fr", mergeByLocale(rows, "fr")[0].locale === "fr");
  check("ja reader gets ja", mergeByLocale(rows, "ja")[0].locale === "ja");
  check("de reader gets en (not fr, not ja, not el)", mergeByLocale(rows, "de")[0].locale === "en");
  check("el reader gets el", mergeByLocale(rows, "el")[0].locale === "el");
}

{
  // The query's own guarantee, independent of the merge.
  for (const loc of LOCALES) {
    const allowed = localesFor(loc);
    check(
      `${loc}: the query may only see ${JSON.stringify(allowed)}`,
      allowed.length <= 2 && allowed[0] === loc && (allowed.length === 1 || allowed[1] === "en")
    );
    if (loc !== "el") {
      check(`${loc}: "el" is not in the set that can be fetched`, !allowed.includes("el"));
    }
  }
  check("an unknown locale becomes English outright", JSON.stringify(localesFor("xx")) === '["en"]');
  check("an empty locale becomes English outright", JSON.stringify(localesFor("")) === '["en"]');
}

{
  // A row in a locale nobody asked for must be dropped even if a caller
  // hands it over — the second lock, so the rule survives a future query
  // that forgets to narrow.
  const rows = [row("x", "el"), row("x", "de")];
  const merged = mergeByLocale(rows, "fr");
  check("a caller passing extra locales still cannot leak them", merged.length === 0, JSON.stringify(merged));
}

// ---------------------------------------------------------------------------
console.log("\n== 6. the contextual \"?\" names articles that exist ==");
{
  function walk(dir, out = []) {
    for (const entry of readdirSync(dir)) {
      const p = path.join(dir, entry);
      if (statSync(p).isDirectory()) walk(p, out);
      else if (/\.tsx?$/.test(entry)) out.push(p);
    }
    return out;
  }
  const used = new Map();
  for (const file of walk(path.join(ROOT, "src"))) {
    // Comments stripped FIRST. The scan used to read help-tip.tsx's own
    // usage note — `<HelpTip slug="..."/>` — and report an article called
    // "...", which is a test failing on its own documentation.
    const src = readFileSync(file, "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .split("\n")
      .filter((l) => !/^\s*(\/\/|\*)/.test(l))
      .join("\n");
    for (const m of src.matchAll(/<HelpTip\s+slug="([^"]+)"/g)) {
      used.set(m[1], path.relative(ROOT, file));
    }
  }
  check(`the "?" is wired somewhere (${used.size} places)`, used.size >= 3, [...used.keys()].join(", "));
  const unknown = [...used.entries()].filter(([slug]) => !SLUGS.includes(slug));
  check(
    "every wired slug exists in the manifest",
    unknown.length === 0,
    unknown.map(([s, f]) => `${s} (${f})`).join(", ")
  );
  // A "?" on an article that only exists in English would show every
  // non-English reader a fallback notice on a screen they use daily.
  const nonCore = [...used.keys()].filter((s) => !CORE.includes(s));
  check(
    "…and is one of the core ten, so it is translated everywhere",
    nonCore.length === 0,
    `not core: ${nonCore.join(", ")}`
  );
}

// ---------------------------------------------------------------------------
console.log("\n== 7. the page's own words, in ten languages ==");
{
  const messages = Object.fromEntries(
    LOCALES.map((l) => [l, JSON.parse(readFileSync(path.join(ROOT, "messages", `${l}.json`), "utf8"))])
  );
  const KEYS = [
    "title", "intro", "contents", "goThere", "fallbackNotice",
    "notFoundTitle", "notFoundBody", "openChat", "pricingLink",
    "answerCount", "unavailableTitle", "unavailableBody",
    "tipLabel", "tipReadMore",
  ];
  for (const key of KEYS) {
    const missing = LOCALES.filter((l) => typeof messages[l].help?.[key] !== "string");
    check(`help.${key}: present in all ten`, missing.length === 0, missing.join(", "));
  }
  const CATS = manifest.categories;
  for (const loc of LOCALES) {
    const missing = CATS.filter((c) => typeof messages[loc].help?.categories?.[c] !== "string");
    check(`${loc}: all ${CATS.length} category names`, missing.length === 0, missing.join(", "));
  }
  // Untranslated chrome is how a "multilingual" page still reads English.
  for (const key of ["title", "intro", "goThere", "fallbackNotice", "tipLabel"]) {
    const en = messages.en.help[key];
    const same = ["el", "ja", "ar", "zh"].filter((l) => messages[l].help[key] === en);
    check(`help.${key}: translated in el/ja/ar/zh`, same.length === 0, same.join(", "));
  }
  // Arabic has six plural categories. A two-branch count is wrong in four
  // of them, and no translator can fix it if the branch lives in the code.
  check(
    "answerCount is an ICU plural everywhere",
    LOCALES.every((l) => /\{count, plural,/.test(messages[l].help.answerCount))
  );
  check(
    "Arabic carries its own six plural forms",
    ["zero", "one", "two", "few", "many", "other"].every((f) =>
      new RegExp(`\\b${f} \\{`).test(messages.ar.help.answerCount)
    )
  );
}

// ---------------------------------------------------------------------------
console.log("\n== 8. the Greek array is gone, and nothing still reaches for it ==");
check(
  "src/lib/support/knowledge-base.ts no longer exists",
  !existsSync(path.join(ROOT, "src", "lib", "support", "knowledge-base.ts"))
);
{
  const offenders = [];
  const scan = (dir) => {
    for (const entry of readdirSync(dir)) {
      const p = path.join(dir, entry);
      if (statSync(p).isDirectory()) scan(p);
      else if (/\.(tsx?|mjs)$/.test(entry)) {
        // An IMPORT, not a mention. Half a dozen files explain in prose
        // what used to live in knowledge-base.ts and why it does not any
        // more — including this test — and a scan that counts those is a
        // test failing on its own documentation.
        const src = readFileSync(p, "utf8");
        if (/(from|import|require\()\s*["'`][^"'`]*support\/knowledge-base["'`]/.test(src)) {
          offenders.push(path.relative(ROOT, p));
        }
      }
    }
  };
  scan(path.join(ROOT, "src"));
  scan(path.join(ROOT, "scripts"));
  check("nothing imports it", offenders.length === 0, offenders.join(", "));
}
check(
  "the chat reads articles for the reader's locale only",
  /loadHelpArticlesForLocaleOnly\(locale\)/.test(
    readFileSync(path.join(ROOT, "src", "app", "api", "chat", "route.ts"), "utf8")
  ),
  "falling back to English here would answer a French reader in English"
);
check(
  "/help reads from the table, not from a constant",
  /loadHelpArticles\(locale\)/.test(readFileSync(path.join(ROOT, "src", "app", "help", "page.tsx"), "utf8"))
);

console.log(
  `\n${failures.length === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${failures.length} failed`
);
if (failures.length) for (const f of failures) console.log(`  - ${f}`);
process.exit(failures.length === 0 ? 0 : 1);
