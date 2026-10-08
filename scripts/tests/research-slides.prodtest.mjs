/*
 * RESEARCH WITH NUMBERED SOURCES THAT OPEN, SENT TO SLIDES WITH ONE PRESS
 * — IN THE BUILT APP (MASTER 16, package 11).
 *
 * Run: node scripts/tests/research-slides.prodtest.mjs
 *      SKIP_BUILD=1 node scripts/tests/research-slides.prodtest.mjs
 *
 * One production build; the signed-in account is the test account, so the
 * switches "tool-shell" and "research-slides" are on. A finished report is
 * in the stand-in database.
 *
 * THE PRESS RUNS THE REAL ROUTE (since the package check of 2026-10-08):
 * api/presentations/generate reads the report by its id, holds the credits,
 * asks the model and saves the deck — the model is the stand-in of
 * scripts/tests/lib/fake-anthropic.mjs, reached through ANTHROPIC_BASE_URL,
 * and the tables that are written and read back are
 * scripts/tests/lib/stand-in-tables.mjs. So the sources slides the deck
 * opens with are the ones the route wrote from the stored list, not a
 * fixture.
 *
 * The report opens; every [n] in its text is a link to its own source, in
 * a new tab, with no referrer; a number with no source is marked and is no
 * link; the button says its price; the press sends the report by its id,
 * not its text; the deck opens in Slides, with a slide of its sources.
 *
 * AND THE RESEARCH ITSELF, THE WHOLE WAY (also 2026-10-08): a topic typed
 * into the field is planned by the real api/research, its price shown,
 * started by the real api/research/[id]/run, and every question searched
 * and the report written by the real pipeline (lib/research/run-research.ts)
 * against the same model stand-in — which answers each question the way the
 * API does when its web search ran, with citation blocks — so the numbered
 * sources the report opens with are the ones the pipeline collected.
 *
 * AND AROUND IT: the provider overloaded (HTTP 529, the API's own error)
 * — said in the reader's language, nothing charged, the button back; and
 * during the run, said as the AI service not answering, never as a topic
 * the searches found nothing on (the package check of 2026-10-08); out
 * of credits — said, the model never asked; a new account with no report;
 * a Free account (the plan wall, and the route refusing on its own); the
 * screens in Greek and in English, with no English sentence on a Greek one.
 *
 * BOTH DEVICES: 1440x900 with a mouse, 390x844 with touch.
 */
import http from "node:http";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { chromium } from "playwright";
import { startMockSupabase, MOCK_USER } from "../lib/mock-supabase.mjs";
import { statefulTables } from "./lib/stand-in-tables.mjs";
import { startFakeAnthropic, toolMessage, textMessage, searchMessage, OVERLOADED } from "./lib/fake-anthropic.mjs";
import { englishRuns, englishIn } from "./lib/english-on-greek.mjs";

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
// What the model hands back through the forced write_deck tool
// (lib/presentations/prompt.ts, WRITE_DECK_TOOL). The sources slide is NOT
// in it: the route adds it from the report's stored list.
const DECK_INPUT = {
  title: "Ο τουρισμός στη Νάξο",
  slides: [
    { layout: "title", title: "Ο τουρισμός στη Νάξο", bullets: ["Τι είπε η έρευνα"], notes: "", imageQuery: null },
    { layout: "bullets", title: "Αφίξεις", bullets: ["+12% [1][2]"], notes: "", imageQuery: null },
    { layout: "bullets", title: "Κλίνες", bullets: ["Λείπουν τον Αύγουστο [2]"], notes: "", imageQuery: null },
  ],
};

