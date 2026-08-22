// THE LIGHT THEME, IN A BROWSER, MEASURED IN PIXELS.
//
// light-theme-contrast.test.mjs computes ratios from the token values and
// scans the stylesheet's text. Neither is a claim about what a person
// sees, and this codebase has been caught by that gap twice: an
// attribution present in the markup with zero visible pixels, and a
// border token that measured fine and rendered at 1.19:1.
//
// So this loads the COMPILED stylesheet — the one `next build` emits and
// production serves, not globals.css, which still has @tailwind
// directives in it — and asks three things the source cannot answer:
//
//   1. Does any element still PAINT a coloured glow in light? Read from
//      getComputedStyle, so a glow arriving through a variable, an
//      @apply, or a rule the text scanner never parsed is still caught.
//   2. Does the focus ring reach 3:1 against what it sits on, in BOTH
//      themes, taken from SCREENSHOT PIXELS rather than from its token?
//   3. Are the borders actually visible — measured at the border pixel
//      itself, not from the box.
//
// Run: node scripts/tests/light-theme.prodtest.mjs
import { chromium } from "playwright";
import { createServer } from "node:http";
import { readFileSync, readdirSync, mkdirSync } from "node:fs";
import path from "node:path";

let pass = 0;
const failures = [];
const ok = (name, cond, detail = "") => {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { failures.push(name); console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ""}`); }
};

const OUT = path.resolve("prod-audit/light-theme");
mkdirSync(OUT, { recursive: true });

// The BUILT stylesheet, largest wins — the app's own CSS rather than a
// route-specific chunk. Reading globals.css here would test something the
// browser never receives.
const CSS_DIR = ".next/static/css";
const cssFile = readdirSync(CSS_DIR)
  .filter((f) => f.endsWith(".css"))
  .map((f) => ({ f, size: readFileSync(path.join(CSS_DIR, f)).length }))
  .sort((a, b) => b.size - a.size)[0];
if (!cssFile) throw new Error(`no compiled CSS in ${CSS_DIR} — run \`next build\` first`);
const CSS = readFileSync(path.join(CSS_DIR, cssFile.f), "utf8");
console.log(`stylesheet: ${cssFile.f} (${cssFile.size} B)`);
ok("the compiled stylesheet carries the theme variables", /--accent-border:/.test(CSS));

// Real classes from real components, not invented ones. Each is here
// because it carries an elevation, a border or a focus state.
const SPECIMENS = [
  ["glass-card", `<div class="glass-card" style="padding:24px">glass-card</div>`],
  ["glass-card-hover", `<div class="glass-card" id="hoverme" style="padding:24px">glass-card :hover</div>`],
  ["card-lift", `<div class="card-lift" style="padding:24px">card-lift</div>`],
  ["cta-amber", `<button class="cta-amber" style="padding:12px 20px">cta-amber</button>`],
  ["prompt-glow", `<div class="prompt-glow" style="padding:24px">prompt-glow</div>`],
  ["celebration-ring", `<div class="celebration-ring" style="padding:24px">celebration-ring</div>`],
  ["focus-glow", `<input class="focus-glow" id="ring" value="focus me" style="padding:10px">`],
  ["bordered", `<div class="border border-border bg-panel" id="bordered" style="padding:24px">border-border on bg-panel</div>`],
  ["bordered-bg", `<div class="border border-border bg-background" id="bordered-bg" style="padding:24px">border-border on bg-background</div>`],
];

const page = (theme) => `<!doctype html><html data-theme="${theme}"><head><meta charset="utf-8">
<style>${CSS}</style>
<style>body{margin:0;padding:32px;display:flex;flex-direction:column;gap:28px;
background:rgb(var(--background));color:rgb(var(--foreground));font-family:system-ui}</style>
</head><body>${SPECIMENS.map(([id, html]) => `<div data-specimen="${id}">${html}</div>`).join("")}</body></html>`;

