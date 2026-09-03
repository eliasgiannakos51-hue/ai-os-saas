#!/usr/bin/env node
/*
 * DOES THE MARK ACTUALLY TURN AT 60fps?
 *
 * V4 re-audit #1 asks it directly, and until now nothing measured it.
 * globe-mark.test.mjs proves the CAUSE — one selector animates, only the
 * orbit group, only by `transform`, with an explicit origin, no runtime
 * filter, no property that costs layout. Every one of those is a reason
 * to EXPECT 60fps. None of them is 60fps.
 *
 * ------------------------------------------------------------------
 * WHAT THIS MEASURES, AND WHAT IT DOES NOT
 * ------------------------------------------------------------------
 *
 * It renders the real mark — the geometry from lib/brand/globe.ts and
 * the real @keyframes lifted out of globals.css, not a hand-copied
 * approximation — many times over, in the real Chromium, and counts
 * requestAnimationFrame intervals for two seconds.
 *
 * That is the PAGE'S frame budget while the mark animates. It is not a
 * proof that the rotation runs on the compositor thread: a transform
 * animation that had been demoted to the main thread would still show
 * ~16.7ms intervals on a page with nothing else to do. Saying so is the
 * point — a green number here means "the mark does not cost the main
 * thread frames", which is the claim worth making, and not "the GPU is
 * handling it", which this cannot see.
 *
 * THE STRESS COUNT IS WHY IT IS WORTH RUNNING. One spinning SVG is
 * cheap enough that almost any implementation passes. THIRTY-SIX of them
 * is the shape of a real screen mid-work — a list where every row is
 * thinking — and it is where a per-frame layout or a filter would show.
 *
 * NO SERVER, NO BUILD. The mark is self-contained: an inline SVG and one
 * keyframe block. Standing up the whole app to measure it would add a
 * Supabase dependency to a question that has nothing to do with one.
 *
 * Run: node scripts/tests/globe-frames.prodtest.mjs
 */
import { readFileSync, existsSync } from "node:fs";
import { chromium } from "playwright";
import { chromiumPath } from "./lib/chromium.mjs";

let pass = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { failures.push(name); console.log(`  FAIL  ${name}${detail ? "\n        " + detail : ""}`); }
}

const COPIES = 36;
const SAMPLE_MS = 2000;
// 60fps is 16.67ms. The ceiling is the interval at the 95th percentile,
// not the mean: a mean hides a stall, and a stall is what a reader sees.
// 20ms is 50fps — one frame's slack over the target, which is the amount
// a headless browser's own scheduling noise is worth.
const P95_CEILING_MS = 20;

// ---------------------------------------------------------------------
// The real CSS, extracted rather than retyped.
// ---------------------------------------------------------------------
const css = readFileSync("src/app/globals.css", "utf8");
const keyframes = css.match(/@keyframes ionexa-globe-spin \{[\s\S]*?\n\}/);
// Both halves: the transform-origin rule and the one that starts the
// animation. Lifting only the second would time a rotation about the
// element's own box corner rather than the globe's centre — a different
// animation from the one that ships.
const originRule = css.match(/\.ionexa-globe \.globe-orbit-group \{[\s\S]*?\n\}/);
const spinRule = css.match(/\.ionexa-globe\.is-spinning \.globe-orbit-group \{[\s\S]*?\n\}/);
const nodeRule = css.match(/\.ionexa-globe \.globe-node \{[\s\S]*?\n\}/);
check("the keyframe block was found in globals.css", keyframes !== null);
check("…the transform-origin rule", originRule !== null);
check("…and the rule that starts the animation", spinRule !== null);
check("…and the node rule, which carries the only filter in the mark", nodeRule !== null);
if (!keyframes || !originRule || !spinRule || !nodeRule) {
  console.log(`\nFAILED: ${pass} passed, ${failures.length} failed`);
  process.exit(1);
}

// ---------------------------------------------------------------------
// THE MARK, FROM THE SAME GEOMETRY THE COMPONENT USES
// ---------------------------------------------------------------------
//
// lib/brand/globe.ts exports the SHAPES; lib/brand/globe-svg.ts's
// globeSvg() serialises the STILL version for the favicon and has no
// orbit group, so it is the wrong artefact to time. The renderer below
// is this file's own, and it is the one thing here that could drift from
// components/ui/globe-mark.tsx.
//
// So it is pinned rather than trusted: the counts are asserted against
// what the component's own split produces, and the shapes come from
// globeShapes()/orbitingRoles() rather than from a copied literal. A
// renderer that quietly emitted nothing would sail through a frame-rate
// measurement with a perfect score, which is the failure this guards.
const { loadTs } = await import("./load-ts.mjs");
const brand = await loadTs("src/lib/brand/globe.ts");
const shapes = brand.globeShapes("mark");
const orbiting = new Set(brand.orbitingRoles());
const moving = shapes.filter((sh) => orbiting.has(sh.role));
const still = shapes.filter((sh) => !orbiting.has(sh.role));

// THREE, MEASURED. The "mark" detail is a sphere and two orbit
// ellipses — that is the whole drawing at favicon size, and the
// floor is 3 because that is what globeShapes("mark") returns today,
// not because 3 looked like a safe number. The first version of this
// line said >= 5, which was a guess, and it failed on correct
// geometry. The floor exists to catch an empty or broken load, so it
// sits at the real value and moves when the drawing does.
check(`the geometry loaded (${shapes.length} shapes)`, shapes.length >= 3);
check(
  `…and splits into still and orbiting (${still.length} + ${moving.length})`,
  moving.length >= 1 && still.length >= 1,
  "an empty orbit group would animate nothing and measure a still image"
);

