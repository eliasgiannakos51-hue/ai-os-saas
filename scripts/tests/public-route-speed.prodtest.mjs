#!/usr/bin/env node
/*
 * HOW FAST THE PUBLIC PRODUCT ACTUALLY IS, MEASURED, ROUTE BY ROUTE.
 *
 * WHAT THIS CANNOT SEE, said first, because a speed report that hides its
 * blind spot is worse than none:
 *
 *   * ONLY THE PUBLIC ROUTES. Every dashboard route is behind a login and
 *     this suite has no credentials, so /dashboard/* is not measured here
 *     and is not guessed at either.
 *   * The numbers are taken from wherever this runs, through whatever
 *     network sits in front of it. The ABSOLUTE figures are therefore not
 *     what a visitor in Athens sees; the COMPARISON between routes, taken
 *     back to back on one machine, is the part that means something, and
 *     it is what the ratchet below is built on.
 *   * INP is not measured. It needs a real interaction from a real
 *     person; a scripted click measures the script. Total Blocking Time
 *     is measured instead and named as itself.
 *
 * MEDIAN OF FIVE, with the spread printed beside it. A median alone hides
 * a cold start, and a cold start is exactly what a first-time visitor
 * pays for.
 *
 * Run: node scripts/tests/public-route-speed.prodtest.mjs
 *      BASE_URL=... to point it somewhere else
 */
import { existsSync } from "node:fs";
import { execFileSync } from "node:child_process";

const BASE = process.env.BASE_URL ?? "https://ai-os-saas-five.vercel.app";
const RUNS = 5;
// Every route a person can reach without an account. /dashboard is here
// as the redirect it is: an unauthenticated visitor's first hop.
const ROUTES = [
  "/",
  "/pricing",
  "/login",
  "/signup",
  "/roadmap",
  "/help",
  "/terms",
  "/privacy",
  "/cookies",
];
// The ones worth loading in a browser: the four a stranger actually
// lands on, plus /help, which the TTFB pass singles out.
const VITAL_ROUTES = ["/", "/pricing", "/signup", "/roadmap", "/help"];

let pass = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    failures.push(name);
    console.log(`  FAIL  ${name}${detail ? "\n        " + detail : ""}`);
  }
}

const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

// ---------------------------------------------------------------- TTFB
console.log(`== 1. time to first byte, median of ${RUNS} (${BASE}) ==`);
const ttfb = new Map();
// CURL, NOT fetch(). Node 22's global fetch is undici, and undici does not
// read HTTPS_PROXY — so in any environment that routes egress through a
// proxy (this one does) every request leaves unproxied and comes back 403,
// filling the table with dashes that read as "production is down". curl
// honours the proxy, and `%{time_starttransfer}` is a truer first-byte
// number than wrapping a promise around a response object.
const curlTtfb = (url) => {
  const out = execFileSync(
    "curl",
    ["-sS", "-o", "/dev/null", "-w", "%{http_code} %{time_starttransfer} %{size_download}", url],
    { encoding: "utf8" },
  ).trim();
  const [code, seconds, bytes] = out.split(/\s+/);
  if (Number(code) >= 400) throw new Error(`HTTP ${code}`);
  return { ms: Number(seconds) * 1000, bytes: Number(bytes) };
};
for (const route of ROUTES) {
  const samples = [];
  let bytes = null;
  for (let i = 0; i < RUNS; i++) {
    try {
      const r = curlTtfb(`${BASE}${route}`);
      samples.push(r.ms);
      bytes = r.bytes;
    } catch (e) {
      console.log(`        ${route} run ${i + 1}: ${e.message}`);
    }
  }
  if (samples.length === 0) {
    ttfb.set(route, null);
    continue;
  }
  const sorted = [...samples].sort((a, b) => a - b);
  ttfb.set(route, {
    median: Math.round(median(samples)),
    min: Math.round(sorted[0]),
    max: Math.round(sorted[sorted.length - 1]),
    bytes,
    runs: samples.length,
  });
}
console.log("\n  route             runs   median      min      max    bytes");
for (const [route, m] of ttfb) {
  if (!m) {
    console.log(`  ${route.padEnd(16)}    0        —        —        —        —`);
    continue;
  }
  console.log(
    `  ${route.padEnd(16)} ${String(m.runs).padStart(4)} ${String(m.median).padStart(8)} ${String(m.min).padStart(8)} ${String(m.max).padStart(8)} ${String(m.bytes).padStart(8)}`,
  );
}

