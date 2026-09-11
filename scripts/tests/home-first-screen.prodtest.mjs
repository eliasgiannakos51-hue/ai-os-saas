#!/usr/bin/env node
/*
 * IS THE FIELD ACTUALLY THE SCREEN? MEASURED, IN A REAL BROWSER.
 *
 * Redesign phase 1 Α asks for a box that takes at least 40% of the FIRST
 * SCREEN at 1440 and at 390. Two viewports whose heights differ by 56
 * pixels and whose widths differ by more than a thousand, so a height
 * that satisfies one can be wrong for the other — which is why the
 * component expresses it as 46vh and why this file measures the rendered
 * result instead of reading the class back.
 *
 * WHAT "THE FIELD" MEANS HERE: the textarea's own border box, not the
 * card around it and not the form. The smallest honest reading of the
 * requirement, so a pass cannot be bought with padding.
 *
 * AND WHAT IS ABOVE IT, because a box that is 46% of the screen is still
 * missable if it starts below the fold: the top of the field must sit in
 * the upper half of the viewport at both sizes.
 *
 * Run: node scripts/tests/home-first-screen.prodtest.mjs
 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { startProdHarness } from "../lib/prod-harness.mjs";
import { chromiumPath } from "./lib/chromium.mjs";

let pass = 0;
const failures = [];
const ok = (name, cond, detail) => {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { failures.push(name); console.log(`  FAIL  ${name}${detail !== undefined ? "\n        " + detail : ""}`); }
};

const SHOTS = "/tmp/home-first-screen";
mkdirSync(SHOTS, { recursive: true });

// 1440x900 is the desktop this project has measured on since V4.6 #10;
// 390x844 is the iPhone the mobile gates use.
const VIEWPORTS = [
  { name: "desktop-1440", width: 1440, height: 900 },
  { name: "phone-390", width: 390, height: 844 },
];
const MIN_SHARE = 0.4;

// ONBOARDING HAS TO BE PAST, or /dashboard/overview redirects to
// /onboarding and this file measures a page that has no field on it —
// which is what the first run did, and reported as a layout failure
// until the landing check above was added.
const harness = await startProdHarness({
  tableRows: {
    user_onboarding: [
      { user_id: "00000000-0000-0000-0000-000000000001", completed_at: "2026-01-01T00:00:00Z" },
    ],
  },
  supaPort: 54397,
});
const browser = await chromium.launch({ executablePath: chromiumPath() });
const measured = [];

try {
  for (const vp of VIEWPORTS) {
    const ctx = await harness.signedIn(browser, { width: vp.width, height: vp.height });
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(`${harness.origin}/dashboard/overview`, { waitUntil: "networkidle" });
    // WHERE IT ACTUALLY LANDED. A signed-out redirect renders a perfectly
    // good page with no field on it, and "the selector timed out" would
    // report that as a layout failure.
    const landed = new URL(page.url()).pathname;
    ok(`${vp.name}: the browser is signed in and on Home (${landed})`, landed.startsWith("/dashboard"),
      `redirected to ${landed}`);
    const found = await page
      .waitForSelector("textarea", { timeout: 20_000, state: "attached" })
      .then(() => true)
      .catch(() => false);
    if (!found) {
      ok(`${vp.name}: the field is on the page`, false, `no textarea at ${landed}`);
      await page.screenshot({ path: `${SHOTS}/${vp.name}-missing.png` });
      await ctx.close();
      continue;
    }

    const box = await page.evaluate(() => {
      const el = document.querySelector("#create-input") ?? document.querySelector("textarea");
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { top: r.top, height: r.height, width: r.width, viewport: window.innerHeight };
    });
    await page.screenshot({ path: `${SHOTS}/${vp.name}.png` });

    ok(`${vp.name}: the field is on the page`, Boolean(box), "no textarea was found on /dashboard/overview");
    if (!box) { await ctx.close(); continue; }
    const share = box.height / box.viewport;
    measured.push({ ...vp, ...box, share });
    console.log(
      `        ${vp.name.padEnd(13)} field ${Math.round(box.height)}px of ${box.viewport}px viewport = ${(share * 100).toFixed(1)}%` +
      `  (top at ${Math.round(box.top)}px)`
    );
    ok(`${vp.name}: the field holds at least ${MIN_SHARE * 100}% of the first screen (${(share * 100).toFixed(1)}%)`,
      share >= MIN_SHARE, `${Math.round(box.height)}px of ${box.viewport}px`);
    ok(`${vp.name}: and it starts in the upper half (${Math.round(box.top)}px)`,
      box.top < box.viewport / 2, "a big box below the fold is still a box nobody sees");
    ok(`${vp.name}: the page threw nothing`, errors.length === 0, errors.join(" | "));
    await ctx.close();
  }
} finally {
  await browser.close();
  await harness.cleanup();
}

console.log(`\n        screenshots: ${SHOTS}/desktop-1440.png, ${SHOTS}/phone-390.png`);
console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${failures.length} failed`);
process.exit(failures.length === 0 ? 0 : 1);