const BASE_STROKE = 3.2;
const attr = (sh) =>
  sh.kind === "circle"
    ? sh.stroke === null
      ? `<circle cx="${sh.cx}" cy="${sh.cy}" r="${sh.r}" fill="currentColor" opacity="${sh.opacity}" class="globe-node"/>`
      : `<circle cx="${sh.cx}" cy="${sh.cy}" r="${sh.r}" fill="none" stroke="currentColor" stroke-width="${sh.stroke * BASE_STROKE}" opacity="${sh.opacity}"/>`
    : `<ellipse cx="${sh.cx}" cy="${sh.cy}" rx="${sh.rx}" ry="${sh.ry}" fill="none" stroke="currentColor" stroke-width="${sh.stroke * BASE_STROKE}" opacity="${sh.opacity}"${sh.rotate ? ` transform="rotate(${sh.rotate} ${sh.cx} ${sh.cy})"` : ""}/>`;

const one = `<span class="ionexa-globe is-spinning"><svg width="64" height="64" viewBox="0 0 ${brand.GLOBE_VIEW} ${brand.GLOBE_VIEW}">${still
  .map(attr)
  .join("")}<g class="globe-orbit-group">${moving.map(attr).join("")}</g></svg></span>`;

check("the markup carries the class the rule animates", /globe-orbit-group/.test(one));
check("…and the spinning class the rule requires", /is-spinning/.test(one));

const html = `<!doctype html><meta charset="utf-8"><style>
  body { margin:0; background:#0a0a0a; display:flex; flex-wrap:wrap; gap:8px; color:#f5a623; }
  ${originRule[0]}
  ${spinRule[0]}
  ${nodeRule[0]}
  ${keyframes[0]}
</style>${one.repeat(COPIES)}`;

const executablePath = chromiumPath();
const browser = await chromium.launch(executablePath ? { executablePath } : {});
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.setContent(html, { waitUntil: "load" });
  // One second of settling before sampling: the first frames after
  // setContent include layout and raster of 36 SVGs, which is startup
  // cost and not what the question is about.
  await page.waitForTimeout(1000);

  const result = await page.evaluate(async (ms) => {
    const times = [];
    await new Promise((resolve) => {
      const start = performance.now();
      function tick(now) {
        times.push(now);
        if (now - start < ms) requestAnimationFrame(tick);
        else resolve();
      }
      requestAnimationFrame(tick);
    });
    const deltas = [];
    for (let i = 1; i < times.length; i++) deltas.push(times[i] - times[i - 1]);
    deltas.sort((a, b) => a - b);
    return {
      frames: deltas.length,
      median: deltas[Math.floor(deltas.length / 2)] ?? 0,
      p95: deltas[Math.floor(deltas.length * 0.95)] ?? 0,
      worst: deltas[deltas.length - 1] ?? 0,
    };
  }, SAMPLE_MS);

  // A FLOOR ON THE SAMPLE. Two frames with a 16ms gap would satisfy every
  // threshold below and measure nothing. At 60fps two seconds is ~120.
  check(
    `the sample is a sample (${result.frames} frames over ${SAMPLE_MS}ms)`,
    result.frames >= 60,
    "too few frames to say anything about the frame rate"
  );
  check(
    `${COPIES} marks animating: p95 frame interval ${result.p95.toFixed(1)}ms (<= ${P95_CEILING_MS}ms)`,
    result.p95 <= P95_CEILING_MS,
    `median ${result.median.toFixed(1)}ms · worst ${result.worst.toFixed(1)}ms`
  );
  console.log(
    `        median ${result.median.toFixed(1)}ms · p95 ${result.p95.toFixed(1)}ms · worst ${result.worst.toFixed(1)}ms · ${result.frames} frames`
  );

  // THE INSTRUMENT, CHECKED AGAINST ITSELF. A page deliberately made to
  // stutter must fail the same threshold; otherwise the measurement above
  // is a number that cannot go red and proves nothing.
  const stutter = await page.evaluate(async (ms) => {
    const times = [];
    await new Promise((resolve) => {
      const start = performance.now();
      function tick(now) {
        times.push(now);
        // Block the main thread well past a frame's budget.
        const until = performance.now() + 40;
        while (performance.now() < until) { /* burn */ }
        if (now - start < ms) requestAnimationFrame(tick);
        else resolve();
      }
      requestAnimationFrame(tick);
    });
    const deltas = [];
    for (let i = 1; i < times.length; i++) deltas.push(times[i] - times[i - 1]);
    deltas.sort((a, b) => a - b);
    return deltas[Math.floor(deltas.length * 0.95)] ?? 0;
  }, 600);
  check(
    `the measurement can go red (a blocked main thread reads ${stutter.toFixed(1)}ms)`,
    stutter > P95_CEILING_MS
  );
} finally {
  await browser.close();
}

console.log(`\n${failures.length === 0 ? "OK" : "FAILED"}: ${pass} passed, ${failures.length} failed`);
if (failures.length) for (const f of failures) console.log(`  - ${f}`);
process.exit(failures.length === 0 ? 0 : 1);
