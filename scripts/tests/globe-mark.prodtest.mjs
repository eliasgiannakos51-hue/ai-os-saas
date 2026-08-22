// THE GLOBE, IN A BROWSER, MEASURED IN PIXELS.
//
// globe-mark.test.mjs proves the geometry is shared and the CSS says what
// it should. Neither of those is a claim about what a person sees, and
// this codebase has now been caught twice by exactly that gap: an
// attribution that was present in the markup and had zero visible pixels
// on three of four layouts, and a border token that measured fine and
// rendered at 1.19:1.
//
// So this renders the REAL component — the actual .tsx, transpiled and
// server-rendered, not a hand-written copy of its output — under the
// REAL globals.css, and asks:
//
//   1. Is it painted at all? elementFromPoint on the sphere's own stroke,
//      not getBoundingClientRect, which is true of an invisible element.
//   2. Does it clear 3:1 against what is behind it, in BOTH themes, taken
//      from SCREENSHOT PIXELS rather than from the token it was set from?
//   3. Does it survive 375px?
//   4. Does reduced motion return the orbit to its drawn angle, rather
//      than freezing it wherever the clock stopped?
//   5. What frame rate does the spin actually run at? The two backdrop
//      layers in this app were rewritten because animated SVG cost 120ms
//      per keystroke; a third animated SVG does not get to be assumed
//      cheap.
//
// Run: node scripts/tests/globe-mark.prodtest.mjs
import { chromium } from "playwright";
import { createServer } from "node:http";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import path from "node:path";
import ts from "typescript";

let pass = 0;
const failures = [];
const ok = (name, cond, detail = "") => {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    failures.push(name);
    console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ""}`);
  }
};

const OUT = path.resolve("prod-audit/globe");
mkdirSync(OUT, { recursive: true });

// ---------------------------------------------------------------------
// Server-render the REAL component.
//
// scripts/tests/load-ts.mjs cannot do this: it transpiles with no `jsx`
// option, so a .tsx file comes out as a syntax error. Rather than change
// the shared loader for one caller, the two files this needs are
// transpiled here with JsxEmit.ReactJSX and evaluated as one module.
// ---------------------------------------------------------------------
function transpile(file) {
  return ts.transpileModule(readFileSync(file, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
      jsxImportSource: "react",
    },
    fileName: file,
  }).outputText;
}
function stripLocalImports(js) {
  return (
    js
      .replace(/^\s*import\s+[^;]*?from\s*["']@\/[^"']+["'];?\s*$/gm, "")
      // Each transpiled .tsx emits its own `import { jsx as _jsx } from
      // "react/jsx-runtime"`, and concatenating two of them redeclares the
      // binding. One is hoisted to the top of the bundle instead.
      .replace(/^\s*import\s+\{[^}]*\}\s*from\s*["']react\/jsx-runtime["'];?\s*$/gm, "")
  );
}
const JSX_RUNTIME = 'import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";\n';

const bundle =
  JSX_RUNTIME +
  stripLocalImports(transpile("src/lib/brand/globe.ts")) +
  "\n" +
  stripLocalImports(transpile("src/components/ui/globe-mark.tsx")) +
  "\n" +
  stripLocalImports(transpile("src/components/ui/thinking-indicator.tsx"));
// Both files already `export function`, so the bundle needs no re-export.
// Written to a real file rather than a data: URL: a syntax error in a
// data: URL prints the entire base64 blob as the error location, which is
// how the first version of this produced a 12 KB stack trace.
const bundlePath = path.join(OUT, "globe-bundle.mjs");
writeFileSync(bundlePath, bundle);
const { GlobeMark, ThinkingIndicator } = await import(pathToFileURL(bundlePath).href);
const { renderToStaticMarkup } = await import("react-dom/server");
const React = (await import("react")).default;

const CSS = readFileSync("src/app/globals.css", "utf8");
const cssBlock = CSS.slice(CSS.indexOf("/* THE GLOBE MARK"), CSS.indexOf("/* END GlobeMark */"));
ok("the globe CSS block was found in globals.css", cssBlock.length > 200);

