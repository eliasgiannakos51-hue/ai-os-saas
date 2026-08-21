#!/usr/bin/env node
/*
 * EVERY COLOUR THE APP ACTUALLY USES, MEASURED ON WHITE.
 *
 * Not a sample and not the palette: the cross-product of every colour
 * utility that appears in src/, every alpha modifier it is written with,
 * and every light-theme surface it can land on.
 *
 * Why the cross-product and not the palette: `text-orange-400` and
 * `text-orange-400/70` are different colours, and the same colour clears
 * 4.5:1 on #ffffff while failing on #f2f2f4. Checking the palette answers
 * neither question. There are enough combinations that spot-checking is
 * how the 2.62:1 border survived the last review.
 *
 * ROLE DECIDES THE THRESHOLD, and role is read from the utility prefix:
 *   text-*            WCAG 1.4.3   4.5:1  (3:1 only if large, flagged)
 *   border-* ring-*   WCAG 1.4.11  3:1
 *   bg-*              not a text rule. A fill is measured against the
 *                     surface behind it, because a card that cannot be
 *                     told apart from the page is the actual complaint.
 *
 * THEMED CLASSES RESOLVE THROUGH THE THEME, not the Tailwind palette:
 * tailwind.config.ts remaps textColor orange 200-500 / amber 200-400 and
 * borderColor orange/amber 500 onto CSS variables, so in light those class
 * names mean orange-700/800, not orange-200/400. Reading the palette here
 * would report failures that were already fixed and miss the ones that
 * were not.
 *
 * Run: node scripts/light-colour-inventory.mjs [--json out.json]
 */
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { loadTs } from "./tests/load-ts.mjs";

const require = createRequire(import.meta.url);
const palette = require("tailwindcss/colors.js");
const c = await loadTs("src/lib/contrast.ts");