const ROUTES = new Map([["/light", page("light")], ["/dark", page("dark")]]);
const server = createServer((req, res) => {
  const body = ROUTES.get((req.url || "").split("?")[0]);
  if (!body) return void res.writeHead(404).end("no");
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

const lin = (c) => { const s = c / 255; return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); };
const lum = (r, g, b) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
const ratio = (a, b) => {
  const la = lum(...a), lb = lum(...b);
  return +(((Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)).toFixed(2));
};

// =====================================================================
console.log("\n== 1. does anything still PAINT a coloured glow in light? ==");
{
  const ctx = await browser.newContext({ viewport: { width: 900, height: 1100 } });
  const p = await ctx.newPage();
  await p.goto(`${base}/light`, { waitUntil: "networkidle" });
  await p.hover("#hoverme");
  await p.waitForTimeout(400);
  // COMPUTED, not parsed. A glow reaching the element through a variable,
  // an @apply, or a selector the text scanner never understood is still
  // in the computed value — which is the whole reason this runs.
  const shadows = await p.evaluate(() =>
    [...document.querySelectorAll("[data-specimen] > *")].map((el) => ({
      id: el.parentElement.dataset.specimen,
      shadow: getComputedStyle(el).boxShadow,
    }))
  );
  // "Coloured" means a hue with a real chroma, not a neutral grey/slate,
  // and the smudge is specifically a WIDE spread. A tinted shadow with a
  // small blur is the light theme's intended replacement, not the defect:
  // measured, the dark glows run 18-44px of blur at 0.45-0.75 alpha while
  // the light substitutes top out at 14.8px at 0.42. The threshold sits
  // between those two populations rather than at a number picked by feel.
  const WIDE_BLUR_PX = 20;
  //
  // THE BLUR PARSE WAS WRONG THE FIRST TIME and it matters, so it is
  // written down: `/(\d+)px/g` against "0px 5.60059px 14.8018px -3px"
  // returns ["0px","60059px","8018px"] — \d+ cannot cross a decimal
  // point, so it read the FRACTION of the offset as the blur and called
  // a 14.8px shadow 60059px wide. Every animated shadow in this file has
  // fractional values mid-tween, so this hit on the first run.
  const layers = (shadow) =>
    [...shadow.matchAll(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)([^,]*)/g)].map((m) => {
      const [r, g, b] = [+m[1], +m[2], +m[3]];
      const lengths = ((m[5] || "").match(/-?[\d.]+px/g) || []).map(parseFloat);
      return {
        chroma: Math.max(r, g, b) - Math.min(r, g, b),
        alpha: m[4] === undefined ? 1 : +m[4],
        blur: lengths[2] ?? 0,
        spread: lengths[3] ?? 0,
      };
    });
  const isSmudge = (l) => l.chroma > 60 && l.alpha >= 0.25 && l.blur >= WIDE_BLUR_PX;
  const offenders = shadows.filter(({ shadow }) => layers(shadow).some(isSmudge));
  for (const s of shadows) console.log(`        ${s.id.padEnd(18)} ${s.shadow.slice(0, 96)}`);
  ok("no light specimen paints a wide coloured glow", offenders.length === 0,
    offenders.map((o) => `${o.id}: ${o.shadow}`).join("\n        "));
  // The instrument has to be able to say yes as well as no.
  ok("shadows were actually read (the measurement is not empty)",
    shadows.filter((s) => s.shadow && s.shadow !== "none").length >= 5,
    JSON.stringify(shadows.map((s) => s.id)));
  // AND IT HAS TO FIRE ON A REAL ONE. The same specimens in DARK still
  // carry the wide orange glows this theme is built on, so if the
  // detector finds nothing there it is measuring nothing anywhere and
  // the light result above means nothing either.
  const dctx = await browser.newContext({ viewport: { width: 900, height: 1100 } });
  const dp = await dctx.newPage();
  await dp.goto(`${base}/dark`, { waitUntil: "networkidle" });
  await dp.hover("#hoverme");
  await dp.waitForTimeout(400);
  const darkShadows = await dp.evaluate(() =>
    [...document.querySelectorAll("[data-specimen] > *")].map((el) => ({
      id: el.parentElement.dataset.specimen,
      shadow: getComputedStyle(el).boxShadow,
    }))
  );
  const darkGlows = darkShadows.filter(({ shadow }) => layers(shadow).some(isSmudge));
  console.log(`        detector fires on ${darkGlows.length} dark specimen(s): ${darkGlows.map((d) => d.id).join(", ")}`);
  ok("the detector fires on the dark glows it is built to find", darkGlows.length >= 1,
    darkShadows.map((d) => `${d.id}: ${d.shadow}`).join("\n        "));
  await dctx.close();
  await p.screenshot({ path: path.join(OUT, "light-specimens.png"), fullPage: true });
  await ctx.close();
}

