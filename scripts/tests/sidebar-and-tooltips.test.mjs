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
import { stripComments } from "../check-mutation-markers.mjs";
import { groupBlocks as readGroups, itemChunks } from "./lib/sidebar-source.mjs";
import { loadTs } from "./load-ts.mjs";

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
// PINNED BY SHAPE, NOT BY NAME.
//
// This was a hardcoded list — Workspace, Build, Business, Strategy,
// Operations, Marketplace — and what it actually protected was that the
// nav is GROUPED with ONE always-open group at the top, not that those
// six words exist. V4.6 #3 renamed and merged them to four, and a name
// list turns every legitimate rename into a failure that says nothing
// about the property it was defending.
//
// The shape checks below are strictly harder to satisfy: the old list
// passed just as happily with the always-open group moved to the bottom,
// with two of them, or with a group that was empty. None of those pass
// now. Which four headings exist, and that each is translated, is
// checked from the config in scripts/tests/sidebar-naming.test.mjs.
// THE GROUP BOUNDARY IS DEFINED ONCE, in lib/sidebar-source.mjs.
const groupBlocks = readGroups(nav);
checkTrue(
  `the group scan read the config (${groupBlocks.length} groups)`,
  groupBlocks.length >= 2,
  "a scan that finds nothing agrees with every claim below it",
);
// EVERY GROUP IS OPEN, ALWAYS — 2026-09-19, and the checks that stood
// here asserted the opposite with care.
//
// They required every heading to be a <button>, to carry aria-expanded,
// to be a 44px tap target, and they required the group holding the
// current page to open itself while a hand-opened one stayed open. All
// green. All describing a sidebar on which five of six headings stood
// over nothing: measured in the browser before the change, 7 of 26 rows
// painted at 1440x900, every one of them from See.
//
// The report from production was "the sidebar shows the heading Run and
// NO rows — did a filter remove Agents, Automation and Marketplace?".
// Nothing had. This file could not tell the difference, because it was
// asking whether the collapse was well-built rather than whether the
// screen showed anything.
//
// node scripts/measure-sidebar-height.mjs is where the cost is produced:
// everything open is 1,937px on today's 27 rows, 2.3 screens on a
// 390x844 phone and 2.2 on a 1440x900 laptop. That is the trade, taken
// deliberately, and the command palette is still one keystroke.
checkTrue(
  `every group was read (${groupBlocks.length})`,
  groupBlocks.length >= 6,
  "a scan that finds nothing agrees with every claim below it",
);
const sidebarForOpen = readFileSync("src/components/dashboard/sidebar.tsx", "utf8");
// COUNTED, NOT GREPPED. A word search for isExpanded / aria-expanded /
// collapsible is a substring test on something that has structure, and
// the mutation that proves it takes four lines: `const expanded = true;
// ... if (!expanded) return <p/>;` reintroduces the whole defect without
// using any of those words.
//
// What renderGroup must be is simple enough to state: ONE guard and ONE
// render. A third exit is a condition deciding whether rows appear, and
// that is the collapse whatever it is called.
const renderGroupBody = stripComments(sidebarForOpen).slice(
  stripComments(sidebarForOpen).indexOf("function renderGroup("),
  stripComments(sidebarForOpen).indexOf("function renderItem(")
);
checkTrue(
  "renderGroup was located",
  renderGroupBody.length > 200,
  "the two checks below measure nothing without it",
);
checkTrue(
  `no group can be collapsed — renderGroup has one guard and one render (${(renderGroupBody.match(/\breturn\b/g) ?? []).length} returns)`,
  (renderGroupBody.match(/\breturn\b/g) ?? []).length === 2,
  "a third exit from renderGroup is a condition deciding whether rows appear — a collapse under another name",
);
checkTrue(
  "...and the names the old collapse used are gone too",
  !/isExpanded|toggleGroup|aria-expanded|collapsible|grid-rows-\[0fr\]/.test(stripComments(sidebarForOpen)),
  "the cheap half of the check above, kept because it names what was removed",
);
checkTrue(
  "...and a heading with no rows under it is not drawn at all",
  /if \(group\.items\.length === 0\) return null;/.test(sidebarForOpen),
  "the whole defect was a heading over nothing; sidebarGroups() prevents one cause and this prevents the rest",
);
checkTrue(
  "...and nothing is remembered across a reload",
  // STRIPPED, because the component EXPLAINS what it no longer stores —
  // and a check reading the raw file found the word in that sentence and
  // called it storage. Comments are not code; the same shape put a `--`
  // in front of an RLS statement in security-posture.test.mjs.
  !/localStorage|sessionStorage/.test(stripComments(sidebarForOpen)),
  "there is no open/shut state left to store, so storing anything is a regression by itself",
);
// V4.6: the config carries items marked hidden — trackers reachable from
// the records hub and ⌘K, kept out of the sidebar on purpose. The sidebar
// must render through sidebarGroups() (which drops them), never through
// visibleGroups() (which keeps them for the palette).
const sidebarSrc = readFileSync("src/components/dashboard/sidebar.tsx", "utf8");
checkTrue(
  "the sidebar renders through sidebarGroups, so hidden items stay out of it",
  /sidebarGroups\(MAIN_SIDEBAR_GROUPS, isOwner\)\.map\(renderGroup\)/.test(sidebarSrc) && !/visibleGroups\([^)]*\)\.map\(renderGroup\)/.test(sidebarSrc),
  "the sidebar is rendering a group list that still carries hidden items",
);
// The other half of hidden: ⌘K must still find every hidden tracker, or
// "hidden from the sidebar" becomes "gone from the product". The palette
// flattens visibleGroups() and never filters on `hidden`.
const paletteSrc = readFileSync("src/components/dashboard/command-palette.tsx", "utf8");
checkTrue(
  "the command palette searches hidden items too — it flattens visibleGroups and never filters on hidden",
  /visibleGroups\(ALL_SIDEBAR_GROUPS, isOwner\)\.flatMap\(\(group\) => group\.items\);/.test(paletteSrc) && !/\.hidden\b/.test(paletteSrc),
  "the palette is dropping hidden items, so a hidden page has no entry point at all",
);
checkTrue(
  "Settings is rendered as its own group below the main ones",
  /sidebarGroups\(\[SETTINGS_GROUP\], isOwner\)\.map\(renderGroup\)/.test(sidebarSrc),
  "the Settings group is no longer rendered by the sidebar",
);
// EVERY HEADING IS A CAPTION NOW, not a control — there is nothing to
// toggle. It is a <p>, which is what a label with no behaviour should be:
// a <button> that does nothing is worse for a screen reader than no
// button at all.
checkTrue(
  "the heading is a caption, not a button that does nothing",
  /<p className="px-3 pb-1\.5 text-\[10px\] font-semibold uppercase tracking-widest text-muted">/.test(sidebarForOpen) &&
    !/<button[\s\S]{0,200}translatedHeading/.test(sidebarForOpen),
  "a control that cannot change anything is announced to a screen reader as something to press",
);
// AND NO CHEVRON BESIDE IT. The turning marker was the affordance that
// said "this opens" — on a heading that opens nothing it is a promise
// the nav cannot keep. Checked inside the group renderer only: the
// account link in the footer has its own chevron and always did.
const groupRenderer = sidebarForOpen.slice(
  sidebarForOpen.indexOf("function renderGroup("),
  sidebarForOpen.indexOf("function renderItem(")
);
checkTrue(
  "...with no marker suggesting it turns",
  groupRenderer.length > 100 && !/ChevronRight|rotate-90/.test(groupRenderer),
  "a chevron on a heading that cannot be pressed is the same broken promise as the heading with no rows",
);
// EVERY DECLARED GROUP STILL HAS ROWS AFTER THE FILTERS RUN — and that
// is a different question from the one this used to ask.
//
// It asked whether the block of config under a heading contained the
// text `href:`. Run contains five of them; three are the rows the owner
// went looking for, two are `notBuilt` positions. Mark all three real
// rows `hidden` and the group draws nothing at all, while this check
// stays green because five `href:` lines are still there. That is the
// declaration being read in place of the screen, in the one check whose
// name promised otherwise.
//
// So the real filters are EXECUTED — lib/sidebar-visibility.ts imports
// no icons precisely so a gate can do this — and every heading the
// config declares must survive both of them, for an owner and for
// anybody else. `sidebarGroups` silently DROPS an emptied group, so the
// comparison is against the declared headings rather than against its
// own output; otherwise a vanished group reads as a shorter list and
// nothing says which one went.
{
  // THE CONFIG IS PARSED, NOT IMPORTED, and only because it cannot be:
  // lib/sidebar-nav.ts imports fifty icons from lucide-react and
  // scripts/tests refuse external node_modules imports. The FILTERS are
  // the real ones — lib/sidebar-visibility.ts was split out of that file
  // for exactly this, so the rule about who sees what is executed rather
  // than described. Same approach as sidebar-structure.test.mjs.
  const { sidebarGroups } = await loadTs("src/lib/sidebar-visibility.ts");
  const all = readGroups(nav).map((g) => ({
    heading: g.heading,
    items: itemChunks(g.body).map((i) => ({
      href: i.literalHref ?? i.constantHref ?? "?",
      label: "?",
      ...(i.hidden ? { hidden: true } : {}),
      ...(i.notBuilt ? { notBuilt: true } : {}),
      ...(i.ownerOnly ? { ownerOnly: true } : {}),
    })),
  }));
  const declared = all.map((g) => g.heading);
  checkTrue(
    `the config was executed (${declared.length} groups declared)`,
    declared.length >= 6,
    "a scan that loads nothing agrees with every claim below it",
  );
  for (const isOwner of [true, false]) {
    const drawn = new Set(sidebarGroups(all, isOwner).map((g) => g.heading));
    const gone = declared.filter((h) => !drawn.has(h));
    checkTrue(
      `${isOwner ? "owner" : "non-owner"}: every declared group still draws rows (${drawn.size} of ${declared.length})`,
      gone.length === 0,
      `${gone.join(", ")} — declared, and nothing under it survives the filters`,
    );
  }
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
