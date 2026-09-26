#!/usr/bin/env node
/*
 * CAN THE STRUCTURE GATES TELL A SIDEBAR FROM A CLAIM OF ONE?
 *
 * Two questions, and the second is the one that made this file
 * necessary.
 *
 * FIRST: does sidebar-structure.test.mjs actually hold the order, the
 * names and the count? Two groups change places, one is renamed, a
 * seventh appears, a row moves inside its group, a row disappears —
 * each must redden, and on the clause that names it.
 *
 * SECOND: DOES EACH GATE STILL FAIL WHEN IT IS EMPTIED? A gate that
 * compares two lists agrees perfectly when both are empty, and a gate
 * that filters an empty list finds nothing to complain about. Four files
 * encode this structure as data, and all four are asked here, one at a
 * time, to survive having their data taken away:
 *
 *   sidebar-structure   DECLARED emptied
 *   sidebar-size        the drawn rows emptied, and the groups emptied
 *   sidebar-naming      BUILD_ALLOWED emptied, and the Make scan emptied
 *   sidebar-hints       the parsed item list emptied
 *
 * Each mutant names the gate it runs, because the gate under test is not
 * the same file for all of them.
 *
 * Run: node scripts/tests/sidebar-structure.mutation.mjs
 */
import { readFileSync } from "node:fs";
import { writeFileSync } from "./lib/sidecar-write.mjs";
import { execFileSync } from "node:child_process";

const STRUCTURE = "scripts/tests/sidebar-structure.test.mjs";
const SIZE = "scripts/tests/sidebar-size.test.mjs";
const NAMING = "scripts/tests/sidebar-naming.test.mjs";
const SOURCE = "scripts/tests/lib/sidebar-source.mjs";
const HINTS = "scripts/tests/sidebar-hints-coverage.test.mjs";
const NAV = "src/lib/sidebar-nav.ts";
const VISIBILITY = "src/lib/sidebar-visibility.ts";
const TOOLTIPS = "scripts/tests/sidebar-and-tooltips.test.mjs";
const SIDEBAR = "src/components/dashboard/sidebar.tsx";

const TARGETS = [STRUCTURE, SIZE, NAMING, HINTS, NAV, VISIBILITY, SIDEBAR, SOURCE, "docs/analytics-queries.sql"];

