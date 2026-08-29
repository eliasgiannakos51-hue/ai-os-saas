// Two reported defects, and the invariant that connects them.
//
// 1. THE "SOON" BADGES ARE GONE. Apps, Images, Videos, AI Coding and
//    Presentations were shown greyed out at opacity 0.6, as <button>s with
//    no href and a "Soon" badge. The underlying routes and trackers exist
//    and work as record-keeping, so presenting them as unfinished made the
//    whole product read as unfinished. They are ordinary links again, and
//    the sidebar is back to its pre-restructure grouping.
//
// 2. TOOLTIPS WERE INVISIBLE. Every hint was a native `title` attribute.
//    The original reasoning (no JS, no portal, screen readers announce it)
//    was sound and still produced a feature no user ever saw: the browser
//    waits 1-2 seconds, styles it as an OS chrome popup, shows nothing on
//    keyboard focus, and shows nothing at all on touch. Replaced with a
//    real component that appears in ~120ms.
//
// 3. THE INVARIANT. The Timeline's module filter and the sidebar are
//    driven by different lists (LINKABLE_MODULES vs MAIN_SIDEBAR_GROUPS).
//    The user reported the Timeline still offering filters for modules the
//    sidebar had hidden — the two drifting apart is the actual bug class,
//    and it is asserted here rather than fixed once.
//
// Run:  node scripts/tests/sidebar-and-tooltips.test.mjs
// Live: BASE_URL=http://localhost:3140 node scripts/tests/sidebar-and-tooltips.test.mjs
import { readFileSync, existsSync } from "node:fs";

let pass = 0,
  fail = 0,
  skipped = 0;
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
function checkTrue(name, cond) {
  check(name, Boolean(cond), true);
}

const NAV = "src/lib/sidebar-nav.ts";
const SIDEBAR = "src/components/dashboard/sidebar.tsx";
const PALETTE = "src/components/dashboard/command-palette.tsx";
const nav = readFileSync(NAV, "utf8");
const sidebar = readFileSync(SIDEBAR, "utf8");
const palette = readFileSync(PALETTE, "utf8");

console.log("== 1. the five items are ordinary, clickable links again ==");
const RESTORED = [
  ["Apps", "/dashboard/apps"],
  ["Images", "/dashboard/images"],
  ["Videos", "/dashboard/videos"],
  ["AI Coding", "/dashboard/coding"],
  ["Presentations", "/dashboard/presentations"],
];
for (const [label, href] of RESTORED) {
  checkTrue(`${label} is in the nav config`, nav.includes(`href: "${href}"`));
}
// The exact shape of what was removed.
check("no comingSoon flag remains in the config", /comingSoon/.test(nav), false);
check("no COMING_SOON_HREFS export remains", /COMING_SOON_HREFS/.test(nav), false);
check("the sidebar has no coming-soon branch", /comingSoon/.test(sidebar), false);
check("no 'Soon' badge is rendered", /comingSoonBadge/.test(sidebar), false);
check("no coming-soon toast", /comingSoonToast/.test(sidebar), false);
// The palette used to filter these out; it must not any more.
check("the command palette no longer filters items out", /comingSoon/.test(palette), false);