// --- the light theme's real surfaces, read from globals.css ---
const cssRaw = readFileSync("src/app/globals.css", "utf8");
// STRIP COMMENTS FIRST. The phrase [data-theme="light"] appears in a
// comment above :root, so a plain indexOf lands before the dark block and
// every "light" value read after it is the dark one. That is not a
// hypothetical: this file measured the whole palette against #0a0a0a and
// reported it as light until the assertion below was added.
const css = cssRaw.replace(/\/\*[\s\S]*?\*\//g, "");
const open = css.search(/\[data-theme="light"\]\s*\{/);
if (open < 0) throw new Error('no [data-theme="light"] rule in globals.css');
const lightBlock = css.slice(open, css.indexOf("}", open));
const readVar = (name) => {
  const m = lightBlock.match(new RegExp(`--${name}:\\s*([^;]+);`));
  if (!m) throw new Error(`--${name} not found in the [data-theme="light"] block`);
  return m[1].trim();
};
const SURFACES = {
  page: readVar("background"),
  panel: readVar("panel"),
  "panel-hover": readVar("panel-hover"),
};
// A light theme whose surfaces are dark means the block was read from the
// wrong place. Refuse to report a palette measured against the wrong
// background as if it were the light theme.
for (const [name, value] of Object.entries(SURFACES)) {
  if (c.relativeLuminance(value) < 0.5) {
    throw new Error(`light surface "${name}" resolved to ${value}, which is dark — the [data-theme="light"] block was not read correctly`);
  }
}
// THE THEMED MAP IS READ FROM tailwind.config.ts, not restated here.
// A second copy of this mapping is a copy that goes stale: it did, once —
// four families were added to the config and this file kept reporting them
// as unthemed because its hardcoded table had not been updated with them.
// Parse the `role: { family: { shade: "rgb(var(--x) / <alpha-value>)" } }`
// blocks and resolve each --x against the light block above.
const cfg = readFileSync("tailwind.config.ts", "utf8").replace(/\/\/[^\n]*/g, "");
function themedMap(roleKey) {
  const at = cfg.indexOf(`${roleKey}: {`);
  if (at < 0) return {};
  // Walk braces to find the end of this role's object.
  let depth = 0, end = at;
  for (let i = cfg.indexOf("{", at); i < cfg.length; i++) {
    if (cfg[i] === "{") depth++;
    else if (cfg[i] === "}") { depth--; if (depth === 0) { end = i; break; } }
  }
  const body = cfg.slice(at, end);
  const out = {};
  let family = null;
  for (const line of body.split("\n")) {
    const fam = line.match(/^\s*([a-z]+):\s*\{/);
    if (fam && fam[1] !== roleKey) family = fam[1];
    for (const m of line.matchAll(/(\d{2,3}):\s*"rgb\(var\(--([a-z-]+)\)\s*\/\s*<alpha-value>\)"/g)) {
      if (family) out[`${family}-${m[1]}`] = readVar(m[2]);
    }
  }
  return out;
}
const THEMED_TEXT = themedMap("textColor");
const THEMED_BORDER = themedMap("borderColor");
const THEMED_BG = themedMap("backgroundColor");
if (!Object.keys(THEMED_TEXT).length) throw new Error("parsed no themed textColor entries from tailwind.config.ts");

const toRgb = (v) => {
  if (/^#|^rgb/.test(v)) return c.parseColor(v.replace(/^rgb\(|\)$/g, "").trim());
  return c.parseColor(v);
};
const over = (f, a, b) => ({ r: f.r * a + b.r * (1 - a), g: f.g * a + b.g * (1 - a), b: f.b * a + b.b * (1 - a) });

// --- scan every source file ---
function walk(dir, out = []) {
  for (const e of readdirSync(dir)) {
    const p = path.join(dir, e);
    const s = statSync(p);
    if (s.isDirectory()) walk(p, out);
    else if (/\.(tsx?|jsx?)$/.test(p)) out.push(p);
  }
  return out;
}
const FILES = walk("src");
const RE = /\b(text|bg|border|ring|divide|decoration|outline)-([a-z]+)-(\d{2,3})(?:\/(\d{1,3}))?\b/g;

const uses = new Map(); // key -> {role, colour, shade, alpha, count, files:Set}
for (const f of FILES) {
  const src = readFileSync(f, "utf8");
  for (const m of src.matchAll(RE)) {
    const [full, role, colour, shade, alpha] = m;
    if (!palette[colour] || !palette[colour][shade]) {
      // background/panel/border/foreground/muted are theme tokens, not palette entries.
      if (!["orange", "amber", "emerald", "green", "red", "rose", "blue", "sky", "purple", "violet", "yellow", "zinc", "neutral", "gray", "slate", "stone", "cyan", "teal", "indigo", "fuchsia", "pink", "lime"].includes(colour)) continue;
    }
    const key = full;
    if (!uses.has(key)) uses.set(key, { role, colour, shade, alpha: alpha ? +alpha / 100 : 1, count: 0, files: new Set() });
    const u = uses.get(key);
    u.count++; u.files.add(f);
  }
}

const rows = [];
for (const [cls, u] of uses) {
  const k = `${u.colour}-${u.shade}`;
  // `ring-` and `divide-` resolve from Tailwind's own colour scale, not
  // from borderColor — they are listed with borders here only because
  // they carry the same 3:1 requirement. Treating them as themed when
  // they are not would hide real failures.
  const themed =
    u.role === "text" ? THEMED_TEXT[k] || null :
    (u.role === "border" || u.role === "divide") ? THEMED_BORDER[k] || null :
    u.role === "bg" ? THEMED_BG[k] || null :
    null;
  const raw = themed || (palette[u.colour] && palette[u.colour][u.shade]);
  if (!raw) continue;
  let base;
  try { base = toRgb(raw); } catch { continue; }

  const need = u.role === "text" ? c.WCAG_TEXT_MIN : (u.role === "bg" ? null : c.WCAG_UI_MIN);
  for (const [sname, sval] of Object.entries(SURFACES)) {
    const surf = c.parseColor(sval);
    const ink = u.alpha < 1 ? over(base, u.alpha, surf) : base;
    const ratio = +c.contrastRatio(ink, surf).toFixed(2);
    rows.push({
      cls, role: u.role, colour: `${u.colour}-${u.shade}`, alpha: u.alpha,
      themed: Boolean(themed), resolved: raw, surface: sname, surfaceValue: sval,
      ratio, need, count: u.count, files: u.files.size,
      // A fill has no WCAG text threshold; what matters is whether the
      // surface is distinguishable at all. 1.2:1 is where a large flat
      // area stops being visible as a separate surface on an sRGB display.
      verdict: need === null ? (ratio < 1.2 ? "INVISIBLE FILL" : "ok") : (ratio < need ? "FAIL" : "ok"),
    });
  }
}

// Worst surface per class is what decides it.
const byClass = new Map();
for (const r of rows) {
  const cur = byClass.get(r.cls);
  if (!cur || r.ratio < cur.ratio) byClass.set(r.cls, r);
}
const worst = [...byClass.values()];
const fails = worst.filter((r) => r.verdict !== "ok").sort((a, b) => a.ratio - b.ratio);

if (process.argv.includes("--json")) {
  writeFileSync(process.argv[process.argv.indexOf("--json") + 1], JSON.stringify({ rows, worst }, null, 2));
}

console.log(`light surfaces: ${Object.entries(SURFACES).map(([k, v]) => `${k}=${v}`).join("  ")}`);
console.log(`distinct colour utilities in src/: ${byClass.size}   (measurements: ${rows.length})`);
console.log(`FAILING on at least one light surface: ${fails.length}\n`);
console.log("class                          role    resolved(light)      surface       ratio  need  usages  themed");
console.log("-".repeat(108));
for (const r of fails) {
  console.log(
    `${r.cls.padEnd(30)} ${r.role.padEnd(7)} ${String(r.resolved).padEnd(20)} ${r.surface.padEnd(13)} ` +
    `${String(r.ratio).padStart(5)} ${String(r.need ?? "—").padStart(5)}  ${String(r.count).padStart(5)}   ${r.themed ? "yes" : "NO"}`
  );
}
const byFamily = {};
for (const r of fails) { const fam = r.colour.split("-")[0]; byFamily[fam] = (byFamily[fam] || 0) + r.count; }
console.log("\nfailing usages by colour family:");
for (const [k, v] of Object.entries(byFamily).sort((a, b) => b[1] - a[1])) console.log(`  ${k.padEnd(10)} ${v}`);
