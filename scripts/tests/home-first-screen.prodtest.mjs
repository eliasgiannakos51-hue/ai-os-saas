#!/usr/bin/env node
/*
 * IS THE FIELD ACTUALLY THE SCREEN? MEASURED, IN A REAL BROWSER.
 *
 * WHAT THE FIRST SCREEN MUST HOLD, since ΣΥΣΤΗΜΑ DESIGN §4 (2026-10-04):
 * «Ένα μπλοκ στο κέντρο της οθόνης» — the earth with the greeting beside
 * it, the field, and four quick actions, Research, Create, Run, Analyze.
 * Nothing else. So each of those must be wholly on the first screen at
 * 1440 and at 390, with no scroll, and the field must start in the upper
 * half: a box below the fold is a box nobody sees.
 *
 * UNTIL 2026-10-05 this asked for a field of at least 40% of the screen,
 * from the earlier brief («Redesign phase 1 Α»). The design replaced that
 * page with a centred block, and the 40% rule failed every nightly run
 * since (QUEUE Α.13) while describing a page that no longer exists.
 *
 * WHAT "THE FIELD" MEANS HERE: the textarea's own border box, not the
 * card around it and not the form.
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
// The four quick actions, by the words the account reads.
const EN = JSON.parse((await import("node:fs")).readFileSync("messages/en.json", "utf8"));
const ACTIONS = ["research", "create", "run", "analyze"].map((k) => EN.dashboard.home.actions[k]);

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

    const box = await page.evaluate((actions) => {
      const el = document.querySelector("#create-input") ?? document.querySelector("textarea");
      if (!el) return null;
      const r = el.getBoundingClientRect();
      const main = document.querySelector("main") ?? document.body;
      const quick = actions.map((name) => {
        const b = [...main.querySelectorAll("a, button")].find((n) => (n.textContent ?? "").trim() === name);
        if (!b) return { name, found: false };
        const q = b.getBoundingClientRect();
        return { name, found: true, top: q.top, bottom: q.bottom };
      });
      return { top: r.top, bottom: r.bottom, height: r.height, width: r.width, viewport: window.innerHeight, quick };
    }, ACTIONS);
    await page.screenshot({ path: `${SHOTS}/${vp.name}.png` });

    ok(`${vp.name}: the field is on the page`, Boolean(box), "no textarea was found on /dashboard/overview");
    if (!box) { await ctx.close(); continue; }
    const share = box.height / box.viewport;
    measured.push({ ...vp, ...box, share });
    console.log(
      `        ${vp.name.padEnd(13)} field ${Math.round(box.height)}px of ${box.viewport}px viewport = ${(share * 100).toFixed(1)}%` +
      `  (top at ${Math.round(box.top)}px)`
    );
    ok(`${vp.name}: the field is wholly on the first screen`, box.bottom <= box.viewport, `bottom at ${Math.round(box.bottom)}px of ${box.viewport}px`);
    ok(`${vp.name}: the four quick actions are there (${box.quick.filter((q) => q.found).length}/4)`, box.quick.every((q) => q.found), JSON.stringify(box.quick));
    ok(`${vp.name}: ...under the field, and wholly on the first screen, with no scroll`,
      box.quick.every((q) => q.found && q.top >= box.top && q.bottom <= box.viewport), JSON.stringify(box.quick));
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
