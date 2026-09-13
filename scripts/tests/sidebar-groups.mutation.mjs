#!/usr/bin/env node
/*
 * CAN THE GATES SEE THE SIDEBAR RESTRUCTURE COME UNDONE?
 *
 * Eight groups became four and nineteen log screens became one row. Every
 * way that can go wrong is quiet:
 *
 *   - a page stops being reachable at all, and the menu just looks tidier
 *   - the palette drops the nineteen, and search stops finding them
 *   - a tracker moves back under Build, and the heading lies again
 *   - a second pinned row appears, and "the one action" stops meaning it
 *   - an old heading creeps back, and there are five groups again
 *
 * DIFFERENT DIMENSIONS, ON PURPOSE — the sixth way a gate lies is that
 * every mutation probes the same property. These are grouped by what
 * each attacks and the suite fails if any dimension is left with one.
 *
 * Run: node scripts/tests/sidebar-groups.mutation.mjs
 */
import { readFileSync } from "node:fs";
// writeFileSync from the sidecar helper, not node:fs — a run killed
// mid-mutation has no finally, and the sidecar is what heals the tree on
// the next run. Convention introduced on main after this suite was
// written; scripts/tests/mutation-sidecar.test.mjs enforces it.
import { writeFileSync } from "./lib/sidecar-write.mjs";
import { execFileSync } from "node:child_process";

const NAMING = "scripts/tests/sidebar-naming.test.mjs";
const TOOLTIPS = "scripts/tests/sidebar-and-tooltips.test.mjs";
const NAV = "src/lib/sidebar-nav.ts";
const SIDEBAR = "src/components/dashboard/sidebar.tsx";
const PALETTE = "src/components/dashboard/command-palette.tsx";
const TARGETS = [NAV, SIDEBAR, PALETTE];

const MUTANTS = [
  // ---- A. NOTHING BECAME UNREACHABLE --------------------------------
  {
    dimension: "A. reachability",
    gate: NAMING,
    name: "a tracker drops out of the records list and out of the product",
    file: NAV,
    from: '      { href: "/dashboard/campaigns", label: "Campaigns", icon: MODULE_ICONS.campaigns, hintKey: "campaigns", hidden: true },\n',
    to: "",
    expect: "is under See, or holds a declared position under Make",
  },
  {
    dimension: "A. reachability",
    gate: NAMING,
    name: "the trackers' group is renamed, so the logs have no home the gate can find",
    from: '    heading: "See",',
    to: '    heading: "Records",',
    file: NAV,
    expect: "the group the logs live in exists",
  },
  {
    dimension: "A. reachability",
    gate: TOOLTIPS,
    name: "the palette stops searching the nineteen",
    file: PALETTE,
    from: "  visibleGroups(ALL_SIDEBAR_GROUPS, isOwner).flatMap((group) => group.items);",
    to: "  visibleGroups(ALL_SIDEBAR_GROUPS, isOwner).flatMap((group) => group.items.filter((item) => !item.hidden));",
    expect: "searches hidden items too",
  },

  // ---- B. THE HEADING STILL MEANS WHAT IT SAYS ----------------------
  {
    dimension: "B. build means build",
    gate: NAMING,
    name: "a row is added to Make that nobody justified",
    file: NAV,
    from: '      { href: "/dashboard/coding", label: "AI Coding", icon: MODULE_ICONS.coding, hintKey: "coding" },',
    to: '      { href: "/dashboard/coding", label: "AI Coding", icon: MODULE_ICONS.coding, hintKey: "coding" },\n      { href: "/dashboard/favorites", label: "Favorites", icon: FAVORITES_ICON, hintKey: "favorites" },',
    expect: "every remaining Make item is one somebody justified",
  },
  {
    dimension: "B. build means build",
    gate: NAMING,
    // DRAWN under Make, which is what the rule became on 2026-09-12 with
    // the declared-position work. Images is IN the Make group already, as
    // a position held with `hidden: true`, and the defect is the flag
    // coming off before the page generates anything. This mutant anchored
    // on the Voice row until that day — Voice moved to Ask, so it was
    // adding a tracker to a different group and the gate was right to
    // stay green.
    name: "a tracker is DRAWN under Make",
    file: NAV,
    from: '      { href: "/dashboard/images", label: "Images", icon: MODULE_ICONS.images, hintKey: "images", hidden: true },',
    to: '      { href: "/dashboard/images", label: "Images", icon: MODULE_ICONS.images, hintKey: "images" },',
    expect: "no tracking-only module is DRAWN under Make",
  },

  // ---- C. FOUR GROUPS, NAMED FOR WHAT SOMEBODY IS DOING -------------
  {
    dimension: "C. four groups",
    gate: NAMING,
    name: "an old noun heading creeps back",
    file: NAV,
    from: '    heading: "Make",',
    to: '    heading: "Operations",',
    expect: "no heading key points at a heading that does not exist",
  },
  {
    dimension: "C. four groups",
    gate: TOOLTIPS,
    // THE OTHER DIRECTION SINCE 2026-09-12. No group is pinned open any
    // more — the group holding the current page opens itself — so there is
    // no pinned group left to put behind a triangle. The defect in the
    // same place is pinning one open again, which puts a block on every
    // phone whether the person is in it or not.
    name: "a group is pinned open again",
    file: NAV,
    from: '    heading: "Ask",\n    collapsible: true,',
    to: '    heading: "Ask",\n    collapsible: false,',
    expect: "no group is pinned open",
  },

  // ---- D. ONE ACTION, NOT A PINNED BLOCK ----------------------------
  {
    dimension: "D. one action",
    gate: TOOLTIPS,
    name: "the sidebar renders the hidden trackers after all",
    file: SIDEBAR,
    from: "          {sidebarGroups(MAIN_SIDEBAR_GROUPS, isOwner).map(renderGroup)}",
    to: "          {visibleGroups(MAIN_SIDEBAR_GROUPS, isOwner).map(renderGroup)}",
    expect: "hidden",
  },
  {
    dimension: "D. one action",
    gate: TOOLTIPS,
    name: "Settings stops being its own group",
    file: SIDEBAR,
    from: "            {sidebarGroups([SETTINGS_GROUP], isOwner).map(renderGroup)}",
    to: "            {null}",
    expect: "Settings",
  },
];

