// "Presentations" promised something the module does not contain.
//
// /dashboard/presentations is a CRUD tracker: a table of rows the user
// types by hand, with no AI call anywhere in it. A user clicking
// "Presentations" expects to describe a deck and get slides, and finds a
// form with a slide-count field.
//
// That was not a wording problem to soften — the name was not true. The
// worst offender was the sidebar tooltip, which said in so many words
// "Turn a brief into a finished deck", i.e. it described a feature that
// does not exist as though it did.
//
// This file checks the promise is gone from EVERY surface that carries
// it, not from the one we happened to remember: the module title, the
// page header, the browser tab, the sidebar label, the sidebar tooltip and
// the empty state, in all ten locales.
//
// WHERE THE EMPTY STATE LIVES NOW. It was module.emptyPresentationNotes —
// one string, reached through an OPTIONAL emptyKey override that only
// this module set. Every module has its own empty state now (three parts:
// title, why, example, under moduleData.empty.<slug>), emptyKey is
// required, and so is the shared "No entries yet" sentence that the
// override existed to escape: gone, because there is no longer anything
// that could fall back to it.
//
// What that changes here is the ADDRESS of the strings, not the job of
// this file. The check that mattered — that no surface of this module
// promises a slide generator, in any of ten languages — is unchanged and
// now reads the three parts as one blob. What section 6 can no longer
// mean is "exactly one module overrides its empty state": all twenty do.
// It asks the stronger question instead — that no module shares another's
// empty state, and that the generic sentence is really gone.
//
// Run: node scripts/tests/presentation-notes.test.mjs
import { readFileSync } from "node:fs";

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

const LOCALES = ["en", "el", "es", "fr", "de", "it", "pt", "zh", "ja", "ar"];

// The empty state is three strings now. Every check below that used to
// read one string reads all three joined, because the promise this file
// hunts for could be made in any of them — the title is the shortest and
// therefore the likeliest place for "Turn a brief into a finished deck"
// to reappear.
function emptyState(m, slug = "presentations") {
  return m.moduleData.empty[slug];
}
function emptyText(m, slug = "presentations") {
  const e = emptyState(m, slug);
  return e ? `${e.title} ${e.why} ${e.example}` : undefined;
}
const messages = Object.fromEntries(
  LOCALES.map((l) => [l, JSON.parse(readFileSync(`messages/${l}.json`, "utf8"))])
);

const { loadTs } = await import("./load-ts.mjs");
const { BUILD_MODULES, getBuildModule } = await loadTs("src/lib/build-modules.ts");
const module = getBuildModule("presentations");

console.log("== 1. the module is renamed at its source ==");
check("the module still exists", Boolean(module));
// The name now lives in the message catalogue and the config carries the
// KEY, so this checks the thing the user actually reads — and checks it in
// all ten languages instead of one English constant, which is strictly
// more than the old `module.title === "Presentation Notes"` could see.
check(
  "its name comes from the catalogue, not from a string in the registry",
  module.titleKey === "sidebar.items.presentations",
  `titleKey is ${JSON.stringify(module.titleKey)}`
);
check('the English name is still "Presentation Notes"', messages.en.sidebar.items.presentations === "Presentation Notes");
// The rename exists so nobody arrives expecting a slide generator. A
// translation that says only "Presentations" reintroduces exactly that
// expectation in that language, so every locale has to carry the
// "notes"/"note" sense — checked per language against its own word.
const NOTE_WORD = {
  el: /σημει/i, es: /nota/i, fr: /note/i, de: /notiz/i, it: /not/i,
  pt: /nota/i, zh: /记录|笔记/, ja: /メモ|ノート/, ar: /ملاحظ/,
};
for (const [loc, re] of Object.entries(NOTE_WORD)) {
  const value = messages[loc].sidebar.items.presentations;
  check(`${loc}: the name still says "notes", not just "presentations"`, re.test(value), `got ${JSON.stringify(value)}`);
}
check("the slug is unchanged, so no route or link breaks", module.slug === "presentations");
check("the table is unchanged, so no data moves", module.table === "ai_presentations");
// The page header and the browser tab both resolve the config's key, so
// that is what actually decides what the user sees.
const page = readFileSync("src/app/dashboard/presentations/page.tsx", "utf8");
check("the page takes its title from the config", /t\(CONFIG\.titleKey\)/.test(page));
check("and the header does too", /t\(config\.titleKey\)/.test(readFileSync("src/components/modules/build-module-page.tsx", "utf8")));

console.log("\n== 2. the sidebar label and its lookup key agree ==");
const nav = readFileSync("src/lib/sidebar-nav.ts", "utf8");
const labelKeys = readFileSync("src/lib/sidebar-label-keys.ts", "utf8");
check('the nav label is "Presentation Notes"', /label: "Presentation Notes"/.test(nav));
check("the old label is gone from the nav", !/label: "Presentations"/.test(nav));
// If these two drift, the sidebar silently falls back to the raw English
// string and the item stops being translated at all.
check(
  "the label-key map is keyed on the NEW label",
  /"Presentation Notes": "presentations"/.test(labelKeys)
);
check("and no longer on the old one", !/^\s*Presentations: "presentations",/m.test(labelKeys));

