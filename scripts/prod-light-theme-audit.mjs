#!/usr/bin/env node
/*
 * THE LIGHT THEME, MEASURED IN A REAL BROWSER ON THE REAL DEPLOYMENT.
 *
 * scripts/tests/light-theme-contrast.test.mjs measures the TOKENS in
 * globals.css. That is necessary and it is not sufficient: a token can be
 * correct and still never reach the pixel, because a later rule overrides
 * it, because an alpha modifier composites it away, or because the build
 * that is actually serving is older than the fix. Every failure this file
 * is here to catch is invisible to a source-level check.
 *
 * So this walks the RENDERED DOM of https://ai-os-saas-five.vercel.app
 * with data-theme=light and asks, of every element that actually paints:
 *
 *   1. TEXT CONTRAST. getComputedStyle colour against the first ancestor
 *      that actually paints a background, composited through every
 *      translucent layer in between. WCAG 1.4.3: 4.5:1, or 3:1 for large
 *      text (>=24px, or >=18.66px bold).
 *   2. NON-TEXT CONTRAST. Borders that carry meaning, against what is
 *      behind them. WCAG 1.4.11: 3:1.
 *   3. ORANGE FOG. A box-shadow or filter tuned to glow on #0a0a0a turns
 *      into a smear on #f7f7f8. Detected by parsing the shadow, not by
 *      looking at a screenshot.
 *   4. FOCUS RING. Tab through the real focus order and measure the ring
 *      that is actually painted, against what it is painted on.
 *
 * Usage: node scripts/prod-light-theme-audit.mjs [--theme light|dark] [--out DIR]
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const BASE = process.env.PROD_BASE_URL || "https://ai-os-saas-five.vercel.app";
const argv = process.argv;
const THEME = argv.includes("--theme") ? argv[argv.indexOf("--theme") + 1] : "light";
const OUT = path.resolve(argv.includes("--out") ? argv[argv.indexOf("--out") + 1] : `prod-audit/${THEME}`);
mkdirSync(OUT, { recursive: true });

// Override with AUDIT_PAGES ("name:/route,...") when a target cannot
// serve every page — a local build without a real Supabase project
// cannot render /help or /forgot-password, and an audit that silently
// counts an error page as "no failures" is worse than one that stops.
const PAGES = process.env.AUDIT_PAGES
  ? process.env.AUDIT_PAGES.split(",").map((s) => s.split(":"))
  : [
      ["home", "/"],
      ["pricing", "/pricing"],
      ["login", "/login"],
      ["signup", "/signup"],
      ["help", "/help"],
      ["roadmap", "/roadmap"],
      ["terms", "/terms"],
      ["privacy", "/privacy"],
      ["cookies", "/cookies"],
      ["forgot-password", "/forgot-password"],
    ];

// ---------------------------------------------------------------------
// This function is stringified into the page. It must be self-contained.
// ---------------------------------------------------------------------
const AUDIT = () => {
  // --- WCAG arithmetic, same spec constants as src/lib/contrast.ts ---
  const lin = (c) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  const lum = ({ r, g, b }) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  const ratio = (a, b) => {
    const la = lum(a), lb = lum(b);
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
  };
  const parse = (s) => {
    if (!s) return null;
    const m = s.match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.%]+))?\s*\)/i);
    if (!m) return null;
    let a = m[4] === undefined ? 1 : (m[4].endsWith("%") ? parseFloat(m[4]) / 100 : parseFloat(m[4]));
    return { r: +m[1], g: +m[2], b: +m[3], a };
  };
  // Composite src over dst (both opaque-ish); returns opaque colour.
  const over = (src, dst) => ({
    r: src.r * src.a + dst.r * (1 - src.a),
    g: src.g * src.a + dst.g * (1 - src.a),
    b: src.b * src.a + dst.b * (1 - src.a),
    a: 1,
  });

  // The colour actually behind `el`: walk ancestors compositing every
  // translucent background until an opaque one is reached. A single
  // "first non-transparent ancestor" lookup is wrong whenever anything in
  // between is translucent — which, in a glass-card design, is most things.
  const effectiveBg = (el) => {
    const stack = [];
    let node = el;
    while (node && node.nodeType === 1) {
      const cs = getComputedStyle(node);
      const bg = parse(cs.backgroundColor);
      if (bg && bg.a > 0) {
        stack.push(bg);
        if (bg.a >= 0.999) break;
      }
      node = node.parentElement;
    }
    // Bottom of the stack is the page itself.
    let base = { r: 255, g: 255, b: 255, a: 1 };
    for (let i = stack.length - 1; i >= 0; i--) base = over(stack[i], base);
    return base;
  };

  const visible = (el) => {
    const cs = getComputedStyle(el);
    if (cs.visibility === "hidden" || cs.display === "none") return false;
    if (parseFloat(cs.opacity) < 0.05) return false;
    const r = el.getBoundingClientRect();
    return r.width > 1 && r.height > 1;
  };

  // Text that this element itself paints (not text belonging to children).
  const ownText = (el) => {
    let t = "";
    for (const n of el.childNodes) if (n.nodeType === 3) t += n.nodeValue;
    return t.trim();
  };

  const textFailures = [];
  const borderFailures = [];
  const fog = [];
  const seenText = new Set();

  for (const el of document.querySelectorAll("body *")) {
    if (!visible(el)) continue;
    const cs = getComputedStyle(el);

    // ---- 1. TEXT ----
    const txt = ownText(el);
    if (txt && txt.length > 0) {
      // SVG GLYPHS ARE PAINTED BY `fill`, NOT `color`.
      //
      // Reading `color` for everything is why this audit passed a page
      // whose brand name was invisible: <text fill="#f5f5f5"> inside the
      // logo measured 1.02:1 against a white page, and this loop was
      // asking that element for a `color` it does not use. The bug was
      // found by looking at a screenshot, which is not a method that
      // scales.
      const isSvgText = el.namespaceURI === "http://www.w3.org/2000/svg";
      const inkSource = isSvgText ? cs.fill : cs.color;
      if (isSvgText && (!inkSource || inkSource === "none")) continue;
      const fg = parse(inkSource);
      if (fg && fg.a > 0.05) {
        const bg = effectiveBg(el);
        const fgOpaque = fg.a < 0.999 ? over(fg, bg) : fg;
        // Element opacity multiplies on top of everything.
        const elOpacity = parseFloat(cs.opacity);
        const fgFinal = elOpacity < 0.999 ? over({ ...fgOpaque, a: elOpacity }, bg) : fgOpaque;
        const r = ratio(fgFinal, bg);
        const size = parseFloat(cs.fontSize);
        const weight = parseInt(cs.fontWeight, 10) || 400;
        const large = size >= 24 || (size >= 18.66 && weight >= 700);
        const need = large ? 3 : 4.5;
        if (r < need) {
          const key = `${cs.color}|${Math.round(bg.r)},${Math.round(bg.g)},${Math.round(bg.b)}|${size}|${weight}`;
          if (!seenText.has(key)) {
            seenText.add(key);
            textFailures.push({
              tag: el.tagName.toLowerCase(),
              cls: (el.className && el.className.toString ? el.className.toString() : "").slice(0, 90),
              sample: txt.slice(0, 60),
              color: inkSource,
              paintedBy: isSvgText ? "fill" : "color",
              bg: `rgb(${Math.round(bg.r)}, ${Math.round(bg.g)}, ${Math.round(bg.b)})`,
              fontSize: size, fontWeight: weight, large,
              ratio: +r.toFixed(2), need,
            });
          }
        }
      }
    }

    // ---- 2. BORDERS (WCAG 1.4.11) ----
    for (const side of ["Top", "Right", "Bottom", "Left"]) {
      const w = parseFloat(cs[`border${side}Width`]);
      if (!w || w < 0.5) continue;
      if (cs[`border${side}Style`] === "none") continue;
      const bc = parse(cs[`border${side}Color`]);
      if (!bc || bc.a < 0.05) continue;
      const behind = effectiveBg(el.parentElement || el);
      const bcOpaque = bc.a < 0.999 ? over(bc, behind) : bc;
      const r = ratio(bcOpaque, behind);
      if (r < 3) {
        borderFailures.push({
          tag: el.tagName.toLowerCase(),
          cls: (el.className && el.className.toString ? el.className.toString() : "").slice(0, 90),
          side, width: w,
          color: cs[`border${side}Color`],
          behind: `rgb(${Math.round(behind.r)}, ${Math.round(behind.g)}, ${Math.round(behind.b)})`,
          ratio: +r.toFixed(2),
        });
      }
      break; // one representative side per element is enough
    }

    // ---- 3. ORANGE FOG ----
    // A glow is a shadow with a large blur, no or small offset, and a warm
    // hue. On #0a0a0a that reads as a halo; on #f7f7f8 it is a smear.
    const sh = cs.boxShadow;
    if (sh && sh !== "none") {
      for (const m of sh.matchAll(/rgba?\([^)]*\)[^,]*/g)) {
        const seg = m[0];
        const col = parse(seg);
        if (!col) continue;
        const nums = seg.replace(/rgba?\([^)]*\)/, "").match(/-?[\d.]+px/g) || [];
        const px = nums.map((n) => parseFloat(n));
        const blur = px[2] !== undefined ? px[2] : 0;
        const warm = col.r > 150 && col.r - col.b > 60 && col.g < col.r;
        if (warm && blur >= 12 && col.a > 0.12) {
          fog.push({
            tag: el.tagName.toLowerCase(),
            cls: (el.className && el.className.toString ? el.className.toString() : "").slice(0, 90),
            boxShadow: sh.slice(0, 140), blur, alpha: col.a,
          });
        }
      }
    }
    const flt = cs.filter;
    if (flt && flt !== "none" && /drop-shadow/.test(flt)) {
      const col = parse(flt);
      if (col && col.r > 150 && col.r - col.b > 60 && col.a > 0.12) {
        fog.push({ tag: el.tagName.toLowerCase(), filter: flt.slice(0, 140) });
      }
    }
  }

  return {
    textFailures,
    borderFailures: borderFailures.slice(0, 40),
    fog,
    htmlTheme: document.documentElement.getAttribute("data-theme"),
    bodyBg: getComputedStyle(document.body).backgroundColor,
    elementsScanned: document.querySelectorAll("body *").length,
  };
};

