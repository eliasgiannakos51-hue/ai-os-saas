// SIX PRODUCERS, MATCHED FOR FREE — AND MEASURED, NOT CLAIMED.
//
// Redesign phase 1. lib/create-studio/route-entry.ts routes free text
// into one of thirteen TRACKERS. "θέλω e-shop" is not a row in any of
// them, and before this file the honest answer to it was a paid model
// call that picked the nearest tracker anyway.
//
// THE NUMBER THIS FILE EXISTS TO PREVENT IS 12/130. That is what a module
// vocabulary built out of interface nouns scored on verb-led questions,
// and it was not discovered by reading the vocabulary — it was discovered
// by running phrases through it. So section 2 runs THIRTY phrases in four
// scripts and prints every one of them, right or wrong, with a floor
// under the total. A matcher whose accuracy is asserted rather than
// measured is a matcher nobody has run.
//
// WHY THE THIRTY ARE WHAT THEY ARE: ten Greek, ten of the same requests
// in GREEKLISH (a person on an English keyboard, with no Greek letter in
// the string at all, which folding cannot reach), five Arabic and five
// Chinese. Chinese is in because it is the case a word boundary CANNOT
// serve — 网站 sits between two letters and \p{L} boundaries reject it —
// and Arabic is in because it is the case `\b` cannot serve. Both traps
// have shipped in this repository before.
//
// AND FIVE THAT MUST MATCH NOTHING. A router that answers everything is
// worse than none: it would take "καφές 4.50" away from the tracker that
// wants it. They are counted separately and a single false positive
// fails.
//
// Run: node scripts/tests/producer-routes.test.mjs
import { readFileSync } from "node:fs";
import { loadTs } from "./load-ts.mjs";
import { stripComments } from "../check-mutation-markers.mjs";

let pass = 0;
const failures = [];
const ok = (name, cond, detail) => {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { failures.push(name); console.log(`  FAIL  ${name}${detail !== undefined ? "\n        " + detail : ""}`); }
};

const LOCALES = ["en", "el", "es", "fr", "de", "it", "pt", "zh", "ja", "ar"];
const messages = Object.fromEntries(LOCALES.map((l) => [l, JSON.parse(readFileSync(`messages/${l}.json`, "utf8"))]));
const lookup = (obj, dotted) => dotted.split(".").reduce((n, p) => (n == null ? undefined : n[p]), obj);

const ROUTES_TS = "src/lib/create-studio/producer-routes.ts";
const routes = await loadTs(ROUTES_TS);
const { PRODUCERS, PRODUCER_SPECS, MAX_BRIEF_CHARS, matchProducer, producerHref } = routes;

ok(`ten locales were read (${LOCALES.length})`, LOCALES.length === 10);

