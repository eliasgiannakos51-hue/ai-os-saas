#!/usr/bin/env node
/*
 * THE WHOLE SITE, OPENED PAGE BY PAGE — part Γ of docs/CONTEXT.md.
 *
 * Run: AUDIT=<dir> node scripts/site-audit.mjs
 *      AUDIT=<dir> SKIP_BUILD=1 node scripts/site-audit.mjs   (reuse .next)
 *
 * THE PAGE LIST COMES FROM THE CODE: every page.tsx under src/app, the
 * route read off its folder. A page with a dynamic segment ([id]) needs a
 * real record and is LISTED, not opened — the report says which.
 *
 * FOR EACH PAGE, AT 1440×900 AND 390×844:
 *   - the HTTP status and where it landed (a redirect is reported, never
 *     silently photographed as the page asked for);
 *   - console errors and uncaught page errors;
 *   - horizontal scroll (the document wider than the window);
 *   - text cut with an ellipsis (computed text-overflow, and overflowing);
 *   - on the phone, controls smaller than 44px in either direction;
 *   - axe-core's WCAG 2 A/AA rules, colour contrast among them;
 *   - LCP and CLS from the browser's own PerformanceObserver;
 *   - a screenshot.
 *
 * THE SAME TRADE AS scripts/ui-shots.mjs, and the report carries it: the
 * CODE is the real production build, served by `next start`; the DATA is
 * lib/mock-supabase.mjs — an empty Ultimate account with a forged session.
 * So it shows the interface honestly and every list empty. What a real
 * account looks like, and the Vercel preview, need BOT_EMAIL and
 * BOT_PASSWORD (docs/NEEDS-FROM-ELIAS.md, 2).
 *
 * LCP AND CLS HERE ARE A LOCAL MACHINE'S, against a stand-in database on
 * the same host: useful to compare pages with each other and to catch a
 * layout that jumps, not a figure for what a visitor on a phone gets.
 */
import { spawn } from "node:child_process";
import { mkdirSync, readdirSync, statSync, writeFileSync, readFileSync } from "node:fs";
import path from "node:path";
import http from "node:http";
import { createRequire } from "node:module";
import { startMockSupabase, MOCK_USER } from "./lib/mock-supabase.mjs";
import { loadTs } from "./tests/load-ts.mjs";

const OUT = process.env.AUDIT;
if (!OUT) {
  console.log("AUDIT=<directory> is required — that is where the report and the screenshots go.");
  process.exit(2);
}
mkdirSync(OUT, { recursive: true });