// The theme variables the block depends on, taken from globals.css itself
// rather than restated — a copy here would let the test pass against
// values the app does not use.
function themeBlock(selector) {
  const re = new RegExp(`^${selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\{`, "m");
  const m = CSS.match(re);
  if (!m) throw new Error(`No "${selector} {" rule in globals.css — the theme block moved or was renamed`);
  const open = CSS.indexOf("{", m.index);
  return CSS.slice(open + 1, CSS.indexOf("\n}", open));
}
const DARK_VARS = themeBlock(":root");
const LIGHT_VARS = themeBlock('[data-theme="light"]');

const MARKUP = renderToStaticMarkup(
  React.createElement(
    "div",
    null,
    React.createElement("div", { id: "spinning" }, React.createElement(GlobeMark, { size: 26, spin: true })),
    React.createElement("div", { id: "still" }, React.createElement(GlobeMark, { size: 40 })),
    React.createElement("div", { id: "full" }, React.createElement(GlobeMark, { size: 80, detail: "full" })),
    React.createElement("div", { id: "indicator" }, React.createElement(ThinkingIndicator, { label: "Working" })),
    // The two sizes the ThinkingIndicator actually ships, rendered STILL so
    // the node can be hit-tested without chasing a moving target. `sm` is
    // 18px inside the Ask button; `md` is 26px beside body copy. These are
    // the most-seen instances of the mark in the product.
    React.createElement("div", { id: "sm" }, React.createElement(GlobeMark, { size: 18 })),
    React.createElement("div", { id: "md" }, React.createElement(GlobeMark, { size: 26 })),
    // THE ACCENT-ON-ACCENT CASE, which is in here because it already
    // happened once: the `sm` indicator sits inside the orange "Ask"
    // button, and drawn in the accent colour it was orange on orange and
    // simply was not there. Sixteen call sites now choose `inherit` or
    // `accent` from the surface they sit on, and that choice is a source
    // -level judgement until something measures the pixels. This is that.
    React.createElement(
      "button",
      { id: "on-accent", style: { background: "#f97316", color: "#000", border: 0, padding: "10px" } },
      React.createElement(ThinkingIndicator, { size: "sm", tone: "inherit" })
    ),
    // And the mistake it guards against, rendered deliberately so the
    // threshold below is known to be able to reject something.
    React.createElement(
      "button",
      { id: "on-accent-wrong", style: { background: "#f97316", color: "#000", border: 0, padding: "10px" } },
      React.createElement(ThinkingIndicator, { size: "sm" })
    )
  )
);
ok("the component server-renders to an <svg>", /<svg/.test(MARKUP), MARKUP.slice(0, 200));

function page(theme) {
  return `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><style>
:root{${DARK_VARS}}
[data-theme="light"]{${LIGHT_VARS}}
body{margin:0;padding:24px;background:rgb(var(--background));color:rgb(var(--foreground));font-family:system-ui}
#spinning,#still,#full,#indicator{padding:12px}
${cssBlock}
</style></head><body data-theme-holder>${MARKUP}</body></html>`
    .replace("<html>", `<html data-theme="${theme}">`);
}

const ROUTES = new Map([
  ["/dark", page("dark")],
  ["/light", page("light")],
]);
const server = createServer((req, res) => {
  const body = ROUTES.get((req.url || "").split("?")[0]);
  if (!body) {
    res.writeHead(404).end("no");
    return;
  }
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(body);
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}`;

const proxyServer = process.env.HTTPS_PROXY || process.env.https_proxy || null;
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium",
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--ssl-version-max=tls1.2"],
  ...(proxyServer ? { proxy: { server: proxyServer, bypass: "127.0.0.1,localhost" } } : {}),
});

const lin = (c) => {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
};
const lum = (r, g, b) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
const ratio = (a, b) => {
  const la = lum(...a), lb = lum(...b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
};

// What the page actually painted, as pixels. The stroke is thin, so the
// measurement takes the pixel FURTHEST from the background rather than an
// average — averaging a 1px stroke over its antialiasing reports the
// background.
async function measure(page, selector) {
  const box = await page.locator(selector).boundingBox();
  const shot = await page.screenshot({ clip: box });
  const sharp = (await import("sharp")).default;
  const { data, info } = await sharp(shot).raw().toBuffer({ resolveWithObject: true });
  const counts = new Map();
  for (let i = 0; i < data.length; i += info.channels) {
    const key = `${data[i]},${data[i + 1]},${data[i + 2]}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const background = sorted[0][0].split(",").map(Number);
  let best = background;
  let bestRatio = 1;
  for (const [key, n] of sorted) {
    if (n < 3) continue; // ignore stray antialiasing artefacts
    const px = key.split(",").map(Number);
    const r = ratio(px, background);
    if (r > bestRatio) {
      bestRatio = r;
      best = px;
    }
  }
  return { background, ink: best, ratio: Math.round(bestRatio * 100) / 100 };
}

