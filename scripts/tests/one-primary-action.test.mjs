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
// FIVE THINGS THIS FILE GOT WRONG BEFORE IT GOT THEM RIGHT, recorded
// because four of them made the number too SMALL and a too-small number
// is the kind that gets believed:
//
//   1. THE LAYOUT IS PART OF THE PAGE. reachableFrom(page) walks imports,
//      and Next composes layouts rather than importing them — so the
//      dashboard Home measured ONE filled control while the screen has
//      five. The top bar's primary button and the PWA install invitation
//      both live above the page, and a person cannot tell the difference.
//   2. COMMENTS ARE NOT CODE. Prose quoting a class name is not a use of
//      it. Same stripComments four other gates in this directory needed.
//   3. AN ARROW FUNCTION ENDED THE TAG. `<(button|a|Link)\b[^>]*?\/?>`
//      stops at the first `>` in the file, and `onClick={() =>` has one.
//      FORTY-SIX filled accent controls were invisible to this census
//      for as long as it used that pattern, and they were not obscure
//      ones: `+ New` on every module page, all three buttons of the
//      voice recorder, four in Files, four in onboarding. The gate
//      reported "4 filled accent controls" for pages that drew ten and
//      "8" for one that drew thirteen. scripts/lib/jsx-scan.mjs ends a
//      tag where JSX ends it — the first `>` outside brace depth and
//      outside quotes — and section 0 feeds it the three shapes that
//      broke the old one.
//   4. A SCREEN IS A MOMENT, NOT A FILE. The voice recorder draws three
//      full-screen overlays, one filled button each, and never two at
//      once; the paywall is returned INSTEAD of the page body. Charging
//      all of them to the page made every page that can record look
//      three louder than it is. Section 2 splits a page into base,
//      overlay and declared replacement surfaces, each with the same
//      budget of one, and section 3 checks the overlays it found.
//   5. A COUNT IS STILL AN UPPER BOUND WITHIN A SURFACE. Some controls
//      on one surface are mutually exclusive states of the same flow —
//      a list's "+ New" and the form's "Save", an empty-state upload and
//      the toolbar's. No static reader can tell those apart, so where
//      two of them were both filled, the second was demoted rather than
//      excused. The one case where the duplication was pure — the PWA
//      invitation's three identical buttons in one ternary — was fixed
//      in the component instead: it is one button now.