// =====================================================================
console.log("\n== 2. the focus ring, from screenshot pixels ==");
// SAMPLE THE RING, NOT THE BOX IT SURROUNDS. The first version clipped
// the element plus a 6px margin and took the pixel furthest from the
// surface — which in light was rgb(24,24,27), the input's own TEXT at
// 16.55:1. It reported a passing focus ring while never looking at the
// ring. `.focus-glow` paints `0 0 0 2px` OUTSIDE the border box, so the
// only honest sample is a thin band in that margin, with the element's
// interior excluded entirely.
async function inkAt(p, selector, surface) {
  const box = await p.locator(selector).boundingBox();
  // A 3px band immediately above the element: ring pixels and page
  // background, nothing else.
  const clip = { x: box.x, y: Math.max(0, box.y - 3), width: Math.max(1, box.width), height: 3 };
  const shot = await p.screenshot({ clip });
  const sharp = (await import("sharp")).default;
  const { data, info } = await sharp(shot).raw().toBuffer({ resolveWithObject: true });
  const counts = new Map();
  for (let i = 0; i < data.length; i += info.channels) {
    const k = `${data[i]},${data[i + 1]},${data[i + 2]}`;
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  let best = surface, bestR = 1;
  for (const [k, n] of counts) {
    if (n < 3) continue;
    const px = k.split(",").map(Number);
    const r = ratio(px, surface);
    if (r > bestR) { bestR = r; best = px; }
  }
  return { ink: best, ratio: bestR };
}

for (const theme of ["light", "dark"]) {
  const ctx = await browser.newContext({ viewport: { width: 900, height: 1100 } });
  const p = await ctx.newPage();
  await p.goto(`${base}/${theme}`, { waitUntil: "networkidle" });
  const surface = await p.evaluate(() => {
    const m = getComputedStyle(document.body).backgroundColor.match(/\d+/g);
    return m.slice(0, 3).map(Number);
  });
  await p.focus("#ring");
  await p.waitForTimeout(300);
  const m = await inkAt(p, "#ring", surface);
  console.log(`        ${theme}: ring rgb(${m.ink}) on rgb(${surface}) = ${m.ratio}:1`);
  ok(`${theme}: the focus ring clears 3:1 (${m.ratio}:1)`, m.ratio >= 3, JSON.stringify(m));
  // THE RING IS ONE LAYER, NOT THE WHOLE DECLARATION, and the first
  // version of this assertion missed that. `.focus-glow:focus` paints
  // `0 0 0 2px rgb(var(--accent-border))` — the ring — and behind it in
  // dark only, `0 0 22px -4px rgba(249,115,22,.45)` — a halo. Demanding
  // every layer be opaque failed the halo, which is decoration; what
  // WCAG 1.4.11 is about is the indicator itself. The ring is the layer
  // with no blur and a positive spread, so that is the one checked.
  const ring = await p.evaluate(() => {
    const cs = getComputedStyle(document.querySelector("#ring"));
    return { outlineColor: cs.outlineColor, outlineWidth: cs.outlineWidth, shadow: cs.boxShadow };
  });
  const ringLayer = [...ring.shadow.matchAll(/(rgba?\([^)]*\))([^,]*)/g)]
    .map((m) => ({ colour: m[1], lengths: ((m[2] || "").match(/-?[\d.]+px/g) || []).map(parseFloat) }))
    .find((l) => (l.lengths[2] ?? 0) === 0 && (l.lengths[3] ?? 0) > 0);
  ok(`${theme}: a solid ring layer exists (no blur, positive spread)`, Boolean(ringLayer), ring.shadow);
  ok(`${theme}: that ring layer is fully opaque`,
    Boolean(ringLayer) && !/rgba\([^)]*,\s*0?\.\d+\s*\)/.test(ringLayer.colour),
    JSON.stringify({ ring: ringLayer?.colour, full: ring.shadow }));
  await p.screenshot({ path: path.join(OUT, `focus-${theme}.png`) });
  await ctx.close();
}

// =====================================================================
console.log("\n== 3. are the borders visible — at the border pixel ==");
for (const theme of ["light", "dark"]) {
  const ctx = await browser.newContext({ viewport: { width: 900, height: 1100 } });
  const p = await ctx.newPage();
  await p.goto(`${base}/${theme}`, { waitUntil: "networkidle" });
  for (const id of ["bordered", "bordered-bg"]) {
    // SAMPLE THE BORDER ITSELF. The top edge, one pixel in — a
    // getBoundingClientRect check is true of an invisible border.
    const probe = await p.evaluate((sel) => {
      const el = document.querySelector(`#${sel}`);
      const r = el.getBoundingClientRect();
      return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top), fill: getComputedStyle(el).backgroundColor };
    }, id);
    const shot = await p.screenshot({ clip: { x: probe.x - 2, y: probe.y - 1, width: 4, height: 3 } });
    const sharp = (await import("sharp")).default;
    const { data, info } = await sharp(shot).raw().toBuffer({ resolveWithObject: true });
    const fill = probe.fill.match(/\d+/g).slice(0, 3).map(Number);
    let best = fill, bestR = 1;
    for (let i = 0; i < data.length; i += info.channels) {
      const px = [data[i], data[i + 1], data[i + 2]];
      const r = ratio(px, fill);
      if (r > bestR) { bestR = r; best = px; }
    }
    console.log(`        ${theme} ${id}: border rgb(${best}) on fill rgb(${fill}) = ${bestR}:1`);
    ok(`${theme} ${id}: the border is visible against its own fill (${bestR}:1)`, bestR >= 1.5,
      `a border that cannot be told from the box it outlines is not a border`);
  }
  await ctx.close();
}

await browser.close();
server.close();
console.log(`\nscreenshots -> ${OUT}`);
console.log(`${pass} passed, ${failures.length} failed`);
process.exit(failures.length === 0 ? 0 : 1);