// Focus ring: press Tab through the real order and measure what paints.
const FOCUS = () => {
  const lin = (c) => { const s = c / 255; return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); };
  const lum = ({ r, g, b }) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  const ratio = (a, b) => { const la = lum(a), lb = lum(b); return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05); };
  const parse = (s) => { if (!s) return null; const m = s.match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.%]+))?\s*\)/i); if (!m) return null; let a = m[4] === undefined ? 1 : (m[4].endsWith("%") ? parseFloat(m[4]) / 100 : parseFloat(m[4])); return { r: +m[1], g: +m[2], b: +m[3], a }; };
  const over = (s, d) => ({ r: s.r * s.a + d.r * (1 - s.a), g: s.g * s.a + d.g * (1 - s.a), b: s.b * s.a + d.b * (1 - s.a), a: 1 });
  const effectiveBg = (el) => {
    const stack = []; let node = el;
    while (node && node.nodeType === 1) {
      const bg = parse(getComputedStyle(node).backgroundColor);
      if (bg && bg.a > 0) { stack.push(bg); if (bg.a >= 0.999) break; }
      node = node.parentElement;
    }
    let base = { r: 255, g: 255, b: 255, a: 1 };
    for (let i = stack.length - 1; i >= 0; i--) base = over(stack[i], base);
    return base;
  };
  const el = document.activeElement;
  if (!el || el === document.body) return null;
  const cs = getComputedStyle(el);
  const behind = effectiveBg(el.parentElement || el);
  const out = {
    tag: el.tagName.toLowerCase(),
    label: (el.textContent || el.getAttribute("aria-label") || "").trim().slice(0, 40),
    outlineStyle: cs.outlineStyle,
    outlineWidth: cs.outlineWidth,
    outlineColor: cs.outlineColor,
    outlineOffset: cs.outlineOffset,
    boxShadow: (cs.boxShadow || "none").slice(0, 120),
    behind: `rgb(${Math.round(behind.r)}, ${Math.round(behind.g)}, ${Math.round(behind.b)})`,
  };
  // Ratio of whichever indicator is actually painted.
  const w = parseFloat(cs.outlineWidth);
  if (cs.outlineStyle !== "none" && w > 0) {
    const oc = parse(cs.outlineColor);
    if (oc) { const c = oc.a < 0.999 ? over(oc, behind) : oc; out.ringRatio = +ratio(c, behind).toFixed(2); out.source = "outline"; }
  } else if (cs.boxShadow && cs.boxShadow !== "none") {
    const oc = parse(cs.boxShadow);
    if (oc) { const c = oc.a < 0.999 ? over(oc, behind) : oc; out.ringRatio = +ratio(c, behind).toFixed(2); out.source = "box-shadow"; }
  } else {
    out.source = "NONE"; out.ringRatio = 0;
  }
  return out;
};

