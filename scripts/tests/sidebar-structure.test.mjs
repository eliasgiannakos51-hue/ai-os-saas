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
import { readFileSync } from "node:fs";
import { loadTs } from "./load-ts.mjs";

let pass = 0;
const failures = [];
const ok = (name, cond, detail) => {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { failures.push(name); console.log(`  FAIL  ${name}${detail !== undefined ? "\n        " + detail : ""}`); }
};

const NAV = "src/lib/sidebar-nav.ts";

// ---------------------------------------------------------------------
// THE DECLARATION. This is the agreed structure, and changing the app
// without changing this list is what this file exists to stop.
//
// Six groups. The headings are what a person WANTS TO DO — five verbs
// and the place the settings live — and the order is the order of a
// working session: make something, ask about it, set it running, look at
// what came back, put it in order, change how it all behaves.
const DECLARED = [
  { heading: "Make", hrefs: [
    "/dashboard/website-builder", "/dashboard/documents", "/dashboard/coding",
    "/dashboard/voice", "/dashboard/presentations", "/dashboard/posts",
  ] },
  { heading: "Ask", hrefs: [
    "/dashboard/chat", "/dashboard/deep-research", "/dashboard/predictions",
  ] },
  { heading: "Run", hrefs: [
    "/dashboard/agents", "/dashboard/automation", "/dashboard/marketplace",
  ] },
  { heading: "See", hrefs: [
    "/dashboard/timeline", "/dashboard/files", "/dashboard/finance",
    "/dashboard/sales", "/dashboard/trading", "/dashboard/memory",
    "/dashboard/business-health",
  ] },
  { heading: "Organise", hrefs: [
    "/dashboard/projects", "/dashboard/mission", "/dashboard/reflection", "/dashboard/team",
  ] },
  // Rendered in its own block at the foot of the sidebar, from
  // SETTINGS_GROUP rather than MAIN_SIDEBAR_GROUPS — section 3 holds
  // that apart, because "last in the list" and "in a separate block"
  // look identical from the config and are different in the component.
  { heading: "Settings", hrefs: [
    "/dashboard/integrations", "/dashboard/settings", "/help",
  ] },
];

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

const marks = [];
for (const m of navSrc.matchAll(/heading: "([^"]+)",\s*\n\s*collapsible: (true|false)/g)) {
  marks.push({ heading: m[1], at: m.index });
}
const parsed = marks.map((mark, i) => {
  const body = navSrc.slice(mark.at, i + 1 < marks.length ? marks[i + 1].at : navSrc.length);
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
        ownerOnly: /ownerOnly:\s*true/.test(head),
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

console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${failures.length} failed`);
process.exit(failures.length === 0 ? 0 : 1);
