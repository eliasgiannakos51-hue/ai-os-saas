// THE 2.13 CLASSIFICATION: KIND OF WORK, TIER, CONFIDENCE (QUEUE E.2).
//
// BUILD-SPECS 2.13 Α asks for three things per request before the main
// model: a category (ten of them), one of the four tiers the code already
// has, and a confidence from 0 to 1 — and for a confidence under the floor
// to raise the tier by one. lib/ai/routing/categorize.ts does it with
// rules and no model call; lib/ai/routing/shadow.ts records the decision
// at every settlement without changing which model answers.
//
// The scenarios this file holds, by their 2.13 numbers:
//   1  (the classification half) a simple request is classed SIMPLE
//   2  a hard request is classed to a strong tier
//   3  an uncertain classification raises the tier
//   9  (the routing half) the same request in Greek and English gets the
//      same category and tier — the quality half needs the quality set
//
// Run: node scripts/tests/router-classify.test.mjs
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { loadTs } from "./load-ts.mjs";

let pass = 0;
const failures = [];
const ok = (name, cond, detail) => {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { failures.push(name); console.log(`  FAIL  ${name}${detail !== undefined ? "\n        " + detail : ""}`); }
};
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

const cat = await loadTs("src/lib/ai/routing/categorize.ts");
const cls = await loadTs("src/lib/ai/routing/classify.ts");
const tiers = await loadTs("src/lib/ai/routing/tiers.ts");
const shadow = await loadTs("src/lib/ai/routing/shadow.ts");
const jobTypes = await loadTs("src/lib/jobs/job-types.ts");

// =====================================================================
console.log("\n== 1. TEN CATEGORIES, FOUR TIERS ==");
// =====================================================================
ok(
  "the ten categories of 2.13 Α, in its order",
  JSON.stringify([...cat.CATEGORIES]) ===
    JSON.stringify(["chat", "writing", "analysis", "code", "research", "image", "file", "translation", "summary", "extraction"]),
  JSON.stringify(cat.CATEGORIES),
);
ok("the tiers are the four the code already has", JSON.stringify([...tiers.TIERS]) === JSON.stringify(["trivial", "simple", "complex", "expert"]));
ok("the confidence floor is a real fraction", cat.CONFIDENCE_FLOOR > 0 && cat.CONFIDENCE_FLOOR < 1, String(cat.CONFIDENCE_FLOOR));

// =====================================================================
console.log("\n== 2. SCENARIO 1: A SIMPLE REQUEST IS CLASSED SIMPLE ==");
// =====================================================================
for (const text of ["Τι είναι ο ΦΠΑ;", "What is VAT?", "Πες μου μια ιδέα για όνομα καφετέριας", "Give me a name for a coffee shop"]) {
  const r = cat.classifyRequest({ feature: "chat_message", text });
  ok(`"${text}" → simple, sure of it`, r.tier === "simple" && r.confidence >= cat.CONFIDENCE_FLOOR && !r.bumped, JSON.stringify(r));
}

// =====================================================================
console.log("\n== 3. SCENARIO 2: A HARD REQUEST GOES STRONG ==");
// =====================================================================
const strong = (t) => t === "complex" || t === "expert";
{
  const r = cat.classifyRequest({ feature: "website_generate", text: "Ένα site για το αρτοποιείο μου" });
  ok("a website is expert whatever the sentence says", r.tier === "expert", JSON.stringify(r));
}
{
  const r = cat.classifyRequest({ feature: "deep_research", text: "τάσεις" });
  ok("deep research is expert even with a one-word question", r.tier === "expert", JSON.stringify(r));
}
{
  const code = "```ts\nfunction f(x: number) { return x.map(y => y * 2) }\n```\nΓιατί σκάει;";
  const r = cat.classifyRequest({ feature: "chat_message", text: code });
  ok("a code block in chat is code, and not simple", r.category === "code" && strong(r.tier), JSON.stringify(r));
}
{
  const long = "Ανάλυσε τα έσοδα του τριμήνου ανά κατηγορία προϊόντος και σύγκρινε με πέρσι. ".repeat(60);
  const r = cat.classifyRequest({ feature: "chat_message", text: long });
  ok("a long analysis request is complex or above", r.category === "analysis" && strong(r.tier), JSON.stringify(r));
}
{
  const r = cat.classifyRequest({ feature: "chat_message", text: "Σύγκρινε τα δύο συμβόλαια και πες μου ποιο έχει χειρότερους όρους και γιατί;" });
  ok("a comparison is analysis and not simple", r.category === "analysis" && strong(r.tier), JSON.stringify(r));
}