const store = { research_reports: [], ai_presentations: [], user_credits: [], feature_flags: [], user_documents: [] };
const tables = statefulTables(store, {
  // As the database fills a report the plan route writes.
  defaults: {
    research_reports: {
      language: "el", sections: [], sources: [], document_id: null, credits_charged: null, error: null, completed_at: null,
      processing_started_at: null, questions_total: null, questions_done: 0, current_question: null, partial_findings: [],
      usage_entries: [], chunk_count: 0, chunk_running: false, chunk_started_at: null, reservation_id: null, cancel_requested_at: null,
    },
  },
  rpc: {
    // The hold: granted while the balance covers it, as the SQL function does.
    reserve_credits: ({ p_credits }) => {
      const available = Number(store.user_credits[0]?.credits_remaining ?? 0);
      return [available >= p_credits ? { reservation_id: `r${tables.rpcCalls.length}`, available } : { reservation_id: null, available }];
    },
    settle_reservation: () => null,
    release_reservation: () => null,
    increment_daily_ai_spend: () => null,
    consume_rate_limit: () => true,
  },
});
// supabase-js's admin.getUserById, which the research pipeline asks per chunk.
const adminUsers = ({ url, json }) => (url.pathname.startsWith("/auth/v1/admin/users/") ? (json(200, MOCK_USER), true) : false);
const supa = await startMockSupabase({ port: 54371, handle: (ctx) => adminUsers(ctx) || tables(ctx) });

// THE MODEL, by what it is asked: the plan (the forced research_plan
// tool), one question (the web_search tool), the deck (write_deck), or the
// report from the findings (no tool). `mode` says which of them fail.
const QUESTIONS = [
  { question: "Πόσες αφίξεις είχε η Νάξος το 2025;", why: "Το μέγεθος της ζήτησης." },
  { question: "Πόσες κλίνες λείπουν τον Αύγουστο;", why: "Η πίεση στην αιχμή." },
  { question: "Τι λένε οι επαγγελματίες για τη σεζόν;", why: "Η εικόνα από μέσα." },
];
const SYNTHESIS = "## Αφίξεις\nΟι αφίξεις αυξήθηκαν **12%** [1][2].\n\n## Κλίνες\nΛείπουν κλίνες τον Αύγουστο [2].\n\n## Τι δεν βρέθηκε\nΔεν βρέθηκαν στοιχεία για το 2026 [1].";
function answerFor(mode) {
  return (body) => {
    const tool = body?.tools?.[0]?.name;
    if (mode === "overloaded") return OVERLOADED;
    if (tool === "research_plan") return toolMessage("research_plan", { questions: QUESTIONS });
    if (mode === "runOverloaded") return OVERLOADED;
    if (tool === "web_search") return searchMessage("Οι αφίξεις αυξήθηκαν κατά 12% και λείπουν κλίνες τον Αύγουστο.", SOURCES);
    if (tool === "write_deck") return toolMessage("write_deck", DECK_INPUT);
    return textMessage(SYNTHESIS);
  };
}
const model = await startFakeAnthropic(54472, answerFor("ok"));

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

const words = (locale) => JSON.parse(readFileSync(`messages/${locale}.json`, "utf8"));
const W = { el: words("el"), en: words("en") };
// The Greek screens' English, from the namespaces they draw, and the one
// sentence the route writes in English (the plan gate's `error`).
const RUNS_EN = englishRuns(["dashboard.deepResearch", "presentations", "dashboard.toolShell", "dashboard.tools.names", "upgrade", "billing"]);
const ROUTE_ENGLISH = ["Presentations is not included on this plan."];

