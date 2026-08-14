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
// It also checks the rename did not quietly change any OTHER module's
// empty state, which is the way a per-module override goes wrong.
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
const messages = Object.fromEntries(
  LOCALES.map((l) => [l, JSON.parse(readFileSync(`messages/${l}.json`, "utf8"))])
);

const { loadTs } = await import("./load-ts.mjs");
const { BUILD_MODULES, getBuildModule } = await loadTs("src/lib/build-modules.ts");
const module = getBuildModule("presentations");

console.log("== 1. the module is renamed at its source ==");
check("the module still exists", Boolean(module));
check('its title is "Presentation Notes"', module.title === "Presentation Notes");
check("the slug is unchanged, so no route or link breaks", module.slug === "presentations");
check("the table is unchanged, so no data moves", module.table === "ai_presentations");
// The page header and the browser tab both read config.title, so renaming
// it there is what actually changes what the user sees.
const page = readFileSync("src/app/dashboard/presentations/page.tsx", "utf8");
// The browser tab used to read `title: CONFIG.title`, which is this file's
// English `title` field and therefore English in every locale. It now reads
// `sidebar.items.presentations` — the same translated name the nav link
// uses — so the tab, the nav and the header say one thing rather than two.
// The rename this test protects still works: `sidebarKeyForSlug` derives
// the key from the slug, which is asserted unchanged three lines above.
check(
  "the page takes its title from the shared translated name",
  /pageTitle\("sidebar\.items\.presentations"\)/.test(page)
);
// The <h1> reads the same translated name, derived from the slug. It used
// to read `config.title` — the English string in this file — which put
// "Presentation Notes" at the top of a Greek page even though the rename
// this test protects had been done properly everywhere else.
const buildPage = readFileSync("src/components/modules/build-module-page.tsx", "utf8");
check("and the header does too", /title=\{moduleLabel\}/.test(buildPage));
check(
  "...taking it from the slug, so the rename still propagates",
  /sidebarKeyForSlug\(config\.slug\)/.test(buildPage)
);

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
  check(`${locale}: nor does the empty state`, !PROMISE.test(withoutNegations(m.module.emptyPresentationNotes)));
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
  check(`${locale}: has its own empty state`, Boolean(m.module.emptyPresentationNotes));
  if (locale === "en") continue;
  check(
    `${locale}: the label is genuinely translated`,
    m.sidebar.items.presentations !== messages.en.sidebar.items.presentations
  );
  check(
    `${locale}: the empty state is genuinely translated`,
    m.module.emptyPresentationNotes !== messages.en.module.emptyPresentationNotes
  );
}

console.log("\n== 5. the empty state explains what this is ==");
const empty = messages.en.module.emptyPresentationNotes;
check("it says what the page is for", /keep track of presentations/i.test(empty));
check("it says what it does NOT do", /does not generate slides/i.test(empty));
check("and still tells the user what to do next", /button above/i.test(empty));
// The generic message would have been actively misleading here: it says
// "log your first one" with no hint that logging is ALL this does.
check(
  "it is not the shared message",
  empty !== messages.en.module.emptyWhat
);

console.log("\n== 6. no OTHER module's empty state changed ==");
// The way a per-module override goes wrong: a shared string quietly
// replaced for everyone. Every other module must still get the shared one.
const overridden = BUILD_MODULES.filter((m) => m.emptyKey);
check(`exactly one module overrides its empty state (${overridden.length})`, overridden.length === 1);
check("and it is this one", overridden[0]?.slug === "presentations");
const list = readFileSync("src/components/modules/generic-list.tsx", "utf8");
// The shared string is now `emptyWhat` rather than `noEntries`, because the
// empty state grew from one sentence into three parts — what this is, why
// you want it, and a clickable example. The override still applies to the
// FIRST part only, which is the part that was misleading here: Presentation
// Notes needed to say it does not generate slides, and it did not need a
// different reason-to-care or a different example button.
check(
  "the override replaces only the shared WHAT line",
  /module\.emptyKey \? t\(module\.emptyKey\) : t\("emptyWhat"/.test(list)
);
check(
  "...and the why/example are still shared by every module including this one",
  /why=\{t\("emptyWhy"\)\}/.test(list) && /t\("emptyExample"/.test(list)
);
check(
  "the shared strings still exist for everyone else",
  Boolean(messages.en.module.emptyWhat) &&
    Boolean(messages.en.module.emptyWhy) &&
    Boolean(messages.en.module.emptyExample)
);

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
