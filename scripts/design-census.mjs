#!/usr/bin/env node
/*
 * HOW DENSE IS THIS PRODUCT, AS A NUMBER.
 *
 * Redesign phase 4 asked for "fewer borders, fewer cards, more space,
 * bigger type" and, before any of it, for the COUNT — because "cut half
 * the borders" is not a thing you can do, or check, without one.
 *
 * WHAT IS COUNTED, AND WHY EACH ONE IS THE HONEST PROXY:
 *
 *   BORDERS      every `border`, `border-t|b|l|r|x|y`, `border-N` and
 *                `divide-*` utility. Not the colour — a border is a line
 *                whatever colour it is, and recolouring one is not
 *                removing it.
 *   FRAMES       `rounded-*` other than `rounded-full`. A rounded corner
 *                with a background is a card whether or not it has a
 *                border, which is the "λιγότερες κάρτες" half.
 *   CARD PADDING `p-N` only. `px`/`py` are counted separately and are
 *                mostly buttons and rows, not cards, so mixing them into
 *                one average is how a padding number lies.
 *   TYPE         the named sizes. The finding this file exists to keep
 *                visible: the product is written almost entirely at the
 *                two smallest ones.
 *   ACCENT GLOW  any box-shadow whose colour is the accent, in class
 *                strings AND in globals.css. Phase 4 says zero.
 *   GRADIENTS    `bg-clip-text` (a gradient TITLE) and `bg-gradient-*`.
 *
 * WHAT IT CANNOT SEE, said here rather than discovered later: a class
 * computed at runtime (`border-${x}`), a border painted by a CSS rule
 * that no class names, and the difference between a card that is on
 * screen and one that renders only for an error. It is an upper bound on
 * the markup, not a screenshot.
 *
 * Run: node scripts/design-census.mjs [--json]
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { stripComments } from "./check-mutation-markers.mjs";

const SRC = "src";
const GLOBALS = "src/app/globals.css";

/** Every .ts/.tsx under src/, comments removed — prose is not markup. */
export function sourceFiles(root = SRC) {
  const out = [];
  (function walk(d) {
    for (const e of readdirSync(d)) {
      const p = path.join(d, e);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.tsx?$/.test(e)) out.push(p);
    }
  })(root);
  return out.sort();
}

/** The class tokens a file asks for, from className="" and from template literals. */
export function classTokens(src) {
  const text = stripComments(src);
  const chunks = [];
  // THE SPANS ARE RECORDED, AND THAT IS THE WHOLE POINT. The second pass
  // below finds class strings that are not in a className= — a helper
  // const, a cn() argument — and its pattern also matches the string
  // INSIDE a className, so a card counted once by the first pass was
  // counted a second time by this one. Every border in this product read
  // as two. It showed as a 222-border drop for 111 edits, which is the
  // only reason it was caught: the arithmetic did not close.
  const claimed = [];
  for (const m of text.matchAll(/class(?:Name)?\s*=\s*(?:"([^"]*)"|'([^']*)'|\{`([^`]*)`\}|\{"([^"]*)"\})/g)) {
    chunks.push(m[1] ?? m[2] ?? m[3] ?? m[4]);
    claimed.push([m.index, m.index + m[0].length]);
  }
  for (const m of text.matchAll(/["'`]([^"'`\n]*\b(?:border|rounded-|bg-panel|p-\d)[^"'`\n]*)["'`]/g)) {
    const at = m.index;
    if (claimed.some(([a, b]) => at >= a && at < b)) continue;
    chunks.push(m[1]);
  }
  return chunks.join(" ").split(/\s+/).filter(Boolean).map((t) => t.replace(/^[a-z-]+:/, ""));
}

const IS_BORDER = (t) => /^border(-[trblxy])?(-\d)?$/.test(t) && t !== "border-0";
const IS_DIVIDE = (t) => /^divide-[xy](-\d+)?$/.test(t);
// A FRAME IS A CARD, WHEREVER ITS RADIUS IS DECLARED. `.surface` carries
// its own `border-radius` in globals.css, so counting only `rounded-*`
// utilities made every migrated card disappear from this number and the
// census reported "fewer cards" for a change that moved zero cards. The
// class names count as frames because they ARE frames.
const IS_FRAME = (t) => /^rounded(-(sm|md|lg|xl|2xl|3xl))?$/.test(t) || t === "surface" || t === "surface-tight";
const IS_CARD_PAD = (t) => /^p-[0-9.]+$/.test(t);
const TYPE_SIZES = ["text-xs", "text-sm", "text-base", "text-lg", "text-xl", "text-2xl", "text-3xl", "text-4xl", "text-5xl", "text-6xl"];
/** An accent-coloured shadow: the orange/amber rgb triples this product uses. */
const ACCENT_RGB = /rgba?\(\s*(249\s*,\s*115\s*,\s*22|251\s*,\s*146\s*,\s*60|251\s*,\s*191\s*,\s*36|245\s*,\s*158\s*,\s*11|252\s*,\s*211\s*,\s*77)/;
/*
 * A GLOW IS A BLURRED SHADOW. A ring is not.
 *
 * `0 0 0 1px rgba(accent)` paints a one-pixel edge with no bloom — it is
 * a border drawn as a shadow, and the sidebar's active rail and the
 * favourite star both use one. Counting those as glow would make "no
 * glow" mean "no accent edges anywhere", which is a different
 * instruction and one nobody gave. So the third length — the blur — has
 * to be non-zero for it to count.
 *
 * Reads both spellings: CSS `0 0 22px -8px rgba(...)` and Tailwind's
 * arbitrary form `shadow-[0_0_22px_-8px_rgba(...)]`.
 */
function hasBlur(decl) {
  // ANCHORED AT THE START OF EACH SHADOW, because a sliding match reads
  // `0 0 0 8px` — an eight-pixel SPREAD with no blur — as a blur of 8,
  // and reported the success-flash ring as a glow. Each comma-separated
  // shadow is taken on its own and only its THIRD length is the blur.
  // Commas inside rgba() are not shadow separators, so they are masked
  // out before the split.
  const masked = decl.replace(/rgba?\([^)]*\)/g, "C");
  for (const part of masked.split(",")) {
    const lens = part.trim().replace(/^inset[\s_]+/, "").match(/^(-?[\d.]+)(?:px)?[\s_]+(-?[\d.]+)(?:px)?[\s_]+(-?[\d.]+)(?:px)?/);
    if (lens && parseFloat(lens[3]) > 0) return true;
  }
  return false;
}

