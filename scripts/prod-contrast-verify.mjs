#!/usr/bin/env node
/*
 * STAGE 2: VERIFY EVERY CANDIDATE FAILURE AGAINST REAL PIXELS.
 *
 * prod-light-theme-audit.mjs finds candidates by walking computed styles.
 * That walk composites `background-color` up the ancestor chain, and it is
 * BLIND TO ANYTHING PAINTED ANOTHER WAY — gradients, background-image,
 * SVG, canvas. The dark-theme control run proved the consequence: it
 * reported `rgb(0,0,0)` on `rgb(10,10,10)` at 1.06:1 for the Sign Up
 * button, which is black text on a `bg-gradient-to-r from-orange-500`
 * fill. The gradient has background-color: transparent, so the walk fell
 * through it to the page and invented a failure that is not there.
 *
 * Reporting that number would be reporting a number that is not true. So
 * every candidate is re-measured here against what the browser actually
 * painted:
 *
 *   1. Screenshot the element's box as shipped.
 *   2. Force ONLY that element's glyphs to transparent and screenshot the
 *      same box again. Whatever remains IS the true background, gradients
 *      and images and backdrop haze included.
 *   3. Composite the element's real `color` (alpha and inherited opacity
 *      applied) over the median background pixel, and take the ratio.
 *
 * A candidate survives only if the pixel measurement agrees. Anything the
 * pixels clear is dropped, with a reason.
 *
 * Usage: node scripts/prod-contrast-verify.mjs --theme light
 */
import { chromium } from "playwright";
import sharp from "sharp";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const argv = process.argv;
const THEME = argv.includes("--theme") ? argv[argv.indexOf("--theme") + 1] : "light";
const BASE = process.env.PROD_BASE_URL || "https://ai-os-saas-five.vercel.app";
const DIR = path.resolve(`prod-audit/${THEME}`);
const report = JSON.parse(readFileSync(path.join(DIR, "report.json"), "utf8"));

const lin = (c) => { const s = c / 255; return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); };
const lum = (r, g, b) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
const ratio = (a, b) => { const la = lum(...a), lb = lum(...b); return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05); };

// Re-find candidates in the live page and hand back a stable index, so
// stage 2 measures the same elements stage 1 flagged.
const FIND = (samples) => {
  const out = [];
  const els = Array.from(document.querySelectorAll("body *"));
  for (const s of samples) {
    const hit = els.find((el) => {
      let own = "";
      for (const n of el.childNodes) if (n.nodeType === 3) own += n.nodeValue;
      if (own.trim().slice(0, 60) !== s.sample) return false;
      const cs = getComputedStyle(el);
      return cs.color === s.color && Math.abs(parseFloat(cs.fontSize) - s.fontSize) < 0.6;
    });
    if (!hit) { out.push(null); continue; }
    const r = hit.getBoundingClientRect();
    const cs = getComputedStyle(hit);
    // Inherited opacity multiplies down the tree; the element's own
    // computed opacity does not include its ancestors'.
    let eff = 1, n = hit;
    while (n && n.nodeType === 1) { eff *= parseFloat(getComputedStyle(n).opacity); n = n.parentElement; }
    hit.setAttribute("data-verify-target", String(out.length));
    out.push({
      x: r.x + window.scrollX, y: r.y + window.scrollY, w: r.width, h: r.height,
      color: cs.color, fontSize: parseFloat(cs.fontSize), fontWeight: parseInt(cs.fontWeight, 10) || 400,
      effectiveOpacity: +eff.toFixed(4),
    });
  }
  return out;
};

const proxyServer = process.env.HTTPS_PROXY || process.env.https_proxy || null;
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium",
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--ssl-version-max=tls1.2"],
  ...(proxyServer ? { proxy: { server: proxyServer } } : {}),
});
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 });
await ctx.addInitScript(`try{localStorage.setItem('theme',${JSON.stringify(THEME)})}catch(e){}`);
const page = await ctx.newPage();

const parse = (s) => { const m = s.match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.%]+))?\s*\)/i); if (!m) return null; const a = m[4] === undefined ? 1 : (m[4].endsWith("%") ? parseFloat(m[4]) / 100 : parseFloat(m[4])); return { r: +m[1], g: +m[2], b: +m[3], a }; };

