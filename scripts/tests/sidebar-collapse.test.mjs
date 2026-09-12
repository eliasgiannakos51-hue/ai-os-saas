/**
 * THE SIDEBAR OPENS ON THE GROUP YOU ARE IN, AND FORGETS EVERYTHING ELSE.
 *
 * THE PROBLEM THIS ANSWERS, and it is a number: six groups and
 * twenty-six drawn rows is THIRTY-TWO lines with every group open (26
 * rows + 6 headings), and there is no viewport this product is used at
 * where thirty-two 44px lines and a 92px logo block fit above the fold.
 * The previous behaviour opened all of them and remembered in
 * localStorage which ones the user had shut — so the second visit was
 * whatever yesterday left behind, and a user who had opened three groups
 * was back at thirty-two lines with no idea why.
 *
 * THE THREE RULES, each executed here rather than read as text:
 *
 *   1. On a load, exactly the group holding the current page is open.
 *   2. Navigating opens the group you land in and shuts nothing.
 *   3. Nothing is stored. No localStorage, no cookie, no server field.
 *
 * Rules 1 and 2 are pure functions in lib/sidebar-visibility.ts
 * precisely so this file can RUN them over every route in the product
 * instead of matching `useState(() => ...)` in a .tsx. A check that
 * asserts the SHAPE of the code and calls it proof of the behaviour is
 * shapes.md #15, and it is the easiest mistake to make here.
 *
 * AND THE POSITIONS HELD FOR WHAT IS NOT BUILT. Six rows carry
 * `notBuilt: true`. Nothing may draw them, nothing may search them, and
 * — the half that makes the flag come off — none of their routes may
 * exist. A notBuilt row whose page has landed is a working feature
 * nobody can reach.
 *
 * Run: node scripts/tests/sidebar-collapse.test.mjs
 */
import { readFileSync, existsSync } from "node:fs";
import { loadTs } from "./load-ts.mjs";
import { stripComments } from "../lib/test-export-drift.mjs";

let pass = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    failures.push(name);
    console.log(`  FAIL  ${name}${detail !== undefined ? `\n        ${detail}` : ""}`);
  }
}
function checkEqual(name, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  check(name, a === e, a === e ? undefined : `expected ${e}\n        actual   ${a}`);
}

const {
  initialExpandedGroups,
  expandedAfterNavigation,
  headingContaining,
  visibleGroups,
  sidebarGroups,
} = await loadTs("src/lib/sidebar-visibility.ts");

const NAV = "src/lib/sidebar-nav.ts";
const navSrc = stripComments(readFileSync(NAV, "utf8"));
const componentSrc = stripComments(readFileSync("src/components/dashboard/sidebar.tsx", "utf8"));

// ---------------------------------------------------------------------
// A stand-in for the real config, built from the real config's text.
//
// lib/sidebar-nav.ts imports forty icons, so it cannot be loaded here —
// the same constraint the three other sidebar gates state. The SHAPE is
// what the rules operate on (heading, collapsible, item hrefs), and it
// is parsed out rather than retyped, so a group added to the config is
// a group these checks cover without anybody editing this file.
// ---------------------------------------------------------------------
function parseGroups(source) {
  const groups = [];
  const headingRe = /heading:\s*"([^"]+)",\s*\n\s*collapsible:\s*(true|false)/g;
  const marks = [];
  let m;
  while ((m = headingRe.exec(source)) !== null) {
    marks.push({ heading: m[1], collapsible: m[2] === "true", at: m.index });
  }
  for (let i = 0; i < marks.length; i += 1) {
    const body = source.slice(marks[i].at, marks[i + 1]?.at ?? source.length);
    const items = [...body.matchAll(/\{\s*href:\s*"([^"]+)"([^}]*)\}/g)].map((im) => ({
      href: im[1],
      hidden: /hidden:\s*true/.test(im[2]),
      ownerOnly: /ownerOnly:\s*true/.test(im[2]),
      notBuilt: /notBuilt:\s*true/.test(im[2]),
    }));
    groups.push({ heading: marks[i].heading, collapsible: marks[i].collapsible, items });
  }
  return groups;
}

const groups = parseGroups(navSrc);
const totalItems = groups.reduce((n, g) => n + g.items.length, 0);

console.log(`== the config: ${groups.length} groups, ${totalItems} rows ==`);
// FLOORS, so a parser that stopped parsing cannot produce an empty
// offender list and a green line. This is the shape
// scripts/scan-unjudged-numbers.mjs was written for.
check(`the parser found groups (${groups.length} >= 5)`, groups.length >= 5);
check(`the parser found rows (${totalItems} >= 40)`, totalItems >= 40);
check(
  "every group has at least one row",
  groups.every((g) => g.items.length > 0),
  groups.filter((g) => g.items.length === 0).map((g) => g.heading).join(", ")
);

