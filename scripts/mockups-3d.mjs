// THE NEW DESIGN, 2026-10-03: one page per pattern, one 3D layer for the
// whole app, built, measured and photographed.
//
// Run: node scripts/mockups-3d.mjs
//      SKIP_SHOTS=1 node scripts/mockups-3d.mjs     # just the HTML
//
// The page is docs/mockups/ionexa-3d.src.html, written by hand. This script
// does what that page cannot do for itself:
//
//   1. WRITES THE RAIL FROM THE PRODUCT. The tools in the mockup's sidebar
//      come from src/lib/sidebar-nav.ts through sidebarGroups(), the
//      function the product's sidebar draws with, and their names from
//      messages/{el,en,ar,zh}.json through the same label maps. A rail typed
//      by hand into a mockup is a rail that has already drifted.
//   2. INLINES THE TYPEFACE and the globe's land mask (docs/mockups/
//      globe-land.json, written by scripts/globe-mask.mjs).
//   3. MEASURES what the owner asked for, on this machine, and says where
//      each number comes from: the weight of the 3D code, how long until
//      the field takes a keystroke with and without 3D, frames per second
//      on a desktop and on a throttled phone, and whether Greek, Arabic and
//      Chinese fit. Then it checks the four promises the 3D layer makes —
//      the field first, a still frame under reduced motion, a drawing (not
//      an empty square) without WebGL, and every tool in the rail.
//   4. PHOTOGRAPHS every page, dark and light, desktop and phone.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { loadTs, loadTsLinked } from "./tests/load-ts.mjs";

const DIR = "docs/mockups";
const SHOT_DIR = process.env.SHOT_DIR || "/tmp/mockup-3d-shots";
const FRAG = process.env.FRAG_DIR || "/tmp/mockup-3d-fragment";
const THREE_FILE = DIR + "/vendor/three-0.160.0.min.js";
const LANGS = ["el", "en", "ar", "zh"];

// ---- 1. the rail, from the product ----
// loadTsLinked, not loadTs: sidebar-nav.ts imports its icons from
// lucide-react, and this runs the real module rather than a parse of it.
const { MAIN_SIDEBAR_GROUPS } = await loadTsLinked("src/lib/sidebar-nav.ts");
const { sidebarGroups } = await loadTs("src/lib/sidebar-visibility.ts");
const { GROUP_HEADING_KEYS, ITEM_LABEL_KEYS } = await loadTs("src/lib/sidebar-label-keys.ts");
const messages = Object.fromEntries(LANGS.map((l) => [l, JSON.parse(readFileSync(`messages/${l}.json`, "utf8"))]));
const labelOf = (l, label) =>
  label === "Create Studio" ? messages[l].common.createStudio : ITEM_LABEL_KEYS[label] ? messages[l].sidebar.items[ITEM_LABEL_KEYS[label]] : label;
// A signed-in customer's rail: not the owner's, which adds one owner-only row.
const groups = sidebarGroups(MAIN_SIDEBAR_GROUPS, false);
const NAV = {
  groups: groups.map((g) => ({
    key: GROUP_HEADING_KEYS[g.heading],
    labels: Object.fromEntries(LANGS.map((l) => [l, messages[l].sidebar.groups[GROUP_HEADING_KEYS[g.heading]] ?? g.heading])),
    items: g.items.map((i) => ({ href: i.href, labels: Object.fromEntries(LANGS.map((l) => [l, labelOf(l, i.label)])) })),
  })),
};
const EXPECTED_HREFS = groups.flatMap((g) => g.items.map((i) => i.href));
const untranslated = NAV.groups.flatMap((g) => g.items).filter((i) => LANGS.some((l) => !i.labels[l]));
if (untranslated.length) throw new Error("rail items with no name: " + untranslated.map((i) => i.href).join(", "));