const MUTANTS = [
  // ---- THE DECLARED POSITIONS, 2026-09-12 ---------------------------
  //
  // Six rows hold a place they are not drawn in. What makes that worth
  // anything is that the place is enforced — otherwise FUTURE is a comment
  // and the next feature lands at the bottom of its group like every one
  // before it did.
  {
    gate: STRUCTURE,
    // THE DEFECT, EXACTLY. Music at the end of Make is where it would go
    // if nobody had said where it goes.
    name: "a held position moves to the bottom of its group",
    file: NAV,
    from: '      { href: "/dashboard/music", label: "Music", icon: MUSIC_ICON, hintKey: "music", notBuilt: true },\n',
    to: "",
    expect: "every locked row is in its declared position",
  },
  {
    gate: STRUCTURE,
    // hidden and notBuilt are not interchangeable: one keeps a real page
    // searchable, the other keeps a route that does not exist out of
    // search. Swapping them is how a 404 gets into the command palette.
    name: "a not-built row is marked hidden instead",
    file: NAV,
    // RE-ANCHORED 2026-09-23. This pointed at the meetings row, whose
    // notBuilt flag came off the day the feature was built — so the
    // mutation stopped EXISTING rather than stopping being caught, which
    // is the shape docs/shapes.md calls "a mutant whose anchor moved".
    // Moved to the music row, which is still a held position.
    from: '      { href: "/dashboard/music", label: "Music", icon: MUSIC_ICON, hintKey: "music", notBuilt: true },',
    to: '      { href: "/dashboard/music", label: "Music", icon: MUSIC_ICON, hintKey: "music", hidden: true },',
    expect: "carry the flag they are declared with",
  },
  {
    gate: STRUCTURE,
    // The filter that keeps a route with no page out of search and off the
    // hub. Both surfaces are built on visibleGroups, so this one line is
    // the whole guarantee.
    name: "visibleGroups stops stripping the rows that have no page",
    file: VISIBILITY,
    from: "      items: group.items.filter((i) => !i.notBuilt && !i.retired),",
    to: "      items: [...group.items],",
    expect: "no unbuilt row is offered in search or on the hub",
  },
  {
    gate: STRUCTURE,
    // AND THE OTHER DIRECTION. A filter that strips everything would
    // satisfy the check above while emptying the palette — the shape a
    // one-sided assertion always has.
    name: "visibleGroups strips the hidden rows too, emptying the palette",
    file: VISIBILITY,
    from: "      items: group.items.filter((i) => !i.notBuilt && !i.retired),",
    to: "      items: group.items.filter((i) => !i.notBuilt && !i.retired && !i.hidden),",
    expect: "every hidden row still is",
  },

  // ---- EVERY GROUP OPEN, 2026-09-19 ---------------------------------
  //
  // THREE MUTANTS STOOD HERE AND ALL THREE WENT STALE ON THE SAME DAY.
  // They broke the collapse in its three interesting ways — the current
  // group stops opening itself, the pathname beats the manual choice,
  // the open set is persisted — and each was a careful test of a
  // behaviour that turned out to be the defect: five of six headings
  // over nothing, reported from production as "the sidebar shows Run and
  // NO rows".
  //
  // A mutant whose anchor is gone does not fail, it does not RUN, so all
  // three would have sat here reporting nothing. scripts/tests/
  // mutation-anchors.test.mjs caught them in `npm run build` the day
  // after it started gating that, which is the only reason they were
  // replaced rather than left.
  {
    gate: TOOLTIPS,
    // A heading over nothing, put back the crude way.
    name: "a group with no rows is drawn anyway",
    file: SIDEBAR,
    from: "    if (group.items.length === 0) return null;",
    to: "    if (group.items.length === 0) return <p key={group.heading}>{translatedHeading(group.heading)}</p>;",
    expect: "a heading with no rows under it is not drawn at all",
  },
  {
    gate: TOOLTIPS,
    // THE COLLAPSE, REINTRODUCED WITHOUT ITS VOCABULARY. No isExpanded,
    // no aria-expanded, no `collapsible` — a word search for any of them
    // stays green, which is why the check it trips counts renderGroup's
    // exits instead.
    name: "a collapse comes back under another name",
    file: SIDEBAR,
    from: "    if (group.items.length === 0) return null;",
    to: "    const shown = group.heading === \"Make\";\n    if (group.items.length === 0) return null;\n    if (!shown) return <p key={group.heading}>{translatedHeading(group.heading)}</p>;",
    expect: "renderGroup has one guard and one render",
  },
  {
    gate: TOOLTIPS,
    // Nothing is left to remember, so storing anything is a regression on
    // its own — and the check reads the source with comments STRIPPED,
    // because the component explains what it used to store.
    name: "the sidebar starts storing something again",
    file: SIDEBAR,
    from: "  function renderGroup(group: SidebarGroupConfig) {",
    to: "  function persistOpen(v: string) {\n    window.localStorage.setItem(\"ionexa:sidebar-open\", v);\n  }\n\n  function renderGroup(group: SidebarGroupConfig) {\n    void persistOpen;",
    expect: "nothing is remembered across a reload",
  },

  // ---- the order, the names, the count ------------------------------
  {
    // A REAL SWAP, not a rename: Ask takes Organise's position and
    // Organise takes Ask's, through a temporary name so the second
    // replacement cannot land on the first one's output.
    name: "two groups change places",
    edits: [
      { file: NAV, from: 'heading: "Ask",', to: 'heading: "ZZTEMP",' },
      { file: NAV, from: 'heading: "Organise",', to: 'heading: "Ask",' },
      { file: NAV, from: 'heading: "ZZTEMP",', to: 'heading: "Organise",' },
    ],
    expect: "the six headings are in the declared order",
  },
  {
    name: "a group is renamed and nothing else is told",
    file: NAV,
    from: 'heading: "Make",',
    to: 'heading: "Create",',
    expect: "the six headings are in the declared order",
  },
  {
    name: "a seventh group appears",
    file: NAV,
    from: '    heading: "Organise",',
    to: '    heading: "Extra",\n    items: [{ href: "/dashboard/team", label: "Extra", icon: TEAM_ICON, hintKey: "team" }],\n  },\n  {\n    heading: "Organise",',
    // ANCHORED ON THE GROUP COUNT, NOT THE ROW COUNT, and that is the
    // repair rather than a new number.
    //
    // It used to read "rows drawn, 27 declared". Twenty-seven was true
    // when it was written and stopped being true on 2026-09-23, when the
    // meetings row landed and nobody came back — so this mutant has been
    // reporting a HOLE ever since, on a gate that catches the defect
    // perfectly well. Nothing showed it, because `npm run build` runs
    // check-mutation-tree and not the sidecars.
    //
    // The lesson is the anchor, not the arithmetic: a row count moves
    // every time a feature ships, and an expectation written on one is a
    // stale claim with a timer on it. The number of GROUPS is what this
    // mutant is actually about.
    expect: "groups drawn, 6 declared",
  },
  {
    name: "two rows change places inside a group",
    edits: [
      { file: NAV, from: '{ href: "/dashboard/documents", label: "Documents"', to: '{ href: "/dashboard/ZZTEMP", label: "Documents"' },
      { file: NAV, from: '{ href: "/dashboard/coding", label: "AI Coding"', to: '{ href: "/dashboard/documents", label: "AI Coding"' },
      { file: NAV, from: '{ href: "/dashboard/ZZTEMP", label: "Documents"', to: '{ href: "/dashboard/coding", label: "Documents"' },
    ],
    // THE ANCHOR CARRIED A ROW COUNT AND THE COUNT MOVED (2026-09-26):
    // Data Analysis stopped being hidden, Make drew six rows instead of
    // five, and this reported a HOLE on a gate that had caught the
    // defect on two clauses. Exactly the lesson the mutant above this
    // one writes out, made twice. Anchored on the clause that is about
    // the position rather than about how many there are.
    expect: "every locked row is in its declared position",
  },
  // ---- THE DECLARED STRUCTURE'S OWN RULES, 2026-09-26 ---------------
  //
  // Forty-three positions in five groups that nobody may see, plus
  // twelve more scattered through the five that are drawn. What makes
  // them safe to declare is that the two filters below cannot be
  // loosened without a gate going red — and both are mutated at the
  // FILTER rather than at the config, because a config edit only asks
  // whether one row is flagged and these are questions about the rule.
  {
    gate: STRUCTURE,
    // THE DEFECT: visibleGroups stops stripping notBuilt, so fifty-five
    // rows for pages that do not exist appear in the sidebar, in the
    // command palette and on the hub — every one of them a 404.
    name: "a held row is drawn after all",
    file: VISIBILITY,
    from: "items: group.items.filter((i) => !i.notBuilt && !i.retired),",
    to: "items: group.items.filter((i) => !i.retired),",
    expect: "no held row is drawn",
  },
  {
    gate: STRUCTURE,
    // THE DEFECT: the emptied groups are kept, so five headings stand
    // over nothing — the exact production report of 2026-09-17 ("the
    // sidebar shows the heading Run and NO rows underneath"), arriving
    // this time through the config rather than through a collapse.
    name: "a group with nothing live in it keeps its heading",
    // TWO EDITS, AND THE REASON IS A PROPERTY OF THE CODE RATHER THAN OF
    // THIS FILE. Removing either filter alone changes nothing on screen:
    // `visibleGroups` drops the emptied group, and if it does not,
    // `sidebarGroups` drops it again on its way out. Run as a one-line
    // mutant this was reported as a HOLE for one run — the gate stayed
    // green because the sidebar had not changed — which is the mutation
    // harness correctly saying "the line you deleted was not the one
    // holding this up". It is held up by both, so both go.
    edits: [
      {
        file: VISIBILITY,
        from: "    .filter((group) => group.items.length > 0);\n  if (isOwner) return built;",
        to: "    .filter(() => true);\n  if (isOwner) return built;",
      },
      {
        file: VISIBILITY,
        from: "    .map((group) => ({ ...group, items: group.items.filter((i) => !i.hidden) }))\n    .filter((group) => group.items.length > 0);",
        to: "    .map((group) => ({ ...group, items: group.items.filter((i) => !i.hidden) }));",
      },
    ],
    expect: "a heading appears exactly when the group has a live row",
  },
  {
    gate: NAMING,
    // THE DEFECT: a row that produces nothing is drawn under a heading
    // that says Make. Apps is the eighteen-line generic module page — a
    // list of app ideas — and un-hiding it is the cheapest way to break
    // the rule the owner's structure rests on: the user sees only what
    // works.
    name: "a feature that does not work is shown anyway",
    file: NAV,
    from: '{ href: "/dashboard/apps", label: "Apps", icon: MODULE_ICONS.apps, hintKey: "apps", hidden: true }',
    to: '{ href: "/dashboard/apps", label: "Apps", icon: MODULE_ICONS.apps, hintKey: "apps" }',
    expect: "no tracking-only module is DRAWN under Make",
  },
  {
    gate: STRUCTURE,
    // THE DEFECT: one of the five held groups is reordered. Their order
    // is the whole value of declaring them — a group whose position is
    // not fixed is a group whose features will be appended wherever
    // they land — and nothing draws them, so no screen would show it.
    name: "the held groups change places",
    edits: [
      { file: NAV, from: '    heading: "Verify",', to: '    heading: "ZZTEMP",' },
      { file: NAV, from: '    heading: "Personal",', to: '    heading: "Verify",' },
      { file: NAV, from: '    heading: "ZZTEMP",', to: '    heading: "Personal",' },
    ],
    expect: "groups are in the declared order, drawn or not",
  },
  {
    name: "a drawn row is quietly hidden",
    file: NAV,
    from: '{ href: "/dashboard/posts", label: "Posts", icon: POSTS_ICON, hintKey: "posts" }',
    to: '{ href: "/dashboard/posts", label: "Posts", icon: POSTS_ICON, hintKey: "posts", hidden: true }',
    // NO NUMBER IN THE ANCHOR — see the note in sidebar-size.mutation.mjs.
    // The count moves whenever a row is added (26 after redesign phase 2
    // drew Projects), and an anchor carrying it reports a hole every time.
    expect: "rows drawn,",
  },
  {
    name: "Settings stops being its own block",
    file: "src/components/dashboard/sidebar.tsx",
    from: "{sidebarGroups([SETTINGS_GROUP], isOwner).map(renderGroup)}",
    to: "{sidebarGroups([], isOwner).map(renderGroup)}",
    expect: "...and the component draws the main groups before it",
  },

  // ---- and now each gate, emptied -----------------------------------
  {
    // THE DECLARATION THIS FILE COMPARES AGAINST. Emptied, every
    // comparison in sections 1 and 2 succeeds against an empty sidebar
    // and the gate would pass while holding nothing.
    name: "sidebar-structure: the declaration is emptied",
    file: STRUCTURE,
    // FUTURE, not DECLARED: what is drawn is DERIVED from the full
    // declaration since 2026-09-12, so emptying the derived list would
    // just be editing an expression. Emptying the source is the defect,
    // and it is the one this section's floor exists for.
    from: "const FUTURE = [",
    to: "const FUTURE = []; const FUTURE_UNUSED = [",
    expect: "the declaration is not empty",
  },
  {
    // THE NEW FLOOR. `rows.length <= 25` is true of zero rows, so before
    // the floor existed this mutation — the sidebar drawing nothing at
    // all — read as a tidier sidebar.
    name: "sidebar-size: the sidebar draws no rows at all",
    gate: SIZE,
    file: VISIBILITY,
    from: ".map((group) => ({ ...group, items: group.items.filter((i) => !i.hidden) }))",
    to: ".map((group) => ({ ...group, items: group.items.filter(() => false) }))",
    expect: "at least 15 rows drawn",
  },
  {
    // AIMED AT THE GROUP FLOOR ALONE. Emptying the DRAWN set instead
    // leaves the parsed count at six, so MIN_GROUPS never fires and the
    // rows floor catches it — which is a true result about the wrong
    // clause. One group parsed clears `groups.length > 0` and fails
    // `>= MIN_GROUPS`, which is the line under test.
    // RE-AIMED AT THE SHARED PARSER, 2026-09-19. The regex these two
    // broke lived in sidebar-size.test.mjs, in a copy each of three
    // gates carried; it anchored on `collapsible:`, which went with the
    // collapse. One definition now, in lib/sidebar-source.mjs — so
    // blinding it blinds every gate that parses the config, which is a
    // strictly larger blast radius and the right thing to mutate.
    name: "sidebar-size: the parse finds one group and calls it the sidebar",
    gate: SIZE,
    file: SOURCE,
    from: 'const GROUP_RE = /heading: "([^"]+)",\\s*(?:\\n\\s*(?:\\/\\/[^\\n]*)?)*?\\n\\s*items: \\[/g;',
    to: 'const GROUP_RE = /heading: "(Make)",\\s*(?:\\n\\s*(?:\\/\\/[^\\n]*)?)*?\\n\\s*items: \\[/g;',
    expect: "so an emptied config cannot pass a ceiling",
  },
  {
    name: "sidebar-size: the group parse stops matching",
    gate: SIZE,
    file: SOURCE,
    from: 'const GROUP_RE = /heading: "([^"]+)",\\s*(?:\\n\\s*(?:\\/\\/[^\\n]*)?)*?\\n\\s*items: \\[/g;',
    to: 'const GROUP_RE = /heading: "(NOTHING_MATCHES_THIS)",\\s*(?:\\n\\s*(?:\\/\\/[^\\n]*)?)*?\\n\\s*items: \\[/g;',
    expect: "the group scan found groups",
  },
  {
    name: "sidebar-naming: the Make allowlist is emptied",
    gate: NAMING,
    file: NAMING,
    from: "const BUILD_ALLOWED = {",
    to: "const BUILD_ALLOWED = {}; const BUILD_ALLOWED_UNUSED = {",
    expect: "every remaining Make item is one somebody justified",
  },
  {
    name: "sidebar-naming: the Make group scan finds nothing",
    gate: NAMING,
    file: NAMING,
    from: 'const buildGroup = groupOf("Make");',
    to: 'const buildGroup = "";',
    expect: "the Make group scan found hrefs",
  },
  {
    // THE QUERY THAT DECIDES WHAT IS CUT, gone stale. A row drawn in the
    // sidebar and absent from §29.5 reports as unused for ever, because
    // the join has nothing to match it against.
    name: "a drawn row is missing from the analytics query",
    gate: STRUCTURE,
    file: "docs/analytics-queries.sql",
    from: "('/dashboard/projects'), ",
    to: "",
    expect: "it is exactly the drawn rows",
  },
  {
    name: "the analytics query lists nothing at all",
    gate: STRUCTURE,
    file: "docs/analytics-queries.sql",
    from: "with drawn(href) as (values",
    to: "with drawn(href) as (select null::text where false), unused_drawn(href) as (values",
    expect: "§29.5 lists rows at all",
  },
  {
    name: "sidebar-hints: the parsed item list is emptied",
    gate: HINTS,
    file: HINTS,
    from: "const items = parseItems(src);",
    to: "const items = [];",
    expect: "items parsed",
  },
];

