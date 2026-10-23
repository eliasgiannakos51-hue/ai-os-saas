/*
 * ALL TOOLS, THE FINAL GRID, AS A PERSON MEETS IT (the owner's message
 * "ALL TOOLS: ΤΟ ΤΕΛΙΚΟ GRID", 2026-10-23), on a production build over the
 * Supabase stand-in, for an ORDINARY member (nobody is staff, no switch is
 * set), in Greek and English, on a computer and a phone.
 *
 * Run: node scripts/tests/all-tools-final-grid.prodtest.mjs
 *      SKIP_BUILD=1 ALL_TOOLS_SHOTS=/tmp/shots node scripts/tests/all-tools-final-grid.prodtest.mjs
 *
 * What it holds, each against lib/nav/all-tools.ts rather than a number:
 *   1. Exactly the tiles of the registry that work (ready, with the Gemini
 *      key present), in the owner's order, in his five groups, under the
 *      headings he worded — and no tile of the old grid.
 *   2. Every tile carries its own name and its own line in the screen's
 *      language, and a Greek screen has no English word on it.
 *   3. Six to a row on a computer, two on a phone; no horizontal scroll;
 *      on a computer everything fits in one screen.
 *   4. A search finds a tool by a word it is not called, and says so when
 *      it finds nothing.
 *   5. Pressing every tile opens a page that answers.
 *   6. The tools that do not work yet have no tile, and no page of the old
 *      grid lost its address.
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
  return false;
}
const supa = await startMockSupabase({ port: 54421, handle });

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
const EXPECTED = availableTools({ imageKey: true });
const NOT_READY = ALL_TOOLS.filter((t) => !t.ready);

const PRODUCT_WORDS = new Set(["Ionexa", "AI", "PDF", "PowerPoint", "Word", "Excel", "GitHub", "iowork", "MCP", "K"]);
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
      const shot = async (name, full = false) => SHOT_DIR && page.screenshot({ path: `${SHOT_DIR}/${device.label}-${locale}-${name}.png`, fullPage: full });
      const mainText = () => page.locator("main").first().evaluate((n) => n.innerText ?? "");

      await page.goto(`${ORIGIN}/dashboard/tools`, { waitUntil: "networkidle" });
      await page.locator('[data-testid="tool-tile"]').first().waitFor({ state: "visible", timeout: 15000 }).catch(() => {});
      const tiles = () => page.locator('[data-testid="tool-tile"]').evaluateAll((els) => els.map((a) => {
        const r = a.getBoundingClientRect();
        return {
          href: a.getAttribute("href"),
          top: Math.round(r.top + window.scrollY),
          group: a.closest("section")?.getAttribute("aria-labelledby") ?? "",
          name: (a.querySelector("span > span")?.textContent ?? "").trim(),
          line: (a.querySelector(":scope > span:last-child")?.textContent ?? "").trim(),
        };
      }));
      const drawn = await tiles();

      check(`${tag}: exactly the tools that work are drawn (${EXPECTED.length}), in the owner's order`,
        drawn.length === EXPECTED.length && drawn.every((t, i) => t.href === EXPECTED[i].href), drawn.map((t) => t.href).join(", "));
      check(`${tag}: ...each in its own group`, drawn.every((t, i) => t.group === `tools-${EXPECTED[i].group}`), drawn.map((t) => `${t.name}:${t.group}`).join(", "));
      const headings = await page.locator("main h2").allInnerTexts();
      const wantHeadings = ALL_TOOLS_GROUP_ORDER.filter((g) => EXPECTED.some((t) => t.group === g)).map((g) => L.dashboard.tools.groups[g]);
      check(`${tag}: the headings are the owner's, in ${locale}, in order`, JSON.stringify(headings) === JSON.stringify(wantHeadings), `${headings.join(" | ")} vs ${wantHeadings.join(" | ")}`);
      const wrongName = drawn.filter((t, i) => t.name !== L.dashboard.tools.names[EXPECTED[i].name]);
      check(`${tag}: every tile carries its ${locale} name`, wrongName.length === 0, wrongName.map((t) => `${t.href}="${t.name}"`).join(", "));
      const wrongLine = drawn.filter((t, i) => t.line !== L.dashboard.tools.lines[EXPECTED[i].name]);
      check(`${tag}: ...and its ${locale} line`, wrongLine.length === 0, wrongLine.map((t) => `${t.href}="${t.line}"`).join(", "));
      const oldTiles = drawn.filter((t) => Object.keys(HIDDEN_FROM_ALL_TOOLS).includes(t.href));
      check(`${tag}: no tile of the old grid is left`, oldTiles.length === 0, oldTiles.map((t) => t.href).join(", "));
      const waiting = drawn.filter((t) => NOT_READY.some((n) => n.href === t.href));
      check(`${tag}: no tile for a tool that does not work yet (${NOT_READY.map((n) => n.name).join(", ")})`, waiting.length === 0, waiting.map((t) => t.href).join(", "));

      const perGroup = {};
      for (const t of drawn) (perGroup[t.group] ??= new Set()).add(t.top);
      const firstRows = drawn.filter((t) => t.group === "tools-make" && t.top === drawn.find((x) => x.group === "tools-make")?.top).length;
      const expectedFirstRow = Math.min(device.perRow, EXPECTED.filter((t) => t.group === "make").length);
      check(`${tag}: ${device.perRow} to a row at most (${firstRows} in the first row of Make)`, firstRows === expectedFirstRow);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      check(`${tag}: no horizontal scroll`, overflow <= 0, `${overflow}px`);
      if (!device.touch) {
        const heights = await page.evaluate(() => ({ doc: document.documentElement.scrollHeight, view: window.innerHeight }));
        check(`${tag}: everything fits in one screen (${heights.doc} of ${heights.view}px)`, heights.doc <= heights.view, JSON.stringify(heights));
      }
      const text = await mainText();
      if (locale === "el") check(`${tag}: no English word on the Greek page`, latinWords(text).length === 0, latinWords(text).join(", "));
      check(`${tag}: no «beta» and no «in testing»`, !/\bbeta\b|in testing|σε δοκιμή/i.test(await page.evaluate(() => document.body.innerText)));
      await shot("1-grid", true);

      // ---- the search
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
      await search.fill("");

      // ---- every tile opens a page that answers
      if (device.label === "desktop") {
        const broken = [];
        for (const tool of EXPECTED) {
          const res = await page.goto(`${ORIGIN}${tool.href}`, { waitUntil: "domcontentloaded" });
          let body = "";
          for (let i = 0; i < 24 && body.trim().length === 0; i++) {
            body = await mainText().catch(() => "");
            if (body.trim().length === 0) await page.waitForTimeout(250);
          }
          if (!res || res.status() >= 400 || body.trim().length === 0 || /Application error|This page could not be found/.test(body)) broken.push(`${tool.href} ${res?.status()}`);
          if (locale === "el" && SHOT_DIR) await page.screenshot({ path: `${SHOT_DIR}/desktop-el-tool-${tool.name}.png` });
        }
        check(`${tag}: every tile opens a page that answers (${EXPECTED.length})`, broken.length === 0, broken.join(", "));
        // The old grid's pages are still where they were.
        const lost = [];
        for (const href of ["/dashboard/presentations", "/dashboard/posts", "/dashboard/finance", "/dashboard/timeline", "/dashboard/files"]) {
          const res = await page.goto(`${ORIGIN}${href}`, { waitUntil: "domcontentloaded" });
          if (!res || res.status() >= 400) lost.push(`${href} ${res?.status()}`);
        }
        check(`${tag}: what left the grid still opens at its address`, lost.length === 0, lost.join(", "));
      } else {
        // On a phone: press one tile with a finger, and it opens.
        await page.goto(`${ORIGIN}/dashboard/tools`, { waitUntil: "networkidle" });
        const tile = page.locator('[data-testid="tool-tile"][href="/dashboard/deep-research"]');
        await tile.scrollIntoViewIfNeeded();
        await tile.tap();
        await page.waitForURL(/\/dashboard\/deep-research/, { timeout: 15000 }).catch(() => {});
        check(`${tag}: a finger on a tile opens its tool`, /\/dashboard\/deep-research/.test(page.url()), page.url());
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
