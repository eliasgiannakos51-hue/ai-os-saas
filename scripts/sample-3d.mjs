// The 3D-site sample: serve it, open it eight ways, measure what it costs.
//
// docs/samples/3d-site/page.src.html is what the MODEL would write (HTML and
// CSS, no JavaScript); ionexa-3d.js is what WE would write once and serve.
// This script answers, with a browser rather than an opinion:
//
//   - does each tier come up where it should, and does the page stay
//     readable in every one of them - including when today's security
//     scanner (src/lib/website-html-security-scan.ts) strips its scripts;
//   - is the content in the HTML without JavaScript (the SEO question);
//   - how many characters does 3D add to what the model has to write, which
//     is what decides what it costs.
//
// The libraries come from the npm registry (three@0.160.0 is the last
// release that ships a UMD build; 0.161.0 dropped it). cdnjs and jsdelivr
// are refused by this environment's network policy (403), so they are not
// used here; a published site would load the same files from our own
// origin, which is the architecture the sample argues for.
//
// Run: node scripts/sample-3d.mjs
//      SHOT_DIR=... VENDOR_DIR=... FRAG_DIR=... node scripts/sample-3d.mjs
import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createServer } from "node:http";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { chromium } from "playwright";
import { loadTs } from "./tests/load-ts.mjs";

const DIR = "docs/samples/3d-site";
const SHOT_DIR = process.env.SHOT_DIR || join(tmpdir(), "ionexa-3d-shots");
const VENDOR = process.env.VENDOR_DIR || join(tmpdir(), "ionexa-3d-vendor");
const FRAG = process.env.FRAG_DIR || join(tmpdir(), "ionexa-3d-fragment");
const LIBS = [
  ["three@0.160.0", "package/build/three.min.js", "three-0.160.0.min.js"],
  ["gsap@3.12.5", "package/dist/gsap.min.js", "gsap-3.12.5.min.js"],
  ["gsap@3.12.5", "package/dist/ScrollTrigger.min.js", "ScrollTrigger-3.12.5.min.js"],
  ["lenis@1.1.13", "package/dist/lenis.min.js", "lenis-1.1.13.min.js"],
];

// ------------------------------------------------------------ libraries
mkdirSync(VENDOR, { recursive: true });
for (const [pkg, inner, out] of LIBS) {
  if (existsSync(join(VENDOR, out))) continue;
  const tgz = execFileSync("npm", ["pack", pkg, "--silent", "--pack-destination", VENDOR], { encoding: "utf8" }).trim().split("\n").pop();
  execFileSync("tar", ["-xzf", join(VENDOR, tgz), "-C", VENDOR, inner]);
  copyFileSync(join(VENDOR, inner), join(VENDOR, out));
}

// ---------------------------------------------------------------- pages
const src = readFileSync(join(DIR, "page.src.html"), "utf8");
const component = readFileSync(join(DIR, "ionexa-3d.js"), "utf8");
const wrap = (body) => '<!doctype html><html lang="el"><head><meta charset="utf-8">' +
  '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"></head><body>' + body + "</body></html>";
const page = wrap(src);
// Today's rule, run for real: the same function generate, edit, publish and
// rollback call.
const scan = await loadTs("src/lib/website-html-security-scan.ts");
const stripped = scan.stripDisallowedExternalScripts(page);

// The publishable form: no skeleton, scripts as published files beside it.
mkdirSync(join(FRAG, "vendor"), { recursive: true });
writeFileSync(join(FRAG, "index.html"), src);
writeFileSync(join(FRAG, "ionexa-3d.js"), component);
for (const [, , out] of LIBS) copyFileSync(join(VENDOR, out), join(FRAG, "vendor", out));

