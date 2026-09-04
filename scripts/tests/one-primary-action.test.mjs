// ONE FILLED ACCENT CONTROL PER SCREEN — and where that is not true yet.
//
// A filled orange button says "this is the thing to press". Six of them
// on one screen says nothing at all, which is the state this file was
// written to measure and then to stop getting worse.
//
// WHAT COUNTS. A filled accent surface — bg-orange-500, bg-orange-400 or
// bg-amber-500 with NO opacity modifier — on an element a person can
// press. `bg-orange-500/10` is a tint behind a card and is not counted;
// the rule is about one control being louder than the rest, so a wash
// that is quieter than everything cannot break it.
//
// THREE THINGS THIS FILE GOT WRONG BEFORE IT GOT THEM RIGHT, recorded
// because each of them made the number too small and a too-small number
// is the kind that gets believed:
//
//   1. THE LAYOUT IS PART OF THE PAGE. reachableFrom(page) walks imports,
//      and Next composes layouts rather than importing them — so the
//      dashboard Home measured ONE filled control while the screen has
//      five. The top bar's primary button and the PWA install invitation
//      both live above the page, and a person cannot tell the difference.
//   2. COMMENTS ARE NOT CODE. Prose quoting a class name is not a use of
//      it. Same stripComments four other gates in this directory needed.
//   3. A COUNT IS AN UPPER BOUND, NOT A SCREENSHOT. Several of these are
//      mutually exclusive at runtime — upgrade-required renders INSTEAD
//      of the list, out-of-credits only when the balance is gone, the
//      cookie banner only before consent. So "8" means "this page can
//      show up to 8", not "8 are on screen together". It is still the
//      right thing to hold down: a page that can be that loud has no
//      single primary action, and the loudest combination is the one a
//      brand-new account meets — cookie banner, install invitation and
//      an empty balance all at once.
//
// Run: node scripts/tests/one-primary-action.test.mjs
import { readFileSync } from "node:fs";
import { appEntries, reachableFrom } from "../lib/route-graph.mjs";
import { stripComments } from "../check-mutation-markers.mjs";

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

const FILLED = /\bbg-(?:orange-400|orange-500|amber-500)(?![/\w-])/;