// ---------------------------------------------------------------------
// EGRESS. This container reaches the internet through a CA-terminating
// proxy. Two accommodations are needed and neither weakens verification:
//
//   proxy:               without it CONNECT never happens.
//   --ssl-version-max:   the proxy resets Chromium's TLS 1.3 handshakes.
//                        Measured, not guessed: with TLS 1.3 every
//                        navigation dies on ERR_CONNECTION_RESET while a
//                        policy-blocked host gives ERR_TUNNEL_CONNECTION_
//                        FAILED instead, so the tunnel was opening and the
//                        handshake inside it was being torn down. Capping
//                        at 1.2 returns HTTP 200.
//
// ignoreHTTPSErrors is deliberately NOT set: certificate verification
// stays on, so a MITM that is not the expected proxy still fails.
const proxyServer = process.env.HTTPS_PROXY || process.env.https_proxy || null;
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium",
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--ssl-version-max=tls1.2"],
  // localhost must never go through the egress proxy — bypass it so the
  // same instrument can be pointed at a local production build.
  ...(proxyServer ? { proxy: { server: proxyServer, bypass: "localhost,127.0.0.1" } } : {}),
});
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 });
await ctx.addInitScript(`try { localStorage.setItem('theme', ${JSON.stringify(THEME)}); } catch (e) {}`);
const page = await ctx.newPage();