for (const theme of ["dark", "light"]) {
  console.log(`\n== ${theme} ==`);
  const ctx = await browser.newContext({ viewport: { width: 1000, height: 700 } });
  const page = await ctx.newPage();
  await page.goto(`${base}/${theme}`, { waitUntil: "networkidle" });
  await page.screenshot({ path: path.join(OUT, `globe-${theme}.png`) });

  // 1. PAINTED, not merely boxed.
  const painted = await page.evaluate(() => {
    const svg = document.querySelector("#still svg");
    const r = svg.getBoundingClientRect();
    // The sphere's stroke crosses the box's horizontal midline at its
    // left edge — 15% in from the left of the 100-unit viewBox is r=30
    // from centre 50, i.e. x=20.
    const x = r.left + r.width * 0.2;
    const y = r.top + r.height * 0.5;
    const top = document.elementFromPoint(x, y);
    return { hit: top ? top.tagName.toLowerCase() : null, inside: Boolean(top && svg.contains(top)) };
  });
  ok(`${theme}: the sphere's own stroke is the topmost thing at its own pixel`, painted.inside, JSON.stringify(painted));

  // 2. CONTRAST FROM PIXELS.
  const m = await measure(page, "#still");
  console.log(`        ink rgb(${m.ink}) on rgb(${m.background}) = ${m.ratio}:1`);
  ok(`${theme}: the mark clears 3:1 against the page (${m.ratio}:1)`, m.ratio >= 3, JSON.stringify(m));

  // 3. THE DETAIL THRESHOLD IS REAL.
  const detail = await page.evaluate(() => ({
    small: document.querySelector("#spinning .ionexa-globe")?.dataset.detail,
    large: document.querySelector("#full .ionexa-globe")?.dataset.detail,
    smallShapes: document.querySelectorAll("#spinning svg > *, #spinning svg g > *").length,
    largeShapes: document.querySelectorAll("#full svg > *, #full svg g > *").length,
  }));
  ok(`${theme}: 26px renders the mark, 80px renders the full globe`, detail.small === "mark" && detail.large === "full", JSON.stringify(detail));
  ok(`${theme}: and the full globe really has more shapes`, detail.largeShapes > detail.smallShapes, JSON.stringify(detail));

  // 4. THE INDICATOR ANNOUNCES ITSELF.
  const a11y = await page.evaluate(() => {
    const el = document.querySelector("#indicator .ionexa-globe");
    return { role: el?.getAttribute("role"), label: el?.getAttribute("aria-label"), hidden: el?.getAttribute("aria-hidden") };
  });
  ok(`${theme}: a labelled indicator is a status, not aria-hidden`, a11y.role === "status" && a11y.label === "Working" && a11y.hidden === null, JSON.stringify(a11y));
  const decorative = await page.evaluate(() => document.querySelector("#still .ionexa-globe")?.getAttribute("aria-hidden"));
  ok(`${theme}: an unlabelled one is hidden from screen readers`, decorative === "true", String(decorative));

  await ctx.close();
}

// =====================================================================
console.log("\n== 375px ==");
{
  const ctx = await browser.newContext({ viewport: { width: 375, height: 700 } });
  const page = await ctx.newPage();
  await page.goto(`${base}/dark`, { waitUntil: "networkidle" });
  await page.screenshot({ path: path.join(OUT, "globe-375.png") });
  const sizes = await page.evaluate(() =>
    [...document.querySelectorAll(".ionexa-globe svg")].map((s) => {
      const r = s.getBoundingClientRect();
      return { w: Math.round(r.width), h: Math.round(r.height) };
    })
  );
  console.log(`        rendered sizes: ${JSON.stringify(sizes)}`);
  // An inline SVG does not shrink with the viewport, so these must be the
  // same numbers the component asked for. A globe that reflowed to 6px on
  // a phone would be the "collapses into a smudge" failure the old
  // indicator's comment wrongly claimed.
  ok("every mark keeps its requested size at 375px", sizes.every((s) => s.w === s.h && s.w >= 18), JSON.stringify(sizes));
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  ok("and nothing overflows the viewport", !overflow);
  await ctx.close();
}