// ---------------------------------------------------------------------
// RULE 1 — a load opens exactly one group: the one you are in.
// ---------------------------------------------------------------------
console.log("\n== rule 1: on a load, exactly the current page's group is open ==");

const everyHref = groups.flatMap((g) => g.items.map((i) => i.href));
const wrongOnLoad = [];
for (const href of everyHref) {
  const open = [...initialExpandedGroups(groups, href)];
  const owner = groups.find((g) => g.items.some((i) => i.href === href));
  if (!owner.collapsible) {
    // The one group that never collapses is never in the set — it is
    // always drawn, so "open" is not a state it has.
    if (open.length !== 0) wrongOnLoad.push(`${href}: expected nothing open, got ${open}`);
    continue;
  }
  if (open.length !== 1 || open[0] !== owner.heading) {
    wrongOnLoad.push(`${href}: expected only "${owner.heading}", got ${JSON.stringify(open)}`);
  }
}
checkEqual("every route opens its own group and no other", wrongOnLoad, []);

// AND THE ROUTES THAT ARE IN NO GROUP. A detail page under a row's
// route (/dashboard/projects/42) belongs to the row's group; a route in
// no group at all opens nothing rather than guessing.
checkEqual(
  "a child route opens its parent's group",
  [...initialExpandedGroups(groups, "/dashboard/projects/42")],
  [headingContaining(groups, "/dashboard/projects")]
);
checkEqual(
  "a route in no group opens nothing",
  [...initialExpandedGroups(groups, "/dashboard/not-a-real-route")],
  []
);
checkEqual("a null pathname opens nothing", [...initialExpandedGroups(groups, null)], []);

// THE WHOLE POINT, AS A NUMBER. If a load could open more than one
// group, the rule above would still pass route by route while the nav
// grew back to thirty-two lines.
const worstCaseOnLoad = Math.max(
  ...everyHref.map((href) => initialExpandedGroups(groups, href).size)
);
check(`no load opens more than one group (worst case: ${worstCaseOnLoad})`, worstCaseOnLoad <= 1);

// ---------------------------------------------------------------------
// RULE 2 — navigating adds, never removes.
// ---------------------------------------------------------------------
console.log("\n== rule 2: navigating opens where you land and shuts nothing ==");

const collapsible = groups.filter((g) => g.collapsible);
const first = collapsible[0];
const second = collapsible[1];
const secondHref = second.items[0].href;

// The user opened `first` by hand, then clicked a link inside `second`.
const afterNav = expandedAfterNavigation(groups, secondHref, new Set([first.heading]));
check(
  "the group the user opened by hand is still open after navigating",
  afterNav.has(first.heading),
  [...afterNav].join(", ")
);
check("the group navigated into is open", afterNav.has(second.heading));

// IDENTITY, NOT JUST EQUALITY. Returning a fresh Set with the same
// contents re-renders the whole nav on every path change — and this runs
// on every click in it.
const already = new Set([second.heading]);
check(
  "navigating into an already-open group returns the same Set object",
  expandedAfterNavigation(groups, secondHref, already) === already
);
const untouched = new Set([first.heading]);
check(
  "navigating to a route in no group returns the same Set object",
  expandedAfterNavigation(groups, "/dashboard/not-a-real-route", untouched) === untouched
);

// ---------------------------------------------------------------------
// RULE 3 — nothing is stored.
// ---------------------------------------------------------------------
console.log("\n== rule 3: the open/shut state is not persisted anywhere ==");