// AN IMPORT LINE IS NOT A USE, and the census below could not tell.
//
// `bg-(?:gradient-to-\w+|\[linear-gradient)` matches inside
// `import { X } from "./styles/bg-gradient-to-r"`, and so do the
// bg-clip-text and glow patterns against a path or a token named after
// the class. No such import exists in this repository today, which is
// exactly the problem: the census numbers were right by luck rather than
// by construction, and the first file to import a helper named after a
// utility would have inflated them silently.
//
// The button scan never had this fault — it requires a `<button`,
// `<a` or `<Link` JSX tag, and an import statement has none — but it is
// fed the same stripped source so there is one rule, proved once, in
// section 0.
function stripCode(src) {
  return stripComments(src)
    .split("\n")
    .map((line) => (/^\s*import\b/.test(line) || /^\s*export .* from ["']/.test(line) ? "" : line))
    .join("\n");
}

// Split from the file reader so section 0 can hand it samples. A checker
// that only ever sees real files is a checker nothing proves can say no.
function controlsInSource(src, file = "<sample>") {
  const stripped = stripCode(src);
  const hits = [];
  for (const m of stripped.matchAll(/<(button|a|Link)\b[^>]*?\/?>/gs)) {
    if (FILLED.test(m[0])) {
      hits.push({ file, tag: m[1], at: stripped.slice(0, m.index).split("\n").length });
    }
  }
  return hits;
}

function controlsIn(file) {
  try {
    return controlsInSource(readFileSync(file, "utf8"), file);
  } catch {
    return [];
  }
}

// Every layout above a page, innermost last. Not imported by the page —
// the framework composes them — so they have to be added by path.
function layoutChain(page) {
  const parts = page.split("/");
  const out = [];
  for (let i = 2; i < parts.length; i++) {
    const l = `${parts.slice(0, i).join("/")}/layout.tsx`;
    try {
      readFileSync(l, "utf8");
      out.push(l);
    } catch {
      /* no layout at this level */
    }
  }
  return out;
}

// ---------------------------------------------------------------------
console.log("== 0. the instrument, fed samples it must get right ==");
// TWO CLAUSES OF THIS FILE WERE INERT, and its own mutation suite is what
// said so: breaking the comment-stripping and breaking the layout walk
// both left the gate green. Neither was load-bearing, because no real
// file happened to exercise either — a check that cannot go red is not a
// check, it is a sentence. Samples fix that: they exercise the reader
// directly, so the behaviour is asserted rather than assumed to be
// reached.
check(
  "a filled accent button is counted",
  controlsInSource('<button className="bg-orange-500 px-3">go</button>').length === 1
);
check(
  "a Link is too",
  controlsInSource('<Link href="/x" className="bg-orange-500">go</Link>').length === 1
);
check(
  "a TINT is not — bg-orange-500/10 is a wash, not a primary action",
  controlsInSource('<button className="bg-orange-500/10">go</button>').length === 0
);
check(
  "nor is a filled accent on something you cannot press",
  controlsInSource('<div className="bg-orange-500" />').length === 0
);
// THE CLAUSE THE MUTATION SUITE CAUGHT AS INERT.
check(
  "a button inside a // comment is not a button",
  controlsInSource('// <button className="bg-orange-500">go</button>\nconst x = 1;').length === 0
);
check(
  "...nor one inside a block comment",
  controlsInSource('/* <button className="bg-orange-500">go</button> */\nconst x = 1;').length === 0
);
check(
  "...nor one in a JSX comment explaining the rule",
  controlsInSource('{/* never write <button className="bg-orange-500"> twice */}').length === 0
);

// AN IMPORT LINE IS NOT A USE. Named here because the same mistake was
// made four times in an earlier pass: a file's import list mentions the
// thing it is about, and a scan that reads the whole file counts the
// mention. The button scan cannot make it (an import has no JSX tag) and
// these samples say so out loud; the census below CAN, which is why both
// go through stripCode().
check(
  "a default import is not a button",
  controlsInSource('import Link from "next/link";').length === 0
);
check(
  "nor is a named one",
  controlsInSource('import { Link } from "next/link";').length === 0
);
check(
  "nor is an import from a path named after the class",
  controlsInSource('import { x } from "./styles/bg-orange-500";').length === 0
);
// THE CENSUS COULD, AND THAT IS THE ONE WORTH PROVING. Three separate
// patterns, each of which matches inside a module path.
const CENSUS_IMPORTS = [
  'import { X } from "./styles/bg-gradient-to-r";',
  'import { clip } from "./bg-clip-text";',
  'import { glow } from "./shadow-[0_0_16px_rgba(249,115,22,0.35)]";',
].join("\n");
const stripped = stripCode(CENSUS_IMPORTS);
check(
  "and the census counts none of the three import lines that look like classes",
  (stripped.match(/bg-(?:gradient-to-\w+|\[linear-gradient)/g) ?? []).length === 0 &&
    (stripped.match(/bg-clip-text/g) ?? []).length === 0 &&
    (stripped.match(/shadow-\[[^\]]*249,\s*115,\s*22[^\]]*\]/g) ?? []).length === 0,
  JSON.stringify(stripped)
);
// ...while a real one on a real element still counts, so the stripper
// cannot have simply blanked everything.
const REAL = '<div className="bg-gradient-to-br shadow-[0_0_16px_rgba(249,115,22,0.35)]" />';
check(
  "but a real gradient and a real glow on an element still do",
  (stripCode(REAL).match(/bg-gradient-to-\w+/g) ?? []).length === 1 &&
    (stripCode(REAL).match(/shadow-\[[^\]]*249,\s*115,\s*22[^\]]*\]/g) ?? []).length === 1
);

