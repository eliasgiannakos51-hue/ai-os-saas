// HOW BIG IS THE SIDEBAR, AND CAN IT GROW BACK?
//
// It was eight groups and forty-five rows. Forty-five links down the left
// edge is not navigation, it is a directory — and nineteen of those rows
// were log modules that all render the same GenericList, i.e. nineteen
// spellings of "a table of your rows". V4.6 #3 made it four groups and
// sixteen rows.
//
// The brief asked for the gate in the same breath as the change, and for
// the obvious reason: a sidebar is where every new feature wants to add
// one more link, each addition is individually reasonable, and forty-five
// is what "individually reasonable" adds up to over a year. So the limit
// is a build failure rather than a note.
//
// WHAT THIS FILE REFUSES TO DO is check the limit by counting `href:` in
// a string. Whether a row is DRAWN is decided by sidebarGroups(), which
// applies the role filter and then the `hidden` filter — so the count
// that matters is the one that function produces, and this file runs the
// real one out of lib/sidebar-visibility.ts rather than reimplementing
// its rules and then agreeing with itself.
//
// Run: node scripts/tests/sidebar-size.test.mjs
import { readFileSync } from "node:fs";
import { loadTs } from "./load-ts.mjs";
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

// THE LIMITS. Four and twenty, from the brief.
const MAX_GROUPS = 4;
const MAX_DRAWN_ITEMS = 20;

// The real filters, executed. lib/sidebar-visibility.ts imports no icons
// precisely so this is possible — see its header.
const { visibleGroups, sidebarGroups } = await loadTs("src/lib/sidebar-visibility.ts");

const navSrc = readFileSync("src/lib/sidebar-nav.ts", "utf8");

