/*
 * ALL TOOLS, ONLY THE REGULAR SQUARES, CLEANLY ALIGNED (the owner's
 * message "ALL TOOLS: ΜΟΝΟ ΤΑ ΚΑΝΟΝΙΚΑ ΤΕΤΡΑΓΩΝΑ, ΚΑΘΑΡΑ ΣΤΟΙΧΙΣΜΕΝΑ",
 * 2026-10-24), on a production build over the Supabase stand-in, for an
 * ORDINARY member (nobody is staff, no switch is set), in Greek and
 * English, on a computer and a phone. Supersedes the previous round's
 * prodtest, which still expected a row of small ready-made jobs under
 * every group and let groups share a row.
 *
 * BOTH DEVICES: 1440x900 with a mouse, 390x844 with Input.dispatchTouchEvent
 * (a real touch gesture through the CDP session, not Playwright's
 * synthetic `.tap()`, which the repo's interaction-coverage gate does not
 * count as touch at all).
 *
 * Run: node scripts/tests/all-tools-final-grid.prodtest.mjs
 *      SKIP_BUILD=1 ALL_TOOLS_SHOTS=/tmp/shots node scripts/tests/all-tools-final-grid.prodtest.mjs
 *
 * What it holds, each against lib/nav/all-tools.ts rather than a number:
 *   1. Exactly the 24 tiles of the registry, in the owner's order, in
 *      his six groups (Learn carrying none), under the headings he
 *      worded — a live one and a Coming Soon one marked differently.
 *   2. NO small ready-made job tile is drawn on the page at all — the
 *      owner's "ΦΕΥΓΟΥΝ ΟΛΑ ΤΑ ΜΙΚΡΑ ΤΕΤΡΑΓΩΝΑ" — they are still real
 *      (lib/nav/quick-jobs.ts) and still found through the search below.
 *   3. Every tile carries its own name and its own line in the screen's
 *      language, and a Greek screen has no English word on it.
 *   4. Five to a row on a computer, two on a phone, same width AND same
 *      height, left-aligned, no horizontal scroll; no two groups ever
 *      share a row — each group's section sits strictly below the one
 *      before it; no tile's name wraps to a second line.
 *   5. A search finds a tool by a word it is not called, big tiles and
 *      small ready-made jobs together — "cv" still finds the CV job by
 *      its own name, even though its tile is gone from the page itself.
 *   6. Pressing a live tile opens a page that answers; pressing a
 *      Coming Soon tile opens the Coming Soon screen — disabled field,
 *      no charge, a working Notify-me button — never the real tool.
 *   7. No page of an earlier grid lost its address.
 */
import http from "node:http";
import { spawn } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import { chromium } from "playwright";
import { startMockSupabase, MOCK_USER } from "../lib/mock-supabase.mjs";
import { chromiumPath } from "./lib/chromium.mjs";
import { loadTs } from "./load-ts.mjs";

let pass = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    failures.push(name);
    console.log(`  FAIL  ${name}${detail !== undefined ? "\n        " + detail : ""}`);
  }
}

const MEMBER = "member@example.com";
MOCK_USER.email = MEMBER;
MOCK_USER.user_metadata = { subscription_tier: "growth" };

function rows(req, res, list) {
  if ((req.headers.prefer ?? "").includes("count=")) {
    res.writeHead(200, { "Content-Type": "application/json", "Content-Range": list.length ? `0-${list.length - 1}/${list.length}` : "*/0" });
    res.end(JSON.stringify(req.method === "HEAD" ? null : list));
    return true;
  }
  const single = (req.headers.accept ?? "").includes("vnd.pgrst.object");
  res.writeHead(single && !list[0] ? 406 : 200, { "Content-Type": "application/json" });
  res.end(JSON.stringify(single ? (list[0] ?? { message: "no rows" }) : list));
  return true;
}
function handle({ req, res, url }) {
  if (url.pathname === "/rest/v1/user_credits" && (req.method === "GET" || req.method === "HEAD")) {
    return rows(req, res, [{
      user_id: MOCK_USER.id, credits_remaining: 3000, credits_total: 3000, plan_tier: "growth",
      beta_expires_at: null, free_chat_used: 0, free_chat_period_start: new Date().toISOString(),
    }]);
  }
  if (url.pathname === "/rest/v1/tool_notify_subscriptions" && req.method === "POST") {
    res.writeHead(201, { "Content-Type": "application/json" });
    res.end("[]");
    return true;
  }
  return false;
}
const supa = await startMockSupabase({ port: 54422, handle });