const report = { base: BASE, theme: THEME, pages: [] };

for (const [name, route] of PAGES) {
  const url = BASE + route;
  let entry = { name, route, url };
  try {
    const res = await page.goto(url, { waitUntil: "networkidle", timeout: 45000 });
    entry.status = res ? res.status() : null;
    await page.waitForTimeout(700);
    const audit = await page.evaluate(AUDIT);
    entry = { ...entry, ...audit };
    await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: true });

    // Focus ring: first 6 tab stops.
    const rings = [];
    await page.evaluate(() => { document.body.focus(); });
    for (let i = 0; i < 6; i++) {
      await page.keyboard.press("Tab");
      // WAIT FOR THE TRANSITION BEFORE READING THE RING.
      // Several controls carry `transition-all duration-200`, which
      // animates outline-width along with everything else. Reading
      // immediately after Tab caught one mid-transition and reported
      // `outline: solid 0px` — a focus ring that does not exist. It does;
      // it had not finished arriving. 260ms clears the longest of them.
      await page.waitForTimeout(260);
      const r = await page.evaluate(FOCUS);
      if (r) rings.push(r);
    }
    entry.focusRings = rings;
    await page.screenshot({ path: path.join(OUT, `${name}--focus.png`) });
  } catch (e) {
    entry.error = String(e).slice(0, 200);
  }
  report.pages.push(entry);
  const tf = entry.textFailures ? entry.textFailures.length : "ERR";
  const bf = entry.borderFailures ? entry.borderFailures.length : "ERR";
  const fg = entry.fog ? entry.fog.length : "ERR";
  console.log(
    `${String(name).padEnd(16)} HTTP=${entry.status}  theme=${entry.htmlTheme}  bodyBg=${entry.bodyBg}  ` +
    `scanned=${entry.elementsScanned}  textFail=${tf}  borderFail=${bf}  fog=${fg}`
  );
}