export function census(root = SRC) {
  const files = sourceFiles(root);
  const counts = {
    borders: 0, divides: 0, frames: 0, cardPads: 0,
    accentShadows: 0, gradientText: 0, gradientBg: 0,
  };
  const byType = Object.fromEntries(TYPE_SIZES.map((t) => [t, 0]));
  const padHistogram = new Map();
  const perFile = new Map();
  for (const f of files) {
    const tokens = classTokens(readFileSync(f, "utf8"));
    let borders = 0;
    for (const t of tokens) {
      if (IS_BORDER(t)) { counts.borders++; borders++; }
      else if (IS_DIVIDE(t)) { counts.divides++; borders++; }
      if (IS_FRAME(t)) counts.frames++;
      if (IS_CARD_PAD(t)) { counts.cardPads++; padHistogram.set(t, (padHistogram.get(t) ?? 0) + 1); }
      if (byType[t] !== undefined) byType[t]++;
      if (t === "bg-clip-text") counts.gradientText++;
      if (/^bg-gradient-to-/.test(t)) counts.gradientBg++;
      if (/^shadow-\[/.test(t) && ACCENT_RGB.test(t) && hasBlur(t.replace(/^shadow-\[/, "").replace(/\]$/, ""))) counts.accentShadows++;
    }
    if (borders) perFile.set(f, borders);
  }
  // globals.css paints too, and a glow moved out of a class into a rule
  // is still a glow.
  // EVERY VALUE OF A VARIABLE, NOT THE LAST ONE. The largest glow in
  // this product was invisible to this scan for exactly as long as it
  // looked only at literal colours: `.cta-amber` — the landing page's
  // main call to action — says `box-shadow: var(--cta-glow-rest)` and
  // the 18px orange bloom lived in the custom property.
  //
  // Substituting the variable was not enough either, and the positive
  // control is what said so. `--cta-glow-rest` is declared TWICE, once
  // per theme; a map keyed by name keeps whichever came last, which is
  // the light theme's neutral shadow, so re-introducing the orange one
  // in dark still reported zero. A themed variable has a SET of values
  // and the question is whether ANY of them glows.
  const css = readFileSync(GLOBALS, "utf8");
  const varValues = new Map();
  for (const m of css.matchAll(/(--[\w-]+):\s*([^;]+);/g)) {
    if (!varValues.has(m[1])) varValues.set(m[1], []);
    varValues.get(m[1]).push(m[2]);
  }
  const glowingVars = new Set();
  for (const [name, values] of varValues) {
    if (values.some((v) => ACCENT_RGB.test(v) && hasBlur(v))) glowingVars.add(name);
  }
  for (const m of css.matchAll(/box-shadow:[^;]+;/g)) {
    const decl = m[0].replace(/^box-shadow:/, "").replace(/;$/, "");
    const usesGlowingVar = [...decl.matchAll(/var\((--[\w-]+)\)/g)].some((v) => glowingVars.has(v[1]));
    if (usesGlowingVar || (ACCENT_RGB.test(decl) && hasBlur(decl))) counts.accentShadows++;
  }
  counts.gradientText += (css.match(/-webkit-background-clip:\s*text|background-clip:\s*text/g) ?? []).length;
  return { files: files.length, counts, byType, padHistogram, perFile };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const r = census();
  const total = Object.values(r.byType).reduce((a, b) => a + b, 0);
  const small = r.byType["text-xs"] + r.byType["text-sm"];
  if (process.argv.includes("--json")) {
    console.log(JSON.stringify({ files: r.files, ...r.counts, byType: r.byType }, null, 2));
  } else {
    console.log(`design census — ${r.files} source files\n`);
    console.log(`  borders          ${r.counts.borders} (+ ${r.counts.divides} divide) = ${r.counts.borders + r.counts.divides}`);
    console.log(`  frames           ${r.counts.frames} rounded corners that are not rounded-full`);
    console.log(`  card padding     ${r.counts.cardPads} p-N classes`);
    for (const [k, v] of [...r.padHistogram].sort((a, b) => b[1] - a[1]).slice(0, 6)) console.log(`     ${k.padEnd(6)} ${v}`);
    console.log(`  accent glow      ${r.counts.accentShadows} BLURRED box-shadows in the accent colour (0-blur rings are edges, not glow)`);
    console.log(`  gradient titles  ${r.counts.gradientText} · gradient backgrounds ${r.counts.gradientBg}`);
    console.log(`\n  type scale       ${total} sized elements, ${small} of them (${Math.round((100 * small) / total)}%) at the two smallest sizes`);
    for (const t of TYPE_SIZES) if (r.byType[t]) console.log(`     ${t.padEnd(10)} ${r.byType[t]}`);
    console.log(`\n  the fifteen densest files:`);
    for (const [f, n] of [...r.perFile].sort((a, b) => b[1] - a[1]).slice(0, 15)) console.log(`     ${String(n).padStart(3)}  ${f}`);
  }
}
