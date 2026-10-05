#!/usr/bin/env node
/*
 * HOW TALL IS THE SIDEBAR, AND DOES IT FIT WITHOUT SCROLLING?
 *
 * Asked first on 2026-09-12, when the sidebar drew every group of tools
 * and the answer was 2.3 screens on a phone. Since ΣΥΣΤΗΜΑ DESIGN
 * (docs/CONTEXT.md, 2026-10-04) it draws a fixed rail — New, Chat,
 * Coding, All tools — then Recent tools (none to five rows) and Settings
 * at the bottom, so the question became the opposite one: does the
 * LONGEST rail, five recent tools, fit on one screen with no scroll?
 *
 * EVERY DIMENSION IS READ OUT OF THE COMPONENT, not typed here. The row
 * height, the gaps and the paddings are parsed from the class names in
 * components/dashboard/sidebar.tsx, and the rows from lib/nav/rail.ts
 * and lib/nav/recent-tools.ts, so a class that changes moves this
 * number instead of quietly making it wrong.
 *
 * NOT A BROWSER MEASUREMENT. A real one needs a build, a server and
 * Playwright; the site audit (docs/QUEUE.md, D.11) is where the rail is
 * measured on a screen. This is the arithmetic a person can check by
 * reading the file.
 *
 * Run: node scripts/measure-sidebar-height.mjs
 */
import { readFileSync } from "node:fs";

const SIDEBAR = "src/components/dashboard/sidebar.tsx";
const src = readFileSync(SIDEBAR, "utf8");
const rail = readFileSync("src/lib/nav/rail.ts", "utf8");
const recent = readFileSync("src/lib/nav/recent-tools.ts", "utf8");

/** Tailwind's spacing scale: 1 unit = 4px, and `0.5` = 2px. */
const spacing = (n) => Number(n) * 4;

function need(text, re, what, where = SIDEBAR) {
  const m = text.match(re);
  if (!m) {
    console.error(`could not read ${what} out of ${where} — the class changed and this number would be a guess`);
    process.exit(1);
  }
  return m;
}

const ROW = Number(need(src, /nav-item flex min-h-\[(\d+)px\]/, "the row height")[1]);
const ROW_GAP = spacing(need(src, /<nav className="flex-1 space-y-([\d.]+) px-[\d.]+"/, "the gap between rows")[1]);
const FIXED = [...rail.slice(rail.indexOf("RAIL_ROWS"), rail.indexOf("] as const")).matchAll(/\{ key: "/g)].length;
const MAX_RECENT = Number(need(recent, /RECENT_TOOLS_MAX = (\d+);/, "the most recent tools", "src/lib/nav/recent-tools.ts")[1]);
// The Recent block: pt-5 above, a text-xs caption (line-height 1rem) with pb-2.
const RECENT_TOP = spacing(need(src, /<div className="pt-([\d.]+)" data-testid="recent-tools">/, "the space above Recent tools")[1]);
const CAPTION = 16 + spacing(need(src, /<p className="px-3 pb-([\d.]+) text-xs text-muted">\{t\("rail\.recentTools"\)\}/, "the caption's padding")[1]);
// The header: py-4 around the logo, whose height is the px it is given.
const HEADER = 2 * spacing(need(src, /flex items-center gap-2 px-3 py-([\d.]+)/, "the header padding")[1]) +
  Number(need(src, /<Logo px=\{(\d+)\} \/>/, "the logo size")[1]);
// The footer: border, py-3, the Settings row, the account (two text-xs
// lines) and, on a desktop only, the collapse button.
const FOOT_PAD = 2 * spacing(need(src, /border-t border-divider px-2 py-([\d.]+)/, "the footer padding")[1]) + 1;
const ACCOUNT = 2 * 16;
const footer = (desktop) => FOOT_PAD + ROW + ROW_GAP + ACCOUNT + (desktop ? ROW_GAP + ROW : 0);

const navHeight = (recentRows) =>
  FIXED * ROW + (FIXED - 1) * ROW_GAP + (recentRows > 0 ? RECENT_TOP + CAPTION + recentRows * ROW + (recentRows - 1) * ROW_GAP : 0);
const total = (recentRows, desktop) => HEADER + navHeight(recentRows) + footer(desktop);

// 844 is a 390-wide phone; 900 is the content height of a 1440x900
// laptop once the browser chrome is out.
const VIEWPORTS = [
  ["390x844", 844, false],
  ["1440x900", 900, true],
];

console.log("sidebar height, computed from the component's own classes\n");
console.log(`  ${FIXED} fixed rows + up to ${MAX_RECENT} recent · row ${ROW}px + ${ROW_GAP}px gap · header ${HEADER}px\n`);
console.log("  case                         height   390x844   1440x900");
let worst = 0;
for (const [label, rows] of [["a new person (no recent)", 0], [`the longest (${MAX_RECENT} recent)`, MAX_RECENT]]) {
  const cells = VIEWPORTS.map(([, h, desktop]) => {
    const px = total(rows, desktop);
    worst = Math.max(worst, px / h);
    return `${String(px).padStart(5)}px ${(px / h).toFixed(2)}`;
  });
  console.log(`  ${label.padEnd(28)} ${cells.join("   ")}`);
}
console.log(
  worst <= 1
    ? "\n  The longest rail fits on one screen on both, with no scroll."
    : `\n  The longest rail is ${worst.toFixed(2)} screens — it scrolls, which the design does not want.`
);