// THE OTHER INERT CLAUSE. layoutChain() adds the layouts Next composes
// above a page; today all of their filled controls are subtracted again
// as chrome, so breaking the walk changed no number and the suite stayed
// green. It is asserted directly instead — the day a route grows its own
// layout with a button in it, this is what has been keeping the walk
// alive.
const dashChain = layoutChain("src/app/dashboard/records/page.tsx");
check(
  `the layout walk finds both layouts above a dashboard page (${dashChain.length})`,
  dashChain.length === 2 &&
    dashChain[0] === "src/app/layout.tsx" &&
    dashChain[1] === "src/app/dashboard/layout.tsx",
  dashChain.join(", ") || "none — the walk found no layouts at all"
);
check(
  "and only the root one above a page outside /dashboard",
  JSON.stringify(layoutChain("src/app/help/page.tsx")) === JSON.stringify(["src/app/layout.tsx"]),
  layoutChain("src/app/help/page.tsx").join(", ")
);

const pages = appEntries().filter((f) => /\/page\.tsx$/.test(f));

// ---------------------------------------------------------------------
console.log("\n== 1. the scan reached the pages and the chrome above them ==");
check(
  `the app was walked (${pages.length} pages)`,
  pages.length >= 50,
  `${pages.length} — every per-page assertion below is vacuous on an empty list`
);
const chrome = [...reachableFrom(["src/app/layout.tsx", "src/app/dashboard/layout.tsx"])].flatMap(
  controlsIn
);
const chromeKeys = new Set(chrome.map((h) => `${h.file}:${h.at}`));
// FOUR TODAY: the top bar's primary button, the two in the PWA install
// invitation, and the cookie banner's accept. Pinned rather than floored
// because this set is what every single dashboard page pays before it
// draws anything of its own — it is the most expensive four controls in
// the product, and it should be a decision to change the number.
check(
  `the layout chrome contributes ${chrome.length} filled controls to every dashboard page`,
  chrome.length === 4,
  chrome.map((h) => `${h.file}:${h.at}`).join(", ")
);

// ---------------------------------------------------------------------
console.log("\n== 2. no page gains a filled accent control ==");
// A RATCHET, NOT THE TARGET. The target is one per screen. Twenty-seven
// pages are above it today and getting there is a design decision per
// page, not something a test can do — so this holds the line where it is
// and every number in it may only ever go DOWN. Lower one in the same
// commit that removes the button; never raise one.
//
// TWO WENT DOWN, and this is the record of why: create and mission were
// both 4 and are both 3, because credits/out-of-credits-notice.tsx's
// "buy credits" Link stopped being `bg-orange-500` and became an accent
// OUTLINE. That component is rendered inside create-chat, create-studio,
// mission-form, problem-notice and deep-research, so its fill competed
// with whatever primary action the host screen already had — on the
// dashboard Home, literally: 2 measured against a baseline of 1. The
// notice keeps its orange rule, wash and icon badge; only the fill went.
const BASELINE = {
  "dashboard/[module]/page.tsx": 4,
  "dashboard/agents/page.tsx": 4,
  "dashboard/apps/page.tsx": 4,
  "dashboard/campaigns/page.tsx": 4,
  "dashboard/chat/page.tsx": 2,
  "dashboard/create/page.tsx": 3,
  "dashboard/deep-research/page.tsx": 1,
  "dashboard/images/page.tsx": 4,
  "dashboard/integrations/page.tsx": 2,
  "dashboard/memory/page.tsx": 1,
  "dashboard/mission/page.tsx": 3,
  // 1 -> 0. The Home page's one filled accent control was the next-action
  // card's "Go there →", and it is now an accent OUTLINE: the screen
  // already carries a filled accent button from the layout chrome (the
  // top bar's "Make anything", on all thirty-nine pages), so Home was the
  // only screen of six with two — measured by accent-census on the real
  // page, 150x44 and 129x44. V4.6 #4's rule is one primary action per
  // SCREEN; it had been applied per CARD.
  "dashboard/overview/page.tsx": 0,
  "dashboard/page.tsx": 3,
  "dashboard/presentations/page.tsx": 4,
  "dashboard/product-workflow/page.tsx": 4,
  "dashboard/published/page.tsx": 1,
  "dashboard/reflection/page.tsx": 1,
  "dashboard/settings/page.tsx": 8,
  "dashboard/team/page.tsx": 1,
  "dashboard/trading-workflow/page.tsx": 4,
  "dashboard/videos/page.tsx": 4,
  "dashboard/website-builder/page.tsx": 2,
  "dashboard/websites/page.tsx": 4,
  "forgot-password/page.tsx": 1,
  "help/page.tsx": 1,
  "offline/page.tsx": 1,
  "reset-password/page.tsx": 2,
};

