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

const en = JSON.parse(readFileSync("messages/en.json", "utf8"));
const el = JSON.parse(readFileSync("messages/el.json", "utf8"));
const vocab = rel
  .buildModuleVocabulary(CLASSIFIER_MODULES, [en, el])
  .map((v) => ({ ...v, terms: [...v.terms, ...syn.synonymsFor(v.slug)] }));

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

console.log("\n== what this does NOT prove ==");
console.log("  No model was called: this environment has no ANTHROPIC_API_KEY.");
console.log("  Five blocks containing the right figures is a necessary condition");
console.log("  for five answers containing the right figures, not a sufficient one.");
console.log("  Before: five headlines per module, no amounts, no dates — the");
console.log("  arithmetic was impossible. After: it is possible. Whether it is");
console.log("  RIGHT is a question for a real key and a human reading the answers.");

console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${failures.length} failed`);
process.exit(failures.length === 0 ? 0 : 1);
