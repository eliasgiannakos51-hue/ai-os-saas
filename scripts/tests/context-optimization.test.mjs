// SENDING LESS, WITHOUT SENDING LESS INFORMATION.
//
// Two different things happened in this workstream and they carry
// completely different risk, so they are tested differently.
//
//   CACHING removes nothing. The model receives byte-identical text; only
//   the price of the bytes changes. The tests for it are about the ONE
//   way it goes silently wrong — a breakpoint in a place whose prefix
//   changes every request, which writes a cache entry nothing can ever
//   read and pays the 1.25x write premium forever, while grepping as an
//   optimisation that is in place.
//
//   NARROWING deletes context. It can make an answer worse, no test here
//   can tell you whether it does, and it is OFF. What is tested is that
//   it is off, that every uncertain case sends everything, and that its
//   own thresholds do not contradict each other.
//
// Run: node scripts/tests/context-optimization.test.mjs
import { readFileSync } from "node:fs";
import { loadTs } from "./load-ts.mjs";

let pass = 0;
const failures = [];
const ok = (name, cond, detail) => {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { failures.push(name); console.log(`  FAIL  ${name}${detail !== undefined ? "\n        " + detail : ""}`); }
};

const cached = await loadTs("src/lib/ai/cached-system.ts");
const cr = await loadTs("src/lib/ai/context-relevance.ts");
const uc = await loadTs("src/lib/user-context.ts");
const cm = await loadTs("src/lib/classifier-modules.ts");
const en = JSON.parse(readFileSync("messages/en.json", "utf8"));
const el = JSON.parse(readFileSync("messages/el.json", "utf8"));

const SONNET = "claude-sonnet-4-6";
const big = (n) => "x".repeat(n);
const OVER_MIN = big(1024 * 4 + 100); // comfortably over Sonnet's 1,024-token minimum

console.log("== 1. the second breakpoint, and where it may not go ==");
{
  const blocks = cached.buildCachedSystem({
    staticPrefix: OVER_MIN,
    perUserBlock: "PER-USER",
    dynamicSuffix: "PER-MESSAGE",
    model: SONNET,
  });
  ok("three blocks", blocks.length === 3, String(blocks.length));
  ok("the static prefix is cached", blocks[0].cache_control?.type === "ephemeral");
  ok("the per-user block is cached too", blocks[1].cache_control?.type === "ephemeral");
  // THE WHOLE POINT. A marker on the last block puts the per-message tail
  // inside the hashed prefix: every request writes a new entry and none
  // ever reads one.
  ok("the per-MESSAGE block is NOT cached", blocks[2].cache_control === undefined);
  ok("and the text is exactly what was passed, in order",
    blocks.map((b) => b.text).join("") === OVER_MIN + "PER-USER" + "PER-MESSAGE");

  // A caller with no per-user block gets exactly what it had before.
  const two = cached.buildCachedSystem({ staticPrefix: OVER_MIN, dynamicSuffix: "TAIL", model: SONNET });
  ok("no per-user block means the old two-block shape", two.length === 2, String(two.length));
  ok("...still cached at the static prefix", two[0].cache_control?.type === "ephemeral");
  ok("...and not at the tail", two[1].cache_control === undefined);

  // Below the minimum nothing is marked, because a marker Anthropic
  // ignores reads as caching that is in place.
  const small = cached.buildCachedSystem({
    staticPrefix: "short",
    perUserBlock: "u",
    dynamicSuffix: "m",
    model: SONNET,
  });
  ok("a short prompt gets ONE plain block", small.length === 1, String(small.length));
  ok("...with no marker at all", small[0].cache_control === undefined);
  ok("...and loses nothing", small[0].text === "shortum");

  // The per-user block is judged on the CUMULATIVE prefix.
  const shortStaticLongUser = cached.buildCachedSystem({
    staticPrefix: OVER_MIN,
    perUserBlock: "u",
    model: SONNET,
  });
  ok("a tiny per-user block after a large prefix is still cacheable",
    shortStaticLongUser[1]?.cache_control?.type === "ephemeral");
}

