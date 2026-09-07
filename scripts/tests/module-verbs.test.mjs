#!/usr/bin/env node
/*
 * DOES THE VOCABULARY KNOW VERBS, OR ONLY NOUNS?
 *
 * WHERE THE QUESTION CAME FROM. "πόσο ξόδεψα" — how much did I spend —
 * scored ZERO on Finance, and not because of the alphabet: it scored zero
 * in Greek, written in Greek letters, on the module whose whole subject is
 * money. The greeklish fold shipped the same day and was working; the
 * VOCABULARY was not. The owner's question was the right one: is that one
 * gap, or is it the shape of the whole list?
 *
 * IT IS THE SHAPE OF THE WHOLE LIST, and the reason is structural rather
 * than careless. lib/ai/module-vocabulary.ts builds each module's terms
 * from three sources:
 *
 *   1. the slug            "finance"           a noun
 *   2. the TITLE, in all ten catalogues        a noun, ten times
 *   3. the FIELD LABELS, in all ten            nouns, dozens of times
 *
 * and then appends lib/ai/module-synonyms.ts. A user interface is named
 * in nouns — every title and every label on every screen of this product
 * is a noun — so a vocabulary harvested from the interface is a list of
 * nouns in ten languages and a list of verbs in none. The synonyms file is
 * the only place a verb can enter, and before this scan it carried verbs
 * for English (spend/spending/spent) and, since 2026-09-06, Greek.
 *
 * Nobody asks a question in nouns. "Expenses" is not a question. "How
 * much did I spend", "what did I sell", "what did I decide" — every real
 * question turns on its verb, and the verb is the word the vocabulary
 * did not have.
 *
 * WHAT THIS FILE MEASURES. The cross-product the owner asked for: all
 * thirteen modules x all ten languages, one verb-led question each, run
 * through the REAL selection path — buildModuleVocabulary over all ten
 * catalogues, plus synonymsFor, then scoreTerms. 130 questions, and for
 * each one the only thing asked is whether the module it is plainly about
 * scores above zero.
 *
 * NOT A TRANSLATION TEST. Each question is the ordinary way to ask that
 * thing in that language, and the assertion is about our vocabulary, not
 * about the phrasing: a question that scores is evidence the verb is
 * known, and a question that scores zero is evidence it is not.
 *
 * A RATCHET, NOT A ZERO. The baseline below is the real measured number,
 * the same instrument i18n-coverage.test.mjs uses. A brand-new check
 * asserting 130/130 on a list that has never carried a verb fails on
 * arrival and gets commented out inside a week.
 *
 * Run: node scripts/tests/module-verbs.test.mjs
 */
import { readFileSync } from "node:fs";
import { loadTs } from "./load-ts.mjs";

let pass = 0;
const failures = [];
function ok(name, cond, detail) {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    failures.push(name);
    console.log(`  FAIL  ${name}${detail !== undefined ? "\n        " + detail : ""}`);
  }
}

const cr = await loadTs("src/lib/ai/module-relevance.ts");
const cm = await loadTs("src/lib/classifier-modules.ts");
const syn = await loadTs("src/lib/ai/module-synonyms.ts");
const fold = await loadTs("src/lib/text/unicode-patterns.ts");

const LOCALES = ["en", "el", "es", "fr", "de", "it", "pt", "zh", "ja", "ar"];
const catalogues = LOCALES.map((l) => JSON.parse(readFileSync(`messages/${l}.json`, "utf8")));

// The production vocabulary, built exactly as lib/ai/module-vocabulary.ts
// builds it. Rebuilt here rather than imported because that module is a
// React-free cache with `import ... from "@/..."` aliases the loader
// cannot follow; the two are held together by the check further down that
// requires this file's catalogue count to equal that file's.
const built = cr.buildModuleVocabulary(cm.CLASSIFIER_MODULES, catalogues);
const VOCAB = new Map(
  built.map((v) => [v.slug, [...v.terms, ...syn.synonymsFor(v.slug)]])
);

