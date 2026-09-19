// THE STRUCTURE, LOCKED BY NAME — ORDER, NAMES, COUNT (Redesign phase 0).
//
// "Make · Ask · Run · See · Organise · Settings" was written in two
// comments — lib/sidebar-nav.ts's header and sidebar-size.test.mjs's —
// and in neither case was it checked. A comment is not a test: on
// 2026-09-09 the order was measured for the first time since it was
// agreed, and the only reason it was still right is that nobody had
// moved a group. Anyone could have, in either direction, and the build
// would have stayed green.
//
// WHAT THIS FILE HOLDS, and nothing else does:
//
//   THE ORDER. Positionally, group by group. sidebar-naming.test.mjs
//   checks the headings are distinct and translated; distinct says
//   nothing about sequence.
//
//   THE NAMES. Exactly, as strings. A rename is a decision — the nav
//   label, the message key and ten translations all follow it — so it
//   has to be written down here too, in the same commit.
//
//   THE COUNT. As equality, not a ceiling. sidebar-size.test.mjs caps
//   groups at six and rows at twenty-five; a cap is satisfied by zero.
//
//   AND EVERY DRAWN ROW, per group, in order. The heading order alone
//   would let every row inside a group shuffle silently, and the rows
//   are the structure a person actually navigates.
//
// WHY hrefs AND NOT LABELS for the rows: the label in the config is an
// English source string that three rows do not even carry literally
// (they read MISSION_NAV_ITEM.label and friends). The href is what the
// row IS — it is what every other gate keys on, and it cannot be true
// in one language and false in another.
//
// THE SHAPE THIS GUARDS AGAINST IN ITSELF: a gate that goes empty stays
// green. Section 0 refuses to run on a parse that found nothing, section
// 4 proves the comparator can still report a difference, and DECLARED is
// floored so that emptying the declaration reddens rather than passes.
//
// Run: node scripts/tests/sidebar-structure.test.mjs
import { readFileSync, existsSync } from "node:fs";
import { stripComments } from "../lib/test-export-drift.mjs";
import { loadTs } from "./load-ts.mjs";
import { groupBlocks } from "./lib/sidebar-source.mjs";

let pass = 0;
const failures = [];
const ok = (name, cond, detail) => {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { failures.push(name); console.log(`  FAIL  ${name}${detail !== undefined ? "\n        " + detail : ""}`); }
};

const NAV = "src/lib/sidebar-nav.ts";
const SIDEBAR = "src/components/dashboard/sidebar.tsx";

