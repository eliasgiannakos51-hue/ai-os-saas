// Are the light theme's borders VISIBLE in production — measured from the
// pixels the browser actually painted?
//
// getComputedStyle is not evidence: a border can be declared and painted
// at zero alpha, covered by a sibling, or drawn in a colour that matches
// its background exactly. So every candidate is located with
// elementFromPoint, then its border row and the row 4px outside it are
// read out of a real screenshot and compared as WCAG contrast.
import { chromium } from "playwright";
import { writeFileSync } from "node:fs";

const SITE = "https://ai-os-saas-five.vercel.app";
const PAGES = ["/", "/pricing", "/login", "/signup", "/roadmap"];
const browser = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium",
  args: ["--no-sandbox", "--ssl-version-max=tls1.2"],
});
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: "light", deviceScaleFactor: 1 });
const page = await ctx.newPage();
const all = [];
for (const path of PAGES) {
  await page.goto(SITE + path, { waitUntil: "networkidle", timeout: 60000 }).catch(() => undefined);
  await page.evaluate(() => { try { localStorage.setItem("theme", "light"); } catch {} });
  await page.reload({ waitUntil: "networkidle" }).catch(() => undefined);
  await page.waitForTimeout(1200);
  const theme = await page.evaluate(() => document.documentElement.getAttribute("data-theme"));
  const samples = await page.evaluate(() => {
    const out = [];
    for (const el of document.querySelectorAll("*")) {
      const cs = getComputedStyle(el);
      const w = parseFloat(cs.borderTopWidth) || 0;
      if (w < 1 || cs.borderTopStyle === "none") continue;
      const r = el.getBoundingClientRect();
      if (r.width < 40 || r.height < 20) continue;
      if (r.top < 8 || r.top > innerHeight - 8) continue;
      // NINE POINTS ALONG THE EDGE, not one.
      //
      // One sample is fragile in a way that produced a false 1.00:1 on
      // /pricing: the single x landed inside the orange "MOST POPULAR"
      // badge that sits ON the card's top border, so the border pixel and
      // the pixel outside it were both the same orange. The border either
      // side of the badge is plainly visible. A border is visible if it
      // contrasts ANYWHERE along its edge, so the median of nine samples
      // is the honest figure and the minimum is kept for the record.
      const y = Math.round(r.top);
      const xs = [];
      const inset = Math.max(12, Math.min(r.width * 0.1, 40));
      for (let i = 0; i < 9; i++) {
        xs.push(Math.round(r.left + inset + ((r.width - 2 * inset) * i) / 8));
      }
      const hit = document.elementFromPoint(xs[4], y);
      out.push({
        tag: el.tagName.toLowerCase(),
        cls: String(el.className || "").slice(0, 50),
        xs, y,
        declared: cs.borderTopColor,
        occluded: !(hit === el || el.contains(hit) || (hit && hit.contains(el))),
      });
      if (out.length >= 25) break;
    }
    return out;
  });
  const buf = await page.screenshot();
  writeFileSync(`/tmp/prodshots/border-${path.replace(/\//g, "_") || "_root"}.png`, buf);
  all.push({ path, theme, samples });
  console.log(`${path.padEnd(10)} theme=${theme} bordered=${samples.length} occluded=${samples.filter((s) => s.occluded).length}`);
}
writeFileSync("/tmp/prodshots/borders.json", JSON.stringify(all, null, 2));
await browser.close();
