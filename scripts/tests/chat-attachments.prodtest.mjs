/*
 * CHAT READS WHAT YOU GIVE IT, IN THE BUILT APP (MASTER 16, package 9):
 * «ανεβάζω PDF και εικόνα, ρωτάω για αυτά, και βλέπω ποια στοιχεία
 * μνήμης χρησιμοποίησε».
 *
 * Run: node scripts/tests/chat-attachments.prodtest.mjs
 *      SKIP_BUILD=1 node scripts/tests/chat-attachments.prodtest.mjs
 *
 * One production build, two servers: one where the signed-in account is
 * the test account, so the switch "chat-attachments" is on, and one where
 * it is off. /api/chat and /api/files/register are answered by the browser
 * (page.route), so no model is called and nothing is charged; storage is
 * the stand-in's, and every request to it is counted.
 *
 * With the switch on: a PDF and an image are attached with «+»; the PDF is
 * read while send waits; the question goes with both, the image uploaded
 * into the sender's own folder at send; the message shows what it
 * carried; the answer shows «From memory» with the fact it used; a
 * refused message's image is removed and the refusal said; a file of
 * another kind is refused before anything is uploaded; and a reload of
 * the conversation shows the attachments and the memory again. With the
 * switch off there is no «+».
 *
 * BOTH DEVICES: 1440x900 with a mouse, 390x844 with touch.
 */
import http from "node:http";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import sharp from "sharp";
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

const CONV = "c2222222-2222-4222-8222-222222222222";
const FILE_ID = "f3333333-3333-4333-8333-333333333333";
const STORED_IMAGE = `${MOCK_USER.id}/1700000000000-abc123-plan.png`;
const MEMORY = "Η επιχείρηση λέγεται Αύρα και είναι στη Νάξο";