console.log("\n== 2. the conversation, which is the biggest block of all ==");
{
  const history = Array.from({ length: 20 }, (_, i) => ({
    role: i % 2 === 0 ? "user" : "assistant",
    content: big(400),
  }));
  const msgs = cached.buildCachedMessages(history, "the new question", SONNET);
  ok("every turn is present, plus the new message", msgs.length === 21, String(msgs.length));
  ok("the new message is last and is the user's",
    msgs[20].role === "user" && msgs[20].content === "the new question");
  // THE BREAKPOINT IS ON THE LAST HISTORY TURN, never on the new message:
  // a prefix that includes this message can never recur.
  const marked = msgs.filter((m) => Array.isArray(m.content) && m.content[0]?.cache_control);
  ok("exactly one turn carries a breakpoint", marked.length === 1, String(marked.length));
  ok("...and it is the last HISTORY turn", msgs.indexOf(marked[0]) === 19, String(msgs.indexOf(marked[0])));
  ok("the new message carries none", !Array.isArray(msgs[20].content));
  // NOTHING IS REWRITTEN.
  const flat = msgs.map((m) => (Array.isArray(m.content) ? m.content[0].text : m.content)).join("");
  ok("the text sent is unchanged",
    flat === history.map((h) => h.content).join("") + "the new question");

  const empty = cached.buildCachedMessages([], "first message", SONNET);
  ok("a brand-new conversation is just the message", empty.length === 1 && empty[0].content === "first message");

  const tiny = cached.buildCachedMessages(
    [{ role: "user", content: "hi" }, { role: "assistant", content: "hello" }],
    "next",
    SONNET
  );
  ok("a short history is not marked", !tiny.some((m) => Array.isArray(m.content)));
  ok("...and still sends every turn", tiny.length === 3);
}

