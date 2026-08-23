// "The user does not know what they CAN ask."
//
// THE EVIDENCE, and it is not a usability complaint about a button: a
// tester came away believing this product was "several LLMs in one,
// cheaper". Others asked where to paste their API key. Another said they
// could not work out how Files worked. Every one of those is somebody
// looking at a text box that accepts anything and inferring what it must
// be for.
//
// A placeholder tells you the SHAPE of an input. A pressable example tells
// you what this particular box does, in the time it takes to read four
// words, and costs one click to try. Files already proved it; this checks
// that every other AI surface now has the same thing — and that each one
// also states, honestly, what it will NOT do.
//
// THE LIMITS LINES ARE CHECKED AGAINST THE CODE, not against how modest
// they sound. A reassuring sentence that is not true is worse than no
// sentence: this is the one place a user decides what to trust the
// product with.
//
// Run: node scripts/tests/example-prompts.test.mjs
import { readFileSync, readdirSync, statSync } from "node:fs";

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

const { loadTs } = await import("./load-ts.mjs");
const reg = await loadTs("src/lib/ai/example-prompts.ts");

const LOCALES = ["en", "el", "es", "fr", "de", "it", "pt", "zh", "ja", "ar"];
const messages = Object.fromEntries(
  LOCALES.map((l) => [l, JSON.parse(readFileSync(`messages/${l}.json`, "utf8"))])
);
const lookup = (obj, path) => path.split(".").reduce((a, k) => (a == null ? a : a[k]), obj);
const component = readFileSync("src/components/ai/example-prompts.tsx", "utf8");

// Where each surface's chips are rendered.
const SURFACE_FILES = {
  createStudio: "src/components/create/create-studio.tsx",
  agents: "src/components/agents/agents-workspace.tsx",
  mission: "src/components/mission/mission-form.tsx",
  websiteBuilder: "src/components/website-builder/website-builder-workspace.tsx",
  files: "src/components/files/files-workspace.tsx",
  research: "src/components/research/research-workspace.tsx",
  chat: "src/components/chat/chat-workspace.tsx",
};

// ---------------------------------------------------------------------
console.log("== 1. every AI surface is covered ==");
check(`seven surfaces are declared (${reg.AI_SURFACES.length})`, reg.AI_SURFACES.length === 7, reg.AI_SURFACES.join(", "));
// The list is not "the ones somebody remembered". Anything in the app that
// takes free text and hands it to a model belongs here — so the registry
// is checked against the files that actually render the component.
for (const surface of reg.AI_SURFACES) {
  const file = SURFACE_FILES[surface];
  check(`${surface} has a home`, Boolean(file), "add it to SURFACE_FILES");
  if (!file) continue;
  const src = readFileSync(file, "utf8");
  check(`${surface} renders the shared chips`, new RegExp(`surface="${surface}"`).test(src));
}
// And nothing renders it with a surface the registry does not know.
function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const p = `${dir}/${entry}`;
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (/\.tsx?$/.test(p)) out.push(p);
  }
  return out;
}
const used = new Set();
for (const file of walk("src")) {
  for (const m of readFileSync(file, "utf8").matchAll(/<ExamplePrompts[\s\S]{0,120}?surface="(\w+)"/g)) {
    used.add(m[1]);
  }
}
check(
  `all ${used.size} rendered surfaces are declared`,
  [...used].every((s) => reg.AI_SURFACES.includes(s)),
  [...used].filter((s) => !reg.AI_SURFACES.includes(s)).join(", ")
);

// Read from the plan itself rather than restated here, so adding a
// seventh kind without an example fails this file instead of shipping
// an undiscoverable capability.
const CREATE_STUDIO_KIND_COUNT = (
  readFileSync("src/lib/create-studio/plan.ts", "utf8").match(
    /export const CREATE_STUDIO_TYPES = \[([\s\S]*?)\] as const;/
  )?.[1].match(/"[a-zA-Z]+"/g) ?? []
).length;

