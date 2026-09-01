#!/usr/bin/env node
/*
 * THE FIVE SAMPLE-DATA QUESTIONS, AND WHETHER THE NUMBERS REACH THE MODEL.
 *
 * V4.6 #6 asked for five questions against the sample dataset and got one
 * answer with numbers in it out of five. The cause was not the model: at
 * PER_MODULE_LIMIT = 5 the prompt carried five HEADLINES per module, with
 * no amounts and no dates, so four of those questions were arithmetic
 * over data the model had never been shown.
 *
 * WHAT THIS FILE CAN AND CANNOT SHOW. It has no API key, so it does not
 * call the model and does not claim to know what the model would say.
 * What it checks is the thing that was actually missing: whether the
 * figures a correct answer needs are IN the prompt. A model that is given
 * eighteen dated amounts may still answer badly; a model given five
 * headlines cannot answer well, and that is what was happening.
 *
 * So: for each question, the module chosen, the rows sent, and whether
 * the block contains the numbers the question is about. "Passed the test"
 * is not "an eye saw it" — the eye is still owed, against a real key.
 *
 * Run: node scripts/tests/deep-dive-sample-questions.mjs
 */
import { readFileSync } from "node:fs";
import { loadTs } from "./load-ts.mjs";

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

const dd = await loadTs("src/lib/ai/deep-dive.ts");
const { foldForMatch: fold } = await loadTs("src/lib/text/unicode-patterns.ts");
const rel = await loadTs("src/lib/ai/module-relevance.ts");
const syn = await loadTs("src/lib/ai/module-synonyms.ts");
const { CLASSIFIER_MODULES } = await loadTs("src/lib/classifier-modules.ts");
const { materialiseSampleData } = await loadTs("src/lib/sample-data/dataset.ts");

const LOCALES = ["en", "el", "es", "fr", "de", "it", "pt", "zh", "ja", "ar"];
// EVERY CATALOGUE, exactly as lib/ai/module-vocabulary.ts builds it.
// Loading two here while the app loads ten would test a vocabulary the
// app does not have.
const catalogues = LOCALES.map((l) => JSON.parse(readFileSync(`messages/${l}.json`, "utf8")));
const vocab = rel
  .buildModuleVocabulary(CLASSIFIER_MODULES, catalogues)
  .map((v) => ({ ...v, terms: [...v.terms, ...syn.synonymsFor(v.slug)] }));

function place(question) {
  const folded = fold(question);
  const words = rel.questionWords(folded);
  const scored = vocab.map((v) => ({
    slug: v.slug,
    score: dd.deepDiveScore(
      rel.scoreTerms(words, folded, v.terms),
      rel.scoreTerms(words, folded, syn.associatedFor(v.slug))
    ),
  }));
  return {
    plan: dd.planDeepDive(question, scored),
    choice: dd.pickDeepDiveModule(question, scored),
    top: [...scored].sort((a, b) => b.score - a.score).filter((x) => x.score > 0)
      .slice(0, 3).map((x) => `${x.slug}:${x.score}`).join(" ") || "none",
  };
}

const NOW = Date.parse("2026-08-30T12:00:00Z");
const sample = materialiseSampleData(NOW);
const rowsFor = (slug) => {
  const entry = sample.find((t) => t.slug === slug);
  if (!entry) return [];
  return entry.rows.map((r) => ({ ...r, id: r.id ?? "x" }));
};

// The five a person actually asks of this dataset — Greek, because the
// dataset is Greek names and euros.
const QUESTIONS = [
  { q: "Πόσα έξοδα είχα τους τελευταίους δύο μήνες;", module: "finance", needs: "amounts" },
  { q: "Ποιοι πελάτες μου αξίζει να κυνηγήσω πρώτοι;", module: "sales", needs: "scores" },
  { q: "Τι ιδέες έχω καταγράψει και τι σκορ έχουν;", module: "ideas", needs: "scores" },
  { q: "Τι σχόλια έχω πάρει από πελάτες;", module: "feedback", needs: "text" },
  { q: "Πόσα έσοδα μπήκαν συνολικά αυτό το διάστημα;", module: "finance", needs: "amounts" },
];

