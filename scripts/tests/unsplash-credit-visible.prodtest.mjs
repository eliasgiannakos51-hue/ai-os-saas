// IS THE CREDIT ACTUALLY VISIBLE, OR ONLY PRESENT?
//
// Every other check in this repo asks whether the credit STRING is in the
// document. This one opens a browser and asks whether a person can see it,
// because those are different questions and the difference is the whole
// compliance requirement: Unsplash reviews a rendered page.
//
// ---------------------------------------------------------------------
// WHAT WENT WRONG, AND WHY NOTHING CAUGHT IT.
// ---------------------------------------------------------------------
//
// The credit is emitted as an ordinary in-flow <span> immediately after
// the <img>, styled inline. lib/website-image-placeholders.ts said an
// inline style "wins the cascade outright, so the credit cannot be styled
// away". That is true of `display:none` on the span itself and false for
// what actually happens, because CLIPPING AND STACKING ARE PROPERTIES OF
// THE ANCESTOR and no inline style on a child can defeat them:
//
//   CLIPPED   .hero-media{height:420px;overflow:hidden} with the img
//             filling it. The credit's box starts BELOW the clip and has
//             zero visible pixels.
//   COVERED   .hero{position:relative} .hero img{position:absolute;inset:0}
//             — the standard way to put a heading over a photo. A
//             non-positioned in-flow span paints at step 4/6 of the
//             painting order and a positioned descendant paints at step
//             8, so the IMAGE ITSELF paints over its own credit. No
//             overlay is even required.
//
// Neither is exotic. HERO_PATTERNS[0] in lib/website-variation.ts is
// literally "full-bleed-photo — a photograph fills the first viewport;
// the heading sits on or over it", drawn by code for roughly one site in
// five, and a fixed-height media box is the ordinary photo card.
//
// The old browser assertion was
//     rect.width > 0 && rect.height > 0 && visibility !== 'hidden'
//                    && display !== 'none'
// which is TRUE for both failing shapes: a clipped element still has a
// non-zero border box, and a covered one certainly does. So it passed,
// and the one layout it ran against was the benign <figure> that the
// production-access evidence is rendered on.
//
// THE TEST THAT CAN SEE IT: hit-test the credit's own pixels with
// document.elementFromPoint, and intersect its box with every clipping
// ancestor's. If the topmost element at the credit's centre is not the
// credit (or inside it), a visitor cannot see it, whatever the box says.
//
// Named .prodtest.mjs because it needs a browser, so it stays out of the
// pre-build unit gate.
//
// Run: node scripts/tests/unsplash-credit-visible.prodtest.mjs
import { chromium } from "playwright";
import { createServer } from "node:http";
import { loadTs } from "./load-ts.mjs";

let pass = 0,
  fail = 0;
function check(name, actual, expected) {
  const a = JSON.stringify(actual),
    e = JSON.stringify(expected);
  if (a === e) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    fail++;
    console.log(`  FAIL  ${name}\n        expected ${e}\n        actual   ${a}`);
  }
}
const ok = (name, cond, detail = "") => {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    fail++;
    console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ""}`);
  }
};

const ph = await loadTs("src/lib/website-image-placeholders.ts");
const serving = await loadTs("src/lib/publishing/public-serving.ts");

const PHOTO = {
  url: "https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=1200&q=80",
  photographerName: "Ada Lovelace",
  photographerUrl: "https://unsplash.com/@ada",
};

// ---------------------------------------------------------------------
// The layouts a model actually writes. Each is the model's OWN CSS; the
// <img> and everything after it comes from the shipped functions.
// ---------------------------------------------------------------------
const LAYOUTS = [
  {
    key: "clipped-media-box",
    why: "the ordinary photo card: a fixed-height box with overflow:hidden",
    css: `.media{height:260px;overflow:hidden;border-radius:12px}
          .media img{width:100%;height:100%;object-fit:cover;display:block}`,
    body: `<section class="media"><img src="PLACEHOLDER:p" alt="a river" data-image-query="a river"></section>
           <h2>Our story</h2>`,
  },
  {
    key: "full-bleed-hero",
    why: "HERO_PATTERNS[0]: a photo fills the viewport and the heading sits over it",
    css: `.hero{position:relative;height:320px;overflow:hidden}
          .hero img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
          .hero h1{position:relative;z-index:2;color:#fff;padding:40px}`,
    body: `<section class="hero"><img src="PLACEHOLDER:p" alt="a river" data-image-query="a river"><h1>Welcome</h1></section>`,
    requireBesidePhoto: true,
  },
  {
    key: "scrimmed-hero",
    why: "the same, with a gradient scrim over the photo",
    css: `.hero{position:relative;height:320px;overflow:hidden}
          .hero img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
          .hero::after{content:"";position:absolute;inset:0;background:linear-gradient(rgba(0,0,0,.1),rgba(0,0,0,.6));z-index:1}
          .hero h1{position:relative;z-index:2;color:#fff;padding:40px}`,
    body: `<section class="hero"><img src="PLACEHOLDER:p" alt="a river" data-image-query="a river"><h1>Welcome</h1></section>`,
  },
  {
    key: "sticky-footer-bar",
    why: "a fixed cookie bar pinned to the bottom — exactly what sits over a page-foot credit",
    css: `figure{margin:0} figure img{width:100%;height:200px;object-fit:cover;display:block}
          .bar{position:fixed;left:0;right:0;bottom:0;z-index:9999;background:#111;color:#fff;padding:18px}`,
    // The filler is load-bearing: a short page puts the credits block
    // near the top of the viewport where a bottom-pinned bar cannot
    // reach it, and the test would pass without proving anything. This
    // fills the viewport so the block lands under the bar, and the run
    // scrolls to the bottom before hit-testing.
    body: `<figure><img src="PLACEHOLDER:p" alt="a river" data-image-query="a river"></figure>
           ${"<p>Some copy.</p>".repeat(40)}<div class="bar">We use cookies.</div>`,
    // The per-photo credit is fine here; the POINT is the page block,
    // which lands under a z-index:9999 fixed bar unless it carries its
    // own stacking context.
    requirePageBlock: true,
  },
  {
    key: "plain-figure",
    why: "the benign shape — the only one the old evidence was rendered on",
    css: `figure{margin:0;max-width:800px} figure img{width:100%;height:240px;object-fit:cover;display:block}`,
    body: `<figure><img src="PLACEHOLDER:p" alt="a river" data-image-query="a river"></figure>`,
    requireBesidePhoto: true,
  },
];