// ---------------------------------------------------------------------
// THE DECLARATION. This is the agreed structure, and changing the app
// without changing this list is what this file exists to stop.
//
// Six groups. The headings are what a person WANTS TO DO — five verbs
// and the place the settings live — and the order is the order of a
// working session: make something, ask about it, set it running, look at
// what came back, put it in order, change how it all behaves.
// THE FULL STRUCTURE, INCLUDING WHAT IS NOT BUILT YET.
//
// The problem this shape solves is an ordering one. Every feature that
// arrived after the 2026-09-05 structure was written went to the bottom of
// its group, because nobody had said where it went — and "wherever it
// landed" is not a place a person reaches for. So the future rows are
// declared HERE, in position, and the config has to agree.
//
// A row marked below is not drawn. Its POSITION is still locked, and that
// is the whole mechanism: when Music generates, or Meetings ships, the
// flag comes off in lib/sidebar-nav.ts and the row appears BETWEEN the two
// rows named around it. Section 1b is what makes that a promise.
//
// TWO KINDS OF NOT-DRAWN, and they are not interchangeable:
//
//   hidden    the page EXISTS and is deliberately not a row. Images and
//             Videos are tracking logs — lib/build-modules.ts says so in
//             its own words — and sidebar-naming.test.mjs is what keeps a
//             notes form out of a heading that promises production. They
//             stay in the command palette and on the hub.
//   notBuilt  there is no page. Music, Browser, Computer and Meetings have
//             no route, no component and no table, so visibleGroups strips
//             them and neither the palette nor the hub can offer a 404.
//
// Rows the config carries that are NOT named here are palette-only by
// design (the Create studio, Published Sites, the two workflows, the
// twelve trackers). Their order is not locked, because they are never
// drawn in it — locking it would be noise that hides the real drift.
const FUTURE = [
  { heading: "Make", hrefs: [
    "/dashboard/website-builder", "/dashboard/documents", "/dashboard/presentations",
    "/dashboard/posts", "/dashboard/coding",
    "/dashboard/images", "/dashboard/videos", "/dashboard/music",
  ] },
  // VOICE MOVED HERE FROM MAKE. It produces audio, which is why it was
  // filed under production — but what a person does on that page is put a
  // question and be answered, which is this group's subject.
  { heading: "Ask", hrefs: [
    "/dashboard/chat", "/dashboard/deep-research", "/dashboard/predictions",
    "/dashboard/voice",
  ] },
  { heading: "Run", hrefs: [
    "/dashboard/agents", "/dashboard/automation", "/dashboard/marketplace",
    "/dashboard/browser", "/dashboard/computer",
  ] },
  // SEE GAINED A ROW BY SPLITTING ONE, not by adding a feature.
  // /dashboard/memory was labelled "AI Memory" and its sidebar hint read
  // "What the AI remembers about you." in all ten languages; the page
  // searched your own records and contained no reference to chat_memory,
  // while the help article for chat memory linked to it. So the record
  // search is /dashboard/search and what the chat remembers is
  // /dashboard/ai-memory, next to it. The old address permanently
  // redirects.
  { heading: "See", hrefs: [
    "/dashboard/timeline", "/dashboard/files", "/dashboard/finance",
    "/dashboard/sales", "/dashboard/trading", "/dashboard/search",
    "/dashboard/ai-memory", "/dashboard/business-health",
  ] },
  { heading: "Organise", hrefs: [
    "/dashboard/projects", "/dashboard/mission", "/dashboard/reflection",
    "/dashboard/meetings", "/dashboard/team",
  ] },
  // Rendered in its own block at the foot of the sidebar, from
  // SETTINGS_GROUP rather than MAIN_SIDEBAR_GROUPS — section 3 holds
  // that apart, because "last in the list" and "in a separate block"
  // look identical from the config and are different in the component.
  { heading: "Settings", hrefs: [
    "/dashboard/integrations", "/dashboard/settings", "/help",
  ] },
];

/** The rows whose position is locked and which are NOT drawn today. */
const NOT_DRAWN_YET = new Map([
  ["/dashboard/images", "hidden"],
  ["/dashboard/videos", "hidden"],
  ["/dashboard/music", "notBuilt"],
  ["/dashboard/browser", "notBuilt"],
  ["/dashboard/computer", "notBuilt"],
  ["/dashboard/meetings", "notBuilt"],
]);

// WHAT IS DRAWN IS DERIVED, not typed a second time. Two hand-written
// lists that must agree is the shape this whole file exists to catch.
const DECLARED = FUTURE.map((g) => ({
  heading: g.heading,
  hrefs: g.hrefs.filter((h) => !NOT_DRAWN_YET.has(h)),
}));

// FLOORS ON THE DECLARATION ITSELF. Every comparison below is against
// DECLARED, so a DECLARED that had been emptied would agree with an
// emptied sidebar perfectly and this whole file would pass.
const DECLARED_ROWS = DECLARED.reduce((n, g) => n + g.hrefs.length, 0);
ok(`the declaration is not empty (${DECLARED.length} groups, ${DECLARED_ROWS} rows)`,
  DECLARED.length >= 6 && DECLARED_ROWS >= 26 && DECLARED.every((g) => g.hrefs.length >= 1),
  "a comparison against an empty declaration passes for the wrong reason");

// ---------------------------------------------------------------------
console.log("== 0. the config is read, and read completely ==");
// Parsed rather than imported: lib/sidebar-nav.ts imports fifty icons
// from lucide-react and scripts/tests cannot reach them. The parse is
// cross-checked against an independent count of the same file, so a
// regex that quietly stops matching cannot under-report the structure
// and turn every check below green.
const navSrc = readFileSync(NAV, "utf8");
const modules = await loadTs("src/lib/modules.ts");
const { sidebarGroups } = await loadTs("src/lib/sidebar-visibility.ts");