console.log("== 1. the contract ==");
ok(`six producers (${PRODUCERS.join(", ")})`, PRODUCERS.length === 6 && PRODUCERS.every((k) => PRODUCER_SPECS[k]?.key === k));
{
  const src = stripComments(readFileSync(ROUTES_TS, "utf8"));
  // \b IS ASCII. It matches nothing in Greek, Arabic or Chinese, silently,
  // and four features in this repository have already shipped broken on it.
  ok("no ASCII word boundary is applied to a person's text", !/\\b/.test(src), "\\b is defined on [A-Za-z0-9_] only");
  ok("the boundary helpers are the shared ones", /from "@\/lib\/text\/unicode-patterns"/.test(src) && /boundedPattern\(/.test(src));
  ok("greeklish goes through the one implementation", /textHasGreeklishStem\(/.test(src));
  ok("scripts without spaces are matched by containment, not by boundary", /NO_SPACE_SCRIPT/.test(src) && /folded\.includes\(/.test(src));
  ok("every dash is a space for matching", /\\p\{Pd\}/.test(src));
}
{
  const unfolded = [];
  for (const key of PRODUCERS) {
    for (const cue of PRODUCER_SPECS[key].cues) {
      if (cue !== cue.toLowerCase() || /[̀-ͯ]/.test(cue.normalize("NFD"))) unfolded.push(`${key}: ${cue}`);
    }
  }
  ok(`every cue is written folded (${PRODUCERS.reduce((n, k) => n + PRODUCER_SPECS[k].cues.length, 0)} cues)`,
    unfolded.length === 0, unfolded.join(", "));
}
ok(`a brief is clamped at the shared ceiling (${MAX_BRIEF_CHARS}) and an empty one leaves the path bare`,
  MAX_BRIEF_CHARS > 0 &&
  decodeURIComponent(producerHref("website", "x".repeat(MAX_BRIEF_CHARS + 500)).split("=")[1]).length === MAX_BRIEF_CHARS &&
  producerHref("website", "   ") === PRODUCER_SPECS.website.path);
ok("the brief travels encoded, under each destination's own parameter",
  producerHref("posts", "γεια & αντίο").startsWith("/dashboard/posts?brief=") &&
  !producerHref("posts", "a&b").includes("&b") &&
  producerHref("agent", "x").startsWith("/dashboard/agents?agent="));

console.log("\n== 2. THIRTY PHRASES, IN FOUR SCRIPTS — the measurement ==");
// Each row is what a person types and the producer it must reach.
const PHRASES = [
  // --- Greek -------------------------------------------------------
  ["el", "θέλω ένα e-shop για τα γλυκά μου", "website"],
  ["el", "φτιάξε μου ιστοσελίδα για το γραφείο", "website"],
  ["el", "κάνε έρευνα για την αγορά καφέ στην Αθήνα", "research"],
  ["el", "θέλω μελέτη για τους ανταγωνιστές μου", "research"],
  ["el", "γράψε ανάρτηση για το νέο προϊόν", "posts"],
  ["el", "φτιάξε λεζάντα για το instagram", "posts"],
  ["el", "φτιάξε παρουσίαση για τους επενδυτές", "presentation"],
  ["el", "θέλω διαφάνειες για τη συνάντηση της Δευτέρας", "presentation"],
  ["el", "γράψε κώδικα που διαβάζει ένα csv", "coding"],
  ["el", "φτιάξε agent που ελέγχει τους ανταγωνιστές", "agent"],
  // --- the same requests in greeklish, no Greek letter anywhere ----
  ["greeklish", "thelo ena eshop gia ta glyka mou", "website"],
  ["greeklish", "ftiakse mou istoselida gia to grafeio", "website"],
  ["greeklish", "kane erevna gia tin agora kafe stin athina", "research"],
  ["greeklish", "thelo meleti gia tous antagonistes mou", "research"],
  ["greeklish", "grapse anartisi gia to neo proion", "posts"],
  ["greeklish", "ftiakse lezanta gia to instagram", "posts"],
  ["greeklish", "ftiakse parousiasi gia tous ependytes", "presentation"],
  ["greeklish", "thelo diafanies gia ti synantisi tis defteras", "presentation"],
  ["greeklish", "grapse kodika pou diavazei ena csv", "coding"],
  ["greeklish", "ftiakse agent pou elegxei tous antagonistes", "agent"],
  // --- Arabic ------------------------------------------------------
  ["ar", "أريد موقع لمتجري", "website"],
  ["ar", "اعمل بحث عن السوق", "research"],
  ["ar", "اكتب منشور عن المنتج الجديد", "posts"],
  ["ar", "أنشئ عرض تقديمي للمستثمرين", "presentation"],
  ["ar", "اكتب كود يقرأ الملف", "coding"],
  // --- Chinese: the script a word boundary cannot serve -------------
  ["zh", "我想要一个网站", "website"],
  ["zh", "帮我做市场调研", "research"],
  ["zh", "写一个帖子介绍新产品", "posts"],
  ["zh", "做一个演示给投资人", "presentation"],
  ["zh", "写代码读取文件", "coding"],
];

const byBucket = {};
const wrong = [];
const asked = [];
for (const [lang, text, want] of PHRASES) {
  const verdict = matchProducer(text);
  const got = verdict.kind === "one" ? verdict.producer : verdict.kind;
  const bucket = (byBucket[lang] ??= { right: 0, asked: 0, wrong: 0, total: 0 });
  bucket.total++;
  if (got === want) bucket.right++;
  else if (verdict.kind === "ambiguous") { bucket.asked++; asked.push(`${lang}: "${text}" -> asks (${verdict.producers.join("/")})`); }
  else { bucket.wrong++; wrong.push(`${lang}: "${text}" -> ${got}, wanted ${want}`); }
}
for (const [lang, b] of Object.entries(byBucket)) {
  console.log(`        ${lang.padEnd(10)} ${b.right}/${b.total} routed · ${b.asked} ask · ${b.wrong} wrong`);
}
const totals = Object.values(byBucket).reduce((a, b) => ({ right: a.right + b.right, asked: a.asked + b.asked, wrong: a.wrong + b.wrong, total: a.total + b.total }), { right: 0, asked: 0, wrong: 0, total: 0 });
console.log(`        ${"TOTAL".padEnd(10)} ${totals.right}/${totals.total} routed · ${totals.asked} ask · ${totals.wrong} wrong`);
if (wrong.length) console.log("        wrong:\n          " + wrong.join("\n          "));
if (asked.length) console.log("        asks:\n          " + asked.join("\n          "));
// A FLOOR, NOT A CLAIM OF PERFECTION. It is set at the measurement and
// any drop is a build failure; the phrases above are the evidence.
ok(`${totals.right} of ${totals.total} phrases route to the right producer`, totals.right >= 30, wrong.join("\n        "));
ok("every language bucket is carried, not averaged away",
  Object.values(byBucket).every((b) => b.right === b.total),
  Object.entries(byBucket).map(([l, b]) => `${l} ${b.right}/${b.total}`).join(", "));

console.log("\n== 2b. and five that must match NOTHING ==");
// A ROUTER THAT ANSWERS EVERYTHING TAKES WORK AWAY FROM THE TRACKERS.
const NOT_PRODUCERS = [
  ["el", "καφές 4.50"],
  ["el", "τι ξέρεις για μένα"],
  ["el", "πούλησα 3 προϊόντα χθες"],
  ["en", "how many credits do I have"],
  ["zh", "我昨天卖了三个产品"],
];
const falsePositives = NOT_PRODUCERS.filter(([, t]) => matchProducer(t).kind !== "none")
  .map(([l, t]) => `${l}: "${t}" -> ${JSON.stringify(matchProducer(t))}`);
ok(`none of the ${NOT_PRODUCERS.length} non-requests matches a producer`, falsePositives.length === 0, falsePositives.join("\n        "));

console.log("\n== 2c. two producers in one sentence is a question, not a coin toss ==");
{
  const v = matchProducer("φτιάξε παρουσίαση και ανάρτηση για το προϊόν");
  ok("it says ambiguous rather than picking one", v.kind === "ambiguous" && v.producers.length === 2, JSON.stringify(v));
}

console.log("\n== 3. the destination is named by the SIDEBAR's key ==");
{
  const navSrc = stripComments(readFileSync("src/lib/sidebar-nav.ts", "utf8"));
  for (const key of PRODUCERS) {
    const spec = PRODUCER_SPECS[key];
    ok(`${key}: the path is a row in the nav (${spec.path})`, navSrc.includes(`"${spec.path}"`));
    const dotted = spec.destinationKey;
    const missing = LOCALES.filter((l) => typeof lookup(messages[l], dotted) !== "string");
    ok(`${key}: ${dotted} resolves in all ten locales`, missing.length === 0, missing.join(", "));
  }
  ok("no destination invents a second name",
    PRODUCERS.every((k) => PRODUCER_SPECS[k].destinationKey.startsWith("sidebar.items.")));
}

console.log("\n== 4. every producer page READS the brief it is sent ==");
// A LINK IS AN AGREEMENT BETWEEN TWO FILES, and this repository has
// shipped four links whose other half was never written.
{
  const PAGES = {
    website: "src/app/dashboard/website-builder/page.tsx",
    research: "src/app/dashboard/deep-research/page.tsx",
    posts: "src/app/dashboard/posts/page.tsx",
    presentation: "src/app/dashboard/presentations/page.tsx",
    coding: "src/app/dashboard/coding/page.tsx",
    agent: "src/app/dashboard/agents/page.tsx",
  };
  for (const key of PRODUCERS) {
    const file = PAGES[key];
    const src = stripComments(readFileSync(file, "utf8"));
    const param = PRODUCER_SPECS[key].param;
    // THE READ, NOT THE TYPE. A `searchParams: { brief?: string }`
    // annotation with nothing reading it compiles, renders, and drops the
    // brief — and the first version of this check passed on exactly that,
    // which producer-routes.mutation.mjs found by removing the annotation
    // and watching the gate stay green.
    const reads = new RegExp(`searchParams\\??\\.${param}\\b|searchParams\\.get\\(["'\`]${param}["'\`]\\)`);
    ok(`${key}: ${file.replace("src/app/dashboard/", "")} really reads searchParams.${param}`,
      reads.test(src),
      "the brief is emitted and dropped — the page renders and the person retypes it");
  }
}

console.log("\n== 5. the profile each producer is priced against is real ==");
{
  const est = await loadTs("src/lib/billing/estimate.ts");
  for (const key of PRODUCERS) {
    const profile = PRODUCER_SPECS[key].profile;
    ok(`${key}: ${profile ?? "(free)"} is a declared action profile`,
      profile === null || Boolean(est.ACTION_PROFILES[profile]),
      `${profile} is not in ACTION_PROFILES`);
  }
}

console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${failures.length} failed`);
process.exit(failures.length === 0 ? 0 : 1);
