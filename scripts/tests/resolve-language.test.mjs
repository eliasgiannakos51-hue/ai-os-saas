// WHICH LANGUAGE THE AI ANSWERS IN — from the text, not the settings.
//
// The bug: every AI surface sent `language: locale`, the INTERFACE
// language. A Greek topic typed into an English UI produced an English
// report. Two routes had it identically (api/research, api/files/ask),
// which is the tell that it was a shared assumption rather than a slip.
//
// What this file holds the fix to:
//   1. the four scripts that CAN be decided are decided
//   2. the six Latin locales fall back rather than guess (documented,
//      not an accident — see resolve-language.ts's header)
//   3. Latin brand names inside non-Latin text do not flip the answer
//   4. Japanese is not called Chinese, which the first version did
//   5. every route that takes user text and asks an AI to reply uses it
//
// Run: node scripts/tests/resolve-language.test.mjs
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { loadTs } from "./load-ts.mjs";

let pass = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    failures.push(name);
    console.log(`  FAIL  ${name}${detail !== undefined ? "\n        " + detail : ""}`);
  }
}
function eq(name, actual, expected) {
  check(`${name} → ${actual}`, actual === expected, `expected ${expected}, got ${actual}`);
}

const { resolveLanguage } = await loadTs("src/lib/text/resolve-language.ts");

console.log("== 1. the scripts that decide themselves ==");
eq("a Greek topic, English UI", resolveLanguage("Ποια είναι η αγορά ηλιακών πάνελ στην Ελλάδα;", "en"), "el");
eq("an Arabic topic, English UI", resolveLanguage("سوق الطاقة الشمسية في مصر", "en"), "ar");
eq("a Chinese topic, English UI", resolveLanguage("中国太阳能市场", "en"), "zh");
eq("a Japanese topic, English UI", resolveLanguage("日本の太陽光発電市場", "en"), "ja");

console.log("\n== 2. Japanese is not Chinese ==");
// THE BUG THE FIRST VERSION HAD. 日本の太陽光発電市場 is nine Han
// characters and ONE kana. Counting kana and Han as rival scripts and
// taking whichever has more made ordinary Japanese resolve to Chinese.
// Kana PRESENCE is the tell, not kana share — Chinese uses none at all.
eq("mostly-kanji Japanese is still Japanese", resolveLanguage("日本の太陽光発電市場", "en"), "ja");
eq("one kana in a long kanji string still says Japanese",
  resolveLanguage("東京証券取引所の株価指数の推移", "en"), "ja");
eq("kana-only is Japanese", resolveLanguage("ひらがなだけのぶんしょう", "en"), "ja");
eq("Han with no kana at all is Chinese", resolveLanguage("上海证券交易所股票指数", "en"), "zh");

console.log("\n== 3. Latin fragments inside non-Latin text do not flip it ==");
// Brand names, tickers and model numbers live inside every real topic.
// "Έρευνα για Nvidia RTX 6090" is half Latin letters and unambiguously
// Greek — the threshold is deliberately low, and asymmetric, because the
// reverse (Greek words inside an English topic) does not happen.
eq("Greek with a Latin brand name", resolveLanguage("Έρευνα για Nvidia RTX 6090", "en"), "el");
eq("Greek with a long Latin tail",
  resolveLanguage("Ανάλυση για Tesla Model Y Long Range Performance Edition", "en"), "el");
eq("Japanese with a Latin brand", resolveLanguage("トヨタ の Prius", "en"), "ja");

console.log("\n== 4. a stray non-Latin symbol is not a language ==");
// A single Greek letter in an English sentence is a symbol (μ for micro,
// Δ for delta, π). Matching "is there a Greek letter" rather than "how
// much of this is Greek" would answer 'el' for a physics question.
eq("the micro sign in an English sentence", resolveLanguage("The μ symbol in physics", "en"), "en");
eq("delta in an English sentence", resolveLanguage("What does Δ mean in options trading?", "en"), "en");

console.log("\n== 5. Latin script falls back, and does NOT guess ==");
// The honest half. en/es/fr/de/it/pt share an alphabet; a short topic
// cannot separate them reliably, and a confident wrong guess is worse
// than the language the user actually chose in settings.
eq("a French topic with a French UI stays French",
  resolveLanguage("Marché des panneaux solaires", "fr"), "fr");
eq("...and with an English UI does NOT become French",
  resolveLanguage("Marché des panneaux solaires", "en"), "en");
eq("a Spanish topic with a German UI stays German",
  resolveLanguage("Mercado de paneles solares", "de"), "de");
eq("plain English", resolveLanguage("Solar panel market in Greece", "en"), "en");

console.log("\n== 6. it never returns something a prompt cannot use ==");
eq("empty text keeps the UI locale", resolveLanguage("", "el"), "el");
eq("digits and symbols only keep the UI locale", resolveLanguage("2026 ROI 15% +/-", "el"), "el");
eq("an unsupported UI locale becomes en", resolveLanguage("test", "xx-YY"), "en");
eq("an empty UI locale becomes en", resolveLanguage("test", ""), "en");
eq("both empty becomes en", resolveLanguage("", ""), "en");
check("a non-string text does not throw", (() => {
  try { return resolveLanguage(undefined, "el") === "el"; } catch { return false; }
})());

console.log("\n== 7. every returned value is a real locale ==");
const constants = readFileSync("src/i18n/constants.ts", "utf8");
const supported = [...constants.matchAll(/"([a-z]{2})"/g)].map((m) => m[1]);
const samples = [
  "Ποια είναι η αγορά;", "سوق الطاقة", "中国市场", "日本の市場",
  "Solar market", "", "2026", "Marché",
];
const returned = [...new Set(samples.map((s) => resolveLanguage(s, "en")))];
check("every value this function can return is in SUPPORTED_LOCALES",
  returned.every((l) => supported.includes(l)),
  `returned ${returned.join(", ")} · supported ${supported.join(", ")}`);