const measured = [...ttfb.entries()].filter(([, m]) => m);
check(
  `every public route answered (${measured.length}/${ROUTES.length})`,
  measured.length === ROUTES.length,
  [...ttfb.entries()].filter(([, m]) => !m).map(([r]) => r).join(", "),
);

// THE COMPARISON, NOT THE ABSOLUTE. Network conditions move every number
// on this list together; what does not move together is one route being
// several times slower than its siblings, and that is the thing worth
// failing a build over.
const medians = measured.map(([, m]) => m.median);
const typical = median(medians);
const outliers = measured
  .filter(([, m]) => m.median > typical * 3)
  .map(([route, m]) => `${route}: ${m.median}ms against a ${typical}ms typical route`);
check(
  `no public route is more than 3x the typical one (typical ${typical}ms)`,
  outliers.length === 0,
  outliers.join("\n        "),
);

// ------------------------------------------------------------- browser
console.log("\n== 2. what a browser sees ==");
const CHROMIUM = "/opt/pw-browsers/chromium";
let browser = null;
if (!existsSync(CHROMIUM)) {
  console.log("  SKIP  no chromium at /opt/pw-browsers/chromium");
} else {
  const { chromium } = await import("playwright");
  // --ssl-version-max=tls1.2 is not a nicety here: without it every
  // navigation to production dies with ERR_CONNECTION_RESET before a
  // single byte arrives, and the table fills with dashes that read as
  // "the site is down" rather than "the browser could not negotiate".
  // The other prodtests in this directory point at a local server and
  // never needed it.
  browser = await chromium.launch({
    executablePath: CHROMIUM,
    args: ["--ssl-version-max=tls1.2"],
  });
}

if (browser) {
  const rows = [];
  for (const route of VITAL_ROUTES) {
    const lcps = [];
    const clss = [];
    const tbts = [];
    for (let i = 0; i < RUNS; i++) {
      const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      const page = await context.newPage();
      await page.addInitScript(() => {
        window.__lcp = 0;
        window.__cls = 0;
        window.__tbt = 0;
        new PerformanceObserver((l) => {
          for (const e of l.getEntries()) window.__lcp = e.startTime;
        }).observe({ type: "largest-contentful-paint", buffered: true });
        new PerformanceObserver((l) => {
          for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value;
        }).observe({ type: "layout-shift", buffered: true });
        new PerformanceObserver((l) => {
          for (const e of l.getEntries()) window.__tbt += Math.max(0, e.duration - 50);
        }).observe({ type: "longtask", buffered: true });
      });
      try {
        await page.goto(`${BASE}${route}`, { waitUntil: "load", timeout: 60000 });
        // Long enough for a late LCP candidate and a late shift to land.
        await page.waitForTimeout(2000);
        const m = await page.evaluate(() => ({
          lcp: window.__lcp,
          cls: window.__cls,
          tbt: window.__tbt,
        }));
        lcps.push(m.lcp);
        clss.push(m.cls);
        tbts.push(m.tbt);
      } catch (e) {
        console.log(`        ${route} run ${i + 1}: ${e.message}`);
      }
      await context.close();
    }
    rows.push({
      route,
      runs: lcps.length,
      lcp: lcps.length ? Math.round(median(lcps)) : null,
      cls: clss.length ? Number(median(clss).toFixed(3)) : null,
      tbt: tbts.length ? Math.round(median(tbts)) : null,
    });
  }
  await browser.close();

  console.log("\n  route             runs      LCP      CLS      TBT");
  for (const r of rows) {
    console.log(
      `  ${r.route.padEnd(16)} ${String(r.runs).padStart(4)} ${String(r.lcp ?? "—").padStart(8)} ${String(r.cls ?? "—").padStart(8)} ${String(r.tbt ?? "—").padStart(8)}`,
    );
  }

  const withData = rows.filter((r) => r.runs > 0);
  check(
    `every route loaded in the browser (${withData.length}/${VITAL_ROUTES.length})`,
    withData.length === VITAL_ROUTES.length,
    rows.filter((r) => r.runs === 0).map((r) => r.route).join(", "),
  );
  // CLS IS THE ONE THAT IS NOT ABOUT THE NETWORK. A layout that jumps
  // does so on a fast connection too, so this threshold is Google's
  // "good" bar and means the same thing wherever it is measured.
  const shifty = withData
    .filter((r) => r.cls > 0.1)
    .map((r) => `${r.route}: CLS ${r.cls}`);
  check("no public route shifts its layout past 0.1", shifty.length === 0, shifty.join(", "));
}

console.log(
  `\n${failures.length === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${failures.length} failed`,
);
process.exit(failures.length === 0 ? 0 : 1);