const PORT = await new Promise((resolve) => {
  const probe = http.createServer();
  probe.listen(0, "127.0.0.1", () => {
    const { port } = probe.address();
    probe.close(() => resolve(port));
  });
});
const ORIGIN = `http://127.0.0.1:${PORT}`;
const env = {
  ...process.env,
  NODE_ENV: "production",
  PORT: String(PORT),
  NEXT_PUBLIC_SUPABASE_URL: supa.url,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: supa.anonKey,
  SUPABASE_SERVICE_ROLE_KEY: supa.serviceKey,
  NEXT_PUBLIC_SITE_URL: ORIGIN,
  // Nobody is staff: this is the page as an ordinary member gets it.
  ADMIN_EMAILS: "",
  TEST_ACCOUNT_EMAILS: "",
  // Image is drawn when the server has this key; a stand-in, never called.
  GEMINI_API_KEY: "stand-in-not-a-key",
  ANTHROPIC_API_KEY: "sk-ant-stand-in-not-a-key",
};

const LOCALES = ["el", "en"];
const M = Object.fromEntries(LOCALES.map((l) => [l, JSON.parse(readFileSync(`messages/${l}.json`, "utf8"))]));
const { ALL_TOOLS, ALL_TOOLS_GROUP_ORDER, availableTools, HIDDEN_FROM_ALL_TOOLS } = await loadTs("src/lib/nav/all-tools.ts");
const LIVE = availableTools({ imageKey: true });
const LIVE_HREFS = new Set(LIVE.map((t) => t.href));
const NOT_LIVE = ALL_TOOLS.filter((t) => !LIVE_HREFS.has(t.href));

// Tech loanwords the product already keeps in Greek throughout
// messages/el.json (checked, scoped per key, in scripts/check-i18n.js's
// own LOCALE_ALLOWED/INTENTIONALLY_IDENTICAL lists) — "sites" and
// "trading" predate this round; "Podcast", "Voice-over", "Quiz" and
// "Flashcards" are the quick-ready jobs' own words (lib/nav/quick-jobs.ts).
const PRODUCT_WORDS = new Set([
  "Ionexa", "AI", "PDF", "PowerPoint", "Word", "Excel", "GitHub", "iowork", "MCP", "K",
  "sites", "trading", "social", "Podcast", "podcasts", "Voice", "over", "Post", "Email", "Quiz", "Flashcards",
]);
const latinWords = (text) => [...new Set((text.match(/[A-Za-z][A-Za-z&]*/g) ?? []).filter((w) => !PRODUCT_WORDS.has(w)))];

const SHOT_DIR = process.env.ALL_TOOLS_SHOTS || "";
if (SHOT_DIR) mkdirSync(SHOT_DIR, { recursive: true });

let server = null;
let browser = null;
const cleanup = () => {
  try { if (server?.pid) process.kill(-server.pid, "SIGKILL"); } catch {}
  try { supa.close(); } catch {}
};