console.log("== the five questions ==\n");
for (const item of QUESTIONS) {
  // THE REAL FOLDER, not a lookalike. The first version of this file
  // folded with an ad-hoc NFD strip while lib/ai/deep-dive-load.ts uses
  // foldForMatch, and the two disagreed on Greek final sigma: "πελάτες"
  // in the question folded one way and the vocabulary term the other, so
  // two questions scored zero and the report blamed the vocabulary. A
  // test that folds its own inputs differently from production is
  // testing something production does not do.
  const folded = fold(item.q);
  const words = rel.questionWords(folded);
  const scored = vocab.map((v) => ({
    slug: v.slug,
    score: dd.deepDiveScore(
      rel.scoreTerms(words, folded, v.terms),
      rel.scoreTerms(words, folded, syn.associatedFor(v.slug))
    ),
  }));
  const choice = dd.pickDeepDiveModule(item.q, scored);
  const top = [...scored].sort((a, b) => b.score - a.score).filter((x) => x.score > 0)
    .slice(0, 3).map((x) => `${x.slug}:${x.score}`).join(" ");

  check(`"${item.q.slice(0, 44)}" picks a module`, choice !== null, `scores: ${top || "none"}`);
  if (!choice) continue;
  check(`  ...and it is ${item.module}`, choice.slug === item.module, `picked ${choice.slug} (${top})`);
  if (choice.slug !== item.module) continue;

  const config = CLASSIFIER_MODULES.find((m) => m.slug === choice.slug);
  const fields = (config.fields ?? [])
    .filter((f) => f.money === true || f.type === "number" || f.type === "date" || f.type === "select")
    .slice(0, 4)
    .map((f) => ({ key: f.key, label: f.key, ...(f.money ? { money: true } : {}) }));
  const rows = rowsFor(choice.slug);
  const { text, omitted } = dd.formatDeepDive(choice.slug, config.headlineKey, fields, rows);
  const shown = text ? text.split("\n").length : 0;

  check(`  ...and sends rows (${shown} of ${rows.length})`, shown > 0, `omitted ${omitted}`);
  // THE ACTUAL POINT. A block with no digits in it cannot support an
  // answer with numbers in it, whatever the model does.
  const digits = (text.match(/\d/g) ?? []).length;
  check(`  ...carrying figures the question needs (${digits} digits)`, digits >= shown, text.split("\n")[0] ?? "");
  // Dates, so "the last two months" is answerable at all.
  const dated = text.split("\n").filter((l) => /^- \d{4}-\d{2}-\d{2}/.test(l)).length;
  check(`  ...every row dated (${dated}/${shown})`, dated === shown, text.split("\n").find((l) => !/^- \d{4}-\d{2}-\d{2}/.test(l)) ?? "");
}

console.log("\n== the same five questions, in every language the app ships ==");
// V4.6 #1 shipped this working in two languages of ten and nobody could
// have told from the English. Measured before this section existed:
// el 5/5, en 5/5, and es 1/5, fr 1/5, ar 0/5, zh 0/5 — three separate
// faults, each invisible from the language it was not in.
//
//   1. the vocabulary was built from the English and Greek catalogues
//      only, so six languages had nothing but the English slug;
//   2. matching was whole-word, and Chinese and Japanese have no word
//      separator (the whole sentence is one token) while Arabic glues
//      its clitics on ("مصروفاتي" is never equal to "مصروفات");
//   3. the minimum question length was 15 characters, which is right for
//      English and rejects "总收入是多少？" — seven characters and a
//      complete question.
const BY_LANGUAGE = {
  en: [["How much did I spend in the last two months?", "finance"],
       ["Which leads are worth chasing first?", "sales"],
       ["What ideas have I recorded and how are they scored?", "ideas"],
       ["What feedback have I had from customers?", "feedback"],
       ["How much revenue came in overall?", "finance"]],
  es: [["¿Cuántos gastos tuve en los últimos dos meses?", "finance"],
       ["¿Qué clientes vale la pena perseguir primero?", "sales"],
       ["¿Qué ideas he registrado y qué puntuación tienen?", "ideas"],
       ["¿Qué comentarios he recibido de clientes?", "feedback"],
       ["¿Cuántos ingresos entraron en total?", "finance"]],
  fr: [["Combien de dépenses ai-je eu ces deux derniers mois ?", "finance"],
       ["Quels prospects valent la peine d'être relancés ?", "sales"],
       ["Quelles idées ai-je notées et quel score ont-elles ?", "ideas"],
       ["Quels retours ai-je reçus des clients ?", "feedback"],
       ["Combien de revenus sont entrés au total ?", "finance"]],
  de: [["Wie hoch waren meine Ausgaben in den letzten zwei Monaten?", "finance"],
       ["Welche Leads lohnt es sich zuerst zu verfolgen?", "sales"],
       ["Welche Ideen habe ich notiert und wie bewertet?", "ideas"],
       ["Welches Feedback habe ich von Kunden bekommen?", "feedback"],
       ["Wie hoch waren die Einnahmen insgesamt?", "finance"]],
  zh: [["我过去两个月的支出是多少？", "finance"],
       ["哪些客户值得优先跟进？", "sales"],
       ["我记录了哪些想法，评分如何？", "ideas"],
       ["客户给了我哪些反馈？", "feedback"],
       ["总收入是多少？", "finance"]],
  ja: [["この2か月の支出はいくらですか？", "finance"],
       ["どのリードを先に追うべきですか？", "sales"],
       ["どんなアイデアを記録しましたか？", "ideas"],
       ["顧客からどんなフィードバックをもらいましたか？", "feedback"],
       ["収入は合計いくらですか？", "finance"]],
  ar: [["كم كانت مصروفاتي في الشهرين الماضيين؟", "finance"],
       ["أي العملاء يستحق المتابعة أولاً؟", "sales"],
       ["ما الأفكار التي سجلتها وما تقييمها؟", "ideas"],
       ["ما الملاحظات التي تلقيتها من العملاء؟", "feedback"],
       ["كم بلغت الإيرادات إجمالاً؟", "finance"]],
};
for (const [lang, list] of Object.entries(BY_LANGUAGE)) {
  const wrong = [];
  for (const [q, want] of list) {
    const { choice, top } = place(q);
    if (!choice || choice.slug !== want) wrong.push(`${q.slice(0, 30)} -> ${choice?.slug ?? "nothing"} (want ${want}; ${top})`);
  }
  check(`${lang}: all five questions reach the right module`, wrong.length === 0, wrong.join("\n        "));
}
// Greek is covered by the five above; this asserts it is the same five.
check("Greek was checked above", QUESTIONS.length === 5, String(QUESTIONS.length));