// =====================================================================
console.log("\n== the mark on an accent button ==");
{
  const ctx = await browser.newContext({ viewport: { width: 800, height: 900 }, reducedMotion: "reduce" });
  const page = await ctx.newPage();
  await page.goto(`${base}/dark`, { waitUntil: "networkidle" });
  const right = await measure(page, "#on-accent");
  const wrong = await measure(page, "#on-accent-wrong");
  console.log(`        tone="inherit": ink rgb(${right.ink}) on rgb(${right.background}) = ${right.ratio}:1`);
  console.log(`        tone="accent" : ink rgb(${wrong.ink}) on rgb(${wrong.background}) = ${wrong.ratio}:1`);
  ok(`tone="inherit" clears 3:1 on the accent button (${right.ratio}:1)`, right.ratio >= 3, JSON.stringify(right));
  // THE INSTRUMENT HAS TO BE ABLE TO SAY NO. If the accent-coloured mark
  // also passed here, this measurement would be proving nothing about
  // either one.
  ok(`and the accent-coloured mark does NOT (${wrong.ratio}:1)`, wrong.ratio < 3, JSON.stringify(wrong));
  await page.screenshot({ path: path.join(OUT, "globe-on-accent.png") });
  await ctx.close();
}

// =====================================================================
// IS THE NODE BIG ENOUGH TO SEE — at the sizes that actually ship?
//
// THIS IS THE 16px SMUDGE, A SECOND TIME. That defect was found by
// rendering the favicon, and it was fixed in globe-svg.ts by scaling the
// node up at small sizes. The fix was PARTIAL: the React component never
// got it. So the generated icons were correct and the component — which
// renders the mark at 18px and 26px, the two most-seen instances in the
// product — drew the node at its raw radius. 4.29 units of a 100-unit box
// at 26px is a 2.2px dot, and at 18px a 1.5px one.
//
// It is measured by HIT-TESTING outward from the node's centre until the
// document stops answering "node", so what is measured is PAINTED extent,
// not a box. The threshold is 3px across: below that a dot on top of a
// 1px ring stroke is not a bead, it is antialiasing.
console.log("\n== the node is visible at shipping sizes ==");
{
  // reducedMotion so nothing is mid-sweep while the scan walks outward.
  const ctx = await browser.newContext({ viewport: { width: 800, height: 900 }, reducedMotion: "reduce" });
  const page = await ctx.newPage();
  await page.goto(`${base}/dark`, { waitUntil: "networkidle" });
  const dots = await page.evaluate(() => {
    const scan = (sel) => {
      const n = document.querySelector(`${sel} .globe-node`);
      const r = n.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      if (document.elementFromPoint(Math.round(cx), Math.round(cy)) !== n) return { sel, painted: 0 };
      // Walk out in quarter-pixel steps; the last offset still answering
      // "node" is the painted radius.
      let out = 0;
      for (let d = 0; d <= 20; d += 0.25) {
        if (document.elementFromPoint(Math.round(cx + d), Math.round(cy)) === n) out = d;
        else break;
      }
      let back = 0;
      for (let d = 0; d <= 20; d += 0.25) {
        if (document.elementFromPoint(Math.round(cx - d), Math.round(cy)) === n) back = d;
        else break;
      }
      return { sel, painted: +(out + back + 1).toFixed(2) };
    };
    return ["#sm", "#md", "#still", "#full"].map(scan);
  });
  for (const d of dots) console.log(`        ${d.sel.padEnd(7)} node painted ${d.painted}px across`);
  const MIN = 3;
  for (const d of dots) {
    ok(`${d.sel}: the node is at least ${MIN}px across (${d.painted}px)`, d.painted >= MIN, JSON.stringify(dots));
  }
  await ctx.close();
}