function runGate(gate) {
  try {
    execFileSync(process.execPath, [gate], { encoding: "utf8", stdio: "pipe" });
    return { green: true, failed: [] };
  } catch (e) {
    const out = String(e.stdout ?? "") + String(e.stderr ?? "");
    return {
      green: false,
      failed: [...out.matchAll(/^ {2}FAIL {2}(.+)$/gm)].map((m) => m[1].trim()),
    };
  }
}

console.log("sidebar-groups mutations\n");
const originals = new Map(TARGETS.map((f) => [f, readFileSync(f, "utf8")]));
const restoreAll = () => {
  for (const [file, text] of originals) writeFileSync(file, text);
};

let caught = 0;
const missed = [];
const byDimension = new Map();
try {
  for (const gate of [NAMING, TOOLTIPS]) {
    const base = runGate(gate);
    console.log(`baseline: ${gate.split("/").pop()} is ${base.green ? "GREEN" : "RED"}`);
    if (!base.green) {
      console.log(`\nBASELINE IS RED.\n  ${base.failed.join("\n  ")}`);
      process.exit(1);
    }
  }
  for (const m of MUTANTS) {
    byDimension.set(m.dimension, (byDimension.get(m.dimension) ?? 0) + 1);
    if (!originals.get(m.file).includes(m.from)) {
      missed.push({ ...m, why: `the mutation target no longer exists in ${m.file}` });
      console.log(`  MISSED  ${m.name}`);
      continue;
    }
    writeFileSync(m.file, originals.get(m.file).replace(m.from, m.to));
    const result = runGate(m.gate);
    restoreAll();
    const named = result.failed.find((f) => f.includes(m.expect));
    if (named) {
      caught++;
      console.log(`  CAUGHT  ${m.name}\n          -> ${named}`);
    } else {
      missed.push({
        ...m,
        why: result.green
          ? "the gate stayed green"
          : `red, but not on "${m.expect}" — on: ${result.failed.slice(0, 3).join(" | ")}`,
      });
      console.log(`  MISSED  ${m.name}`);
    }
  }
} finally {
  restoreAll();
}

console.log("\ndimensions probed:");
const thin = [];
for (const [dimension, count] of [...byDimension].sort()) {
  console.log(`  ${count} x ${dimension}`);
  if (count < 2) thin.push(dimension);
}
if (thin.length > 0) console.log(`\nTHIN DIMENSIONS (one mutant each): ${thin.join(", ")}`);

console.log(`\n${caught} of ${MUTANTS.length} mutations caught.`);
if (missed.length > 0) {
  console.log("\nHOLES:");
  for (const m of missed) console.log(`  - ${m.name}\n    ${m.why}`);
}
if (missed.length > 0 || thin.length > 0) process.exit(1);
console.log(`Every clause holds, across ${byDimension.size} dimensions.`);
