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
 * The answer is a finished file_ask job, handed back by /api/jobs as it is
 * after a question (page.route), so no model is called and nothing is
 * charged. EVERYTHING ELSE IS THE APP'S OWN: the page's words come from
 * the real api/files/[id]?page=N reading a 51-page PDF's stored text, and
 * the PDF link is the real api/files/[id]/view.
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

MOCK_USER.user_metadata = { subscription_tier: "growth" };
const flags = [];
const supa = await startMockSupabase({
  port: 54372,
  tableRows: {
    user_credits: [{ user_id: MOCK_USER.id, credits_remaining: 3000, credits_total: 3000 }],
    user_files: [FILE],
    file_collections: [],
    file_collection_items: [],
    feature_flags: flags,
  },
});
function setFlags(audiences) {
  flags.splice(0, flags.length, ...Object.entries(audiences).map(([key, audience]) => ({ key, audience })));
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

const el = JSON.parse(readFileSync("messages/el.json", "utf8")).dashboard.files;
const W = el.pageRefs;
const fill = (s, vars) => s.replace(/\{(\w+)\}/g, (_, k) => String(vars[k]));

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

  const RUNS = [
    { screen: "shell", flags: { "tool-shell": "staff", "file-pages": "staff" }, device: { label: "desktop", viewport: { width: 1440, height: 900 }, touch: false } },
    { screen: "shell", flags: { "tool-shell": "staff", "file-pages": "staff" }, device: { label: "phone", viewport: { width: 390, height: 844 }, touch: true } },
    { screen: "page", flags: { "tool-shell": "off", "file-pages": "staff" }, device: { label: "desktop", viewport: { width: 1440, height: 900 }, touch: false } },
    { screen: "page", flags: { "tool-shell": "off", "file-pages": "staff" }, device: { label: "phone", viewport: { width: 390, height: 844 }, touch: true } },
    { screen: "shell, switch off", flags: { "tool-shell": "staff", "file-pages": "off" }, device: { label: "phone", viewport: { width: 390, height: 844 }, touch: true } },
  ];

  for (const run of RUNS) {
    const { device } = run;
    console.log(`\n== ${run.screen}, ${device.label} ${device.viewport.width}x${device.viewport.height} ==`);
    setFlags(run.flags);
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

    await page.route("**/api/jobs?kind=file_ask", (r) => r.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true, job: JOB }) }));
    await page.route("**/api/jobs/*/consume", (r) => r.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true }) }));
    const pageReads = [];
    page.on("request", (req) => { if (/\/api\/files\/[^/]+\?page=/.test(req.url())) pageReads.push(new URL(req.url()).search); });

    await page.goto(`${ON}/dashboard/files`, { waitUntil: "networkidle" });
    const answer = page.locator('[data-testid="files-answer"], [data-testid="files-answer-text"]').first();
    await answer.waitFor({ timeout: 10000 }).catch(() => null);
    const text = await page.locator("main").innerText();
    check("the answer is on the screen", text.includes("Το μίσθωμα είναι 4.820 ευρώ"), text.slice(0, 300));
    if (run.flags["file-pages"] !== "off") check("...saying which pages of the PDF it never read", (await page.locator('[data-testid="files-unread"]').count()) >= 1 && text.includes(fill(W.unread, { name: NAME, read: 50, total: 51 })));

    if (run.flags["file-pages"] === "off") {
      check("with the switch off, no reference is a button", (await page.locator('[data-testid="files-cite"], [data-testid="files-page"]').count()) === 0);
      check("...the answer reads as before, its list as text", text.includes(`[${NAME}, Page 37]`) && text.includes(`${NAME} — Page 37`));
      check("...and nothing new speaks of pages", !text.includes(fill(el.pagesPartRead, { read: 50, total: 51 })) && !text.includes(fill(W.unread, { name: NAME, read: 50, total: 51 })));
      check(`no page threw (${pageErrors.length})`, pageErrors.length === 0, pageErrors.slice(0, 3).join(" | "));
      await context.close();
      continue;
    }

    // ---- the answer, cut
    const cites = page.locator('[data-testid="files-cite"]');
    check("every reference in the answer is pressable, where it stands (4)", (await cites.count()) === 4 && (await cites.nth(0).innerText()) === "Page 37");
    check("...the brackets are gone from the text", !(await page.locator('[data-testid="files-answer-text"]').innerText()).includes(`[${NAME}`));
    const listed = page.locator('[data-testid="files-page"]');
    check("each page is listed once under it (37, 12, 51)", (await listed.count()) === 3);
    const lbox = await listed.first().boundingBox();
    check("...a 44px target", lbox && lbox.height >= 44, JSON.stringify(lbox));
    if (run.screen === "page" || device.label === "desktop") {
      check("the file says it is read only in part", text.includes(fill(el.pagesPartRead, { read: 50, total: 51 })));
    }

    // ---- page 37: its own words, from the file
    await press(cites.nth(0));
    const view = page.locator('[data-testid="files-page-view"]');
    await page.locator('[data-testid="files-page-text"]').waitFor({ timeout: 10000 }).catch(() => null);
    check("pressing it opens that page", (await view.count()) === 1 && (await view.innerText()).includes(`${NAME} — Page 37`));
    check("...with its own words, read from the file", (await page.locator('[data-testid="files-page-text"]').innerText().catch(() => "")) === PAGE_TEXT(37));
    check("...asked for that page alone", pageReads.at(-1) === "?page=37", JSON.stringify(pageReads));
    const pdf = page.locator('[data-testid="files-page-pdf"]');
    check("...and the PDF opens at that page, in a new tab", (await pdf.getAttribute("href")) === `/api/files/${FID}/view?page=37` && (await pdf.getAttribute("target")) === "_blank" && (await pdf.getAttribute("rel")) === "noopener noreferrer");
    const viewed = await page.request.get(`${ON}/api/files/${FID}/view?page=37`, { maxRedirects: 0 });
    check("...which is a redirect to the file itself, at #page=37, never cached or referred",
      viewed.status() === 302 && /#page=37$/.test(viewed.headers().location ?? "") && viewed.headers()["cache-control"] === "no-store" && viewed.headers()["referrer-policy"] === "no-referrer",
      `${viewed.status()} ${viewed.headers().location} cache-control=${viewed.headers()["cache-control"]} referrer-policy=${viewed.headers()["referrer-policy"]}`);

    // ---- page 12: empty; page 51: not there; a page that did not open
    await press(listed.nth(1));
    await page.waitForFunction((w) => document.querySelector('[data-testid="files-page-view"]')?.textContent?.includes(w), W.empty, { timeout: 10000 }).catch(() => null);
    check("a page with no words says so", (await view.innerText()).includes(W.empty) && (await view.innerText()).includes("Page 12"));
    await press(listed.nth(2));
    await page.waitForFunction((w) => document.querySelector('[data-testid="files-page-view"]')?.textContent?.includes(w), W.missing, { timeout: 10000 }).catch(() => null);
    check("a page that is not in the file says so", (await view.locator('[role="alert"]').innerText().catch(() => "")) === W.missing);
    await page.route("**/api/files/*?page=*", (r) => r.abort("internetdisconnected"));
    await press(cites.nth(1));
    await page.waitForFunction((w) => document.querySelector('[data-testid="files-page-view"]')?.textContent?.includes(w), W.failed, { timeout: 10000 }).catch(() => null);
    check("offline, the page says it did not open", (await view.locator('[role="alert"]').innerText().catch(() => "")) === W.failed);
    await page.unroute("**/api/files/*?page=*");

    await press(page.locator('[data-testid="files-page-close"]'));
    check("...and it closes", (await view.count()) === 0);
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