// =====================================================================
// DOES THE NODE ACTUALLY TRAVEL?
//
// Everything else here proves the mark is PAINTED and that the animation
// is DECLARED. Neither is a claim that anything moves. The node is the
// only part of the drawing whose motion a person can read — the sphere
// and its bands are rotationally symmetric, so they would look identical
// spinning or stopped, which is exactly why they are excluded from the
// rotating group.
//
// This is measured by HIT-TESTING, not by reading a transform matrix: find
// the pixel the node is painted on, wait a quarter of the 3.2s period,
// and ask the document what is painted on that same pixel now. If the
// node is still the answer, it did not go anywhere.
console.log("\n== the node travels ==");
{
  const ctx = await browser.newContext({ viewport: { width: 800, height: 600 } });
  const page = await ctx.newPage();
  await page.goto(`${base}/dark`, { waitUntil: "networkidle" });

  const travel = await page.evaluate(async () => {
    const sample = (sel) => {
      const n = document.querySelector(`${sel} .globe-node`);
      const r = n.getBoundingClientRect();
      // The node is a filled circle, so its box centre IS a painted pixel.
      // It is used only to FIND a pixel; every assertion below is a
      // hit-test on that pixel, never on the box.
      const x = Math.round(r.left + r.width / 2);
      const y = Math.round(r.top + r.height / 2);
      return { x, y, hitIsNode: document.elementFromPoint(x, y) === n };
    };
    const spinStart = sample("#spinning");
    const stillStart = sample("#still");
    // A quarter of the 3.2s period. The node orbits 30 viewBox units from
    // the centre and is 4.29 units across, so a quarter turn moves it
    // many times its own width — far outside rounding.
    await new Promise((r) => setTimeout(r, 800));
    const spinNow = document.elementFromPoint(spinStart.x, spinStart.y);
    const stillNow = document.elementFromPoint(stillStart.x, stillStart.y);
    return {
      spinStart,
      stillStart,
      spinLeft: spinNow !== document.querySelector("#spinning .globe-node"),
      stillStayed: stillNow === document.querySelector("#still .globe-node"),
    };
  });

  console.log(`        spinning node started at (${travel.spinStart.x}, ${travel.spinStart.y})`);
  ok("the node is painted where it is measured, before anything moves", travel.spinStart.hitIsNode && travel.stillStart.hitIsNode, JSON.stringify(travel));
  ok("a spinning node has left that pixel 800ms later", travel.spinLeft, JSON.stringify(travel));
  // The other half of the claim: motion is opt-in. A mark rendered
  // without `spin` must be a still drawing, not a slower one.
  ok("and a mark without `spin` has not moved at all", travel.stillStayed, JSON.stringify(travel));
  await ctx.close();
}

// =====================================================================
console.log("\n== reduced motion ==");
{
  const ctx = await browser.newContext({ viewport: { width: 800, height: 600 }, reducedMotion: "reduce" });
  const page = await ctx.newPage();
  await page.goto(`${base}/dark`, { waitUntil: "networkidle" });
  await page.waitForTimeout(600);
  const state = await page.evaluate(() => {
    const g = document.querySelector("#spinning .globe-orbit-group");
    const cs = getComputedStyle(g);
    return { animationName: cs.animationName, transform: cs.transform };
  });
  ok("the spin is off", state.animationName === "none", JSON.stringify(state));
  // THE PART THAT GETS SKIPPED. Zeroing the duration freezes the rotation
  // at whatever angle it reached; the orbit is drawn at -20deg on purpose,
  // so it has to be returned there, which means no transform at all.
  ok("and the orbit sits at its drawn angle, not frozen mid-sweep", state.transform === "none", JSON.stringify(state));
  await page.screenshot({ path: path.join(OUT, "globe-reduced-motion.png") });
  await ctx.close();
}

// =====================================================================
console.log("\n== frame rate while spinning ==");
{
  const ctx = await browser.newContext({ viewport: { width: 800, height: 600 } });
  const page = await ctx.newPage();
  await page.goto(`${base}/dark`, { waitUntil: "networkidle" });
  const fps = await page.evaluate(
    () =>
      new Promise((resolve) => {
        let frames = 0;
        const start = performance.now();
        const tick = () => {
          frames += 1;
          if (performance.now() - start < 1200) requestAnimationFrame(tick);
          else resolve(Math.round((frames / (performance.now() - start)) * 1000));
        };
        requestAnimationFrame(tick);
      })
  );
  console.log(`        ${fps} fps with four marks on the page`);
  // Headless Chromium's rAF is not a phone, so this is a floor that
  // catches a collapse, not a promise about a device. The brief's own
  // threshold is 50.
  ok(`the spin holds above 50 fps (${fps})`, fps >= 50, `${fps} fps`);
  await ctx.close();
}

await browser.close();
server.close();
console.log(`\nscreenshots -> ${OUT}`);
console.log(`${pass} passed, ${failures.length} failed`);
process.exit(failures.length === 0 ? 0 : 1);
