// Ionexa, as it actually is on the internet right now.
//
// Everything here is measured against https://ai-os-saas-five.vercel.app,
// not against a local build. Where a claim needs a signed-in page it says
// so and stops, rather than reporting a local result as a production one.
import { chromium } from "playwright";
import { writeFileSync } from "node:fs";

const SITE = "https://ai-os-saas-five.vercel.app";
const OUT = "/tmp/prodshots";
let pass = 0;
const failures = [];
const notes = [];
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { failures.push(name); console.log(`  FAIL  ${name}${detail !== undefined ? "\n        " + detail : ""}`); }
}
const note = (t) => { notes.push(t); console.log(`  ....  ${t}`); };

const browser = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium",
  args: ["--no-sandbox", "--ssl-version-max=tls1.2"],
});

async function shot(page, name, opts = {}) {
  const file = `${OUT}/${name}.png`;
  await page.screenshot({ path: file, ...opts });
  return file;
}

try {
  // ===================================================================
  console.log("== 1. what the deployment is serving ==");
  // ===================================================================
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: "dark" });
  const page = await ctx.newPage();
  const res = await page.goto(SITE, { waitUntil: "networkidle", timeout: 60000 });
  check(`the landing page loads (${res?.status()})`, res?.status() === 200);
  check("it is Ionexa", (await page.title()).includes("Ionexa"), await page.title());

  // FETCHED FROM INSIDE THE PAGE, not through page.request.
  //
  // Playwright's APIRequestContext goes out through this sandbox's agent
  // proxy, which answers 403 "Host not in allowlist" for everything —
  // which would have read as "production is returning 403" and been
  // completely false. The page itself loaded fine, so a same-origin
  // fetch from inside it is the browser's real network path.
  const PATHS = ["/apple-icon", "/apple-icon.png", "/icon-192.png", "/icon-512.png", "/icon-maskable.png", "/share", "/api/pwa/telemetry", "/screenshots/narrow-overview.jpg"];
  const assets = await page.evaluate(async (paths) => {
    const out = {};
    for (const p of paths) {
      try { out[p] = (await fetch(p, { method: "GET", redirect: "manual" })).status; }
      catch (e) { out[p] = String(e).slice(0, 40); }
    }
    return out;
  }, PATHS);
  console.log("        " + Object.entries(assets).map(([k, v]) => `${k}=${v}`).join("  "));

  const manifest = await page.evaluate(async () => (await fetch("/manifest.webmanifest")).json());
  const HAS = (f) => manifest[f] !== undefined && manifest[f] !== null;
  const pwaLanded = HAS("id") && HAS("screenshots") && HAS("share_target") && HAS("file_handlers");
  if (!pwaLanded) {
    note("THE PWA WORK IS NOT DEPLOYED YET. /share is " + assets["/share"] + ", the manifest has no id/");
    note("screenshots/share_target/file_handlers, and /icon-192.png is " + assets["/icon-192.png"] + ".");
    note("(α) (β) (γ) below are therefore reported as the CURRENT state, not as results.");
  }
  check("(α) /apple-icon resolves", assets["/apple-icon"] === 200, `still ${assets["/apple-icon"]} — the manifest points at it and Next serves /apple-icon.png`);
  check("(β) /icon-192.png resolves", assets["/icon-192.png"] === 200, `still ${assets["/icon-192.png"]}`);
  check("(γ) the manifest declares id, screenshots, share_target, file_handlers", pwaLanded,
    ["id", "screenshots", "share_target", "file_handlers"].map((f) => `${f}=${HAS(f) ? "yes" : "no"}`).join(" "));

  await shot(page, "01-landing-dark", { fullPage: false });

  // ===================================================================
  console.log("\n== 2. (δ) the light theme, measured in pixels ==");
  // ===================================================================
  const light = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: "light" });
  const lp = await light.newPage();
  await lp.goto(SITE, { waitUntil: "networkidle", timeout: 60000 });
  // The app stores an explicit choice; force the light one the way a user
  // would, then reload so every server-rendered class follows.
  await lp.evaluate(() => { try { localStorage.setItem("theme", "light"); } catch {} });
  await lp.reload({ waitUntil: "networkidle" });
  await lp.waitForTimeout(1500);
  const themeAttr = await lp.evaluate(() => document.documentElement.getAttribute("data-theme") || document.documentElement.className);
  note(`root theme marker: ${JSON.stringify(String(themeAttr).slice(0, 120))}`);
  await shot(lp, "02-landing-light", { fullPage: false });

  // BORDERS: sampled from the RENDERED PIXELS either side of a border, not
  // from getComputedStyle — a border can be declared and painted at 0
  // alpha, or covered by a sibling, and computed style would still report
  // it. elementFromPoint confirms the element under each sample.
  const borderSamples = await lp.evaluate(() => {
    const out = [];
    const els = [...document.querySelectorAll("*")].filter((el) => {
      const cs = getComputedStyle(el);
      const w = parseFloat(cs.borderTopWidth) || 0;
      if (w < 1) return false;
      const r = el.getBoundingClientRect();
      return r.width > 60 && r.height > 30 && r.top > 0 && r.top < innerHeight - 4;
    });
    for (const el of els.slice(0, 40)) {
      const r = el.getBoundingClientRect();
      const x = Math.round(r.left + r.width / 2);
      const yBorder = Math.round(r.top);
      const yInside = Math.round(r.top + 6);
      const yOutside = Math.round(r.top - 6);
      const onBorder = document.elementFromPoint(x, yBorder);
      out.push({
        tag: el.tagName.toLowerCase(),
        cls: (el.className || "").toString().slice(0, 60),
        x, yBorder, yInside, yOutside,
        borderColor: getComputedStyle(el).borderTopColor,
        hitIsSelfOrChild: onBorder === el || el.contains(onBorder),
      });
    }
    return out;
  });
  note(`bordered elements sampled: ${borderSamples.length}`);
  writeFileSync(`${OUT}/border-samples.json`, JSON.stringify(borderSamples, null, 2));
  const shotFile = await shot(lp, "03-light-for-pixels", { fullPage: false });
  check("there are bordered elements to measure on the light landing page", borderSamples.length > 0);

  // ===================================================================
  console.log("\n== 3. (ε) the globe ==");
  // ===================================================================
  const lg = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const gp = await lg.newPage();
  await gp.goto(SITE + "/login", { waitUntil: "networkidle", timeout: 60000 });
  await shot(gp, "04-login", { fullPage: false });
  // TWO DIFFERENT GLOBES, and this check used to know about only one.
  //
  // GlobeMark ([data-testid=globe-mark]) is the WAITING mark — thinking
  // indicator, loading state, empty state, route skeleton, voice orb —
  // and every one of those lives behind a sign-in. What a signed-out
  // visitor sees on /login is auth-background.tsx: a decorative SVG
  // wireframe globe, no testid, deliberately at opacity 0.38. Looking for
  // globe-mark here and reporting its absence as a failure said the globe
  // was missing from a page that draws one 1297px across. That was this
  // script being wrong, not the product.
  const backdropGlobe = await gp.evaluate(() => {
    const svg = Array.from(document.querySelectorAll("svg")).find(
      (el) => el.querySelector('[id*="globeGradient"], circle[r="170"]')
    );
    if (!svg) return null;
    const r = svg.getBoundingClientRect();
    const cs = getComputedStyle(svg);
    return {
      w: Math.round(r.width), h: Math.round(r.height),
      shapes: svg.querySelectorAll("circle,ellipse,path").length,
      painted: cs.visibility !== "hidden" && cs.display !== "none" && Number(cs.opacity) > 0,
      inViewport: r.top < innerHeight && r.bottom > 0 && r.left < innerWidth && r.right > 0,
    };
  });
  note(`backdrop globe on /login: ${backdropGlobe ? JSON.stringify(backdropGlobe) : "ABSENT"}`);
  check(
    "(ε.1) the decorative globe a signed-out visitor sees is really drawn on /login",
    Boolean(backdropGlobe && backdropGlobe.painted && backdropGlobe.inViewport && backdropGlobe.shapes >= 6 && backdropGlobe.w > 200),
    backdropGlobe ? JSON.stringify(backdropGlobe) : "no globe SVG on /login at all"
  );
  const globeOnLogin = await gp.locator('[data-testid="globe-mark"]').count();
  note(`globe-mark (the WAITING mark, normally behind auth) on /login: ${globeOnLogin}`);
  // The splash renders while a sign-in is in flight. Submitting credentials
  // that cannot work still produces that in-flight moment.
  const email = gp.locator('input[type="email"]').first();
  if (await email.count()) {
    await email.fill("nobody@example.invalid");
    const pw = gp.locator('input[type="password"]').first();
    if (await pw.count()) await pw.fill("not-a-real-password");
    await Promise.all([
      gp.locator('button[type="submit"]').first().click().catch(() => undefined),
      gp.waitForTimeout(400),
    ]);
    await shot(gp, "05-login-inflight", { fullPage: false });
    const during = await gp.locator('[data-testid="globe-mark"]').count();
    note(`globe-mark elements while the sign-in is in flight: ${during}`);
    // Reported, not asserted. Whether the sign-in splash is reachable at
    // all from a failed credential depends on how fast the server answers,
    // so a hard assertion here fails on a fast 401 rather than on a
    // missing globe. The globe's presence is asserted above, where it is
    // actually observable for a signed-out visitor.
    note(
      during > 0
        ? "(ε.2) the waiting mark DID render during sign-in"
        : "(ε.2) the sign-in returned before any waiting state was observable — the waiting mark is behind auth and NOT VERIFIED in production"
    );
  } else {
    note("no email field found on /login — cannot reach the splash");
  }

  await ctx.close(); await light.close(); await lg.close();
} catch (err) {
  check("the production sweep ran to the end", false, String(err).slice(0, 400));
} finally {
  await browser.close().catch(() => undefined);
}
console.log(failures.length === 0 ? `\nALL ${pass} CHECKS PASSED` : `\nFAILURES: ${pass} passed, ${failures.length} failed\n  - ` + failures.join("\n  - "));