const measured = new Map();
for (const page of pages) {
  const hits = [...reachableFrom([page, ...layoutChain(page)])]
    .flatMap(controlsIn)
    .filter((h) => !chromeKeys.has(`${h.file}:${h.at}`));
  measured.set(page.replace("src/app/", ""), hits);
}

const over = [];
for (const [page, hits] of measured) {
  const allowed = BASELINE[page] ?? 0;
  if (hits.length > allowed) {
    over.push(
      `${page}: ${hits.length} filled accent controls, baseline ${allowed}\n          ` +
        hits.map((h) => `<${h.tag}> ${h.file}:${h.at}`).join("\n          ")
    );
  }
}
check(
  `no page is louder than its baseline (${measured.size} pages measured)`,
  over.length === 0,
  over.join("\n        ")
);

// THE OTHER DIRECTION, so a baseline cannot outlive the button it was
// written for. A number left high after the control is gone is a licence
// to add a different one back, silently.
const stale = Object.keys(BASELINE).filter((page) => {
  const hits = measured.get(page);
  return !hits || hits.length < BASELINE[page];
});
check(
  "and no baseline is higher than the page needs",
  stale.length === 0,
  stale
    .map((p) => `${p}: baseline ${BASELINE[p]}, actually ${measured.get(p)?.length ?? "page is gone"} — lower it`)
    .join("\n        ")
);

// ---------------------------------------------------------------------
console.log("\n== 3. the pages already at one may not grow to two ==");
// The rule stated as a rule, on the pages that already keep it. This is
// what the whole file is for; section 2 is the road to it.
const AT_TARGET = Object.entries(BASELINE)
  .filter(([, n]) => n <= 1)
  .map(([p]) => p);
check(`there are pages at the target to defend (${AT_TARGET.length})`, AT_TARGET.length >= 5);
for (const page of AT_TARGET) {
  const n = measured.get(page)?.length ?? 0;
  check(`${page}: ${n} filled accent control`, n <= 1, String(n));
}

