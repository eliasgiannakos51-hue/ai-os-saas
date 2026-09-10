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
const HINTS = "scripts/tests/sidebar-hints-coverage.test.mjs";
const NAV = "src/lib/sidebar-nav.ts";
const VISIBILITY = "src/lib/sidebar-visibility.ts";

const TARGETS = [STRUCTURE, SIZE, NAMING, HINTS, NAV, VISIBILITY];

const MUTANTS = [
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
    to: '    heading: "Extra",\n    collapsible: true,\n    items: [{ href: "/dashboard/team", label: "Extra", icon: TEAM_ICON, hintKey: "team" }],\n  },\n  {\n    heading: "Organise",',
    expect: "groups drawn, 6 declared",
  },
  {
    name: "two rows change places inside a group",
    edits: [
      { file: NAV, from: '{ href: "/dashboard/documents", label: "Documents"', to: '{ href: "/dashboard/ZZTEMP", label: "Documents"' },
      { file: NAV, from: '{ href: "/dashboard/coding", label: "AI Coding"', to: '{ href: "/dashboard/documents", label: "AI Coding"' },
      { file: NAV, from: '{ href: "/dashboard/ZZTEMP", label: "Documents"', to: '{ href: "/dashboard/coding", label: "Documents"' },
    ],
    expect: "Make: 6 rows, in order",
  },
  {
    name: "a drawn row is quietly hidden",
    file: NAV,
    from: '{ href: "/dashboard/posts", label: "Posts", icon: POSTS_ICON, hintKey: "posts" }',
    to: '{ href: "/dashboard/posts", label: "Posts", icon: POSTS_ICON, hintKey: "posts", hidden: true }',
    expect: "rows drawn, 25 declared",
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
    from: "const DECLARED = [",
    to: "const DECLARED = []; const DECLARED_UNUSED = [",
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
    name: "sidebar-size: the parse finds one group and calls it the sidebar",
    gate: SIZE,
    file: SIZE,
    from: 'const headingRe = /heading: "([^"]+)",\\s*\\n\\s*collapsible: (true|false)/g;',
    to: 'const headingRe = /heading: "(Make)",\\s*\\n\\s*collapsible: (true|false)/g;',
    expect: "so an emptied config cannot pass a ceiling",
  },
  {
    name: "sidebar-size: the group parse stops matching",
    gate: SIZE,
    file: SIZE,
    from: 'const headingRe = /heading: "([^"]+)",\\s*\\n\\s*collapsible: (true|false)/g;',
    to: 'const headingRe = /heading: "(NOTHING_MATCHES_THIS)",\\s*\\n\\s*collapsible: (true|false)/g;',
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
  for (const gate of [STRUCTURE, SIZE, NAMING, HINTS]) {
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
for (const gate of [STRUCTURE, SIZE, NAMING, HINTS]) {
  if (!runGate(gate).green) { allGreen = false; console.log(`\nBASELINE IS RED — ${gate} was not restored. Check \`git diff\`.`); }
}
if (allGreen) console.log("\nbaseline: all four gates are green again on the restored tree");

console.log(`\n${caught} of ${MUTANTS.length} mutations caught.`);
if (missed.length > 0 || !allGreen) {
  if (missed.length > 0) {
    console.log("\nHOLES:");
    for (const m of missed) console.log(`  - ${m.name}\n    ${m.why}`);
  }
  process.exit(1);
}
console.log("Order, names and count are load-bearing, and no gate passes on an empty list.");