// ---------------------------------------------------------------- serve
const FONTS = "docs/mockups/fonts";
// Absolute, and built after the port is known: served as the response to
// fonts.googleapis.com, a relative url() resolves against GOOGLE's host,
// and the first run quietly drew every heading in a fallback face.
let fontCss = "";
const server = createServer((req, res) => {
  const url = new URL(req.url, "http://x");
  const send = (type, body) => { res.writeHead(200, { "content-type": type }); res.end(body); };
  if (url.pathname === "/") return send("text/html; charset=utf-8", page);
  if (url.pathname === "/stripped/") return send("text/html; charset=utf-8", stripped);
  if (url.pathname.endsWith("/ionexa-3d.js")) return send("text/javascript", component);
  const lib = LIBS.find(([, , out]) => url.pathname.endsWith("/vendor/" + out));
  if (lib) return send("text/javascript", readFileSync(join(VENDOR, lib[2])));
  if (url.pathname.startsWith("/fonts/")) return send("font/woff2", readFileSync(join(FONTS, url.pathname.slice(7))));
  res.writeHead(404); res.end();
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const ORIGIN = "http://127.0.0.1:" + server.address().port;
fontCss = ["greek", "latin"].map((sub) =>
  '@font-face{font-family:"Commissioner";font-weight:400 700;font-display:swap;src:url(' + ORIGIN + "/fonts/commissioner-" + sub + '.woff2) format("woff2")}').join("\n");

// ------------------------------------------------------------ scenarios
const DESKTOP = { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 };
const PHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true };
const hw = (cores, mem) => "Object.defineProperty(navigator,'hardwareConcurrency',{get:()=>" + cores + "});" +
  "Object.defineProperty(navigator,'deviceMemory',{get:()=>" + mem + "});";
const NO_WEBGL = "HTMLCanvasElement.prototype.getContext=(function(o){return function(t){return /webgl/.test(t)?null:o.apply(this,arguments)}})(HTMLCanvasElement.prototype.getContext);";

const SCENARIOS = [
  { id: "desktop", ctx: DESKTOP, init: hw(8, 8), expect: ["full", "3d"] },
  { id: "phone", ctx: PHONE, init: hw(8, 8), expect: ["lite", "3d"] },
  { id: "weak-phone", ctx: PHONE, init: hw(4, 2), expect: ["static", "static"] },
  { id: "no-webgl", ctx: DESKTOP, init: hw(8, 8) + NO_WEBGL, expect: ["static", "static"] },
  { id: "reduced-motion", ctx: { ...DESKTOP, reducedMotion: "reduce" }, init: hw(8, 8), expect: ["static", "static"] },
  { id: "libs-blocked", ctx: DESKTOP, init: hw(8, 8), block: /\/vendor\//, expect: ["static", "static"] },
  { id: "todays-scanner", ctx: DESKTOP, init: hw(8, 8), path: "/stripped/", expect: [null, null] },
  { id: "no-javascript", ctx: { ...DESKTOP, javaScriptEnabled: false }, expect: [null, null] },
];
// What must be readable in every one of them: the business's own facts.
const MUST_READ = ["Λαδάδικα Catering", "Φαγητό για σαράντα", "Γεμιστά με κιμά", "Πορτοκαλόπιτα", "€11,00", "Κατσάμπα 12", "08:00–18:00"];
const DISHES = 12;

mkdirSync(SHOT_DIR, { recursive: true });
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium",
  args: ["--no-sandbox", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const rows = [];
let failed = 0;
try {
  for (const sc of SCENARIOS) {
    const ctx = await browser.newContext(sc.ctx);
    if (sc.init) await ctx.addInitScript(sc.init);
    await ctx.route(/fonts\.googleapis\.com/, (r) => r.fulfill({ contentType: "text/css", body: fontCss }));
    if (sc.block) await ctx.route(sc.block, (r) => r.abort());
    const p = await ctx.newPage();
    const errors = [];
    p.on("pageerror", (e) => errors.push(String(e.message || e)));
    await p.goto(ORIGIN + (sc.path || "/"), { waitUntil: "load" });
    await p.waitForTimeout(1200);
    const js = sc.ctx.javaScriptEnabled !== false;
    const st = js ? await p.evaluate(() => {
      const s = window.ionexa3d || null;
      return s && { tier: s.tier, ready: s.ready, reason: s.reason, frames: s.frames, readyAt: s.readyAt,
        drawn: s.probe ? s.probe() : null };
    }) : null;
    const text = await p.evaluate(() => document.body.innerText);
    const face = js ? await p.evaluate(async () => { await document.fonts.ready; return document.fonts.check('600 40px "Commissioner"', "Φαγητό"); }) : null;
    const dishes = await p.evaluate(() => document.querySelectorAll(".dish").length);
    const overflow = js ? await p.evaluate(() => document.documentElement.scrollWidth - innerWidth) : 0;
    const drawingShown = await p.evaluate(() => { const s = document.querySelector(".bowl-static"); return !!s && getComputedStyle(s).visibility !== "hidden" && s.getBoundingClientRect().width > 0; });

    const fail = [];
    const missing = MUST_READ.filter((m) => !text.includes(m));
    if (missing.length) fail.push("not readable: " + missing.join(", "));
    if (dishes !== DISHES) fail.push(dishes + " dishes in the DOM, expected " + DISHES);
    if (errors.length) fail.push("script errors: " + errors.join(" | "));
    if (face === false) fail.push("Commissioner did not load - the headings are in a fallback face");
    if (overflow > 0) fail.push("scrolls sideways by " + overflow + "px");
    const [tier, ready] = sc.expect;
    if (tier && (!st || st.tier !== tier)) fail.push("tier " + (st && st.tier) + ", expected " + tier);
    if (ready === "3d") {
      if (!st || st.ready !== "3d" || !(st.frames > 0)) fail.push("no WebGL frame was drawn");
      else if (!(st.drawn > 0.05)) fail.push("the canvas centre is " + Math.round((st.drawn || 0) * 100) + "% drawn - a blank scene");
      if (drawingShown) fail.push("the fallback drawing is still showing over a live scene");
    } else if (!drawingShown) fail.push("no bowl at all: neither a scene nor the drawing");
    // Today's scanner must leave no 3D behind; that is the point of running it.
    if (sc.id === "todays-scanner" && st) fail.push("the stripped page still ran ionexa-3d.js");

    await p.screenshot({ path: join(SHOT_DIR, sc.id + ".png") });
    // innerText counts text at opacity 0, so "readable" above cannot see a
    // section that rose in on scroll and never arrived. Scroll the whole page
    // the way a visitor would, then require every revealed block to be there.
    if (st && st.ready === "3d") {
      const height = await p.evaluate(() => document.documentElement.scrollHeight);
      for (let y = 0; y <= height; y += 500) { await p.mouse.wheel(0, 500); await p.waitForTimeout(90); }
      await p.waitForTimeout(1400);
      const hidden = await p.evaluate(() => [...document.querySelectorAll("[data-reveal]")].filter((el) => parseFloat(getComputedStyle(el).opacity) < 0.99).length);
      if (hidden) fail.push(hidden + " revealed block(s) still invisible after scrolling past them");
      if (sc.id === "desktop") await p.screenshot({ path: join(SHOT_DIR, "desktop-full.png"), fullPage: true });
    }
    rows.push([sc.id, st ? st.tier + " / " + st.reason : (js ? "(no script ran)" : "(JavaScript off)"),
      st && st.readyAt ? st.readyAt + " ms" : "-", st && st.drawn != null ? Math.round(st.drawn * 100) + "%" : "-", fail.length ? "FAIL " + fail.join("; ") : "ok"]);
    if (fail.length) failed++;
    await ctx.close();
  }
} finally {
  await browser.close();
  server.close();
}

console.log("\n  scenario         tier / why                 first frame  canvas  result");
for (const r of rows) console.log("  " + r[0].padEnd(16) + " " + r[1].padEnd(26) + " " + r[2].padStart(11) + "  " + r[3].padStart(6) + "  " + r[4]);
console.log("  (first frame: local server, software WebGL - not a real-world load time)");

// ------------------------------------------------------ what 3D costs
// The model is paid by the character it writes. Take the 3D parts out of
// the page it would write and the difference is what 3D adds.
const plain = src
  .replace(/<div class="stage"[\s\S]*?<\/svg>\s*<\/div>/, "")
  .replace(/<script defer src="[^"]*"><\/script>\s*/g, "")
  .replace(/\s(data-reveal|data-parallax="[^"]*")/g, "")
  .replace(/\.stage[^{]*\{[^}]*\}\s*|\.bowl-static\{[^}]*\}\s*|html\[data-ready="3d"\][^{]*\{[^}]*\}\s*/g, "");
const est = readFileSync("src/lib/billing/estimate.ts", "utf8");
const typical = Number((est.match(/websiteGenerate:\s*\{[\s\S]*?baseOutputChars:\s*(\d+)/) || [])[1]);
if (!typical) throw new Error("could not read websiteGenerate.baseOutputChars from estimate.ts");
const CPT = Number((est.match(/export const CHARS_PER_TOKEN = (\d+)/) || [])[1]);
const pricing = await loadTs("src/lib/billing/model-pricing.ts");
const sonnet = pricing.MODEL_PRICING_USD["claude-sonnet-4-6"];
// Plan multiplier 5 and Growth's EUR 0.0167 a credit: measured 2026-10-02
// by scripts/measure-margin.mjs and recorded in src/lib/billing/credit-formula.ts.
const MARGIN = 5, GROWTH_EUR = 50 / 3000, USD_EUR = 0.92;
const credits = (chars) => Math.ceil((chars / CPT) * sonnet.outputPerMTok / 1e6 * USD_EUR * MARGIN / GROWTH_EUR);
const added = src.length - plain.length;
const gz = (b) => Number(execFileSync("sh", ["-c", "gzip -9c | wc -c"], { input: b }).toString().trim());
const libsGz = LIBS.reduce((s, [, , out]) => s + gz(readFileSync(join(VENDOR, out))), 0);

console.log("\n  what the model writes          chars    output tokens   credits on Growth (output only)");
console.log("  this page, with 3D        " + String(src.length).padStart(9) + "   " + String(Math.ceil(src.length / CPT)).padStart(13) + "   " + credits(src.length));
console.log("  the same page, no 3D      " + String(plain.length).padStart(9) + "   " + String(Math.ceil(plain.length / CPT)).padStart(13) + "   " + credits(plain.length));
console.log("  3D adds                   " + String(added).padStart(9) + "   " + String(Math.ceil(added / CPT)).padStart(13) + "   " + credits(added) + "   (" + (100 * added / plain.length).toFixed(0) + "% of this page)");
console.log("  a typical generated site  " + String(typical).padStart(9) + "   " + String(Math.ceil(typical / CPT)).padStart(13) + "   " + credits(typical) + "   (estimate.ts baseOutputChars)");
console.log("  ionexa-3d.js, if the model wrote it instead   " + component.length + " chars, " + credits(component.length) + " credits, on every site");
console.log("\n  what the visitor downloads for 3D: " + Math.round(libsGz / 1024) + " KB gzip of libraries + " + Math.round(gz(component) / 1024) + " KB for ionexa-3d.js");
console.log("  (sonnet-4-6 output $" + sonnet.outputPerMTok + "/MTok from model-pricing.ts; " + CPT + " chars a token from estimate.ts)");

console.log("\n  screenshots: " + SHOT_DIR + "\n  publishable: " + FRAG);
if (failed) { console.log("\n" + failed + " of " + SCENARIOS.length + " scenarios FAILED"); process.exit(1); }
console.log("\nALL " + SCENARIOS.length + " SCENARIOS PASS");