// ---------------------------------------------------------------------
console.log("\n== 4. the glow and the gradients, counted ==");
// Not a rule yet — a census, ratcheted so it cannot grow while the
// decision about it is pending. Every number here was measured, not
// estimated.
const allFiles = new Set(
  pages.flatMap((p) => [...reachableFrom([p, ...layoutChain(p)])])
);
let glow = 0;
let gradients = 0;
let gradientText = 0;
for (const f of allFiles) {
  let src;
  try {
    src = stripCode(readFileSync(f, "utf8"));
  } catch {
    continue;
  }
  glow += (src.match(/shadow-\[[^\]]*(?:249,\s*115,\s*22|251,\s*191,\s*36|--accent)[^\]]*\]/g) ?? []).length;
  gradients += (src.match(/bg-(?:gradient-to-\w+|\[linear-gradient)/g) ?? []).length;
  gradientText += (src.match(/bg-clip-text/g) ?? []).length;
}
// AND THE ONE WRITTEN IN CSS RATHER THAN IN TAILWIND, which this census
// reported as not existing.
//
// It counted `bg-clip-text` in .tsx and stopped there, so it found ONE
// piece of gradient text — the health score's range label, amber into
// orange — and the conclusion drawn from it was that the brief's
// complaint about "the pink/purple gradient in the title" did not hold.
// It did hold. The Home page's H1 carries `.hero-gradient-text`, declared
// in globals.css as white -> #ffd9a0 -> #f97316 -> #a855f7: white,
// through amber, into violet, at 3.4rem, and it is the largest thing on
// the page. A scan that only reads one of the two ways a codebase can
// clip a background to text will always be able to say the other one is
// absent.
const cssText = readFileSync("src/app/globals.css", "utf8");
const cssGradientClasses = new Set(
  [...cssText.matchAll(/^\.([\w-]+)\s*\{[^}]*?background-clip:\s*text/gms)].map((m) => m[1])
);
let cssGradientTextUses = 0;
for (const f of allFiles) {
  let src;
  try {
    src = stripCode(readFileSync(f, "utf8"));
  } catch {
    continue;
  }
  for (const cls of cssGradientClasses) {
    cssGradientTextUses += (src.match(new RegExp(`\\b${cls}\\b`, "g")) ?? []).length;
  }
}
gradientText += cssGradientTextUses;
console.log(`        accent box-shadows: ${glow} · gradient backgrounds: ${gradients} · gradient text: ${gradientText}`);
// 48, not the 44 a first scan reported: that one measured only the files
// a page imports, and the layout chain — which every dashboard screen
// draws — carries four more. Same omission as the one that made the Home
// page look like it had a single primary action.
// A RATCHET, NOT A ROUND NUMBER. 48 was two above what the tree held, so
// one more glow anywhere passed unseen — the mutation suite proved it
// ("a glow is added" survived). The ceiling is the count measured on
// 2026-09-03; lowering it is free, raising it needs a reason here.
check(`accent box-shadows: ${glow}, ceiling 46`, glow <= 46, String(glow));
check(`gradient backgrounds: ${gradients}, ceiling 13`, gradients <= 13, String(gradients));
// TWO PIECES OF GRADIENT TEXT, and the second is the one the brief was
// about all along:
//   1. the health score's range label — bg-clip-text, amber-300 to
//      orange-400, in components/overview/health-score-card.tsx
//   2. the Home page's H1 — .hero-gradient-text, white through amber into
//      VIOLET (#a855f7), at 3.4rem, the largest thing on the page
// Pinned at two rather than floored: a third is the thing the brief warns
// about, and going to one means a decision was taken and should be
// recorded here.
check(
  `gradient text: ${gradientText} (${gradientText - cssGradientTextUses} Tailwind, ${cssGradientTextUses} CSS), pinned at 2`,
  gradientText === 2,
  String(gradientText)
);
check(
  `the CSS gradient-text classes were found (${[...cssGradientClasses].join(", ") || "NONE"})`,
  cssGradientClasses.size >= 1,
  "a scan that finds no class counts no uses of it, and reports the CSS half as absent"
);

// ---------------------------------------------------------------------
console.log("\n== 5. how many different accent shades the product uses ==");
// FIFTEEN. Eight oranges and seven ambers, from orange-200 to orange-950.
//
// This is not the same complaint as the filled-button count and it is
// worth keeping separate: two buttons both in bg-orange-500 compete for
// attention, while orange-400 next to orange-500 next to amber-400 reads
// as three different meanings that turn out to be none. The count is
// capped where it stands rather than reduced, because which shades merge
// is a design decision.
//
// NOT A THEME BUG, checked before it was called one. tailwind.config.ts
// deliberately routes textColor and borderColor through theme tokens and
// leaves backgroundColor's orange-500 on Tailwind's own palette — its
// comment gives the measurement (7.49:1 as a filled button with black
// text) and scripts/tests/light-theme-contrast.test.mjs holds the rest.
const shadeCounts = new Map();
for (const f of allFiles) {
  let src;
  try {
    src = stripCode(readFileSync(f, "utf8"));
  } catch {
    continue;
  }
  for (const m of src.matchAll(/\b(?:orange|amber)-([0-9]{2,3})\b/g)) {
    shadeCounts.set(m[0], (shadeCounts.get(m[0]) ?? 0) + 1);
  }
}
const shades = [...shadeCounts].sort((a, b) => b[1] - a[1]);
console.log(`        ${shades.map(([k, v]) => `${k}(${v})`).join(" ")}`);
check(
  `the shade scan found shades (${shades.length})`,
  shades.length >= 5,
  "a ceiling checked against nothing passes for the wrong reason"
);
check(`${shades.length} distinct accent shades, ceiling 15`, shades.length <= 15, shades.map(([k]) => k).join(", "));

console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${failures.length} failed`);
process.exit(failures.length === 0 ? 0 : 1);
