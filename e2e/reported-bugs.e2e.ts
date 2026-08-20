import { test, expect, request as playwrightRequest } from "@playwright/test";
import { signIn, requireEnv, TIMEOUTS, type Job } from "./support/journey";

/**
 * One test per REPORTED bug, against the REAL deployment.
 *
 * These exist because six features passed every local check while the
 * person using https://ai-os-saas-five.vercel.app could not see them. A
 * suite that cannot fail for the deployment's own reasons — a missing
 * bucket, an unapplied migration, an env var absent on Vercel — protects
 * nothing. Every test here runs in a real browser or against the real
 * API, signed in as the account in E2E_EMAIL, and FAILS LOUDLY with the
 * deployment-side remedy in the message.
 *
 * Cost: the agent-build test makes real model calls (~4-5 credits). The
 * others are reads, one tiny file upload, and typing. No website is
 * generated here (that is website-publish.e2e.ts / the variety script).
 *
 * Run: E2E_BASE_URL=https://ai-os-saas-five.vercel.app \
 *      E2E_ALLOW_PRODUCTION=1 E2E_EMAIL=... E2E_PASSWORD=... \
 *      npm run test:e2e -- reported-bugs
 */

test.describe.configure({ mode: "serial" });

const BASE = () => requireEnv("E2E_BASE_URL");

/** A browser context that is REALLY signed in (cookies from the app's own
 *  login route, no minted tokens). */
async function signedInContext(browser: import("@playwright/test").Browser) {
  const api = await playwrightRequest.newContext({ baseURL: BASE() });
  await signIn(api);
  const state = await api.storageState();
  await api.dispose();
  const context = await browser.newContext({ storageState: state, baseURL: BASE() });
  return context;
}

test("bug 1 — the empty-state example is a BUTTON that fills the form", async ({ browser }) => {
  test.setTimeout(120_000);
  const context = await signedInContext(browser);
  const page = await context.newPage();

  // Any surface will do; modules are the most numerous. Find one that is
  // actually empty on this account — an example only renders there.
  const candidates = ["/dashboard/decisions", "/dashboard/learning", "/dashboard/feedback", "/dashboard/content", "/dashboard"];
  let found = false;
  for (const path of candidates) {
    await page.goto(path, { waitUntil: "networkidle" });
    const example = page.locator('[data-testid="empty-example"]');
    if ((await example.count()) !== 1) continue;
    found = true;
    const tag = await example.evaluate((el) => el.tagName);
    expect(
      tag,
      `THE REPORTED BUG: on ${path} the worked example rendered as <${tag.toLowerCase()}>, ` +
        `not a <button>. The deployment is missing the onExample wiring.`
    ).toBe("BUTTON");
    const text = (await example.innerText()).trim().replace(/^[“"]/, "").replace(/[”"]$/, "");
    await example.click();
    const landed = await page
      .waitForFunction(
        (expected) =>
          [...document.querySelectorAll("input, textarea")].some(
            (f) => (f as HTMLInputElement).value === expected
          ),
        text,
        { timeout: 5000 }
      )
      .then(() => true)
      .catch(() => false);
    expect(landed, `clicking the example on ${path} did not fill any form field with "${text}"`).toBe(true);
    break;
  }
  test.skip(!found, "No empty surface on this account — clear one module to exercise this test.");
  await context.close();
});

test("bug 2 — a real file uploads through the real UI, into real storage", async ({ browser }) => {
  test.setTimeout(TIMEOUTS.upload + TIMEOUTS.extraction);
  const context = await signedInContext(browser);
  const page = await context.newPage();
  await page.goto("/dashboard/files", { waitUntil: "networkidle" });

  const name = `e2e-reported-${Date.now()}.txt`;
  await page.setInputFiles('input[type="file"]', {
    name,
    mimeType: "text/plain",
    buffer: Buffer.from("The cancellation clause allows 30 days notice.\nRenewals are yearly.\n"),
  });

  // The card carries the filename — locale-free. If this times out, check
  // System Health -> "Run storage check" on the deployment: a missing
  // 'user-files' bucket or missing storage policies is exactly what this
  // test exists to catch (supabase/migrations/20260819000000_files_storage_repair.sql).
  await expect(
    page.locator(`[data-testid="files-list"] :text("${name}")`).first(),
    `THE REPORTED BUG: the uploaded file never appeared. Run the storage check on ` +
      `/dashboard/system-health and apply the repair SQL if it is red.`
  ).toBeVisible({ timeout: TIMEOUTS.upload });

  // Clean up through the API (find the row by name, delete it).
  const files = await (await page.request.get("/api/files")).json().catch(() => null);
  const mine = files?.files?.find?.((f: { filename: string }) => f.filename === name);
  if (mine) await page.request.delete(`/api/files/${mine.id}`);
  await context.close();
});