// =====================================================================
console.log("\n== 4. SCENARIO 3: DOUBT RAISES THE TIER ==");
// =====================================================================
{
  const r = cat.classifyRequest({ feature: "chat_message", text: "μετάφρασε και σύνοψε αυτό το κείμενο" });
  ok("two kinds of work, equally named → under the floor", r.confidence < cat.CONFIDENCE_FLOOR, JSON.stringify(r));
  ok("...and the tier went up one", r.bumped === true && strong(r.tier), JSON.stringify(r));
}
{
  const r = cat.classifyRequest({ feature: "a_feature_nobody_registered", text: "hello" });
  ok("an unknown feature is doubted and raised", r.bumped === true && r.tier === "expert", JSON.stringify(r));
}
{
  const r = cat.classifyRequest({ feature: "chat_message", text: "Translate this into Greek: good morning" });
  ok("a clear request is not raised", r.bumped === false && r.category === "translation", JSON.stringify(r));
}
{
  const r = cat.classifyRequest({ feature: "chat_message", text: "x".repeat(300) });
  ok("a long line with no signal is doubted, not guessed", r.confidence < cat.CONFIDENCE_FLOOR && r.bumped, JSON.stringify(r));
}
{
  const r = cat.classifyRequest({ feature: "chat_message", text: "Τι είναι ο ΦΠΑ;" });
  const raised = cat.classifyRequest({ feature: "chat_message", text: "μετάφρασε και σύνοψε" });
  const order = tiers.TIERS.indexOf.bind(tiers.TIERS);
  ok("the bump is exactly one rung", order(raised.tier) - order("simple") <= 1 && order(r.tier) === order("simple"), `${r.tier} / ${raised.tier}`);
}
{
  const r = cat.classifyRequest({ feature: "deep_research", text: "μετάφρασε και σύνοψε" });
  ok("expert is the top: a bump does not go past it", r.tier === "expert", JSON.stringify(r));
}

// =====================================================================
console.log("\n== 5. SCENARIO 9: GREEK AND ENGLISH CLASS THE SAME ==");
// =====================================================================
const PAIRS = [
  ["Μετάφρασε στα αγγλικά: καλημέρα σε όλους", "Translate into English: good morning everyone"],
  ["Κάνε μου μια περίληψη αυτού του άρθρου", "Give me a summary of this article"],
  ["Γράψε ένα email στον προμηθευτή για καθυστέρηση", "Write an email to the supplier about a delay"],
  ["Βρες μου πηγές για την αγορά καφέ στην Ελλάδα", "Find me sources on the coffee market in Greece"],
  ["Εξήγαγε όλα τα ονόματα σε λίστα", "Extract all the names into a list"],
  ["Ανάλυσε τις πωλήσεις του μήνα", "Analyze this month's sales"],
  ["Φτιάξε μια εικόνα με λογότυπο για αρτοποιείο", "Make an image with a logo for a bakery"],
  ["Γιατί πετάει error: undefined η συνάρτηση μου;", "Why does my function throw error: undefined?"],
  ["Καλημέρα, τι κάνεις;", "Good morning, how are you?"],
  ["Τι ώρα κλείνουν οι τράπεζες;", "What time do banks close?"],
];
for (const [el, en] of PAIRS) {
  const a = cat.classifyRequest({ feature: "chat_message", text: el });
  const b = cat.classifyRequest({ feature: "chat_message", text: en });
  ok(`"${en}" — same category and tier in both`, a.category === b.category && a.tier === b.tier, `el ${a.category}/${a.tier} · en ${b.category}/${b.tier}`);
}
ok("accents do not change the rule key", cat.normalizeForRules("Μετάφρασε ΑΥΤΌ") === "μεταφρασε αυτο");

// =====================================================================
console.log("\n== 6. EVERY SETTLEMENT FEATURE HAS A CATEGORY AND A TIER ==");
// =====================================================================
// The population is the code: every string literal passed as `feature`
// in a file that calls settleReservation(, plus the job kinds the runner
// passes through, minus the outcome suffixes. A feature missing here is
// recorded as "unknown" and raised — safe, but it fills the admin page
// with a decision about nothing.
function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
}
const settlementFeatures = new Set(jobTypes.JOB_KINDS);
for (const file of walk("src")) {
  const src = stripComments(readFileSync(file, "utf8"));
  if (!/settleReservation\(/.test(src)) continue;
  for (const m of src.matchAll(/feature:\s*([^,}\n]+)/g)) {
    for (const lit of m[1].matchAll(/"([a-z_]+)"/g)) settlementFeatures.add(cat.baseFeature(lit[1]));
  }
}
ok("the scan found the settlement features", settlementFeatures.size >= 25, `${settlementFeatures.size} found`);
const missing = [...settlementFeatures].filter(
  (f) => !shadow.NON_TEXT_FEATURES.has(f) && (!(f in cls.FEATURE_TIERS) || !(f in cat.FEATURE_CATEGORIES)),
);
ok("every one has a tier and a category", missing.length === 0, `missing: ${missing.join(", ")}`);
ok("the job runner's suffixes do not make a new feature", cat.baseFeature("file_ask_refunded") === "file_ask" && cat.baseFeature("agent_run_cannot_complete") === "agent_run");