function runGate(gate) {
  try {
    execFileSync(process.execPath, [gate], { encoding: "utf8", stdio: "pipe" });
    return { green: true, failed: [] };
  } catch (e) {
    const out = String(e.stdout ?? "") + String(e.stderr ?? "");
    const failed = [...out.matchAll(/^ {2}FAIL {2}(.+)$/gm)].map((m) => m[1].trim());
    // A gate that CRASHED reported no FAIL lines and is not evidence of
    // anything: recorded as such rather than counted as a catch.
    return { green: false, failed: failed.length ? failed : [`(the gate exited non-zero without a FAIL line)`] };
  }
}

console.log("sidebar structure mutations\n");

const originals = new Map(TARGETS.map((f) => [f, readFileSync(f, "utf8")]));
originals.set("src/components/dashboard/sidebar.tsx", readFileSync("src/components/dashboard/sidebar.tsx", "utf8"));
const restoreAll = () => {
  for (const [file, text] of originals) writeFileSync(file, text);
};

let caught = 0;
const missed = [];
try {
  for (const gate of [STRUCTURE, SIZE, NAMING, HINTS, TOOLTIPS]) {
    const base = runGate(gate);
    console.log(`baseline: ${gate.replace("scripts/tests/", "")} is ${base.green ? "GREEN" : "RED"}`);
    if (!base.green) {
      console.log(`\nBASELINE IS RED — no mutation result below would mean anything.\n  ${base.failed.join("\n  ")}`);
      process.exit(1);
    }
  }
  console.log("");

  for (const m of MUTANTS) {
    const gate = m.gate ?? STRUCTURE;
    const edits = m.edits ?? [{ file: m.file, from: m.from, to: m.to }];
    // STALENESS IS JUDGED AS THE EDITS ARE APPLIED, not against the
    // original file. A swap is written as three chained replacements
    // through a temporary name, and the third one anchors on text the
    // second one produced — checked against the original it reads as a
    // target that no longer exists, and the mutant is skipped as stale
    // while being perfectly applicable. That is a hole in the runner
    // that looks exactly like a hole in the gate.
    const byFile = new Map();
    const stale = [];
    for (const e of edits) {
      const current = byFile.get(e.file) ?? originals.get(e.file);
      if (current === undefined || !current.includes(e.from)) { stale.push(e); break; }
      byFile.set(e.file, current.replace(e.from, e.to));
    }
    if (stale.length > 0) {
      missed.push({ ...m, why: `the mutation target no longer exists in ${stale.map((e) => e.file).join(", ")}` });
      console.log(`  STALE   ${m.name}`);
      continue;
    }
    if ([...byFile.entries()].every(([file, text]) => text === originals.get(file))) {
      missed.push({ ...m, why: "the mutation left every file byte-identical" });
      console.log(`  NO-OP   ${m.name}`);
      continue;
    }
    for (const [file, text] of byFile) writeFileSync(file, text);
    let result;
    try {
      result = runGate(gate);
    } finally {
      restoreAll();
    }
    if (result.green) {
      missed.push({ ...m, why: `${gate.replace("scripts/tests/", "")} stayed green — nothing here is load-bearing` });
      console.log(`  MISSED  ${m.name}`);
      continue;
    }
    const onTarget = result.failed.filter((f) => f.includes(m.expect));
    if (onTarget.length === 0) {
      missed.push({ ...m, why: `it went red, but on "${result.failed.join('", "')}" — nothing matching "${m.expect}"` });
      console.log(`  WRONG   ${m.name}\n          -> red on: ${result.failed.slice(0, 4).join(" | ")}`);
      continue;
    }
    caught++;
    console.log(`  CAUGHT  ${m.name}\n          -> ${onTarget[0]}`);
  }
} finally {
  restoreAll();
}

let allGreen = true;
for (const gate of [STRUCTURE, SIZE, NAMING, HINTS, TOOLTIPS]) {
  if (!runGate(gate).green) { allGreen = false; console.log(`\nBASELINE IS RED — ${gate} was not restored. Check \`git diff\`.`); }
}
if (allGreen) console.log("\nbaseline: all five gates are green again on the restored tree");

console.log(`\n${caught} of ${MUTANTS.length} mutations caught.`);
if (missed.length > 0 || !allGreen) {
  if (missed.length > 0) {
    console.log("\nHOLES:");
    for (const m of missed) console.log(`  - ${m.name}\n    ${m.why}`);
  }
  process.exit(1);
}
console.log("Order, names and count are load-bearing, and no gate passes on an empty list.");
