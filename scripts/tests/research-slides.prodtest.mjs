/*
 * RESEARCH WITH NUMBERED SOURCES THAT OPEN, SENT TO SLIDES WITH ONE PRESS
 * — IN THE BUILT APP (MASTER 16, package 11).
 *
 * Run: node scripts/tests/research-slides.prodtest.mjs
 *      SKIP_BUILD=1 node scripts/tests/research-slides.prodtest.mjs
 *
 * One production build; the signed-in account is the test account, so the
 * switches "tool-shell" and "research-slides" are on. A finished report is
 * in the stand-in database; /api/presentations/generate is answered by the
 * browser (page.route), so no model is called and nothing is charged, and
 * the deck it "made" is in the stand-in database for Slides to open.
 *
 * The report opens; every [n] in its text is a link to its own source, in
 * a new tab, with no referrer; a number with no source is marked and is no
 * link; the button says its price; the press sends the report by its id,
 * not its text; the deck opens in Slides.
 *
 * BOTH DEVICES: 1440x900 with a mouse, 390x844 with touch.
 */
import http from "node:http";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { chromium } from "playwright";
import { startMockSupabase, MOCK_USER } from "../lib/mock-supabase.mjs";

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

const RID = "d1111111-1111-4111-8111-111111111111";
const DID = "e1111111-1111-4111-8111-111111111111";
const SOURCES = [
  { title: "Eurostat: τουρισμός", url: "https://ec.europa.eu/eurostat/tourism" },
  { title: "ΕΛΣΤΑΤ: νησιά", url: "https://www.statistics.gr/islands" },
];
const REPORT = {
  id: RID, user_id: MOCK_USER.id, topic: "Ο τουρισμός στη Νάξο", language: "el", status: "ready",
  questions: [{ question: "Πόσες αφίξεις;", why: "μέγεθος" }],
  sections: [
    { heading: "Αφίξεις", body: "Οι αφίξεις αυξήθηκαν **12%** [1][2].\n\n- Ένας αριθμός χωρίς πηγή [9]." },
    { heading: "Κλίνες", body: "Λείπουν κλίνες τον Αύγουστο [2]." },
  ],
  sources: SOURCES, document_id: null, credits_charged: 40, error: null,
  created_at: "2026-10-07T10:00:00Z", completed_at: "2026-10-07T10:05:00Z",
};
const DECK = {
  version: 1, title: "Ο τουρισμός στη Νάξο", locale: "el", imageSource: "none",
  slides: [
    { layout: "title", title: "Ο τουρισμός στη Νάξο", bullets: ["Τι είπε η έρευνα"], notes: "", imageQuery: null, image: null },
    { layout: "bullets", title: "Αφίξεις", bullets: ["+12% [1][2]"], notes: "", imageQuery: null, image: null },
    { layout: "bullets", title: "Πηγές", bullets: ["[1] Eurostat: τουρισμός — ec.europa.eu", "[2] ΕΛΣΤΑΤ: νησιά — statistics.gr"], notes: "", imageQuery: null, image: null },
  ],
};

MOCK_USER.user_metadata = { subscription_tier: "growth" };
const supa = await startMockSupabase({
  port: 54371,
  tableRows: {
    user_credits: [{ user_id: MOCK_USER.id, credits_remaining: 3000, credits_total: 3000 }],
    research_reports: [REPORT],
    ai_presentations: [
      { id: DID, user_id: MOCK_USER.id, title: DECK.title, description: "x", slide_count: 3, status: "draft", slides: DECK, locale: "el", image_source: "none", source: "generated", credits_charged: 20, error: null, created_at: "2026-10-07T10:10:00Z", updated_at: "2026-10-07T10:10:00Z" },
    ],
  },
});

