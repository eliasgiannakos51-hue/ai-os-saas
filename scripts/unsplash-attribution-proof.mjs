#!/usr/bin/env node
/*
 * PROOF, FOR THE UNSPLASH PRODUCTION-ACCESS APPLICATION, THAT THE THREE
 * GUIDELINES ARE MET — rendered in a browser, not asserted in prose.
 *
 * Unsplash asks for three things and reviews them by looking at a real
 * page:
 *   1. photos are HOTLINKED from Unsplash, not re-hosted;
 *   2. the download endpoint is triggered when a photo is used;
 *   3. every photo carries "Photo by <name> on Unsplash", both links
 *      carrying utm_source and utm_medium.
 *
 * Nothing here is re-implemented for the demo. The API response goes
 * through the REAL photoFromSearchResult, and the page goes through the
 * REAL applyResolvedImageUrls — the same functions
 * api/websites/generate/process runs — so what the screenshot shows is
 * what a customer's published site contains, character for character.
 *
 * WHAT IS A FIXTURE AND WHAT IS REAL, stated plainly because a screenshot
 * that quietly mixes them is worthless as evidence:
 *   REAL     the photo, hotlinked live from images.unsplash.com
 *   REAL     the markup, produced by the shipped functions
 *   FIXTURE  the photographer's name and profile URL, because reading
 *            them requires UNSPLASH_ACCESS_KEY, which this environment
 *            does not have. The API response is built in the exact shape
 *            /search/photos returns, so the parsing under test is the
 *            real parsing.
 *
 * Usage: node scripts/unsplash-attribution-proof.mjs
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { loadTs } from "./tests/load-ts.mjs";

const OUT = path.resolve("prod-audit/unsplash");
mkdirSync(OUT, { recursive: true });

const uns = await loadTs("src/lib/unsplash.ts");
const ph = await loadTs("src/lib/website-image-placeholders.ts");

// The shape /search/photos actually returns, trimmed to the fields the
// parser reads. Written as the API writes it — nested urls/user/links —
// so a parser that started reading the wrong path would fail here.
const API_RESPONSE = {
  urls: { regular: "https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=1200&q=80" },
  user: {
    name: "Fixture Photographer",
    links: { html: "https://unsplash.com/@fixture-photographer" },
  },
  links: { download_location: "https://api.unsplash.com/photos/xyz123/download" },
};

const photo = uns.photoFromSearchResult(API_RESPONSE);
if (!photo) throw new Error("photoFromSearchResult rejected a well-formed response");

console.log("=== 1. HOTLINK ===");
console.log(`  stored url : ${photo.url}`);
const hotlinked = photo.url.startsWith("https://images.unsplash.com/");
console.log(`  hotlinked from Unsplash's CDN, not re-hosted: ${hotlinked ? "YES" : "NO"}`);

console.log("\n=== 2. DOWNLOAD TRIGGER ===");
console.log(`  download_location kept off the image url : ${photo.downloadLocation}`);
console.log(`  it is an API endpoint, not an image file : ${photo.downloadLocation.startsWith("https://api.unsplash.com/") ? "YES" : "NO"}`);
console.log(`  triggerUnsplashDownload is exported       : ${typeof uns.triggerUnsplashDownload === "function" ? "YES" : "NO"}`);

console.log("\n=== 3. ATTRIBUTION ===");
const credit = ph.buildUnsplashCreditHtml(photo);
console.log(`  ${credit}`);
const hasUtm = (credit.match(/utm_source=ionexa&(amp;)?utm_medium=referral/g) || []).length;
console.log(`  links carrying the referral parameters   : ${hasUtm}/2`);
console.log(`  says "Photo by <name> on Unsplash"       : ${/Photo by .*on .*Unsplash/s.test(credit) ? "YES" : "NO"}`);

// A generated page in the shape the model produces, with the placeholder
// the resolver looks for.
const PAGE = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Kafeneio Lada — Thessaloniki</title>
<style>
 body{margin:0;font-family:Georgia,serif;color:#1a1410;background:#faf7f2}
 header{padding:56px 32px 28px;max-width:900px;margin:0 auto}
 h1{font-size:44px;margin:0 0 10px;letter-spacing:-.02em}
 p.lede{margin:0;color:#6b5d4f;font-size:18px}
 figure{margin:0;max-width:900px;padding:0 32px 48px;margin:0 auto}
 img{width:100%;height:420px;object-fit:cover;border-radius:10px;display:block}
</style></head><body>
<header><h1>Kafeneio Lada</h1><p class="lede">Specialty coffee and home-made sweets, Ladadika, Thessaloniki.</p></header>
<figure><img src="PLACEHOLDER:hero" alt="Coffee being poured at the bar"></figure>
</body></html>`;

const resolved = new Map([["hero", photo]]);
const finalHtml = ph.applyResolvedImageUrls(PAGE, resolved);
writeFileSync(path.join(OUT, "generated-site.html"), finalHtml);

const creditIsInPage = finalHtml.includes('class="unsplash-credit"');
const srcIsUnsplash = finalHtml.includes(photo.url);
const placeholderGone = !finalHtml.includes("PLACEHOLDER:hero");
console.log("\n=== THE PAGE THAT SHIPS ===");
console.log(`  placeholder replaced        : ${placeholderGone ? "YES" : "NO"}`);
console.log(`  src points at Unsplash's CDN: ${srcIsUnsplash ? "YES" : "NO"}`);
console.log(`  credit present in the page  : ${creditIsInPage ? "YES" : "NO"}`);

// Render it, with the photo loaded live from Unsplash — which is itself
// the hotlink working.
const proxyServer = process.env.HTTPS_PROXY || process.env.https_proxy || null;
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium",
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--ssl-version-max=tls1.2"],
  ...(proxyServer ? { proxy: { server: proxyServer } } : {}),
});
const page = await browser.newContext({ viewport: { width: 1000, height: 760 } }).then((c) => c.newPage());
await page.goto("file://" + path.join(OUT, "generated-site.html"), { waitUntil: "networkidle", timeout: 45000 });

const shot = await page.evaluate(() => {
  const img = document.querySelector("img");
  const credit = document.querySelector(".unsplash-credit");
  const links = credit ? [...credit.querySelectorAll("a")].map((a) => ({ text: a.textContent, href: a.href })) : [];
  const r = credit ? credit.getBoundingClientRect() : null;
  return {
    imageLoaded: Boolean(img && img.naturalWidth > 0),
    naturalWidth: img ? img.naturalWidth : 0,
    imgSrc: img ? img.src : null,
    creditText: credit ? credit.textContent : null,
    creditVisible: Boolean(r && r.width > 0 && r.height > 0),
    links,
  };
});
console.log("\n=== RENDERED IN A BROWSER ===");
console.log(`  photo loaded from Unsplash  : ${shot.imageLoaded ? "YES" : "NO"} (${shot.naturalWidth}px wide)`);
console.log(`  credit visible on the page  : ${shot.creditVisible ? "YES" : "NO"}`);
console.log(`  credit reads                : "${shot.creditText}"`);
for (const l of shot.links) console.log(`    link "${l.text}" -> ${l.href}`);

await page.screenshot({ path: path.join(OUT, "attribution-full.png"), fullPage: true });
const fig = await page.$("figure");
if (fig) await fig.screenshot({ path: path.join(OUT, "attribution-closeup.png") });
await browser.close();

const allLinksCarryUtm = shot.links.length === 2 && shot.links.every((l) => l.href.includes("utm_source=ionexa") && l.href.includes("utm_medium=referral"));
console.log(`\n  both rendered links carry the referral params: ${allLinksCarryUtm ? "YES" : "NO"}`);
console.log(`\nscreenshots -> ${OUT}`);
if (!(hotlinked && creditIsInPage && shot.imageLoaded && shot.creditVisible && allLinksCarryUtm)) {
  console.log("\nAT LEAST ONE GUIDELINE IS NOT DEMONSTRATED");
  process.exit(1);
}