// COMMENTS STRIPPED FIRST — the component's own header explains what it
// used to store, in the words a scanner would match, and a check that
// counts the explanation is checking the documentation.
check(
  "the sidebar does not touch localStorage",
  !/localStorage/.test(componentSrc),
  "the state must not survive a reload — see this gate's header"
);
check(
  "the sidebar does not touch sessionStorage or cookies",
  !/sessionStorage|document\.cookie/.test(componentSrc)
);
check(
  "no collapse key is left behind in the component",
  !/COLLAPSED_KEY|sidebar-collapsed/.test(componentSrc)
);
// The other direction: the component must still be driven by the pure
// rules, or rules 1 and 2 above are being checked on a module nothing
// calls — shapes.md #9.
check(
  "the component calls initialExpandedGroups",
  /initialExpandedGroups\(/.test(componentSrc)
);
check(
  "the component calls expandedAfterNavigation",
  /expandedAfterNavigation\(/.test(componentSrc)
);

// ---------------------------------------------------------------------
// THE HEADING IS A CONTROL, AND HAS TO BEHAVE LIKE ONE.
// ---------------------------------------------------------------------
console.log("\n== the group heading: 44px, a state, a target and a keyboard ==");

check("the heading is a <button>", /<button[\s\S]{0,400}?onClick=\{\(\) => toggleGroup/.test(componentSrc));
check("the heading is at least 44px tall", /toggleGroup[\s\S]{0,400}?min-h-\[44px\]/.test(componentSrc));
check("the heading declares aria-expanded", /aria-expanded=\{isOpen\}/.test(componentSrc));
check("the heading points at the panel it opens", /aria-controls=\{panelId\}/.test(componentSrc));
check("the heading shows a direction indicator", /rotate-90.*:.*rotate-0|isOpen \? "rotate-90"/.test(componentSrc));
check("the heading has a visible focus ring", /focus-visible:outline/.test(componentSrc));
// A SHUT GROUP IS SHUT TO THE KEYBOARD. The rows animate to zero height
// and stay in the DOM; without this a keyboard user tabs through
// twenty-six rows while five are on screen.
check("a shut group is out of the accessibility tree", /aria-hidden=\{!isOpen\}/.test(componentSrc));
check("a shut group's rows are out of the tab order", /tabIndex=\{reachable \? undefined : -1\}/.test(componentSrc));

// ---------------------------------------------------------------------
// THE POSITIONS HELD FOR WHAT IS NOT BUILT.
// ---------------------------------------------------------------------
console.log("\n== the not-built rows: declared, never drawn, and no page behind them ==");

const notBuilt = groups.flatMap((g) =>
  g.items.filter((i) => i.notBuilt).map((i) => ({ ...i, heading: g.heading }))
);
check(`the config declares positions for what is not built (${notBuilt.length})`, notBuilt.length >= 6);

// THE HALF THAT MAKES THE FLAG COME OFF. A notBuilt row whose page now
// exists is a working feature that nothing links to — the exact defect
// entry-points.test.mjs was written for, arriving through a new door.
const built = notBuilt.filter((i) => {
  const slug = i.href.replace(/^\/dashboard\/?/, "");
  return existsSync(`src/app/dashboard/${slug}/page.tsx`);
});
checkEqual(
  "no notBuilt row has a page on disk — remove the flag when it lands",
  built.map((i) => i.href),
  []
);

// NEITHER FILTER LETS ONE THROUGH, and both are checked because they are
// filtered in different places for different reasons: `hidden` is
// dropped by sidebarGroups only (so the palette keeps it), `notBuilt` by
// both (so nothing can reach a route that does not exist).
for (const isOwner of [true, false]) {
  const drawn = sidebarGroups(groups, isOwner).flatMap((g) => g.items.map((i) => i.href));
  const searchable = visibleGroups(groups, isOwner).flatMap((g) => g.items.map((i) => i.href));
  checkEqual(
    `nothing notBuilt is drawn (isOwner=${isOwner})`,
    notBuilt.filter((i) => drawn.includes(i.href)).map((i) => i.href),
    []
  );
  checkEqual(
    `nothing notBuilt is searchable (isOwner=${isOwner})`,
    notBuilt.filter((i) => searchable.includes(i.href)).map((i) => i.href),
    []
  );
}

// The owner is not exempt. `visibleGroups` short-circuits for owners, so
// this is the case a filter written in the wrong order lets through —
// and the owner is the one person who would report it as "there are
// broken links in my own search".
const ownerSearchable = visibleGroups(groups, true).flatMap((g) => g.items.map((i) => i.href));
checkEqual(
  "the owner's palette has no not-built rows either",
  notBuilt.filter((i) => ownerSearchable.includes(i.href)).map((i) => i.href),
  []
);

// THE POSITION IS THE POINT. Each held row sits at the END of its
// group's drawn rows — not interleaved with the ones that work, because
// a list that alternates working and not-working rows is unreadable the
// day the flags start coming off.
const misplaced = [];
for (const group of groups) {
  const firstNotBuilt = group.items.findIndex((i) => i.notBuilt);
  if (firstNotBuilt === -1) continue;
  const drawnAfter = group.items
    .slice(firstNotBuilt)
    .filter((i) => !i.notBuilt && !i.hidden);
  if (drawnAfter.length > 0) {
    misplaced.push(`${group.heading}: ${drawnAfter.map((i) => i.href).join(", ")} is drawn after a held position`);
  }
}
checkEqual("every held position sits after the rows that work", misplaced, []);

// And the groups they were asked for, by name — the brief named three.
const headingsWithHeld = [...new Set(notBuilt.map((i) => i.heading))].sort();
checkEqual("the held positions are in Make, Run and Organise", headingsWithHeld, [
  "Make",
  "Organise",
  "Run",
]);

// =====================================================================
console.log(
  `\n${failures.length === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${failures.length} failed`
);
if (failures.length) {
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
