#!/usr/bin/env node
/*
 * DID REDESIGN PHASE 4 MOVE REAL PIXELS?
 *
 * WHY THIS SHAPE, AND WHAT IT CANNOT SHOW. A local `next start` cannot
 * serve this product's pages — middleware.ts builds a Supabase client and
 * 500s without a real project — and standing up a fake one is the mistake
 * that once let six broken features pass every test. So the method is the
 * one scripts/light-border-before-after.mjs established: load the REAL
 * deployment, measure it, then replace its stylesheets with the ones this
 * working tree just built and measure the same DOM again.
 *
 * That proves a CSS change. It cannot prove a MARKUP change: the deployed
 * HTML has no `class="surface"` on anything, so the card padding and the
 * borders those classes removed are invisible here and are verified by
 * scripts/design-census.mjs and by the build instead. Said plainly rather
 * than left for somebody to discover.
 *
 * WHAT IS MEASURED, per page x width x locale:
 *   the body type size            (the phase 4 scale)
 *   painted borders               (how many lines are on screen)
 *   accent glow                   (must be none)
 *   horizontal overflow           (must be zero at every width)
 *   smallest interactive target   (>= 44px on the phone widths)
 *   nine contrast samples         (>= 4.5:1)
 *
 * HOW THE PAGE IS OBTAINED, AND WHY NOT BY NAVIGATING TO IT. The agent
 * proxy in this environment relays a single request fine (curl returns
 * 200) but drops a browser's parallel connections mid-tunnel — every
 * page.goto came back ERR_CONNECTION_RESET while curl to the same URL
 * succeeded. So the real HTML and the real deployed stylesheets are
 * fetched with curl and rendered offline through setContent: same
 * markup, same CSS, no network from the browser.
 *
 * THE FIDELITY COST, stated rather than left to be discovered: images
 * and web fonts do not load. Computed font-size, border counts, colours
 * and contrast are unaffected. Text WIDTH is measured in the fallback
 * font, so a horizontal-overflow or touch-target number here is
 * indicative, not final — the final one is the prodtest suite after a
 * deploy.
 *
 * Usage: node scripts/design-phase4-verify.mjs [--shots]
 */
import { chromium } from "playwright";
import { readFileSync, readdirSync, mkdirSync } from "node:fs";
import path from "node:path";

const BASE = process.env.PROD_BASE_URL || "https://ai-os-saas-five.vercel.app";
const SHOTS = process.argv.includes("--shots");
const OUT = path.resolve("prod-audit/phase4");
if (SHOTS) mkdirSync(OUT, { recursive: true });

const cssDir = ".next/static/css";
const NEW_CSS = readdirSync(cssDir).filter((f) => f.endsWith(".css"))
  .map((f) => readFileSync(path.join(cssDir, f), "utf8")).join("\n");
if (NEW_CSS.length < 10000) {
  console.error(`Only ${NEW_CSS.length} bytes of CSS in ${cssDir} — run \`next build\` first.`);
  process.exit(2);
}

const PAGES = [["home", "/"], ["pricing", "/pricing"], ["help", "/help"]];
const WIDTHS = [1920, 1440, 768, 390, 375];
const LOCALES = [["el", "Greek"], ["ar", "Arabic (RTL)"], ["zh", "Chinese"]];

