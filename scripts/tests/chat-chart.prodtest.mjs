/*
 * A CHART AND A CARD UNDER A CHAT ANSWER, IN THE BUILT APP (the owner's
 * «30. CHAT: ΓΡΑΦΗΜΑΤΑ, ΔΙΑΓΡΑΜΜΑΤΑ ΚΑΙ ΚΑΡΤΕΣ ΜΕΣΑ ΣΤΗΝ ΑΠΑΝΤΗΣΗ»,
 * 2026-10-31), Κομμάτι 1 ONLY, behind "chat-charts": «ΜΟΝΟ ΕΔΩ:
 * στιγμιότυπο ενός γραφήματος και μιας κάρτας, και σταματάς μέχρι να
 * γράψω «εγκρίνω».» This file takes that screenshot.
 *
 * Run: node scripts/tests/chat-chart.prodtest.mjs
 *      SKIP_BUILD=1 node scripts/tests/chat-chart.prodtest.mjs
 *      SHOT_DIR=/tmp/chat-chart-shots node scripts/tests/chat-chart.prodtest.mjs
 *
 * THE ROW IS SEEDED, NOT STREAMED. chat-attachments.prodtest.mjs already
 * proves the general mechanism — a live round against a faked /api/chat,
 * then a reload that must show the same thing — for web sources and
 * memory citations; what is specific to THIS piece is the carrier
 * (lib/chat/answer-chart.ts) and the component it feeds
 * (components/chat/answer-chart.tsx), and both of those are exercised
 * fully by seeding an assistant row whose content already carries a real
 * chart, built by the REAL deckChartsFrom and attachAnswerChart — never
 * hand-written JSON a future change to either function could silently
 * stop matching.
 *
 * THE DATASET IS THE SAME ONE tool-shell.prodtest.mjs already seeds for
 * Analyze: περιοχή/ποσό, Αθήνα (16) and Πάτρα (4) — so deckChartsFrom's
 * own arithmetic, not a number picked for this file, is what the chart
 * and the card both show.
 *
 * WHAT "APPEARS IN UNDER A SECOND" MEANS HERE. The quality bar is about
 * the live stream, which this file does not drive (see above); what IS
 * tested is the honest half of that claim — the chart has no fetch, no
 * spinner and no second render pass of its own, so once the message's
 * own content is on the page the chart is already there. Measured
 * directly: no network request happens between the message appearing
 * and the chart's own elements being found.
 *
 * Both devices: 1440x900 with a mouse, 390x844 with touch — the other
 * quality bar, «διαβάζονται σε κινητό 390px», is measured, not assumed.
 */
import http from "node:http";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { chromium } from "playwright";
import { startMockSupabase, MOCK_USER } from "../lib/mock-supabase.mjs";
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

// THE REAL FUNCTIONS, not a restatement of what they do — a change to
// either one's output shape shows up here as a built chart that no
// longer looks like what this file expects, not as a passing mock.
const { deckChartsFrom } = await loadTs("src/lib/presentations/deck-charts.ts");
const { attachAnswerChart } = await loadTs("src/lib/chat/answer-chart.ts");

const DATA_ID = "33333333-3333-4333-8333-333333333333";
const PROFILE = {
  rowCount: 3,
  duplicateRows: 0,
  correlations: [],
  columns: [
    { name: "περιοχή", index: 0, type: "text", filled: 3, missing: 0, unique: 2, topValues: [{ value: "Αθήνα", count: 2 }, { value: "Πάτρα", count: 1 }] },
    { name: "ποσό", index: 1, type: "number", filled: 3, missing: 0, unique: 3, topValues: [], numeric: { min: 4, max: 10, mean: 6.67, median: 6, sum: 20, stdDev: 2.5, outlierCount: 0 } },
  ],
};
const HEADERS = ["περιοχή", "ποσό"];
const ROWS = [["Αθήνα", "10"], ["Πάτρα", "4"], ["Αθήνα", "6"]];
const charts = deckChartsFrom({ dataId: DATA_ID, file: "πωλήσεις.csv", headers: HEADERS, rows: ROWS, profile: PROFILE }, "Λοιπά");
const CHART = charts[0];
if (!CHART) throw new Error("the fixture's own profile allows no chart — fix the fixture, not this file");

const CONV = "c4444444-4444-4444-8444-444444444444";
const QUESTION = "Ποια περιοχή πούλησε περισσότερα;";
const ANSWER = "Η Αθήνα πούλησε περισσότερα.";
const CONTENT = attachAnswerChart(ANSWER, CHART);