const buildPage = (layout) =>
  ph.enforceUnsplashAttribution(
    ph.applyResolvedImageUrls(
      `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>${layout.key}</title>
<style>body{margin:0;font-family:system-ui,sans-serif}${layout.css}</style></head>
<body>${layout.body}<p>Some copy.</p></body></html>`,
      new Map([["p", PHOTO]])
    )
  ).html;

// ---------------------------------------------------------------------
// Served with the REAL published-site headers, so the CSP is the one a
// visitor gets.
// ---------------------------------------------------------------------
const ROUTES = new Map(LAYOUTS.map((l) => [`/${l.key}`, buildPage(l)]));
const server = createServer((req, res) => {
  const body = ROUTES.get((req.url || "").split("?")[0]);
  if (!body) {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("no");
    return;
  }
  res.writeHead(200, serving.publishedSiteHeaders());
  res.end(body);
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}`;

const proxyServer = process.env.HTTPS_PROXY || process.env.https_proxy || null;
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium",
  // See scripts/unsplash-attribution-proof.mjs — the sandbox's egress
  // proxy resets Chromium's TLS 1.3 handshake, so images.unsplash.com
  // fails without this and every photo renders as an empty box.
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--ssl-version-max=tls1.2"],
  ...(proxyServer ? { proxy: { server: proxyServer, bypass: "127.0.0.1,localhost" } } : {}),
});
const ctx = await browser.newContext({ viewport: { width: 1000, height: 800 } });

// Stringified into the page. Everything here is about PIXELS.
const SEE = () => {
  const results = [];
  // BOTH kinds: the credit beside the photo and the page-level block.
  // The requirement is that a visitor can see AT LEAST ONE naming each
  // photographer — the per-photo one when the layout allows it, the page
  // block always.
  for (const credit of document.querySelectorAll(".unsplash-credit, .unsplash-page-credits span")) {
    const rect = credit.getBoundingClientRect();

    // 1. Clipping: intersect with every ancestor that clips.
    let visible = { top: rect.top, left: rect.left, right: rect.right, bottom: rect.bottom };
    let clippedBy = null;
    for (let node = credit.parentElement; node; node = node.parentElement) {
      const cs = getComputedStyle(node);
      if (!/hidden|clip|auto|scroll/.test(cs.overflow + cs.overflowX + cs.overflowY)) continue;
      const b = node.getBoundingClientRect();
      const next = {
        top: Math.max(visible.top, b.top),
        left: Math.max(visible.left, b.left),
        right: Math.min(visible.right, b.right),
        bottom: Math.min(visible.bottom, b.bottom),
      };
      if (next.right <= next.left || next.bottom <= next.top) {
        clippedBy = `${node.tagName}.${node.className} (${cs.overflow})`;
        visible = next;
        break;
      }
      visible = next;
    }
    const visibleArea = Math.max(0, visible.right - visible.left) * Math.max(0, visible.bottom - visible.top);

    // 2. Occlusion: what is actually on top at the credit's own centre?
    const cx = (visible.left + visible.right) / 2;
    const cy = (visible.top + visible.bottom) / 2;
    const top = visibleArea > 0 ? document.elementFromPoint(cx, cy) : null;
    const reaches = Boolean(top && (top === credit || credit.contains(top) || top.closest(".unsplash-credit") === credit));

    // Recorded so the test can assert the block is the last thing in
    // <body>. Appending it after </html> still renders — browsers are
    // forgiving — so "it is visible" does not prove it was placed where
    // the code claims to place it.
    results.push({
      text: credit.textContent.replace(/\s+/g, " ").trim(),
      boxArea: Math.round(rect.width * rect.height),
      visibleArea: Math.round(visibleArea),
      clippedBy,
      topAtCentre: top ? `${top.tagName}${top.className ? "." + String(top.className).split(" ")[0] : ""}` : null,
      reaches,
      kind: credit.closest(".unsplash-page-credits") ? "page-block" : "beside-photo",
    });
  }
  const block = document.querySelector(".unsplash-page-credits");
  return {
    credits: results,
    blockIsLastInBody: Boolean(block && document.body.lastElementChild === block),
    blockParent: block ? (block.parentElement ? block.parentElement.tagName : "NONE") : null,
  };
};

console.log("== Can a visitor actually SEE the credit? ==\n");
let seenLayouts = 0;
for (const layout of LAYOUTS) {
  const page = await ctx.newPage();
  await page.goto(base + `/${layout.key}`, { waitUntil: "networkidle", timeout: 60000 });
  // Hit-testing uses VIEWPORT coordinates, so the credits block has to be
  // on screen to be tested at all. Scrolling to the foot is also the
  // realistic reading position for a page-foot credit.
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(200);
  const report = await page.evaluate(SEE);
  const seen = report.credits;
  await page.screenshot({ path: `prod-audit/credit-visibility-${layout.key}.png`, fullPage: true });
  await page.close();

  console.log(`  --- ${layout.key}: ${layout.why}`);
  ok(`${layout.key}: at least one credit is in the document`, seen.length > 0);
  const reachable = seen.filter((s) => s.reaches);
  ok(
    `${layout.key}: a credit is reachable by hit-test`,
    reachable.length > 0,
    seen.map((s) => `boxArea=${s.boxArea} visibleArea=${s.visibleArea} clippedBy=${s.clippedBy} topAtCentre=${s.topAtCentre}`).join("\n        ")
  );
  ok(
    `${layout.key}: the reachable credit names the photographer`,
    reachable.some((s) => s.text === "Photo by Ada Lovelace on Unsplash"),
    `texts: ${JSON.stringify(seen.map((s) => s.text))}`
  );
  // The page block is the GUARANTEE, so it is asserted on its own rather
  // than being allowed to hide behind a layout where the inline credit
  // happens to work.
  ok(
    `${layout.key}: the page-level credits block is reachable`,
    reachable.some((s) => s.kind === "page-block"),
    seen
      .filter((s) => s.kind === "page-block")
      .map((s) => `visibleArea=${s.visibleArea} clippedBy=${s.clippedBy} topAtCentre=${s.topAtCentre}`)
      .join("\n        ") || "no page-level block in the document at all"
  );
  ok(
    `${layout.key}: the block is the LAST element inside <body>`,
    report.blockIsLastInBody,
    `parent=${report.blockParent} lastInBody=${report.blockIsLastInBody}`
  );
  if (layout.requireBesidePhoto) {
    // This is what `position:relative` on CREDIT_STYLE buys, and nothing
    // else asserts it: without it the absolutely-positioned <img> paints
    // over its own credit, and the page block alone would keep the suite
    // green while the credit beside the photo was invisible.
    ok(
      `${layout.key}: the credit BESIDE the photo is reachable too`,
      reachable.some((s) => s.kind === "beside-photo"),
      seen
        .filter((s) => s.kind === "beside-photo")
        .map((s) => `visibleArea=${s.visibleArea} topAtCentre=${s.topAtCentre}`)
        .join("\n        ")
    );
  }
  console.log(
    `        carried by: ${[...new Set(reachable.map((s) => s.kind))].join(" + ") || "NOTHING"}`
  );
  seenLayouts += 1;
}

// The shapes MUST include the ones that used to fail, or this file proves
// nothing — a future refactor that quietly drops a layout would turn this
// green by omission.
check("every layout was exercised", seenLayouts, LAYOUTS.length);
ok("the failing shapes are still in the list", LAYOUTS.some((l) => l.key === "full-bleed-hero") && LAYOUTS.some((l) => l.key === "clipped-media-box"));

await browser.close();
server.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