// ---------------------------------------------------------------------
console.log("== 1. the config is read, and read completely ==");
// Parsed rather than imported because lib/sidebar-nav.ts imports forty
// icons from lucide-react, which scripts/tests may not reach. The parse
// is then CROSS-CHECKED against an independent count below, so a regex
// that quietly stops matching cannot under-report the size and turn this
// whole file green.
const groups = [];
const headingRe = /heading: "([^"]+)",\s*\n\s*collapsible: (true|false)/g;
const marks = [];
for (const m of navSrc.matchAll(headingRe)) {
  marks.push({ heading: m[1], collapsible: m[2] === "true", at: m.index });
}
for (let i = 0; i < marks.length; i++) {
  const body = navSrc.slice(marks[i].at, i + 1 < marks.length ? marks[i + 1].at : navSrc.length);
  // Each item runs from its own `href:` to the next one, so multi-line and
  // one-line object literals both fall out without a parser.
  const chunks = body.split(/href:\s*/).slice(1);
  groups.push({
    heading: marks[i].heading,
    collapsible: marks[i].collapsible,
    items: chunks.map((chunk) => {
      const upToNext = chunk;
      return {
        href: upToNext.match(/^["'`]([^"'`]+)["'`]/)?.[1] ?? upToNext.match(/^([A-Z_]+)\.href/)?.[1] ?? null,
        // The flags belong to THIS item: read only as far as the next
        // `label:`, which every item has and which follows its href.
        ...(/hidden:\s*true/.test(upToNext.split(/\n\s*\{/)[0]) ? { hidden: true } : {}),
        ...(/ownerOnly:\s*true/.test(upToNext.split(/\n\s*\{/)[0]) ? { ownerOnly: true } : {}),
        // icon is required by the type but irrelevant here.
        label:
          upToNext.match(/label:\s*["'`]([^"'`]+)["'`]/)?.[1] ??
          // CREATE_NAV_ITEM.label and friends: read the constant out of
          // lib/modules.ts rather than printing "?" in the evidence this
          // file exists to produce.
          upToNext.match(/label:\s*([A-Z_]+)\.label/)?.[1] ??
          "?",
        icon: null,
      };
    }),
  });
}

const parsedItems = groups.flatMap((g) => g.items);
// AN INDEPENDENT SECOND COUNT. `parsedItems.length` is what the regex
// above believes; this is what the file plainly contains. If they ever
// disagree, the parse dropped rows on the floor and every limit below
// would be measuring a smaller sidebar than the one that ships.
const rawHrefCount = (navSrc.match(/^\s*(\{\s*)?href:/gm) ?? []).length;
check(
  `the parse found every item (${parsedItems.length} parsed, ${rawHrefCount} href: lines)`,
  parsedItems.length === rawHrefCount && parsedItems.length > 0,
  `${parsedItems.length} vs ${rawHrefCount} — the parse and the file disagree, so the counts below are not about this sidebar`
);
check(
  "and every parsed item resolved an href",
  parsedItems.every((i) => i.href),
  parsedItems.filter((i) => !i.href).map((i) => i.label).join(", ")
);
check(
  `the group scan found groups (${groups.length})`,
  groups.length > 0,
  "a limit checked against zero groups passes for the wrong reason"
);

// ---------------------------------------------------------------------
console.log(`\n== 2. at most ${MAX_GROUPS} groups ==`);
console.log(`        ${groups.map((g) => g.heading).join(" · ")}`);
check(
  `${groups.length} groups, limit ${MAX_GROUPS}`,
  groups.length <= MAX_GROUPS,
  `${groups.length} groups: ${groups.map((g) => g.heading).join(", ")}`
);

// ---------------------------------------------------------------------
console.log(`\n== 3. at most ${MAX_DRAWN_ITEMS} rows are actually DRAWN ==`);
// Through the real sidebarGroups(), for BOTH roles. An owner sees the
// most rows, so the owner count is the one the limit has to hold for —
// but the non-owner count is asserted too, because a filter that started
// returning everything to everybody would otherwise show up only as a
// security bug and never as a size one.
for (const isOwner of [true, false]) {
  const drawn = sidebarGroups(groups, isOwner);
  const rows = drawn.flatMap((g) => g.items);
  console.log(
    `        ${isOwner ? "owner    " : "non-owner"}: ${drawn.length} groups, ${rows.length} rows — ${rows
      .map((i) => i.label)
      .join(", ")}`
  );
  check(
    `${isOwner ? "owner" : "non-owner"}: ${rows.length} rows drawn, limit ${MAX_DRAWN_ITEMS}`,
    rows.length <= MAX_DRAWN_ITEMS,
    `${rows.length} rows`
  );
  check(
    `${isOwner ? "owner" : "non-owner"}: ${drawn.length} groups drawn, limit ${MAX_GROUPS}`,
    drawn.length <= MAX_GROUPS,
    `${drawn.length} groups`
  );
}

// ---------------------------------------------------------------------
console.log("\n== 4. THE ROLE FILTER STILL WORKS — hiding must never reveal ==");
// The one thing the consolidation could quietly break. `sidebarGroups`
// composes `visibleGroups` and then drops hidden items; if that order
// were ever reversed, or if the composition were replaced by a copy that
// forgot the role filter, an owner-only page would appear in every
// user's nav. The nav had no role at all until Business health was added
// to it, and this is what stops that being re-learned.
const ownerOnlyItems = parsedItems.filter((i) => i.ownerOnly);
check(
  `there is an owner-only item to test with (${ownerOnlyItems.length})`,
  ownerOnlyItems.length > 0,
  "with none, every assertion in this section is vacuously true"
);
for (const item of ownerOnlyItems) {
  const forOwner = sidebarGroups(groups, true).flatMap((g) => g.items).map((i) => i.href);
  const forUser = sidebarGroups(groups, false).flatMap((g) => g.items).map((i) => i.href);
  const paletteUser = visibleGroups(groups, false).flatMap((g) => g.items).map((i) => i.href);
  check(`${item.href}: the owner sees it`, forOwner.includes(item.href));
  check(`${item.href}: nobody else does, in the sidebar`, !forUser.includes(item.href));
  // AND NOT IN THE COMMAND PALETTE EITHER. Filtering the sidebar alone
  // would put every hidden page back one keystroke away, which is not
  // hiding it, only moving it.
  check(`${item.href}: nor in the command palette`, !paletteUser.includes(item.href));
}

// ---------------------------------------------------------------------
console.log("\n== 5. A SMALLER SIDEBAR IS NOT A SMALLER APP ==");
// Consolidating a nav is one keystroke from deleting entries rather than
// grouping them, and a deleted entry leaves the page live but findable
// from nowhere: the command palette is built from THIS SAME LIST, so an
// item dropped here is dropped from search too.
//
// Every href the eight-group sidebar carried, listed so the loss of any
// one of them is a build failure rather than a thing somebody notices in
// a month. /dashboard/timeline is here under its new label ("Mine"); the
// label is allowed to change, the destination is not.
const BEFORE_V46_3 = [
  "/dashboard/overview", "/dashboard/create", "/dashboard/chat", "/dashboard/timeline",
  "/dashboard/favorites", "/dashboard/mission", "/dashboard/reflection", "/dashboard/memory",
  "/dashboard/documents", "/dashboard/files", "/dashboard/deep-research",
  "/dashboard/agents", "/dashboard/website-builder", "/dashboard/published",
  "/dashboard/form-submissions", "/dashboard/data-analysis", "/dashboard/coding",
  "/dashboard/websites", "/dashboard/apps", "/dashboard/images", "/dashboard/videos",
  "/dashboard/presentations", "/dashboard/campaigns",
  "/dashboard/analytics", "/dashboard/finance", "/dashboard/business-health",
  "/dashboard/content", "/dashboard/sales", "/dashboard/products", "/dashboard/research",
  "/dashboard/learning",
  "/dashboard", "/dashboard/competitors", "/dashboard/decisions", "/dashboard/feedback",
  "/dashboard/trading", "/dashboard/trading-workflow", "/dashboard/product-workflow",
  "/dashboard/automation", "/dashboard/integrations",
  "/dashboard/marketplace",
  "/dashboard/settings", "/dashboard/team", "/dashboard/affiliate", "/help",
];
check(
  `the before-list is the size it claims (${BEFORE_V46_3.length})`,
  BEFORE_V46_3.length === 45 && new Set(BEFORE_V46_3).size === 45,
  `${BEFORE_V46_3.length} entries, ${new Set(BEFORE_V46_3).size} distinct`
);
// Three hrefs come from constants in lib/modules.ts, so the parse yields
// the constant's NAME; resolve those before comparing.
const CONSTANT_HREFS = {
  OVERVIEW_NAV_ITEM: "/dashboard/overview",
  CREATE_NAV_ITEM: "/dashboard/create",
  CHAT_NAV_ITEM: "/dashboard/chat",
  TIMELINE_NAV_ITEM: "/dashboard/timeline",
  MISSION_NAV_ITEM: "/dashboard/mission",
  REFLECTION_NAV_ITEM: "/dashboard/reflection",
  SETTINGS_NAV_ITEM: "/dashboard/settings",
};
const modulesSrc = readFileSync("src/lib/modules.ts", "utf8");
for (const [name, expected] of Object.entries(CONSTANT_HREFS)) {
  // READ FROM lib/modules.ts, not trusted. If one of those constants is
  // repointed, this map would otherwise keep asserting the old address.
  const actual = modulesSrc.match(new RegExp(`${name} = \\{ href: "([^"]+)"`))?.[1];
  check(`${name} still points at ${expected}`, actual === expected, String(actual));
}
const nowHrefs = new Set(parsedItems.map((i) => CONSTANT_HREFS[i.href] ?? i.href));
const lost = BEFORE_V46_3.filter((href) => !nowHrefs.has(href));
check(
  `all ${BEFORE_V46_3.length} destinations survived the consolidation`,
  lost.length === 0,
  lost.length ? `unreachable from the sidebar AND from the command palette: ${lost.join(", ")}` : ""
);

// ---------------------------------------------------------------------
console.log("\n== 6. every hidden row is still reachable ==");
// `hidden` means "not drawn", never "gone". The proof is that the same
// config, through the palette's filter rather than the sidebar's, still
// contains it — and that the hub page which lists them is built from
// that same filter.
const hidden = parsedItems.filter((i) => i.hidden);
check(`there are hidden rows to check (${hidden.length})`, hidden.length > 0);
const paletteHrefs = new Set(visibleGroups(groups, true).flatMap((g) => g.items).map((i) => i.href));
const missingFromPalette = hidden.filter((i) => !paletteHrefs.has(i.href));
check(
  "every hidden row is still in the command palette",
  missingFromPalette.length === 0,
  missingFromPalette.map((i) => i.href).join(", ")
);
// COMMENTS ARE NOT CODE — and this file learned it from its own mutation
// suite. The two checks below were written against the raw source, and
// the hub page's header comment explains its wiring in the very words
// they look for. Swapping the real call for sidebarGroups left the
// comment behind, the regex matched the prose, and the gate stayed green
// on a page that had stopped doing the thing it was checked for. Three
// other gates in this directory had the same fault against the same
// stripper; this one was found by mutating the instrument rather than by
// reading it.
const hubPage = stripComments(readFileSync("src/app/dashboard/records/page.tsx", "utf8"));
check(
  "the hub page is built from visibleGroups, not sidebarGroups",
  /visibleGroups\(\s*\n?\s*ALL_SIDEBAR_GROUPS/.test(hubPage),
  "if it used sidebarGroups it would list exactly the rows the sidebar already shows, and none of the ones it hides"
);
check(
  "...and it applies the role filter server-side",
  /isAdminEmail\(user\.email\)/.test(hubPage),
  "an owner-only entry must never be in a non-owner's payload"
);

console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${failures.length} failed`);
process.exit(failures.length === 0 ? 0 : 1);