const freePort = () =>
  new Promise((resolve) => {
    const probe = http.createServer();
    probe.listen(0, "127.0.0.1", () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
const base = {
  ...process.env,
  NODE_ENV: "production",
  NEXT_PUBLIC_SUPABASE_URL: supa.url,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: supa.anonKey,
  SUPABASE_SERVICE_ROLE_KEY: supa.serviceKey,
  ADMIN_EMAILS: "",
};

const el = JSON.parse(readFileSync("messages/el.json", "utf8"));
const W = el.dashboard.deepResearch.toSlides;

const servers = [];
const pageErrors = [];
let browser = null;
const cleanup = () => {
  for (const server of servers) {
    try { if (server?.pid) process.kill(-server.pid, "SIGKILL"); } catch {}
  }
  try { supa.close(); } catch {}
};

async function start(env) {
  const port = await freePort();
  const origin = `http://127.0.0.1:${port}`;
  const server = spawn("npx", ["next", "start", "-p", String(port)], { env: { ...env, PORT: String(port), NEXT_PUBLIC_SITE_URL: origin }, stdio: ["ignore", "pipe", "pipe"], detached: true });
  servers.push(server);
  for (let i = 0; i < 90; i++) {
    try {
      await new Promise((res, rej) => { const r = http.get(`${origin}/api/health`, () => res()); r.on("error", rej); });
      return origin;
    } catch { await new Promise((r) => setTimeout(r, 1000)); }
  }
  throw new Error("the production server did not start");
}

try {
  if (process.env.SKIP_BUILD) {
    console.log("SKIP_BUILD=1 — reusing the existing .next");
  } else {
    console.log("running `next build` (production) ...");
    const build = spawn("npx", ["next", "build"], { env: base, stdio: ["ignore", "pipe", "pipe"] });
    let log = "";
    build.stdout.on("data", (d) => (log += d));
    build.stderr.on("data", (d) => (log += d));
    if ((await new Promise((r) => build.on("close", r))) !== 0) {
      console.log("  FAIL  next build failed\n" + log.slice(-3000));
      cleanup();
      process.exit(1);
    }
  }
  const ON = await start({ ...base, TEST_ACCOUNT_EMAILS: MOCK_USER.email });
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium" });

  for (const device of [
    { label: "desktop", viewport: { width: 1440, height: 900 }, touch: false },
    { label: "phone", viewport: { width: 390, height: 844 }, touch: true },
  ]) {
    console.log(`\n== ${device.label} ${device.viewport.width}x${device.viewport.height} ==`);
    const context = await browser.newContext({ viewport: device.viewport, hasTouch: device.touch, isMobile: device.touch });
    await context.addCookies(
      [
        { ...supa.authCookie, url: ON, httpOnly: false, secure: false, sameSite: "Lax" },
        { name: "NEXT_LOCALE", value: "el", url: ON },
      ].map(({ domain, path, ...c }) => c)
    );
    const page = await context.newPage();
    pageErrors.length = 0;
    page.on("pageerror", (err) => pageErrors.push(String(err?.message ?? err)));
    const cdp = device.touch ? await context.newCDPSession(page) : null;
    async function press(locator) {
      await locator.evaluate((e) => e.scrollIntoView({ block: "center" }));
      if (!cdp) return locator.click();
      const box = await locator.boundingBox();
      const x = box.x + box.width / 2, y = box.y + box.height / 2;
      await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
      await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    }

    const sent = [];
    await page.route("**/api/presentations/generate", (r) => {
      sent.push(r.request().postDataJSON());
      return r.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true, id: DID, deck: DECK, creditsCharged: 20, images: { wanted: 0, found: 0, unsplashConfigured: false } }) });
    });

    await page.goto(`${ON}/dashboard/deep-research?record=${RID}`, { waitUntil: "networkidle" });
    const body = page.locator('[data-testid="research-cited-body"]').first();
    await body.waitFor({ timeout: 10000 }).catch(() => null);
    check("the finished report opens", (await page.locator('[data-testid="research-cited-body"]').count()) === 2);
    const links = body.locator("a");
    check("[1][2] are two links, each to its own source",
      (await links.count()) === 2 && (await links.nth(0).innerText()) === "[1]" && (await links.nth(0).getAttribute("href")) === SOURCES[0].url && (await links.nth(1).getAttribute("href")) === SOURCES[1].url);
    check("...in a new tab, telling the source nothing about us", (await links.nth(0).getAttribute("target")) === "_blank" && (await links.nth(0).getAttribute("rel")) === "noopener noreferrer");
    const text = await body.innerText();
    check("a number with no source is marked, and is no link", text.includes("[9]⚠") && !(await body.locator("a", { hasText: "[9]" }).count()));
    check("the report's own bold is read, not printed", (await body.locator("strong").count()) === 1 && !text.includes("**"));

    // ---- one press
    const button = page.locator('[data-testid="research-to-slides"]');
    check("the button to Slides is on the report, with its price", (await button.count()) === 1 && (await button.innerText()).includes(W.send) && /\d/.test(await button.innerText()), await button.innerText().catch(() => ""));
    const box = await button.boundingBox();
    check("...a 44px target", box && box.height >= 44, JSON.stringify(box));
    await press(button);
    await page.waitForTimeout(400);
    // A large amount asks once more, as every large action does.
    if (sent.length === 0 && (await button.innerText()).includes(W.confirm.split("{")[0].trim())) await press(button);
    await page.waitForURL(`**/dashboard/presentations?record=${DID}`, { timeout: 15000 }).catch(() => null);
    check("the report is sent by its id, never as text", sent.length === 1 && sent[0].researchId === RID && !("description" in sent[0]), JSON.stringify(sent));
    check("the deck opens in Slides", new URL(page.url()).pathname === "/dashboard/presentations" && new URL(page.url()).searchParams.get("record") === DID, page.url());
    await page.waitForLoadState("networkidle");
    check("...as that deck", (await page.locator("main").innerText()).includes("Ο τουρισμός στη Νάξο"));
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    check("the page does not scroll sideways", overflow <= 1, `${overflow}px`);

    check(`no page threw (${pageErrors.length})`, pageErrors.length === 0, pageErrors.slice(0, 3).join(" | "));
    await context.close();
  }
} catch (err) {
  check("the run completed", false, String(err?.stack ?? err) + (pageErrors.length ? `\n        page errors: ${pageErrors.slice(0, 3).join(" | ")}` : ""));
} finally {
  if (browser) await browser.close().catch(() => {});
  cleanup();
}

console.log(failures.length ? `\nFAILURES: ${pass} passed, ${failures.length} failed` : `\nALL PASS: ${pass} passed, 0 failed`);
process.exit(failures.length === 0 ? 0 : 1);