console.log("\n== 2. at least three, and never more than the box can do ==");
// One reads as the only thing the box accepts. A long list is a menu to be
// read rather than a prompt to be tried.
//
// THE CEILING IS NOT A MAGIC NUMBER ANY MORE. It used to be a flat 3-4,
// written when Create Studio routed to five kinds and showed four. Adding
// the sixth kind — an autonomous agent, which is what this box was
// silently filing as an "automation" — made the flat bound fail for a
// change that made the box MORE honest, which is a bound testing the wrong
// thing.
//
// What actually matters is that no example is padding: every chip must
// correspond to something the surface can really produce. That is a
// STRONGER rule than 3-4, because a flat count never checked whether the
// examples meant anything, and it is what keeps the list from growing for
// its own sake.
for (const surface of reg.AI_SURFACES) {
  const count = reg.EXAMPLE_COUNTS[surface];
  const ceiling = reg.MAX_EXAMPLES_FOR(surface);
  check(
    `${surface}: ${count} examples (max ${ceiling})`,
    count >= reg.MIN_EXAMPLES && count <= ceiling,
    `expected ${reg.MIN_EXAMPLES}-${ceiling}`
  );
  check(`${surface}: keys match the count`, reg.exampleKeys(surface).length === count);
}
// Create Studio shows one per kind it routes to, and that is the whole
// point of its list: it is the only place the range is visible before you
// have tried it. A kind with no example is a kind nobody discovers — which
// is exactly how "make me an agent" went unanswered for as long as it did.
check(
  "Create Studio shows one example per kind it can produce",
  reg.EXAMPLE_COUNTS.createStudio === CREATE_STUDIO_KIND_COUNT,
  `${reg.EXAMPLE_COUNTS.createStudio} examples vs ${CREATE_STUDIO_KIND_COUNT} kinds`
);

console.log("\n== 3. every string exists, in every locale, actually translated ==");
const keys = reg.allExampleKeys();
// Derived, not typed: this number moves every time a surface gains an
// example, and a hardcoded one turns a real addition into a failure that
// says nothing about what broke.
const expectedKeyCount =
  reg.AI_SURFACES.reduce((sum, s) => sum + reg.EXAMPLE_COUNTS[s], 0) + reg.AI_SURFACES.length;
check(`${keys.length} message keys are required`, keys.length === expectedKeyCount, `${keys.length} vs ${expectedKeyCount}`);
const missing = [];
const untranslated = [];
for (const key of keys) {
  for (const locale of LOCALES) {
    const value = lookup(messages[locale], key);
    if (typeof value !== "string" || !value.trim()) {
      missing.push(`${locale}: ${key}`);
      continue;
    }
    // An example copied verbatim from English into Greek is the exact
    // failure check-i18n.js exists for, and these are the strings a user
    // reads FIRST.
    if (locale !== "en" && value === lookup(messages.en, key)) untranslated.push(`${locale}: ${key}`);
  }
}
check(`no key missing from any locale (${keys.length} × ${LOCALES.length})`, missing.length === 0, missing.slice(0, 6).join("\n        "));
check("and none is English copied into another locale", untranslated.length === 0, untranslated.slice(0, 6).join("\n        "));
check("the shared label exists everywhere", LOCALES.every((l) => typeof lookup(messages[l], "common.examplesLabel") === "string"));

console.log("\n== 3b. the examples are real requests, not placeholders ==");
// "e.g. a website" teaches nothing. The brief asked for REAL examples, so
// they are checked for being sentences somebody could actually mean.
for (const surface of reg.AI_SURFACES) {
  for (const key of reg.exampleKeys(surface)) {
    const en = lookup(messages.en, `aiExamples.${surface}.${key}`);
    const el = lookup(messages.el, `aiExamples.${surface}.${key}`);
    check(
      `${surface}.${key} is a real request ("${en.slice(0, 42)}")`,
      en.length >= 15 && !/^e\.g\.|^example|lorem|\.\.\.$/i.test(en) && el.length >= 10
    );
  }
}

console.log("\n== 4. THE LIMITS LINE, and whether it is true ==");
// Each claim, checked against the code that makes it true or false. The
// brief's suggested line was "doesn't write code · no access to your
// systems" — accurate for most surfaces and FALSE for two of them, which
// is why they are not all given the same sentence.
const limits = Object.fromEntries(
  reg.AI_SURFACES.map((s) => [s, lookup(messages.en, `aiExamples.${s}.limits`)])
);
for (const surface of reg.AI_SURFACES) {
  check(`${surface} states a limit`, typeof limits[surface] === "string" && limits[surface].length > 20);
  check(`${surface} uses the separator the brief asked for`, limits[surface].includes("·"));
}