console.log("\n== 3. narrowing is OFF, and every doubt sends everything ==");
{
  const vocabulary = cr.buildModuleVocabulary(cm.CLASSIFIER_MODULES, [en, el]);
  const now = Date.now();
  const summaries = cm.CLASSIFIER_MODULES.map((m, i) => ({
    slug: m.slug,
    lastActivityMs: now - i * 86_400_000,
  }));
  const ON = { ...cr.DEFAULT_SELECTION_CONFIG, enabled: true };

  ok("the default is OFF", cr.DEFAULT_SELECTION_CONFIG.enabled === false);
  const before = process.env.CONTEXT_RELEVANCE;
  delete process.env.CONTEXT_RELEVANCE;
  ok("an unset flag resolves to off", cr.resolveSelectionConfig().enabled === false);
  process.env.CONTEXT_RELEVANCE = "true";
  ok("a truthy-looking value that is not 'on' is still off",
    cr.resolveSelectionConfig().enabled === false);
  process.env.CONTEXT_RELEVANCE = "on";
  ok("only the literal 'on' turns it on", cr.resolveSelectionConfig().enabled === true);
  if (before === undefined) delete process.env.CONTEXT_RELEVANCE;
  else process.env.CONTEXT_RELEVANCE = before;

  const sendsAll = (label, question, config = ON, s = summaries) => {
    const r = cr.selectRelevantModules(question, s, vocabulary, config);
    ok(label, r.mode === "all" && r.keep.length === s.length, `${r.mode}: ${r.reason}`);
  };
  sendsAll("with the flag off, everything is sent", "how are my sales and leads doing this month",
    cr.DEFAULT_SELECTION_CONFIG);
  // A SHORT QUESTION THAT WOULD OTHERWISE MATCH. "τι κάνω;" also has no
  // words long enough to match on, so it was stopped by a different
  // guard and the length rule was never exercised.
  sendsAll("a short question is not judged", "πωλήσεις;");
  sendsAll("...even one naming a module outright", "sales?");
  sendsAll("a question matching nothing sends everything",
    "Give me a full picture of everything right now, all of it please");
  sendsAll("a question matching every module sends everything",
    cm.CLASSIFIER_MODULES.map((m) => m.slug).join(" "));
  sendsAll("a site with few modules is never narrowed", "how are my sales and leads doing this month",
    ON, summaries.slice(0, 4));

  // AND WHEN IT DOES NARROW, it keeps the matched modules and the ones
  // the user is actually working in.
  const recency = { sales: 0, products: 1, feedback: 2, content: 3, finance: 4, ideas: 5,
    research: 20, competitors: 30, analytics: 40, decisions: 60, learning: 90, trading: 120, automation: 200 };
  const realistic = cm.CLASSIFIER_MODULES.map((m) => ({
    slug: m.slug,
    lastActivityMs: now - (recency[m.slug] ?? 999) * 86_400_000,
  }));
  const sales = cr.selectRelevantModules(
    "How are my sales going this month and which leads went cold?",
    realistic, vocabulary, ON
  );
  ok("a sales question narrows", sales.mode === "narrowed", sales.reason);
  ok("...and keeps sales", sales.keep.some((k) => k.slug === "sales"));
  // The brief's own example.
  ok("...and drops the dormant trading journal", sales.droppedSlugs.includes("trading"),
    sales.droppedSlugs.join(","));
  ok("...while keeping what the user actually worked in today",
    ["products", "feedback"].every((s) => sales.keep.some((k) => k.slug === s)),
    sales.keep.map((k) => k.slug).join(","));
  // ORDER IS PRESERVED, so the prompt reads as it always did minus rows.
  const keptSlugs = sales.keep.map((k) => k.slug);
  const originalOrder = realistic.map((r) => r.slug).filter((s) => keptSlugs.includes(s));
  ok("...in the order the app lists them", keptSlugs.join() === originalOrder.join());

  // THE THRESHOLDS MUST NOT CONTRADICT EACH OTHER. With minKeep 6 and
  // maxDropShare 0.5 over thirteen modules, filling to six meant dropping
  // seven — over half — so every narrowing was refused by the cap meant
  // to bound it, and the feature was inert while looking merely cautious.
  ok("the drop cap is never exceeded",
    sales.droppedSlugs.length / realistic.length <= ON.maxDropShare,
    `${sales.droppedSlugs.length}/${realistic.length}`);
  ok("the floor and the cap are satisfiable together",
    Math.ceil(realistic.length * (1 - ON.maxDropShare)) >= 1 &&
      realistic.length - Math.max(ON.minKeep, Math.ceil(realistic.length * (1 - ON.maxDropShare))) >= 1,
    `floor ${ON.minKeep} cap ${ON.maxDropShare} over ${realistic.length}`);

  // WHOLE WORDS, NOT SUBSTRINGS. Half the modules have a field called
  // "Name"; a substring test makes any question containing "names"
  // match all of them, and a matcher that matches everything narrows
  // nothing while looking like it works.
  {
    const substringTrap =
      "Which of these names and notes should I follow up on this week, in order?";
    const r = cr.selectRelevantModules(substringTrap, realistic, vocabulary, ON);
    const matchedBySubstring = realistic.filter((m) => {
      const v = vocabulary.find((x) => x.slug === m.slug);
      return (v?.terms ?? []).some((t) => t.length >= 3 && substringTrap.toLowerCase().includes(t.toLowerCase()));
    }).length;
    ok("a substring test would have matched most modules",
      matchedBySubstring >= 6, String(matchedBySubstring));
    // THE MODE IS THE SAME EITHER WAY — the floor fills the selection to
    // seven regardless — so the mode proves nothing. What differs is
    // WHICH seven, and that is what is pinned: under a substring test
    // three more modules match on "names"/"notes" and displace the ones
    // the user actually worked in.
    const wordMatched = realistic.filter((m) => {
      const terms = (vocabulary.find((x) => x.slug === m.slug)?.terms ?? []).filter((t) => t.length >= 3);
      const words = new Set(substringTrap.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((w) => w.length >= 3));
      return terms.some((t) => words.has(t.toLowerCase()));
    }).length;
    ok("...and whole-word matching matches far fewer",
      wordMatched < matchedBySubstring, `${wordMatched} vs ${matchedBySubstring}`);
    ok("...so the selection is the seven it is",
      r.keep.map((k) => k.slug).join(",") ===
        "trading,decisions,products,content,sales,feedback,analytics",
      r.keep.map((k) => k.slug).join(","));
  }

  // A module with no vocabulary is never dropped: "we have no words for
  // it" is not evidence the question is not about it.
  const unknown = cr.selectRelevantModules(
    "How are my sales going this month and which leads went cold?",
    [...realistic, { slug: "brand_new_module", lastActivityMs: 0 }],
    vocabulary, ON
  );
  ok("a module with no vocabulary is kept", !unknown.droppedSlugs.includes("brand_new_module"),
    unknown.droppedSlugs.join(","));
}

