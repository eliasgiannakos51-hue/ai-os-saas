#!/usr/bin/env node
/*
 * THE LIVE SITE, PHOTOGRAPHED.
 *
 * Run: SHOTS=/tmp/shots node scripts/prod-shots.mjs
 *      SHOTS=/tmp/shots PROD_BASE_URL=https://… node scripts/prod-shots.mjs
 *
 * Every other browser script in this repository builds the app first and
 * drives its own copy. This one opens the DEPLOYMENT — the bytes a
 * stranger gets — and writes a PNG per page at two sizes.
 *
 * PUBLIC PAGES ONLY, and that is the whole limitation. Everything under
 * /dashboard answers 307 to /login without a session, so a run with no
 * credentials photographs the login screen eleven times and reports it
 * as eleven pages. The redirect is therefore IN the list, once, by name:
 * a reader should see that the guard works rather than wonder why the
 * dashboard is missing.
 *
 * WHAT IT CANNOT SHOW: anything behind sign-in — which is every Make
 * feature. That needs BOT_EMAIL and BOT_PASSWORD, and it is the same
 * two strings the e2e bot waits on.
 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = (process.env.PROD_BASE_URL || "https://ai-os-saas-five.vercel.app").replace(/\/+$/, "");
const OUT = process.env.SHOTS;
if (!OUT) {
  console.log("SHOTS=<directory> is required — that is where the PNGs go.");
  process.exit(2);
}
mkdirSync(OUT, { recursive: true });

const PAGES = [
  ["landing", "/"],
  ["login", "/login"],
  ["signup", "/signup"],
  ["pricing", "/pricing"],
  ["help", "/help"],
  ["roadmap", "/roadmap"],
  ["terms", "/terms"],
  ["privacy", "/privacy"],
  ["contact", "/contact"],
  ["ai-transparency", "/ai-transparency"],
  // NOT a mistake in the list: the point is to SEE the guard send a
  // signed-out visitor to /login rather than serve the dashboard.
  ["dashboard-redirect", "/dashboard/overview"],
];

// Both, because the phone is where a layout breaks and the laptop is
// where it is designed.
const DEVICES = [
  ["desktop", 1440, 900],
  ["phone", 390, 844],
];

// THE SYSTEM TRUST STORE, NOT CHROME'S OWN.
//
// Outbound HTTPS here is re-terminated by a proxy whose CA is installed
// in the system store and in the browser's NSS database. Chrome stopped
// consulting either by default when the Chrome Root Store shipped, so
// the first run failed every page with ERR_CERT_AUTHORITY_INVALID while
// curl, which reads the same CA, was fine.
//
// Turning the Chrome Root Store off sends verification back to the
// system store, where the CA already is. Verification stays ON — this
// is not ignoreHTTPSErrors, which would make the script unable to tell
// a proxy from an attacker, and is never the fix.
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium",
  args: ["--disable-features=ChromeRootStoreUsed"],
});
let shot = 0;
try {
  for (const [dev, width, height] of DEVICES) {
    const ctx = await browser.newContext({ viewport: { width, height }, hasTouch: dev === "phone" });
    const page = await ctx.newPage();
    for (const [name, path] of PAGES) {
      try {
        const res = await page.goto(BASE + path, { waitUntil: "networkidle", timeout: 45_000 });
        await page.waitForTimeout(400);
        const landed = new URL(page.url()).pathname;
        const file = `${OUT}/${dev}-${name}.png`;
        await page.screenshot({ path: file, fullPage: false });
        shot++;
        console.log(`${dev.padEnd(8)} ${path.padEnd(22)} ${res?.status() ?? "?"}  landed ${landed}`);
      } catch (err) {
        console.log(`${dev.padEnd(8)} ${path.padEnd(22)} FAILED  ${String(err.message).slice(0, 80)}`);
      }
    }
    await ctx.close();
  }
} finally {
  await browser.close();
}
console.log(`\n${shot} screenshots in ${OUT}`);
console.log("Public pages only. Everything behind sign-in needs BOT_EMAIL and BOT_PASSWORD.");