MOCK_USER.user_metadata = { subscription_tier: "growth" };
const supa = await startMockSupabase({
  port: 54367,
  tableRows: {
    user_credits: [{ user_id: MOCK_USER.id, credits_remaining: 3000, credits_total: 3000 }],
    chat_conversations: [{ id: CONV, user_id: MOCK_USER.id, title: "Το μενού", is_pinned: false, created_at: "2026-10-07T10:00:00Z", updated_at: "2026-10-07T10:00:00Z" }],
    // What a reload reads: the user's message with what it carried, and
    // the answer with the memory it named (the row /api/chat writes).
    chat_messages: [
      { id: "a0000000-0000-4000-8000-000000000001", conversation_id: CONV, user_id: MOCK_USER.id, role: "user", content: "Τι τιμή έχει ο μουσακάς;", created_at: "2026-10-07T10:00:00Z",
        attachments: [{ kind: "pdf", fileId: FILE_ID, name: "menu.pdf" }, { kind: "image", path: STORED_IMAGE, name: "plan.png" }], provenance: null },
      { id: "a0000000-0000-4000-8000-000000000002", conversation_id: CONV, user_id: MOCK_USER.id, role: "assistant", content: "12 ευρώ, στη σελίδα 2.", created_at: "2026-10-07T10:00:05Z",
        attachments: null, provenance: { modules: null, memories: [{ id: "m1", text: MEMORY }] } },
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
const A = el.dashboard.chat.attach;
const fill = (s, vars) => s.replace(/\{(\w+)\}/g, (_, k) => String(vars[k]));

const PNG = await sharp({ create: { width: 64, height: 48, channels: 3, background: { r: 30, g: 120, b: 200 } } }).png().toBuffer();
const PDF = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n");

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

    // ---- what the screen asks, answered here and counted
    const asked = { chat: [], register: 0, refuse: false };
    await page.route("**/api/files/register", async (r) => {
      asked.register++;
      // Slow, so the wait on send can be seen.
      await new Promise((res) => setTimeout(res, 1500));
      return r.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true, file: {
        id: FILE_ID, filename: "menu.pdf", file_type: "pdf", size_bytes: PDF.length, page_count: 3, char_count: 900,
        processing_status: "ready", error: null, uploaded_at: "2026-10-07T10:00:00Z",
      } }) });
    });
    await page.route("**/api/chat", (r) => {
      const body = r.request().postDataJSON();
      asked.chat.push(body);
      if (asked.refuse) {
        return r.fulfill({ status: 409, contentType: "application/json", body: JSON.stringify({ ok: false, reason: "attachment_not_ready", names: ["plan.png"] }) });
      }
      return r.fulfill({ status: 200, contentType: "application/x-ndjson", body: [
        JSON.stringify({ type: "meta", conversationId: CONV, isNewConversation: true, title: "Το μενού" }),
        JSON.stringify({ type: "delta", text: "Ο μουσακάς κοστίζει 12 ευρώ (σελίδα 2). Για την Αύρα, θα τον έβαζα πρώτο." }),
        JSON.stringify({ type: "done", messageId: "a0000000-0000-4000-8000-000000000009", memoriesUsed: [{ id: "m1", text: MEMORY }] }),
      ].join("\n") + "\n" });
    });
    // A sent image is shown again through a short-lived link.
    await page.route(`${supa.url}/storage/v1/object/sign/**`, (r) =>
      r.fulfill({ contentType: "application/json", body: JSON.stringify({ signedURL: `/storage/v1/object/sign/create-attachments/${STORED_IMAGE}?token=t` }) })
    );
    await page.route(`${supa.url}/storage/v1/object/sign/create-attachments/${STORED_IMAGE}?token=t`, (r) =>
      r.request().method() === "GET" ? r.fulfill({ contentType: "image/png", body: PNG }) : r.fallback()
    );
    const storageHits = (method, bucket) => supa.hits.filter((h) => h.startsWith(`${method} /storage/v1/object/`) && h.includes(bucket)).length;
    const field = page.locator("textarea").first();
    const sendButton = page.locator(`button[type="submit"][aria-label="${el.dashboard.chat.send}"]`);
    const chips = page.locator('[data-testid="chat-attach-chip"]');

    // ---- the switch off: no «+»
    await page.goto(`${OFF}/dashboard/chat`, { waitUntil: "networkidle" });
    check("switch off: Chat has no «+»", (await page.locator('[data-testid="composer-attach"]').count()) === 0);

    // ---- the switch on: a PDF and an image
    await page.goto(`${ON}/dashboard/chat`, { waitUntil: "networkidle" });
    const plus = page.locator('[data-testid="composer-attach"]');
    check("switch on: the «+» is in the field, named", (await plus.count()) === 1 && (await plus.getAttribute("aria-label")) === A.label);
    const box = await plus.boundingBox();
    check("...and is a 44px target", box && box.width >= 44 && box.height >= 44, JSON.stringify(box));
    await page.locator('[data-testid="composer-attach-input"]').setInputFiles([
      { name: "menu.pdf", mimeType: "application/pdf", buffer: PDF },
      { name: "plan.png", mimeType: "image/png", buffer: PNG },
    ]);
    await chips.first().waitFor({ timeout: 5000 }).catch(() => null);
    check("both are on the tray", (await chips.count()) === 2);
    await press(field);
    await field.fill("Τι τιμή έχει ο μουσακάς;");
    check("the PDF is being read, and send waits", (await chips.nth(0).getAttribute("data-state")) === "reading" && (await sendButton.isDisabled()) && (await page.locator('[data-testid="chat-attach-hold"]').innerText()) === A.holdReading);
    await field.press("Enter");
    await page.waitForTimeout(200);
    check("...Enter does not send either", asked.chat.length === 0);
    await page.waitForFunction(() => document.querySelector('[data-testid="chat-attach-chip"]')?.getAttribute("data-state") === "ready", null, { timeout: 8000 }).catch(() => null);
    check("the PDF is read by Files, and its pages said", asked.register === 1 && (await chips.nth(0).innerText()).includes("3 σελίδες"));
    check("...and send is ready", !(await sendButton.isDisabled()));

    const imageUploadsBefore = storageHits("POST", "create-attachments");
    await press(sendButton);
    await page.locator('[data-testid="chat-memories-used"]').waitFor({ timeout: 10000 }).catch(() => null);
    const sent = asked.chat[0] ?? {};
    const pdfSent = (sent.attachments ?? []).find((a) => a.kind === "pdf");
    const imageSent = (sent.attachments ?? []).find((a) => a.kind === "image");
    check("the question goes with both", asked.chat.length === 1 && sent.message === "Τι τιμή έχει ο μουσακάς;" && pdfSent?.fileId === FILE_ID && imageSent?.name === "plan.png", JSON.stringify(sent));
    check("...the image uploaded at send, into the sender's own folder", storageHits("POST", "create-attachments") === imageUploadsBefore + 1 && imageSent?.path?.startsWith(`${MOCK_USER.id}/`), imageSent?.path);
    check("...and the tray empties", (await chips.count()) === 0);
    const sentRow = page.locator('[data-testid="chat-sent-attachments"]').last();
    check("the message shows what it carried", (await sentRow.count()) === 1 && (await sentRow.innerText()).includes("menu.pdf") && (await sentRow.locator("img").count()) === 1);
    check("...the PDF opens in Files", (await sentRow.locator("a").first().getAttribute("href")) === `/dashboard/files?record=${FILE_ID}`);
    const memory = page.locator('[data-testid="chat-memories-used"]').last();
    check("under the answer: «From memory (1)»", (await memory.innerText()).includes(fill(A.memoryUsed, { count: 1 })));
    await press(memory.locator("summary"));
    await page.waitForTimeout(200);
    check("...opened, the fact it used, and where memory is kept", (await memory.innerText()).includes(MEMORY) && (await memory.locator('a[href="/dashboard/ai-memory"]').count()) === 1);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    check("the page does not scroll sideways", overflow <= 1, `${overflow}px`);

    // ---- a file of another kind is refused before anything goes up
    const uploadsBeforeRefusal = supa.hits.filter((h) => h.startsWith("POST /storage/v1/object/")).length;
    await page.locator('[data-testid="composer-attach-input"]').setInputFiles([{ name: "notes.docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", buffer: Buffer.from("x") }]);
    await page.waitForTimeout(300);
    check("a Word file is refused, and said", (await chips.count()) === 0 && (await page.getByText(fill(A.type, { name: "notes.docx" })).count()) >= 1);
    check("...before anything is uploaded", supa.hits.filter((h) => h.startsWith("POST /storage/v1/object/")).length === uploadsBeforeRefusal);

    // ---- a refused message: its image is removed, the refusal said, the tray kept
    asked.refuse = true;
    await page.locator('[data-testid="composer-attach-input"]').setInputFiles([{ name: "plan.png", mimeType: "image/png", buffer: PNG }]);
    await press(field);
    await field.fill("Και αυτό;");
    const removesBefore = storageHits("DELETE", "create-attachments");
    await press(sendButton);
    await page.getByText(fill(A.notReady, { names: "plan.png" })).first().waitFor({ timeout: 8000 }).catch(() => null);
    check("a refused message says why", (await page.getByText(fill(A.notReady, { names: "plan.png" })).count()) >= 1);
    check("...its image is removed from storage", storageHits("DELETE", "create-attachments") === removesBefore + 1, supa.hits.filter((h) => h.includes("create-attachments")).slice(-4).join(" | "));
    check("...and the tray is kept, to send again", (await chips.count()) === 1);
    asked.refuse = false;

    // ---- a reload shows what the stream showed
    await page.goto(`${ON}/dashboard/chat?c=${CONV}`, { waitUntil: "networkidle" });
    await page.locator('[data-testid="chat-sent-attachments"]').first().waitFor({ timeout: 8000 }).catch(() => null);
    const reloaded = page.locator('[data-testid="chat-sent-attachments"]').first();
    check("after a reload, the message still shows the PDF", (await reloaded.innerText().catch(() => "")).includes("menu.pdf"));
    await page.waitForFunction(() => !!document.querySelector('[data-testid="chat-sent-attachments"] img'), null, { timeout: 5000 }).catch(() => null);
    check("...and the image, through a short-lived link", (await reloaded.locator("img").count()) === 1);
    check("...and the answer still says what it took from memory", (await page.locator('[data-testid="chat-memories-used"]').first().innerText().catch(() => "")).includes(fill(A.memoryUsed, { count: 1 })));

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
