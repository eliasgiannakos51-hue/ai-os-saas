#!/usr/bin/env node
/*
 * THE BORDER FIX, MEASURED ON THE REAL DEPLOYMENT — before and after, in
 * one browser, on the same markup.
 *
 * The fix is not deployed yet, and a local `next start` cannot serve these
 * pages at all: middleware.ts builds a Supabase client and 500s without a
 * real project (verified, not assumed — every route returned 500 with
 * "Your project's URL and Key are required to create a Supabase client").
 * Standing up a fake Supabase so the pages render is exactly the mistake
 * that once let six broken features pass every test, so it is not done
 * here.
 *
 * Instead the experiment isolates the ONE thing that changed. Each page is
 * loaded from the real deployment with its real markup and its real
 * stylesheet, every painted border is measured, and then the deployed
 * stylesheets are replaced with the ones this working tree just built —
 * same DOM, same class names, same browser, different CSS — and every
 * border is measured again.
 *
 * WHAT THIS PROVES AND WHAT IT DOES NOT. It proves the token change moves
 * real pixels on real markup. It does NOT prove what the deployed build
 * will look like, because that build does not exist yet: that check is
 * re-running scripts/prod-light-theme-audit.mjs after the merge.
 *
 * Usage: node scripts/light-border-before-after.mjs [--theme light]
 */
import { chromium } from "playwright";
import { readFileSync, readdirSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const argv = process.argv;
const THEME = argv.includes("--theme") ? argv[argv.indexOf("--theme") + 1] : "light";
const BASE = process.env.PROD_BASE_URL || "https://ai-os-saas-five.vercel.app";
const OUT = path.resolve(`prod-audit/border-${THEME}`);
mkdirSync(OUT, { recursive: true });

const cssDir = ".next/static/css";
const NEW_CSS = readdirSync(cssDir)
  .filter((f) => f.endsWith(".css"))
  .map((f) => readFileSync(path.join(cssDir, f), "utf8"))
  .join("\n");
if (NEW_CSS.length < 10000) {
  console.error(`Only ${NEW_CSS.length} bytes of CSS in ${cssDir} — run \`next build\` first.`);
  process.exit(2);
}

const PAGES = [
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

// Stringified into the page. Measures every painted border side against
// the first ancestor that actually paints a background, compositing every
// translucent layer in between — the same method
// scripts/prod-light-theme-audit.mjs uses.
const MEASURE = () => {
  const lin = (c) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  const lum = (r, g, b) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  const parse = (v) => {
    const m = String(v).match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const p = m[1].split(/[,\s/]+/).filter(Boolean).map(Number);
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  };
  const over = (fg, bg) => ({
    r: fg.r * fg.a + bg.r * (1 - fg.a),
    g: fg.g * fg.a + bg.g * (1 - fg.a),
    b: fg.b * fg.a + bg.b * (1 - fg.a),
    a: 1,
  });
  const ratio = (a, b) => {
    const la = lum(a.r, a.g, a.b),
      lb = lum(b.r, b.g, b.b);
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
  };
  const behind = (el) => {
    let node = el.parentElement;
    let acc = null;
    while (node) {
      const bg = parse(getComputedStyle(node).backgroundColor);
      if (bg && bg.a > 0) {
        acc = acc ? over(acc, bg) : bg;
        if (acc.a >= 0.999) return acc;
      }
      node = node.parentElement;
    }
    return acc || { r: 255, g: 255, b: 255, a: 1 };
  };
  const out = [];
  for (const el of document.querySelectorAll("body *")) {
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden") continue;
    const box = el.getBoundingClientRect();
    if (box.width < 2 || box.height < 2) continue;
    for (const side of ["Top", "Right", "Bottom", "Left"]) {
      const w = parseFloat(cs[`border${side}Width`]);
      if (!w) continue;
      const col = parse(cs[`border${side}Color`]);
      if (!col || col.a === 0) continue;
      const bg = behind(el);
      const cls =
        el.className && el.className.baseVal !== undefined
          ? el.className.baseVal
          : String(el.className || "");
      out.push({
        // FULL class string, not a slice. The first version truncated to
        // 80 characters here and the decorative-edge classifier ran on the
        // truncated value, so `border-emerald-900` — which sits past
        // character 80 on the roadmap status pills — was invisible to it
        // and 36 exempt edges were reported as failures.
        cls,
        side,
        color: cs[`border${side}Color`],
        ratio: Math.round(ratio(over(col, bg), bg) * 100) / 100,
      });
    }
  }
  return out;
};

const proxyServer = process.env.HTTPS_PROXY || process.env.https_proxy || null;
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium",
  // See scripts/unsplash-attribution-proof.mjs for why tls1.2 is pinned:
  // the sandbox's egress proxy resets Chromium's TLS 1.3 handshake.
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--ssl-version-max=tls1.2"],
  ...(proxyServer ? { proxy: { server: proxyServer, bypass: "localhost,127.0.0.1" } } : {}),
});
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 });
await ctx.addInitScript(`try{localStorage.setItem('theme',${JSON.stringify(THEME)})}catch(e){}`);