// ---------------------------------------------------------------------
// The corpus. 13 modules x 10 languages, every one led by a VERB.
//
// Each question is what a person types, not what a schema calls things:
// no question below contains the module's title, because a question that
// contains the title proves only that the title is in the list.
// ---------------------------------------------------------------------
const CORPUS = {
  finance: {
    en: "how much did I spend last month",
    el: "πόσο ξόδεψα τον περασμένο μήνα",
    es: "cuánto gasté el mes pasado",
    fr: "combien ai-je dépensé le mois dernier",
    de: "wie viel habe ich letzten Monat ausgegeben",
    it: "quanto ho speso il mese scorso",
    pt: "quanto gastei no mês passado",
    zh: "我上个月花了多少钱",
    ja: "先月いくら使いましたか",
    ar: "كم أنفقت الشهر الماضي",
  },
  sales: {
    en: "who did I sell to this quarter",
    el: "σε ποιον πούλησα αυτό το τρίμηνο",
    es: "a quién le vendí este trimestre",
    fr: "à qui ai-je vendu ce trimestre",
    de: "an wen habe ich dieses Quartal verkauft",
    it: "a chi ho venduto questo trimestre",
    pt: "para quem vendi neste trimestre",
    zh: "这个季度我卖给了谁",
    ja: "今四半期は誰に売りましたか",
    ar: "لمن بعت هذا الربع",
  },
  ideas: {
    en: "what did I think up last week",
    el: "τι σκέφτηκα την περασμένη εβδομάδα",
    es: "qué se me ocurrió la semana pasada",
    fr: "qu'ai-je imaginé la semaine dernière",
    de: "was habe ich mir letzte Woche ausgedacht",
    it: "cosa ho ideato la settimana scorsa",
    pt: "o que imaginei na semana passada",
    zh: "我上周想到了什么",
    ja: "先週何を思いつきましたか",
    ar: "ماذا ابتكرت الأسبوع الماضي",
  },
  feedback: {
    en: "what have customers complained about",
    el: "για τι έχουν παραπονεθεί οι πελάτες",
    es: "de qué se han quejado los clientes",
    fr: "de quoi les clients se sont-ils plaints",
    de: "worüber haben sich Kunden beschwert",
    it: "di cosa si sono lamentati i clienti",
    pt: "do que os clientes reclamaram",
    zh: "客户投诉了什么",
    ja: "顧客は何に苦情を言いましたか",
    ar: "عن ماذا اشتكى العملاء",
  },
  trading: {
    en: "what did I trade this week",
    el: "τι συναλλαγές έκανα αυτή την εβδομάδα",
    es: "qué operé esta semana",
    fr: "qu'ai-je tradé cette semaine",
    de: "was habe ich diese Woche gehandelt",
    it: "cosa ho negoziato questa settimana",
    pt: "o que negociei esta semana",
    zh: "我这周交易了什么",
    ja: "今週は何を取引しましたか",
    ar: "ماذا تداولت هذا الأسبوع",
  },
  products: {
    en: "what did I ship this month",
    el: "τι προϊόντα κυκλοφόρησα αυτόν τον μήνα",
    es: "qué lancé este mes",
    fr: "qu'ai-je lancé ce mois-ci",
    de: "was habe ich diesen Monat veröffentlicht",
    it: "cosa ho lanciato questo mese",
    pt: "o que lancei este mês",
    zh: "我这个月发布了什么",
    ja: "今月は何をリリースしましたか",
    ar: "ماذا أطلقت هذا الشهر",
  },
  content: {
    en: "what have I published recently",
    el: "τι έχω δημοσιεύσει πρόσφατα",
    es: "qué he publicado recientemente",
    fr: "qu'ai-je publié récemment",
    de: "was habe ich kürzlich veröffentlicht",
    it: "cosa ho pubblicato di recente",
    pt: "o que publiquei recentemente",
    zh: "我最近发表了什么",
    ja: "最近何を投稿しましたか",
    ar: "ماذا نشرت مؤخرا",
  },
  competitors: {
    en: "who am I competing against",
    el: "με ποιον ανταγωνίζομαι",
    es: "contra quién compito",
    fr: "contre qui suis-je en concurrence",
    de: "mit wem konkurriere ich",
    it: "con chi sto competendo",
    pt: "com quem estou competindo",
    zh: "我在和谁竞争",
    ja: "誰と競合していますか",
    ar: "مع من أتنافس",
  },
  research: {
    en: "what have I investigated about pricing",
    el: "τι έχω ερευνήσει για την τιμολόγηση",
    es: "qué he investigado sobre precios",
    fr: "qu'ai-je recherché sur les prix",
    de: "was habe ich über Preise recherchiert",
    it: "cosa ho ricercato sui prezzi",
    pt: "o que pesquisei sobre preços",
    zh: "我研究过什么定价问题",
    ja: "価格について何を調査しましたか",
    ar: "ماذا بحثت عن التسعير",
  },
  learning: {
    en: "what did I learn this year",
    el: "τι έμαθα φέτος",
    es: "qué aprendí este año",
    fr: "qu'ai-je appris cette année",
    de: "was habe ich dieses Jahr gelernt",
    it: "cosa ho imparato quest'anno",
    pt: "o que aprendi este ano",
    zh: "我今年学到了什么",
    ja: "今年は何を学びましたか",
    ar: "ماذا تعلمت هذا العام",
  },
  decisions: {
    en: "what did I decide about hiring",
    el: "τι αποφάσισα για τις προσλήψεις",
    es: "qué decidí sobre la contratación",
    fr: "qu'ai-je décidé concernant le recrutement",
    de: "was habe ich über die Einstellung entschieden",
    it: "cosa ho deciso sulle assunzioni",
    pt: "o que decidi sobre contratações",
    zh: "关于招聘我决定了什么",
    ja: "採用について何を決めましたか",
    ar: "ماذا قررت بشأن التوظيف",
  },
  analytics: {
    en: "how many people visited the site",
    el: "πόσοι επισκέφτηκαν τον ιστότοπο",
    es: "cuántas personas visitaron el sitio",
    fr: "combien de personnes ont visité le site",
    de: "wie viele Menschen haben die Website besucht",
    it: "quante persone hanno visitato il sito",
    pt: "quantas pessoas visitaram o site",
    zh: "有多少人访问了网站",
    ja: "何人がサイトを訪れましたか",
    ar: "كم شخصا زار الموقع",
  },
  automation: {
    en: "what did I automate last quarter",
    el: "τι αυτοματοποίησα το προηγούμενο τρίμηνο",
    es: "qué automaticé el trimestre pasado",
    fr: "qu'ai-je automatisé le trimestre dernier",
    de: "was habe ich letztes Quartal automatisiert",
    it: "cosa ho automatizzato lo scorso trimestre",
    pt: "o que automatizei no trimestre passado",
    zh: "我上个季度自动化了什么",
    ja: "前四半期に何を自動化しましたか",
    ar: "ماذا أتمتت الربع الماضي",
  },
};

