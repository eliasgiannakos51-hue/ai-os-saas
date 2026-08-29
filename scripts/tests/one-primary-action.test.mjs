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

// Split from the file reader so section 0 can hand it samples. A checker
// that only ever sees real files is a checker nothing proves can say no.
function controlsInSource(src, file = "<sample>") {
  const stripped = stripComments(src);
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
const BASELINE = {
  "dashboard/[module]/page.tsx": 4,
  "dashboard/agents/page.tsx": 4,
  "dashboard/apps/page.tsx": 4,
  "dashboard/campaigns/page.tsx": 4,
  "dashboard/chat/page.tsx": 2,
  "dashboard/create/page.tsx": 4,
  "dashboard/deep-research/page.tsx": 1,
  "dashboard/images/page.tsx": 4,
  "dashboard/integrations/page.tsx": 2,
  "dashboard/memory/page.tsx": 1,
  "dashboard/mission/page.tsx": 4,
  "dashboard/overview/page.tsx": 1,
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
    src = stripComments(readFileSync(f, "utf8"));
  } catch {
    continue;
  }
  glow += (src.match(/shadow-\[[^\]]*(?:249,\s*115,\s*22|251,\s*191,\s*36|--accent)[^\]]*\]/g) ?? []).length;
  gradients += (src.match(/bg-(?:gradient-to-\w+|\[linear-gradient)/g) ?? []).length;
  gradientText += (src.match(/bg-clip-text/g) ?? []).length;
}
console.log(`        accent box-shadows: ${glow} · gradient backgrounds: ${gradients} · gradient text: ${gradientText}`);
// 48, not the 44 a first scan reported: that one measured only the files
// a page imports, and the layout chain — which every dashboard screen
// draws — carries four more. Same omission as the one that made the Home
// page look like it had a single primary action.
check(`accent box-shadows: ${glow}, ceiling 48`, glow <= 48, String(glow));
check(`gradient backgrounds: ${gradients}, ceiling 13`, gradients <= 13, String(gradients));
// EXACTLY ONE PIECE OF GRADIENT TEXT IN THE PRODUCT, and it is the
// Business Health Score's range label (amber-300 to orange-400, in
// components/overview/health-score-card.tsx). Pinned at one rather than
// floored: a second would be the thing the brief warns about, and zero
// would mean the decision was taken without being recorded here.
check(`gradient text: ${gradientText}, pinned at 1`, gradientText === 1, String(gradientText));

console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${failures.length} failed`);
process.exit(failures.length === 0 ? 0 : 1);