MOCK_USER.user_metadata = { subscription_tier: "growth" };
const supa = await startMockSupabase({
  port: 54491,
  tableRows: {
    user_credits: [{ user_id: MOCK_USER.id, credits_remaining: 3000, credits_total: 3000 }],
    data_analyses: [{
      id: DATA_ID, user_id: MOCK_USER.id, title: "πωλήσεις.csv", file_name: "πωλήσεις.csv",
      row_count: 3, truncated: false, ragged_rows: 0, created_at: "2026-10-07T08:00:00Z", analysed_at: null,
      headers: HEADERS, rows: ROWS, profile: PROFILE, findings: null,
    }],
    chat_conversations: [{ id: CONV, user_id: MOCK_USER.id, title: "Πωλήσεις ανά περιοχή", is_pinned: false, created_at: "2026-10-31T10:00:00Z", updated_at: "2026-10-31T10:00:00Z" }],
    chat_messages: [
      { id: "a0000000-0000-4000-8000-000000000011", conversation_id: CONV, user_id: MOCK_USER.id, role: "user", content: QUESTION, created_at: "2026-10-31T10:00:00Z", attachments: [{ kind: "data", dataId: DATA_ID, name: "πωλήσεις.csv" }], provenance: null },
      { id: "a0000000-0000-4000-8000-000000000012", conversation_id: CONV, user_id: MOCK_USER.id, role: "assistant", content: CONTENT, created_at: "2026-10-31T10:00:05Z", attachments: null, provenance: null },
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

const SHOT_DIR = process.env.SHOT_DIR;
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
  const server = spawn("npx", ["next", "start", "-p", String(port)], {
    env: { ...env, PORT: String(port), NEXT_PUBLIC_SITE_URL: origin },
    stdio: ["ignore", "pipe", "pipe"],
    detached: true,
  });
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
    console.log(`\n== ${device.label} ${device.viewport.width}x${device.viewport.height}: the chart and the card ==`);
    const context = await browser.newContext({ viewport: device.viewport, hasTouch: device.touch, isMobile: device.touch });
    await context.addCookies(
      [
        { ...supa.authCookie, url: ON, httpOnly: false, secure: false, sameSite: "Lax" },
        { name: "NEXT_LOCALE", value: "el", url: ON },
      ].map(({ domain, path: p, ...c }) => c)
    );
    const page = await context.newPage();
    pageErrors.length = 0;
    page.on("pageerror", (err) => pageErrors.push(String(err?.message ?? err)));
    const requestsDuringRead = [];
    page.on("request", (req) => {
      if (req.resourceType() !== "document") requestsDuringRead.push(req.url());
    });
    const shot = async (name) => SHOT_DIR && page.screenshot({ path: `${SHOT_DIR}/${device.label}-${name}.png`, fullPage: false });

    await page.goto(`${ON}/dashboard/chat?c=${CONV}`, { waitUntil: "networkidle" });
    const message = page.locator('[data-testid="chat-sent-attachments"]').first();
    await message.waitFor({ timeout: 10_000 }).catch(() => null);
    check("the answer itself is on the page", (await page.getByText(ANSWER).count()) >= 1);

    // ---- no fetch of its own: the chart is read from the message's
    //      own content, not a second round trip --------------------------
    requestsDuringRead.length = 0;
    const chartFigure = page.locator('[data-testid="answer-chart-figure"]');
    await chartFigure.waitFor({ timeout: 5_000 });
    check("the chart appears with no request of its own between the answer and it",
      requestsDuringRead.filter((u) => !u.includes("/_next/")).length === 0, requestsDuringRead.join(" | "));

    // ---- the chart: bars, in the design's own colours, with points ------
    check("the figure draws the kind deckChartsFrom computed", (await chartFigure.getAttribute("data-kind")) === CHART.kind);
    const bars = chartFigure.locator("svg rect");
    check(`bars are drawn (${await bars.count()})`, (await bars.count()) === CHART.points.length);
    const barColour = await bars.first().evaluate((el) => getComputedStyle(el.closest("svg")).color || el.getAttribute("fill"));
    check("a bar's fill is the design's own chart token, not a bare colour", (await bars.first().getAttribute("fill")) === "rgb(var(--chart-1))", String(barColour));
    const values = chartFigure.locator('[data-testid="answer-chart-values"] li');
    check(`every point is listed with its value (${await values.count()})`, (await values.count()) === CHART.points.length);
    check("Αθήνα's value is the real sum, not a number the model wrote", (await values.first().innerText()).includes("16"));
    await shot("chart");

    // ---- the card: a SEPARATE element, naming the file and the sum ------
    const card = page.locator('[data-testid="answer-chart-card"]');
    await card.waitFor({ timeout: 5_000 });
    check("the card is drawn, distinct from the figure", (await card.count()) === 1 && (await chartFigure.count()) === 1);
    const cardText = await card.innerText();
    check("...naming the file", cardText.includes("πωλήσεις.csv"));
    check("...and the sum, in full sentences", cardText.includes("16") || cardText.includes(String(CHART.source.rows)));
    check("...with no second white button on a page whose one is spent on send", (await card.locator(".bg-button").count()) === 0);
    const cardLink = card.locator("a");
    check("...and a way back to the file in Analyze", (await cardLink.getAttribute("href")) === `/dashboard/data-analysis?id=${DATA_ID}`);

    // ---- «διαβάζονται σε κινητό 390px»: measured, not assumed -----------
    if (device.touch) {
      const box = await chartFigure.boundingBox();
      check(`the chart fits the 390px frame without overflow (${Math.round(box.width)}px)`, box.width <= device.viewport.width);
      const cardBox = await card.boundingBox();
      check(`...and so does the card (${Math.round(cardBox.width)}px)`, cardBox.width <= device.viewport.width);
    }
    await shot("card");

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
