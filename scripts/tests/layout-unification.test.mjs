// One list pattern, everywhere.
//
// THE RULE: a user learns how ONE list works and thereby knows how all of
// them work. The Website Builder is the reference — "+ New", then
// full-width search, then sort/filters with a result count, then a grid of
// cards — because it is the list people already navigate without
// hesitating.
//
// This file exists because "did we apply it everywhere?" was answered by
// reading a task list, and a task list is not evidence. Worse, the honest
// answer turned out to be "yes, already" — so without a check like this
// the work would have been done a second time, or drift would go unnoticed
// the first time someone hand-rolls a grid on a new page.
//
// It asserts the ROUTE from every list surface to the shared primitive,
// not just that the primitive exists. Most surfaces reach it indirectly:
//
//     13 business modules  -> [module]/page.tsx    -> GenericList -\
//     5 build modules      -> BuildModulePage      -> GenericList --> ListLayout
//     2 workflow pages     -> product/trading      -> GenericList -/
//     Mission Control      -> mission-list.tsx     ------------------> ListLayout
//     Documents            -> documents-list.tsx   ------------------> ListLayout
//     Favorites            -> favorites-list.tsx   ------------------> ListLayout
//     Website Builder      -> the reference        ------------------> ListLayout
//
// Run: node scripts/tests/layout-unification.test.mjs
import { readFileSync, existsSync } from "node:fs";

let pass = 0,
  fail = 0;
function check(name, actual, expected) {
  const a = JSON.stringify(actual),
    e = JSON.stringify(expected);
  if (a === e) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    fail++;
    console.log(`  FAIL  ${name}\n        expected ${e}\n        actual   ${a}`);
  }
}
function checkTrue(name, cond, detail) {
  check(name, Boolean(cond), true);
  if (!cond && detail) console.log(`        ${detail}`);
}
const read = (p) => (existsSync(p) ? readFileSync(p, "utf8") : "");

// THE COMMENTS ARE NOT THE CODE. Section 4 below asserted "its action is
// disabled" and went on passing for a page whose disabled button had been
// deleted, because the file's doc comment still describes what the page USED
// to be. Anything reading for a rendered element reads through this.
const stripComments = (src) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .split("\n")
    .map((l) => (/^\s*(\/\/|\*)/.test(l) ? "" : l))
    .join("\n");

const LAYOUT = read("src/components/ui/list-layout.tsx");