test("bug 3 — the chat scroll contract markup is deployed", async ({ browser }) => {
  test.setTimeout(60_000);
  const context = await signedInContext(browser);
  const page = await context.newPage();
  await page.goto("/dashboard/chat", { waitUntil: "networkidle" });
  // The stick-to-bottom rework introduced this container. Its absence
  // means the deployment predates the fix — the "cannot scroll up" bug is
  // live there. (The full behavioural check — send, scroll up, send — is
  // scripts/tests/chat-scroll.prodtest.mjs; it needs a seeded thread and
  // costs messages here.)
  await expect(
    page.locator('[data-testid="chat-thread"]'),
    "The deployment predates the scroll fix (chat-thread container missing)."
  ).toBeVisible({ timeout: 15000 });
  await context.close();
});

test("bug 4 — typing latency in the real deployment, measured", async ({ browser }) => {
  test.setTimeout(90_000);
  const context = await signedInContext(browser);
  const page = await context.newPage();
  await page.goto("/dashboard/chat", { waitUntil: "networkidle" });
  await page.waitForSelector("main textarea", { timeout: 15000 });

  await page.evaluate(() => {
    (window as unknown as { __lat: number[] }).__lat = [];
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const e = entry as PerformanceEntry & { name: string; processingEnd: number; startTime: number };
        if (e.name === "input")
          (window as unknown as { __lat: number[] }).__lat.push(e.processingEnd - e.startTime);
      }
    });
    observer.observe({ type: "event", durationThreshold: 16 } as PerformanceObserverInit);
  });
  const field = page.locator("main textarea").first();
  await field.click();
  const sentence = "How does the cancellation clause interact with renewals?";
  await field.pressSequentially(sentence, { delay: 60 });
  await page.waitForTimeout(500);
  const { p95 } = await page.evaluate((expected) => {
    const reported = (window as unknown as { __lat: number[] }).__lat;
    const xs = [...Array(Math.max(0, expected - reported.length)).fill(4), ...reported].sort((a, b) => a - b);
    return { p95: xs[Math.min(xs.length - 1, Math.floor(0.95 * xs.length))] ?? 0 };
  }, sentence.length);
  console.log(`      typing main-thread p95 on the real deployment: ${p95.toFixed(0)}ms`);
  expect(p95, `THE REPORTED BUG: typing costs ${p95.toFixed(0)}ms p95 of main-thread work per keystroke (>100ms).`).toBeLessThanOrEqual(100);
  await context.close();
});

test("bugs 5+6+7 — agent build: visible steps, delivery channels, honest counter", async ({ browser }) => {
  test.setTimeout(TIMEOUTS.agentBuild + 120_000);
  const context = await signedInContext(browser);
  const page = await context.newPage();

  // Start a REAL build through the API (same route the button calls)...
  const started = await (
    await page.request.post("/api/agents/build", {
      data: {
        request: "Every Monday at 9am, summarise last week's sales entries and send them to me",
        skipClarification: true,
        timezone: "Europe/Athens",
      },
    })
  ).json();
  expect(started.ok, `POST /api/agents/build refused: ${JSON.stringify(started).slice(0, 300)}`).toBe(true);
  const jobId = String(started.jobId);

  // ...then open the page WHILE it runs: it adopts the running job, and
  // the four steps must be VISIBLE TEXT (they used to be aria-label only —
  // the "I only see 'Designing…'" report).
  await page.goto("/dashboard/agents", { waitUntil: "networkidle" });
  const stepSeen = await page
    .waitForSelector('[data-testid="ai-progress-step"]', { timeout: 60_000 })
    .then(() => true)
    .catch(() => false);
  const indicatorSeen = await page
    .locator('[data-testid="thinking-indicator"]')
    .first()
    .isVisible()
    .catch(() => false);

  // Wait for the job to finish so the preview renders.
  let job: Job | null = null;
  const deadline = Date.now() + TIMEOUTS.agentBuild;
  while (Date.now() < deadline) {
    const data = await (await page.request.get(`/api/jobs/${jobId}`)).json().catch(() => null);
    job = data?.job ?? null;
    if (job && (job.status === "done" || job.status === "failed")) break;
    await page.waitForTimeout(2000);
  }
  expect(job?.status, `the build job ended ${job?.status}: ${job?.error ?? ""}`).toBe("done");

  // A finished-but-unseen job is offered back on load — the preview must
  // show, carrying ALL FIVE delivery channels at creation time.
  await page.reload({ waitUntil: "networkidle" });
  for (const channel of ["email", "slack", "telegram", "discord", "in_app"]) {
    await expect(
      page.locator(`[data-testid="delivery-channel-${channel}"]`),
      `THE REPORTED BUG: the ${channel} delivery option is not offered at agent creation.`
    ).toBeVisible({ timeout: 20_000 });
  }
  // If the steps were not caught live (a very fast build), the indicator
  // presence during the run is still required evidence.
  expect(
    stepSeen || indicatorSeen,
    "THE REPORTED BUG: neither a step label nor the ThinkingIndicator was visible during the build."
  ).toBe(true);

  // Counter honesty: create -> +1, delete -> back down (active count).
  const capText = async () => (await page.locator('[data-testid="agents-cap-meta"]').innerText()).trim();
  const parseUsed = (s: string) => Number(/(\d+)/.exec(s)?.[1] ?? NaN);
  const before = parseUsed(await capText());

  const created = await (
    await page.request.post("/api/agents", { data: { draft: (job!.result as { draft: unknown }).draft } })
  ).json();
  expect(created.ok, `POST /api/agents refused: ${JSON.stringify(created).slice(0, 300)}`).toBe(true);
  await page.reload({ waitUntil: "networkidle" });
  const afterCreate = parseUsed(await capText());
  expect(afterCreate, "creating an agent must raise the used count by exactly 1").toBe(before + 1);

  const del = await page.request.delete(`/api/agents/${created.agent.id}`);
  expect(del.ok(), `DELETE /api/agents/${created.agent.id} -> ${del.status()}`).toBe(true);
  await page.reload({ waitUntil: "networkidle" });
  const afterDelete = parseUsed(await capText());
  expect(afterDelete, "deleting the agent must free its slot (active count)").toBe(before);
  await context.close();
});

