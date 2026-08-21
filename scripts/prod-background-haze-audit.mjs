#!/usr/bin/env node
/*
 * HOW MUCH DOES THE BACKDROP TINT THE PAGE, AND IS IT WORSE IN LIGHT?
 *
 * "There is an orange fog in the light theme" is a claim about pixels, so
 * this measures pixels, on the real deployment.
 *
 * THE METHOD IS A DIFFERENCE, NOT A THRESHOLD. Screenshot each page
 * twice — once as shipped, once with the three backdrop layers
 * (AuthBackground globe + dots, NetworkField, .ambient-corners) hidden —
 * and subtract. Whatever changed IS the backdrop's contribution, exactly.
 * No rule is needed for "which pixels count as background", and legitimate
 * orange UI (the Sign Up button, accent text) cancels out because it is
 * identical in both shots.
 *
 * Reported per page:
 *   meanDelta   average per-channel change across the viewport
 *   maxDelta    the single most-changed pixel. READ THIS ONE WITH CARE:
 *               it is dominated by subpixel text antialiasing, not by
 *               tint. Glyph edges resolve differently against a different
 *               background, so a headline's LCD fringes swing ~64/255
 *               whatever the backdrop's opacity is — verified by cropping
 *               the max pixel and looking at it. It stays constant across
 *               a change that cuts the haze by 76%, and the pixels near it
 *               number in the dozens (0.006% of the viewport). The AREA
 *               metrics below are the haze; this one is a curiosity.
 *   pctOverJND  share of the viewport shifted by more than 2/255, which
 *               is roughly where a flat tint over a large area becomes
 *               visible on an sRGB display
 *   warmBias    mean (Δr − Δb). Positive = the backdrop pushes the page
 *               orange. This is the number that distinguishes "a tint" from
 *               "an ORANGE tint".
 *
 * Light and dark are both measured, because the point is the asymmetry:
 * the same layer at the same opacity is ambient texture on #0a0a0a and
 * haze on #f7f7f8.
 *
 * Usage: node scripts/prod-background-haze-audit.mjs [--out DIR]
 */
import { chromium } from "playwright";
import sharp from "sharp";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const BASE = process.env.PROD_BASE_URL || "https://ai-os-saas-five.vercel.app";
const argv = process.argv;
const OUT = path.resolve(argv.includes("--out") ? argv[argv.indexOf("--out") + 1] : "prod-audit/haze");
mkdirSync(OUT, { recursive: true });

const PAGES = (process.env.HAZE_PAGES || "home:/,pricing:/pricing,login:/login,signup:/signup,help:/help,roadmap:/roadmap")
  .split(",").map((s) => s.split(":"));

// The three backdrop layers, by what they actually are in the DOM.
// AuthBackground and NetworkField are both `fixed inset-0 z-0` wrappers;
// .ambient-corners is its own class. Hiding by structure rather than by a
// test id keeps this honest — if the markup changes, the count below
// changes with it and the run reports that instead of silently measuring
// nothing.
// GlowOrb is in this list because it was NOT, and that omission is why
// this file reported the light theme as 76% improved while a peach cloud
// was still sitting at the top of the landing page: the orb is
// `absolute`, not `fixed inset-0`, so neither selector below matched it,
// and a layer this measurement never hides is a layer it never measures.
const HIDE = `
  .ambient-corners { display: none !important; }
  [aria-hidden="true"].pointer-events-none.fixed.inset-0.z-0 { display: none !important; }
  [aria-hidden="true"].pointer-events-none.absolute.rounded-full { display: none !important; }
`;

const COUNT_LAYERS = () =>
  document.querySelectorAll(
    '.ambient-corners, [aria-hidden="true"].pointer-events-none.fixed.inset-0.z-0, [aria-hidden="true"].pointer-events-none.absolute.rounded-full'
  ).length;

const proxyServer = process.env.HTTPS_PROXY || process.env.https_proxy || null;
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium",
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--ssl-version-max=tls1.2"],
  ...(proxyServer ? { proxy: { server: proxyServer, bypass: "localhost,127.0.0.1" } } : {}),
});