writeFileSync(path.join(OUT, "report.json"), JSON.stringify(report, null, 2));
await browser.close();

// ---- summary ----
const allText = report.pages.flatMap((p) => p.textFailures || []);
const allBorder = report.pages.flatMap((p) => p.borderFailures || []);
const allFog = report.pages.flatMap((p) => p.fog || []);
const allRings = report.pages.flatMap((p) => p.focusRings || []);
console.log("\n================ SUMMARY (" + THEME + ") ================");
console.log(`pages audited        : ${report.pages.length}`);
console.log(`elements scanned     : ${report.pages.reduce((a, p) => a + (p.elementsScanned || 0), 0)}`);
console.log(`TEXT contrast fails  : ${allText.length}`);
console.log(`BORDER contrast fails: ${allBorder.length}`);
console.log(`ORANGE FOG instances : ${allFog.length}`);
const noRing = allRings.filter((r) => !r.ringRatio || r.ringRatio < 3);
console.log(`focus stops sampled  : ${allRings.length}  (below 3:1 or absent: ${noRing.length})`);
if (allText.length) {
  console.log("\n--- worst text failures ---");
  for (const f of allText.sort((a, b) => a.ratio - b.ratio).slice(0, 15)) {
    console.log(`  ${f.ratio}:1 (need ${f.need})  ${f.color} on ${f.bg}  ${f.fontSize}px/${f.fontWeight}  <${f.tag}> "${f.sample}"`);
  }
}
if (allFog.length) {
  console.log("\n--- orange fog ---");
  for (const f of allFog.slice(0, 10)) console.log(`  <${f.tag}> ${f.boxShadow || f.filter}`);
}
if (noRing.length) {
  console.log("\n--- focus stops without an adequate ring ---");
  for (const r of noRing.slice(0, 10)) console.log(`  <${r.tag}> "${r.label}" source=${r.source} ratio=${r.ringRatio} outline=${r.outlineStyle} ${r.outlineWidth} ${r.outlineColor}`);
}
console.log(`\nscreenshots + report.json -> ${OUT}`);

// A run that navigated nowhere reports zero failures, which reads exactly
// like a clean pass. Refuse to let it.
const broken = report.pages.filter((p) => p.error || p.status !== 200 || !p.elementsScanned);
if (broken.length) {
  console.log("\nAUDIT INVALID — these pages produced no measurement:");
  for (const p of broken) console.log(`  ${p.name}: status=${p.status} error=${p.error || "(none)"} scanned=${p.elementsScanned}`);
  process.exit(1);
}
const wrongTheme = report.pages.filter((p) => p.htmlTheme !== THEME);
if (wrongTheme.length) {
  console.log(`\nAUDIT INVALID — ${wrongTheme.length} page(s) did not render in data-theme="${THEME}":`);
  for (const p of wrongTheme) console.log(`  ${p.name}: data-theme=${p.htmlTheme}`);
  process.exit(1);
}
process.exit(allText.length || allFog.length ? 1 : 0);
