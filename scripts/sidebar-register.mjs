#!/usr/bin/env node
/**
 * THE REGISTER OF POSITIONS, PRINTED FROM THE CONFIG THAT HOLDS THEM.
 *
 * Run: node scripts/sidebar-register.mjs           # the table
 *      node scripts/sidebar-register.mjs --write   # into docs/sidebar-structure.md
 *
 * WHY THIS IS A SCRIPT AND NOT A HAND-WRITTEN TABLE. docs/v5-list.md was
 * wrong in four places on 2026-09-11 and every one of them was a true
 * sentence that had gone stale: work that had been done, described as
 * still to do. CLAUDE.md's rule out of that week is that a number in a
 * document is either dated at the point of use or produced by the thing
 * that prints it. A register of a hundred and eleven positions, each
 * with a flag that changes the day a feature ships, is the second kind
 * or it is nothing — so the table between the two markers in
 * docs/sidebar-structure.md is written by this file and the prose
 * around it is written by hand.
 *
 * Parsed, not imported: lib/sidebar-nav.ts imports forty-odd icons from
 * lucide-react. The FILTERS are the real ones out of
 * lib/sidebar-visibility.ts, for the same reason scripts/sidebar-census.mjs
 * runs them — a register that re-derived "is this drawn" in a regex
 * would be a second opinion about the product rather than a reading of
 * it.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { groupBlocks, itemChunks } from "./tests/lib/sidebar-source.mjs";

const { loadTs } = await import("./tests/load-ts.mjs");
const vis = await loadTs("src/lib/sidebar-visibility.ts");

const NAV = "src/lib/sidebar-nav.ts";
const DOC = "docs/sidebar-structure.md";
const src = readFileSync(NAV, "utf8");
const labelOf = (head) =>
  head.match(/label:\s*"([^"]+)"/)?.[1] ?? head.match(/label:\s*([A-Za-z_][\w.]*)/)?.[1] ?? "?";

const GROUPS = groupBlocks(src).map((g) => ({
  heading: g.heading,
  items: itemChunks(g.body).map((it) => ({
    href: it.literalHref ?? `${it.constantHref}.href`,
    label: labelOf(it.head),
    ...(it.hidden ? { hidden: true } : {}),
    ...(it.notBuilt ? { notBuilt: true } : {}),
    ...(it.retired ? { retired: "parsed" } : {}),
    ...(it.ownerOnly ? { ownerOnly: true } : {}),
  })),
}));
if (GROUPS.length === 0) { console.error(`${NAV} parsed to nothing`); process.exit(2); }

const drawnOwner = new Set(vis.sidebarGroups(GROUPS, true).flatMap((g) => g.items.map((i) => i.href)));
const drawnUser = new Set(vis.sidebarGroups(GROUPS, false).flatMap((g) => g.items.map((i) => i.href)));
const palette = new Set(vis.visibleGroups(GROUPS, false).flatMap((g) => g.items.map((i) => i.href)));

const state = (i) => {
  if (i.notBuilt) return "notBuilt";
  if (i.retired) return "retired";
  if (i.ownerOnly && i.hidden) return "ownerOnly + hidden";
  if (i.ownerOnly) return "ownerOnly";
  if (i.hidden) return "hidden";
  return "**live**";
};
const where = (i) =>
  drawnUser.has(i.href) ? "sidebar" : drawnOwner.has(i.href) ? "sidebar (owner)" : palette.has(i.href) ? "⌘K + hub" : "nowhere";

const lines = [];
let n = 0;
for (const g of GROUPS) {
  const live = g.items.filter((i) => drawnOwner.has(i.href)).length;
  lines.push("");
  lines.push(`### ${g.heading} — ${live} drawn of ${g.items.length} declared${live === 0 ? " · **the heading is not on screen**" : ""}`);
  lines.push("");
  lines.push("| # | position | label (en) | href | state | reachable from |");
  lines.push("|---|---|---|---|---|---|");
  g.items.forEach((i, k) => {
    n++;
    lines.push(`| ${n} | ${k + 1} | ${i.label} | \`${i.href}\` | ${state(i)} | ${where(i)} |`);
  });
}
const table = lines.join("\n");
const summary =
  `Declared positions: **${n}** in **${GROUPS.length}** groups. ` +
  `Drawn for an ordinary account: **${drawnUser.size}**; for the owner: **${drawnOwner.size}**. ` +
  `Offered by the command palette and the hub: **${palette.size}**.`;

const block = `<!-- REGISTER:BEGIN — written by scripts/sidebar-register.mjs, do not edit by hand -->\n\n${summary}\n${table}\n\n<!-- REGISTER:END -->`;

if (process.argv.includes("--write")) {
  const doc = readFileSync(DOC, "utf8");
  const a = doc.indexOf("<!-- REGISTER:BEGIN");
  const b = doc.indexOf("<!-- REGISTER:END -->");
  if (a < 0 || b < 0) { console.error(`${DOC} has no REGISTER markers`); process.exit(2); }
  writeFileSync(DOC, doc.slice(0, a) + block + doc.slice(b + "<!-- REGISTER:END -->".length));
  console.log(`${DOC} rewritten — ${n} positions`);
} else {
  console.log(block);
}
