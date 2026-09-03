// A DOCUMENT DOWNLOADS IN THE LANGUAGE YOU CHOOSE, AND A TRANSLATION SAYS
// ITS PRICE BEFORE IT RUNS.
//
// V4.6. Reported: "/dashboard/documents has no download at all." True of
// the list; the editor had a button. Asked for: the download on the list,
// a question before it — the document's own language or a translation —
// and, when it translates, the amount, said first.
//
// Three things are checked, and they are different kinds of check:
//
//   1. THE PURE HALF, EXECUTED. lib/documents/translation.ts decides what
//      goes to the model and what comes back. Run on real strings: the
//      title survives the round trip, a dropped marker does not rename
//      the file, a fence is stripped, the size cap is a number.
//   2. THE BILLING SHAPE OF THE ROUTE, READ. The untranslated download
//      makes no call and reserves nothing; the translated one estimates
//      from the real input, reserves before calling, records measured
//      usage, settles as document_translate, and releases on every
//      failure. The estimate route uses the SAME action and model.
//   3. THE DIALOG SAYS THE PRICE FIRST. The price sentence is rendered
//      above the download button, the button is disabled until a price
//      (or its absence) is known, and every sentence exists in all ten
//      languages.
//
// Run: node scripts/tests/documents-pdf-language.test.mjs
import { readFileSync } from "node:fs";
import { loadTs } from "./load-ts.mjs";
import { stripComments } from "../check-mutation-markers.mjs";

let pass = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { failures.push(name); console.log(`  FAIL  ${name}${detail ? "\n        " + detail : ""}`); }
}
const read = (p) => stripComments(readFileSync(p, "utf8"));

const LIB = "src/lib/documents/translation.ts";
const ROUTE = "src/app/api/documents/[id]/pdf/route.ts";
const ESTIMATE = "src/app/api/documents/[id]/pdf-estimate/route.ts";
const DIALOG = "src/components/documents/document-pdf-button.tsx";
const LIST = "src/components/documents/documents-list.tsx";
const EDITOR = "src/components/documents/document-editor.tsx";
const PROFILES = "src/lib/billing/estimate.ts";
const MARGINS = "src/lib/billing/margin-policy.ts";

const tr = await loadTs(LIB);

console.log("== 1. the pure half, on real strings ==");
{
  const input = tr.translationInput("Σχέδιο <Q3>", "<p>Γεια</p>");
  check("the title travels inside the HTML, escaped", input.startsWith('<h1 data-ionexa-title="1">Σχέδιο &lt;Q3&gt;</h1>'), input.slice(0, 60));
  check("...followed by the body untouched", input.endsWith("\n<p>Γεια</p>"));

  const back = tr.splitTranslated('<h1 data-ionexa-title="1">Plan &lt;Q3&gt;</h1>\n<p>Hello</p>', "Σχέδιο <Q3>");
  check("the translated title comes back out, unescaped", back.title === "Plan <Q3>", back.title);
  check("...and the body is what follows it", back.html === "<p>Hello</p>", back.html);

  const fenced = tr.splitTranslated('```html\n<h1 data-ionexa-title="1">Plan</h1><p>Hi</p>\n```', "x");
  check("a code fence around the answer is stripped", fenced.title === "Plan" && fenced.html === "<p>Hi</p>", JSON.stringify(fenced));

  const dropped = tr.splitTranslated("<p>Hello</p>", "Σχέδιο");
  check("a dropped marker keeps the ORIGINAL title — a filename does not change because a tag was lost",
    dropped.title === "Σχέδιο" && dropped.html === "<p>Hello</p>");
  const emptyTitle = tr.splitTranslated('<h1 data-ionexa-title="1"></h1><p>x</p>', "Fallback");
  check("an empty translated title falls back too", emptyTitle.title === "Fallback");

  check("no call when the document is already in that language", tr.needsTranslation("el", "el") === false);
  check("...and a call when it is not", tr.needsTranslation("el", "zh") === true);

  for (const code of ["en", "el", "es", "fr", "de", "it", "pt", "zh", "ja", "ar"]) {
    check(`${code} is a supported target`, tr.isSupportedTargetLocale(code));
  }
  for (const [label, v] of [["a made-up code", "xx"], ["empty", ""], ["undefined", undefined], ["a number", 7], ["null", null]]) {
    check(`${label} is not a supported target`, tr.isSupportedTargetLocale(v) === false);
  }

  check("the prompt names the target in English AND its own script", /Greek/.test(tr.translationSystemPrompt("el")) && /Ελληνικά/.test(tr.translationSystemPrompt("el")));
  check("...says to keep every tag", /Keep EVERY HTML tag/.test(tr.translationSystemPrompt("zh")));
  check("...and asks for only the HTML back", /Return ONLY the translated HTML/.test(tr.translationSystemPrompt("ar")));
  check("zh is spelled out as Simplified Chinese, so it cannot be read as another language", /Simplified Chinese/.test(tr.translationSystemPrompt("zh")));

  check(`the size cap is a real number (${tr.MAX_TRANSLATION_CHARS})`, Number.isInteger(tr.MAX_TRANSLATION_CHARS) && tr.MAX_TRANSLATION_CHARS >= 10_000 && tr.MAX_TRANSLATION_CHARS <= 200_000);
  const caps = [0, 1, -1, 1e9, NaN, Infinity, undefined].map((n) => tr.translationMaxTokens(n));
  check("max_tokens has a floor and a ceiling at every extreme", caps.every((c) => Number.isFinite(c) && c >= 1024 && c <= 16_000), caps.join(","));
  check("...and a fifteen-page document gets more room than a note", tr.translationMaxTokens(40_000) > tr.translationMaxTokens(400));
}