// ---- 2. the page ----
const FACES = [
  ["greek", "U+0370-0377,U+037A-037F,U+0384-038A,U+038C,U+038E-03A1,U+03A3-03FF"],
  ["latin", "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD"],
];
const fontFaces = FACES.map(([subset, range]) => {
  const b64 = readFileSync(DIR + "/fonts/commissioner-" + subset + ".woff2").toString("base64");
  return '@font-face{font-family:"Commissioner";font-style:normal;font-weight:400 500;font-display:swap;' +
    "src:url(data:font/woff2;base64," + b64 + ') format("woff2");unicode-range:' + range + "}";
}).join("\n");
const globe = JSON.parse(readFileSync(DIR + "/globe-land.json", "utf8"));
let src = readFileSync(DIR + "/ionexa-3d.src.html", "utf8");
for (const marker of ["/*@FONTS@*/", "/*@NAV@*/null", "/*@GLOBE@*/null"]) {
  if (!src.includes(marker)) throw new Error("ionexa-3d.src.html lost its " + marker + " marker");
}
src = src
  .replace("/*@FONTS@*/", fontFaces)
  .replace("/*@NAV@*/null", JSON.stringify(NAV))
  .replace("/*@GLOBE@*/null", JSON.stringify({ n: globe.n, mask: globe.mask }));
const standalone =
  '<!doctype html><html lang="el"><head><meta charset="utf-8">' +
  '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">' +
  "</head><body>" + src + "</body></html>";
mkdirSync(FRAG, { recursive: true });
writeFileSync(DIR + "/ionexa-3d.html", standalone);
writeFileSync(FRAG + "/index.html", src);
console.log("  " + DIR + "/ionexa-3d.html   " + Math.round(standalone.length / 1024) + " KB");
console.log("  " + FRAG + "/index.html   (the publishable form; vendor/ beside it)");
console.log("  rail: " + EXPECTED_HREFS.length + " tools in " + NAV.groups.length + " groups (" + NAV.groups.map((g) => g.key).join(" · ") + ")");

// ---- 3a. weight, measured on the files ----
const three = readFileSync(THREE_FILE);
// PINNED BY CONTENT, not by name: the sha-256 of build/three.min.js in the
// npm tarball three@0.160.0 (\`npm pack three@0.160.0\`), checked 2026-10-03.
const THREE_SHA256 = "170c6789f43217c96b3170f4b42fafe135de7f7cd48497a4218f9757ee1d49fa";
const { createHash } = await import("node:crypto");
if (createHash("sha256").update(three).digest("hex") !== THREE_SHA256) throw new Error(THREE_FILE + " is not three.js 0.160.0 as published");
const pageScript = src.slice(src.indexOf("<script>") + 8, src.lastIndexOf("</script>"));
const g3Code = pageScript.slice(pageScript.indexOf("function g3core("), pageScript.indexOf("// --- wiring ---"));
if (g3Code.length < 2000) throw new Error("the 3D layer was not found in the page — the weight below would measure nothing");
const kb = (n) => (n / 1024).toFixed(1) + " KB";
const weight = {
  threeRaw: three.length,
  threeGzip: gzipSync(three, { level: 9 }).length,
  layerGzip: gzipSync(Buffer.from(g3Code), { level: 9 }).length,
  maskBytes: globe.mask.length,
};
console.log("\n== weight (gzip -9, measured on the files) ==");
console.log("  three.js 0.160.0 UMD   " + kb(weight.threeRaw) + " raw, " + kb(weight.threeGzip) + " gzip");
console.log("  the 3D layer itself    " + kb(weight.layerGzip) + " gzip");
console.log("  the globe's land mask  " + weight.maskBytes + " bytes (" + globe.land + " of " + globe.n + " points on land)");

if (process.env.SKIP_SHOTS) {
  console.log("\nSKIP_SHOTS=1 - not measuring in a browser");
  process.exit(0);
}

// ---- 3b. in a browser ----
const { chromium } = await import("playwright");
// SERVED, not opened from disk: the 3D layer starts a Web Worker that loads
// three.js from the page's own origin, which is what the product does and
// what a file:// page cannot.
const http = await import("node:http");
const pathMod = await import("node:path");
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".json": "application/json", ".woff2": "font/woff2" };
const server = http.createServer((req, res) => {
  const rel = decodeURIComponent(new globalThis.URL(req.url, "http://x").pathname).replace(/^\/+/, "");
  const file = pathMod.resolve(DIR, rel || "ionexa-3d.html");
  if (!file.startsWith(pathMod.resolve(DIR))) { res.writeHead(403).end(); return; }
  try { const body = readFileSync(file); res.writeHead(200, { "content-type": TYPES[pathMod.extname(file)] || "application/octet-stream" }).end(body); }
  catch { res.writeHead(404).end(); }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const URL = "http://127.0.0.1:" + server.address().port + "/ionexa-3d.html";
const DEVICES = { desktop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 }, phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true } };
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--no-sandbox", "--enable-webgl", "--ignore-gpu-blocklist"] });
const failures = [];
const check = (name, ok, detail) => { console.log((ok ? "  PASS  " : "  FAIL  ") + name + (ok || !detail ? "" : "\n        " + detail)); if (!ok) failures.push(name); };
const median = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };

async function open(device, { mode = null, reduced = false, hash = "home", throttle = 0 } = {}) {
  const ctx = await browser.newContext({ ...DEVICES[device], reducedMotion: reduced ? "reduce" : "no-preference" });
  const p = await ctx.newPage();
  const errors = [];
  p.on("pageerror", (e) => errors.push(String(e)));
  await p.addInitScript((m) => {
    if (m) window.__IONEXA_3D = m;
    window.__long = [];
    try { new PerformanceObserver((l) => l.getEntries().forEach((e) => window.__long.push({ start: e.startTime, ms: e.duration }))).observe({ type: "longtask", buffered: true }); } catch (e) {}
  }, mode);
  if (throttle) { const cdp = await ctx.newCDPSession(p); await cdp.send("Emulation.setCPUThrottlingRate", { rate: throttle }); }
  await p.goto(URL + "#" + hash);
  return { ctx, p, errors };
}
const settle = (p, ms) => p.waitForTimeout(ms);
const st = (p) => p.evaluate(() => window.mock.state());

console.log("\n== the field comes first (5 loads each, desktop) ==");
const typable = {};
for (const mode of [null, "page", "off"]) {
  const ready = [], longAfter = [], order = [];
  for (let i = 0; i < 5; i++) {
    const { ctx, p } = await open("desktop", { mode });
    await settle(p, 2500);
    const s = await st(p);
    const longs = await p.evaluate(() => window.__long);
    ready.push(s.T.fieldReady);
    longAfter.push(Math.max(0, ...longs.filter((l) => l.start >= s.T.fieldReady).map((l) => l.ms)));
    if (mode !== "off") order.push(s.T.threeRequested !== null && s.T.fieldReady < s.T.threeRequested);
    await ctx.close();
  }
  typable[mode ?? "3d"] = { ready: median(ready), longest: median(longAfter), order };
  console.log(`  ${({ off: "3D off       ", page: "3D on page   " })[mode] ?? "3D in worker "}  field typable at ${median(ready).toFixed(0)} ms (median of 5)  · longest task after it ${median(longAfter).toFixed(0)} ms`);
}
check("three.js is requested only after the field exists, in all 5 loads", typable["3d"].order.length === 5 && typable["3d"].order.every(Boolean), JSON.stringify(typable["3d"].order));
check("the field is typable as early with 3D as without (within 30 ms)", typable["3d"].ready - typable.off.ready < 30, `${typable["3d"].ready} vs ${typable.off.ready}`);
check("with the worker, nothing on the page's thread blocks the field for 50 ms or more", typable["3d"].longest < 50, `${typable["3d"].longest} ms`);

console.log("\n== frames per second ==");
const fpsRuns = {};
for (const [label, device, throttle] of [["desktop", "desktop", 0], ["phone, CPU ÷4", "phone", 4]]) {
  const { ctx, p, errors } = await open(device, { throttle });
  await settle(p, 3000);
  const samples = [];
  for (let i = 0; i < 5; i++) { await settle(p, 1000); samples.push(await st(p)); }
  const last = samples.at(-1);
  fpsRuns[label] = { fps: median(samples.map((s) => s.g3.fps)), mode: last.g3.mode, why: last.g3.why, gl: last.g3.gl };
  console.log(`  ${label.padEnd(14)} ${String(fpsRuns[label].fps).padStart(3)} fps (median of 5 one-second windows) · mode ${last.g3.mode} · renderer ${last.g3.gl}`);
  if (errors.length) check(label + ": no script errors", false, errors.join(" | "));
  await ctx.close();
}

