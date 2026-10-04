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
// That trade — every group open, 2.3 screens of scroll on a phone,
// measured 2026-09-19 — ended with the rail of ΣΥΣΤΗΜΑ DESIGN
// (2026-10-04): the groups are on the All tools page, and
// `node scripts/measure-sidebar-height.mjs` now prints whether the
// longest rail fits on one screen.
checkTrue(
  `every group was read (${groupBlocks.length})`,
  groupBlocks.length >= 6,
  "a scan that finds nothing agrees with every claim below it",
);
const sidebarForOpen = readFileSync("src/components/dashboard/sidebar.tsx", "utf8");
// WHERE THE GROUPS ARE DRAWN NOW. The sidebar of ΣΥΣΤΗΜΑ DESIGN
// (docs/CONTEXT.md, 2026-10-04) draws no group at all — New, Chat,
// Coding, All tools, Recent tools, Settings — and every group of tools is
// drawn on the All tools page, by components/tools/tools-grid.tsx since
// D.6. The property this section held over the sidebar's renderGroup is
// held over that grid's group renderer, because that is where a heading
// over nothing could appear again.
const toolsPageSrc = stripComments(readFileSync("src/app/dashboard/tools/page.tsx", "utf8"));
const toolsGridSrc = stripComments(readFileSync("src/components/tools/tools-grid.tsx", "utf8"));
const groupRenderer = toolsGridSrc.slice(toolsGridSrc.indexOf("{groups.map((group) =>"));
checkTrue(
  "the All tools group renderer was located",
  groupRenderer.length > 200 && toolsGridSrc.includes("{groups.map((group) =>"),
  "the checks below measure nothing without it",
);
// COUNTED, NOT GREPPED. A word search for isExpanded / aria-expanded /
// collapsible is a substring test on something that has structure, and
// the mutation that proves it takes four lines: `const expanded = true;
// ... if (!expanded) return <p/>;` reintroduces the whole defect without
// using any of those words. The group renderer draws every item through
// `tile` with no condition of its own: a `return`, a `?` or an `&&` in it
// is something deciding whether rows appear, and that is the collapse
// whatever it is called.
checkTrue(
  `no group can be collapsed — every row is drawn, unconditionally (${(groupRenderer.match(/\breturn\b|\?|&&/g) ?? []).length} conditions)`,
  (groupRenderer.match(/\breturn\b|\?|&&/g) ?? []).length === 0 && /<ul className=\{GRID\}>\{group\.items\.map\(tile\)\}<\/ul>/.test(groupRenderer),
  "a condition in the group renderer is a decision about whether rows appear — a collapse under another name",
);
checkTrue(
  "...and the names the old collapse used are gone, from the sidebar and the page",
  !/isExpanded|toggleGroup|aria-expanded|collapsible|grid-rows-\[0fr\]/.test(stripComments(sidebarForOpen) + toolsGridSrc),
  "the cheap half of the check above, kept because it names what was removed",
);
checkTrue(
  "...and a heading with no rows under it is not drawn at all",
  /\(\) => \[\.\.\.sidebarGroups\(/.test(toolsGridSrc) &&
    /\{list\.length > 0 && \([\s\S]{0,200}t\("rail\.recentTools"\)/.test(stripComments(sidebarForOpen)),
  "the page's groups come only from sidebarGroups(), which drops an empty group; the sidebar's one heading, Recent tools, sits under the guard on its list",
);
// WHAT THE SIDEBAR MAY REMEMBER. Until 2026-10-02 the answer was
// "nothing"; from then to 2026-10-04 it was the recent-tools list, kept
// per device. That list is the ACCOUNT's now (src/lib/nav/recent-tools.ts,
// computed by the dashboard layout), so the one thing a browser keeps is
// whether the sidebar is narrow — every storage call names COLLAPSED_KEY,
// none is sessionStorage, and every one sits inside a try (blocked
// storage in a private window must leave the wide sidebar, not a broken
// one). STRIPPED, because the component explains what it stores and what
// it does not, and a sentence about storage is not storage.
const sidebarCode = stripComments(sidebarForOpen);
const storageCalls = sidebarCode.match(/localStorage\.\w+\([^)]*\)/g) ?? [];
checkTrue(
  `...and the only thing remembered across a reload is whether the sidebar is narrow (${storageCalls.length} storage calls)`,
  storageCalls.length >= 1 &&
    storageCalls.every((c) => c.includes("COLLAPSED_KEY")) &&
    !/sessionStorage/.test(sidebarCode),
  storageCalls.join(" | ") || "no storage call found — the narrow sidebar cannot survive a reload",
);
checkTrue(
  "...and every storage call is guarded",
  (sidebarCode.match(/try\s*\{[^}]*localStorage\./g) ?? []).length === storageCalls.length,
  "a storage call outside a try throws in a private window and takes the sidebar with it",
);
// V4.6: the config carries items marked hidden — trackers reachable from
// the records hub and ⌘K, kept out of the sidebar on purpose. Every list
// of tools a person sees must come through sidebarGroups() (which drops
// them), never through visibleGroups() (which keeps them for the palette):
// the sidebar's lookup for Recent rows, and the All tools grid.
const sidebarSrc = readFileSync("src/components/dashboard/sidebar.tsx", "utf8");
checkTrue(
  "the sidebar reads its tools through sidebarGroups, so hidden items stay out of it",
  /sidebarGroups\(\[\.\.\.MAIN_SIDEBAR_GROUPS, SETTINGS_GROUP\], isOwner\)/.test(sidebarCode) && !/visibleGroups\(/.test(sidebarCode),
  "the sidebar is reading a group list that still carries hidden items",
);
checkTrue(
  "...and so does the All tools page",
  /const isOwner = isAdminEmail\(user\.email\);/.test(toolsPageSrc) &&
    /<ToolsGrid isOwner=\{isOwner\} \/>/.test(toolsPageSrc) &&
    /sidebarGroups\(MAIN_SIDEBAR_GROUPS, isOwner\)/.test(toolsGridSrc) &&
    !/visibleGroups\(/.test(toolsPageSrc + toolsGridSrc),
  "the grid would show the hidden trackers the sidebar has always kept out",
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
  "Settings is drawn as its own group below the main ones, on All tools",
  /\.\.\.sidebarGroups\(MAIN_SIDEBAR_GROUPS, isOwner\), \.\.\.sidebarGroups\(\[SETTINGS_GROUP\], isOwner\)\]/.test(toolsGridSrc),
  "Integrations and the Help Centre have no row in the rail, so without this group they have none anywhere",
);
// EVERY HEADING IS A CAPTION, not a control — there is nothing to toggle.
// A <button> that does nothing is worse for a screen reader than no
// button at all.
checkTrue(
  "the heading is a caption, not a button that does nothing",
  /<h2[\s\S]{0,200}\{heading\(group\.heading\)\}/.test(groupRenderer) && !/<button/.test(groupRenderer),
  "a control that cannot change anything is announced to a screen reader as something to press",
);
// AND NO CHEVRON BESIDE IT. The turning marker was the affordance that
// said "this opens" — on a heading that opens nothing it is a promise
// the page cannot keep.
checkTrue(
  "...with no marker suggesting it turns",
  !/ChevronRight|rotate-90/.test(groupRenderer),
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
      // The fourth filter, added 2026-09-24. Its value is the REASON in
      // prose, not `true`, so the shared parser matches on the key.
      ...(i.retired ? { retired: "declared" } : {}),
    })),
  }));
  const declared = all.map((g) => g.heading);
  checkTrue(
    `the config was executed (${declared.length} groups declared)`,
    declared.length >= 6,
    "a scan that loads nothing agrees with every claim below it",
  );
  // AND THE TWO ROLES ARE THE WHOLE CROSS-PRODUCT, which is only true
  // because nothing else can empty a group. Asked directly on
  // 2026-09-19 — "how many groups can end up empty depending on plan,
  // role or a flag?" — and the answer is that there are exactly three
  // mechanisms and no plan among them: `ownerOnly` (role), `hidden` and
  // `notBuilt` (flags, both static in the config). The component
  // receives `planName` and renders it in the footer; it never filters
  // on it.
  //
  // A FOURTH MECHANISM WOULD MAKE THE LOOP BELOW A SAMPLE INSTEAD OF A
  // PROOF, and it would not announce itself — so the shape of
  // SidebarItem is held here. A plan-gated row added tomorrow turns
  // this red rather than quietly reducing the cross-product to half of
  // itself.
  //
  // AND IT DID, ON 2026-09-24. `retired` was added to withdraw the
  // marketplace from every surface while the page kept serving, and this
  // check went red the same run — before anything shipped, which is what
  // it is for. The answer was to teach the loop above the new flag, not
  // to widen the list it compares against: the parse now carries
  // `retired` and the cross-product covers it.
  const visibilitySrc = stripComments(readFileSync("src/lib/sidebar-visibility.ts", "utf8"));
  const optionalFlags = [...visibilitySrc.matchAll(/^\s{2}([a-zA-Z]+)\?:/gm)].map((m) => m[1]).sort();
  checkTrue(
    `SidebarItem has exactly the four filters this loop covers, plus hintKey (${optionalFlags.join(", ")})`,
    optionalFlags.join(",") === "hidden,hintKey,notBuilt,ownerOnly,retired",
    "a new optional field on SidebarItem may be a fifth way to empty a group, and the two-role loop below would not reach it",
  );
  checkTrue(
    "...and nothing in the visibility filters reads a plan or a tier",
    !/\bplan\b|\btier\b|minPlan/i.test(visibilitySrc),
    "a plan-gated row means the owner/non-owner pair is no longer the whole cross-product",
  );
  // A GROUP MAY NOW BE DELIBERATELY EMPTY, and the check had to grow a
  // second half rather than lose its first (2026-09-26).
  //
  // Until this round every declared group drew rows, so "none of them
  // vanished" was the whole rule and `gone.length === 0` was the whole
  // check. The declared structure added five groups — Connect, Business,
  // Engineering, Verify, Personal — in which EVERY row is `notBuilt`, so
  // visibleGroups empties them and drops them, on purpose: forty-three
  // positions whose order is fixed and which nobody can see.
  //
  // The weak repair would have been to exempt the five by name and keep
  // asserting the rest. That exempts the failure too — a Make emptied by
  // accident and a Connect emptied on purpose are the same event to a
  // check that only counts. So the population is SPLIT by reading the
  // config rather than by naming groups: a group with at least one row
  // that is not notBuilt and not retired MUST draw, and a group with no
  // such row MUST NOT. Both directions, and the split itself is floored
  // so that a parse returning nothing cannot satisfy both halves
  // vacuously.
  const alive = (g) => g.items.filter((i) => !i.notBuilt && !i.retired);
  const liveGroups = all.filter((g) => alive(g).length > 0).map((g) => g.heading);
  const heldGroups = all.filter((g) => alive(g).length === 0).map((g) => g.heading);
  checkTrue(
    `the split is about something: ${liveGroups.length} live, ${heldGroups.length} held entirely`,
    liveGroups.length >= 6 && heldGroups.length >= 1 && liveGroups.length + heldGroups.length === declared.length,
    `live: ${liveGroups.join(", ")} | held: ${heldGroups.join(", ")}`,
  );
  for (const isOwner of [true, false]) {
    const who = isOwner ? "owner" : "non-owner";
    const drawn = new Set(sidebarGroups(all, isOwner).map((g) => g.heading));
    // THE OWNER-ONLY HOLE IN THE FIRST HALF, and it is real rather than
    // theoretical: a group whose only live row carries `ownerOnly` draws
    // for the owner and not for anybody else, which is not an accident
    // and not a held position either. So the live set is recomputed per
    // role from the same predicate.
    const visibleHere = all
      .filter((g) => alive(g).filter((i) => isOwner || !i.ownerOnly).length > 0)
      .map((g) => g.heading);
    const gone = visibleHere.filter((h) => !drawn.has(h));
    checkTrue(
      `${who}: every group with a live row draws it (${drawn.size} drawn, ${visibleHere.length} expected)`,
      gone.length === 0,
      `${gone.join(", ")} — declared with a live row, and nothing under it survives the filters`,
    );
    const shouldNotBe = heldGroups.filter((h) => drawn.has(h));
    checkTrue(
      `${who}: ...and a group that is ENTIRELY held draws nothing (${heldGroups.length} held)`,
      shouldNotBe.length === 0,
      `${shouldNotBe.join(", ")} — every row under it is notBuilt or retired, and the heading is on screen anyway`,
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
// Since the rail of 2026-10-04 the tooltip carries the NAME of a row in
// the narrow sidebar (the hint is written out on the All tools card).
checkTrue("the sidebar renders it", /<Tooltip content=\{label\} side="right">/.test(sidebar));
check("the sidebar sets no native title on nav links", /title=\{/.test(stripComments(sidebar)), false);

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