console.log("\n== 2. the grouping, and the ONE row above it ==");
// WHAT THIS SECTION USED TO PIN, AND WHY IT CHANGED.
//
// It held a revert: an earlier restructure had greyed five modules out
// behind "Soon" badges and moved three items out of the groups as pinned
// rows, and undoing it restored Workspace / Build / Business / Strategy
// / Operations / Marketplace. The badges are the defect this file exists
// for and they are still asserted gone, above.
//
// The eight groups are now four — Daily / Build / My business /
// Settings — named for what somebody is doing rather than for how the
// code is filed. And exactly ONE row sits outside them again: the record
// action, deliberately, because renderItem's `prominent` branch had
// existed since the sidebar was written with a comment about "the three
// daily entry points" and NO call site ever passed it, so every row in
// the menu had identical weight.
//
// This is not the old pinned block coming back by another name, and the
// difference is asserted rather than asserted-about: ONE row, it is a
// link, and it carries no coming-soon shape. A second pinned row is a
// decision somebody has to write down here.
check("PINNED_SIDEBAR_ITEMS is gone from the config", /PINNED_SIDEBAR_ITEMS/.test(nav), false);
check("...and from the command palette", /PINNED_SIDEBAR_ITEMS/.test(palette), false);
const prominentCalls = [...sidebar.matchAll(/renderItem\([\s\S]{0,400}?true,\s*\n?\s*\)/g)];
check("exactly one row is rendered above the groups", prominentCalls.length, 1);
checkTrue(
  "...and it is the record action",
  /label: "New entry"/.test(sidebar) && /CREATE_NAV_ITEM\.href/.test(sidebar),
);
checkTrue(
  "...rendered by the same renderItem as every other row, so it is a real link",
  /function renderItem\(item: SidebarItem, tone: string, prominent = false\)/.test(sidebar),
);

const HEADINGS = ["Daily", "Build", "My business"];
for (const h of HEADINGS) {
  checkTrue(`the "${h}" group exists`, nav.includes(`heading: "${h}"`));
}
checkTrue("Settings is still its own group", /heading: "Settings"/.test(nav));
checkTrue("Daily is the always-open group", /heading: "Daily",\s*\n\s*collapsible: false/.test(nav));

// THE CONDITION ON THE WHOLE RESTRUCTURE. Nineteen log screens left the
// sidebar for one row pointing at /dashboard/records. If they had left
// the command palette with it, the menu would have got shorter by making
// nineteen pages harder to reach — a shorter menu is not the goal, and
// somebody typing "finance" must still land on Finance.
// SPREAD, not merely imported. `/RECORD_DESTINATIONS/.test(palette)`
// stayed true when the spread was deleted, because the import line never
// went away — the same substring-versus-import mistake this repo has now
// made in three separate gates.
checkTrue(
  "the command palette still searches the nineteen the sidebar stopped listing",
  /\.\.\.RECORD_DESTINATIONS/.test(palette),
);
checkTrue("...and the sidebar config is where that list lives", /RECORD_DESTINATIONS/.test(nav));
// An owner-only page in that list would be hidden from the sidebar and
// still one keystroke away here, which is not hiding it — the exact
// mistake visibleGroups exists to prevent.
// WHERE THE ARRAY REALLY ENDS. Bounding at the first "\n];" was still a
// text scan a rename can walk around: emptying the array and moving the
// entries into a second `const` below it leaves every href inside the
// slice. The block ends at its own closing bracket OR at whatever
// top-level declaration comes next, whichever arrives first.
function declarationBlock(source, marker) {
  const start = source.indexOf(marker);
  if (start === -1) return "";
  // source.length is the floor in the spread, so there is no
  // "the list came back empty" branch to get wrong — and nothing here
  // asserts a scanned collection is empty, which the emptiness meta-gate
  // was right to flag in the first writing of this.
  const end = Math.min(
    ...["\n];", "\nconst ", "\nexport ", "\nfunction "]
      .map((token) => source.indexOf(token, start + marker.length))
      .filter((i) => i !== -1),
    source.length,
  );
  return source.slice(start, end);
}
const recordsBlock = declarationBlock(nav, "export const RECORD_DESTINATIONS");
check("no owner-only page hides in the records list", /ownerOnly/.test(recordsBlock), false);
// The six headings that merged away must not linger: a group nobody
// renders is a translation key nobody can reach, which is how
// lib/sidebar-label-keys.ts came to describe a rename that was never
// made.
const GONE = ["Workspace", "Tracking", "Business", "Strategy", "Operations", "Marketplace"];
for (const h of GONE) {
  check(`the "${h}" group is gone`, nav.includes(`heading: "${h}"`), false);
}

