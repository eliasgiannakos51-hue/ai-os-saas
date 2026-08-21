#!/usr/bin/env node
/*
 * EVIDENCE FOR THE UNSPLASH PRODUCTION-ACCESS APPLICATION — rendered in a
 * browser, over HTTP, under the real published-site CSP. Not asserted in
 * prose, and not simulated.
 *
 * Unsplash grants production access (50 -> 5,000 requests/hour) to
 * applications that do three things, and reviews them by LOOKING AT A
 * REAL PAGE:
 *   1. photos are HOTLINKED from Unsplash, not re-hosted;
 *   2. the download endpoint is triggered when a photo is used;
 *   3. every photo carries "Photo by <name> on Unsplash", both links
 *      carrying utm_source and utm_medium.
 *
 * Nothing here is re-implemented for the demo. The API response goes
 * through the REAL photoFromSearchResult; the page goes through the REAL
 * applyResolvedImageUrls and the REAL enforceUnsplashAttribution; and it
 * is served with the REAL publishedSiteHeaders() — the same functions and
 * the same response headers /s/[subdomain] uses in production. What the
 * screenshot shows is what a customer's published site contains,
 * character for character.
 *
 * ---------------------------------------------------------------------
 * TWO MODES, AND THE DIFFERENCE MATTERS.
 * ---------------------------------------------------------------------
 *
 *   WITH UNSPLASH_ACCESS_KEY (`--live`, the default when a key is set)
 *     A real /search/photos call, a real photographer, a real profile
 *     URL, and a real GET to links.download_location — so guideline 2 is
 *     demonstrated by Unsplash's own 200, not by reading our source.
 *     THIS is the mode whose screenshots go on the application.
 *
 *   WITHOUT A KEY
 *     The photo is still real and still hotlinked live, but the
 *     photographer is a stated placeholder, because inventing a
 *     photographer's name and sending it to Unsplash as evidence would be
 *     a fabrication. The script says so on stdout, watermarks the page,
 *     and exits 3 — a deliberate "this is not submittable" — so a
 *     placeholder render can never be mistaken for the real thing.
 *     (The earlier version of this script had no such guard, and the
 *     screenshots committed under agent-shots/ showed grey boxes and two
 *     invented names.)
 *
 * ---------------------------------------------------------------------
 * WHY IT IS SERVED OVER HTTP AND NOT OPENED AS A file:// URL.
 * ---------------------------------------------------------------------
 * A file:// page has no response headers, so it cannot show whether the
 * credit survives the Content-Security-Policy the published route
 * actually sets. The credit is styled with an INLINE style attribute; a
 * style-src without 'unsafe-inline' would strip it and leave white text
 * on a white page — present in the markup, invisible to a reviewer, and
 * indistinguishable from no attribution at all. So this serves the bytes
 * from a local server using publishedSiteHeaders() verbatim and asserts
 * the computed style in the browser afterwards.
 *
 * Usage:
 *   node scripts/unsplash-attribution-proof.mjs
 *   UNSPLASH_ACCESS_KEY=... node scripts/unsplash-attribution-proof.mjs
 *
 * Output: prod-audit/unsplash/ — the HTML and the screenshots.
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";
import { loadTs } from "./tests/load-ts.mjs";

const OUT = path.resolve("prod-audit/unsplash");
mkdirSync(OUT, { recursive: true });

const uns = await loadTs("src/lib/unsplash.ts");
const ph = await loadTs("src/lib/website-image-placeholders.ts");
const serving = await loadTs("src/lib/publishing/public-serving.ts");

const LIVE = Boolean(process.env.UNSPLASH_ACCESS_KEY);
const QUERY = process.env.UNSPLASH_PROOF_QUERY || "specialty coffee bar interior";

let problems = 0;
const say = (label, value, good) => {
  if (good === false) problems += 1;
  const mark = good === undefined ? " " : good ? "✓" : "✗";
  console.log(`  ${mark} ${label.padEnd(44)}${value}`);
};

console.log(
  LIVE
    ? `=== LIVE MODE — real Unsplash API, query "${QUERY}" ===`
    : "=== PLACEHOLDER MODE — no UNSPLASH_ACCESS_KEY set ===\n" +
        "    The photo below is real and really hotlinked. The photographer\n" +
        "    is NOT: without a key there is no way to learn who took it, and\n" +
        "    inventing one to put on an application would be a fabrication.\n" +
        "    Set UNSPLASH_ACCESS_KEY and re-run for submittable evidence."
);

// ---------------------------------------------------------------------
// The photo.
// ---------------------------------------------------------------------
let photo;
let downloadTriggered = null;

if (LIVE) {
  photo = await uns.searchUnsplashPhoto(QUERY);
  if (!photo) {
    console.error(
      `\nsearchUnsplashPhoto("${QUERY}") returned nothing. Either the key is wrong, the\n` +
        "Demo tier's 50 requests/hour are spent, or the query found no results.\n" +
        "Nothing can be proven from a photo that does not exist, so this stops here."
    );
    process.exit(2);
  }
  // GUIDELINE 2, DEMONSTRATED RATHER THAN DESCRIBED. This is the same
  // function the resolver calls for every photo that ships.
  downloadTriggered = await uns.triggerUnsplashDownload(photo);
} else {
  // A response in the exact shape /search/photos returns — nested
  // urls/user/links, so the parsing under test is the real parsing. The
  // photo id is a real, permanently-hosted Unsplash photo; the person is
  // openly a placeholder and is labelled as one on the page.
  photo = uns.photoFromSearchResult({
    urls: { regular: "https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=1200&q=80" },
    user: {
      name: "PLACEHOLDER — set UNSPLASH_ACCESS_KEY for the real name",
      links: { html: "https://unsplash.com/@placeholder" },
    },
    links: { download_location: "https://api.unsplash.com/photos/placeholder/download" },
  });
  if (!photo) throw new Error("photoFromSearchResult rejected a well-formed response");
}

console.log("\n=== 1. HOTLINK — the photo loads from Unsplash's own CDN ===");
say("stored url", photo.url);
const hotlinked = photo.url.startsWith("https://images.unsplash.com/");
say("served by images.unsplash.com, not re-hosted", hotlinked ? "YES" : "NO", hotlinked);

console.log("\n=== 2. DOWNLOAD TRIGGER — the use is registered with Unsplash ===");
say("links.download_location carried through", photo.downloadLocation);
const isEndpoint = photo.downloadLocation.startsWith("https://api.unsplash.com/");
say("it is an API endpoint, not an image file", isEndpoint ? "YES" : "NO", isEndpoint);
if (LIVE) {
  say(
    "live GET to download_location accepted",
    downloadTriggered ? "YES (Unsplash returned 200)" : "NO",
    downloadTriggered
  );
} else {
  say("live GET to download_location", "not attempted — no key");
}

// ---------------------------------------------------------------------
// The page, built by the shipped functions.
// ---------------------------------------------------------------------
const NOTE = LIVE
  ? ""
  : `<p style="margin:0 0 18px;padding:10px 14px;background:#fee2e2;border:1px solid #b91c1c;color:#7f1d1d;font:600 14px/1.5 system-ui,sans-serif;border-radius:6px">
     NOT FOR SUBMISSION — the photographer's name below is a placeholder.
     Re-run with UNSPLASH_ACCESS_KEY set for the real one.</p>`;

const PAGE = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Kafeneio Lada — Thessaloniki</title>
<style>
 body{margin:0;font-family:Georgia,serif;color:#1a1410;background:#faf7f2}
 header{padding:56px 32px 28px;max-width:900px;margin:0 auto}
 h1{font-size:44px;margin:0 0 10px;letter-spacing:-.02em}
 p.lede{margin:0;color:#6b5d4f;font-size:18px}
 figure{margin:0 auto;max-width:900px;padding:0 32px 48px}
 img{width:100%;height:420px;object-fit:cover;border-radius:10px;display:block}
</style></head><body>
<header><h1>Kafeneio Lada</h1><p class="lede">Specialty coffee and home-made sweets, Ladadika, Thessaloniki.</p>${NOTE}</header>
<figure><img src="PLACEHOLDER:hero" alt="Coffee being poured at the bar" data-image-query="${QUERY}"></figure>
</body></html>`;

const generated = ph.applyResolvedImageUrls(PAGE, new Map([["hero", photo]]));

console.log("\n=== 3. ATTRIBUTION — in the page that ships ===");
say("PLACEHOLDER token replaced", generated.includes("PLACEHOLDER:hero") ? "NO" : "YES", !generated.includes("PLACEHOLDER:hero"));
say("src points at Unsplash's CDN", generated.includes(photo.url) ? "YES" : "NO", generated.includes(photo.url));
say("credit present", generated.includes('class="unsplash-credit"') ? "YES" : "NO", generated.includes('class="unsplash-credit"'));

// ---------------------------------------------------------------------
// The same page after an EDIT that dropped the credit.
// ---------------------------------------------------------------------
//
// This is not a hypothetical. api/websites/edit sends the site's current
// HTML to Claude and stores the whole document that comes back, and a
// model rewriting a section routinely does not copy a credit span
// forward. `damaged` is that outcome; `repaired` is what
// enforceUnsplashAttribution puts back before anything is stored.
const damaged = generated.replace(/<span[^>]*class="unsplash-credit"[\s\S]*?<\/span>/g, "");
const enforcement = ph.enforceUnsplashAttribution(damaged);
const repaired = enforcement.html;

console.log("\n=== 4. IT SURVIVES AN EDIT ===");
say("credits after a model-style rewrite", damaged.includes("unsplash-credit") ? "present" : "GONE", !damaged.includes("unsplash-credit"));
say("credits after enforcement", `${enforcement.restored} rebuilt, ${enforcement.removed} photo(s) removed`);
say("the photo is still on the page", repaired.includes(photo.url) ? "YES" : "NO", repaired.includes(photo.url));
say("it is credited again", repaired.includes('class="unsplash-credit"') ? "YES" : "NO", repaired.includes('class="unsplash-credit"'));

writeFileSync(path.join(OUT, "generated-site.html"), generated);
writeFileSync(path.join(OUT, "after-edit-repaired.html"), repaired);

// ---------------------------------------------------------------------
// Rendered in a browser, over HTTP, under the published route's headers.
// ---------------------------------------------------------------------
const ROUTES = new Map([
  ["/generated", generated],
  ["/after-edit", repaired],
]);
const server = createServer((req, res) => {
  const body = ROUTES.get((req.url || "").split("?")[0]);
  if (!body) {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("not found");
    return;
  }
  // The REAL headers the published route sets, CSP included — see
  // lib/publishing/public-serving.ts.
  res.writeHead(200, serving.publishedSiteHeaders());
  res.end(body);
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}`;
console.log(`\n=== RENDERED OVER HTTP, UNDER THE PUBLISHED-SITE CSP ===`);
say("Content-Security-Policy in force", String(serving.publishedSiteHeaders()["Content-Security-Policy"]).slice(0, 72) + "…");

const proxyServer = process.env.HTTPS_PROXY || process.env.https_proxy || null;
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium",
  // --ssl-version-max=tls1.2 is an ENVIRONMENT workaround, not a product
  // requirement, and it is here because dropping it costs an hour to
  // re-diagnose. In the sandbox this runs in, outbound HTTPS is
  // re-terminated by an egress proxy, and Chromium's TLS 1.3 handshake
  // with it is reset — images.unsplash.com fails with
  // net::ERR_CONNECTION_RESET and the photo silently renders as an empty
  // box. Measured, not assumed: with the flag naturalWidth is 1200, and
  // without it 0, with and without the CSP and with and without an
  // explicit proxy setting. Nothing about the published site depends on
  // this.
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--ssl-version-max=tls1.2"],
  // 127.0.0.1 must not go through the proxy or the local server is
  // unreachable; images.unsplash.com must, or the photo never loads.
  ...(proxyServer ? { proxy: { server: proxyServer, bypass: "127.0.0.1,localhost" } } : {}),
});
const context = await browser.newContext({ viewport: { width: 1000, height: 800 }, deviceScaleFactor: 2 });

async function inspect(route, shotName) {
  const page = await context.newPage();
  const cspViolations = [];
  page.on("console", (m) => {
    if (/Content Security Policy/i.test(m.text())) cspViolations.push(m.text());
  });
  await page.goto(base + route, { waitUntil: "networkidle", timeout: 60000 });
  const seen = await page.evaluate(() => {
    const img = document.querySelector("img");
    const credit = document.querySelector(".unsplash-credit");
    const rect = credit ? credit.getBoundingClientRect() : null;
    const style = credit ? getComputedStyle(credit) : null;
    return {
      imageLoaded: Boolean(img && img.naturalWidth > 0),
      naturalWidth: img ? img.naturalWidth : 0,
      imgHost: img ? new URL(img.src).host : null,
      // The provenance the document carries about its own photo — this is
      // what lets the credit be rebuilt after an edit.
      provenance: img ? img.getAttribute("data-unsplash-photographer") : null,
      creditText: credit ? credit.textContent.replace(/\s+/g, " ").trim() : null,
      creditVisible: Boolean(rect && rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none"),
      // If the CSP stripped inline styles, this comes back transparent and
      // the white credit text is invisible on a bright photo.
      creditBackground: style ? style.backgroundColor : null,
      creditColor: style ? style.color : null,
      links: credit ? [...credit.querySelectorAll("a")].map((a) => ({ text: a.textContent, href: a.href })) : [],
    };
  });
  await page.screenshot({ path: path.join(OUT, shotName), fullPage: true });
  const fig = await page.$("figure");
  if (fig) await fig.screenshot({ path: path.join(OUT, shotName.replace(".png", "-closeup.png")) });
  await page.close();
  return { ...seen, cspViolations };
}

for (const [route, shot, label] of [
  ["/generated", "01-generated-site.png", "as generated"],
  ["/after-edit", "02-after-edit-repaired.png", "after an edit dropped the credit"],
]) {
  const seen = await inspect(route, shot);
  console.log(`\n  --- ${label} (${shot}) ---`);
  say("photo loaded from Unsplash", `${seen.imageLoaded ? "YES" : "NO"} (${seen.naturalWidth}px, ${seen.imgHost})`, seen.imageLoaded && seen.imgHost === "images.unsplash.com");
  say("credit visible on the page", seen.creditVisible ? "YES" : "NO", seen.creditVisible);
  say("credit reads", `"${seen.creditText}"`, /^Photo by .+ on Unsplash$/.test(seen.creditText || ""));
  say("its inline style survived the CSP", `${seen.creditBackground} / ${seen.creditColor}`, seen.creditBackground !== "rgba(0, 0, 0, 0)");
  say("photographer carried on the <img>", seen.provenance ? "YES" : "NO", Boolean(seen.provenance));
  const utmOk =
    seen.links.length === 2 &&
    seen.links.every((l) => {
      const u = new URL(l.href);
      return u.searchParams.get("utm_source") === "ionexa" && u.searchParams.get("utm_medium") === "referral";
    });
  for (const l of seen.links) say(`  link "${l.text}"`, l.href);
  say("both links carry the referral parameters", utmOk ? "YES" : "NO", utmOk);
  say("CSP violations reported by the browser", seen.cspViolations.length === 0 ? "none" : seen.cspViolations.join(" | "), seen.cspViolations.length === 0);
}

await browser.close();
server.close();

console.log(`\nscreenshots -> ${OUT}`);
if (problems > 0) {
  console.log(`\n${problems} check(s) failed — see the ✗ marks above.`);
  process.exit(1);
}
if (!LIVE) {
  console.log(
    "\nEVERY MECHANISM IS DEMONSTRATED, BUT THIS RENDER IS NOT SUBMITTABLE.\n" +
      "The photographer is a placeholder. Run it again with a real key:\n\n" +
      "    UNSPLASH_ACCESS_KEY=<your Demo key> node scripts/unsplash-attribution-proof.mjs\n"
  );
  process.exit(3);
}
console.log("\nAll three guidelines demonstrated against the live Unsplash API. Screenshots are submittable.");