// THE GROUP BOUNDARY IS DEFINED ONCE, in lib/sidebar-source.mjs — see
// that file for why three gates lost their anchor on the same day.
const marks = groupBlocks(navSrc);
const parsed = marks.map((mark) => {
  const body = mark.body;
  const chunks = body.split(/href:\s*/).slice(1);
  return {
    heading: mark.heading,
    items: chunks.map((chunk) => {
      const head = chunk.split(/\n\s*\{/)[0];
      const literal = chunk.match(/^["'`]([^"'`]+)["'`]/)?.[1] ?? null;
      const constant = chunk.match(/^([A-Z_]+)\.href/)?.[1] ?? null;
      return {
        // A constant href is resolved from lib/modules.ts rather than
        // recorded as the constant's name: the declaration above is a
        // list of destinations, and NAV_ITEM.href is not one.
        href: literal ?? (constant ? modules[constant]?.href ?? constant : null),
        hidden: /hidden:\s*true/.test(head),
        notBuilt: /notBuilt:\s*true/.test(head),
        ownerOnly: /ownerOnly:\s*true/.test(head),
        // A held position for something that does not exist yet.
        // `sidebarGroups` drops it, so the parse has to carry it or the
        // declared list below would have to name rows nothing draws —
        // see lib/sidebar-visibility.ts's `notBuilt`. Sections 1b and 1c
        // below are where the held positions are checked.
        notBuilt: /notBuilt:\s*true/.test(head),
        label: chunk.match(/label:\s*["'`]([^"'`]+)["'`]/)?.[1] ?? chunk.match(/label:\s*([A-Z_]+)\.label/)?.[1] ?? "?",
        icon: null,
      };
    }),
  };
});
const parsedRows = parsed.flatMap((g) => g.items);
const rawHrefCount = (navSrc.match(/^\s*(\{\s*)?href:/gm) ?? []).length;
ok(`the parse found every row (${parsedRows.length} parsed, ${rawHrefCount} href: lines)`,
  parsedRows.length === rawHrefCount && parsedRows.length > 0,
  `${parsedRows.length} vs ${rawHrefCount} — the parse and the file disagree`);
ok(`the group scan found groups (${parsed.length})`, parsed.length > 0,
  "a structure compared against zero groups matches nothing and fails nothing");
ok("every parsed row resolved an href", parsedRows.every((i) => i.href),
  parsedRows.filter((i) => !i.href).map((i) => i.label).join(", "));

// THE ROWS AS DRAWN, through the real filter the sidebar uses, for the
// role that sees the most. A structure locked from the raw config would
// pass while the component drew something else.
const drawn = sidebarGroups(parsed, true).map((g) => ({ heading: g.heading, hrefs: g.items.map((i) => i.href) }));

// ---------------------------------------------------------------------
console.log("\n== 1. the COUNT, as equality ==");
console.log(`        ${drawn.map((g) => `${g.heading}(${g.hrefs.length})`).join(" · ")}`);
ok(`${drawn.length} groups drawn, ${DECLARED.length} declared`,
  drawn.length === DECLARED.length,
  `drawn: ${drawn.map((g) => g.heading).join(", ")}\n        declared: ${DECLARED.map((g) => g.heading).join(", ")}`);
const drawnRows = drawn.reduce((n, g) => n + g.hrefs.length, 0);
ok(`${drawnRows} rows drawn, ${DECLARED_ROWS} declared`, drawnRows === DECLARED_ROWS,
  `a row was added or removed without this file being told`);

// ---------------------------------------------------------------------
// ---------------------------------------------------------------------
console.log("\n== 1c. the flag comes off, the state is not stored, and a shut group is shut ==");
// ---------------------------------------------------------------------
// THREE THINGS 1b CANNOT SEE, and each of them is a way this whole
// structure quietly stops being true.
//
// Merged in from a parallel branch's gate rather than kept beside it:
// two files asserting things about one sidebar is two places to update
// and one of them goes stale. The checks are here; the file they came
// from no longer exists.
// ---------------------------------------------------------------------
{
  const componentSrc = stripComments(readFileSync(SIDEBAR, "utf8"));

  // 1. THE FLAG HAS TO COME OFF. A notBuilt row whose page has LANDED is
  //    a working feature nothing links to and nothing can search — the
  //    defect entry-points.test.mjs exists for, arriving through a door
  //    it does not watch. This is what makes `notBuilt` self-clearing
  //    instead of a label somebody has to remember to remove.
  const builtAnyway = [...NOT_DRAWN_YET]
    .filter(([, flag]) => flag === "notBuilt")
    .map(([href]) => href)
    .filter((href) => existsSync(`src/app/${href.replace(/^\//, "")}/page.tsx`));
  ok(
    "no not-built row has a page on disk — remove the flag when it lands",
    builtAnyway.length === 0,
    builtAnyway.join(", ")
  );

  // 2. NOTHING IS STORED. The open/shut state is a pure function of the
  //    URL plus what the user touched THIS visit. A sidebar that
  //    restores three groups from yesterday is thirty-odd lines again,
  //    on the one visit where the person has no idea why.
  //    Comments stripped first: the component's header explains what it
  //    used to store, in the words a scanner would match.
  ok("the sidebar stores nothing", !/localStorage|sessionStorage|document\.cookie/.test(componentSrc));
  // 3. THERE IS NO SHUT GROUP ANY MORE, and the four checks that used to
  //    stand here were the most carefully-written wrong thing in this
  //    file. They asserted that a collapsed group leaves the
  //    accessibility tree, leaves the tab order, reports aria-expanded
  //    and has a 44px target — all true, all green, and all about a
  //    state that meant five of six headings stood over nothing on every
  //    screen. Reported from production as "the sidebar shows Run and NO
  //    rows"; measured before the change as 7 of 26 rows painted.
  //
  //    What replaces them is the property that mattered and was never
  //    asked: NO HEADING WITHOUT ROWS. Here from the component, and from
  //    the screen in section 0 of scripts/tests/sidebar-density.prodtest.mjs,
  //    which is the half that would have caught the collapse.
  ok(
    "no group renders a heading with nothing under it",
    /if \(group\.items\.length === 0\) return null;/.test(componentSrc),
    "sidebarGroups() drops empty groups, so this is unreachable on the declared config — which is exactly what was true of the collapse"
  );
  ok(
    "…and the collapse machinery is gone, not merely defaulted to open",
    !/isExpanded|toggleGroup|aria-expanded|grid-rows-\[0fr\]|collapsible/.test(componentSrc),
    "a flag that is false for every group is the dead `prominent` parameter this component already deleted once"
  );
  ok(
    "…and every row is in the tab order, because none is at zero height",
    !/tabIndex=\{/.test(componentSrc),
    "tabIndex={-1} existed only to take a shut group's rows out of the tab order; with nothing shut it can only remove a reachable row"
  );
}

console.log("\n== 1b. the POSITION of a row that is not built yet is locked ==");
// ---------------------------------------------------------------------
// THE CHECK THAT MAKES A FUTURE POSITION WORTH DECLARING. Without it the
// FUTURE list above is a comment: the config could put Music at the top of
// Make, or Meetings after Team, and nothing would move.
//
// Rows the config carries that FUTURE does not name are skipped, not
// failed — they are palette-only on purpose and are never drawn in any
// order at all. What is compared is the sequence of the rows that ARE or
// WILL BE drawn.
{
  const { visibleGroups } = await loadTs("src/lib/sidebar-visibility.ts");
  const positionDrift = [];
  for (const declared of FUTURE) {
    const group = parsed.find((g) => g.heading === declared.heading);
    if (!group) {
      positionDrift.push(`${declared.heading}: the group is not in the config`);
      continue;
    }
    const locked = new Set(declared.hrefs);
    const inConfig = group.items.map((i) => i.href).filter((h) => locked.has(h));
    if (inConfig.join(" ") !== declared.hrefs.join(" ")) {
      positionDrift.push(
        `${declared.heading}:\n          config   ${inConfig.join(" ")}\n          declared ${declared.hrefs.join(" ")}`
      );
    }
  }
  ok("every locked row is in its declared position", positionDrift.length === 0, positionDrift.join("\n        "));

  // AND THE FLAG IS THE ONE THE DECLARATION SAYS. `hidden` and `notBuilt`
  // are not interchangeable — one keeps a real page searchable, the other
  // keeps a route that does not exist out of search — so a row switching
  // from one to the other is a decision, not a detail.
  const byHref = new Map(parsed.flatMap((g) => g.items).map((i) => [i.href, i]));
  const wrongFlag = [];
  for (const [href, expected] of NOT_DRAWN_YET) {
    const item = byHref.get(href);
    if (!item) { wrongFlag.push(`${href}: not in the config at all`); continue; }
    const actual = item.notBuilt ? "notBuilt" : item.hidden ? "hidden" : "drawn";
    if (actual !== expected) wrongFlag.push(`${href}: declared ${expected}, config says ${actual}`);
  }
  ok(`all ${NOT_DRAWN_YET.size} not-yet rows carry the flag they are declared with`,
    wrongFlag.length === 0, wrongFlag.join("\n        "));

  // The other direction: a row that IS drawn must not be flagged. This is
  // what goes red the day the flag comes off — in the right direction,
  // telling whoever removed it to move the row out of NOT_DRAWN_YET too.
  const surprised = FUTURE.flatMap((g) => g.hrefs)
    .filter((h) => !NOT_DRAWN_YET.has(h))
    .filter((h) => byHref.get(h)?.hidden || byHref.get(h)?.notBuilt);
  ok("no row that should be drawn is flagged", surprised.length === 0, surprised.join(", "));

  // A notBuilt row has NO PAGE, so it must reach neither the command
  // palette nor the hub — both are built on visibleGroups, and offering
  // either would be offering a 404.
  const searchable = new Set(
    visibleGroups(parsed, true).flatMap((g) => g.items.map((i) => i.href))
  );
  ok("the palette scan found rows to check", searchable.size > 20, String(searchable.size));
  const offered = [...NOT_DRAWN_YET]
    .filter(([, flag]) => flag === "notBuilt")
    .map(([href]) => href)
    .filter((href) => searchable.has(href));
  ok("no unbuilt row is offered in search or on the hub", offered.length === 0, offered.join(", "));

  // …while a HIDDEN row still is, which is the difference stated from the
  // other side. Asserting only the absence above would pass just as well
  // if visibleGroups stripped everything.
  const hiddenStillSearchable = [...NOT_DRAWN_YET]
    .filter(([, flag]) => flag === "hidden")
    .map(([href]) => href)
    .filter((href) => !searchable.has(href));
  ok("…and every hidden row still is", hiddenStillSearchable.length === 0, hiddenStillSearchable.join(", "));
}

console.log("\n== 2. the ORDER and the NAMES, position by position ==");
const drift = [];
for (let i = 0; i < Math.max(drawn.length, DECLARED.length); i++) {
  const got = drawn[i]?.heading ?? "(nothing)";
  const want = DECLARED[i]?.heading ?? "(nothing)";
  if (got !== want) drift.push(`position ${i + 1}: drawn "${got}", declared "${want}"`);
}
ok(`the six headings are in the declared order (${DECLARED.map((g) => g.heading).join(" · ")})`,
  drift.length === 0, drift.join("\n        "));

for (const declared of DECLARED) {
  const group = drawn.find((g) => g.heading === declared.heading);
  if (!group) {
    ok(`${declared.heading}: the group is drawn at all`, false, "the heading is not in the sidebar");
    continue;
  }
  const rowDrift = [];
  for (let i = 0; i < Math.max(group.hrefs.length, declared.hrefs.length); i++) {
    const got = group.hrefs[i] ?? "(nothing)";
    const want = declared.hrefs[i] ?? "(nothing)";
    if (got !== want) rowDrift.push(`row ${i + 1}: drawn "${got}", declared "${want}"`);
  }
  ok(`${declared.heading}: ${declared.hrefs.length} rows, in order`, rowDrift.length === 0, rowDrift.join("\n        "));
}

// ---------------------------------------------------------------------
console.log("\n== 3. Settings is a separate block, not the sixth group ==");
// The component renders MAIN_SIDEBAR_GROUPS and then SETTINGS_GROUP in
// its own bordered block. Both facts are load-bearing: if Settings ever
// became the sixth entry of MAIN_SIDEBAR_GROUPS the order above would
// still pass and the sidebar would look different.
ok("SETTINGS_GROUP is declared apart from MAIN_SIDEBAR_GROUPS",
  /export const SETTINGS_GROUP: SidebarGroupConfig = \{/.test(navSrc) &&
  /export const MAIN_SIDEBAR_GROUPS: SidebarGroupConfig\[\] = \[/.test(navSrc));
const sidebarSrc = readFileSync("src/components/dashboard/sidebar.tsx", "utf8");
ok("...and the component draws the main groups before it",
  sidebarSrc.indexOf("sidebarGroups(MAIN_SIDEBAR_GROUPS, isOwner)") < sidebarSrc.indexOf("sidebarGroups([SETTINGS_GROUP], isOwner)") &&
  sidebarSrc.includes("sidebarGroups([SETTINGS_GROUP], isOwner)"));
ok("Settings is the last declared block", DECLARED[DECLARED.length - 1].heading === "Settings");

// ---------------------------------------------------------------------
console.log("\n== 4. and the comparator can still tell a difference ==");
// EVERY ASSERTION ABOVE IS THAT TWO LISTS MATCH, and a comparator that
// said "match" to everything would satisfy all of them. Asked here about
// pairs it must separate, on fixtures rather than on the tree.
const sameOrder = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
ok("a reordering is a difference", !sameOrder(["Make", "Ask"], ["Ask", "Make"]));
ok("a rename is a difference", !sameOrder(["Make"], ["Create"]));
ok("an extra entry is a difference", !sameOrder(["Make", "Ask"], ["Make", "Ask", "Run"]));
ok("an empty list does not match a full one", !sameOrder([], ["Make"]));
ok("...and identical lists still match", sameOrder(["Make", "Ask"], ["Make", "Ask"]));

// ---------------------------------------------------------------------
console.log("\n== 5. every declared heading is a translated name ==");
// A heading renamed here and nowhere else renders as an English literal
// in nine languages. sidebar-naming.test.mjs owns the message-key map;
// this checks the map covers exactly what is declared above, so a rename
// cannot pass this file and fail the user.
// From GROUP_HEADING_KEYS in lib/sidebar-label-keys.ts, read the way
// sidebar-naming.test.mjs reads it — the same slice bounded by the next
// export, so the two files cannot disagree about what the map contains.
const keysSrc = readFileSync("src/lib/sidebar-label-keys.ts", "utf8");
const headingKeys = Object.fromEntries(
  keysSrc
    .slice(keysSrc.indexOf("GROUP_HEADING_KEYS"), keysSrc.indexOf("ITEM_LABEL_KEYS"))
    .split("\n")
    .map((line) => line.trim().match(/^"?([\w ]+?)"?:\s*"(\w+)",$/))
    .filter(Boolean)
    .map((m) => [m[1], m[2]])
);
const unmapped = DECLARED.map((g) => g.heading).filter((h) => !headingKeys[h]);
ok(`every declared heading has a message key (${Object.keys(headingKeys).length} mapped)`,
  Object.keys(headingKeys).length >= DECLARED.length && unmapped.length === 0,
  unmapped.length ? `no key for: ${unmapped.join(", ")}` : "GROUP_HEADING_KEYS was not found in lib/sidebar-label-keys.ts");

console.log("\n== 6. the analytics query names the rows the sidebar draws ==");
{
  // WHY A GATE ON A .sql FILE. docs/analytics-queries.sql §29.5 asks the
  // database which of the DRAWN rows are worth keeping, and it does that
  // by listing them — a list nothing kept honest. A row added to the
  // sidebar and not to that query is a row the redesign decision is
  // silently blind to, which is the worst possible direction for this
  // particular instrument to be wrong in: it under-reports demand for
  // exactly the newest rows.
  const sql = readFileSync("docs/analytics-queries.sql", "utf8");
  const block = sql.slice(sql.indexOf("with drawn(href) as (values"), sql.indexOf("),\nusage as ("));
  const inSql = [...block.matchAll(/\('([^']+)'\)/g)].map((m) => m[1]);
  const drawnHrefs = drawn.flatMap((g) => g.hrefs);
  ok(`§29.5 lists rows at all (${inSql.length})`, inSql.length > 0,
    "an empty VALUES list joins to nothing and reports every row as unused");
  const missing = drawnHrefs.filter((h) => !inSql.includes(h));
  const extra = inSql.filter((h) => !drawnHrefs.includes(h));
  ok(`...and it is exactly the drawn rows (${drawnHrefs.length})`,
    missing.length === 0 && extra.length === 0,
    `missing from the query: ${missing.join(", ") || "none"} · not drawn: ${extra.join(", ") || "none"}`);
}

console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${failures.length} failed`);
process.exit(failures.length === 0 ? 0 : 1);
