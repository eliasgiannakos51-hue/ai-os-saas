// The three cinematic samples, checked the way the brief's Completion
// Contract (§9) would check a delivered site — and photographed.
//
// Run: node scripts/cinematic-check.mjs
//      SHOT_DIR=... node scripts/cinematic-check.mjs
//
// Each page in docs/samples/cinematic/ is checked on a desktop and a phone,
// in Greek, English and Arabic:
//   - nothing scrolls sideways, and no text box leaves the screen
//   - text against what is behind it reaches 4.5:1 (3:1 when large)
//   - every product and price the business gave is on the page — with and
//     without JavaScript
//   - reduced motion and Save-Data leave the poster, never an empty box
//   - the players move: halfway down the scroll, the sequence is halfway
//   - the only scripts are ours (ionexa-players.js, and sample.js, which a
//     real site does not have); every other <script> is data
//   - weight, LCP, CLS and one interaction's latency, measured
//
// The page's fonts come from Google Fonts. They are fetched once with curl
// (TLS verified, through this environment's proxy) and served to the
// browser from memory, so the measurements use the real faces.
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import http from "node:http";
import path from "node:path";
import { chromium } from "playwright";

const DIR = "docs/samples/cinematic";
const SHOT_DIR = process.env.SHOT_DIR || "/tmp/cinematic-shots";
// What each business "gave": the products and prices the page must show.
const DATA = {
  cafe: ["2,40 €", "3,20 €", "3,60 €", "4,20 €", "2,20 €", "1,20 €", "2,80 €", "9,50 €", "07:00–21:00", "Ζεύξιδος 12"],
  hotel: ["260 €", "420 €", "560 €", "780 €", "15:00", "11:00", "Οία, 847 02"],
  cava: ["24,00 €", "19,00 €", "16,00 €", "13,00 €", "38,00 €", "14,00 €", "60,00 €", "Σκουφά 40"],
};
const PAGES = process.env.PAGES ? process.env.PAGES.split(",") : Object.keys(DATA);
const OUR_SCRIPTS = ["sample.js", "ionexa-players.js"];
const BUDGET = { phone: 2.5 * 1024 * 1024, desktop: 6 * 1024 * 1024 }; // the brief's hero budgets

// ---- fonts, fetched once, verified ----
const fontCache = new Map();
const UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";
function curl(url) {
  return execFileSync("curl", ["-sS", "-m", "30", "-A", UA, url], { maxBuffer: 64 * 1024 * 1024 });
}

// ---- the pages, served with the skeleton the Artifact host adds ----
const skeleton = (body) =>
  '<!doctype html><html lang="el"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"></head><body>' + body + "</body></html>";
const TYPES = { ".js": "text/javascript", ".svg": "image/svg+xml", ".webp": "image/webp", ".mp4": "video/mp4", ".jpg": "image/jpeg", ".png": "image/png" };
const server = http.createServer((req, res) => {
  const rel = decodeURIComponent(new URL(req.url, "http://x").pathname).replace(/^\/+/, "");
  const file = path.resolve(DIR, rel);
  if (!file.startsWith(path.resolve(DIR))) return res.writeHead(403).end();
  try {
    const body = readFileSync(file);
    if (file.endsWith(".html")) return res.writeHead(200, { "content-type": "text/html; charset=utf-8" }).end(skeleton(body.toString("utf8")));
    res.writeHead(200, { "content-type": TYPES[path.extname(file)] || "application/octet-stream" }).end(body);
  } catch { res.writeHead(404).end(); }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const BASE = "http://127.0.0.1:" + server.address().port + "/";

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--no-sandbox"] });
const DEVICES = {
  desktop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 },
  phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
};
const failures = [];
const check = (name, ok, detail) => { console.log((ok ? "  PASS  " : "  FAIL  ") + name + (ok || !detail ? "" : "\n        " + detail)); if (!ok) failures.push(name); };

async function open(page, device, { js = true, reduced = false, saveData = false } = {}) {
  const ctx = await browser.newContext({ ...DEVICES[device], javaScriptEnabled: js, reducedMotion: reduced ? "reduce" : "no-preference" });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, async (route) => {
    const url = route.request().url();
    if (!fontCache.has(url)) fontCache.set(url, curl(url));
    const body = fontCache.get(url);
    await route.fulfill({ status: 200, body, headers: { "content-type": url.includes("googleapis") ? "text/css" : "font/woff2", "access-control-allow-origin": "*" } });
  });
  const p = await ctx.newPage();
  const errors = [];
  p.on("pageerror", (e) => errors.push(String(e)));
  await p.addInitScript((sd) => {
    if (sd) Object.defineProperty(navigator, "connection", { value: { saveData: true, effectiveType: "4g" } });
    window.__lcp = 0; window.__cls = 0; window.__inp = 0;
    try {
      new PerformanceObserver((l) => { const e = l.getEntries().at(-1); if (e) window.__lcp = e.startTime; }).observe({ type: "largest-contentful-paint", buffered: true });
      new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value; }).observe({ type: "layout-shift", buffered: true });
      new PerformanceObserver((l) => { for (const e of l.getEntries()) if (e.interactionId) window.__inp = Math.max(window.__inp, e.duration); }).observe({ type: "event", buffered: true, durationThreshold: 16 });
    } catch (e) {}
  }, saveData);
  await p.goto(BASE + page + ".html", { waitUntil: "load" });
  await p.evaluate(() => document.fonts && document.fonts.ready);
  // Weight from the browser's own Resource Timing, not from Playwright's
  // response bodies (that undercounted: the hotel read 52 KB with a 74 KB
  // poster on it). decodedBodySize: the bytes as delivered to the page,
  // before any compression the real host would add — the cautious number.
  const bytes = () => p.evaluate(() => [performance.getEntriesByType("navigation")[0], ...performance.getEntriesByType("resource")].reduce((n, e) => n + (e ? e.decodedBodySize || 0 : 0), 0));
  return { ctx, p, errors, bytes };
}

