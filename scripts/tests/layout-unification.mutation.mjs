#!/usr/bin/env node
/*
 * ONE LIST PATTERN, AND THE ANSWER "YES, ALREADY" THAT NOBODY COULD CHECK.
 *
 * The rule is that a user learns how one list works and thereby knows how
 * all of them work: "+ New", then full-width search, then sort/filters with
 * a count, then the grid. layout-unification.test.mjs exists because "did
 * we apply it everywhere?" had been answered by reading a task list, and a
 * task list is not evidence.
 *
 * What actually breaks this is never a redesign. It is one new page that
 * hand-rolls its own search box because nobody looks up which toolbar the
 * app already has — the Marketplace did exactly that — or the shared
 * primitive quietly changing the order of its own slots, which moves "where
 * do I add one" on eighteen screens at once.
 *
 * So the mutants are: the order inside the primitive, a surface that stops
 * reaching it, the registry-derived tracker sweep going vacuous, and a
 * second toolbar appearing on a page that had none.
 *
 * Run: node scripts/tests/layout-unification.mutation.mjs
 */
import { readFileSync } from "node:fs";
import { writeFileSync } from "./lib/sidecar-write.mjs";
import { execFileSync } from "node:child_process";

const GATE = "scripts/tests/layout-unification.test.mjs";
const LAYOUT = "src/components/ui/list-layout.tsx";
const GENERIC = "src/components/modules/generic-list.tsx";
const MISSION = "src/components/mission/mission-list.tsx";
const BROWSER = "src/components/marketplace/template-browser.tsx";
const REGISTRY = "src/lib/build-modules.ts";

const MUTANTS = [
  {
    // "WHERE DO I ADD ONE" MOVES ON EVERY SCREEN AT ONCE. The create
    // action sitting after search is the arrangement the unification
    // replaced, and one line in the primitive puts it back everywhere.
    name: "the create action moves below the search box in the shared primitive",
    file: LAYOUT,
    from: "      {newAction ? <div>{newAction}</div> : null}",
    to: "",
    expect: "+ New comes first",
  },
  {
    // THE SEARCH BOX BECOMES A CRAMPED INLINE ONE. `ps-10` is what leaves
    // room for the icon on the LEADING edge — the left in nine locales and
    // the right in Arabic — so this is both a layout and an RTL change.
    name: "the search input loses its full-width class",
    file: LAYOUT,
    from: 'className="input ps-10"',
    to: 'className="input w-40"',
    expect: "full-width",
  },
  {
    // A SEARCH BOX WITH NO NAME. It is an icon and a blank field; a screen
    // reader announces nothing at all.
    name: "the search input stops being labelled for screen readers",
    file: LAYOUT,
    from: "            aria-label={searchPlaceholder}",
    to: "",
    expect: "labelled for screen readers",
  },
  {
    // THE PRIMITIVE STARTS FILTERING. Layout owning the predicate hides
    // each list's real shape behind an indirection the caller cannot
    // follow — which is why the gate forbids it rather than not mentioning
    // it.
    name: "the layout primitive starts owning the filter predicate",
    file: LAYOUT,
    from: "      <div>{children}</div>",
    to: "      <div>{Array.isArray(children) ? children.filter(Boolean) : children}</div>",
    expect: "owns layout, not filtering",
  },
  {
    // THE CALLER LOSES ITS SEARCH WIRING. The box still renders and types;
    // nothing reaches the list.
    name: "search stops being wired by the caller",
    file: LAYOUT,
    from: "onSearchChange",
    to: "onQueryChanged",
    all: true,
    expect: "search is still wired by the caller",
  },
  {
    // A SURFACE STOPS REACHING THE PRIMITIVE — the ordinary way this
    // unravels, one page at a time.
    name: "Mission Control stops rendering through ListLayout",
    file: MISSION,
    from: "<ListLayout",
    to: "<div data-list",
    all: true,
    expect: "Mission Control: actually renders it",
  },
  {
    // THE HOP BREAKS AND TAKES EIGHTEEN PAGES WITH IT. The module pages do
    // not import ListLayout; they route through GenericList, so this one
    // edit un-unifies every tracker at once while each page still looks
    // untouched.
    name: "GenericList stops being the hop for every module page",
    file: GENERIC,
    from: "<ListLayout",
    to: "<div data-list",
    all: true,
    expect: "GenericList is the hop",
  },
  {
    // THE REGISTRY SWEEP GOES VACUOUS. Section 3 derives the tracker list
    // from build-modules.ts precisely so a new one is covered the day it
    // is added; a registry that parses to nothing leaves the loop running
    // zero times and every check below it green.
    // A REAL EDIT, not a reformat. The first version of this mutant put a
    // space before the colon — which breaks the gate's parse and changes
    // nothing about the product, so mutation-anchors.test.mjs correctly
    // reported it as prose and it was right. The second emptied the array
    // at runtime, which the gate cannot see either: it scrapes the
    // registry's TEXT, so a runtime change leaves the same five slugs in
    // the file. What is actually a defect, and what the text-scrape is
    // for, is a slug that no longer matches its route — /dashboard/campaigns
    // then has a page and no configuration behind it.
    name: "a tracker module is dropped from the registry, leaving its page unconfigured",
    file: REGISTRY,
    from: '    slug: "campaigns",\n    emptyKey: "moduleData.empty.campaigns",',
    to: '    slug: "campaigns-removed",\n    emptyKey: "moduleData.empty.campaigns",',
    expect: "uses the shared BuildModulePage",
  },
  {
    // THE MARKETPLACE'S OWN TOOLBAR, BACK. It shipped with one, for
    // exactly the reason section 5 exists, and it is the page most likely
    // to grow a second one again.
    name: "the marketplace hand-rolls its own search input again",
    file: BROWSER,
    from: "<ListLayout",
    to: '<input type="search" className="input" />\n      <ListLayout',
    expect: "no hand-rolled search input",
  },
];