console.log("\n== 4. the vocabulary comes from the catalogues, in both languages ==");
{
  const vocabulary = cr.buildModuleVocabulary(cm.CLASSIFIER_MODULES, [en, el]);
  ok("every module has one", vocabulary.length === cm.CLASSIFIER_MODULES.length);
  const sales = vocabulary.find((v) => v.slug === "sales");
  ok("it carries the English title", sales.terms.includes("Sales"), sales.terms.slice(0, 8).join(","));
  ok("...and the Greek one", sales.terms.some((t) => /Πωλ/.test(t)), sales.terms.join(",").slice(0, 120));
  ok("...and the field labels, which is how a question is usually phrased",
    sales.terms.includes("Lead"), sales.terms.join(","));
  ok("nothing shorter than three characters", sales.terms.every((t) => t.length >= 3));
  // A HAND-WRITTEN KEYWORD LIST WOULD DRIFT. Asserted structurally: the
  // terms must be findable in the catalogue, not invented here.
  ok("no term is invented — each appears in a catalogue or is the slug",
    sales.terms.every((t) => t === "sales" || JSON.stringify(en).includes(t) || JSON.stringify(el).includes(t)),
    sales.terms.join(","));
}

console.log("\n== 4b. THE vocabulary the app actually uses ==");
{
  // Section 4 builds a vocabulary in the test, which proves the builder
  // works and nothing about what the app passes it. This loads the real
  // module — the one the chat route calls — so dropping a catalogue from
  // it is a failure here rather than a silent loss of every Greek match.
  const real = (await loadTs("src/lib/ai/module-vocabulary.ts")).moduleVocabulary();
  ok("it covers every module", real.length === cm.CLASSIFIER_MODULES.length, String(real.length));
  const sales = real.find((v) => v.slug === "sales");
  ok("the app's vocabulary carries English", sales.terms.includes("Sales"));
  ok("...AND Greek", sales.terms.some((t) => /Πωλ/.test(t)), sales.terms.join(",").slice(0, 140));
  const anyGreek = real.some((v) => v.terms.some((t) => /[\u0370-\u03ff]/.test(t)));
  ok("...across the modules generally", anyGreek);
  // A Greek question must reach a module through the Greek terms alone.
  const now2 = Date.now();
  const greekOnly = cm.CLASSIFIER_MODULES.map((m, i) => ({ slug: m.slug, lastActivityMs: now2 - i * 86_400_000 }));
  const r = cr.selectRelevantModules(
    "Πώς πάνε οι πωλήσεις μου αυτόν τον μήνα και ποιες επαφές δεν απάντησαν;",
    greekOnly, real, { ...cr.DEFAULT_SELECTION_CONFIG, enabled: true }
  );
  ok("a Greek question narrows using Greek terms", r.mode === "narrowed", `${r.mode}: ${r.reason}`);
  ok("...and keeps sales", r.keep.some((k) => k.slug === "sales"), r.keep.map((k) => k.slug).join(","));
}