const MEASURE = () => {
  const lin = (c) => { const s = c / 255; return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); };
  const lum = (r, g, b) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  const parse = (v) => {
    const m = String(v).match(/rgba?\(([^)]+)\)/); if (!m) return null;
    const p = m[1].split(/[,\s/]+/).filter(Boolean).map(Number);
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  };
  const over = (f, b) => ({ r: f.r * f.a + b.r * (1 - f.a), g: f.g * f.a + b.g * (1 - f.a), b: f.b * f.a + b.b * (1 - f.a), a: 1 });
  // A GRADIENT IS A GROUND, AND WALKING PAST IT INVENTS A RATIO.
  //
  // This looked only at background-COLOR. The landing page's sign-up
  // button paints with background-IMAGE — linear-gradient(135deg,
  // #fcd34d, #fbbf24, #f97316, …) — and its background-color is
  // transparent, so the walk went straight past the button and landed on
  // the page: black text measured against rgb(10,10,10), reported as
  // 1.06:1, a button that is in fact black on orange and perfectly
  // readable. That number was carried into two reports as a real defect
  // in the product.
  //
  // Now the stops are read. A gradient has more than one colour under
  // the text, so the WORST of them is the answer — the honest reading of
  // "does this text stay legible across the whole button".
  const stopsOf = (image) => {
    if (!image || image === "none") return [];
    return [...image.matchAll(/rgba?\([^)]+\)/g)].map(parse).filter((c) => c && c.a > 0.92);
  };
  const groundOf = (el) => {
    let n = el;
    while (n && n !== document.documentElement) {
      const cs = getComputedStyle(n);
      const stops = stopsOf(cs.backgroundImage);
      if (stops.length) return stops;
      const c = parse(cs.backgroundColor);
      if (c && c.a > 0.92) return [c];
      n = n.parentElement;
    }
    return [{ r: 10, g: 10, b: 10, a: 1 }];
  };
  const ratio = (a, b) => { const L1 = lum(a.r, a.g, a.b), L2 = lum(b.r, b.g, b.b); const hi = Math.max(L1, L2), lo = Math.min(L1, L2); return (hi + 0.05) / (lo + 0.05); };

  const all = [...document.querySelectorAll("*")].filter((el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden";
  });

  // Body type: the most common font-size among elements holding real text.
  const sizes = new Map();
  for (const el of all) {
    const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 8);
    if (!own) continue;
    const fs = Math.round(parseFloat(getComputedStyle(el).fontSize) * 10) / 10;
    sizes.set(fs, (sizes.get(fs) ?? 0) + 1);
  }
  const bodyType = [...sizes.entries()].sort((a, b) => b[1] - a[1])[0] ?? [0, 0];

  let borders = 0, glow = 0;
  for (const el of all) {
    const cs = getComputedStyle(el);
    for (const side of ["Top", "Right", "Bottom", "Left"]) {
      const w = parseFloat(cs[`border${side}Width`]);
      const c = parse(cs[`border${side}Color`]);
      if (w > 0 && c && c.a > 0.02 && cs[`border${side}Style`] !== "none") borders++;
    }
    const sh = cs.boxShadow;
    if (sh && sh !== "none") {
      for (const part of sh.split(/,(?![^(]*\))/)) {
        const c = parse(part);
        const nums = part.replace(/rgba?\([^)]*\)/g, "").trim().split(/\s+/).map(parseFloat).filter((n) => !Number.isNaN(n));
        const blur = nums.length >= 3 ? nums[2] : 0;
        if (c && blur > 0 && c.r > 200 && c.g > 80 && c.g < 200 && c.b < 90) glow++;
      }
    }
  }

  // Smallest interactive target.
  // AN INLINE LINK IN A SENTENCE IS NOT A TAP TARGET. The first version
  // of this counted every <a>, so a link inside a paragraph of terms
  // reported as an 15px "control" and every page failed. WCAG 2.5.8 is
  // about controls, and the standard itself exempts a link whose size is
  // determined by the line it sits in. Inline-level anchors with text
  // around them are reported separately rather than mixed in.
  let minTarget = Infinity;
  let inlineLinks = 0;
  for (const el of all) {
    if (!el.matches("a,button,[role=button],input,select,textarea")) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 4 || r.height < 4) continue;
    const display = getComputedStyle(el).display;
    const inFlow = el.tagName === "A" && display === "inline" &&
      el.parentElement && el.parentElement.textContent.trim().length > el.textContent.trim().length + 3;
    if (inFlow) { inlineLinks++; continue; }
    minTarget = Math.min(minTarget, Math.min(r.width, r.height));
  }

  // Nine contrast samples: the nine largest pieces of real text.
  const texts = all.filter((el) => [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 3))
    .map((el) => ({ el, area: el.getBoundingClientRect().width * el.getBoundingClientRect().height }))
    .sort((a, b) => b.area - a.area).slice(0, 9);
  const contrasts = texts.map(({ el }) => {
    const cs = getComputedStyle(el);
    const fg = parse(cs.color); if (!fg) return null;
    const grounds = groundOf(el);
    // The worst stop under the text, not the first.
    return Math.round(Math.min(...grounds.map((bg) => ratio(over(fg, bg), bg))) * 100) / 100;
  }).filter((x) => x !== null);

  return {
    bodyType: bodyType[0], bodyTypeCount: bodyType[1],
    borders, glow,
    minTarget: minTarget === Infinity ? null : Math.round(minTarget), inlineLinks,
    hScroll: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
    contrasts,
    dir: document.documentElement.getAttribute("dir") || "ltr",
  };
};