function runGate() {
  try {
    execFileSync(process.execPath, [GATE], { encoding: "utf8", stdio: "pipe" });
    return { green: true, failed: [] };
  } catch (e) {
    const out = String(e.stdout ?? "") + String(e.stderr ?? "");
    const failed = [...out.matchAll(/^ {2}FAIL {2}(.+)$/gm)].map((m) => m[1].trim());
    return { green: false, failed: failed.length ? failed : ["(exited non-zero with no FAIL line)"] };
  }
}

console.log("layout-unification mutations\n");
const TARGETS = [...new Set(MUTANTS.map((m) => m.file))];
const originals = new Map(TARGETS.map((f) => [f, readFileSync(f, "utf8")]));
const restoreAll = () => { for (const [f, t] of originals) writeFileSync(f, t); };

let caught = 0;
const missed = [];
try {
  const base = runGate();
  console.log(`baseline: the gate is ${base.green ? "GREEN" : "RED"} on the unmutated tree`);
  if (!base.green) {
    console.log(`\nBASELINE IS RED — no result below would mean anything.\n  ${base.failed.join("\n  ")}`);
    process.exit(1);
  }
  for (const m of MUTANTS) {
    const original = originals.get(m.file);
    if (!original.includes(m.from)) {
      missed.push({ ...m, why: `the mutation target no longer exists in ${m.file}` });
      console.log(`  STALE   ${m.name}`);
      continue;
    }
    writeFileSync(m.file, m.all ? original.split(m.from).join(m.to) : original.replace(m.from, m.to));
    let result;
    try { result = runGate(); } finally { restoreAll(); }
    if (result.green) {
      missed.push({ ...m, why: "the gate stayed green — nothing here is load-bearing" });
      console.log(`  MISSED  ${m.name}`);
      continue;
    }
    const onTarget = result.failed.filter((f) => f.includes(m.expect));
    if (onTarget.length === 0) {
      missed.push({ ...m, why: `red on "${result.failed.slice(0, 3).join('", "')}" — nothing matching "${m.expect}"` });
      console.log(`  WRONG   ${m.name}\n          -> red on: ${result.failed.slice(0, 3).join(" | ")}`);
      continue;
    }
    caught++;
    console.log(`  CAUGHT  ${m.name}\n          -> ${onTarget[0]}`);
  }
} finally {
  restoreAll();
}

const after = runGate();
console.log(after.green ? "\nbaseline: green again on the restored tree" : "\nBASELINE IS RED — a mutation was not restored.");
console.log(`\n${caught} of ${MUTANTS.length} mutations caught.`);
if (missed.length > 0 || !after.green) {
  if (missed.length) { console.log("\nHOLES:"); for (const m of missed) console.log(`  - ${m.name}\n    ${m.why}`); }
  process.exit(1);
}
console.log("No list surface can arrive at its own arrangement without this going red.");