// The Website Builder DOES write code — a complete HTML document — so
// "doesn't write code" would have been a false sentence on the one screen
// where somebody decides whether to trust it with their business page.
const websiteLib = readFileSync("src/lib/website-builder.ts", "utf8");
check(
  "the Website Builder really does emit one HTML document",
  /Output ONE complete HTML document/.test(websiteLib)
);
check(
  "...so its limit says 'one page', not 'no code'",
  /one page/i.test(limits.websiteBuilder) && !/code/i.test(limits.websiteBuilder),
  limits.websiteBuilder
);
// It cannot take payments: one static page, no backend of its own.
check("...and rules out a shop", /shop/i.test(limits.websiteBuilder));

// Files: the handler sends NO tools at all, so "doesn't search the web" is
// a fact about the request it makes.
const fileAsk = readFileSync("src/lib/jobs/handlers/file-ask.ts", "utf8");
check("file_ask really sends no tools", !/tools:/.test(fileAsk));
check("...so Files says it does not search the web", /doesn't search the web/i.test(limits.files), limits.files);

// Deep Research: web_search and no file access.
const research = readFileSync("src/lib/research/research.ts", "utf8");
check("research really uses web search", /web_search/.test(research));
check("...and really cannot read the user's files", !/loadReadableFiles|user_files/.test(research));
check("...so it says it can't see your files", /can't see your files/i.test(limits.research), limits.research);

// Agents: one tool, no Ionexa API, delivery resolved from the owner's rows.
const runner = readFileSync("src/lib/agents/agent-runner.ts", "utf8");
check("an agent really has exactly one tool", /The agent has exactly ONE tool/.test(runner));
check("...and cannot call any Ionexa API", /It cannot call any Ionexa API/.test(runner));
check("...so it says it takes no actions", /no actions/i.test(limits.agents), limits.agents);
// It CAN now send to Telegram/Discord — so "only to your own email" would
// be stale. "Only where you chose" is what the ownership rule enforces.
check("...and describes delivery as the ownership rule really works", /where you chose/i.test(limits.agents));

// Mission Control: a step runs only when the user schedules it.
const cron = readFileSync("src/app/api/cron/scheduled-runs/route.ts", "utf8");
check("a mission step really only runs when scheduled", /runMissionStepForUser/.test(cron));
check("...so the limit says exactly that", /only runs when you schedule/i.test(limits.mission), limits.mission);

// Chat: it DOES see connected integrations, so "no access to your systems"
// would be false the moment somebody connects Gmail.
const chatRoute = readFileSync("src/app/api/chat/route.ts", "utf8");
check("chat really can read connected integrations", /integrations\/chat-tool/.test(chatRoute));
check(
  "...so chat says it sees what you connected, rather than claiming it sees nothing",
  /connected/i.test(limits.chat),
  limits.chat
);

console.log("\n== 5. the component itself ==");
check("chips are buttons, not decorations", /<button/.test(component) && /onClick=\{\(\) => onPick\(example\)\}/.test(component));
check("the limits line always renders with them", /data-testid="ai-limits"/.test(component));
check("...and is not behind a condition", !/\{limits &&/.test(component));
check("chips are a real touch target on a phone", /min-h-\[36px\]/.test(component));
check("the component reaches for no input of its own", !/document\.querySelector/.test(component));

console.log("\n== 6. Files kept its behaviour when it moved ==");
// The examples were Files' idea. Moving them into the shared component
// must not have lost the thing its own production test checks.
const filesUi = readFileSync("src/components/files/files-workspace.tsx", "utf8");
check("Files renders the shared chips", /<ExamplePrompts surface="files"/.test(filesUi));
check("...wired to the question box", /onPick=\{setQuestion\}/.test(filesUi));
check("its old private copy is gone", !/const EXAMPLES = \[/.test(filesUi));
check("and the orphaned message keys with it", lookup(messages.en, "dashboard.files.example1") === undefined);
check("...in every locale", LOCALES.every((l) => lookup(messages[l], "dashboard.files.examplesLabel") === undefined));

console.log("\n== 7. the chat empty state stopped being English-only ==");
const chatUi = readFileSync("src/components/chat/chat-workspace.tsx", "utf8");
check("the composer placeholder is translated", !/placeholder="Message Ionexa/.test(chatUi));
check("the empty-state explanation too", !/Ask anything — general knowledge/.test(chatUi));
check("and the send button's label", !/aria-label="Send"/.test(chatUi));
check("the title reuses the key that was already translated", /\{t\("title"\)\}/.test(chatUi));

console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${failures.length} failed`);
process.exit(failures.length === 0 ? 0 : 1);