// ---------------------------------------------------------------------
console.log("== 1. the corpus covers what it says it covers ==");
{
  const slugs = Object.keys(CORPUS);
  ok("thirteen modules", slugs.length === 13, String(slugs.length));
  // EVERY MODULE IN THE CORPUS IS A REAL MODULE, checked against the
  // product rather than against this file. A slug renamed in
  // classifier-modules.ts would otherwise leave a question here scoring
  // against a vocabulary that no longer exists, and the count would still
  // read thirteen.
  const real = new Set(cm.CLASSIFIER_MODULES.map((m) => m.slug));
  const unknown = slugs.filter((s) => !real.has(s));
  ok("every module in the corpus exists in CLASSIFIER_MODULES", unknown.length === 0, unknown.join(", "));
  const missing = [...real].filter((s) => !slugs.includes(s));
  ok("every module in the product is in the corpus", missing.length === 0, missing.join(", "));

  const wrongLangs = slugs.filter((s) => Object.keys(CORPUS[s]).length !== LOCALES.length);
  ok("every module has all ten languages", wrongLangs.length === 0, wrongLangs.join(", "));

  // THE QUESTION MUST NOT CONTAIN THE ANSWER. A question carrying the
  // module's own title measures the title, which was never in doubt.
  const titled = [];
  for (const slug of slugs) {
    for (const [loc, q] of Object.entries(CORPUS[slug])) {
      if (q.toLowerCase().includes(slug)) titled.push(`${slug}/${loc}`);
    }
  }
  ok("no question contains its own module slug", titled.length === 0, titled.join(", "));
}

// ---------------------------------------------------------------------
console.log("\n== 2. the vocabulary this scan measures is the one production uses ==");
{
  const src = readFileSync("src/lib/ai/module-vocabulary.ts", "utf8");
  const list = (src.match(/\[\s*en,\s*el,\s*es,\s*fr,\s*de,\s*it,\s*pt,\s*zh,\s*ja,\s*ar\s*\]/) ?? [])[0];
  ok("module-vocabulary.ts still passes all ten catalogues", Boolean(list),
    "this scan builds from ten; if production narrowed, every number below is optimistic");
  ok("...and appends synonymsFor", /synonymsFor\(v\.slug\)/.test(src));
  ok("the vocabulary was actually built", VOCAB.size >= 13, `${VOCAB.size} modules`);
}

// ---------------------------------------------------------------------
console.log("\n== 3. the cross-product: 13 modules x 10 languages ==");