// Contrast, measured on the composed colours: the text's colour against the
// first solid background found walking up (an rgba is mixed over what is
// beneath it), the way a screen reader of the WCAG rule would.
const CONTRAST = () => {
  const parse = (c) => { const m = c.match(/[\d.]+/g); return m ? m.map(Number) : [0, 0, 0, 0]; };
  const lum = ([r, g, b]) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const mix = (top, under) => { const a = top[3] == null ? 1 : top[3]; return [0, 1, 2].map((i) => top[i] * a + under[i] * (1 - a)); };
  const bgOf = (el) => {
    const layers = [];
    for (let n = el; n; n = n.parentElement) {
      const c = parse(getComputedStyle(n).backgroundColor);
      if ((c[3] == null ? 1 : c[3]) > 0) { layers.push(c); if ((c[3] == null ? 1 : c[3]) >= 1) break; }
    }
    let base = parse(getComputedStyle(document.body).backgroundColor);
    for (let i = layers.length - 1; i >= 0; i--) base = mix(layers[i], base);
    return base;
  };
  const bad = [];
  document.querySelectorAll("h1,h2,h3,p,li,dt,dd,address,small,b,a,button,label,.card,.item span").forEach((el) => {
    if (!el.textContent.trim() || el.closest(".sample-lang") || el.closest("[aria-hidden='true']")) return;
    const r = el.getBoundingClientRect(); if (!r.width || !r.height) return;
    const cs = getComputedStyle(el); if (cs.visibility === "hidden" || cs.opacity === "0") return;
    const fg = mix(parse(cs.color), bgOf(el)), bg = bgOf(el);
    const L1 = lum(fg), L2 = lum(bg), ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
    const size = parseFloat(cs.fontSize), large = size >= 24 || (size >= 18.66 && Number(cs.fontWeight) >= 700);
    if (ratio < (large ? 3 : 4.5)) bad.push(el.tagName.toLowerCase() + "." + (el.className || "") + " " + ratio.toFixed(2) + ":1 «" + el.textContent.trim().slice(0, 30) + "»");
  });
  return bad;
};
const LAYOUT = () => {
  const out = [];
  document.querySelectorAll("h1,h2,h3,p,.card,.btn,nav a,.item,.room,.wine,address").forEach((el) => {
    const r = el.getBoundingClientRect();
    if (r.width && (r.right > window.innerWidth + 1 || r.left < -1)) out.push(el.tagName.toLowerCase() + "." + el.className + " «" + el.textContent.trim().slice(0, 24) + "»");
  });
  return { overflowX: document.documentElement.scrollWidth - window.innerWidth, outside: out };
};

