// Answering without a model — the matcher, on real article content.
//
// Three ways this feature is worse than not having it:
//   1. It answers in the WRONG LANGUAGE. The old catalogue was Greek and
//      every article also carried English triggers, so one English word
//      from a French reader returned a Greek paragraph — free, instantly,
//      with the model never called.
//   2. It answers a question about ONE ACCOUNT from a fixed string, so
//      every user is told the same thing about their own balance.
//   3. It states a price that has since changed, and the reader holds us
//      to a number nobody reviewed.
//
// (3) is enforced by the content test's digit scan. (1) and (2) are here.
//
// THE ARTICLES ARE REAL. Every fixture below is loaded from
// content/help/*.json — the same files the migration is generated from.
// A canned-answer test whose triggers were invented by the test author
// proves the matcher can match the test, which is not the question.
//
// Run: node scripts/tests/canned-answers.test.mjs
import { readFileSync } from "node:fs";
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

const { normalize, isAccountSpecific, matchHelpArticle, CONFIDENCE_THRESHOLD } = await loadTs(
  "src/lib/support/canned-answers.ts"
);

const manifest = JSON.parse(readFileSync("content/help/manifest.json", "utf8"));
const LOCALES = manifest.locales;
const CATEGORY = Object.fromEntries(manifest.articles.map((a) => [a.slug, a.category]));

function articlesFor(locale) {
  let raw;
  try {
    raw = JSON.parse(readFileSync(`content/help/${locale}.json`, "utf8")).articles;
  } catch {
    return [];
  }
  return Object.entries(raw).map(([slug, a]) => ({
    slug,
    locale,
    title: a.title,
    body: a.body,
    category: CATEGORY[slug] ?? "account",
    order: 0,
    triggers: a.triggers,
    href: null,
    isFallback: false,
  }));
}
const BY_LOCALE = Object.fromEntries(LOCALES.map((l) => [l, articlesFor(l)]));

// ---------------------------------------------------------------------------
console.log("== 1. normalize(): every script, not just the Latin one ==");
//
// THE DEFECT, MEASURED. The previous implementation stripped only
// U+0300–U+036F — the combining marks Latin and Greek decompose into after
// NFD. Arabic harakat are U+064B–U+0652 and are NOT in that range, so they
// survived the strip, were then caught by the punctuation rule, and were
// replaced with SPACES.
//
// Reproduced here rather than described, so the claim is checkable:
const OLD_NORMALIZE = (text) =>
  text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

{
  const withHarakat = "كَيْفَ";
  const without = "كيف";
  check(
    "the OLD normalize shredded Arabic into single letters (this is the before)",
    OLD_NORMALIZE(withHarakat) === "ك ي ف" && OLD_NORMALIZE(withHarakat) !== OLD_NORMALIZE(without),
    `old: ${JSON.stringify(OLD_NORMALIZE(withHarakat))} vs ${JSON.stringify(OLD_NORMALIZE(without))}`
  );
  check(
    "the new one folds harakat away, so both forms are the same word",
    normalize(withHarakat) === normalize(without) && normalize(without) === "كيف",
    `new: ${JSON.stringify(normalize(withHarakat))} vs ${JSON.stringify(normalize(without))}`
  );
}
check("Greek accents fold", normalize("Πώς ακυρώνω;") === normalize("ΠΩΣ ΑΚΥΡΩΝΩ"));
check("Greek final sigma folds to σ", normalize("τιμές") === normalize("τιμες") && normalize("ΟΔΟΣ") === "οδοσ");
check("Latin accents fold", normalize("Cómo cancelo") === normalize("como cancelo"));
check("German umlauts fold", normalize("Wie künd ich") === normalize("wie kund ich"));
check("punctuation becomes a separator, not a letter", normalize("how much?!") === "how much");
check("CJK is left intact", normalize("怎么取消订阅？") === "怎么取消订阅");

// ---------------------------------------------------------------------------
console.log("\n== 2. a question about MY account never gets a fixed answer ==");
//
// This used to exist in English and Greek only. Every other language was
// unguarded, so a reader asking about their own balance in French, German
// or Japanese could be handed the generic article about what credits are.
const PERSONAL = {
  en: ["how many credits do I have left", "my account was charged twice"],
  el: ["πόσα credits μου έχουν μείνει", "χρεώθηκα δύο φορές"],
  es: ["cuántos créditos me quedan", "mi cuenta fue cobrada dos veces"],
  fr: ["combien de crédits me reste-t-il", "j'ai été facturé deux fois"],
  de: ["wie viele Credits habe ich noch", "mein Konto wurde doppelt belastet"],
  it: ["quanti crediti mi restano", "il mio account è stato addebitato due volte"],
  pt: ["quantos créditos me restam", "a minha conta foi cobrada duas vezes"],
  zh: ["我还剩多少额度", "我的账户被扣了两次"],
  ja: ["私のクレジットはあとどれくらい", "私の請求が二重になっています"],
  ar: ["كم رصيدي المتبقي", "حسابي اتخصم مرتين"],
};
for (const loc of LOCALES) {
  for (const message of PERSONAL[loc]) {
    check(`${loc}: "${message}" is account-specific`, isAccountSpecific(message, loc) === true);
  }
}
// The other half: a genuine PRODUCT question must NOT be swept up, or the
// guard would send every question to the model and the feature would be
// dead weight that still looked alive.
const PRODUCT = {
  en: "what are credits",
  el: "τι είναι τα credits",
  es: "qué son los créditos",
  fr: "comment créer un site",
  de: "wie erstelle ich eine Website",
  it: "come si crea un sito",
  pt: "como crio um site",
  zh: "怎么做网站",
  ja: "ウェブサイトの作り方",
  ar: "كيف انشئ موقعا",
};
for (const loc of LOCALES) {
  check(`${loc}: "${PRODUCT[loc]}" is NOT account-specific`, isAccountSpecific(PRODUCT[loc], loc) === false);
}
// The substring trap the space padding exists for.
check(
  "Greek: «θέλω μουσική» is not a question about my account",
  isAccountSpecific("θελω μουσικη", "el") === false,
  "'μουσική' contains 'μου'; a substring test would call this personal"
);

