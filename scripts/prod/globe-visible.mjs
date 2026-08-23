// Is the globe on screen in production, and is it MOVING?
//
// Presence is not enough: the mark is an SVG whose orbit group is
// animated by CSS, and a stylesheet that failed to ship leaves a static
// ring that looks like a decoration rather than a sign of work happening.
// So this reads the animation off the live element and compares two
// frames of the real thing.
import { chromium } from "playwright";
const SITE = "https://ai-os-saas-five.vercel.app";
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--no-sandbox", "--ssl-version-max=tls1.2"] });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
for (const path of ["/", "/login", "/signup", "/pricing"]) {
  await page.goto(SITE + path, { waitUntil: "networkidle", timeout: 60000 }).catch(() => undefined);
  await page.waitForTimeout(800);
  const info = await page.evaluate(() => {
    const marks = [...document.querySelectorAll('[data-testid="globe-mark"]')];
    return marks.map((m) => {
      const r = m.getBoundingClientRect();
      const orbit = m.querySelector(".globe-orbit-group");
      const cs = orbit ? getComputedStyle(orbit) : null;
      // elementFromPoint at the mark's centre: painted, not merely present.
      const hit = document.elementFromPoint(Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2));
      return {
        w: Math.round(r.width), h: Math.round(r.height),
        visible: r.width > 0 && r.height > 0 && r.top >= 0 && r.top < innerHeight,
        painted: Boolean(hit && (m === hit || m.contains(hit))),
        animationName: cs?.animationName ?? null,
        animationDuration: cs?.animationDuration ?? null,
      };
    });
  });
  if (info.length === 0) { console.log(`${path.padEnd(9)} no globe-mark`); continue; }
  // Two screenshots of the mark itself, 300ms apart: if the bytes are
  // identical it is not moving.
  const el = page.locator('[data-testid="globe-mark"]').first();
  const a = await el.screenshot().catch(() => null);
  await page.waitForTimeout(320);
  const b = await el.screenshot().catch(() => null);
  const moved = a && b ? Buffer.compare(a, b) !== 0 : null;
  console.log(`${path.padEnd(9)} marks=${info.length} ${JSON.stringify(info[0])} framesDiffer=${moved}`);
}
await browser.close();