// THE ONE CLASSIFICATION THIS SCRIPT MAKES, stated so the headline
// number cannot quietly mean something narrower than it says.
//
// `border-orange-900` / `border-emerald-900` are the deep edges of FILLED
// notice and status boxes (`bg-orange-950/20`, `bg-emerald-950/…`). In
// dark they measure 1.9:1 to 2.11:1 and they are not what identifies the
// box or carries its meaning — the fill and the text do, and the text
// measures 4.5:1+. WCAG 1.4.11 is about boundaries REQUIRED to identify a
// component, and exempts pure decoration.
//
// scripts/tests/light-theme-contrast.test.mjs already reaches the same
// conclusion for the same tokens and prints them as NOTE rather than
// FAIL. They are counted and printed separately here rather than dropped,
// so "0 failures" never hides them.
const DECORATIVE_EDGE = /\bborder-(orange|emerald|amber|red)-(800|900)\b/;

let beforeFail = 0;
let afterFail = 0;
let decorativeTotal = 0;
let total = 0;
const worstAfter = [];

for (const [name, route] of PAGES) {
  const page = await ctx.newPage();
  const res = await page.goto(BASE + route, { waitUntil: "networkidle", timeout: 60000 });
  await page.evaluate((t) => document.documentElement.setAttribute("data-theme", t), THEME);
  await page.waitForTimeout(400);

  const before = await page.evaluate(MEASURE);
  await page.screenshot({ path: path.join(OUT, `${name}-before.png`) });

  // Swap the stylesheet. Same DOM, same class names.
  await page.evaluate((css) => {
    for (const link of document.querySelectorAll('link[rel="stylesheet"]')) link.remove();
    for (const style of document.querySelectorAll("style")) style.remove();
    const el = document.createElement("style");
    el.textContent = css;
    document.head.appendChild(el);
  }, NEW_CSS);
  await page.waitForTimeout(400);

  const after = await page.evaluate(MEASURE);
  await page.screenshot({ path: path.join(OUT, `${name}-after.png`) });

  const bf = before.filter((b) => b.ratio < 3).length;
  const stillUnder = after.filter((b) => b.ratio < 3);
  const decorative = stillUnder.filter((b) => DECORATIVE_EDGE.test(b.cls));
  const af = stillUnder.length - decorative.length;
  decorativeTotal += decorative.length;
  beforeFail += bf;
  afterFail += af;
  total += after.length;
  for (const a of stillUnder)
    worstAfter.push({ page: name, decorative: DECORATIVE_EDGE.test(a.cls), ...a, cls: a.cls.slice(0, 120) });
  console.log(
    `${name.padEnd(16)} HTTP=${res.status()}  borders=${String(after.length).padStart(4)}  under 3:1  before=${String(bf).padStart(3)}  after=${String(af).padStart(3)}` +
      (decorative.length ? `  (+${decorative.length} decorative notice edges, exempt)` : "")
  );
  await page.close();
}

await browser.close();
writeFileSync(path.join(OUT, "worst-after.json"), JSON.stringify(worstAfter, null, 2));
console.log(`\n=========== ${THEME} ===========`);
console.log(`border sides measured   : ${total}`);
console.log(`under 3:1 BEFORE the fix: ${beforeFail}`);
console.log(`under 3:1 AFTER  the fix: ${afterFail}`);
console.log(`decorative notice edges  : ${decorativeTotal} (exempt — see DECORATIVE_EDGE above)`);
console.log(`screenshots -> ${OUT}`);