const servers = [];
const pageErrors = [];
let browser = null;
const cleanup = () => {
  for (const server of servers) {
    try { if (server?.pid) process.kill(-server.pid, "SIGKILL"); } catch {}
  }
  try { supa.close(); } catch {}
  try { model.close(); } catch {}
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

const DESKTOP = { label: "desktop", viewport: { width: 1440, height: 900 }, touch: false };
const PHONE = { label: "phone", viewport: { width: 390, height: 844 }, touch: true };
const RUNS = [
  { name: "a report, to Slides", device: DESKTOP, locale: "el", reports: true, credits: 3000, answer: "deck" },
  { name: "a report, to Slides", device: PHONE, locale: "el", reports: true, credits: 3000, answer: "deck" },
  { name: "a report, to Slides, in English", device: PHONE, locale: "en", reports: true, credits: 3000, answer: "deck" },
  { name: "the provider overloaded", device: PHONE, locale: "el", reports: true, credits: 3000, answer: "overloaded" },
  { name: "the provider overloaded, in English", device: DESKTOP, locale: "en", reports: true, credits: 3000, answer: "overloaded" },
  { name: "out of credits", device: DESKTOP, locale: "el", reports: true, credits: 0, answer: "deck" },
  { name: "a new account, nothing yet", device: PHONE, locale: "el", reports: false, credits: 3000, answer: "deck" },
  { name: "a new account, nothing yet, in English", device: DESKTOP, locale: "en", reports: false, credits: 3000, answer: "deck" },
  { name: "a Free account", device: PHONE, locale: "el", reports: true, credits: 3000, answer: "deck", tier: "free" },
  // The Research PAGE, for everybody "tool-shell" is off for: the same
  // numbers and the same button, if "research-slides" is opened first.
  { name: "the Research page (shell off), to Slides", device: DESKTOP, locale: "el", reports: true, credits: 3000, answer: "deck", flags: { "tool-shell": "off" } },
  { name: "the Research page (shell off), to Slides", device: PHONE, locale: "el", reports: true, credits: 3000, answer: "deck", flags: { "tool-shell": "off" } },
  // Taken back: the report reads as it did before the package.
  { name: "the switch off", device: PHONE, locale: "el", reports: true, credits: 3000, answer: "deck", flags: { "research-slides": "off" } },
];

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
  const ON = await start({
    ...base,
    TEST_ACCOUNT_EMAILS: MOCK_USER.email,
    ANTHROPIC_API_KEY: "sk-ant-test",
    ANTHROPIC_BASE_URL: model.url,
    // So a report can hand itself on between chunks, as in production.
    CRON_SECRET: "test-cron-secret-for-internal-handoff",
  });
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium" });
  const detectorSawEnglish = [];

  for (const run of RUNS) {
    const { device, locale } = run;
    const L = W[locale];
    const T = L.dashboard.deepResearch.toSlides;
    console.log(`\n== ${run.name} — ${device.label} ${device.viewport.width}x${device.viewport.height}, ${locale} ==`);
    // This run's account: its reports, its balance, its plan.
    store.research_reports.splice(0, Infinity, ...(run.reports ? [structuredClone(REPORT)] : []));
    store.ai_presentations.splice(0, Infinity);
    store.user_credits.splice(0, Infinity, { user_id: MOCK_USER.id, credits_remaining: run.credits, credits_total: 3000 });
    MOCK_USER.user_metadata = { subscription_tier: run.tier ?? "growth" };
    store.feature_flags.splice(0, Infinity, ...Object.entries(run.flags ?? {}).map(([key, audience]) => ({ key, audience })));
    model.setAnswer(answerFor(run.answer === "overloaded" ? "overloaded" : "ok"));
    model.calls.splice(0, Infinity);
    tables.rpcCalls.splice(0, Infinity);
    tables.writes.splice(0, Infinity);

    const context = await browser.newContext({ viewport: device.viewport, hasTouch: device.touch, isMobile: device.touch });
    await context.addCookies(
      [
        { ...supa.authCookie, url: ON, httpOnly: false, secure: false, sameSite: "Lax" },
        { name: "NEXT_LOCALE", value: locale, url: ON },
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
    page.on("request", (req) => { if (req.url().endsWith("/api/presentations/generate") && req.method() === "POST") sent.push(req.postDataJSON()); });
    // No English on a Greek screen; and the detector, shown English, sees it.
    async function wordsCheck(where) {
      const text = await page.locator("main").innerText();
      const found = englishIn(text, RUNS_EN, ROUTE_ENGLISH);
      if (locale === "el") check(`${where}: Greek, with no English sentence on it`, found.length === 0 && (await page.evaluate(() => document.documentElement.lang)) === "el", found.slice(0, 5).join(" | "));
      else detectorSawEnglish.push(found.length);
    }

    await page.goto(`${ON}/dashboard/deep-research${run.reports ? `?record=${RID}` : ""}`, { waitUntil: "networkidle" });

    // ---- a Free account: the plan's wall, and the route refuses too
    if (run.tier === "free") {
      const text = await page.locator("main").innerText();
      check("Free: the research screen is the plan's wall, not the report", (await page.locator('[data-testid="research-cited-body"]').count()) === 0 && !text.includes("Οι αφίξεις αυξήθηκαν") && text.includes(L.dashboard.deepResearch.title));
      check("...with no button to Slides", (await page.locator('[data-testid="research-to-slides"]').count()) === 0);
      const refused = await page.request.post(`${ON}/api/presentations/generate`, { data: { researchId: RID, slideCount: 10, imageSource: "none", locale } });
      check("...and the route itself refuses a Free account, before the model", refused.status() === 403 && (await refused.json()).code === "not_included" && model.calls.length === 0, `${refused.status()} calls=${model.calls.length}`);
      await wordsCheck("the Free wall");
      check(`no page threw (${pageErrors.length})`, pageErrors.length === 0, pageErrors.slice(0, 3).join(" | "));
      await context.close();
      continue;
    }

    // ---- a new account: nothing yet
    if (!run.reports) {
      check("empty: no report and no button, only the field", (await page.locator('[data-testid="research-report"]').count()) === 0 && (await page.locator('[data-testid="research-to-slides"]').count()) === 0 && (await page.getByPlaceholder(L.dashboard.deepResearch.topicPlaceholder).count()) === 1);
      await press(page.locator('[data-testid="research-recent"]'));
      await page.waitForTimeout(300);
      check("...and what was made before says there is nothing yet", (await page.locator("main").innerText()).includes(L.dashboard.deepResearch.empty.title));
      await wordsCheck("the empty Research screen");
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      check("the page does not scroll sideways", overflow <= 1, `${overflow}px`);
      check(`no page threw (${pageErrors.length})`, pageErrors.length === 0, pageErrors.slice(0, 3).join(" | "));
      await context.close();
      continue;
    }

    // ---- the switch off: plain numbers, no button
    if (run.flags?.["research-slides"] === "off") {
      await page.waitForFunction(() => document.querySelector("main")?.innerText.includes("Οι αφίξεις αυξήθηκαν"), null, { timeout: 10000 }).catch(() => null);
      const text = await page.locator("main").innerText();
      check("switch off: the report is there, as before", text.includes("Οι αφίξεις αυξήθηκαν") && text.includes("[1][2]"));
      check("...its numbers are text and there is no button to Slides", (await page.locator('[data-testid="research-cited-body"]').count()) === 0 && (await page.locator('[data-testid="research-to-slides"]').count()) === 0);
      const refused = await page.request.post(`${ON}/api/presentations/generate`, { data: { researchId: RID, slideCount: 10, imageSource: "none", locale } });
      check("...and the route refuses a report by id, before the model", refused.status() === 403 && model.calls.length === 0, `${refused.status()} calls=${model.calls.length}`);
      check(`no page threw (${pageErrors.length})`, pageErrors.length === 0, pageErrors.slice(0, 3).join(" | "));
      await context.close();
      continue;
    }

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
    check("the button to Slides is on the report, with its price", (await button.count()) === 1 && (await button.innerText()).includes(T.send) && /\d/.test(await button.innerText()), await button.innerText().catch(() => ""));
    const box = await button.boundingBox();
    check("...a 44px target", box && box.height >= 44, JSON.stringify(box));
    await wordsCheck("the report");
    await press(button);
    await page.waitForTimeout(400);
    // A large amount asks once more, as every large action does.
    if (sent.length === 0 && (await button.innerText()).includes(T.confirm.split("{")[0].trim())) await press(button);
    for (let i = 0; i < 50 && sent.length === 0; i++) await page.waitForTimeout(100);
    check("the report is sent by its id, never as text", sent.length === 1 && sent[0].researchId === RID && !("description" in sent[0]), JSON.stringify(sent));

    if (run.answer === "deck" && run.credits > 0) {
      await page.waitForURL(/\/dashboard\/presentations\?record=/, { timeout: 30000 }).catch(() => null);
      const saved = tables.writes.find((w) => w.table === "ai_presentations" && w.method === "POST")?.rows[0];
      check("the model was asked once, with the report's own words read by the server", model.calls.length === 1 && JSON.stringify(model.calls[0].body?.messages ?? "").includes("Οι αφίξεις αυξήθηκαν") && JSON.stringify(model.calls[0].body?.messages ?? "").includes(REPORT.topic), `calls=${model.calls.length}`);
      check("...and the credits were held, then settled", tables.rpcCalls.map((c) => c.name).filter((n) => n !== "increment_daily_ai_spend" && n !== "consume_rate_limit").join(",") === "reserve_credits,settle_reservation", tables.rpcCalls.map((c) => c.name).join(","));
      const sourcesSlide = saved?.slides?.slides?.at(-1);
      check("the deck it saved ends with its sources, numbered as the report numbers them",
        sourcesSlide?.title === "Πηγές" && sourcesSlide.bullets[0]?.startsWith("[1] Eurostat: τουρισμός") && sourcesSlide.bullets[1]?.startsWith("[2] ΕΛΣΤΑΤ: νησιά"),
        JSON.stringify(sourcesSlide));
      check("the deck opens in Slides", new URL(page.url()).pathname === "/dashboard/presentations" && new URL(page.url()).searchParams.get("record") === saved?.id, page.url());
      await page.waitForLoadState("networkidle");
      // The deck is drawn after the move to Slides: wait for its cards.
      await page.locator('[data-testid="slide-card"]').last().waitFor({ timeout: 15000 }).catch(() => null);
      const slidesText = await page.locator("main").innerText();
      check("...as that deck, its sources slide on the screen", slidesText.includes("Ο τουρισμός στη Νάξο") && slidesText.includes("[1] Eurostat: τουρισμός") && slidesText.includes("[2] ΕΛΣΤΑΤ: νησιά"), slidesText.slice(0, 1500));
      if (locale === "el") await wordsCheck("the deck in Slides");
    } else {
      const alert = page.locator('[data-testid="research-to-slides-error"]');
      await alert.waitFor({ timeout: 30000 }).catch(() => null);
      const said = await alert.innerText().catch(() => "");
      if (run.answer === "overloaded") {
        check("the provider overloaded: said in the reader's language", said === L.presentations.errors.unavailable, said);
        check("...after the model was really asked (the SDK's own retries included)", model.calls.length >= 1, String(model.calls.length));
        check("...nothing charged: the hold given back, never settled", tables.rpcCalls.some((c) => c.name === "release_reservation") && !tables.rpcCalls.some((c) => c.name === "settle_reservation"), tables.rpcCalls.map((c) => c.name).join(","));
        check("...no deck saved", !store.ai_presentations.some((r) => r.slides));
      } else {
        check("out of credits: said in the reader's language", said === L.presentations.errors.insufficient, said);
        check("...and the model never asked, nothing held", model.calls.length === 0 && !tables.rpcCalls.some((c) => c.name === "reserve_credits"), `calls=${model.calls.length} rpc=${tables.rpcCalls.map((c) => c.name).join(",")}`);
      }
      check("...the report stays, and the button can be pressed again", new URL(page.url()).pathname === "/dashboard/deep-research" && (await button.isEnabled()) && (await button.innerText()).includes(T.send));
      await wordsCheck("the refusal");
    }
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    check("the page does not scroll sideways", overflow <= 1, `${overflow}px`);

    check(`no page threw (${pageErrors.length})`, pageErrors.length === 0, pageErrors.slice(0, 3).join(" | "));
    await context.close();
  }
  // =====================================================================
  // THE RESEARCH ITSELF: a topic, its plan, its run, its report — and what
  // can go wrong on the way
  // =====================================================================
  const SAID = (L) => L.dashboard.deepResearch;
  const MONTH = new Date().toISOString().slice(0, 7);
  const capFull = Array.from({ length: 10 }, (_, i) => ({ ...REPORT, id: `c${i}111111-1111-4111-8111-111111111111`, created_at: `${MONTH}-02T10:00:00Z` }));
  const FAILED = { ...REPORT, id: "f2222222-2222-4222-8222-222222222222", status: "failed", sections: [], sources: [], error: "The searches did not return anything usable on this topic." };
  const WHOLE = [
    { name: "a topic, planned, run, and sent to Slides — the shell", device: DESKTOP, flags: {}, mode: "ok" },
    { name: "a topic, planned, run, and sent to Slides — the shell", device: PHONE, flags: {}, mode: "ok" },
    { name: "a topic, planned and run — the page", device: DESKTOP, flags: { "tool-shell": "off" }, mode: "ok" },
    { name: "out of credits at the plan", device: PHONE, flags: {}, mode: "ok", credits: 0, expect: (L) => SAID(L).refused?.noCredits },
    { name: "the provider overloaded at the plan", device: DESKTOP, flags: {}, mode: "overloaded", expect: (L) => SAID(L).refused?.unavailable },
    { name: "the provider overloaded at the plan — the page", device: PHONE, flags: { "tool-shell": "off" }, mode: "overloaded", expect: (L) => SAID(L).refused?.unavailable },
    // The footer says the month is used up already; the answer to the
    // press is read from the conversation, where the footer is not.
    { name: "the month's reports used up", device: PHONE, flags: {}, mode: "ok", reports: capFull, expect: (L) => SAID(L).capReached, thread: true },
    // Every question's request fails: the service did not answer, and the
    // screen says so — never that the topic gave nothing (2026-10-08).
    { name: "the provider overloaded during the run", device: DESKTOP, flags: {}, mode: "runOverloaded", expect: (L) => SAID(L).failed?.unavailable },
    { name: "the provider overloaded during the run, in English", device: PHONE, flags: {}, mode: "runOverloaded", locale: "en", expect: (L) => SAID(L).failed?.unavailable },
    { name: "a report that failed, in the list — the page", device: DESKTOP, flags: { "tool-shell": "off" }, mode: "ok", reports: [FAILED], expect: (L) => SAID(L).failed?.noFindings },
  ];
  const ROUTE_RESEARCH_ENGLISH = [
    "credits, and you do not have enough", "Not enough credits", "research report a month", "research reports a month",
    "The AI could not break that topic", "The searches did not return anything usable", "The AI service did not answer the research questions", "The report could not be written",
    "The report stopped before it finished", "Could not start the report", "Failed to fetch",
  ];
  for (const run of WHOLE) {
    const { device } = run;
    const locale = run.locale ?? "el";
    const L = W[locale];
    console.log(`\n== ${run.name} — ${device.label} ${device.viewport.width}x${device.viewport.height}, ${locale} ==`);
    store.research_reports.splice(0, Infinity, ...(run.reports ?? []).map((r) => structuredClone(r)));
    store.ai_presentations.splice(0, Infinity);
    store.user_documents.splice(0, Infinity);
    store.user_credits.splice(0, Infinity, { user_id: MOCK_USER.id, credits_remaining: run.credits ?? 3000, credits_total: 3000 });
    store.feature_flags.splice(0, Infinity, ...Object.entries(run.flags).map(([key, audience]) => ({ key, audience })));
    MOCK_USER.user_metadata = { subscription_tier: "growth" };
    model.setAnswer(answerFor(run.mode));
    model.calls.splice(0, Infinity);
    tables.rpcCalls.splice(0, Infinity);
    tables.writes.splice(0, Infinity);
    const context = await browser.newContext({ viewport: device.viewport, hasTouch: device.touch, isMobile: device.touch });
    await context.addCookies(
      [
        { ...supa.authCookie, url: ON, httpOnly: false, secure: false, sameSite: "Lax" },
        { name: "NEXT_LOCALE", value: locale, url: ON },
      ].map(({ domain, path, ...c }) => c)
    );
    const page = await context.newPage();
    pageErrors.length = 0;
    page.on("pageerror", (err) => pageErrors.push(String(err?.message ?? err)));
    page.on("dialog", (d) => void d.accept());
    const cdp = device.touch ? await context.newCDPSession(page) : null;
    async function press(locator) {
      await locator.evaluate((e) => e.scrollIntoView({ block: "center" }));
      if (!cdp) return locator.click();
      const box = await locator.boundingBox();
      const x = box.x + box.width / 2, y = box.y + box.height / 2;
      await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
      await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    }
    // What the screen says, caught as it appears: the page says it in a
    // toast that is gone in seconds.
    async function sayingOf(want, ms) {
      const seen = new Set();
      const where = run.thread ? '[data-testid="tool-shell-thread"]' : '[role="status"], main';
      for (let i = 0; i < ms / 100; i++) {
        for (const part of await page.evaluate((w) => [...document.querySelectorAll(w)].map((e) => e.innerText), where)) seen.add(part);
        const all = [...seen].join("\n");
        if (all.includes(String(want)) || (locale === "el" && englishIn(all, RUNS_EN, [...ROUTE_ENGLISH, ...ROUTE_RESEARCH_ENGLISH]).length > 0)) return all;
        await page.waitForTimeout(100);
      }
      return [...seen].join("\n");
    }
    const shell = run.flags["tool-shell"] !== "off";
    await page.goto(`${ON}/dashboard/deep-research`, { waitUntil: "networkidle" });

    if (run.reports?.[0]?.status === "failed") {
      const said = await sayingOf(run.expect(L), 5000);
      check(`the failed report says why, in the reader's language: «${run.expect(L)}»`, said.includes(String(run.expect(L))), said.slice(-400));
      const found = englishIn(said, RUNS_EN, [...ROUTE_ENGLISH, ...ROUTE_RESEARCH_ENGLISH]);
      check("...with no English sentence on the Greek screen", found.length === 0, found.join(" | "));
      check(`no page threw (${pageErrors.length})`, pageErrors.length === 0, pageErrors.slice(0, 3).join(" | "));
      await context.close();
      continue;
    }

    // ---- the topic, and its plan
    const field = shell ? page.locator("main textarea") : page.locator("main textarea, main input[type=text]").first();
    await field.fill("Ο τουρισμός στη Νάξο");
    if (shell) await press(page.locator("main form button[type=submit]"));
    else await press(page.getByRole("button", { name: SAID(L).planIt }));

    if (run.expect && run.mode !== "runOverloaded") {
      const said = await sayingOf(run.expect(L), 30000);
      check(`it is said in the reader's language: «${run.expect(L)}»`, said.includes(String(run.expect(L))), said.slice(-400));
      if (locale === "el") {
        const found = englishIn(said, RUNS_EN, [...ROUTE_ENGLISH, ...ROUTE_RESEARCH_ENGLISH]);
        check("...with no English sentence on the Greek screen", found.length === 0, found.join(" | "));
      }
      if (run.credits === 0 || run.reports) check("...and the model was never asked", model.calls.length === 0, String(model.calls.length));
      else check("...after the model was really asked; the plan's hold given back", model.calls.length >= 1 && tables.rpcCalls.some((c) => c.name === "release_reservation" || c.name === "settle_reservation"), tables.rpcCalls.map((c) => c.name).join(","));
      check("...and no report is made", store.research_reports.length === (run.reports ?? []).length, String(store.research_reports.length));
      check(`no page threw (${pageErrors.length})`, pageErrors.length === 0, pageErrors.slice(0, 3).join(" | "));
      await context.close();
      continue;
    }

    const start = page.locator('[data-testid="research-start"]').or(page.getByRole("button", { name: SAID(L).start }));
    await start.first().waitFor({ timeout: 30000 }).catch(() => null);
    const planned = store.research_reports.find((r) => r.topic === "Ο τουρισμός στη Νάξο");
    check("the plan comes back from the real route: its questions, its price, nothing run yet", planned?.status === "pending" && (await page.locator("main").innerText()).includes(QUESTIONS[0].question) && model.calls.length === 1, `status=${planned?.status} calls=${model.calls.length}`);
    await press(start.first());

    if (run.mode === "runOverloaded") {
      const said = await sayingOf(run.expect(L), 120000);
      check(`the run fails, and says why in the reader's language: «${run.expect(L)}»`, said.includes(String(run.expect(L))), said.slice(-400));
      if (locale === "el") {
        const found = englishIn(said, RUNS_EN, [...ROUTE_ENGLISH, ...ROUTE_RESEARCH_ENGLISH]);
        check("...with no English sentence on the Greek screen", found.length === 0, found.join(" | "));
      }
      check("...after every question was really asked", model.calls.length >= 1 + QUESTIONS.length, String(model.calls.length));
      check("...and the run's hold given back", tables.rpcCalls.filter((c) => c.name === "release_reservation").length >= 1, tables.rpcCalls.map((c) => c.name).join(","));
      check(`no page threw (${pageErrors.length})`, pageErrors.length === 0, pageErrors.slice(0, 3).join(" | "));
      await context.close();
      continue;
    }

    // ---- the run, and its report
    const body = page.locator('[data-testid="research-cited-body"]').first();
    for (let i = 0; i < 240 && (await body.count()) === 0; i++) {
      // On the page the finished report is opened from its row's menu.
      if (!shell && store.research_reports.find((r) => r.topic === "Ο τουρισμός στη Νάξο")?.status === "ready") {
        const menu = page.locator('main button[aria-haspopup="menu"]').first();
        if (await menu.count()) {
          await press(menu);
          const item = page.locator(`[role="menuitem"]:has-text("${SAID(L).openReport}")`).first();
          if (await item.count()) await press(item);
        }
      }
      await page.waitForTimeout(500);
    }
    const done = store.research_reports.find((r) => r.topic === "Ο τουρισμός στη Νάξο");
    check("the real pipeline asked every question and wrote the report", done?.status === "ready" && model.calls.length === 2 + QUESTIONS.length && (done?.sections?.length ?? 0) >= 2, `status=${done?.status} calls=${model.calls.length} error=${done?.error}`);
    check("...its sources the ones the searches cited, numbered once", JSON.stringify(done?.sources?.map((x) => x.url)) === JSON.stringify(SOURCES.map((x) => x.url)), JSON.stringify(done?.sources));
    const links = body.locator("a");
    check("the report opens on the screen with [1][2] as links to those sources, in a new tab",
      (await links.count()) >= 2 && (await links.nth(0).innerText()) === "[1]" && (await links.nth(0).getAttribute("href")) === SOURCES[0].url && (await links.nth(1).getAttribute("href")) === SOURCES[1].url && (await links.nth(0).getAttribute("target")) === "_blank");
    if (locale === "el") {
      const found = englishIn(await page.locator("main").innerText(), RUNS_EN, [...ROUTE_ENGLISH, ...ROUTE_RESEARCH_ENGLISH]);
      check("...the screen in Greek, with no English sentence on it", found.length === 0, found.join(" | "));
    }
    if (shell) {
      const button = page.locator('[data-testid="research-to-slides"]');
      await press(button);
      await page.waitForTimeout(400);
      if (!store.ai_presentations.length && (await button.innerText()).includes(SAID(L).toSlides.confirm.split("{")[0].trim())) await press(button);
      await page.waitForURL(/\/dashboard\/presentations\?record=/, { timeout: 30000 }).catch(() => null);
      await page.locator('[data-testid="slide-card"]').last().waitFor({ timeout: 15000 }).catch(() => null);
      const slidesText = await page.locator("main").innerText();
      check("...one press, and Slides opens the deck with its sources slide", slidesText.includes("[1] Eurostat: τουρισμός") && slidesText.includes("[2] ΕΛΣΤΑΤ: νησιά"), page.url());
    }
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    check("the page does not scroll sideways", overflow <= 1, `${overflow}px`);
    check(`no page threw (${pageErrors.length})`, pageErrors.length === 0, pageErrors.slice(0, 3).join(" | "));
    await context.close();
  }

  check("the English detector is not blind: it found English on the English screens", detectorSawEnglish.length > 0 && detectorSawEnglish.every((n) => n > 0), JSON.stringify(detectorSawEnglish));
} catch (err) {
  check("the run completed", false, String(err?.stack ?? err) + (pageErrors.length ? `\n        page errors: ${pageErrors.slice(0, 3).join(" | ")}` : ""));
} finally {
  if (browser) await browser.close().catch(() => {});
  cleanup();
}

console.log(failures.length ? `\nFAILURES: ${pass} passed, ${failures.length} failed` : `\nALL PASS: ${pass} passed, 0 failed`);
process.exit(failures.length === 0 ? 0 : 1);