// =====================================================================
console.log("\n== 7. CHEAP AND FAST: NO MODEL CALL, MICROSECONDS ==");
// =====================================================================
// 2.13 Α: "if it adds more than 300 ms to simple requests, propose a
// fix". Two bars. The 99th percentile under 5 ms — sixty times under the
// brief's ceiling, so a regression shows long before it matters — and
// the single worst call under the brief's own 300 ms. Not "the worst
// under 5 ms": the gates run six at a time, and one call that lands on
// a garbage collection measured 17 ms on 2026-10-05 while the p99 was
// a fraction of a millisecond.
const SAMPLE = [...PAIRS.flat(), "x".repeat(3000), "```js\nlet a=1\n```", "Τι είναι ο ΦΠΑ;"];
const times = [];
for (let i = 0; i < 2000; i++) {
  const s = process.hrtime.bigint();
  cat.classifyRequest({ feature: "chat_message", text: SAMPLE[i % SAMPLE.length] });
  times.push(Number(process.hrtime.bigint() - s) / 1e6);
}
times.sort((a, b) => a - b);
const avg = times.reduce((a, b) => a + b, 0) / times.length;
const p99 = times[Math.floor(times.length * 0.99)];
const worst = times[times.length - 1];
console.log(`        measured: ${avg.toFixed(4)} ms average, ${p99.toFixed(3)} ms p99, ${worst.toFixed(3)} ms worst, over 2000 calls`);
ok("99% of classifications take under 5 ms", p99 < 5, `${p99} ms`);
ok("no classification takes the brief's 300 ms", worst < 300, `${worst} ms`);
const catSrc = stripComments(readFileSync("src/lib/ai/routing/categorize.ts", "utf8"));
ok("categorize.ts imports no SDK and calls no model", !/@anthropic-ai|openai|fetch\(|runCompletion/.test(catSrc));

// =====================================================================
console.log("\n== 8. THE SHADOW RECORDS, AND CHANGES NOTHING ==");
// =====================================================================
const settle = stripComments(readFileSync("src/lib/billing/reservations.ts", "utf8"));
ok(
  "settlement computes the shadow decision for a text feature",
  /NON_TEXT_FEATURES\.has\(feature\)[\s\S]{0,200}shadowRoute\(\{ feature \}\)/.test(settle),
);
ok("...and writes it into the cost row's metadata", /p_metadata:\s*\{\s*\.\.\.metadata,\s*routing,/.test(settle));
ok("...and cannot fail the settlement over it", /try \{\s*routing = [\s\S]{0,300}\} catch \(err\) \{\s*routing = \{ error:/.test(settle));
const chat = stripComments(readFileSync("src/app/api/chat/route.ts", "utf8"));
const chatShadow = chat.match(/shadowRouteSafe\(\{ feature: "chat_message", text: message \}\)/g) ?? [];
ok("chat records a decision made from the user's own words, on both settlements", chatShadow.length === 2, `${chatShadow.length} found`);
ok("chat still answers with the model it had", /const MODEL = CHAT_MODEL;/.test(chat) && /model: MODEL\b/.test(chat));
const shadowSrc = stripComments(readFileSync("src/lib/ai/routing/shadow.ts", "utf8"));
ok("shadow.ts calls no model", !/@anthropic-ai|fetch\(|runCompletion/.test(shadowSrc));
const d = shadow.shadowRoute({ feature: "chat_message", text: "Τι είναι ο ΦΠΑ;" }, {});
ok("a shadow decision names the table's model for its row", d.tier === "simple" && d.model === "claude-haiku-4-5" && d.tableSource === "default", JSON.stringify(d));

console.log(failures.length === 0 ? `\nALL PASS: ${pass} passed, 0 failed` : `\nFAILED: ${pass} passed, ${failures.length} failed`);
process.exit(failures.length === 0 ? 0 : 1);