console.log("\n== the fallbacks ==");
{
  const { ctx, p } = await open("desktop", { reduced: true });
  await settle(p, 2500);
  const s = await st(p);
  check("reduced motion: the layer draws ONE still frame, and the slot is not empty", s.g3.mode === "static" && s.syms.every((x) => x.gl) && s.T.firstFrame !== null, JSON.stringify(s.g3));
  await ctx.close();
}
{
  const { ctx, p } = await open("desktop", { mode: "nogl" });
  await settle(p, 2000);
  const s = await st(p);
  check("no WebGL: three.js is never requested", s.T.threeRequested === null);
  check("...and every symbol shows its drawing, not an empty square", s.syms.length > 0 && s.syms.every((x) => x.svgShown && !x.gl), JSON.stringify(s.syms));
  for (const v of ["sites", "chat", "finance", "projects"]) {
    await p.evaluate((x) => window.mock.show(x), v);
    const t = await st(p);
    if (!t.syms.every((x) => x.svgShown)) check(`no WebGL on ${v}: drawing shown`, false, JSON.stringify(t.syms));
  }
  await ctx.close();
}
{
  const { ctx, p } = await open("desktop");
  await settle(p, 1500);
  const s = await st(p);
  check(`every current tool is in the rail (${EXPECTED_HREFS.length}, in the product's order)`, JSON.stringify(s.navLinks) === JSON.stringify(EXPECTED_HREFS), JSON.stringify(s.navLinks));
  await ctx.close();
}

console.log("\n== does it fit: Greek, English, Arabic (RTL), Chinese ==");
for (const device of ["desktop", "phone"]) {
  for (const lang of LANGS) {
    const { ctx, p, errors } = await open(device, { mode: "off" });
    await p.evaluate((l) => window.mock.lang(l), lang);
    const notes = [];
    let ellipsised = [];
    for (const v of ["home", "sites", "chat", "finance", "projects"]) {
      await p.evaluate((x) => window.mock.show(x), v);
      if (v === "sites") await p.evaluate(() => window.mock.three(true));
      const s = await st(p);
      if (s.overflowX > 0) notes.push(`${v}: scrolls sideways ${s.overflowX}px`);
      if (s.clipped.length) notes.push(`${v}: clipped ${s.clipped.join(",")}`);
      if (lang === "ar" && s.dir !== "rtl") notes.push("not RTL");
      ellipsised = s.navEllipsised;
    }
    check(`${device} ${lang}: nothing scrolls sideways or clips, on all five pages`, notes.length === 0 && errors.length === 0, notes.concat(errors).join(" | "));
    if (ellipsised.length) console.log(`        rail names shortened with … (${ellipsised.length}): ${ellipsised.join(" · ")}`);
    await ctx.close();
  }
}

console.log("\n== photographs ==");
mkdirSync(SHOT_DIR, { recursive: true });
const SHOTS = [];
for (const device of ["desktop", "phone"]) for (const theme of ["dark", "light"]) for (const v of ["home", "sites", "chat", "finance", "projects"]) SHOTS.push([device, theme, "el", v]);
for (const lang of ["ar", "zh"]) for (const device of ["desktop", "phone"]) SHOTS.push([device, "dark", lang, "home"], [device, "dark", lang, "sites"]);
SHOTS.push(["phone", "dark", "el", "drawer"], ["desktop", "dark", "el", "palette"]);
let n = 0;
for (const [device, theme, lang, v] of SHOTS) {
  const { ctx, p, errors } = await open(device);
  await p.evaluate(() => document.fonts.ready);
  await p.evaluate(([th, l, x]) => { document.body.classList.add("shot"); window.mock.theme(th); window.mock.lang(l); window.mock.show(x); if (x === "sites") window.mock.three(true); }, [theme, lang, v]);
  await settle(p, 2600);
  const s = await st(p);
  const name = `${device}-${theme}-${lang}-${v}`;
  const fail = [];
  if (errors.length) fail.push(errors.join(" | "));
  if (s.theme !== theme || s.lang !== lang) fail.push(`state ${s.theme}/${s.lang}`);
  if (!s.font) fail.push("Commissioner did not load");
  if (s.overflowX > 0) fail.push("scrolls sideways");
  if (fail.length) check(name, false, fail.join("; "));
  await p.screenshot({ path: `${SHOT_DIR}/${name}.png` });
  n++;
  await ctx.close();
}
console.log(`  ${n} shots in ${SHOT_DIR}`);
await browser.close();
server.close();

writeFileSync(SHOT_DIR + "/measurements.json", JSON.stringify({ measured: new Date().toISOString(), weight, typable, fps: fpsRuns }, null, 2));
console.log(failures.length ? `\nFAILURES: ${failures.length}\n  - ${failures.join("\n  - ")}` : "\nALL PASS");
process.exitCode = failures.length ? 1 : 0;