// ---------------------------------------------------------------------------
console.log("\n== 3. no locale can answer for another ==");
//
// THE CROSS-PRODUCT, not a sample. Every reader locale against every
// article locale: a match may only ever come back in the reader's own
// language. The bug this replaces lived in exactly the cells a sample
// would have skipped — and the article set is Greek-heavy, so Greek is
// what leaks if the rule is wrong.
{
  let leaks = 0;
  let matched = 0;
  const ASKS = {
    en: "how much does it cost", el: "ποσο κοστιζει", es: "cuanto cuesta",
    fr: "combien ca coute", de: "was kostet es", it: "quanto costa",
    pt: "quanto custa", zh: "多少钱", ja: "いくら", ar: "كم السعر",
  };
  for (const reader of LOCALES) {
    for (const articleLocale of LOCALES) {
      const hit = matchHelpArticle(ASKS[reader], BY_LOCALE[articleLocale], reader);
      if (!hit) continue;
      matched++;
      if (hit.article.locale !== reader) leaks++;
    }
  }
  check(`${matched} matches across ${LOCALES.length}x${LOCALES.length} combinations, 0 in a foreign language`, leaks === 0, `${leaks} leaks`);
  check("…and the run was not vacuous — real matches happened", matched >= LOCALES.length, `${matched} matches`);
}

// Every locale can answer its own most common question. A locale that
// matches nothing is a locale where this feature silently does not exist.
{
  const ASKS = {
    en: "how much does it cost", el: "ποσο κοστιζει", es: "cuanto cuesta",
    fr: "combien ca coute", de: "was kostet es", it: "quanto costa",
    pt: "quanto custa", zh: "多少钱", ja: "いくら", ar: "كم السعر",
  };
  for (const loc of LOCALES) {
    const hit = matchHelpArticle(ASKS[loc], BY_LOCALE[loc], loc);
    check(
      `${loc}: "${ASKS[loc]}" -> pricing-overview`,
      hit?.article.slug === "pricing-overview",
      hit ? `got ${hit.article.slug} @ ${hit.confidence}` : "got null"
    );
  }
}

// ---------------------------------------------------------------------------
console.log("\n== 4. conservative by construction ==");
{
  const el = BY_LOCALE.el;
  check("an empty message matches nothing", matchHelpArticle("", el, "el") === null);
  check(
    "a long message is a conversation, not a lookup",
    matchHelpArticle(`ποσο κοστιζει ${"λεξη ".repeat(45)}`, el, "el") === null
  );
  const weak = matchHelpArticle(
    "σκεφτομαι να αλλαξω επαγγελμα και αναρωτιεμαι ποια ειναι η τιμη της αγορας για τετοιες υπηρεσιες σημερα",
    el,
    "el"
  );
  check("a stray product noun in a long sentence does not match", weak === null, weak ? weak.article.slug : "");
  check("the default threshold is the documented one", CONFIDENCE_THRESHOLD === 0.85);
  // A higher bar can only ever return fewer matches, never different ones.
  const loose = matchHelpArticle("ποσο κοστιζει", el, "el", 0.85);
  const strict = matchHelpArticle("ποσο κοστιζει", el, "el", 0.99);
  check(
    "raising the threshold only removes matches",
    strict === null || (loose && strict.article.slug === loose.article.slug),
    `loose=${loose?.article.slug} strict=${strict?.article.slug}`
  );
}

// ---------------------------------------------------------------------------
console.log("\n== 5. Chinese and Japanese are scored, not accidentally ignored ==");
// split(" ").length is always 1 in a language with no spaces, so every
// trigger would score as the least specific kind and nothing would ever
// clear the threshold. Length stands in for word count there.
for (const loc of ["zh", "ja"]) {
  const hits = BY_LOCALE[loc]
    .flatMap((a) => a.triggers.map((t) => matchHelpArticle(t, BY_LOCALE[loc], loc)))
    .filter(Boolean);
  check(
    `${loc}: its own triggers clear the threshold (${hits.length} of them)`,
    hits.length >= 20,
    `only ${hits.length} matched — the specificity term is collapsing`
  );
}

console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${failures.length} failed`);
if (failures.length) for (const f of failures) console.log(`  - ${f}`);
process.exit(failures.length === 0 ? 0 : 1);