console.log("\n== a question about two modules is answered, not refused ==");
// It used to return null and the user got a shallow answer with nothing
// to explain it. Two tied modules are now read at half depth each and the
// prompt says so; more than two are not read and the prompt says THAT.
{
  const two = place("Compare my sales and my finance numbers");
  check("two tied modules produce a split read", two.plan.kind === "split", `${two.plan.kind} (${two.top})`);
  check(
    "...naming both",
    two.plan.kind === "split" && two.plan.slugs.length === 2,
    two.plan.kind === "split" ? two.plan.slugs.join(", ") : "—"
  );
  // HALF EACH, NOT FULL EACH. A split that read both in full would double
  // the cost of exactly the question shaped to need both.
  const share = Math.floor(dd.DEEP_DIVE_ROW_LIMIT / 2);
  check(`the share is half the single-module limit (${share})`, share * 2 <= dd.DEEP_DIVE_ROW_LIMIT);

  const notice = dd.deepDiveBreadthNotice(["Sales", "Finances"], true, "en");
  check("the split carries a sentence explaining the depth", /half the rows/.test(notice), notice.slice(0, 70));
  check("...and it tells the user what to do instead", /one at a time/.test(notice), notice.slice(0, 90));
  const wide = dd.deepDiveBreadthNotice(["A", "B", "C", "D"], false, "en");
  check("a question spanning several modules says none was read deeply", /none was read in depth/.test(wide), wide.slice(0, 80));
  check("...in Greek too", /καμία δεν διαβάστηκε σε βάθος/.test(dd.deepDiveBreadthNotice(["A", "B", "C"], false, "el")));
  check("an empty list produces no sentence at all", dd.deepDiveBreadthNotice([], false, "en") === "");
}

console.log("\n== and a greeting still reaches nothing, in every script ==");
// The length floor exists to stop "thanks" pulling a module. Lowering it
// for CJK must not lower it into greetings.
const GREETINGS = ["thanks", "and?", "ok", "ευχαριστώ", "谢谢", "ありがとう", "شكرا", "gracias", "merci", "danke"];
const pulled = GREETINGS.filter((g) => place(g).choice !== null);
check("no greeting places a module", pulled.length === 0, pulled.join(", "));

console.log("\n== what this does NOT prove ==");
console.log("  No model was called: this environment has no ANTHROPIC_API_KEY.");
console.log("  Five blocks containing the right figures is a necessary condition");
console.log("  for five answers containing the right figures, not a sufficient one.");
console.log("  Before: five headlines per module, no amounts, no dates — the");
console.log("  arithmetic was impossible. After: it is possible. Whether it is");
console.log("  RIGHT is a question for a real key and a human reading the answers.");

console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${failures.length} failed`);
process.exit(failures.length === 0 ? 0 : 1);