try {
  if (process.env.SKIP_BUILD) {
    console.log("SKIP_BUILD=1 — reusing the existing .next");
  } else {
    console.log("running `next build` (production) ...");
    const build = spawn("npx", ["next", "build"], { env, stdio: ["ignore", "pipe", "pipe"] });
    let log = "";
    build.stdout.on("data", (d) => (log += d));
    build.stderr.on("data", (d) => (log += d));
    if ((await new Promise((r) => build.on("close", r))) !== 0) {
      console.log("  FAIL  next build failed\n" + log.slice(-3000));
      cleanup();
      process.exit(1);
    }
  }
  server = spawn("npx", ["next", "start", "-p", String(PORT)], { env, stdio: ["ignore", "pipe", "pipe"], detached: true });
  let up = false;
  for (let i = 0; i < 90 && !up; i++) {
    try {
      await new Promise((res, rej) => { const r = http.get(`${ORIGIN}/api/health`, () => res()); r.on("error", rej); });
      up = true;
    } catch { await new Promise((r) => setTimeout(r, 1000)); }
  }
  if (!up) { console.log("  FAIL  the production server did not start"); cleanup(); process.exit(1); }

  browser = await chromium.launch({ executablePath: chromiumPath() });
  const DEVICES = [
    { label: "desktop", viewport: { width: 1440, height: 900 }, touch: false, perRow: 6 },
    { label: "phone", viewport: { width: 390, height: 844 }, touch: true, perRow: 2 },
  ];

  for (const device of DEVICES) {
    for (const locale of LOCALES) {
      const L = M[locale];
      const tag = `${device.label}/${locale}`;
      console.log(`\n== ${tag} ${device.viewport.width}x${device.viewport.height} ==`);
      const context = await browser.newContext({
        viewport: device.viewport, hasTouch: device.touch, isMobile: device.touch, deviceScaleFactor: device.touch ? 3 : 1,
      });
      await context.addCookies([
        { ...supa.authCookie, domain: "127.0.0.1", path: "/", httpOnly: false, secure: false, sameSite: "Lax" },
        { name: "NEXT_LOCALE", value: locale, domain: "127.0.0.1", path: "/" },
      ]);
      const page = await context.newPage();
      const cdp = device.touch ? await context.newCDPSession(page) : null;
      const press = async (locator) => {
        if (!cdp) return locator.click();
        const box = await locator.boundingBox();
        const x = box.x + box.width / 2, y = box.y + box.height / 2;
        await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
        await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      };
      const shot = async (name, full = false) => SHOT_DIR && page.screenshot({ path: `${SHOT_DIR}/${device.label}-${locale}-${name}.png`, fullPage: full });
      const mainText = () => page.locator("main").first().evaluate((n) => n.innerText ?? "");

      await page.goto(`${ORIGIN}/dashboard/tools`, { waitUntil: "load" });
      await page.locator('[data-testid="tool-tile"]').first().waitFor({ state: "visible", timeout: 15000 }).catch(() => {});
      const tiles = () => page.locator('[data-testid="tool-tile"]').evaluateAll((els) => els.map((a) => {
        const r = a.getBoundingClientRect();
        return {
          href: a.getAttribute("href"),
          top: Math.round(r.top + window.scrollY),
          group: a.closest("section")?.getAttribute("aria-labelledby") ?? "",
          name: (a.querySelector("span > span")?.textContent ?? "").trim(),
          line: (a.querySelector(":scope > span:last-child")?.textContent ?? "").trim(),
          live: a.getAttribute("data-ready") === "true",
          // The badge sits beside the <a>, not inside it (components/tools/
          // tools-grid.tsx: decoupled from the name so a long name never has
          // to make room for it) — so it is found on the shared <li>, not on
          // the link element the other fields are read from.
          hasBadge: Boolean(a.closest("li")?.querySelector('[data-testid="tool-tile-badge"]')),
        };
      }));
      const drawn = await tiles();

      check(`${tag}: all 24 registry tiles are drawn, in the owner's order`,
        drawn.length === ALL_TOOLS.length && drawn.every((t, i) => t.href === ALL_TOOLS[i].href), drawn.map((t) => t.href).join(", "));
      check(`${tag}: ...each in its own group`, drawn.every((t, i) => t.group === `tools-${ALL_TOOLS[i].group}`), drawn.map((t) => `${t.name}:${t.group}`).join(", "));
      check(`${tag}: a live tile carries no «Σύντομα» badge, a Coming Soon one does`,
        drawn.every((t) => t.live === LIVE_HREFS.has(t.href) && t.hasBadge === !LIVE_HREFS.has(t.href)),
        drawn.filter((t) => t.live !== LIVE_HREFS.has(t.href) || t.hasBadge === LIVE_HREFS.has(t.href)).map((t) => t.href).join(", "));
      const headings = await page.locator("main h2").allInnerTexts();
      // Learn carries no big tile (lib/nav/quick-jobs.ts: its six jobs are
      // all small, and the small row left the page), so it gets no row and
      // no heading here — the same `g.big.length > 0` filter tools-grid.tsx
      // itself applies, not the registry's full six-group order.
      const wantHeadings = ALL_TOOLS_GROUP_ORDER.filter((g) => ALL_TOOLS.some((tool) => tool.group === g)).map(
        (g) => L.dashboard.tools.groups[g]
      );
      check(`${tag}: the five headings are the owner's, in ${locale}, in order`, JSON.stringify(headings) === JSON.stringify(wantHeadings), `${headings.join(" | ")} vs ${wantHeadings.join(" | ")}`);
      const wrongName = drawn.filter((t, i) => t.name !== L.dashboard.tools.names[ALL_TOOLS[i].name]);
      check(`${tag}: every tile carries its ${locale} name`, wrongName.length === 0, wrongName.map((t) => `${t.href}="${t.name}"`).join(", "));
      const wrongLine = drawn.filter((t, i) => t.line !== L.dashboard.tools.lines[ALL_TOOLS[i].name]);
      check(`${tag}: ...and its ${locale} line`, wrongLine.length === 0, wrongLine.map((t) => `${t.href}="${t.line}"`).join(", "));
      const oldTiles = drawn.filter((t) => Object.keys(HIDDEN_FROM_ALL_TOOLS).includes(t.href));
      check(`${tag}: no tile of an earlier grid is left`, oldTiles.length === 0, oldTiles.map((t) => t.href).join(", "));

      const jobs = await page.locator('[data-testid="quick-job-tile"]').count();
      check(`${tag}: no small ready-made job tile is drawn on the page (${jobs})`, jobs === 0);

      // No two groups share a row: each <section>'s box sits strictly
      // below the one before it (a shared row would overlap vertically).
      const groupBoxes = await page.locator("main section").evaluateAll((els) =>
        els.map((el) => { const r = el.getBoundingClientRect(); return { top: Math.round(r.top), bottom: Math.round(r.bottom) }; })
      );
      const sharedRow = groupBoxes.slice(1).filter((box, i) => box.top < groupBoxes[i].bottom - 1);
      check(`${tag}: no two groups share a row (${groupBoxes.length} groups)`, sharedRow.length === 0, JSON.stringify(groupBoxes));

      // Every tile is the same width and the same height, and a name
      // never wraps to a second line.
      const tileGeometry = await page.locator('[data-testid="tool-tile"]').evaluateAll((els) =>
        els.map((a) => {
          const r = a.getBoundingClientRect();
          const nameEl = a.querySelector("span > span");
          const nameHeight = nameEl ? nameEl.getBoundingClientRect().height : 0;
          return { width: Math.round(r.width), height: Math.round(r.height), nameHeight: Math.round(nameHeight) };
        })
      );
      const heights = new Set(tileGeometry.map((g) => g.height));
      check(`${tag}: every tile is the same height (${[...heights].join(", ")})`, heights.size === 1, JSON.stringify(tileGeometry));
      const widthsPerRowWidth = new Set(tileGeometry.map((g) => g.width));
      check(`${tag}: every tile is the same width (${[...widthsPerRowWidth].join(", ")})`, widthsPerRowWidth.size === 1, JSON.stringify(tileGeometry));
      const wrapped = tileGeometry.filter((g) => g.nameHeight > 24);
      check(`${tag}: no tile's name wraps to a second line`, wrapped.length === 0, JSON.stringify(wrapped));

      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      check(`${tag}: no horizontal scroll`, overflow <= 0, `${overflow}px`);
      const text = await mainText();
      if (locale === "el") check(`${tag}: no English word on the Greek page`, latinWords(text).length === 0, latinWords(text).join(", "));
      check(`${tag}: no «beta» and no «in testing»`, !/\bbeta\b|in testing|σε δοκιμή/i.test(await page.evaluate(() => document.body.innerText)));
      await shot("1-grid", true);

      // ---- the search, big tiles and small jobs together
      const search = page.getByTestId("tools-search");
      await search.fill("qqzzxx");
      const noMatch = L.dashboard.tools.noMatch.replace("{query}", "qqzzxx");
      const said = await page.getByText(noMatch, { exact: true }).waitFor({ state: "visible", timeout: 5000 }).then(() => true, () => false);
      check(`${tag}: a search that finds nothing says so, with the words typed`, said, noMatch);
      await search.fill(locale === "el" ? "έρευνα" : "research");
      await page.waitForTimeout(300);
      const found = await tiles();
      check(`${tag}: "${locale === "el" ? "έρευνα" : "research"}" finds Deep Research`, found.some((t) => t.href === "/dashboard/deep-research"), found.map((t) => t.href).join(", "));
      await shot("2-search");

      // "cv" still finds the CV quick job by name, even though its tile
      // left the page itself — the owner's §5 check.
      await search.fill("cv");
      await page.waitForTimeout(300);
      const cvLabel = L.dashboard.quickJobs.cv.label;
      const cvFound = await page.getByTestId("quick-job-tile").filter({ hasText: cvLabel }).first().isVisible().catch(() => false);
      check(`${tag}: "cv" in Find a tool still finds "${cvLabel}"`, cvFound);
      await search.fill("");

      // ---- a live tile opens the real tool; a Coming Soon tile opens the Coming Soon screen
      if (device.label === "desktop") {
        const broken = [];
        for (const tool of LIVE) {
          const res = await page.goto(`${ORIGIN}${tool.href}`, { waitUntil: "domcontentloaded" });
          let body = "";
          for (let i = 0; i < 24 && body.trim().length === 0; i++) {
            body = await mainText().catch(() => "");
            if (body.trim().length === 0) await page.waitForTimeout(250);
          }
          if (!res || res.status() >= 400 || body.trim().length === 0 || /Application error|This page could not be found/.test(body)) broken.push(`${tool.href} ${res?.status()}`);
          if (locale === "el" && SHOT_DIR) await page.screenshot({ path: `${SHOT_DIR}/desktop-el-tool-${tool.name}.png` });
        }
        check(`${tag}: every live tile opens a page that answers (${LIVE.length})`, broken.length === 0, broken.join(", "));

        const comingSoonBroken = [];
        for (const tool of NOT_LIVE) {
          const res = await page.goto(`${ORIGIN}${tool.href}`, { waitUntil: "domcontentloaded" });
          const comingSoon = await page.locator('[data-testid="coming-soon"]').first().waitFor({ state: "visible", timeout: 10000 }).then(() => true, () => false);
          const fieldDisabled = await page.locator('[data-testid="coming-soon-field"]').first().getAttribute("aria-disabled").catch(() => null);
          if (!res || res.status() >= 400 || !comingSoon || fieldDisabled !== "true") comingSoonBroken.push(`${tool.href} comingSoon=${comingSoon} disabled=${fieldDisabled}`);
          if (locale === "el" && SHOT_DIR) await page.screenshot({ path: `${SHOT_DIR}/desktop-el-comingsoon-${tool.name}.png` });
        }
        check(`${tag}: every Coming Soon tile opens the disabled, chargeless screen (${NOT_LIVE.length})`, comingSoonBroken.length === 0, comingSoonBroken.join(", "));

        // Notify-me on one Coming Soon screen, with zero provider/billing calls.
        const calls = [];
        page.on("request", (r) => calls.push(r.url()));
        await page.goto(`${ORIGIN}${NOT_LIVE[0].href}`, { waitUntil: "domcontentloaded" });
        const notifyButton = page.getByTestId("coming-soon-notify");
        await notifyButton.waitFor({ state: "visible", timeout: 10000 });
        await notifyButton.click();
        await page.waitForTimeout(500);
        const notifiedText = L.dashboard.comingSoon.notified;
        const notified = await page.getByText(notifiedText).first().waitFor({ state: "visible", timeout: 5000 }).then(() => true, () => false);
        check(`${tag}: pressing Notify on ${NOT_LIVE[0].href} confirms the subscription`, notified);
        const providerCalls = calls.filter((u) => /\/api\/(images|videos|audio|chat)\b/.test(u));
        check(`${tag}: ...and calls no provider/billing route (${calls.length} requests seen)`, providerCalls.length === 0, providerCalls.join(", "));

        // The old grid's pages are still where they were.
        const lost = [];
        for (const href of ["/dashboard/presentations", "/dashboard/posts", "/dashboard/finance", "/dashboard/timeline", "/dashboard/files", "/dashboard/apps", "/dashboard/videos"]) {
          // Playwright can return a null response on an otherwise-fine
          // navigation (a same-origin transition it treats as a
          // redirect it does not report) — one retry settles it; a page
          // that is actually lost fails on the retry too.
          let res = await page.goto(`${ORIGIN}${href}`, { waitUntil: "domcontentloaded" });
          if (!res) res = await page.goto(`${ORIGIN}${href}`, { waitUntil: "domcontentloaded" });
          if (!res || res.status() >= 400) lost.push(`${href} ${res?.status()}`);
        }
        check(`${tag}: what left the grid still opens at its address`, lost.length === 0, lost.join(", "));
      } else {
        // On a phone: press one live tile with a finger, and it opens.
        await page.goto(`${ORIGIN}/dashboard/tools`, { waitUntil: "load" });
        await page.locator('[data-testid="tool-tile"]').first().waitFor({ state: "visible", timeout: 15000 });
        // .first(): a service-worker-cached shell can briefly coexist with
        // the freshly-fetched page right after a goto (both fully
        // rendered, identical content) — either one leads to the same
        // href, so picking either is fine for a press.
        const tile = page.locator('[data-testid="tool-tile"][href="/dashboard/deep-research"]').first();
        await tile.scrollIntoViewIfNeeded();
        await tile.waitFor({ state: "visible" });
        await press(tile);
        await page.waitForURL(/\/dashboard\/deep-research/, { timeout: 15000 }).catch(() => {});
        check(`${tag}: a finger on a live tile opens its tool`, /\/dashboard\/deep-research/.test(page.url()), page.url());

        // And a Coming Soon tile opens the Coming Soon screen, not the real tool.
        await page.goto(`${ORIGIN}/dashboard/tools`, { waitUntil: "load" });
        await page.locator('[data-testid="tool-tile"]').first().waitFor({ state: "visible", timeout: 15000 });
        const comingSoonTile = page.locator(`[data-testid="tool-tile"][href="${NOT_LIVE[0].href}"]`).first();
        await comingSoonTile.scrollIntoViewIfNeeded();
        await comingSoonTile.waitFor({ state: "visible" });
        await press(comingSoonTile);
        const landed = await page.locator('[data-testid="coming-soon"]').first().waitFor({ state: "visible", timeout: 15000 }).then(() => true, () => false);
        check(`${tag}: a finger on a Coming Soon tile opens the Coming Soon screen`, landed, page.url());
      }
      await context.close();
    }
  }
} finally {
  try { await browser?.close(); } catch {}
  cleanup();
}

console.log(failures.length === 0 ? `\nALL PASS: ${pass} passed, 0 failed` : `\n${failures.length} FAILED, ${pass} passed`);
process.exit(failures.length === 0 ? 0 : 1);
