#!/usr/bin/env node
/**
 * WHAT THE SIDEBAR ACTUALLY DRAWS, BY RUNNING THE FILTER THAT DRAWS IT.
 *
 * Run: scripts/sidebar-census.mjs
 *
 * WHY THIS EXISTS. On 2026-09-26 a grep over lib/sidebar-nav.ts reported
 * "36 of 43 pages are in the sidebar" and the number was wrong: it counted
 * every href the file mentions, and `hidden: true` rows are mentioned
 * there precisely so the palette and the hub can offer them while the
 * sidebar does not. Three of them — Images, Videos, Apps — were then
 * described to the owner as drawn when nothing draws them.
 *
 * A census of a filtered list has to run the filter. `visibleGroups` and
 * `sidebarGroups` in lib/sidebar-visibility.ts are what the command
 * palette and components/dashboard/sidebar.tsx call; this file calls the
 * same two functions, so it cannot disagree with the product about what
 * is on screen. Reading the config and re-deriving the rule in a regex is
 * exactly how the wrong number happened.
 *
 * THE CONFIG IS PARSED, THE RULE IS EXECUTED, and the split is forced:
 * lib/sidebar-nav.ts imports forty-odd icons from lucide-react and
 * scripts/tests/load-ts.mjs refuses external imports, so the data cannot
 * be imported. lib/sidebar-visibility.ts was split out of it for this
 * reason and has no runtime import at all, so the FILTER can be. Parsing
 * is confined to scripts/tests/lib/sidebar-source.mjs, the same parser
 * scripts/tests/sidebar-structure.test.mjs holds against an independent
 * count.
 *
 * FOUR POPULATIONS, and the difference between them is the point:
 *
 *   declared   every position the structure knows about, built or not.
 *              The register: it says WHERE a feature goes the day it
 *              starts working, instead of "at the bottom of its group".
 *   palette    what ⌘K and /dashboard/records offer: declared minus
 *              notBuilt minus retired.
 *   drawn      what the sidebar draws: palette minus hidden.
 *   dark       declared minus drawn, split by the reason it is dark.
 */
import { readFileSync } from "node:fs";
import { groupBlocks, itemChunks } from "./tests/lib/sidebar-source.mjs";

const { loadTs } = await import("./tests/load-ts.mjs");
const vis = await loadTs("src/lib/sidebar-visibility.ts");

const NAV = "src/lib/sidebar-nav.ts";
const src = readFileSync(NAV, "utf8");

// The flags come from the parser; the label is read here because the
// parser's job is the visibility flags and nothing else needs the text.
// `label: CREATE_NAV_ITEM.label` is a real form in the file, so a label
// that is not a literal keeps its expression rather than becoming "".
const labelOf = (head) =>
  head.match(/label:\s*"([^"]+)"/)?.[1] ?? head.match(/label:\s*([A-Za-z_][\w.]*)/)?.[1] ?? "?";

const GROUPS = groupBlocks(src).map((g) => ({
  heading: g.heading,
  items: itemChunks(g.body).map((it) => ({
    href: it.literalHref ?? `\${${it.constantHref}.href}`,
    label: labelOf(it.head),
    ...(it.hidden ? { hidden: true } : {}),
    ...(it.notBuilt ? { notBuilt: true } : {}),
    ...(it.retired ? { retired: "parsed" } : {}),
    ...(it.ownerOnly ? { ownerOnly: true } : {}),
  })),
}));

if (GROUPS.length === 0 || GROUPS.every((g) => g.items.length === 0)) {
  console.log(`${NAV} parsed to nothing — the anchor in sidebar-source.mjs has moved.`);
  process.exit(2);
}

// isOwner=false: the census is a claim about the product, not about the
// one account that also administers it. The owner-only rows are counted
// in the dark list with their reason rather than folded into the total.
const declared = vis.declaredGroups(GROUPS);
const palette = vis.visibleGroups(GROUPS, false);
const drawn = vis.sidebarGroups(GROUPS, false);

const count = (gs) => gs.reduce((n, g) => n + g.items.length, 0);
const flat = (gs) => gs.flatMap((g) => g.items.map((i) => ({ ...i, group: g.heading })));

const drawnSet = new Set(flat(drawn).map((i) => i.href));
const dark = flat(declared).filter((i) => !drawnSet.has(i.href));
const why = (i) =>
  i.notBuilt ? "notBuilt" : i.retired ? "retired" : i.hidden ? "hidden" : i.ownerOnly ? "ownerOnly" : "?";

console.log(`sidebar census — ${NAV} parsed, lib/sidebar-visibility.ts run\n`);
for (const g of declared) {
  const shown = drawn.find((d) => d.heading === g.heading);
  const n = shown ? shown.items.length : 0;
  console.log(
    `  ${g.heading.padEnd(10)} ${String(n).padStart(2)} drawn of ${String(g.items.length).padStart(2)} declared` +
      (n === 0 ? "   <- the whole group is dark, so the heading is not drawn either" : "")
  );
}
console.log("");
console.log(`  declared positions  : ${count(declared)}`);
console.log(`  offered in ⌘K       : ${count(palette)}`);
console.log(`  DRAWN in the sidebar: ${count(drawn)}`);
console.log(`  groups drawn        : ${drawn.length} of ${declared.length}`);

const byReason = new Map();
for (const i of dark) byReason.set(why(i), (byReason.get(why(i)) ?? 0) + 1);
console.log(`\n  dark positions      : ${dark.length}`);
for (const [r, n] of [...byReason].sort((a, b) => b[1] - a[1])) {
  console.log(
    `    ${r.padEnd(10)} ${String(n).padStart(2)}  ${dark.filter((i) => why(i) === r).map((i) => i.label).join(", ")}`
  );
}
console.log("\n  notBuilt : no page — the palette would be offering a 404.");
console.log("  hidden   : the page works; the sidebar is kept short.");
console.log("  retired  : the page works and the capability was withdrawn.");
console.log("  ownerOnly: drawn for the account owner, nobody else.");