const verified = [], dropped = [];
for (const p of report.pages) {
  const cands = p.textFailures || [];
  if (!cands.length) continue;
  await page.goto(p.url, { waitUntil: "networkidle", timeout: 45000 });
  await page.addStyleTag({ content: `*,*::before,*::after{animation:none!important;transition:none!important}` });
  await page.waitForTimeout(500);
  const boxes = await page.evaluate(FIND, cands);

  for (let i = 0; i < cands.length; i++) {
    const c = cands[i], b = boxes[i];
    if (!b) { dropped.push({ ...c, page: p.name, reason: "element not re-found on live page" }); continue; }
    if (b.w < 1 || b.h < 1) { dropped.push({ ...c, page: p.name, reason: "zero-area box" }); continue; }
    const clip = { x: Math.max(0, b.x), y: Math.max(0, b.y), width: Math.max(1, Math.min(b.w, 1280)), height: Math.max(1, b.h) };

    // Hide ONLY this element's glyphs. `color: transparent` leaves every
    // background, border and sibling exactly where it was, so the second
    // shot differs from the first in the ink alone.
    await page.addStyleTag({ content: `[data-verify-target="${i}"]{color:transparent!important;-webkit-text-fill-color:transparent!important}` });
    await page.waitForTimeout(60);
    let bg;
    try { bg = await page.screenshot({ clip, fullPage: true }); }
    catch { dropped.push({ ...c, page: p.name, reason: "box outside document" }); continue; }
    // Undo, so the next candidate on this page is measured normally.
    await page.addStyleTag({ content: `[data-verify-target="${i}"]{color:revert!important;-webkit-text-fill-color:revert!important}` });

    const { data, info } = await sharp(bg).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const n = info.width * info.height;
    // Median per channel: robust against a border or an icon inside the box.
    const R = [], G = [], B = [];
    for (let k = 0; k < n; k++) { R.push(data[k * info.channels]); G.push(data[k * info.channels + 1]); B.push(data[k * info.channels + 2]); }
    const med = (a) => { a.sort((x, y) => x - y); return a[Math.floor(a.length / 2)]; };
    const bgPx = [med(R), med(G), med(B)];

    const fg = parse(b.color);
    const aTotal = fg.a * b.effectiveOpacity;
    const ink = [
      fg.r * aTotal + bgPx[0] * (1 - aTotal),
      fg.g * aTotal + bgPx[1] * (1 - aTotal),
      fg.b * aTotal + bgPx[2] * (1 - aTotal),
    ];
    const measured = +ratio(ink, bgPx).toFixed(2);
    const large = b.fontSize >= 24 || (b.fontSize >= 18.66 && b.fontWeight >= 700);
    const need = large ? 3 : 4.5;
    const row = {
      page: p.name, sample: c.sample, color: b.color, fontSize: b.fontSize, fontWeight: b.fontWeight,
      effectiveOpacity: b.effectiveOpacity,
      cssGuess: c.ratio, cssBg: c.bg,
      pixelBg: `rgb(${bgPx.join(", ")})`, pixelRatio: measured, need,
    };
    if (measured < need) verified.push(row);
    else dropped.push({ ...row, reason: `pixels clear it: ${measured}:1 >= ${need}` });
  }
}
await browser.close();

writeFileSync(path.join(DIR, "verified-contrast.json"), JSON.stringify({ verified, dropped }, null, 2));
console.log(`=========== PIXEL-VERIFIED TEXT CONTRAST (${THEME}) ===========`);
console.log(`candidates from stage 1 : ${report.pages.reduce((a, p) => a + (p.textFailures || []).length, 0)}`);
console.log(`CONFIRMED failures      : ${verified.length}`);
console.log(`dropped as false        : ${dropped.length}`);
if (verified.length) {
  console.log("\n--- confirmed ---");
  for (const v of verified.sort((a, b) => a.pixelRatio - b.pixelRatio))
    console.log(`  ${String(v.pixelRatio).padStart(5)}:1 (need ${v.need})  ${v.color} on ${v.pixelBg}  ${v.fontSize}px/${v.fontWeight}  [${v.page}] "${v.sample}"`);
}
if (dropped.length) {
  console.log("\n--- dropped (CSS walk was wrong) ---");
  for (const d of dropped)
    console.log(`  css said ${d.cssGuess}:1 on ${d.cssBg} -> pixels say ${d.pixelRatio || "n/a"}:1 on ${d.pixelBg || "n/a"}  [${d.page}] "${d.sample}"  (${d.reason})`);
}