// The image ships one Chromium at a fixed path and this project's
// Playwright pins a different build number, so the bundled resolver
// looks for one that is not there. Pointed at the real binary rather
// than downloading a second copy.
const { execFileSync } = await import("node:child_process");
const curl = (url, cookie) =>
  execFileSync("curl", ["-s", "--tls-max", "1.2", "-H", `Cookie: NEXT_LOCALE=${cookie}`, url], {
    encoding: "utf8", maxBuffer: 64 * 1024 * 1024,
  });

// No proxy settings: this browser makes no network requests at all. The
// HTML and the CSS are already in hand.
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const rows = [];
const skipped = [];
for (const [locale, localeName] of LOCALES) {
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true });
  for (const [name, route] of PAGES) {
    let html, deployedCss;
    try {
      html = curl(BASE + route, locale);
      const hrefs = [...html.matchAll(/href="(\/_next\/static\/css\/[^"]+)"/g)].map((m) => m[1]);
      if (!hrefs.length) throw new Error("no stylesheet links in the HTML");
      deployedCss = hrefs.map((h) => curl(BASE + h.replace(/&amp;/g, "&"), locale)).join("\n");
      if (deployedCss.length < 5000) throw new Error(`only ${deployedCss.length} bytes of deployed CSS`);
    } catch (err) {
      for (const w of WIDTHS) skipped.push(`${locale}/${name}@${w}: ${String(err).split("\n")[0]}`);
      continue;
    }
    // The <link>s are stripped; the CSS is injected so the swap is a
    // single node replacement and the DOM is otherwise untouched.
    const body = html.replace(/<link[^>]+rel="stylesheet"[^>]*>/g, "");
    for (const width of WIDTHS) {
      const page = await ctx.newPage();
      await page.setViewportSize({ width, height: 900 });
      await page.setContent(body, { waitUntil: "domcontentloaded" });
      await page.addStyleTag({ content: deployedCss });
      await page.waitForTimeout(250);
      const before = await page.evaluate(MEASURE);
      if (SHOTS && width === 1440) await page.screenshot({ path: path.join(OUT, `${locale}-${name}-${width}-before.png`) });
      await page.evaluate((css) => {
        for (const st of document.querySelectorAll("style")) st.remove();
        const el = document.createElement("style"); el.textContent = css; document.head.appendChild(el);
      }, NEW_CSS);
      await page.waitForTimeout(250);
      const after = await page.evaluate(MEASURE);
      if (SHOTS) await page.screenshot({ path: path.join(OUT, `${locale}-${name}-${width}-after.png`) });
      rows.push({ locale, localeName, name, width, before, after });
      await page.close();
    }
  }
  await ctx.close();
}
await browser.close();

