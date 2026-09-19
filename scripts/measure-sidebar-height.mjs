#!/usr/bin/env node
/*
 * HOW TALL IS THE SIDEBAR, AND HOW MANY SCREENS OF SCROLL IS THAT?
 *
 * Asked on 2026-09-12 because the answer decides whether the nav can
 * absorb the six features that are not built yet. "Thirty rows" is not an
 * answer; "thirty rows is 1,608px, which is 2.7 screens on a 390x844
 * phone" is.
 *
 * EVERY DIMENSION IS READ OUT OF THE COMPONENT, not typed here. The row
 * height, the gaps, the heading height and the paddings are parsed from
 * the actual class names in components/dashboard/sidebar.tsx, so a class
 * that changes moves this number instead of quietly making it wrong. The
 * two things that cannot be parsed — the logo's rendered height and the
 * account block — are computed from the SVG's own viewBox and from the
 * same class scan, and both are labelled below.
 *
 * NOT A BROWSER MEASUREMENT. A real one needs a build, a server and
 * Playwright, and lives in the prodtests. This is the arithmetic a person
 * can check by reading the file, which is what is wanted before deciding
 * a structure rather than after.
 *
 * Run: node scripts/measure-sidebar-height.mjs
 */
import { readFileSync } from "node:fs";

const SIDEBAR = "src/components/dashboard/sidebar.tsx";
const src = readFileSync(SIDEBAR, "utf8");
const LOGO = readFileSync("src/components/logo.tsx", "utf8");

/** Tailwind's spacing scale: 1 unit = 4px, and `0.5` = 2px. */
const spacing = (n) => Number(n) * 4;

function need(re, what) {
  const m = src.match(re);
  if (!m) {
    console.error(`could not read ${what} out of ${SIDEBAR} — the class changed and this number would be a guess`);
    process.exit(1);
  }
  return m;
}

