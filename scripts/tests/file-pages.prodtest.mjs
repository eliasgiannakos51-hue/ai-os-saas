/*
 * «ΑΝΕΒΑΖΩ PDF 50 ΣΕΛΙΔΩΝ, ΡΩΤΑΩ ΚΑΤΙ, ΚΑΙ Η ΑΠΑΝΤΗΣΗ ΓΡΑΦΕΙ ΣΕ ΠΟΙΑ ΣΕΛΙΔΑ
 * ΤΟ ΒΡΗΚΕ» — IN THE BUILT APP (MASTER 16, package 12).
 *
 * Run: node scripts/tests/file-pages.prodtest.mjs
 *      SKIP_BUILD=1 node scripts/tests/file-pages.prodtest.mjs
 *
 * One production build; the signed-in account is the test account. The
 * switches are rows in the stand-in database's feature_flags, changed
 * between runs, so both screens are walked: the Files shell ("tool-shell"
 * on) and the Files page ("tool-shell" off), each with "file-pages" on,
 * and once with it off.
 *
 * TWO KINDS OF RUN.
 *
 *   * A FINISHED ANSWER (the first runs): a file_ask job handed back by
 *     /api/jobs as it is after a question (page.route), so no model is
 *     called; the page's words come from the real api/files/[id]?page=N
 *     reading a 51-page PDF's stored text, and the PDF link is the real
 *     api/files/[id]/view.
 *   * THE WHOLE WAY (since the package check of 2026-10-08): a 51-page PDF
 *     written by scripts/tests/lib/build-pdf.mjs is chosen with the upload
 *     button, goes into storage and through the real api/files/register and
 *     the real extraction; the question goes through the real
 *     api/files/ask, a real job and the real worker, to the model stand-in
 *     of scripts/tests/lib/fake-anthropic.mjs; the answer's references go
 *     through the real checker. The tables that are written and read back
 *     are scripts/tests/lib/stand-in-tables.mjs, the bucket is a Map here.
 *
 * AND AROUND IT: a new account with no file; out of credits; the provider
 * overloaded (HTTP 529, the API's own error, through the SDK's retries and
 * the worker's); a Free account at its file limit; a scanned PDF with no
 * text; the screens in Greek and English — every page reference in the
 * reader's language («Σελίδα 37», never «Page 37» on a Greek screen), and
 * no English sentence from a route on a Greek one; and the Library's search
 * (switch "library"), which shows a file's words without its page markers.
 *
 * BOTH DEVICES: 1440x900 with a mouse, 390x844 with touch.
 */
import http from "node:http";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { chromium } from "playwright";
import { startMockSupabase, MOCK_USER } from "../lib/mock-supabase.mjs";
import { statefulTables } from "./lib/stand-in-tables.mjs";
import { startFakeAnthropic, textMessage, OVERLOADED } from "./lib/fake-anthropic.mjs";
import { englishRuns, englishIn } from "./lib/english-on-greek.mjs";
import { buildPdf } from "./lib/build-pdf.mjs";

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

const FID = "f1111111-1111-4111-8111-111111111111";
const NAME = "Symvasi-51-selides.pdf";
// What extraction stores for a 51-page PDF: the first 50 pages, each
// behind its marker (lib/files/extract.ts, MAX_PDF_PAGES).
const PAGE_TEXT = (n) => (n === 37 ? "Το συνολικό μίσθωμα ορίζεται σε 4.820 ευρώ τον μήνα." : n === 12 ? "" : `Κείμενο της σελίδας ${n}.`);
const STORED = Array.from({ length: 50 }, (_, i) => `[[PAGE ${i + 1}|Page ${i + 1}]]\n${PAGE_TEXT(i + 1)}`).join("\n\n");
const FILE = {
  id: FID, user_id: MOCK_USER.id, filename: NAME, file_type: "pdf", size_bytes: 1_204_998, page_count: 51,
  char_count: STORED.length, processing_status: "ready", error: null, uploaded_at: "2026-10-07T09:00:00Z",
  storage_path: `${MOCK_USER.id}/${FID}.pdf`, extracted_text: STORED,
};
const C37 = { filename: NAME, label: "Page 37", fileId: FID, page: 37 };
const C12 = { filename: NAME, label: "Page 12", fileId: FID, page: 12 };
const C51 = { filename: NAME, label: "Page 51", fileId: FID, page: 51 };
const JOB = {
  id: "a1111111-1111-4111-8111-111111111111", status: "done", stepLabel: null, creditsCharged: 12,
  input: { question: "Πόσο είναι το μίσθωμα;", fileIds: [FID] },
  result: {
    answered: true, answeredFromDocuments: true,
    answer: `Το μίσθωμα είναι 4.820 ευρώ [${NAME}, Page 37], χωρίς πίνακα [${NAME}, Page 12]. Ξανά [${NAME}, Page 37]. Και [${NAME}, Page 51].`,
    citations: [C37, C12, C37, C51], removedCitations: 0, skippedFiles: [], truncated: false, parts: 1,
    unreadPages: [{ filename: NAME, read: 50, total: 51 }], disclosure: "",
  },
};