// Run: node scripts/tests/one-primary-action.test.mjs
import { readFileSync } from "node:fs";
import { appEntries, reachableFrom } from "../lib/route-graph.mjs";
import { stripComments } from "../check-mutation-markers.mjs";
import { openingTags, overlaySpans, inSpans } from "../lib/jsx-scan.mjs";

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
  const spans = overlaySpans(stripped);
  const hits = [];
  for (const tag of openingTags(stripped)) {
    if (!FILLED.test(tag.text)) continue;
    const overlay = inSpans(spans, tag.start);
    hits.push({
      file,
      tag: tag.tag,
      at: stripped.slice(0, tag.start).split("\n").length,
      surface: overlay ? `${file}#overlay@${overlay.line}` : "base",
    });
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

// THE ARROW FUNCTION THAT HID FORTY-SIX BUTTONS.
//
// The tag matcher was `<(button|a|Link)\b[^>]*?\/?>` and `[^>]` stops at
// the first `>` in the file — which, in JSX, is very often the one in
// `() =>`. So a control whose handler was written before its class was
// read as far as `onClick={() =` and its className was never seen. The
// census said "4 filled accent controls" about pages that drew ten, and
// the ones it could not see were not obscure: `+ New` on every module
// page, all three buttons of the voice recorder, four in Files, four in
// onboarding. scripts/lib/jsx-scan.mjs ends a tag at the first `>` that
// is outside brace depth and outside quotes, which is where JSX ends it.
check(
  "a handler written before the class does not hide the class",
  controlsInSource('<button onClick={() => setOpen(true)} className="bg-orange-500">go</button>').length === 1
);
check(
  "...nor does a `>` inside a string attribute",
  controlsInSource('<button title="a > b" className="bg-orange-500">go</button>').length === 1
);
check(
  "...nor a nested object in a brace expression",
  controlsInSource('<button style={{ width: 1 }} onClick={() => x({ a: () => 2 })} className="bg-orange-500">go</button>')
    .length === 1
);

// A MODAL IS ITS OWN SCREEN, and the scanner has to say which one a
// control is on. `fixed inset-0` covers the viewport: nothing behind it
// is pressable in the same moment.
const OVERLAY_SAMPLE = [
  '<div className="page">',
  '  <button className="bg-orange-500">page</button>',
  '  <div className="fixed inset-0 z-50">',
  '    <button className="bg-orange-500">modal</button>',
  '  </div>',
  '</div>',
].join("\n");
const sampleSurfaces = controlsInSource(OVERLAY_SAMPLE).map((h) => h.surface);
check(
  "the control outside the overlay is on the base surface",
  sampleSurfaces.filter((s) => s === "base").length === 1,
  JSON.stringify(sampleSurfaces)
);
check(
  "and the one inside it is not",
  sampleSurfaces.filter((s) => s !== "base").length === 1,
  JSON.stringify(sampleSurfaces)
);
// THE OTHER DIRECTION, so "everything is an overlay" cannot pass: a
// control AFTER the overlay closes is back on the page.
const AFTER_SAMPLE = [
  '<div className="page">',
  '  <div className="fixed inset-0 z-50">',
  '    <button className="bg-orange-500">modal</button>',
  '  </div>',
  '  <button className="bg-orange-500">page</button>',
  '</div>',
].join("\n");
check(
  "a control after the overlay closes is on the page again",
  controlsInSource(AFTER_SAMPLE).filter((h) => h.surface === "base").length === 1,
  JSON.stringify(controlsInSource(AFTER_SAMPLE).map((h) => h.surface))
);
// ...AND `fixed` ALONE IS NOT AN OVERLAY. A sticky toolbar is on the page.
check(
  "a fixed element that does not cover the viewport is not an overlay",
  controlsInSource('<div className="fixed bottom-0">\n  <button className="bg-orange-500">x</button>\n</div>')
    .every((h) => h.surface === "base")
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
// TWO TODAY, and it was five when the scanner learnt to read a tag past
// an arrow function. What went, and why, is the whole of the rule this
// file states applied to the chrome itself:
//
//   - the PWA install invitation drew THREE — one per branch of a
//     three-way ternary that has never rendered more than one at a time.
//     They are one button with a computed label and handler now, and it
//     is an accent OUTLINE: an unsolicited card that appears over
//     somebody else's work does not get the loudest control on the
//     screen. That is the "brand-new account" case this file's header
//     named as the worst one, and it is the one that improved.
//   - the cookie banner's accept stays filled and never meets a
//     dashboard page: cookie-consent-banner.tsx returns null on any path
//     under /dashboard.
//
// What remains on a dashboard screen is the top bar's "Make anything",
// on all thirty-nine of them. Every per-page number below is measured
// with the chrome SUBTRACTED, so "1" means one of the page's own — the
// screen carries the global one as well, and that is the decision this
// count records rather than hides.
check(
  `the layout chrome contributes ${chrome.length} filled controls, of which 1 reaches a dashboard page`,
  chrome.length === 2,
  chrome.map((h) => `${h.file}:${h.at}`).join(", ")
);

// ---------------------------------------------------------------------
console.log("\n== 2. one filled accent control per surface ==");
// THE RULE, AND THE THREE KINDS OF SURFACE IT IS MEASURED ON.
//
// V4.6 #4 says one primary action per screen, and a screen is a moment,
// not a file. Three kinds of moment exist in this product and each gets
// its own budget of one:
//
//   base        what the page draws. Everything below, unless it is in
//               one of the other two.
//   overlay     anything inside a `fixed inset-0` element — a modal, a
//               scrim, the voice recorder's full-screen orb. While one
//               is up the page behind it is not pressable, so its
//               filled control is not competing with the page's.
//   replacement a component a page returns INSTEAD of its body. Only
//               the paywall, declared below with the proof that it is
//               one.
//
// This is the fourth thing this file got wrong, and the largest: until
// redesign phase 4 every one of those moments was charged to the page,
// so the voice recorder's three mutually exclusive overlays cost every
// one of the eighteen pages that can record three filled controls each.
//
// THE NUMBERS BELOW ARE ONE, and they are the target rather than a
// ratchet. Ninety-two controls were demoted to accent OUTLINE to get
// here — every save, retry, connect, toggle, "use this" and second step
// of a flow — leaving the one action that STARTS the screen's work
// filled. What that cost is written per page where it is not obvious.
const BASELINE_NOTE = "one per surface; lower to 0 is fine, raising needs a reason written here";
const BASELINE = {
  "dashboard/[module]/page.tsx": 1,
  "dashboard/affiliate/page.tsx": 1,
  "dashboard/agents/page.tsx": 1,
  "dashboard/apps/page.tsx": 1,
  "dashboard/business-health/page.tsx": 1,
  "dashboard/campaigns/page.tsx": 1,
  "dashboard/chat/page.tsx": 1,
  "dashboard/coding/page.tsx": 1,
  "dashboard/create/page.tsx": 1,
  "dashboard/data-analysis/page.tsx": 1,
  "dashboard/deep-research/page.tsx": 1,
  "dashboard/documents/page.tsx": 1,
  "dashboard/files/page.tsx": 1,
  "dashboard/images/page.tsx": 1,
  "dashboard/integrations/page.tsx": 1,
  // ZERO. /memory's one filled control was the paywall's "view plans",
  // and the paywall is a declared replacement surface measured below —
  // the page itself draws none. Nothing was demoted here; the number is
  // what it always was once the surfaces were told apart.
  "dashboard/memory/page.tsx": 0,
  "dashboard/mission/page.tsx": 1,
  "dashboard/overview/page.tsx": 1,
  "dashboard/page.tsx": 1,
  "dashboard/posts/page.tsx": 1,
  "dashboard/predictions/page.tsx": 1,
  "dashboard/presentations/page.tsx": 1,
  "dashboard/product-workflow/page.tsx": 1,
  "dashboard/projects/page.tsx": 1,
  "dashboard/projects/[id]/page.tsx": 1,
  "dashboard/published/page.tsx": 1,
  // ZERO, AND IT IS THE HONEST NUMBER RATHER THAN A WIN. /reflection
  // renders one component, reflection-generator.tsx, whose "write it"
  // button WAS the page's single filled control. The same component is
  // also a panel on product-workflow and trading-workflow, where the
  // page's own primary is the module list's "+ New" — so one component
  // had to be either the loudest thing on one screen or the second
  // loudest on two, and it cannot be both. It is an accent outline
  // everywhere, and /reflection is a page whose only action is outlined.
  // The alternative was a `tone` prop, which moves the class behind a
  // variable and makes this count unreadable — the failure mode
  // CLAUDE.md calls "runtime strings invisible to the compiler".
  "dashboard/reflection/page.tsx": 0,
  "dashboard/settings/page.tsx": 1,
  "dashboard/team/page.tsx": 1,
  "dashboard/trading-journal/page.tsx": 1,
  "dashboard/trading-workflow/page.tsx": 1,
  "dashboard/videos/page.tsx": 1,
  "dashboard/website-builder/page.tsx": 1,
  "dashboard/websites/page.tsx": 1,
  "forgot-password/page.tsx": 1,
  "help/page.tsx": 1,
  "offline/page.tsx": 1,
  "onboarding/page.tsx": 1,
  "reset-password/page.tsx": 1,
};

// A PAYWALL IS NOT THE PAGE IT REPLACES, and unlike an overlay that is
// not visible in the markup — it is a plain card, returned early. So it
// is DECLARED, and the declaration carries the obligation that makes it
// true: every place that renders it must do so from a `return` that
// comes before the caller's last one. Render it inside the main body
// instead and this check goes red, which is the only thing standing
// between a declared exception and a licence.
const REPLACEMENT_SURFACES = [
  {
    file: "src/components/billing/upgrade-required.tsx",
    tag: "<UpgradeRequired",
    budget: 1,
    why: "the lock screen a module shows instead of its list; its 'view plans' link is the only control on it",
  },
];
const replacementFiles = new Set(REPLACEMENT_SURFACES.map((r) => r.file));

const measured = new Map();
const overlays = new Map();
for (const page of pages) {
  const hits = [...reachableFrom([page, ...layoutChain(page)])]
    .flatMap(controlsIn)
    .filter((h) => !chromeKeys.has(`${h.file}:${h.at}`));
  for (const h of hits) {
    if (h.surface === "base") continue;
    if (!overlays.has(h.surface)) overlays.set(h.surface, []);
    if (!overlays.get(h.surface).some((x) => x.at === h.at)) overlays.get(h.surface).push(h);
  }
  measured.set(
    page.replace("src/app/", ""),
    hits.filter((h) => h.surface === "base" && !replacementFiles.has(h.file))
  );
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
  `no page is louder than its baseline (${measured.size} pages measured, ${BASELINE_NOTE})`,
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
console.log("\n== 3. every overlay is a screen too ==");
// The budget the base surface gets, the moments on top of it get as
// well. A modal with two filled buttons is the same defect as a page
// with two, and it was invisible for as long as overlays were charged to
// the page — the page was already over, so the modal never showed up as
// a separate number.
// SIX, NAMED, so the floor is a measurement rather than a round number:
// the Ask-AI modal, the voice recorder's three (permission, listening,
// transcript), the cost-confirmation dialog and the publish dialog.
check(
  `the walk found overlays to check (${overlays.size})`,
  overlays.size >= 6,
  `${overlays.size} — a per-overlay rule checked against no overlays passes for the wrong reason`
);
const loudOverlays = [...overlays.entries()].filter(([, hits]) => hits.length > 1);
check(
  "no overlay draws more than one filled accent control",
  loudOverlays.length === 0,
  loudOverlays
    .map(([s, hits]) => `${s}: ${hits.length} — ${hits.map((h) => `${h.file}:${h.at}`).join(", ")}`)
    .join("\n        ")
);

// ---------------------------------------------------------------------
console.log("\n== 3b. the declared replacement surfaces, and the proof ==");
for (const r of REPLACEMENT_SURFACES) {
  const own = controlsIn(r.file);
  check(
    `${r.file}: ${own.length} filled accent control, budget ${r.budget}`,
    own.length <= r.budget,
    own.map((h) => `${h.file}:${h.at}`).join(", ")
  );
  // THE OBLIGATION. Every caller renders it from an early return.
  const callers = appEntries()
    .concat(["src/components/modules/build-module-page.tsx"])
    .filter((f) => {
      try {
        return stripComments(readFileSync(f, "utf8")).includes(r.tag);
      } catch {
        return false;
      }
    });
  check(
    `${r.tag} is rendered somewhere (${callers.length} callers)`,
    callers.length >= 1,
    "a declared replacement surface nothing renders is a dead exception"
  );
  const inline = callers.filter((f) => {
    const src = stripComments(readFileSync(f, "utf8"));
    const lastReturn = src.lastIndexOf("return (");
    // EVERY occurrence, not the first. A caller that keeps its early
    // return and ALSO draws the paywall in the page body is the exact
    // shape this obligation exists to forbid, and indexOf() would find
    // the innocent one and stop.
    const positions = [];
    for (let at = src.indexOf(r.tag); at !== -1; at = src.indexOf(r.tag, at + 1)) positions.push(at);
    return positions.some((at) => lastReturn === -1 || at > lastReturn);
  });
  check(
    `...and every caller returns it EARLY, instead of the page body`,
    inline.length === 0,
    inline.map((f) => `${f} renders ${r.tag} inside its last return — it is part of that page, not a replacement for it`).join("\n        ")
  );
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
// 46 -> 2, redesign phase 4. The brief said "κανένα glow", and 44 of
// them went: the hover bloom under every filled button, .card-lift's
// orange ring, .glass-card's, .prompt-glow entirely, and the 22px halo
// outside the focus ring. THE TWO THAT REMAIN ARE NOT GLOW and this
// number is the wrong instrument for them — both are
// `0 0 0 1px rgba(accent)`, a one-pixel edge with no blur, on the
// sidebar's active row and the favourite star. scripts/design-census.mjs
// makes that distinction (a shadow counts as glow only when its third
// length is non-zero) and reports ZERO; this pattern cannot, so the
// ceiling is 2 rather than 0 and says why.
check(`accent box-shadows: ${glow}, ceiling 2`, glow <= 2, String(glow));
check(`gradient backgrounds: ${gradients}, ceiling 13`, gradients <= 13, String(gradients));
// TWO, THEN ZERO. The decision this comment asked for was taken in
// redesign phase 4 — "κανένα gradient σε τίτλο" — and both went:
//   1. the health score's range label, bg-clip-text amber-300 to
//      orange-400, now solid text-orange-300
//   2. the Home page's H1, .hero-gradient-text, white through amber into
//      VIOLET (#a855f7) at 3.4rem — the largest thing on the page, and
//      the one the brief had been describing all along. The rule is
//      deleted from globals.css, not merely unused.
// FORBIDDEN NOW, NOT PINNED. A clipped fill has no colour a contrast
// checker can read — the text is a mask over a picture — so every
// contrast gate here had to skip it. Zero is the only number that keeps
// them honest.
check(
  `gradient text: ${gradientText} (${gradientText - cssGradientTextUses} Tailwind, ${cssGradientTextUses} CSS), forbidden`,
  gradientText === 0,
  String(gradientText)
);
// The companion check — "the CSS half of the scan found its classes" —
// is gone with them. It existed because this census had once reported
// the CSS gradient as absent when it was merely unread; with no such
// class declared anywhere, an assertion that one exists would now be
// asserting the defect back into place. What replaces it is the reverse:
// no class may declare it again.
check(
  `no CSS class clips a background to text (${[...cssGradientClasses].join(", ") || "none"})`,
  cssGradientClasses.size === 0,
  "a new .foo { background-clip: text } would put an unmeasurable colour back on a heading"
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
