/*
 * EVERY TOOL IN ONE SHELL, IN THE BUILT APP (MASTER 14.3, package 3).
 *
 * Run: node scripts/tests/tool-shell.prodtest.mjs
 *      SKIP_BUILD=1 node scripts/tests/tool-shell.prodtest.mjs
 *
 * One production build, two servers: one where the signed-in account is
 * the test account (TEST_ACCOUNT_EMAILS), so the switch "tool-shell" is on
 * for it, and one where it is not, so it is off. With the switch on, Posts
 * is the shell: the field is focused on arrival, at most four options sit
 * under it, nothing else on the page takes text, there are no steps on
 * top; a brief sent there writes the posts and they open beside the
 * conversation on a computer and over it on a phone, with a way back.
 * With the switch off, the old page is drawn exactly as before. Slides
 * the same, and there the second thing said in the field CHANGES the open
 * deck through /api/presentations/[id]/edit rather than writing a new one.
 * Research keeps its stop: the subject is PLANNED, the plan comes back
 * into the conversation with its price, and only the press under it runs;
 * the finished report opens beside the conversation with its sources.
 *
 * BOXES (package 4): a slide, and a part of the site, are pressed to choose
 * them; the field then says what will change, the next change is sent with
 * that one box, and the preview stays sandbox="" with the chosen part
 * outlined. scripts/tests/boxes.test.mjs runs the server half.
 *
 * /api/posts/generate is answered by the browser (page.route), so no
 * model is called and nothing is charged; what is tested is the screen.
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

MOCK_USER.user_metadata = { subscription_tier: "growth" };
const supa = await startMockSupabase({
  port: 54363,
  tableRows: {
    user_credits: [{ user_id: MOCK_USER.id, credits_remaining: 3000, credits_total: 3000 }],
    // ONE FILE AND ONE QUESTION ASKED OF IT, so Analyze has something to
    // draw: the conversation is the questions, the work is the file.
    data_analyses: [{
      id: "33333333-3333-4333-8333-333333333333", user_id: MOCK_USER.id, title: "πωλήσεις.csv", file_name: "πωλήσεις.csv",
      row_count: 3, truncated: false, ragged_rows: 0, created_at: "2026-10-07T08:00:00Z", analysed_at: null,
      headers: ["περιοχή", "ποσό"], rows: [["Αθήνα", "10"], ["Πάτρα", "4"], ["Αθήνα", "6"]],
      profile: {
        rowCount: 3, duplicateRows: 0, correlations: [],
        columns: [
          { name: "περιοχή", index: 0, type: "text", filled: 3, missing: 0, unique: 2, topValues: [{ value: "Αθήνα", count: 2 }, { value: "Πάτρα", count: 1 }] },
          { name: "ποσό", index: 1, type: "number", filled: 3, missing: 0, unique: 3, topValues: [], numeric: { min: 4, max: 10, mean: 6.67, median: 6, sum: 20, stdDev: 2.5, outlierCount: 0 } },
        ],
      },
      findings: null,
    }],
    user_files: [{
      id: "55555555-5555-4555-8555-555555555555", user_id: MOCK_USER.id, filename: "σύμβαση.pdf", file_type: "pdf",
      size_bytes: 120000, page_count: 12, char_count: 30000, processing_status: "ready", error: null, uploaded_at: "2026-10-07T07:00:00Z",
    }],
    data_analysis_questions: [{
      id: "44444444-4444-4444-8444-444444444444", analysis_id: "33333333-3333-4333-8333-333333333333", user_id: MOCK_USER.id,
      created_at: "2026-10-07T08:01:00Z", question: "Ποια περιοχή πούλησε περισσότερα;", answer: "Η Αθήνα, με 16.",
      evidence: { query: {}, rows: [{ group: "Αθήνα", value: 16, rows: 2 }, { group: "Πάτρα", value: 4, rows: 1 }], matchedRows: 3, totalRows: 3 },
    }],
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
  // Nobody is the owner here; the switch is decided by the test account.
  ADMIN_EMAILS: "",
};

const el = JSON.parse(readFileSync("messages/el.json", "utf8"));
const W = {
  name: el.dashboard.tools.names.posts,
  oldGenerate: el.posts.form.generate,
  back: el.dashboard.toolShell.back,
  box: el.dashboard.toolShell.box,
};

const servers = [];
// Every uncaught error in the page, per device; printed also when a step
// throws, because a crashed screen is usually WHY the step threw.
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

// THE SHAPE THE ROUTE RETURNS (lib/presentations/deck.ts, Deck and Slide),
// every field: the first version of this left out `notes`, and the screen
// crashed on a deck the real route can never send.
const slide = (layout, title, bullets) => ({ layout, title, bullets, notes: "", imageQuery: null, image: null });
const DECK = {
  version: 1,
  title: "Πρωινό στο γραφείο",
  locale: "el",
  imageSource: "none",
  slides: [
    slide("title", "Πρωινό στο γραφείο", []),
    slide("bullets", "Τι φέρνουμε", ["Ψωμί της ημέρας", "Καφές", "Φρούτα"]),
    slide("bullets", "Τιμές", ["Από δέκα άτομα", "Παραγγελία ως τις 18:00"]),
  ],
};

const SET = {
  version: 1,
  locale: "el",
  posts: [
    { platform: "linkedin", text: "Ο φούρνος μας φέρνει πλέον πρωινό στα γραφεία του κέντρου.", hashtags: ["#πρωινό"] },
    { platform: "x", text: "Πρωινό στο γραφείο, από τον φούρνο της γειτονιάς.", hashtags: [] },
  ],
};

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
  const OFF = await start({ ...base, TEST_ACCOUNT_EMAILS: "" });
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium" });

  for (const device of [
    { label: "desktop", viewport: { width: 1440, height: 900 }, touch: false },
    { label: "phone", viewport: { width: 390, height: 844 }, touch: true },
  ]) {
    console.log(`\n== ${device.label} ${device.viewport.width}x${device.viewport.height} ==`);
    const context = await browser.newContext({ viewport: device.viewport, hasTouch: device.touch, isMobile: device.touch });
    await context.addCookies(
      [ON, OFF].flatMap((origin) => [
        { ...supa.authCookie, url: origin, httpOnly: false, secure: false, sameSite: "Lax" },
        { name: "NEXT_LOCALE", value: "el", url: origin },
      ]).map(({ domain, path, ...c }) => c)
    );
    const page = await context.newPage();
    // A SCREEN THAT THROWS IS A FAILURE WHATEVER ELSE PASSES: every
    // uncaught error in the page is collected and checked at the end.
    pageErrors.length = 0;
    page.on("pageerror", (err) => pageErrors.push(String(err?.message ?? err)));
    // A real finger on the phone, a mouse on the desktop.
    const cdp = device.touch ? await context.newCDPSession(page) : null;
    async function press(locator) {
      await locator.scrollIntoViewIfNeeded();
      if (!cdp) return locator.click();
      const box = await locator.boundingBox();
      const x = box.x + box.width / 2, y = box.y + box.height / 2;
      await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
      await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    }
    const sent = [];
    await page.route("**/api/posts/generate", (r) => {
      sent.push(r.request().postDataJSON());
      return r.fulfill({ contentType: "application/json", body: JSON.stringify({ id: null, set: SET, creditsCharged: 3 }) });
    });

    // ---- the switch off: the old page, as before
    await page.goto(`${OFF}/dashboard/posts`, { waitUntil: "networkidle" });
    check("switch off: the old page is drawn", (await page.locator('[data-testid="posts-generate"]').count()) === 1 && (await page.locator('[data-testid="tool-shell"]').count()) === 0);

    // ---- the switch on: the shell
    await page.goto(`${ON}/dashboard/posts`, { waitUntil: "networkidle" });
    const shell = page.locator('[data-testid="tool-shell"]');
    check("switch on: Posts is the shell", (await shell.count()) === 1 && (await page.locator('[data-testid="posts-generate"]').count()) === 0);
    check("...named with its one word", (await shell.locator("h1").innerText()).trim() === W.name);
    const focused = await page.evaluate(() => document.activeElement?.tagName === "TEXTAREA");
    check("...the field is focused on arrival", focused);
    const fields = await page.locator("main textarea, main input:not([type=checkbox]):not([type=hidden])").count();
    check(`...and it is the only thing on the page that takes text (${fields})`, fields === 1);
    const options = await page.locator('[data-testid="tool-shell-options"] > *').count();
    check(`...with at most four options under it (${options})`, options >= 1 && options <= 4);
    check("...and no steps on top", (await page.locator('[data-testid^="step-flow"]').count()) === 0);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    check("...and the page does not scroll sideways", overflow <= 1, `${overflow}px`);

    // ---- the platforms option opens its choice by a press, finger or mouse
    const chooser = page.locator('[data-testid="posts-platforms"]');
    if ((await chooser.count()) === 1) {
      await press(chooser);
      await page.waitForTimeout(200);
    }
    const boxes = await page.locator('[data-testid="tool-shell-options"] input[type=checkbox]:visible').count();
    check(`the platforms option opens the five platforms to choose from (${boxes})`, boxes === 5);
    if ((await chooser.count()) === 1) await press(chooser);

    // ---- a brief, sent from the field
    const field = page.locator("main textarea");
    await field.fill("Ο φούρνος μας φέρνει πλέον πρωινό στα γραφεία του κέντρου.");
    await field.press("Enter");
    const work = page.locator('[data-testid="tool-shell-work"]');
    const opened = await work.waitFor({ state: "visible", timeout: 10000 }).then(() => true, () => false);
    check("the brief went to /api/posts/generate once, with every platform", sent.length === 1 && Array.isArray(sent[0]?.platforms) && sent[0].platforms.length === 5, JSON.stringify(sent[0] ?? null));
    // Two posts came back for five platforms: two cards, and a line for
    // each of the three that are missing.
    const cards = opened ? await work.locator('[data-testid="posts-result"] > li h3').count() : 0;
    const lines = opened ? await work.locator('[data-testid="posts-result"] > li').count() : 0;
    check(`the posts open in the work area (${cards} posts, ${lines - cards} missing)`, opened && cards === 2 && lines === 5);
    check("...and the conversation keeps the brief and a card that opens them again",
      (await page.locator('[data-testid="tool-shell-thread"] [data-role="user"]').count()) === 1 && (await page.locator('[data-testid="tool-shell-card"]').count()) === 1);
    const geo = await page.evaluate(() => {
      const r = (s) => document.querySelector(s)?.getBoundingClientRect();
      return { work: r('[data-testid="tool-shell-work"]'), thread: r('[data-testid="tool-shell-thread"]'), shell: r('[data-testid="tool-shell"]'), vw: innerWidth };
    });
    if (device.touch) {
      check("phone: the work is the whole screen", geo.work && Math.round(geo.work.width) === geo.vw, JSON.stringify(geo.work));
      const back = page.getByRole("button", { name: W.back });
      check("...with a way back to the conversation", (await back.count()) === 1);
      if ((await back.count()) === 1) {
        await press(back);
        await page.waitForTimeout(300);
        check("...that closes it", (await work.count()) === 0);
      }
    } else {
      check("computer: the work is beside the conversation, about 60%",
        geo.work && geo.thread && geo.shell && geo.work.left >= geo.thread.right - 1 && Math.abs(geo.work.width / geo.shell.width - 0.6) < 0.08, JSON.stringify(geo));
    }

    // ---- Slides: written, then changed, from the same field
    const generated = [];
    const edits = [];
    await page.route("**/api/presentations/generate", (r) => {
      generated.push(r.request().postDataJSON());
      return r.fulfill({ contentType: "application/json", body: JSON.stringify({ id: "11111111-1111-4111-8111-111111111111", deck: DECK, creditsCharged: 4 }) });
    });
    await page.route("**/api/presentations/*/edit", (r) => {
      edits.push(r.request().postDataJSON());
      return r.fulfill({ contentType: "application/json", body: JSON.stringify({ id: "11111111-1111-4111-8111-111111111111", deck: { ...DECK, title: "Πρωινό στο γραφείο, σύντομα" }, creditsCharged: 2 }) });
    });
    await page.goto(`${OFF}/dashboard/presentations`, { waitUntil: "networkidle" });
    check("Slides, switch off: the old page is drawn", (await page.locator('[data-testid="deck-generate"]').count()) === 1 && (await page.locator('[data-testid="tool-shell"]').count()) === 0);
    await page.goto(`${ON}/dashboard/presentations`, { waitUntil: "networkidle" });
    check("Slides, switch on: the shell", (await page.locator('[data-testid="tool-shell"]').count()) === 1 && (await page.locator('[data-testid="deck-generate"]').count()) === 0);
    const slideOptions = await page.locator('[data-testid="tool-shell-options"] > *').count();
    check(`...with at most four options (${slideOptions})`, slideOptions >= 1 && slideOptions <= 4);
    const slideField = page.locator("main textarea");
    await slideField.fill("Παρουσίαση του πρωινού για γραφεία, σε τρεις διευθυντές.");
    await slideField.press("Enter");
    const deckOpen = await page.locator('[data-testid="tool-shell-work"]').waitFor({ state: "visible", timeout: 10000 }).then(() => true, () => false);
    check("the brief wrote a deck, and its slides open in the work area",
      generated.length === 1 && deckOpen && (await page.locator('[data-testid="tool-shell-work"] ol > li').count()) === 3, JSON.stringify(generated[0] ?? null));
    check("...with PowerPoint on top", (await page.locator('[data-testid="slides-pptx"]').count()) === 1);
    if (device.touch) {
      // On a phone the deck covers the conversation: back first, then say
      // the change. The deck is still the current one.
      await press(page.getByRole("button", { name: W.back }));
      await page.waitForTimeout(300);
    }
    await slideField.fill("Κάν' το πιο σύντομο.");
    await slideField.press("Enter");
    await page.waitForTimeout(800);
    check("the next thing said CHANGED the open deck instead of writing another",
      generated.length === 1 && edits.length === 1 && edits[0]?.instruction === "Κάν' το πιο σύντομο." && !("slideIndex" in (edits[0] ?? {})), JSON.stringify({ generated: generated.length, edits }));

    // ---- Slides: one box
    const slideBox = page.locator('[data-testid="slide-box"]').nth(1);
    const boxesShown = await slideBox.waitFor({ state: "visible", timeout: 5000 }).then(() => true, () => false);
    check("the open deck's slides are boxes to press", boxesShown && (await page.locator('[data-testid="slide-box"]').count()) === 3);
    if (boxesShown) await press(slideBox);
    await page.waitForTimeout(300);
    const chip = page.locator('[data-testid="box-chosen"]');
    check("pressing slide 2 says under the field that only it will change",
      (await chip.count()) === 1 && (await chip.innerText()).includes(W.box.slide.replace("{n}", "2")), (await chip.count()) ? await chip.innerText() : "no chip");
    if (device.touch) check("phone: pressing a box goes back to the field", (await page.locator('[data-testid="tool-shell-work"]').count()) === 0 && (await slideField.isVisible()));
    else check("computer: the pressed slide is marked as chosen", (await slideBox.getAttribute("aria-pressed")) === "true");
    await slideField.fill("Πρόσθεσε μια τιμή.");
    await slideField.press("Enter");
    await page.waitForTimeout(800);
    check("the change was sent with that slide, and only that slide",
      edits.length === 2 && edits[1]?.slideIndex === 1 && edits[1]?.instruction === "Πρόσθεσε μια τιμή.", JSON.stringify(edits[1] ?? null));
    check("...and the conversation says only slide 2 changed",
      (await page.locator('[data-testid="tool-shell-thread"] [data-role="tool"]').last().innerText()).includes(W.box.slideChanged.replace("{n}", "2")));
    // On a phone the changed deck opened over the field again: back first.
    if (device.touch) await press(page.getByRole("button", { name: W.back }));
    await page.waitForTimeout(300);
    check("...the slide is still chosen for the next change", (await chip.count()) === 1);
    if ((await page.locator('[data-testid="box-clear"]').count()) === 1) await press(page.locator('[data-testid="box-clear"]'));
    await page.waitForTimeout(200);
    check("...and the press beside it goes back to the whole deck", (await chip.count()) === 0);

    // ---- Research: planned, approved, run, and read
    const RID = "22222222-2222-4222-8222-222222222222";
    const planned = [];
    const runs = [];
    const plannedReport = {
      id: RID, topic: "Το EU AI Act για μικρές SaaS", status: "pending", document_id: null, credits_charged: 0, error: null,
      created_at: "2026-10-07T09:00:00Z", completed_at: null,
      questions: [{ question: "Ποιες υποχρεώσεις ισχύουν από το 2026;", why: "" }, { question: "Τι αλλάζει για τα chatbot;", why: "" }],
    };
    await page.route("**/api/research", (r) => {
      if (r.request().method() !== "POST") return r.continue();
      planned.push(r.request().postDataJSON());
      return r.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true, report: plannedReport, estimate: { credits: 40 } }) });
    });
    await page.route(`**/api/research/${RID}/run`, (r) => {
      runs.push(1);
      return r.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true }) });
    });
    await page.route(`**/api/research/${RID}`, (r) =>
      r.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          report: {
            ...plannedReport, status: "ready", completed_at: "2026-10-07T09:05:00Z",
            sections: [{ heading: "Σύνοψη", body: "Από τον Αύγουστο του 2026 ισχύουν οι υποχρεώσεις διαφάνειας [1]." }],
            sources: [{ title: "EUR-Lex", url: "https://eur-lex.europa.eu/" }],
          },
        }),
      })
    );
    await page.goto(`${ON}/dashboard/deep-research`, { waitUntil: "networkidle" });
    check("Research, switch on: the shell", (await page.locator('[data-testid="tool-shell"]').count()) === 1);
    const researchField = page.locator("main textarea");
    await researchField.fill("Το EU AI Act για μικρές SaaS");
    await researchField.press("Enter");
    const planShown = await page.locator('[data-testid="research-plan"]').waitFor({ state: "visible", timeout: 10000 }).then(() => true, () => false);
    check("the subject was PLANNED, and the plan is in the conversation with its questions and price",
      planned.length === 1 && runs.length === 0 && planShown && (await page.locator('[data-testid="research-plan"] ol > li').count()) === 2 &&
        (await page.locator('[data-testid="research-plan"]').innerText()).includes("40"),
      JSON.stringify({ planned: planned.length, runs: runs.length }));
    await press(page.locator('[data-testid="research-start"]'));
    const reportShown = await page.locator('[data-testid="research-report"]').waitFor({ state: "visible", timeout: 20000 }).then(() => true, () => false);
    check("only the press ran it, and the finished report opens with its numbered sources",
      runs.length === 1 && reportShown && (await page.locator('[data-testid="research-sources"] > li').count()) === 1);
    // ---- Analyze: the conversation is the questions asked of the file
    const asked = [];
    await page.route("**/api/data-analysis/*/ask", (r) => {
      asked.push(r.request().postDataJSON());
      return r.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true }) });
    });
    await page.goto(`${ON}/dashboard/data-analysis`, { waitUntil: "networkidle" });
    check("Analyze, switch on: the shell", (await page.locator('[data-testid="tool-shell"]').count()) === 1);
    check("...the question asked before is in the conversation, with the rows its answer stands on",
      (await page.locator('[data-testid="tool-shell-thread"] [data-role="user"]').count()) >= 1 && (await page.locator('[data-testid="analysis-evidence"] tr').count()) === 2);
    const analyzeOptions = await page.locator('[data-testid="tool-shell-options"] > *').count();
    check(`...with at most four options (${analyzeOptions})`, analyzeOptions >= 1 && analyzeOptions <= 4);
    if (!device.touch) {
      check("computer: the file is open beside the conversation", (await page.locator('[data-testid="analysis-file"]').count()) === 1);
    }
    const askField = page.locator("main textarea");
    await askField.fill("Πόσα πούλησε η Πάτρα;");
    await askField.press("Enter");
    await page.waitForTimeout(800);
    check("the field asked the open file", asked.length === 1 && asked[0]?.question === "Πόσα πούλησε η Πάτρα;", JSON.stringify(asked));

    // ---- Files: tick a file, ask, and the answer names its page
    const askedFiles = [];
    await page.route("**/api/jobs?kind=file_ask", (r) => r.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true, job: null }) }));
    await page.route("**/api/files/ask", (r) => {
      askedFiles.push(r.request().postDataJSON());
      return r.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true, jobId: "66666666-6666-4666-8666-666666666666" }) });
    });
    await page.route("**/api/jobs/66666666-6666-4666-8666-666666666666", (r) =>
      r.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          job: {
            id: "66666666-6666-4666-8666-666666666666", status: "done", stepLabel: null, error: null, creditsCharged: 2,
            result: { answered: true, answer: "Η ακύρωση θέλει γραπτή ειδοποίηση 30 ημερών [σύμβαση.pdf, σελ. 3].", answeredFromDocuments: true,
              citations: [{ filename: "σύμβαση.pdf", label: "σελ. 3" }], removedCitations: 0, skippedFiles: [], truncated: false, parts: 1, disclosure: "" },
          },
        }),
      })
    );
    await page.route("**/api/jobs/*/seen", (r) => r.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true }) }));
    await page.goto(`${ON}/dashboard/files`, { waitUntil: "networkidle" });
    check("Files, switch on: the shell", (await page.locator('[data-testid="tool-shell"]').count()) === 1);
    const filesField = page.locator("main textarea");
    await filesField.fill("Τι λέει για την ακύρωση;");
    await filesField.press("Enter");
    await page.waitForTimeout(400);
    check("with nothing ticked, nothing is asked, and the files open to tick one",
      askedFiles.length === 0 && (await page.locator('[data-testid="files-shell-list"]').count()) === 1);
    await press(page.locator('[data-testid="files-shell-list"] input[type=checkbox]').first());
    if (device.touch) {
      await press(page.getByRole("button", { name: W.back }));
      await page.waitForTimeout(300);
    }
    await filesField.fill("Τι λέει για την ακύρωση;");
    await filesField.press("Enter");
    const cited = await page.locator('[data-testid="files-citations"] li').first().waitFor({ state: "visible", timeout: 15000 }).then(() => true, () => false);
    check("the ticked file was asked, and the answer names the page it came from",
      askedFiles.length === 1 && askedFiles[0]?.fileIds?.[0] === "55555555-5555-4555-8555-555555555555" && cited &&
        (await page.locator('[data-testid="files-citations"]').innerText()).includes("σελ. 3"), JSON.stringify(askedFiles));

    // ---- Site: built, watched, previewed, then changed from the field
    const SID = "77777777-7777-4777-8777-777777777777";
    const HTML =
      "<!doctype html><html><head><title>Φούρνος</title></head><body><header><h1>Ο φούρνος της γειτονιάς</h1></header>" +
      "<section><h2>Πρωινό στο γραφείο σας</h2><p>Κάθε πρωί.</p></section><footer><p>Πάτρα</p></footer></body></html>";
    const siteRecord = (status, html) => ({
      id: SID, user_id: MOCK_USER.id, name: "Φούρνος", html_content: html, status, error_message: null, description: "Site για φούρνο",
      reference_image_url: null, has_reference_images: false, is_large_request: false, free_retry_used: false, created_at: "2026-10-07T10:00:00Z",
    });
    const built = [];
    const changes = [];
    let statusCalls = 0;
    await page.route("**/api/websites/generate", (r) => {
      built.push(r.request().postDataJSON());
      return r.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true, generated: true, record: siteRecord("processing", "") }) });
    });
    await page.route("**/api/websites/generate/process", (r) => r.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true }) }));
    await page.route(`**/api/websites/status?id=${SID}`, (r) => {
      statusCalls++;
      const done = statusCalls >= 2;
      return r.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true, record: siteRecord(done ? "completed" : "processing", done ? HTML : "") }) });
    });
    await page.route("**/api/websites/edit", (r) => {
      changes.push(r.request().postDataJSON());
      return r.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true, edited: true, record: siteRecord("completed", HTML.replace("Πρωινό", "Μεσημεριανό")) }) });
    });
    await page.goto(`${ON}/dashboard/website-builder`, { waitUntil: "networkidle" });
    check("Site, switch on: the shell", (await page.locator('[data-testid="tool-shell"]').count()) === 1);
    const siteOptions = await page.locator('[data-testid="tool-shell-options"] > *').count();
    check(`...with at most four options (${siteOptions})`, siteOptions >= 1 && siteOptions <= 4);
    const siteField = page.locator("main textarea");
    await siteField.fill("Site για τον φούρνο μας, με πρωινό στα γραφεία.");
    await siteField.press("Enter");
    const previewShown = await page.locator('[data-testid="site-preview"] iframe').waitFor({ state: "visible", timeout: 20000 }).then(() => true, () => false);
    check("the description built a site, and the finished site opens beside the conversation, sandboxed",
      built.length === 1 && previewShown && (await page.locator('[data-testid="site-preview"] iframe').getAttribute("sandbox")) === "", JSON.stringify({ built: built.length, statusCalls }));
    if (device.touch) {
      await press(page.getByRole("button", { name: W.back }));
      await page.waitForTimeout(300);
    }
    await siteField.fill("Άλλαξε το πρωινό σε μεσημεριανό.");
    await siteField.press("Enter");
    await page.waitForTimeout(800);
    check("the next thing said CHANGED the site instead of building another",
      built.length === 1 && changes.length === 1 && changes[0]?.changeRequest === "Άλλαξε το πρωινό σε μεσημεριανό." && changes[0]?.websiteId === SID && !("section" in (changes[0] ?? {})), JSON.stringify(changes));

    // ---- Site: one box
    const siteBox = page.locator('[data-testid="site-box"]').nth(1);
    const partsShown = await siteBox.waitFor({ state: "visible", timeout: 5000 }).then(() => true, () => false);
    check("the site's parts are boxes to press: header, section, footer", partsShown && (await page.locator('[data-testid="site-box"]').count()) === 3);
    const partName = partsShown ? (await siteBox.innerText()).replace(/^2\.\s*/, "") : "";
    if (partsShown) await press(siteBox);
    await page.waitForTimeout(300);
    check("pressing a part says under the field that only it will change",
      (await chip.count()) === 1 && (await chip.innerText()).includes(partName) && partName.length > 0, JSON.stringify({ partName }));
    if (device.touch) check("phone: pressing a part goes back to the field", (await page.locator('[data-testid="tool-shell-work"]').count()) === 0 && (await siteField.isVisible()));
    else {
      const frame = page.locator('[data-testid="site-preview"] iframe');
      check("computer: the chosen part is outlined in the preview, which stays without scripts",
        (await frame.getAttribute("sandbox")) === "" && /<section data-ionexa-n="2" data-ionexa-on>/.test((await frame.getAttribute("srcdoc")) ?? ""));
    }
    await siteField.fill("Βάλε και ωράριο.");
    await siteField.press("Enter");
    await page.waitForTimeout(800);
    check("the change was sent with that part, and only that part",
      changes.length === 2 && changes[1]?.section === 1 && changes[1]?.changeRequest === "Βάλε και ωράριο.", JSON.stringify(changes[1] ?? null));
    check("...and the conversation says only that part changed",
      (await page.locator('[data-testid="tool-shell-thread"] [data-role="tool"]').last().innerText()).includes(W.box.partChanged.replace("{name}", partName)));

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