console.log("\n== 5. wired in, and wired in the right order ==");
{
  const route = readFileSync("src/app/api/chat/route.ts", "utf8");
  ok("the system prompt has a per-user tier", /perUserBlock: systemPerUser/.test(route));
  // ENTITY MENTIONS LAST. They are computed from THIS message, so
  // anything after them can never be cached.
  ok("the per-message block is ONLY the entity mentions",
    /const systemDynamicSuffix = buildEntityMentionPromptAddition\(mentionedEntities\);/.test(route));
  ok("...and the per-user block carries the rest",
    /const systemPerUser =\s*\n\s*buildMemoryPromptAddition\(memories\) \+[\s\S]{0,220}userContext \+\s*\n\s*integrationInstruction;/.test(route));
  ok("the cost estimate still sizes the WHOLE prompt",
    /const systemPrompt = systemStaticPrefix \+ systemPerUser \+ systemDynamicSuffix;/.test(route));
  ok("the conversation is cached", /buildCachedMessages\(\s*\n?\s*effectiveHistory/.test(route));
  ok("narrowing is applied to the module summaries",
    /selectRelevantModules\(\s*\n\s*message,\s*\n\s*fullContext\.moduleSummaries/.test(route));
  // THE CONDITION, not the message. The log line survives inside a
  // branch that can never be taken, which is how this stayed green with
  // the reporting switched off.
  ok("...and a narrowing is logged, so it is never silent",
    /if \(selection\.mode === "narrowed"\) \{[\s\S]{0,200}diagLog\(/.test(route));

  const ctxSrc = readFileSync("src/lib/ai/context-relevance.ts", "utf8");
  ok("the selector says plainly that it is off until quality is measured",
    /DEFAULT_SELECTION_CONFIG\.enabled\s*\n \* is false/.test(ctxSrc) || /is false/.test(ctxSrc));
  const harness = readFileSync("scripts/context-quality.mjs", "utf8");
  ok("the quality harness refuses to run without a key",
    /if \(!KEY\) \{[\s\S]{0,400}process\.exit\(1\)/.test(harness));
  ok("...and judges blind", /Blind because a judge told which/.test(harness));
  ok("...ten cases, as the brief asks", (harness.match(/^  "/gm) ?? []).length >= 10);
}

console.log("\n== 6. the module summaries carry what selection needs ==");
{
  const src = readFileSync("src/lib/user-context.ts", "utf8");
  ok("a summary carries its slug", /moduleSummaries: \{\s*\n\s*slug: string;/.test(src));
  ok("...and when the module was last written in", /lastActivityMs: number \| null;/.test(src));
  ok("...both populated from the scan",
    /slug: m\.slug,[\s\S]{0,120}lastActivityMs: m\.lastActivityMs,/.test(src));
  // The formatter must not print them — they are for the selector, not
  // for the model.
  const formatted = uc.buildUserContextPromptAdditionEnglish({
    moduleSummaries: [{ slug: "sales", title: "Sales", headlines: ["a lead"], lastActivityMs: 123 }],
    activeMissions: [], latestEnergyCheckIn: null,
    healthScore: { score: 50 }, knowledgeGraphLinkCount: 0, knowledgeGraphLinksThisWeek: 0,
  });
  ok("the slug is not printed into the prompt", !formatted.includes("sales:"), formatted.slice(0, 160));
  ok("the timestamp is not printed either", !formatted.includes("123"), formatted.slice(0, 160));
  ok("the title and headline are", formatted.includes("Sales") && formatted.includes("a lead"));
}

console.log("\n== 7. the measurement script is honest about what it measured ==");
{
  const m = readFileSync("scripts/measure-context.mjs", "utf8");
  ok("it says which figures are exact and which are assumed",
    /EXACT:/.test(m) && /MODELLED:/.test(m));
  ok("it says production traffic was NOT measured", /NOT MEASURED: production traffic/.test(m));
  ok("it names the token estimate as an estimate", /TOKENS ARE THE APP'S OWN ESTIMATE/.test(m));
  ok("...and that Greek breaks it in the unsafe direction for a count",
    /Greek/.test(m) && /floor/.test(m));
  // A LOAD THAT FAILS MUST NOT PRINT A ZERO. It did once, and a zero in a
  // measurement reads as "this costs nothing".
  ok("a failed load throws rather than reporting nothing",
    /refusing to report a zero/.test(m));
}

console.log(`\n${pass} passed, ${failures.length} failed`);
process.exit(failures.length === 0 ? 0 : 1);
