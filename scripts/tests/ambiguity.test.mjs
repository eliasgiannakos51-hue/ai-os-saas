#!/usr/bin/env node
/*
 * THE FREE AMBIGUITY DETECTOR, MEASURED AGAINST A LABELLED SET.
 *
 * V5 item 6 asks for "a classifier that decides ambiguous BEFORE it
 * spends". lib/clarification.ts already decides ambiguity and is a Sonnet
 * call — a paid model call made in order to decide whether to make a paid
 * model call — so it cannot be the answer to that sentence however well
 * it is tuned. lib/ai/ambiguity.ts is free, synchronous and has no key.
 *
 * THE TWO ERRORS ARE NOT EQUAL, and everything here follows from that.
 *
 *   Calling a CLEAR request vague interrogates somebody who was already
 *   perfectly understandable. They wanted an answer and got a form. This
 *   is the error that makes people hate the feature, and the gate holds
 *   it at ZERO.
 *
 *   Calling a VAGUE request unsure costs one small model call — the exact
 *   call the product makes today, on every request. That is not a
 *   regression, it is the status quo, so it is a ratchet and not a zero.
 *
 * So: precision on "vague" must be perfect, recall is a number that may
 * only go up. A detector tuned the other way would look better on a
 * single accuracy figure and be worse to use.
 *
 * THE CORPUS IS THE CROSS-PRODUCT, not a sample: ten languages, both
 * classes, every one written as somebody would actually type it. The
 * clear half is deliberately full of SHORT requests, because a length
 * check dressed up as a classifier passes any corpus whose clear examples
 * are all long.
 *
 * Run: node scripts/tests/ambiguity.test.mjs
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

const amb = await loadTs("src/lib/ai/ambiguity.ts");

// ---------------------------------------------------------------------
// VAGUE: a person who has not said what they want. One bare command and
// one placeholder request per language.
// ---------------------------------------------------------------------
const VAGUE = {
  en: ["do it", "make me something"],
  el: ["κάνε το", "φτιάξε μου κάτι"],
  es: ["hazlo", "hazme algo"],
  fr: ["fais-le", "fais-moi quelque chose"],
  de: ["mach es", "mach mir irgendwas"],
  it: ["fallo", "fammi qualcosa"],
  pt: ["faz isso", "faz alguma coisa"],
  zh: ["做吧", "随便做点东西"],
  ja: ["やって", "何か作って"],
  ar: ["افعلها", "اصنع لي شيء ما"],
};

// ---------------------------------------------------------------------
// CLEAR: real requests. Every one is SHORT — three to six words — because
// that is the case a naive detector gets wrong, and getting it right is
// the whole claim.
// ---------------------------------------------------------------------
const CLEAR = {
  en: [
    "cancel my subscription",
    "show last month expenses",
    "write a privacy policy",
    // CONTAINS "fix it", and is not remotely ambiguous. Here because a
    // bare-command test that matches substrings instead of whole
    // utterances calls this vague, and nothing else in the corpus can
    // tell the two rules apart.
    "fix it so the header stops overlapping the nav",
  ],
  el: ["ακύρωσε τη συνδρομή μου", "δείξε τα έξοδα Μαρτίου", "γράψε πολιτική απορρήτου"],
  es: ["cancela mi suscripción", "muestra los gastos de marzo", "escribe una política de privacidad"],
  fr: ["annule mon abonnement", "montre les dépenses de mars", "écris une politique de confidentialité"],
  de: ["kündige mein Abonnement", "zeige die Ausgaben im März", "schreibe eine Datenschutzerklärung"],
  it: ["annulla il mio abbonamento", "mostra le spese di marzo", "scrivi una privacy policy"],
  pt: ["cancela a minha subscrição", "mostra as despesas de março", "escreve uma política de privacidade"],
  zh: ["取消我的订阅", "显示三月的支出", "写一份隐私政策"],
  ja: ["サブスクを解約して", "三月の支出を見せて", "プライバシーポリシーを書いて"],
  ar: ["ألغِ اشتراكي", "أظهر مصروفات مارس", "اكتب سياسة خصوصية"],
};

const LOCALES = Object.keys(VAGUE);

// ---------------------------------------------------------------------
console.log("== 1. the corpus is the cross-product it claims to be ==");
{
  ok("ten languages", LOCALES.length === 10, String(LOCALES.length));
  ok("both classes cover all ten",
    LOCALES.every((l) => VAGUE[l]?.length >= 2 && CLEAR[l]?.length >= 3),
    LOCALES.filter((l) => !(VAGUE[l]?.length >= 2 && CLEAR[l]?.length >= 3)).join(", "));

  // THE CLEAR HALF MUST BE SHORT, or this measures a length check. Any
  // clear example long enough to trip CLEARLY_ENOUGH_WORDS on its own
  // proves nothing about the detector.
  const tooLong = [];
  for (const l of LOCALES) {
    for (const q of CLEAR[l]) {
      const a = amb.assessAmbiguity(q);
      if (a.reasons.includes("long")) tooLong.push(`${l}: "${q}"`);
    }
  }
  ok("no clear example passes merely by being long", tooLong.length === 0, tooLong.join("\n        "));
}

// ---------------------------------------------------------------------
console.log("\n== 2. the error that must be zero: a clear request called vague ==");
{
  const wrong = [];
  const byLocale = new Map(LOCALES.map((l) => [l, { asked: 0, total: 0 }]));
  for (const l of LOCALES) {
    for (const q of CLEAR[l]) {
      const a = amb.assessAmbiguity(q);
      const b = byLocale.get(l);
      b.total++;
      if (a.verdict === "vague") {
        b.asked++;
        wrong.push(`${l}: "${q}" -> ${a.reasons.join(",")}`);
      }
    }
  }
  console.log("\n  locale   clear requests wrongly called vague   of");
  for (const l of LOCALES) {
    const b = byLocale.get(l);
    console.log(`  ${l.padEnd(8)} ${String(b.asked).padStart(10)}                        ${b.total}`);
  }
  console.log("");
  ok("no clear request is ever called vague", wrong.length === 0, wrong.join("\n        "));
}

// ---------------------------------------------------------------------
console.log("\n== 3. how much of the vague half is caught for free ==");
{
  const caught = [];
  const deferred = [];
  const byLocale = new Map(LOCALES.map((l) => [l, { hit: 0, total: 0 }]));
  for (const l of LOCALES) {
    for (const q of VAGUE[l]) {
      const a = amb.assessAmbiguity(q);
      const b = byLocale.get(l);
      b.total++;
      if (a.verdict === "vague") {
        b.hit++;
        caught.push(q);
      } else {
        deferred.push(`${l}: "${q}" -> ${a.verdict} (${a.reasons.join(",")})`);
      }
      // AND NEVER "clear". Deferring a vague request costs a model call;
      // calling it CLEAR sends it straight to generation, which is the
      // behaviour this whole item exists to remove.
      ok(`${l}: "${q}" is not called clear`, a.verdict !== "clear", a.reasons.join(","));
    }
  }
  console.log("\n  locale   vague requests caught for free   of");
  for (const l of LOCALES) {
    const b = byLocale.get(l);
    console.log(`  ${l.padEnd(8)} ${String(b.hit).padStart(8)}                       ${b.total}`);
  }
  const total = LOCALES.reduce((n, l) => n + byLocale.get(l).total, 0);
  console.log(`\n  ${caught.length} of ${total} vague requests decided WITHOUT a model call.`);
  if (deferred.length) {
    console.log("  deferred to the paid check (not an error, just a cost):");
    for (const d of deferred) console.log(`    ${d}`);
  }

  // A RATCHET. Recorded 2026-09-07; it may only go up. Deferring is the
  // status quo, so a miss here is not a regression — but a detector that
  // quietly stops catching anything is, and a bare number is how that
  // goes unnoticed.
  const FLOOR = 20;
  ok(`at least ${FLOOR} of ${total} vague requests are caught for free`,
    caught.length >= FLOOR, String(caught.length));
}

// ---------------------------------------------------------------------
console.log("\n== 4. context changes the answer, because it changes the meaning ==");
{
  // "continue" with four turns behind it is the clearest thing a person
  // can say. Without context it is a request to continue what.
  ok("a bare command with no context is vague",
    amb.assessAmbiguity("continue").verdict === "vague");
  ok("...and the same words after a conversation are clear",
    amb.assessAmbiguity("continue", { hasContext: true }).verdict === "clear");
  ok("Greek behaves the same way",
    amb.assessAmbiguity("συνέχισε").verdict === "vague" &&
      amb.assessAmbiguity("συνέχισε", { hasContext: true }).verdict === "clear");
}

// ---------------------------------------------------------------------
console.log("\n== 5. specificity outranks brevity ==");
{
  // The five-word request that a length check gets wrong.
  const cases = [
    ["invoice Acme 4200 for March", "number"],
    ["fix https://example.com/pricing", "url"],
    ['rename it to "Q3 plan"', "quoted"],
    ["email hello@example.com", "email"],
    ["update the Stripe webhook", "propernoun"],
  ];
  for (const [q, why] of cases) {
    const a = amb.assessAmbiguity(q);
    ok(`"${q}" is clear (${why})`, a.verdict === "clear", `${a.verdict}: ${a.reasons.join(",")}`);
  }
  // AND THE NEGATIVE CONTROL: strip the specific part and the same shape
  // stops being clear. Without this the checks above would pass for a
  // function that returns "clear" unconditionally.
  ok("...and without the specific part it is not clear",
    amb.assessAmbiguity("do it").verdict === "vague",
    "the specificity checks would pass for a function that always says clear");
}

// ---------------------------------------------------------------------
console.log("\n== 6. only the middle costs money ==");
{
  // A GENUINELY CLEAR ONE, which needs a specificity signal. The first
  // draft used "cancel my subscription" and that is `unsure`: three
  // ordinary words, no number, no name, nothing to be confident about
  // either way. Deferring it is correct behaviour — the assertion was
  // wrong, not the detector.
  const clear = amb.assessAmbiguity("invoice Acme 4200 for March");
  const vague = amb.assessAmbiguity("do it");
  const unsure = amb.assessAmbiguity("write a plan");
  ok("a clear verdict does not pay for the model check", !amb.needsPaidClarityCheck(clear));
  ok("a vague verdict does not pay for it either", !amb.needsPaidClarityCheck(vague));
  ok("only unsure does", unsure.verdict !== "unsure" || amb.needsPaidClarityCheck(unsure));
  ok("...and unsure is reachable at all", unsure.verdict === "unsure",
    `"write a plan" -> ${unsure.verdict}; if nothing is ever unsure the paid check is dead code`);
}

// ---------------------------------------------------------------------
console.log("\n== 7. the cues are written for matching, in every language ==");
{
  const src = readFileSync("src/lib/ai/ambiguity.ts", "utf8");
  // Each list must carry every locale, and the marker comments are how
  // that is checkable — a list that quietly covers three languages is the
  // defect this whole week has been about.
  for (const list of ["BARE_COMMANDS", "PLACEHOLDERS"]) {
    const block = src.slice(src.indexOf(`const ${list}`), src.indexOf("];", src.indexOf(`const ${list}`)));
    const marked = LOCALES.filter((l) => new RegExp(`//\\s*${l}\\b`).test(block));
    ok(`${list} carries all ten languages`, marked.length === 10,
      `missing: ${LOCALES.filter((l) => !marked.includes(l)).join(", ")}`);
  }
  ok("the module folds with the shared fold, not its own regex",
    /from "@\/lib\/text\/unicode-patterns"/.test(src) && /foldForMatch/.test(src));
  // \b IS ASCII — the lesson this repository has paid for four times.
  ok("no ASCII word boundary is used to bound a cue",
    !/\\b/.test(src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "")),
    "\\b does not match the edge of a Greek or Arabic word");
}

// ---------------------------------------------------------------------
console.log("\n== 8. at most ONE question, and the paid check is skipped when it can be ==");
{
  const client = await loadTs("src/lib/clarification-client.ts");
  ok("the cap is one question", client.MAX_CLARIFICATION_QUESTIONS === 1,
    String(client.MAX_CLARIFICATION_QUESTIONS));

  // BEHAVIOUR, not the constant. A cap that is not applied is a number in
  // a file: parseClarificationResult must actually trim.
  const trimmed = client.parseClarificationResult({
    needsClarification: true,
    questions: [
      { question: "What is the business called?", suggestions: ["Acme"] },
      { question: "What colour scheme?", suggestions: ["dark"] },
      { question: "How many pages?", suggestions: ["three"] },
    ],
  });
  ok("...and three questions come back as one",
    trimmed.needsClarification === true && trimmed.questions.length === 1,
    `${trimmed.needsClarification ? trimmed.questions.length : "needsClarification=false"}`);
  ok("...keeping the first one with its suggestions",
    trimmed.needsClarification === true &&
      trimmed.questions[0].startsWith("What is the business") &&
      trimmed.suggestions[0].length === 1);

  // THE SHORT-CIRCUIT, read from source: checkNeedsClarification must
  // consult the free assessment before it constructs an Anthropic client,
  // or "decides before spending" is not true of the path that runs.
  const src = readFileSync("src/lib/clarification.ts", "utf8");
  const assessAt = src.indexOf("assessAmbiguity(userText");
  const clientAt = src.indexOf("new Anthropic({ apiKey })");
  ok("the free assessment runs before the API client is built",
    assessAt !== -1 && clientAt !== -1 && assessAt < clientAt,
    "the paid call is constructed first, so nothing is saved");
  ok("...and a clear verdict returns without calling the model",
    /assessment\.verdict === "clear"\)\s*return \{ needsClarification: false \}/.test(src));
}

console.log(`\n${failures.length === 0 ? "PASSED" : "FAILED"}: ${pass} passed, ${failures.length} failed`);
if (failures.length) {
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