console.log("\n== 2. the route charges only for a translation, and only after it exists ==");
{
  const route = read(ROUTE);
  // Split at CODE, not at a comment: the comments are stripped above, and
  // the first draft of this split anchored on a sentence in one of them.
  const split = route.indexOf("if (storedHtml.length > MAX_TRANSLATION_CHARS)");
  const freePath = split > 0 ? route.slice(0, split) : "";
  const paidPath = split > 0 ? route.slice(split) : "";
  check("the route has the two paths in this order", freePath.length > 0 && paidPath.length > 0, "the size-cap check that opens the paid path was not found");
  check("the free path makes no model call", !/messages\.create/.test(freePath));
  check("...and reserves nothing", !/reserveCredits\(/.test(freePath));
  check("...and returns the PDF before the paid path is reached", /return await pdfResponse\(/.test(freePath));
  check("the free path is taken when lang is absent OR equals the document's language", /lang === null \|\| !needsTranslation\(detectedLocale, lang\)/.test(freePath));

  check("the paid path estimates from the real input", /estimateForAction\(\s*"documentTranslate"/.test(paidPath));
  check("...and reserves before calling", paidPath.indexOf("reserveCredits(") < paidPath.indexOf("messages.create"));
  check("...records measured usage", /costs\.record\("generation", response\.usage/.test(paidPath));
  check("...settles as document_translate", /feature: "document_translate"/.test(paidPath));
  check("...only after the translated blocks exist", paidPath.indexOf("htmlToBlocks(translated.html)") < paidPath.indexOf("settleReservation("));
  const releases = (paidPath.match(/releaseReservation\(/g) ?? []).length;
  check(`...and releases the hold on every failure (${releases} release sites)`, releases >= 3);
  check("an unsupported lang is refused before anything is read", route.indexOf("unsupported_language") < route.indexOf("user_documents"));
  check("an oversized document is refused before any call, naming the limit", /error: "too_long", chars: storedHtml\.length, limit: MAX_TRANSLATION_CHARS/.test(paidPath) && paidPath.indexOf("too_long") < paidPath.indexOf("messages.create"));
  check("the charge is reported back in a header the dialog reads", /X-Ionexa-Credits-Charged/.test(paidPath));
  check("the plan is always resolved, never null on a bypass", /const plan = await resolveEffectivePlan\(user\)/.test(paidPath));

  const est = read(ESTIMATE);
  check("the estimate route uses the SAME action", /estimateForAction\(\s*"documentTranslate"/.test(est));
  check("...the same model", /model: TRANSLATION_MODEL/.test(est) && /model: TRANSLATION_MODEL/.test(paidPath));
  check("...and the same input (prompt + title-marked HTML)", /translationSystemPrompt\(lang\)\.length \+ translationInput\(title, html\)\.length/.test(est));
  check("...makes no call and reserves nothing", !/messages\.create|reserveCredits\(/.test(est));
  check("...and says when no translation is needed", /needsTranslation: false/.test(est));
  check("...and when the document is too long", /tooLong: true/.test(est));

  const profiles = read(PROFILES);
  check("the documentTranslate profile exists", /documentTranslate: \{/.test(profiles));
  check("...with output tracking input (a translation is as long as its source)", /documentTranslate: \{[\s\S]*?outputCharsPerInputChar: 1\.2/.test(profiles));
  check("the feature has its own margin key", /documentTranslate: "document_translate"/.test(read(MARGINS)));
}

console.log("\n== 3. the dialog says the price before the button ==");
{
  const dialog = read(DIALOG);
  check("the price sentence is rendered", /data-testid="document-pdf-price"/.test(dialog));
  check("...above the download button", dialog.indexOf('data-testid="document-pdf-price"') < dialog.indexOf('data-testid="document-pdf-download"'));
  check("the download button is disabled until the price is known", /disabled=\{!ready\}/.test(dialog));
  check("...and 'working out the price' is not a price", /estimate\.state === "free" \|\| estimate\.state === "priced"/.test(dialog));
  check("the price comes from the estimate route, not the client", /\/pdf-estimate/.test(dialog));
  check("the download sends lang only for a translation", /\/pdf\$\{lang \? `\?lang=/.test(dialog));
  check("a translation reports what was charged from the header", /X-Ionexa-Credits-Charged/.test(dialog));
  check("...and refreshes the balance", /refreshCredits\(\)/.test(dialog));
  check("the list card menu offers the download", /<DocumentPdfButton documentId=\{doc\.id\} variant="menuItem"/.test(read(LIST)));
  check("the editor header offers it too", /<DocumentPdfButton documentId=\{doc\.id\} \/>/.test(read(EDITOR)));
  check("...and no longer bypasses the question with the plain button", !/<DownloadPdfButton/.test(read(EDITOR)));

  const LOCALES = ["en", "el", "es", "fr", "de", "it", "pt", "zh", "ja", "ar"];
  const KEYS = ["title", "inLanguage", "translateTo", "free", "sameLanguage", "estimating", "estimate", "bypassFree", "estimateFailed", "tooLong", "download", "failed", "insufficient", "charged", "chargedNothing"];
  const usedKeys = [...dialog.matchAll(/\bt\("([a-zA-Z]+)"/g)].map((m) => m[1]);
  check(`the dialog uses at least 8 translated strings (${usedKeys.length} uses)`, usedKeys.length >= 8);
  check(`the key list itself has at least 12 entries (${KEYS.length})`, KEYS.length >= 12);
  check(`every key the dialog uses is in the list (${new Set(usedKeys).size})`, usedKeys.every((k) => KEYS.includes(k)), usedKeys.filter((k) => !KEYS.includes(k)).join(", "));
  for (const locale of LOCALES) {
    const msg = JSON.parse(readFileSync(`messages/${locale}.json`, "utf8")).dashboard?.documents?.pdf ?? {};
    const missing = KEYS.filter((k) => typeof msg[k] !== "string" || msg[k].length === 0);
    check(`${locale}: all ${KEYS.length} dialog strings exist`, missing.length === 0, missing.join(", "));
    check(`${locale}: the price sentence carries the amount`, /\{count/.test(msg.estimate ?? ""), msg.estimate);
  }
}

console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${failures.length} failed`);
process.exit(failures.length === 0 ? 0 : 1);