async function shoot(page, url, theme, hide) {
  await page.goto(url, { waitUntil: "networkidle", timeout: 45000 });
  // Freeze the spinning globe and the pulsing dots: an animated backdrop
  // photographed at two different moments would differ for reasons that
  // have nothing to do with the tint being measured.
  await page.addStyleTag({ content: `*,*::before,*::after{animation:none!important;transition:none!important}` });
  const layers = await page.evaluate(COUNT_LAYERS);
  if (hide) await page.addStyleTag({ content: HIDE });
  await page.waitForTimeout(400);
  const buf = await page.screenshot({ fullPage: false });
  return { buf, layers, theme: await page.evaluate(() => document.documentElement.getAttribute("data-theme")) };
}

const results = [];
for (const theme of ["light", "dark"]) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 });
  await ctx.addInitScript(`try{localStorage.setItem('theme',${JSON.stringify(theme)})}catch(e){}`);
  const page = await ctx.newPage();
  for (const [name, route] of PAGES) {
    const url = BASE + route;
    const withBg = await shoot(page, url, theme, false);
    const noBg = await shoot(page, url, theme, true);

    const a = await sharp(withBg.buf).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const b = await sharp(noBg.buf).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    if (a.data.length !== b.data.length) throw new Error(`size mismatch on ${name}/${theme}`);

    const ch = a.info.channels;
    const px = a.info.width * a.info.height;
    let sumAbs = 0, max = 0, overJnd = 0, sumWarm = 0;
    for (let i = 0; i < px; i++) {
      const o = i * ch;
      const dr = a.data[o] - b.data[o];
      const dg = a.data[o + 1] - b.data[o + 1];
      const db = a.data[o + 2] - b.data[o + 2];
      const m = (Math.abs(dr) + Math.abs(dg) + Math.abs(db)) / 3;
      sumAbs += m;
      sumWarm += dr - db;
      if (m > max) max = m;
      if (m > 2) overJnd++;
    }
    const row = {
      page: name, theme, layersFound: withBg.layers, htmlTheme: withBg.theme,
      meanDelta: +(sumAbs / px).toFixed(3),
      maxDelta: +max.toFixed(1),
      pctOverJND: +((overJnd / px) * 100).toFixed(1),
      warmBias: +(sumWarm / px).toFixed(3),
    };
    results.push(row);
    writeFileSync(path.join(OUT, `${theme}-${name}-with-backdrop.png`), withBg.buf);
    writeFileSync(path.join(OUT, `${theme}-${name}-no-backdrop.png`), noBg.buf);
    console.log(
      `${theme.padEnd(5)} ${name.padEnd(9)} layers=${row.layersFound} theme=${row.htmlTheme}  ` +
      `mean=${String(row.meanDelta).padStart(6)}  max=${String(row.maxDelta).padStart(5)}  ` +
      `overJND=${String(row.pctOverJND).padStart(5)}%  warmBias=${String(row.warmBias).padStart(7)}`
    );
  }
  await ctx.close();
}
await browser.close();
writeFileSync(path.join(OUT, "haze.json"), JSON.stringify(results, null, 2));

const avg = (t, k) => {
  const rows = results.filter((r) => r.theme === t);
  return +(rows.reduce((s, r) => s + r[k], 0) / rows.length).toFixed(3);
};
console.log("\n=================== BACKDROP HAZE ===================");
console.log("theme   meanDelta   pctOverJND   warmBias");
for (const t of ["light", "dark"]) {
  console.log(`${t.padEnd(7)} ${String(avg(t, "meanDelta")).padStart(9)} ${String(avg(t, "pctOverJND")).padStart(11)}% ${String(avg(t, "warmBias")).padStart(10)}`);
}
console.log(`\nlight/dark haze ratio : ${(avg("light", "pctOverJND") / Math.max(avg("dark", "pctOverJND"), 0.001)).toFixed(2)}x`);
console.log(`light/dark warm ratio : ${(avg("light", "warmBias") / Math.max(avg("dark", "warmBias"), 0.001)).toFixed(2)}x`);
console.log(`\nartifacts -> ${OUT}`);

// A run where the hide rule matched nothing would report a haze of zero,
// which reads exactly like a clean page.
const noLayers = results.filter((r) => !r.layersFound);
if (noLayers.length) {
  console.log("\nMEASUREMENT INVALID — backdrop layers not found on: " + noLayers.map((r) => `${r.theme}/${r.page}`).join(", "));
  process.exit(1);
}