test("bug 9 — the logo question is asked before generation", async ({ browser }) => {
  test.setTimeout(60_000);
  const context = await signedInContext(browser);
  const page = await context.newPage();
  await page.goto("/dashboard/website-builder", { waitUntil: "networkidle" });
  // The design controls render inside the create form; open it if the
  // account has sites already (the form shows behind a button then).
  const choice = page.locator('[data-testid="design-logo-choice"]');
  if (!(await choice.isVisible().catch(() => false))) {
    // Best effort: the create form is open by default on an empty account.
    test.skip(true, "Create form not open — open the website form manually to verify, or clear a site.");
  }
  await expect(
    choice,
    "THE REPORTED BUG: no logo question before generation — the deployment predates the fix."
  ).toBeVisible();
  await context.close();
});

test("bug 11 — a Greek file-ask answer keeps its page citations", async ({ browser }) => {
  // THE REPORT: a correct answer with no sources at all. Root cause: the
  // model translates "Page 3" into the reply language and the verifier
  // stripped every translated citation as fabricated. This asks a REAL
  // question (one small model call) in Greek and requires visible sources.
  test.setTimeout(TIMEOUTS.upload + TIMEOUTS.extraction + 180_000);
  const context = await signedInContext(browser);
  const page = await context.newPage();
  await page.goto("/dashboard/files", { waitUntil: "networkidle" });

  const name = `e2e-citations-${Date.now()}.txt`;
  await page.setInputFiles('input[type="file"]', {
    name,
    mimeType: "text/plain",
    buffer: Buffer.from(
      "Company policy handbook.\nVacation: employees receive 24 days of paid leave per year.\nRemote work: allowed up to 3 days per week.\n"
    ),
  });
  const row = page.locator(`[data-testid="files-list"] :text("${name}")`).first();
  await expect(row, "upload never appeared — storage problem, not a citations problem").toBeVisible({
    timeout: TIMEOUTS.upload,
  });

  // Tick the file (the checkbox in its card), ask in GREEK — the language
  // that reproduced the bug — and wait for the answer.
  const card = page.locator(`[data-testid="files-list"] li, [data-testid="files-list"] > div`, { hasText: name }).first();
  await card.locator('input[type="checkbox"]').check({ timeout: 10_000 });
  await page.locator('[data-testid="files-question"]').fill("Πόσες ημέρες άδειας δικαιούμαι τον χρόνο;");
  await page.locator('[data-testid="files-ask-button"]').click();

  const citation = page.locator('[data-testid="files-copy-citation"]').first();
  const uncited = page.locator('[data-testid="files-answer-uncited"]');
  await expect(
    citation,
    "THE REPORTED BUG: the answer rendered without a single verifiable citation. " +
      "If [data-testid=files-answer-uncited] is visible instead, the model answered without citing " +
      "and the deployment predates the tolerant verifier (src/lib/files/ask.ts verifyCitations)."
  ).toBeVisible({ timeout: 150_000 });
  await expect(uncited, "the uncited warning must not show when citations rendered").toHaveCount(0);

  const files = await (await page.request.get("/api/files")).json().catch(() => null);
  const mine = files?.files?.find?.((f: { filename: string }) => f.filename === name);
  if (mine) await page.request.delete(`/api/files/${mine.id}`);
  await context.close();
});