// THE UPLOADED ONE: a real 51-page PDF, its rent on page 37 (ASCII, as
// build-pdf writes one Helvetica line per page).
const UP = "Mistho-51.pdf";
const UP_PDF = buildPdf(Array.from({ length: 51 }, (_, i) => (i + 1 === 37 ? "The total rent is 4820 euros per month." : `Text of page ${i + 1}.`)));
const SCAN = "Scan.pdf";
const SCAN_PDF = buildPdf(["", "", ""]);
// The model's answer cites the page in GREEK, as a model answering a Greek
// question may; the checker (lib/files/ask.ts) resolves it to the stored page.
const ANSWER_TEXT = `Το μίσθωμα είναι 4.820 ευρώ τον μήνα [${UP}, Σελίδα 37].`;

const store = { user_files: [], file_collections: [], file_collection_items: [], ai_jobs: [], user_credits: [], feature_flags: [] };
const tables = statefulTables(store, {
  defaults: {
    ai_jobs: { running: false, attempts: 0, cancel_requested_at: null, consumed_at: null, result: null, error: null, credits_charged: null, usage_entries: [], timeline: [], started_at: null, finished_at: null },
    user_files: { error: null },
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
// THE BUCKET: what the browser uploads (supabase-js sends a File as a
// multipart form) is kept by path, and handed back to the server's download.
const bucket = new Map();
// A run that needs storage to refuse a delete sets this.
let storageRefusesDelete = false;
function filePart(body, contentType) {
  const m = /boundary=(?:"([^"]+)"|([^;]+))/.exec(contentType ?? "");
  if (!m) return body;
  for (const part of body.split(`--${m[1] ?? m[2]}`)) {
    const at = part.indexOf("\r\n\r\n");
    if (at >= 0 && /filename=/.test(part.slice(0, at))) return part.slice(at + 4).replace(/\r\n$/, "");
  }
  return body;
}
function storage({ req, res, url, body, json }) {
  const m = /^\/storage\/v1\/object\/(?:authenticated\/)?user-files\/(.+)$/.exec(url.pathname);
  if (req.method === "DELETE" && url.pathname === "/storage/v1/object/user-files") {
    if (storageRefusesDelete) return json(500, { statusCode: "500", error: "internal", message: "storage unavailable" }), true;
    let prefixes = [];
    try { prefixes = JSON.parse(body || "{}").prefixes ?? []; } catch {}
    for (const p of prefixes) bucket.delete(p);
    return json(200, prefixes.map((name) => ({ name }))), true;
  }
  if (!m || url.pathname.includes("/object/sign/")) return false;
  const path = decodeURIComponent(m[1]);
  if (req.method === "POST" || req.method === "PUT") {
    bucket.set(path, filePart(body, req.headers["content-type"]));
    return json(200, { Key: `user-files/${path}`, Id: path }), true;
  }
  if (req.method === "GET") {
    if (!bucket.has(path)) return json(404, { statusCode: "404", error: "not_found", message: "Object not found" }), true;
    res.writeHead(200, { "Content-Type": "application/pdf" });
    res.end(Buffer.from(bucket.get(path), "latin1"));
    return true;
  }
  return false;
}
// supabase-js's admin.getUserById, which the worker asks for billing.
function admin({ url, json }) {
  if (url.pathname.startsWith("/auth/v1/admin/users/")) return json(200, MOCK_USER), true;
  return false;
}
const supa = await startMockSupabase({ port: 54372, handle: (ctx) => admin(ctx) || storage(ctx) || tables(ctx) });
const model = await startFakeAnthropic(54474, () => textMessage(ANSWER_TEXT));

function setAccount(run) {
  store.feature_flags.splice(0, Infinity, ...Object.entries(run.flags ?? {}).map(([key, audience]) => ({ key, audience })));
  store.user_files.splice(0, Infinity, ...(run.files ?? []).map((f) => structuredClone(f)));
  store.ai_jobs.splice(0, Infinity);
  store.user_credits.splice(0, Infinity, { user_id: MOCK_USER.id, credits_remaining: run.credits ?? 3000, credits_total: 3000 });
  MOCK_USER.user_metadata = { subscription_tier: run.tier ?? "growth" };
  model.setAnswer(run.model === "overloaded" ? () => OVERLOADED : () => textMessage(ANSWER_TEXT));
  model.calls.splice(0, Infinity);
  tables.rpcCalls.splice(0, Infinity);
  tables.writes.splice(0, Infinity);
  bucket.clear();
  storageRefusesDelete = Boolean(run.storageRefusesDelete);
}

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

const messages = (locale) => JSON.parse(readFileSync(`messages/${locale}.json`, "utf8")).dashboard.files;
const M = { el: messages("el"), en: messages("en") };
const el = M.el;
const W = el.pageRefs;
const fill = (s, vars) => String(s ?? "<no such words>").replace(/\{(\w+)\}/g, (_, k) => String(vars[k]));
// The English a Greek Files screen must never show: the en.json words of the
// namespaces it draws, and the sentences the Files routes write in English.
const RUNS_EN = englishRuns(["dashboard.files", "dashboard.toolShell", "aiSteps.file_ask"]);
const ROUTE_ENGLISH = [
  "Not enough credits for this question.",
  "Too many questions in the last hour",
  "Your plan includes",
  "of storage (",
  "Too many uploads in the last hour",
  "this PDF has no text layer",
  "overloaded_error",
  "The question could not be answered",
  "The file could not be deleted.",
  // The browser's own words for a request that never left it.
  "Failed to fetch",
];
// «Page 37» on a Greek screen: the label as it is stored.
const ENGLISH_LABEL = /\b(?:Page|Rows) \d+/;

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
const SHELL = { "tool-shell": "staff", "file-pages": "staff" };
const PAGE = { "tool-shell": "off", "file-pages": "staff" };
const FREE_FILES = [1, 2, 3].map((n) => ({ ...FILE, id: `f${n}111111-1111-4111-8111-11111111111${n}`, filename: `Arxeio-${n}.pdf`, size_bytes: 1000 }));

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
    // So a job can start itself (lib/jobs/run-job.ts, kickJob), as in production.
    CRON_SECRET: "test-cron-secret-for-internal-handoff",
  });
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium" });

  async function open(run) {
    const { device } = run;
    setAccount(run);
    const context = await browser.newContext({ viewport: device.viewport, hasTouch: device.touch, isMobile: device.touch });
    await context.addCookies(
      [
        { ...supa.authCookie, url: ON, httpOnly: false, secure: false, sameSite: "Lax" },
        { name: "NEXT_LOCALE", value: run.locale ?? "el", url: ON },
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
    return { context, page, press };
  }
  // A Greek screen: no English sentence and no English page label on it.
  async function greekOnly(page, where) {
    const text = await page.locator("body").innerText();
    const found = englishIn(text, RUNS_EN, ROUTE_ENGLISH);
    const label = text.match(ENGLISH_LABEL)?.[0];
    check(`${where}: Greek, with no English sentence or label on it`, found.length === 0 && !label && (await page.evaluate(() => document.documentElement.lang)) === "el", [...found.slice(0, 4), label].filter(Boolean).join(" | "));
  }
  const settle = (page, ms = 400) => page.waitForTimeout(ms);

  // =====================================================================
  // A FINISHED ANSWER, on both screens and devices
  // =====================================================================
  const RUNS = [
    { screen: "shell", flags: SHELL, device: DESKTOP },
    { screen: "shell", flags: SHELL, device: PHONE },
    { screen: "page", flags: PAGE, device: DESKTOP },
    { screen: "page", flags: PAGE, device: PHONE },
    { screen: "shell, in English", flags: SHELL, device: DESKTOP, locale: "en" },
    { screen: "page, in English", flags: PAGE, device: PHONE, locale: "en" },
    { screen: "shell, switch off", flags: { "tool-shell": "staff", "file-pages": "off" }, device: PHONE },
  ];

  for (const run of RUNS) {
    const { device } = run;
    const locale = run.locale ?? "el";
    const L = M[locale];
    const R = L.pageRefs;
    console.log(`\n== ${run.screen}, ${device.label} ${device.viewport.width}x${device.viewport.height} ==`);
    const { context, page, press } = await open({ ...run, files: [FILE] });

    await page.route("**/api/jobs?kind=file_ask", (r) => r.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true, job: JOB }) }));
    await page.route("**/api/jobs/*/consume", (r) => r.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true }) }));
    const pageReads = [];
    page.on("request", (req) => { if (/\/api\/files\/[^/]+\?page=/.test(req.url())) pageReads.push(new URL(req.url()).search); });

    await page.goto(`${ON}/dashboard/files`, { waitUntil: "networkidle" });
    const answer = page.locator('[data-testid="files-answer"], [data-testid="files-answer-text"]').first();
    await answer.waitFor({ timeout: 10000 }).catch(() => null);
    const text = await page.locator("main").innerText();
    check("the answer is on the screen", text.includes("Το μίσθωμα είναι 4.820 ευρώ"), text.slice(0, 300));
    if (run.flags["file-pages"] !== "off") check("...saying which pages of the PDF it never read", (await page.locator('[data-testid="files-unread"]').count()) >= 1 && text.includes(fill(R.unread, { name: NAME, read: 50, total: 51 })));

    if (run.flags["file-pages"] === "off") {
      check("with the switch off, no reference is a button", (await page.locator('[data-testid="files-cite"], [data-testid="files-page"]').count()) === 0);
      // The words are the reader's even with the switch off: the label is
      // a display, and the switch is about pressing it.
      check("...the answer reads as before, its list as text, each page in the reader's language", text.includes(`[${NAME}, ${fill(R.page, { n: 37 })}]`) && text.includes(`${NAME} — ${fill(R.page, { n: 37 })}`), text.slice(0, 400));
      check("...and nothing new speaks of pages", !text.includes(fill(L.pagesPartRead, { read: 50, total: 51 })) && !text.includes(fill(R.unread, { name: NAME, read: 50, total: 51 })));
      await greekOnly(page, "the answer, switch off");
      check(`no page threw (${pageErrors.length})`, pageErrors.length === 0, pageErrors.slice(0, 3).join(" | "));
      await context.close();
      continue;
    }

    // ---- the answer, cut
    const cites = page.locator('[data-testid="files-cite"]');
    check(`every reference in the answer is pressable, where it stands (4), in the reader's language («${fill(R.page, { n: 37 })}»)`, (await cites.count()) === 4 && (await cites.nth(0).innerText()) === fill(R.page, { n: 37 }), await cites.nth(0).innerText().catch(() => ""));
    check("...the brackets are gone from the text", !(await page.locator('[data-testid="files-answer-text"]').innerText()).includes(`[${NAME}`));
    const listed = page.locator('[data-testid="files-page"]');
    check("each page is listed once under it (37, 12, 51)", (await listed.count()) === 3);
    check("...each named in the reader's language", (await listed.nth(0).innerText()).includes(fill(R.page, { n: 37 })) && (await listed.nth(2).innerText()).includes(fill(R.page, { n: 51 })), await listed.nth(0).innerText().catch(() => ""));
    check("...and told to a screen reader the same way", ((await cites.nth(0).getAttribute("aria-label")) ?? "").includes(fill(R.page, { n: 37 })), await cites.nth(0).getAttribute("aria-label").catch(() => ""));
    const lbox = await listed.first().boundingBox();
    check("...a 44px target", lbox && lbox.height >= 44, JSON.stringify(lbox));
    if (run.screen === "page" || device.label === "desktop") {
      check("the file says it is read only in part", text.includes(fill(L.pagesPartRead, { read: 50, total: 51 })));
    }

    // ---- page 37: its own words, from the file
    await press(cites.nth(0));
    const view = page.locator('[data-testid="files-page-view"]');
    await page.locator('[data-testid="files-page-text"]').waitFor({ timeout: 10000 }).catch(() => null);
    check("pressing it opens that page, named in the reader's language", (await view.count()) === 1 && (await view.innerText()).includes(`${NAME} — ${fill(R.page, { n: 37 })}`), await view.innerText().catch(() => ""));
    check("...with its own words, read from the file", (await page.locator('[data-testid="files-page-text"]').innerText().catch(() => "")) === PAGE_TEXT(37));
    check("...asked for that page alone", pageReads.at(-1) === "?page=37", JSON.stringify(pageReads));
    const pdf = page.locator('[data-testid="files-page-pdf"]');
    check("...and the PDF opens at that page, in a new tab", (await pdf.getAttribute("href")) === `/api/files/${FID}/view?page=37` && (await pdf.getAttribute("target")) === "_blank" && (await pdf.getAttribute("rel")) === "noopener noreferrer");
    const viewed = await page.request.get(`${ON}/api/files/${FID}/view?page=37`, { maxRedirects: 0 });
    // The redirect's own Referrer-Policy is the app's: next.config.mjs
    // overrides one a route sets (measured here, 2026-10-07), and it names
    // only this origin to storage, never an address.
    check("...which is a redirect to the file itself, at #page=37, never cached, naming only our origin",
      viewed.status() === 302 && /#page=37$/.test(viewed.headers().location ?? "") && viewed.headers()["cache-control"] === "no-store" && viewed.headers()["referrer-policy"] === "strict-origin-when-cross-origin",
      `${viewed.status()} ${viewed.headers().location} cache-control=${viewed.headers()["cache-control"]} referrer-policy=${viewed.headers()["referrer-policy"]}`);

    // ---- page 12: empty; page 51: not there; a page that did not open
    await press(listed.nth(1));
    await page.waitForFunction((w) => document.querySelector('[data-testid="files-page-view"]')?.textContent?.includes(w), R.empty, { timeout: 10000 }).catch(() => null);
    check("a page with no words says so", (await view.innerText()).includes(R.empty) && (await view.innerText()).includes(fill(R.page, { n: 12 })));
    await press(listed.nth(2));
    await page.waitForFunction((w) => document.querySelector('[data-testid="files-page-view"]')?.textContent?.includes(w), R.missing, { timeout: 10000 }).catch(() => null);
    check("a page that is not in the file says so", (await view.locator('[role="alert"]').innerText().catch(() => "")) === R.missing);
    await page.route("**/api/files/*?page=*", (r) => r.abort("internetdisconnected"));
    await press(cites.nth(1));
    await page.waitForFunction((w) => document.querySelector('[data-testid="files-page-view"]')?.textContent?.includes(w), R.failed, { timeout: 10000 }).catch(() => null);
    check("offline, the page says it did not open", (await view.locator('[role="alert"]').innerText().catch(() => "")) === R.failed);
    await page.unroute("**/api/files/*?page=*");

    if (locale === "el") await greekOnly(page, "the answer and its pages");
    else check("the English detector is not blind: it finds this English screen's words", englishIn(await page.locator("body").innerText(), RUNS_EN).length > 0);

    await press(page.locator('[data-testid="files-page-close"]'));
    check("...and it closes", (await view.count()) === 0);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    check("the page does not scroll sideways", overflow <= 1, `${overflow}px`);
    check(`no page threw (${pageErrors.length})`, pageErrors.length === 0, pageErrors.slice(0, 3).join(" | "));
    await context.close();
  }

  // =====================================================================
  // THE WHOLE WAY: upload, ask, and what can go wrong on the way
  // =====================================================================
  const shellField = (page) => page.locator("main textarea");
  async function shellAsk(page, press, question) {
    await shellField(page).fill(question);
    await press(page.locator("main form button[type=submit]"));
  }
  async function shellUpload(page, press, name, bytes) {
    const chooser = page.waitForEvent("filechooser", { timeout: 10000 });
    await press(page.locator('[data-testid="files-shell-upload"]'));
    await (await chooser).setFiles({ name, mimeType: "application/pdf", buffer: bytes });
  }
  const lastTool = async (page) => (await page.locator('[data-testid="tool-shell-thread"]').innerText()).trim();
  // On a phone the shell's work pane covers the conversation: back to it.
  async function toConversation(page, press) {
    const back = page.locator('[data-testid="tool-shell-back"]');
    if (await back.isVisible().catch(() => false)) await press(back);
  }
  // WHAT IS SAID, caught the moment it appears: the page says it in a toast,
  // which is gone a few seconds later. Every toast and the shell's thread are
  // read every 100ms until one says the expected sentence, or English, or
  // the time is up; the text read then is the evidence.
  async function sayingOf(page, want, ms, greek = true) {
    const seen = new Set();
    for (let i = 0; i < ms / 100; i++) {
      const parts = await page.evaluate(() => [...document.querySelectorAll('[role="status"], [data-testid="tool-shell-thread"], main')].map((e) => e.innerText));
      for (const part of parts) seen.add(part);
      const all = [...seen].join("\n");
      if (all.includes(String(want)) || (greek && (englishIn(all, RUNS_EN, ROUTE_ENGLISH).length > 0 || ENGLISH_LABEL.test(all)))) return all;
      await page.waitForTimeout(100);
    }
    return [...seen].join("\n");
  }
  const until = async (page, fn, ms = 60000) => {
    for (let i = 0; i < ms / 250; i++) {
      if (await fn()) return true;
      await page.waitForTimeout(250);
    }
    return false;
  };

  const WHOLE = [
    { name: "upload a 51-page PDF and ask — the shell", flags: SHELL, device: DESKTOP },
    { name: "upload a 51-page PDF and ask — the shell", flags: SHELL, device: PHONE },
    { name: "upload a 51-page PDF and ask — the page", flags: PAGE, device: DESKTOP },
  ];
  for (const run of WHOLE) {
    const { device } = run;
    console.log(`\n== ${run.name}, ${device.label} ${device.viewport.width}x${device.viewport.height} ==`);
    const { context, page, press } = await open(run);
    await page.goto(`${ON}/dashboard/files`, { waitUntil: "networkidle" });
    const shell = run.flags === SHELL;
    if (shell) await shellUpload(page, press, UP, UP_PDF);
    else {
      const chooser = page.waitForEvent("filechooser", { timeout: 10000 });
      await press(page.locator('[data-testid="files-upload-button"]'));
      await (await chooser).setFiles({ name: UP, mimeType: "application/pdf", buffer: UP_PDF });
    }
    await until(page, async () => store.user_files.length === 1 && (await page.locator("body").innerText()).includes(fill(el.uploadSuccess, { name: UP })), 20000);
    const row = store.user_files[0];
    check("the PDF went into storage and through the real extraction: 51 pages, the first 50 read", row?.processing_status === "ready" && row?.page_count === 51 && (row?.extracted_text.match(/\[\[PAGE \d+\|/g) ?? []).length === 50 && row?.extracted_text.includes("The total rent is 4820 euros per month."), JSON.stringify({ status: row?.processing_status, pages: row?.page_count, error: row?.error }));
    check("...and the screen says it was uploaded", (await page.locator("body").innerText()).includes(fill(el.uploadSuccess, { name: UP })));
    if (shell && device.label === "desktop") check("...its line says 50 of its 51 pages are read", (await page.locator('[data-testid="files-shell-list"]').innerText()).includes(fill(el.pagesPartRead, { read: 50, total: 51 })));

    // ---- ask
    if (shell) {
      await shellAsk(page, press, "Πόσο είναι το μίσθωμα;");
    } else {
      await press(page.locator("main label:has(input[type=checkbox]:not([disabled]))").first());
      await page.locator('[data-testid="files-question"]').fill("Πόσο είναι το μίσθωμα;");
      await press(page.locator('[data-testid="files-ask-button"]'));
    }
    const cites = page.locator('[data-testid="files-cite"]');
    await until(page, async () => (await cites.count()) > 0, 60000);
    const asked = model.calls[0]?.body;
    check("the model was asked once, with page 37 marked and its words", model.calls.length === 1 && JSON.stringify(asked?.messages ?? "").includes(`--- FILE: ${UP} | Page 37 ---`) && JSON.stringify(asked?.messages ?? "").includes("The total rent is 4820 euros per month."), `calls=${model.calls.length}`);
    check("the answer comes back through the real job, its reference pressable and named in Greek", (await cites.count()) === 1 && (await cites.first().innerText()) === fill(W.page, { n: 37 }), await cites.first().innerText().catch(() => ""));
    check("...the model's own words checked: the Greek label it wrote is page 37 of the file", store.ai_jobs[0]?.result?.citations?.[0]?.page === 37 && store.ai_jobs[0]?.result?.citations?.[0]?.label === "Page 37", JSON.stringify(store.ai_jobs[0]?.result?.citations));
    check("...and it says which pages were never read", (await page.locator('[data-testid="files-unread"]').innerText().catch(() => "")).includes(fill(W.unread, { name: UP, read: 50, total: 51 })));
    check("...the credits held, then settled", tables.rpcCalls.map((c) => c.name).filter((n) => n === "reserve_credits" || n === "settle_reservation" || n === "release_reservation").join(",") === "reserve_credits,settle_reservation", tables.rpcCalls.map((c) => c.name).join(","));
    await press(cites.first());
    await page.locator('[data-testid="files-page-text"]').waitFor({ timeout: 10000 }).catch(() => null);
    check("pressing it opens page 37 of the uploaded PDF, with its words", (await page.locator('[data-testid="files-page-text"]').innerText().catch(() => "")) === "The total rent is 4820 euros per month." && (await page.locator('[data-testid="files-page-view"]').innerText()).includes(`${UP} — ${fill(W.page, { n: 37 })}`));
    await greekOnly(page, "the uploaded file's answer");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    check("the page does not scroll sideways", overflow <= 1, `${overflow}px`);
    check(`no page threw (${pageErrors.length})`, pageErrors.length === 0, pageErrors.slice(0, 3).join(" | "));
    await context.close();
  }

  // ---- a new account, nothing yet
  for (const run of [{ flags: SHELL, device: PHONE }, { flags: PAGE, device: DESKTOP }]) {
    const { device } = run;
    console.log(`\n== a new account, nothing yet — ${run.flags === SHELL ? "the shell" : "the page"}, ${device.label} ==`);
    const { context, page, press } = await open(run);
    await page.goto(`${ON}/dashboard/files`, { waitUntil: "networkidle" });
    if (run.flags === SHELL) {
      await press(page.locator('[data-testid="files-shell-files"]'));
      await settle(page);
      check("empty: the files say there are none yet", (await page.locator("main").innerText()).includes(el.empty));
      await toConversation(page, press);
      await shellAsk(page, press, "Τι λέει το συμβόλαιο;");
      await until(page, async () => (await lastTool(page)).includes(el.selectFirst), 5000);
      check("...a question with nothing chosen says to choose a file first, and nothing is asked", (await lastTool(page)).includes(el.selectFirst) && model.calls.length === 0 && store.ai_jobs.length === 0);
    } else {
      check("empty: the page says there are no files yet, with a way to upload", (await page.locator('[data-testid="files-empty"]').count()) === 1 && (await page.locator("main").innerText()).includes(el.emptyTitle));
    }
    await greekOnly(page, "the empty Files screen");
    check(`no page threw (${pageErrors.length})`, pageErrors.length === 0, pageErrors.slice(0, 3).join(" | "));
    await context.close();
  }

  // ---- out of credits; the provider overloaded
  for (const run of [
    { name: "out of credits — the shell", flags: SHELL, device: PHONE, credits: 0, files: [FILE], expect: "askNoCredits" },
    { name: "out of credits — the page", flags: PAGE, device: DESKTOP, credits: 0, files: [FILE], expect: "askNoCredits" },
    { name: "the provider overloaded — the shell", flags: SHELL, device: DESKTOP, model: "overloaded", files: [FILE], expect: "askFailed" },
    { name: "the provider overloaded — the page", flags: PAGE, device: PHONE, model: "overloaded", files: [FILE], expect: "askFailed" },
    { name: "the provider overloaded — the shell, in English", flags: SHELL, device: PHONE, model: "overloaded", files: [FILE], expect: "askFailed", locale: "en" },
  ]) {
    const { device } = run;
    const L = M[run.locale ?? "el"];
    console.log(`\n== ${run.name}, ${device.label} ${device.viewport.width}x${device.viewport.height} ==`);
    const { context, page, press } = await open(run);
    await page.goto(`${ON}/dashboard/files${run.flags === SHELL ? `?record=${FID}` : ""}`, { waitUntil: "networkidle" });
    if (run.flags === SHELL) {
      await toConversation(page, press);
      await shellAsk(page, press, "Πόσο είναι το μίσθωμα;");
      check("...the question is asked (it is in the conversation)", await until(page, async () => (await lastTool(page)).includes("Πόσο είναι το μίσθωμα;"), 5000));
    } else {
      await press(page.locator("main label:has(input[type=checkbox]:not([disabled]))").first());
      await page.locator('[data-testid="files-question"]').fill("Πόσο είναι το μίσθωμα;");
      await press(page.locator('[data-testid="files-ask-button"]'));
    }
    const want = L[run.expect];
    const body = await sayingOf(page, want, run.model ? 90000 : 15000, (run.locale ?? "el") === "el");
    check(`it is said in the reader's language: «${want}»`, body.includes(String(want)), body.slice(-600));
    if (run.expect === "askNoCredits") {
      check("...the model never asked, and no job made", model.calls.length === 0 && store.ai_jobs.length === 0, `calls=${model.calls.length} jobs=${store.ai_jobs.length}`);
    } else {
      check("...after the model was really asked, the SDK's and the worker's retries included", model.calls.length >= 2 && store.ai_jobs[0]?.status === "failed", `calls=${model.calls.length} job=${store.ai_jobs[0]?.status}`);
      check("...nothing charged: the hold given back, never settled", tables.rpcCalls.some((c) => c.name === "release_reservation") && !tables.rpcCalls.some((c) => c.name === "settle_reservation"), tables.rpcCalls.map((c) => c.name).join(","));
      check("...and the provider's own words are never shown", !body.includes("overloaded_error") && !body.includes("529"));
    }
    if ((run.locale ?? "el") === "el") {
      const found = englishIn(body, RUNS_EN, ROUTE_ENGLISH);
      check("...in Greek, with no English sentence on it", found.length === 0, found.join(" | "));
      await greekOnly(page, "the screen after it");
    }
    check(`no page threw (${pageErrors.length})`, pageErrors.length === 0, pageErrors.slice(0, 3).join(" | "));
    await context.close();
  }

  // ---- offline: the question never reaches the server; a delete the server refuses
  for (const run of [
    { name: "offline, the question — the shell", flags: SHELL, device: DESKTOP, files: [FILE], offline: true, expect: "askError" },
    { name: "offline, the question — the page", flags: PAGE, device: PHONE, files: [FILE], offline: true, expect: "askError" },
    { name: "a delete the server refuses — the shell", flags: SHELL, device: DESKTOP, files: [FILE], storageRefusesDelete: true, expect: "deleteError" },
    { name: "a delete the server refuses — the page", flags: PAGE, device: PHONE, files: [FILE], storageRefusesDelete: true, expect: "deleteError" },
  ]) {
    const { device } = run;
    console.log(`\n== ${run.name}, ${device.label} ${device.viewport.width}x${device.viewport.height} ==`);
    const { context, page, press } = await open(run);
    page.on("dialog", (d) => void d.accept());
    if (run.offline) await page.route("**/api/files/ask", (r) => r.abort("internetdisconnected"));
    await page.goto(`${ON}/dashboard/files${run.flags === SHELL ? `?record=${FID}` : ""}`, { waitUntil: "networkidle" });
    if (run.offline) {
      if (run.flags === SHELL) {
        await toConversation(page, press);
        await shellAsk(page, press, "Πόσο είναι το μίσθωμα;");
      } else {
        await press(page.locator("main label:has(input[type=checkbox]:not([disabled]))").first());
        await page.locator('[data-testid="files-question"]').fill("Πόσο είναι το μίσθωμα;");
        await press(page.locator('[data-testid="files-ask-button"]'));
      }
    } else if (run.flags === SHELL) {
      await press(page.locator(`[data-testid="files-shell-list"] button[aria-label="${el.delete}"]`).first());
    } else {
      await press(page.locator('main button[aria-haspopup="menu"]').first());
      await press(page.locator(`[role="menuitem"]:has-text("${el.delete}")`).first());
    }
    const body = await sayingOf(page, el[run.expect], 15000);
    check(`it is said in Greek: «${el[run.expect]}»`, body.includes(el[run.expect]), body.slice(-500));
    const found = englishIn(body, RUNS_EN, ROUTE_ENGLISH);
    check("...with no English sentence on it", found.length === 0, found.join(" | "));
    if (run.storageRefusesDelete) check("...and the file is still there", store.user_files.length === 1);
    check(`no page threw (${pageErrors.length})`, pageErrors.length === 0, pageErrors.slice(0, 3).join(" | "));
    await context.close();
  }

  // ---- a Free account at its file limit; a scanned PDF
  for (const run of [
    { name: "a Free account at its 3 files — the shell", flags: SHELL, device: PHONE, tier: "free", files: FREE_FILES, upload: [UP, UP_PDF], expect: "uploadFileCap" },
    { name: "a Free account at its 3 files — the page", flags: PAGE, device: DESKTOP, tier: "free", files: FREE_FILES, upload: [UP, UP_PDF], expect: "uploadFileCap" },
    { name: "a scanned PDF, no text in it — the shell", flags: SHELL, device: DESKTOP, upload: [SCAN, SCAN_PDF], expect: "scan" },
    { name: "a scanned PDF, no text in it — the page", flags: PAGE, device: PHONE, upload: [SCAN, SCAN_PDF], expect: "scan" },
  ]) {
    const { device } = run;
    console.log(`\n== ${run.name}, ${device.label} ${device.viewport.width}x${device.viewport.height} ==`);
    const { context, page, press } = await open(run);
    await page.goto(`${ON}/dashboard/files`, { waitUntil: "networkidle" });
    if (run.flags === SHELL) await shellUpload(page, press, ...run.upload);
    else {
      const chooser = page.waitForEvent("filechooser", { timeout: 10000 });
      await press(page.locator('[data-testid="files-upload-button"]'));
      await (await chooser).setFiles({ name: run.upload[0], mimeType: "application/pdf", buffer: run.upload[1] });
    }
    const want = run.expect === "scan" ? el.unreadable?.scan : el[run.expect];
    const body = await sayingOf(page, want, 15000);
    check(`it is said in Greek: «${want}»`, body.includes(String(want)), body.slice(-500));
    const found = englishIn(body, RUNS_EN, ROUTE_ENGLISH);
    check("...with no English sentence on it", found.length === 0, found.join(" | "));
    if (run.expect === "uploadFileCap") check("...nothing stored: no new row, and the upload taken back out of the bucket", store.user_files.length === 3 && bucket.size === 0, `rows=${store.user_files.length} objects=${bucket.size}`);
    else check("...the file is kept and marked unreadable, as it was", store.user_files.length === 1 && store.user_files[0].processing_status === "failed");
    await greekOnly(page, "the screen after it");
    check(`no page threw (${pageErrors.length})`, pageErrors.length === 0, pageErrors.slice(0, 3).join(" | "));
    await context.close();
  }

  // ---- the Library (package 5), the other place a file's stored text is
  // shown: a search in what a file says shows the sentence it was found
  // in — its words, never the page markers it is stored with
  // («[[PAGE 37|Page 37]]», lib/files/extract.ts).
  for (const run of [
    { name: "the Library, a search in what a file says", flags: { ...SHELL, library: "staff" }, device: PHONE, files: [FILE] },
    { name: "the Library, a search in what a file says", flags: { ...SHELL, library: "staff" }, device: DESKTOP, files: [FILE] },
  ]) {
    const { device } = run;
    console.log(`\n== ${run.name}, ${device.label} ${device.viewport.width}x${device.viewport.height} ==`);
    const { context, page, press } = await open(run);
    await page.goto(`${ON}/dashboard/timeline`, { waitUntil: "networkidle" });
    const search = page.locator('[data-testid="library-search"]');
    await press(search);
    await search.fill("μισθωμα");
    await press(page.locator('form[role="search"] button[type="submit"]'));
    await page.waitForURL(/[?&]q=/, { timeout: 15000 }).catch(() => null);
    await page.waitForLoadState("networkidle");
    const found = page.locator('[data-testid="library-item"][data-kind="file"]');
    const said = (await found.first().innerText().catch(() => "")).trim();
    check("the file is found by what it says, without its accent, with the sentence it was found in", (await found.count()) === 1 && said.includes("4.820 ευρώ"), said);
    check("...with no page marker and no English page label in it", !/\[\[PAGE|\bPage \d/.test(said), said);
    await greekOnly(page, "the Library");
    await press(found.first());
    await page.waitForURL(/\/dashboard\/files\?record=/, { timeout: 15000 }).catch(() => null);
    check("...and pressing it opens that file in Files", new URL(page.url()).searchParams.get("record") === FID, page.url());
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