console.log("\n== 8. THE ROUTES: user text in, AI reply out, resolved ==");
// Not a hand-kept list of "routes I remembered": every route that reads
// a `language` off the request body is asking the question this function
// answers, so every one of them has to call it. A new route that copies
// the old `body.language` pattern is caught here rather than shipping
// with the bug this file exists to close.
function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const p = path.join(dir, entry);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(p)) out.push(p);
  }
  return out;
}
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
const ROUTES = walk("src/app/api").map((f) => f.split(path.sep).join("/"));
// WIDENED, not narrowed. `body.language` is the shape this check was
// written for, but a route that renamed the field to replyLanguage or
// outputLanguage would answer in the interface locale just as wrongly and
// slip straight past. Neither name is in use today, so adding them costs
// nothing now and closes the rename that would otherwise look like a fix.
//
// A route whose `language` is a PROGRAMMING language (api/coding/run) is
// not exempted here — it calls the field `codeLanguage`, because two
// different meanings behind one field name is exactly how somebody later
// wires it into resolveLanguage.
const readsBodyLanguage = ROUTES.filter((f) =>
  /body\??\.(language|replyLanguage|outputLanguage)\b/.test(stripComments(readFileSync(f, "utf8")))
);
console.log(`        ${readsBodyLanguage.length} routes read a language off the request body`);

// ONE documented exception, stated rather than silently skipped.
//
// api/insights/generate takes NO user text at all — its body is an
// importId, and the findings it narrates are computed from the user's
// own records (lib/insights/detectors.ts) rather than from anything
// typed. There is no text to resolve against, so the interface language
// is not a fallback there, it is the correct and only answer.
//
// Anything added to this list needs the same kind of reason: "this route
// genuinely has no user-written text", not "this route was awkward".
const NO_USER_TEXT = ["src/app/api/insights/generate/route.ts"];
for (const f of NO_USER_TEXT) {
  check(`${f} is excluded, and still exists to be excluded`, ROUTES.includes(f));
  check("...and genuinely takes no user-authored text",
    !/body\?\.(text|question|topic|prompt|message)\b/.test(stripComments(readFileSync(f, "utf8"))));
}

const notResolved = readsBodyLanguage
  .filter((f) => !NO_USER_TEXT.includes(f))
  .filter((f) => !/resolveLanguage\(/.test(stripComments(readFileSync(f, "utf8"))));
check("every route that reads body.language resolves it against the user's text",
  notResolved.length === 0, notResolved.join("\n        "));

check("api/research is one of them", readsBodyLanguage.includes("src/app/api/research/route.ts"));
check("api/files/ask is one of them", readsBodyLanguage.includes("src/app/api/files/ask/route.ts"));

console.log("\n== 9. mutation test — section 8 can actually go red ==");
{
  const src = readFileSync("src/app/api/research/route.ts", "utf8");
  const mutated = src.replace(
    /const language = resolveLanguage\(topicCheck\.topic, uiLocale\);/,
    "const language = uiLocale;"
  );
  check("the mutation removed the call (sanity check on the mutation itself)",
    mutated !== src && !/resolveLanguage\(/.test(stripComments(mutated)),
    mutated === src ? "regex matched nothing — it is stale" : undefined);
  check("...and with it reverted to the UI locale, section 8 would fail",
    /body\?\.language|body\.language/.test(stripComments(mutated)) &&
    !/resolveLanguage\(/.test(stripComments(mutated)));
}

console.log("\n== no prompt decides the user's language FOR them ==");
// Every one of these is a system prompt written in Greek. That is fine —
// the prompt is instructions to the model, not text the user sees. What
// is NOT fine is a Greek prompt with no rule about the ANSWER's language:
// the model follows the prompt's language, so a German user's mission
// plan came back in Greek, and the weekly reflection said outright
// "Απάντα στα ελληνικά" ("answer in Greek") for all ten locales.
{
  const { readFileSync } = await import("node:fs");
  // file -> the rule that must be present
  const PROMPTS = [
    ["src/lib/mission-agents.ts", "PLANNER_SYSTEM_PROMPT", /ΣΤΗΝ ΙΔΙΑ ΓΛΩΣΣΑ που είναι γραμμένος ο στόχος/],
    ["src/lib/mission-agents.ts", "REVIEWER_SYSTEM_PROMPT", /ίδια γλώσσα που είναι γραμμένος ο στόχος/],
    ["src/lib/reflection-agent.ts", "reflectionSystemPrompt", /στη γλώσσα του χρήστη \(\$\{language\}\)/],
  ];
  for (const [file, name, rule] of PROMPTS) {
    const src = readFileSync(file, "utf8");
    check(`${name} exists`, src.includes(name));
    check(`${name} says which language to answer in`, rule.test(src));
  }
  // The reflection takes it as an argument rather than guessing.
  const agent = readFileSync("src/lib/reflection-agent.ts", "utf8");
  check("the reflection language is a parameter", /generateWeeklyReflection\([\s\S]{0,220}?language: string,/.test(agent));
  check("and the old Greek default is gone", !/Απάντα στα ελληνικά/.test(agent));
  const route = readFileSync("src/app/api/reflection/generate/route.ts", "utf8");
  check("the route passes the user's real locale", /const locale = await getLocale\(\);[\s\S]{0,200}?generateWeeklyReflection\(apiKey, userMessage, locale/.test(route));
}

console.log(`\n${pass} passed, ${failures.length} failed`);
if (failures.length) {
  console.log("FAILED: " + failures.join(" | "));
  process.exit(1);
}