test("bug 10 — TTFB, LCP and INP on the real deployment, measured", async ({ browser }) => {
  test.setTimeout(240_000);
  const context = await signedInContext(browser);
  const page = await context.newPage();
  const rows: { path: string; ttfb: number; lcp: number; inp: number }[] = [];
  // Every route the user moves through, not a sample of two: the report
  // was about how the SITE feels, and an average hides the one page that
  // is slow.
  for (const path of [
    "/login",
    "/dashboard",
    "/dashboard/chat",
    "/dashboard/agents",
    "/dashboard/files",
    "/dashboard/websites",
    "/dashboard/missions",
    "/dashboard/settings",
  ]) {
    await page.goto(path, { waitUntil: "load" });
    const m = await page.evaluate(
      () =>
        new Promise<{ ttfb: number; lcp: number }>((resolve) => {
          const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming;
          let lcp = 0;
          new PerformanceObserver((list) => {
            for (const e of list.getEntries()) lcp = e.startTime;
          }).observe({ type: "largest-contentful-paint", buffered: true } as PerformanceObserverInit);
          setTimeout(() => resolve({ ttfb: nav.responseStart, lcp }), 3000);
        })
    );

    // INP needs a real interaction, so one is made: the worst interaction
    // latency across a handful of clicks on whatever this page offers.
    // Measured with the Event Timing API — processingEnd - startTime is
    // the main-thread half, which is the half a slow page owns (the
    // to-paint half is polluted by the headless compositor's cadence).
    const inp = await page.evaluate(async () => {
      const worst = { value: 0 };
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          const e = entry as PerformanceEventTiming;
          const latency = e.processingEnd - e.startTime;
          if (latency > worst.value) worst.value = latency;
        }
      });
      observer.observe({ type: "event", durationThreshold: 16 } as PerformanceObserverInit);
      const targets = [...document.querySelectorAll("button, a[href], input, textarea")].slice(0, 5);
      for (const target of targets) {
        (target as HTMLElement).dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
        (target as HTMLElement).dispatchEvent(new MouseEvent("pointerup", { bubbles: true }));
        await new Promise((r) => setTimeout(r, 120));
      }
      await new Promise((r) => setTimeout(r, 400));
      observer.disconnect();
      return worst.value;
    });

    rows.push({ path, ttfb: m.ttfb, lcp: m.lcp, inp });
    // Loud budgets, deliberately generous for a serverless cold start —
    // red here means a person feels it, not that a lab metric slipped.
    expect.soft(m.ttfb, `${path} TTFB ${m.ttfb.toFixed(0)}ms > 2500ms`).toBeLessThanOrEqual(2500);
    expect.soft(m.lcp, `${path} LCP ${m.lcp.toFixed(0)}ms > 5000ms`).toBeLessThanOrEqual(5000);
    expect.soft(inp, `${path} INP ${inp.toFixed(0)}ms > 200ms`).toBeLessThanOrEqual(200);
  }
  // Printed as the table the report asked for.
  console.log("      Route                     TTFB      LCP      INP");
  for (const r of rows) {
    console.log(
      `      ${r.path.padEnd(24)} ${`${r.ttfb.toFixed(0)}ms`.padStart(7)} ${`${r.lcp.toFixed(0)}ms`.padStart(8)} ${`${r.inp.toFixed(0)}ms`.padStart(8)}`
    );
  }
  await context.close();
});

test("bug 12 — signup end to end, measured against the 1.5s target", async ({ browser }) => {
  // The stage timings live in the deployment's logs (IONEXA_DIAG=1); what
  // this measures is the thing the person actually waits for: the POST.
  // A fresh address every run, because a duplicate is a 409 in 200ms and
  // would look like a triumph.
  test.setTimeout(120_000);
  const context = await browser.newContext({ baseURL: BASE() });
  const page = await context.newPage();
  const email = `e2e-signup-${Date.now()}@example-ionexa-test.com`;
  const started = Date.now();
  const response = await page.request.post("/api/signup", {
    data: { email, password: `Ae1!${Math.random().toString(36).slice(2)}Zz`, termsAccepted: true },
  });
  const elapsed = Date.now() - started;
  const body = await response.json().catch(() => ({}));
  console.log(`      signup POST: ${elapsed}ms (status ${response.status()})`);
  expect(
    response.ok(),
    `signup failed (${response.status()}): ${JSON.stringify(body).slice(0, 300)}`
  ).toBe(true);
  // The target the report set. Soft, because one cold start is not a
  // regression — but it prints the number every run.
  expect.soft(elapsed, `signup took ${elapsed}ms, target is 1500ms`).toBeLessThanOrEqual(1500);
  await context.close();
});