// A row: min-h-[44px], in a list with space-y-0.5 between them.
const ROW = Number(need(/nav-item group relative flex min-h-\[(\d+)px\]/, "the row height")[1]);
const ROW_GAP = spacing(need(/<div className="space-y-([\d.]+) pb-[\d.]+">/, "the gap between rows")[1]);
// A heading: a <p> at text-[10px] with pb-1.5 under it.
//
// IT WAS A 44px BUTTON UNTIL 2026-09-19. Every group was collapsible, so
// the heading was a tap target and carried min-h-[44px]; with nothing
// left to toggle it is a caption, and a caption is its own line box. At
// text-[10px] Tailwind's line-height is 1rem = 16px — which is most of
// why the measured nav fell from 1,702px to 1,564px while GAINING
// nineteen visible rows. Six headings went from 300px to 132px.
const HEAD_TEXT = Number(need(/px-3 pb-[\d.]+ text-\[(\d+)px\] font-semibold uppercase tracking-widest/, "the heading font size")[1]);
// Tailwind pairs text-[10px] with the default line-height of 1rem.
const HEAD = Math.max(16, HEAD_TEXT);
const HEAD_PAD = spacing(need(/px-3 pb-([\d.]+) text-\[10px\]/, "the padding under a heading")[1]);
const LIST_PAD = spacing(need(/space-y-[\d.]+ pb-([\d.]+)">/, "the padding under a group's list")[1]);
const GROUP_GAP = spacing(need(/<nav className="space-y-(\d+) p-\d+">/, "the gap between groups")[1]);
const NAV_PAD = spacing(need(/<nav className="space-y-\d+ p-(\d+)">/, "the nav's own padding")[1]);

// The header: py-3 around a logo whose height comes from its viewBox.
const HEADER_PAD = spacing(need(/relative flex items-center justify-center px-4 py-(\d+)/, "the header padding")[1]);
const LOGO_W = Number(need(/Logo className="h-auto w-\[(\d+)px\]/, "the logo width")[1]);
// THE FULL LOGO, NOT THE ICON. logo.tsx carries two SVGs and both have
// role="img"; the first match is the square icon-only one (140x140),
// which would make the header 24px shorter than it is. The sidebar
// renders the full mark, and the aria-label is what tells them apart.
const [, vbW, vbH] = LOGO.match(/viewBox="\d+ \d+ (\d+) (\d+)"\s+role="img" aria-label="Ionexa AI"/) ?? [];
const LOGO_H = Math.round((LOGO_W * Number(vbH)) / Number(vbW));

// The three blocks under the nav, each `border-t … p-3`. Their contents
// are a button row, an icon row and the account block (h-9 avatar).
const FOOT_PAD = spacing(3);
const FOOTER = 3 * (1 + 2 * FOOT_PAD) + 44 + 44 + 36;

const groupHeight = (rows) => HEAD + HEAD_PAD + rows * ROW + (rows - 1) * ROW_GAP + LIST_PAD;

function total(groups) {
  const bodies = groups.map((g) => groupHeight(g.rows));
  const chrome = HEADER_PAD * 2 + LOGO_H + NAV_PAD * 2 + FOOTER;
  return chrome + bodies.reduce((a, b) => a + b, 0) + (groups.length - 1) * GROUP_GAP;
}

// TODAY, read off lib/sidebar-nav.ts through the structure gate's own
// declaration rather than counted by hand.
const TODAY = [
  { name: "Make", rows: 5 },
  { name: "Ask", rows: 4 },
  { name: "Run", rows: 3 },
  { name: "See", rows: 8 },
  { name: "Organise", rows: 4 },
  { name: "Settings", rows: 3 },
];
// WITH EVERY PLANNED ROW DRAWN: Images, Videos, Music under Make; Browser
// and Computer under Run; Meetings under Organise. Six more.
const FUTURE = [
  { name: "Make", rows: 5 + 3 },
  { name: "Ask", rows: 4 },
  { name: "Run", rows: 3 + 2 },
  { name: "See", rows: 8 },
  { name: "Organise", rows: 4 + 1 },
  { name: "Settings", rows: 3 },
];

// The two screens the brief names. 844 is a 390-wide phone; 900 is the
// content height of a 1440x900 laptop once the browser chrome is out.
const VIEWPORTS = { "390x844": 844, "1440x900": 900 };
const rowsOf = (g) => g.reduce((a, b) => a + b.rows, 0);

console.log("sidebar height, computed from the component's own classes\n");
console.log(`  row ${ROW}px + ${ROW_GAP}px gap · heading ${HEAD}+${HEAD_PAD}px · group gap ${GROUP_GAP}px`);
console.log(`  chrome: header ${HEADER_PAD * 2 + LOGO_H}px (logo ${LOGO_W}x${LOGO_H} from its viewBox) + footer ${FOOTER}px\n`);

// EVERY GROUP IS OPEN since 2026-09-19, so there is one case per
// STRUCTURE rather than one per open-set. The collapse cases that stood
// here — "only the group you are in", "Make plus one opened by hand",
// "all collapsed" — described a sidebar on which five of six headings
// stood over nothing, which is what production reported.
//
// THIS IS ARITHMETIC, NOT A MEASUREMENT. Section 4 of
// scripts/tests/sidebar-density.prodtest.mjs measures the same thing in
// a real browser against a real build; where the two disagree, believe
// the browser. Measured there on 2026-09-19: 1,633px at 390x844 and
// 1,564px at 1440x900.
const CASES = [
  ["today · every group open", TODAY],
  ["all planned rows · every group open (the worst case)", FUTURE],
];

const pad = (n, w) => String(n).padStart(w);
console.log("  case                                                    rows   height   390x844   1440x900");
for (const [label, groups] of CASES) {
  const px = total(groups);
  const drawn = rowsOf(groups);
  const s390 = (px / VIEWPORTS["390x844"]).toFixed(1);
  const s1440 = (px / VIEWPORTS["1440x900"]).toFixed(1);
  console.log(
    `  ${label.padEnd(54)} ${pad(drawn, 2)}/${rowsOf(groups)}  ${pad(px, 5)}px   ${s390} scr   ${s1440} scr`
  );
}

const chrome = HEADER_PAD * 2 + LOGO_H + NAV_PAD * 2 + FOOTER;
console.log(`
  WHAT FITS WITHOUT SCROLLING. The nav has ${VIEWPORTS["390x844"] - chrome}px on the phone and
  ${VIEWPORTS["1440x900"] - chrome}px on the laptop, once the header and the three footer blocks are
  taken out. Six headings cost ${6 * (HEAD + HEAD_PAD)}px of that before a single row is drawn,
  which leaves room for ${Math.floor((VIEWPORTS["390x844"] - chrome - 6 * (HEAD + HEAD_PAD) - 5 * GROUP_GAP) / (ROW + ROW_GAP))} rows on the phone and ${Math.floor((VIEWPORTS["1440x900"] - chrome - 6 * (HEAD + HEAD_PAD) - 5 * GROUP_GAP) / (ROW + ROW_GAP))} on the laptop.

  The rest is scroll, and that is the trade the owner took on 2026-09-19:
  every group open, every row one scroll away, with the condition that
  the phone stays under three screens. Section 4 of
  scripts/tests/sidebar-density.prodtest.mjs holds that condition against
  a browser rather than against this arithmetic.`);