console.log("== 1. the shared primitive is the Website Builder's arrangement ==");
checkTrue("ListLayout exists", LAYOUT.length > 0);
// Order matters: the create action has to come before search, or "where do
// I add one" is a different answer per page — which is what it used to be.
const newAt = LAYOUT.indexOf("{newAction}");
const searchAt = LAYOUT.indexOf('type="search"');
const filtersAt = LAYOUT.indexOf("{filters");
const childrenAt = LAYOUT.indexOf("{children}");
checkTrue("+ New comes first", newAt > 0 && newAt < searchAt);
checkTrue("then search", searchAt > 0 && searchAt < filtersAt);
checkTrue("then sort/filters", filtersAt > 0 && filtersAt < childrenAt);
checkTrue("then the grid", childrenAt > filtersAt);
checkTrue("search is full-width, not a cramped inline box", /className="input pl-10"/.test(LAYOUT));
checkTrue("and labelled for screen readers", /aria-label=\{searchPlaceholder\}/.test(LAYOUT));
// Layout only. A generic filter predicate would hide each list's real
// shape behind an indirection the caller cannot follow.
checkTrue("it owns layout, not filtering", !/\.filter\(/.test(LAYOUT));

console.log("\n== 2. the reference itself uses it ==");
const wb = read("src/components/website-builder/website-builder-workspace.tsx");
checkTrue("Website Builder renders through ListLayout", /<ListLayout/.test(wb));

console.log("\n== 3. every list surface reaches it ==");
// Direct consumers.
for (const [label, file] of [
  ["Mission Control", "src/components/mission/mission-list.tsx"],
  ["Documents", "src/components/documents/documents-list.tsx"],
  ["Favorites", "src/components/favorites/favorites-list.tsx"],
  ["Modules (shared list)", "src/components/modules/generic-list.tsx"],
  // V3 — Autonomous Agents. /dashboard/agents no longer routes through
  // BuildModulePage: it stopped being a tracker of hand-typed rows and
  // became a real feature with its own create flow, run history and
  // per-agent actions. That is exactly the moment a surface hand-rolls its
  // own grid and the pattern quietly forks, so it is asserted here as a
  // direct consumer instead of being dropped from the list.
  ["AI Agents", "src/components/agents/agents-workspace.tsx"],
]) {
  const src = read(file);
  checkTrue(`${label}: imports the primitive`, /from "@\/components\/ui\/list-layout"/.test(src));
  checkTrue(`${label}: actually renders it`, /<ListLayout/.test(src));
}

// Indirect consumers: the module pages don't import ListLayout themselves,
// they route through GenericList. Asserting the hop is what makes this
// test meaningful rather than a spot check on four files.
const generic = read("src/components/modules/generic-list.tsx");
checkTrue("GenericList is the hop for every module page", /<ListLayout/.test(generic));
for (const [label, file] of [
  ["13 business modules", "src/app/dashboard/[module]/page.tsx"],
  ["5 build modules", "src/components/modules/build-module-page.tsx"],
  ["Product workflow", "src/app/dashboard/product-workflow/page.tsx"],
  ["Trading workflow", "src/app/dashboard/trading-workflow/page.tsx"],
]) {
  checkTrue(`${label}: render through GenericList`, /<GenericList/.test(read(file)));
}
// Named individually so a build module quietly hand-rolling its own page
// shows up as that module, not as a count that moved.
// "agents" is deliberately absent — see the AI Agents entry among the
// direct consumers above.
// DERIVED FROM THE REGISTRY, not written out. The hardcoded list went red
// when V4 #19 + #20 moved `coding` out of build-modules.ts and gave it a
// bespoke page — a true change that this check reported as a regression,
// which is the failure mode of a list that names things instead of asking
// where they are. Reading the registry means a new tracker is covered the
// day it is added and a departing one stops being demanded.
//
// "agents" is deliberately not in the registry — see the AI Agents entry
// among the direct consumers above.
const TRACKER_SLUGS = [...read("src/lib/build-modules.ts").matchAll(/slug: "([^"]+)"/g)].map((m) => m[1]);
checkTrue(`the tracker registry was read (${TRACKER_SLUGS.length} modules)`, TRACKER_SLUGS.length >= 5);
for (const m of TRACKER_SLUGS) {
  checkTrue(`/${m} uses the shared BuildModulePage`, /BuildModulePage/.test(read(`src/app/dashboard/${m}/page.tsx`)));
}

console.log("\n== 4. Marketplace is a list like all the others ==");
// IT USED TO HAVE NOTHING TO UNIFY. This section asserted that reason: a
// "coming soon" empty state with a disabled publish button, no records, no
// search, no sort. The agent_templates library has been real since the
// 20260826 migration and the page browses it now, so the claim that holds
// is the ordinary one — it uses the shared toolbar rather than arriving at
// its own arrangement, which is the whole subject of this file.
//
// Read through stripComments, because the old version of this check went on
// passing over a page that no longer had a disabled button: the word was
// still in the doc comment explaining that it once did.
const market = stripComments(
  read("src/app/dashboard/marketplace/page.tsx") +
    "\n" +
    read("src/components/marketplace/template-browser.tsx")
);
checkTrue("the marketplace files were read", market.length > 500, `${market.length} chars`);
checkTrue("it browses through the shared ListLayout", /<ListLayout/.test(market));
checkTrue("it still has an EmptyState for a library with nothing in it", /<EmptyState/.test(market));
checkTrue("nothing is labelled coming soon any more", !/comingSoon/.test(market));
checkTrue("and it has no grid of its own to diverge", !/grid-cols/.test(market));

console.log("\n== 5. nobody hand-rolls a list toolbar ==");
// The failure this guards: a new page gets its own search box and its own
// sort control, and the one-pattern promise quietly stops being true.
const SURFACES = [
  "src/components/mission/mission-list.tsx",
  "src/components/documents/documents-list.tsx",
  "src/components/favorites/favorites-list.tsx",
  "src/components/modules/generic-list.tsx",
  "src/components/website-builder/website-builder-workspace.tsx",
  // Added when the Marketplace stopped being a "coming soon" page. It
  // shipped with its own search box, arranged its own way, for exactly the
  // reason this section exists: nobody writing a new list looks up which
  // toolbar the app already has.
  "src/components/marketplace/template-browser.tsx",
];
for (const file of SURFACES) {
  const src = read(file);
  // A raw search input outside ListLayout means a second, divergent
  // toolbar. ListLayout renders the only one.
  const rawSearchInputs = (src.match(/type="search"/g) ?? []).length;
  check(`${file.split("/").pop()}: no hand-rolled search input`, rawSearchInputs, 0);
}

console.log("\n== 6. what must NOT have changed ==");
// The unification was a layout change only. These are the things that
// were explicitly out of scope, asserted so a future pass cannot quietly
// take them with it.
checkTrue("the globe background still exists", existsSync("src/components/dashboard/dashboard-background.tsx"));
checkTrue("...and is still mounted in the dashboard layout", /DashboardBackground/.test(read("src/app/dashboard/layout.tsx")));
checkTrue("ambient animation is still mounted", /AmbientDots/.test(read("src/app/dashboard/layout.tsx")));
checkTrue("page transitions still wrap the content", /PageTransition/.test(read("src/app/dashboard/layout.tsx")));
// The amber/orange identity lives in the nav item styling.
checkTrue("the amber active state survives", /text-orange-200|orange-300/.test(read("src/components/dashboard/sidebar.tsx")));
// Functionality: the primitive must not have swallowed any of it.
checkTrue("search is still wired by the caller", /onSearchChange/.test(LAYOUT));
checkTrue("filters are still the caller's", /filters\?:/.test(LAYOUT));
checkTrue("and the result count slot survives", /meta\?:/.test(LAYOUT));

console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