// The hero's text, and how busy the picture behind it may be: the DETAIL
// behind it — what is left after a blur takes the soft gradients away — so
// that bokeh, which is meant to sit behind type, does not count, and lines,
// edges and a sharp subject do. The first version measured the plain spread
// of luminance and failed the café's title for sitting on its own bokeh.
const HERO_TEXT = [".hero-copy h1", ".hero-copy .lede", ".eyebrow", ".title h1", ".title span", ".title p", ".notes h1", ".notes li", ".notes .k"];
// Calibrated 2026-10-03 on the samples themselves: every calm background
// read ≤ 1.6; the real collisions found — the hotel's horizon across its
// subtitle (8.2), its sun behind the Arabic title (5.9) and the phone title
// (2.6–4.1) — all read above 2.5.
const BUSY = 2.5;
const sharp = (await import("sharp")).default;
async function detail(png) {
  const img = sharp(png).greyscale();
  const { data: a, info } = await img.clone().raw().toBuffer({ resolveWithObject: true });
  const { data: b } = await sharp(png).greyscale().blur(6).raw().toBuffer({ resolveWithObject: true });
  let s = 0, s2 = 0;
  const n = info.width * info.height;
  for (let i = 0; i < n; i++) { const d = a[i] - b[i]; s += d; s2 += d * d; }
  return Math.sqrt(Math.max(0, s2 / n - (s / n) ** 2));
}
const results = {};
mkdirSync(SHOT_DIR, { recursive: true });
for (const page of PAGES) {
  console.log(`\n== ${page} ==`);
  results[page] = {};
  for (const device of ["desktop", "phone"]) {
    // Load, weight and timing: Greek, the page as delivered.
    const { ctx, p, errors, bytes } = await open(page, device);
    await p.waitForTimeout(1200);
    await p.click(".sample-lang button[data-lang='el']");
    await p.waitForTimeout(300);
    const perf = await p.evaluate(() => ({ lcp: window.__lcp, cls: window.__cls, inp: window.__inp }));
    const w = await bytes();
    results[page][device] = { bytes: w, ...perf };
    console.log(`  ${device.padEnd(8)} ${(w / 1024).toFixed(0)} KB loaded · LCP ${perf.lcp.toFixed(0)} ms · CLS ${perf.cls.toFixed(3)} · interaction ${perf.inp.toFixed(0)} ms`);
    check(`${device}: no script errors`, errors.length === 0, errors.join(" | "));
    check(`${device}: within the hero budget (${(BUDGET[device] / 1048576).toFixed(1)} MB)`, w <= BUDGET[device], `${(w / 1048576).toFixed(2)} MB`);
    check(`${device}: CLS under 0.1`, perf.cls < 0.1, perf.cls.toFixed(3));
    const scripts = await p.evaluate(() => [...document.scripts].map((s) => s.src ? "src:" + s.src.split("/").pop() : "inline:" + (s.type || "js")));
    check(`${device}: only our scripts run; every inline <script> is data`, scripts.every((s) => (s.startsWith("src:") && OUR_SCRIPTS.includes(s.slice(4))) || s === "inline:application/ld+json" || s === "inline:application/json"), scripts.join(", "));
    // The players move with the scroll.
    const before = await p.evaluate(() => window.IonexaPlayers.state());
    const scrub = await p.$(".ix-scrub");
    if (scrub) {
      await p.evaluate(() => { const s = document.querySelector(".ix-scrub"); window.scrollTo(0, s.offsetTop + (s.offsetHeight - innerHeight) / 2); });
      await p.waitForTimeout(500);
      const mid = await p.evaluate(() => window.IonexaPlayers.state().players.find((x) => x.kind === "sequence" || x.kind === "rotate"));
      check(`${device}: halfway down the scroll, the ${mid.kind} is halfway (${mid.frame} of ${mid.of})`, mid.mode === "frames" && Math.abs(mid.frame / mid.of - (mid.kind === "rotate" ? 0.5 : 0.5)) < 0.12, JSON.stringify(mid));
      await p.screenshot({ path: `${SHOT_DIR}/${page}-${device}-el-midscroll.png` });
      await p.evaluate(() => window.scrollTo(0, 0));
    } else {
      await p.waitForTimeout(400);
      const loop = (await p.evaluate(() => window.IonexaPlayers.state())).players.find((x) => x.kind === "loop");
      check(`${device}: the loop plays (frame ${loop.frame})`, loop.mode === "frames" || loop.mode === "video", JSON.stringify(loop));
    }
    void before;
    for (const lang of ["el", "en", "ar"]) {
      await p.evaluate((l) => window.sample.lang(l), lang);
      await p.evaluate(() => window.scrollTo(0, 0));
      await p.waitForTimeout(250);
      const lay = await p.evaluate(LAYOUT);
      check(`${device} ${lang}: nothing leaves the screen`, lay.overflowX <= 0 && lay.outside.length === 0, `sideways ${lay.overflowX}px; ${lay.outside.slice(0, 4).join(" · ")}`);
      // Text over the subject: with the text made invisible, what is behind
      // each line of the hero must be calm. Measured in pixels, so it holds
      // on a storyboard and on the AI picture alike: the spread of the
      // luminance under the text box, which lines, edges and a busy subject
      // all raise, and a soft gradient or bokeh does not.
      const busy = [];
      // The language switch belongs to the sample, not to the site.
      await p.evaluate(() => { const b = document.querySelector(".sample-lang"); if (b) b.style.visibility = "hidden"; });
      for (const sel of HERO_TEXT) {
        for (const el of await p.$$(sel)) {
          const box = await el.boundingBox();
          if (!box || box.width < 4 || box.height < 4) continue;
          await el.evaluate((n) => { n.dataset.c = n.style.color; n.style.color = "transparent"; });
          const png = await p.screenshot({ clip: box });
          await el.evaluate((n) => { n.style.color = n.dataset.c; });
          const sd = await detail(png);
          if (process.env.SHOW_SIGMA) console.log(`        ${page} ${device} ${lang} ${sel} σ=${sd.toFixed(1)}`);
          if (sd > BUSY) busy.push(`${sel} σ=${sd.toFixed(1)}`);
        }
      }
      await p.evaluate(() => { const b = document.querySelector(".sample-lang"); if (b) b.style.visibility = ""; });
      check(`${device} ${lang}: no hero text sits on the subject (σ ≤ ${BUSY} behind it)`, busy.length === 0, busy.join(" · "));
      const bad = await p.evaluate(CONTRAST);
      check(`${device} ${lang}: text reaches 4.5:1 (3:1 large)`, bad.length === 0, bad.slice(0, 5).join(" · "));
      await p.screenshot({ path: `${SHOT_DIR}/${page}-${device}-${lang}.png` });
    }
    await ctx.close();
  }
  // Without JavaScript: everything is there, and the posters carry the picture.
  {
    const { ctx, p } = await open(page, "desktop", { js: false });
    const text = await p.evaluate(() => document.body.innerText);
    const missing = DATA[page].filter((d) => !text.includes(d));
    check("without JavaScript: every product, price and address the business gave is on the page", missing.length === 0, "missing " + missing.join(", "));
    const posters = await p.evaluate(() => [...document.querySelectorAll("[data-ix] img")].map((i) => ({ alt: i.alt, ok: i.complete && i.naturalWidth > 0 })));
    check("without JavaScript: the poster is there, with alt text", posters.length > 0 && posters.every((x) => x.ok && x.alt.length > 10), JSON.stringify(posters));
    await ctx.close();
  }
  // Reduced motion and Save-Data: the poster, still.
  for (const [label, opts] of [["reduced motion", { reduced: true }], ["Save-Data", { saveData: true }]]) {
    const { ctx, p } = await open(page, "phone", opts);
    await p.waitForTimeout(800);
    const s = await p.evaluate(() => ({ still: window.IonexaPlayers.state().still, players: window.IonexaPlayers.state().players.length, poster: [...document.querySelectorAll("[data-ix] img")].every((i) => i.naturalWidth > 0 && getComputedStyle(i).opacity !== "0"), canvases: document.querySelectorAll(".ix-canvas").length }));
    check(`${label}: no motion, the poster shows, nothing is drawn over it`, s.still && s.players === 0 && s.poster && s.canvases === 0, JSON.stringify(s));
    if (label === "reduced motion") await p.screenshot({ path: `${SHOT_DIR}/${page}-phone-el-reduced.png` });
    await ctx.close();
  }
}
await browser.close();
server.close();
writeFileSync(SHOT_DIR + "/measurements.json", JSON.stringify({ measured: new Date().toISOString(), results }, null, 2));
console.log(`\nshots in ${SHOT_DIR}`);
console.log(failures.length ? `\nFAILURES: ${failures.length}\n  - ${failures.join("\n  - ")}` : "\nALL PASS");
process.exitCode = failures.length ? 1 : 0;