console.log("\n== 3. tooltips are a real component, not a title attribute ==");
checkTrue("a Tooltip component exists", existsSync("src/components/ui/tooltip.tsx"));
const tip = readFileSync("src/components/ui/tooltip.tsx", "utf8");
const delay = Number(tip.match(/SHOW_DELAY_MS = (\d+)/)?.[1] ?? Infinity);
checkTrue(`it appears in under 300ms (${delay}ms configured)`, delay < 300);
checkTrue("it renders role=tooltip", /role="tooltip"/.test(tip));
checkTrue("it shows on keyboard focus too", /onFocusCapture/.test(tip));
checkTrue("it is portalled, so it escapes overflow clipping", /createPortal/.test(tip));
checkTrue("it cannot block the pointer", /pointer-events-none/.test(tip));
// The `display: contents` wrapper has no box; measuring it put every
// tooltip off-screen at (10,-15). Measuring the child is the fix.
checkTrue("it measures the anchor child, not the contents wrapper", /firstElementChild/.test(tip));
checkTrue("...and refuses to place against a collapsed rect", /r\.width === 0 && r\.height === 0/.test(tip));
checkTrue("it is clamped into the viewport", /window\.innerHeight/.test(tip));
// The sidebar must USE it, and must not also set a native title (two
// tooltips means the OS one appears a second later, on top).
checkTrue("the sidebar renders it", /<Tooltip[\s\S]{0,120}content=\{hint\}/.test(sidebar));
check("the sidebar sets no native title on nav links", /title=\{hint\}/.test(sidebar), false);

console.log("\n== 4. the Timeline filter and the sidebar agree ==");
// The reported symptom was the Timeline still offering filters for modules
// the sidebar had hidden. Now that nothing is hidden, every filterable
// module must be reachable from the sidebar — otherwise a user can filter
// by something they cannot navigate to.
// LINKABLE_MODULES is composed, not literal:
//   knowledge-graph.ts -> [...CLASSIFIER_MODULES, ...BUILD_MODULES]
//   classifier-modules.ts -> [IDEAS_MODULE, ...MODULES]   (lib/modules.ts)
//   build-modules.ts      -> its own list
// so the slugs have to be read from the files that actually declare them.
// Parsing knowledge-graph.ts alone finds zero, which is a test that passes
// by measuring nothing.
const filterSlugs = ["src/lib/modules.ts", "src/lib/build-modules.ts"].flatMap((f) =>
  [...readFileSync(f, "utf8").matchAll(/slug: "([a-z-]+)"/g)].map((m) => m[1])
);
// Ideas is IDEAS_MODULE in classifier-modules.ts and lives at /dashboard.
filterSlugs.push("ideas");
checkTrue(`the Timeline filter list was parsed (${filterSlugs.length} modules)`, filterSlugs.length > 15);
const navHrefs = new Set([...nav.matchAll(/href: "([^"]+)"/g)].map((m) => m[1]));
const unreachable = filterSlugs.filter(
  (s) => !navHrefs.has(`/dashboard/${s}`) && !navHrefs.has("/dashboard")
);
check("every filterable module is reachable from the sidebar", unreachable, []);

console.log("\n== 5. live: what the sidebar actually renders ==");
const BASE = process.env.BASE_URL || "http://localhost:3140";
let reachable = false;
try {
  const r = await fetch(`${BASE}/dev-sidebar`, { signal: AbortSignal.timeout(3000) });
  reachable = r.ok;
} catch {
  /* no harness */
}
if (!reachable) {
  skipped++;
  console.log(`  SKIP  no /dev-sidebar harness at ${BASE} — the live half did NOT run.`);
  console.log("        That harness is a scratch page, not committed. The source");
  console.log("        checks above are what run in CI; the rendered proof (opacity,");
  console.log("        href, tooltip latency) was captured by hand during the fix.");
} else {
  const html = await fetch(`${BASE}/dev-sidebar`).then((r) => r.text());
  for (const [label, href] of RESTORED) {
    checkTrue(`${label} renders as <a href="${href}">`, html.includes(`href="${href}"`));
  }
  check("no 'Soon' badge in the rendered markup", />Soon</.test(html), false);
}

console.log(
  `\n${fail === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${fail} failed${skipped ? `, ${skipped} SKIPPED` : ""}`
);
process.exit(fail === 0 ? 0 : 1);