// ---------------------------------------------------------------- pages
function pagesOnDisk() {
  const out = [];
  (function walk(dir) {
    for (const e of readdirSync(dir)) {
      const p = path.join(dir, e);
      if (statSync(p).isDirectory()) {
        if (p === path.join("src", "app", "api")) continue;
        walk(p);
      } else if (e === "page.tsx") {
        const rel = path.relative(path.join("src", "app"), path.dirname(p)).split(path.sep);
        const route = "/" + rel.filter((s) => s && !/^\(.*\)$/.test(s)).join("/");
        out.push({ file: p, route: route === "/" ? "/" : route.replace(/\/$/, "") });
      }
    }
  })(path.join("src", "app"));
  return out.sort((a, b) => a.route.localeCompare(b.route));
}
const ALL = pagesOnDisk();
const dynamic = ALL.filter((p) => /\[/.test(p.route));
const pages = ALL.filter((p) => !/\[/.test(p.route));
const signedIn = (route) => route.startsWith("/dashboard") || route.startsWith("/onboarding") || route.startsWith("/delete-account");

// ---------------------------------------------------------------- server
MOCK_USER.user_metadata = { subscription_tier: "ultimate", display_name: "Νίκο" };
const { PLANS } = await loadTs("src/lib/billing/plans.ts");
const ULTIMATE = PLANS.find((p) => p.slug === "ultimate")?.monthlyCredits ?? 0;
const PORT = 34581;
const ORIGIN = `http://127.0.0.1:${PORT}`;
const supa = await startMockSupabase({
  port: 54361,
  tableRows: { user_credits: [{ user_id: MOCK_USER.id, credits_remaining: ULTIMATE, credits_total: ULTIMATE }] },
});
const env = {
  ...process.env,
  NODE_ENV: "production",
  PORT: String(PORT),
  NEXT_PUBLIC_SUPABASE_URL: supa.url,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: supa.anonKey,
  SUPABASE_SERVICE_ROLE_KEY: supa.serviceKey,
  NEXT_PUBLIC_SITE_URL: ORIGIN,
};

let server = null;
let browser = null;
const stop = () => {
  try { if (server?.pid) process.kill(-server.pid, "SIGKILL"); } catch {}
  try { supa.close(); } catch {}
};

const require = createRequire(import.meta.url);
const AXE = readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");

// What runs inside the page once it has settled.
const MEASURE = () => {
  const vis = (el) => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none";
  };
  const describe = (el) => {
    const t = (el.innerText || el.getAttribute("aria-label") || el.getAttribute("title") || "").trim().replace(/\s+/g, " ");
    return `${el.tagName.toLowerCase()}${el.getAttribute("data-testid") ? `[${el.getAttribute("data-testid")}]` : ""} "${t.slice(0, 40)}"`;
  };
  const overflowX = document.documentElement.scrollWidth - window.innerWidth;
  const ellipsis = [...document.querySelectorAll("body *")]
    // A file input's "no file chosen" is the browser's own text, cut by
    // the browser; it is not a name this product wrote.
    .filter((el) => !(el.tagName === "INPUT" && el.type === "file"))
    .filter((el) => vis(el) && getComputedStyle(el).textOverflow === "ellipsis" && el.scrollWidth > el.clientWidth + 1)
    .map(describe);
  const small = [...document.querySelectorAll('a[href], button, input:not([type=hidden]), select, textarea, [role=button], [role=tab]')]
    .filter(vis)
    .filter((el) => {
      // An sr-only input (1×1) is not a target; the button that opens it is.
      const own = el.getBoundingClientRect();
      if (own.width <= 1 && own.height <= 1) return false;
      // A link inside a sentence is sized by the sentence (WCAG 2.5.8's
      // inline exception); everything else is a control.
      if (el.tagName === "A" && getComputedStyle(el).display === "inline") return false;
      // A checkbox or radio inside its label is pressed through the label,
      // which is the target that has to be big enough.
      if (el.tagName === "INPUT" && /checkbox|radio/.test(el.type)) {
        const label = el.closest("label");
        if (label) {
          const lr = label.getBoundingClientRect();
          if (lr.width >= 44 && lr.height >= 44) return false;
        }
      }
      const r = el.getBoundingClientRect();
      return r.width < 44 || r.height < 44;
    })
    .map((el) => {
      const r = el.getBoundingClientRect();
      return `${describe(el)} ${Math.round(r.width)}×${Math.round(r.height)}`;
    });
  return { overflowX, ellipsis, small, title: document.title, h1: document.querySelector("h1")?.innerText?.trim() ?? null };
};

try {
  if (!process.env.SKIP_BUILD) {
    console.log("next build (production, against the stand-in) ...");
    const build = spawn("npx", ["next", "build"], { env, stdio: ["ignore", "pipe", "pipe"] });
    let log = "";
    build.stdout.on("data", (d) => (log += d));
    build.stderr.on("data", (d) => (log += d));
    if ((await new Promise((r) => build.on("close", r))) !== 0) {
      console.log("build failed\n" + log.slice(-2000));
      stop();
      process.exit(1);
    }
  }
  server = spawn("npx", ["next", "start", "-p", String(PORT)], { env, stdio: ["ignore", "pipe", "pipe"], detached: true });
  let up = false;
  for (let i = 0; i < 60 && !up; i++) {
    up = await new Promise((res) => {
      const r = http.get(`${ORIGIN}/api/health`, () => res(true));
      r.on("error", () => res(false));
    });
    if (!up) await new Promise((r) => setTimeout(r, 1000));
  }
  if (!up) {
    console.log("the server did not start");
    stop();
    process.exit(1);
  }

  const { chromium } = await import("playwright");
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium" });
  const DEVICES = [
    ["desktop", 1440, 900],
    ["phone", 390, 844],
  ];
  const results = [];
  for (const [dev, width, height] of DEVICES) {
    mkdirSync(path.join(OUT, dev), { recursive: true });
    for (const auth of [true, false]) {
      const ctx = await browser.newContext({ viewport: { width, height }, hasTouch: dev === "phone", locale: "el-GR" });
      if (auth) await ctx.addCookies([{ ...supa.authCookie, domain: "127.0.0.1", path: "/", httpOnly: false, secure: false, sameSite: "Lax" }]);
      await ctx.addInitScript(() => {
        window.__lcp = 0;
        window.__cls = 0;
        try {
          new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__lcp = e.startTime; }).observe({ type: "largest-contentful-paint", buffered: true });
          new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value; }).observe({ type: "layout-shift", buffered: true });
        } catch {}
      });
      for (const pg of pages.filter((p) => signedIn(p.route) === auth)) {
        const page = await ctx.newPage();
        const consoleErrors = [];
        page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text().slice(0, 160)); });
        page.on("pageerror", (e) => consoleErrors.push(`pageerror: ${String(e.message).slice(0, 160)}`));
        const row = { device: dev, route: pg.route, file: pg.file };
        try {
          const resp = await page.goto(ORIGIN + pg.route, { waitUntil: "networkidle", timeout: 60_000 });
          await page.waitForTimeout(800);
          row.status = resp?.status() ?? null;
          row.landed = new URL(page.url()).pathname;
          Object.assign(row, await page.evaluate(MEASURE));
          await page.addScriptTag({ content: AXE });
          const axe = await page.evaluate(async () => {
            const r = await window.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa"] } });
            return r.violations.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length, sample: v.nodes[0]?.target?.join(" ") ?? "" }));
          });
          row.axe = axe;
          const perf = await page.evaluate(() => ({ lcp: Math.round(window.__lcp), cls: Math.round(window.__cls * 1000) / 1000 }));
          Object.assign(row, perf);
          const name = pg.route === "/" ? "landing" : pg.route.slice(1).replace(/\//g, "__");
          await page.screenshot({ path: path.join(OUT, dev, `${name}.png`), fullPage: false });
          row.shot = `${dev}/${name}.png`;
        } catch (err) {
          row.error = String(err.message).slice(0, 200);
        }
        row.consoleErrors = consoleErrors;
        results.push(row);
        const flags = [
          row.error ? "ERROR" : null,
          row.status && row.status >= 400 ? `HTTP ${row.status}` : null,
          row.landed && row.landed !== pg.route ? `→ ${row.landed}` : null,
          row.overflowX > 1 ? `overflow ${row.overflowX}px` : null,
          row.ellipsis?.length ? `ellipsis ${row.ellipsis.length}` : null,
          dev === "phone" && row.small?.length ? `small ${row.small.length}` : null,
          row.axe?.length ? `axe ${row.axe.map((v) => v.id).join(",")}` : null,
          consoleErrors.length ? `console ${consoleErrors.length}` : null,
        ].filter(Boolean);
        console.log(`${dev.padEnd(8)} ${pg.route.padEnd(34)} ${flags.join(" · ") || "clean"}`);
        await page.close();
      }
      await ctx.close();
    }
  }
  writeFileSync(path.join(OUT, "audit.json"), JSON.stringify({ when: new Date().toISOString(), pages: pages.length, dynamic: dynamic.map((d) => d.route), results }, null, 2));
  console.log(`\n${pages.length} pages × ${DEVICES.length} widths; ${dynamic.length} need a record and were listed, not opened: ${dynamic.map((d) => d.route).join(", ")}`);
  console.log(`report: ${path.join(OUT, "audit.json")}`);
} finally {
  if (browser) await browser.close().catch(() => {});
  stop();
}