const results = [];
for (const slug of Object.keys(CORPUS)) {
  for (const loc of LOCALES) {
    const question = CORPUS[slug][loc];
    // scoreTerms takes the folded question and its word set — the same
    // two things selectRelevantModules hands it.
    const folded = fold.foldForMatch(question);
    const words = cr.questionWords(folded);
    const score = cr.scoreTerms(words, folded, VOCAB.get(slug) ?? []);
    results.push({ slug, loc, question, score });
  }
}

const byLocale = new Map(LOCALES.map((l) => [l, { hit: 0, total: 0 }]));
for (const r of results) {
  const b = byLocale.get(r.loc);
  b.total++;
  if (r.score > 0) b.hit++;
}

console.log("\n  locale   scored > 0   of");
for (const loc of LOCALES) {
  const b = byLocale.get(loc);
  console.log(`  ${loc.padEnd(8)} ${String(b.hit).padStart(6)}      ${b.total}`);
}

const zero = results.filter((r) => r.score === 0);
console.log(`\n  ${results.length - zero.length} of ${results.length} verb-led questions reach their own module.`);
if (zero.length) {
  console.log("\n  SCORED ZERO:");
  for (const r of zero) console.log(`    ${r.slug.padEnd(13)} ${r.loc}   "${r.question}"`);
}

// ---------------------------------------------------------------------
console.log("\n== 4. every pair, and the two that are allowed by name ==");
{
  // NOT A FLOOR. A floor of 128 lets any two pairs be the failing ones,
  // and this repository has shipped a check whose baseline was the size
  // of the problem before (docs/shapes.md). These two are named, with the
  // reason, and anything else scoring zero is red.
  //
  // WHY THESE TWO ARE NOT FIXED. Both are the Ideas module, and the verb
  // an English or Greek speaker actually reaches for is "think" /
  // "σκέφτηκα". That word is true of every module — "what do you think
  // about my sales numbers" is not a question about Ideas — so adding it
  // would make everything score, which is a slower way of selecting
  // nothing. The same rule keeps "report", "data" and "number" out of
  // `primary`. A vocabulary entry is a claim that the word means THIS
  // module and no other, and for this verb that claim is false.
  //
  // The distinctive Ideas verbs ARE listed and do work: "brainstorm",
  // "invented", "επινόησα", "συνέλαβα" all reach the module. The eight
  // other languages score because their natural verb for having an idea
  // happens to be distinctive; English and Greek are the two where it is
  // not.
  const ALLOWED_ZERO = new Map([
    ["ideas/en", "the natural verb is \"think up\", and \"think\" is true of every module"],
    ["ideas/el", "the natural verb is \"σκέφτηκα\", generic for the same reason"],
  ]);

  const unexpected = zero.filter((r) => !ALLOWED_ZERO.has(`${r.slug}/${r.loc}`));
  ok("every verb-led question reaches its module, bar the two allowed by name",
    unexpected.length === 0,
    unexpected.map((r) => `${r.slug}/${r.loc}  "${r.question}"`).join("\n        "));

  // AND THE ALLOWANCE CANNOT GO STALE. An entry that starts scoring is an
  // entry that must leave this list, or the list quietly becomes a place
  // where things are excused after they stopped needing it.
  const scored = [...ALLOWED_ZERO.keys()].filter(
    (k) => !zero.some((r) => `${r.slug}/${r.loc}` === k)
  );
  ok("no allowed-zero entry is stale", scored.length === 0,
    `these now score and should be removed from ALLOWED_ZERO: ${scored.join(", ")}`);

  const reached = results.length - zero.length;
  ok(`${reached} of ${results.length} pairs reach their module`, reached === 128, String(reached));

  // NO LANGUAGE MAY BE THE ONE THAT DOES NOT WORK. Before the verbs
  // landed, es, de, it, pt and ar each scored 0 of 13 — a feature that
  // worked in no language its own users write in. A single total hides
  // exactly that.
  const dead = LOCALES.filter((l) => byLocale.get(l).hit === 0);
  ok("no language scores zero across every module", dead.length === 0, dead.join(", "));

  const weak = LOCALES.filter((l) => byLocale.get(l).hit < 12);
  ok("every language reaches at least 12 of 13", weak.length === 0,
    weak.map((l) => `${l}=${byLocale.get(l).hit}`).join(", "));
}

console.log(`\n${failures.length === 0 ? "PASSED" : "FAILED"}: ${pass} passed, ${failures.length} failed`);
if (failures.length) {
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