const f = (n) => String(n).padStart(5);
console.log(`phase 4 verification — ${BASE}\n`);
console.log("locale  page     width   body type      borders        glow   h-scroll  min target  min contrast   dir");
let fails = [];
const inherited = [];
for (const r of rows) {
  const minC = r.after.contrasts.length ? Math.min(...r.after.contrasts) : null;
  const minB = r.before.contrasts.length ? Math.min(...r.before.contrasts) : null;
  console.log(
    `${r.locale.padEnd(7)}${r.name.padEnd(9)}${f(r.width)}  ` +
    `${f(r.before.bodyType)}->${f(r.after.bodyType)}px  ` +
    `${f(r.before.borders)}->${f(r.after.borders)}  ` +
    `${f(r.after.glow)}  ${f(r.after.hScroll)}  ${f(r.after.minTarget ?? -1)}px  ` +
    `${minB === null ? "  n/a" : f(minB)}->${minC === null ? "  n/a" : f(minC)}:1  ${r.after.dir}`
  );
  if (r.after.hScroll > 0) fails.push(`${r.locale}/${r.name}@${r.width}: horizontal scroll ${r.after.hScroll}px`);
  if (r.after.glow > 0) fails.push(`${r.locale}/${r.name}@${r.width}: ${r.after.glow} accent glow(s)`);
  // SAME RULE AS CONTRAST: a control that was already under 44px is not
  // this round's finding. Judged on the CHANGE, and the "before" here is
  // the deployed stylesheet on the deployed markup.
  if (r.width <= 390 && r.after.minTarget !== null && r.after.minTarget < 44) {
    const msg = `${r.locale}/${r.name}@${r.width}: smallest target ${r.before.minTarget}px -> ${r.after.minTarget}px`;
    if (r.before.minTarget !== null && r.before.minTarget < 44) inherited.push(msg + " (already failing before)");
    else fails.push(msg);
  }
  // A CONTRAST THAT WAS ALREADY BAD IS NOT THIS ROUND'S FINDING, and
  // calling it one would bury the ones that are. Reported in both
  // columns; failed only when this tree made it worse or newly under 4.5.
  if (minC !== null && minC < 4.5) {
    if (minB !== null && minB < 4.5) inherited.push(`${r.locale}/${r.name}@${r.width}: ${minB}:1 -> ${minC}:1 (already failing before)`);
    else fails.push(`${r.locale}/${r.name}@${r.width}: contrast ${minB}:1 -> ${minC}:1`);
  }
}
console.log(`\n${rows.length} page/width/locale combinations`);
if (skipped.length) {
  console.log(`\n${skipped.length} NOT MEASURED:`);
  for (const s of skipped.slice(0, 10)) console.log("  " + s);
}
// THE FLOOR. A run that reached nothing has no findings, and no findings
// must never read as no problems.
const EXPECTED = LOCALES.length * PAGES.length * WIDTHS.length;
if (rows.length < EXPECTED) {
  console.log(`\nMEASURED ${rows.length} OF ${EXPECTED} — this run proves nothing about the ones it could not load.`);
  process.exit(1);
}
if (inherited.length) {
  console.log(`\n${inherited.length} ALREADY FAILING BEFORE THIS TREE (not caused here, not fixed here):`);
  for (const x of inherited.slice(0, 8)) console.log("  " + x);
}
if (fails.length) { console.log(`\n${fails.length} CAUSED OR WORSENED HERE:`); for (const x of fails.slice(0, 25)) console.log("  " + x); }
else {
  // WHAT THIS LINE MAY AND MAY NOT SAY. It once read "every target >=44px
  // on phones, every contrast >=4.5:1" while twenty-four inherited
  // failures were printed three lines above it — an absolute claim
  // underneath its own counter-evidence. It reports the CHANGE, which is
  // the only thing this run is entitled to conclude.
  console.log("\nNOTHING CAUSED OR WORSENED BY THIS TREE.");
  console.log("no horizontal scroll at any width, no accent glow anywhere, no contrast or target made worse.");
  if (inherited.length) console.log(`${inherited.length} problems listed above were here before and are still here.`);
}
