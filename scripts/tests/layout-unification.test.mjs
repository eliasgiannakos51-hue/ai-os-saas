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
for (const m of ["apps", "images", "videos", "coding"]) {
  checkTrue(`/${m} uses the shared BuildModulePage`, /BuildModulePage/.test(read(`src/app/dashboard/${m}/page.tsx`)));
}

console.log("\n== 4. Marketplace is a list, and uses the shared one ==");
// This section used to assert the OPPOSITE, and the change is the point.
// The marketplace was a "coming soon" empty state with no records, no
// search and no sort, so the honest thing to check was the REASON it had
// no toolbar. V3 Task 6 gave it real listings, which makes it a list like
// every other list here — and the moment a page has records to show, the
// one-pattern promise applies to it.
//
// A stale assertion is worse than none: it would have gone on passing
// against a page that no longer existed, right up until someone deleted
// the empty state it was really describing.
const market = read("src/app/dashboard/marketplace/page.tsx");
const marketBrowse = read("src/components/marketplace/marketplace-browse.tsx");
checkTrue("the page delegates to the browse component", /<MarketplaceBrowse/.test(market));
checkTrue("which builds on the shared ListLayout", /<ListLayout/.test(marketBrowse));
checkTrue("and renders shared EntityCards", /<EntityCard/.test(marketBrowse));
// The specific regression this guards: a second search box or sort
// control hand-rolled next to the shared one.
checkTrue(
  "the page has no toolbar of its own to diverge",
  !/<ListLayout|type="search"/.test(market)
);

console.log("\n== 5. nobody hand-rolls a list toolbar ==");
// The failure this guards: a new page gets its own search box and its own
// sort control, and the one-pattern promise quietly stops being true.
const SURFACES = [
  "src/components/mission/mission-list.tsx",
  "src/components/documents/documents-list.tsx",
  "src/components/favorites/favorites-list.tsx",
  "src/components/modules/generic-list.tsx",
  "src/components/website-builder/website-builder-workspace.tsx",
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