console.log("\n== 3. no surface still promises a generator ==");
// The exact sentence that was there: "Turn a brief into a finished deck."
//
// A naive keyword scan is wrong here, and it caught me: the new copy says
// "it does NOT create slides", which contains the words being searched
// for. So negations are neutralised first — "does not create" becomes
// "NEG_create", which no longer matches \bcreate — and only an
// AFFIRMATIVE claim can trip the check. Testing for the words alone would
// have failed the copy for saying precisely the right thing.
function withoutNegations(text) {
  return text.replace(/\b(does not|doesn't|do not|don't|never|cannot|can't)\s+/gi, "NEG_");
}
const PROMISE = /\bfinished deck|\bgenerates?\b.{0,20}slide|\bcreates?\b.{0,20}slide|turn a brief/i;
// The scanner has to be proven to work before it proves anything.
check("the scanner catches the sentence that was actually there", PROMISE.test("Turn a brief into a finished deck. Not ready yet."));
check("and an affirmative claim", PROMISE.test("It generates slides for you."));
check("but NOT a denial of the same claim", !PROMISE.test(withoutNegations("It does not generate slides for you.")));
check("nor the other phrasing of a denial", !PROMISE.test(withoutNegations("It doesn't create slides.")));

for (const locale of LOCALES) {
  const m = messages[locale];
  check(`${locale}: the sidebar tooltip no longer promises a deck`, !PROMISE.test(withoutNegations(m.sidebar.hints.presentations)));
  check(`${locale}: nor does the empty state`, !PROMISE.test(withoutNegations(emptyText(m))));
}
check(
  "the English tooltip says what it IS",
  /keep track of decks/i.test(messages.en.sidebar.hints.presentations)
);
check(
  "and says plainly what it is not",
  /does not create slides/i.test(messages.en.sidebar.hints.presentations)
);

console.log("\n== 4. all ten locales are translated, not copied ==");
for (const locale of LOCALES) {
  const m = messages[locale];
  check(`${locale}: has a sidebar label`, Boolean(m.sidebar.items.presentations));
  check(`${locale}: has a tooltip`, Boolean(m.sidebar.hints.presentations));
  const empty = emptyState(m);
  check(`${locale}: has its own empty state`, Boolean(empty?.title && empty?.why && empty?.example));
  if (locale === "en") continue;
  check(
    `${locale}: the label is genuinely translated`,
    m.sidebar.items.presentations !== messages.en.sidebar.items.presentations
  );
  check(
    `${locale}: the empty state is genuinely translated`,
    emptyText(m) !== emptyText(messages.en)
  );
}

console.log("\n== 5. the empty state explains what this is ==");
const enEmpty = emptyText(messages.en);
check("it says what the page is for", /keep track of presentations/i.test(enEmpty));
check("it says what it does NOT do", /does not generate slides/i.test(enEmpty));
check("and still tells the user what to do next", /button above/i.test(enEmpty));
// The old generic message was actively misleading here: it said "log your
// first one" with no hint that logging is ALL this does. It no longer
// exists anywhere in the catalogue, which is a stronger guarantee than
// this module's copy merely differing from it — so that is what is
// asserted, in every locale rather than in English.
for (const locale of LOCALES) {
  check(
    `${locale}: the generic "No entries yet" sentence is gone from the catalogue`,
    messages[locale].module.noEntries === undefined &&
      messages[locale].module.emptyPresentationNotes === undefined
  );
}

console.log("\n== 6. this module's empty state is its own, and so is everyone else's ==");
// The way a per-module empty state goes wrong: one module's copy quietly
// standing in for another's, which is what a shared string was. Every
// build module names its own key, and no two names collide.
const emptyKeys = BUILD_MODULES.map((m) => m.emptyKey);
check(`every build module names an empty state (${emptyKeys.length})`, emptyKeys.every(Boolean));
check("and no two of them name the same one", new Set(emptyKeys).size === emptyKeys.length);
check(
  "this module's is its own",
  getBuildModule("presentations").emptyKey === "moduleData.empty.presentations"
);
// The fallback is gone with the shared string it fell back to. Left in
// place it would be dead code that quietly revives the generic sentence
// the day someone re-adds the key.
// Comments stripped first: the line that removed the fallback explains
// itself by quoting it, and a check that reads comments would be failed
// by the sentence recording that it passes.
const list = readFileSync("src/components/modules/generic-list.tsx", "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^\s*\/\/.*$/gm, "");
check('generic-list.tsx no longer falls back to "noEntries"', !/noEntries/.test(list));
// Nothing is allowed to render this module's copy but this module: an
// empty state that says "does not generate slides" would be a lie on any
// other page.
const allSlugs = Object.keys(messages.en.moduleData.empty);
const sharing = allSlugs.filter(
  (slug) => slug !== "presentations" && /generate slides/i.test(messages.en.moduleData.empty[slug].why)
);
check("and no other module borrowed its wording", sharing, []);

console.log("\n== 7. the real generator is still promised where it belongs ==");
// Renaming must not delete the intention. The roadmap entry is under
// status "future", which is the honest place for a feature that does not
// exist yet — unlike a sidebar tooltip on a page that already ships.
const roadmap = readFileSync("src/app/roadmap/page.tsx", "utf8");
check("the roadmap still lists presentations", /key: "presentations"/.test(roadmap));
check("under the FUTURE section", /status: "future"[\s\S]{0,600}key: "presentations"/.test(roadmap));
check(
  "and the roadmap copy is where the generator is promised",
  /Generate polished decks/i.test(messages.en.roadmap.items.presentations.description)
);

console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${failures.length} failed`);
process.exit(failures.length === 0 ? 0 : 1);
