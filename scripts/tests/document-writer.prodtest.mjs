/*
 * A DOCUMENT FROM A DESCRIPTION, ONE PARAGRAPH CHANGED WITH WORDS, AND
 * DOWNLOADED IN WORD AND PDF — IN THE BUILT APP (MASTER 16, package 14).
 *
 * Run: node scripts/tests/document-writer.prodtest.mjs
 *      SKIP_BUILD=1 node scripts/tests/document-writer.prodtest.mjs
 *
 * One production build, the real routes: api/documents/generate, then
 * api/documents/[id]/edit with a block chosen, then api/documents/[id]/docx
 * and /pdf. The model is a local server answering as Anthropic does
 * (ANTHROPIC_BASE_URL); the database is the stand-in, keeping the rows the
 * routes write.
 *
 * THE WORD FILE IS OPENED BY ANOTHER PROGRAM: LibreOffice Writer reads the
 * .docx and writes it back as OpenDocument, and the headings, the lists and
 * the words it read are checked in what it wrote. Without LibreOffice this
 * test fails and says so (the nightly job installs it).
 *
 * BOTH DEVICES: 1440x900 with a mouse, 390x844 with touch. In Greek, then
 * in English on a computer. Around it: the provider down, no credits left,
 * a Free account, the switch off — and All tools, which shows Document
 * only to whoever the switch admits.
 */
import http from "node:http";
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { chromium } from "playwright";
import { startMockSupabase, MOCK_USER } from "../lib/mock-supabase.mjs";
import { loadTs } from "./load-ts.mjs";

const require = createRequire(import.meta.url);
const JSZip = require("jszip");
const { extractPdfText } = await loadTs("src/lib/files/pdf.ts");
const { htmlToBlocks } = await loadTs("src/lib/pdf/blocks.ts");

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

// ---------------------------------------------------------------------
// user_documents, kept as rows.
// ---------------------------------------------------------------------
const docs = [];
let seq = 0;
const uuid = () => `${String(++seq).padStart(8, "0")}-0000-4000-8000-00000000d0c0`;
function rest({ req, res, url, body, json }) {
  const table = url.pathname.replace(/^\/rest\/v1\//, "");
  if (table === "rpc/consume_rate_limit") return json(200, true), true;
  if (table !== "user_documents") return false;
  const hit = docs.filter((r) => [...url.searchParams].every(([k, v]) => !v.startsWith("eq.") || String(r[k]) === v.slice(3)));
  const single = (req.headers.accept ?? "").includes("vnd.pgrst.object");
  const answer = (list) => (single ? (list[0] ? json(200, list[0]) : json(406, { message: "no rows" })) : json(200, list));
  if (req.method === "GET") return answer([...hit].sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)))), true;
  if (req.method === "POST") {
    const made = (Array.isArray(JSON.parse(body)) ? JSON.parse(body) : [JSON.parse(body)]).map((r) => ({ id: uuid(), created_at: new Date().toISOString(), updated_at: new Date(Date.now() + seq).toISOString(), ...r }));
    docs.push(...made);
    return answer(made), true;
  }
  if (req.method === "PATCH") {
    for (const r of hit) Object.assign(r, JSON.parse(body || "{}"));
    return answer(hit), true;
  }
  if (req.method === "DELETE") {
    for (const r of hit) docs.splice(docs.indexOf(r), 1);
    return answer(hit), true;
  }
  return false;
}

const flags = [];
const credits = [{ user_id: MOCK_USER.id, credits_remaining: 3000, credits_total: 3000 }];
MOCK_USER.user_metadata = { subscription_tier: "growth" };
const supa = await startMockSupabase({ port: 54399, tableRows: { feature_flags: flags, user_credits: credits }, handle: rest });
const setFlags = (audiences) => flags.splice(0, flags.length, ...Object.entries(audiences).map(([key, audience]) => ({ key, audience })));

// ---------------------------------------------------------------------
// The model: a whole document, or one block's new words.
// ---------------------------------------------------------------------
const OFFER_EL = {
  title: "Προσφορά catering για το Ξενοδοχείο Αιγαίο",
  blocks: [
    { kind: "heading", level: 1, text: "Τι προσφέρουμε" },
    { kind: "paragraph", text: "Πρωινό για **40 άτομα** κάθε μέρα, από τις 7:00." },
    { kind: "list", items: ["Φρέσκο ψωμί", "Γλυκά της ημέρας"], ordered: false },
    { kind: "heading", level: 2, text: "Τιμή" },
    { kind: "paragraph", text: "[τιμή ανά άτομο] ανά άτομο, για [διάρκεια]." },
    { kind: "list", items: ["Υπογραφή", "Προκαταβολή"], ordered: true },
  ],
};
const OFFER_EN = {
  title: "Catering offer for the Aegean Hotel",
  blocks: [
    { kind: "heading", level: 1, text: "What we offer" },
    { kind: "paragraph", text: "Breakfast for **40 guests** every day, from 7:00." },
    { kind: "heading", level: 2, text: "Price" },
    { kind: "paragraph", text: "[price per guest] per guest, for [duration]." },
  ],
};
const modelAsked = [];
const model = http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    const sent = JSON.parse(body || "{}");
    modelAsked.push(sent);
    const words = JSON.stringify(sent.messages ?? []);
    if (words.includes("ΣΦΑΛΜΑ ΠΑΡΟΧΟΥ")) {
      res.writeHead(529, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ type: "error", error: { type: "overloaded_error", message: "Overloaded" } }));
    }
    const name = sent.tool_choice?.name;
    const input = name === "rewrite_block" ? { text: "**12 €** ανά άτομο, για ένα έτος." } : words.includes("Aegean") ? OFFER_EN : OFFER_EL;
    res.writeHead(200, { "Content-Type": "application/json", "request-id": "req_test" });
    res.end(JSON.stringify({ id: "msg", type: "message", role: "assistant", model: "claude-sonnet-4-6", content: [{ type: "tool_use", id: "t", name, input }], stop_reason: "tool_use", usage: { input_tokens: 1200, output_tokens: 500 } }));
  });
});
await new Promise((r) => model.listen(0, "127.0.0.1", r));

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
  ANTHROPIC_API_KEY: "placeholder-answered-locally",
  ANTHROPIC_BASE_URL: `http://127.0.0.1:${model.address().port}`,
};
const msgs = (loc) => JSON.parse(readFileSync(`messages/${loc}.json`, "utf8"));
const EL = msgs("el");
const EN = msgs("en");
const fill = (s, vars) => s.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ""));

const servers = [];
const pageErrors = [];
let browser = null;
const loProfile = mkdtempSync(path.join(tmpdir(), "document-writer-lo-"));
const cleanup = () => {
  for (const server of servers) {
    try { if (server?.pid) process.kill(-server.pid, "SIGKILL"); } catch {}
  }
  try { supa.close(); } catch {}
  try { model.close(); } catch {}
  try { rmSync(loProfile, { recursive: true, force: true }); } catch {}
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
async function open(origin, device, locale = "el") {
  const context = await browser.newContext({ viewport: device.viewport, hasTouch: device.touch, isMobile: device.touch, acceptDownloads: true });
  await context.addCookies(
    [
      { ...supa.authCookie, url: origin, httpOnly: false, secure: false, sameSite: "Lax" },
      { name: "NEXT_LOCALE", value: locale, url: origin },
    ].map(({ domain, path: p, ...c }) => c)
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
async function say(page, press, text) {
  await page.locator("textarea").first().fill(text);
  await press(page.locator('button[type="submit"]').first());
}
const stored = () => docs.filter((d) => d.content?.source === "written").at(-1);
const storedBlocks = () => htmlToBlocks(stored()?.content?.html ?? "");

function soffice() {
  for (const bin of [process.env.SOFFICE_PATH, "soffice", "libreoffice"].filter(Boolean)) {
    if (spawnSync(bin, ["--version"], { encoding: "utf8" }).status === 0) return bin;
  }
  return null;
}
/** LibreOffice Writer opens the .docx and writes it as OpenDocument; what it read comes back from that. */
async function openInWriter(docx) {
  const bin = soffice();
  if (!bin) return { ok: false, why: "LibreOffice (soffice) is not installed — install libreoffice-writer" };
  const dir = mkdtempSync(path.join(tmpdir(), "document-writer-"));
  writeFileSync(path.join(dir, "doc.docx"), docx);
  const run = spawnSync(bin, [`-env:UserInstallation=file://${loProfile}`, "--headless", "--convert-to", "odt", "--outdir", dir, path.join(dir, "doc.docx")], { encoding: "utf8", timeout: 120_000 });
  let odt = null;
  try { odt = readFileSync(path.join(dir, "doc.odt")); } catch {}
  rmSync(dir, { recursive: true, force: true });
  if (!odt) return { ok: false, why: `Writer could not open it: ${(run.stdout + run.stderr).slice(-300)}` };
  const xml = await (await JSZip.loadAsync(odt)).file("content.xml").async("string");
  return {
    ok: true,
    headings: [...xml.matchAll(/<text:h [^>]*text:outline-level="(\d)"[^>]*>([\s\S]*?)<\/text:h>/g)].map((m) => ({ level: Number(m[1]), text: m[2].replace(/<[^>]+>/g, "") })),
    // An item that restarts the count carries text:start-value="1".
    lists: (xml.match(/<text:list-item[\s>]/g) ?? []).length,
    text: xml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " "),
  };
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
  // The owner's account, not charged; CHARGED is the same build for an ordinary one.
  const ON = await start({ ...base, ADMIN_EMAILS: MOCK_USER.email, TEST_ACCOUNT_EMAILS: MOCK_USER.email });
  const CHARGED = await start({ ...base, TEST_ACCOUNT_EMAILS: MOCK_USER.email });
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium" });

  let firstDocx = null;
  for (const device of [
    { label: "desktop", viewport: { width: 1440, height: 900 }, touch: false },
    { label: "phone", viewport: { width: 390, height: 844 }, touch: true },
  ]) {
    console.log(`\n== ${device.label}: a description in, a document out, one paragraph changed ==`);
    setFlags({});
    docs.length = 0;
    const { context, page, press } = await open(ON, device);
    await page.goto(`${ON}/dashboard/documents`, { waitUntil: "networkidle" });
    check("Document opens in the shell, under its one-word name", (await page.locator('[data-testid="tool-shell"]').count()) === 1 && (await page.locator('[data-testid="tool-shell"] h1').innerText()).trim() === EL.dashboard.tools.names.document);
    await press(page.locator('[data-testid="document-recent"]'));
    check("a new account has written nothing, and is told so", (await page.locator('[data-testid="tool-shell-work"]').innerText()).includes(EL.dashboard.documents.writer.noneYet));
    await press(page.locator('[data-testid="tool-shell-close"]:visible, [data-testid="tool-shell-back"]:visible').first());

    await press(page.locator('[data-testid="document-kind"]'));
    await press(page.locator('[role="option"]').filter({ hasText: EL.dashboard.documents.writer.kinds.offer }));
    check("the kind is chosen under the field", (await page.locator('[data-testid="document-kind"]').innerText()).includes(EL.dashboard.documents.writer.kinds.offer));
    const before = modelAsked.length;
    await say(page, press, "Προσφορά catering για το Ξενοδοχείο Αιγαίο, πρωινό για 40 άτομα");
    await page.locator('[data-testid="doc-box"]').first().waitFor({ timeout: 60_000 });
    const asked = JSON.stringify(modelAsked[before]?.messages ?? []);
    check("the model was asked for an offer, the description fenced as data", modelAsked.length === before + 1 && /commercial OFFER/.test(asked) && asked.indexOf("Ξενοδοχείο Αιγαίο") > asked.indexOf("<<<UNTRUSTED_SOURCE_MATERIAL>>>"));
    const boxes = page.locator('[data-testid="doc-box"]');
    check(`the document is on the screen as its blocks (${await boxes.count()})`, (await boxes.count()) === 8);
    check("...its headings, its words, its lists", (await page.locator('[data-testid="tool-shell-work"]').innerText()).includes("Τι προσφέρουμε") && (await boxes.nth(2).innerText()).includes("Φρέσκο ψωμί"));
    check("...and it is saved as an ordinary document of the person's", stored()?.user_id === MOCK_USER.id && stored()?.title === OFFER_EL.title && /<h1>Τι προσφέρουμε<\/h1>/.test(stored()?.content?.html ?? ""));
    if (device.touch) await press(page.locator('[data-testid="tool-shell-back"]'));
    // ---- one paragraph, changed with words
    const beforeBlocks = storedBlocks();
    if (device.touch) await press(page.locator('[data-testid="tool-shell-card"]').last());
    await press(boxes.nth(5));
    check("the pressed paragraph is the one the field will change", (await page.locator('[data-testid="box-chosen"]').innerText()).includes(fill(EL.dashboard.documents.writer.block, { n: 6 })));
    const editAt = modelAsked.length;
    await say(page, press, "βάλε τιμή 12 ευρώ για ένα έτος");
    await page.getByText("ανά άτομο, για ένα έτος.").first().waitFor({ timeout: 60_000 });
    const editAsked = modelAsked[editAt];
    check("the model was asked for that block alone, shown the whole document", editAsked?.tool_choice?.name === "rewrite_block" && /Rewrite ONLY block \[6\]/.test(JSON.stringify(editAsked.messages)));
    const afterBlocks = storedBlocks();
    check("only that paragraph changed in the saved document; every other block is as it was", afterBlocks.length === beforeBlocks.length && afterBlocks.every((b, i) => i === 5 || JSON.stringify(b) === JSON.stringify(beforeBlocks[i])) && afterBlocks[5].runs.map((r) => r.text).join("") === "12 € ανά άτομο, για ένα έτος.", JSON.stringify(afterBlocks[5]));
    check("...and the bold the model asked for is bold", afterBlocks[5].runs[0]?.bold === true);

    // ---- Word, and Writer opens it
    if (device.touch && !(await page.locator('[data-testid="document-docx"]').isVisible())) await press(page.locator('[data-testid="tool-shell-card"]').last());
    const [docxDownload] = await Promise.all([page.waitForEvent("download", { timeout: 30_000 }), press(page.locator('[data-testid="document-docx"]'))]);
    const docx = readFileSync(await docxDownload.path());
    check(`the Word file downloads (${docx.length} bytes, ${docxDownload.suggestedFilename()})`, docx[0] === 0x50 && docx[1] === 0x4b && /\.docx$/.test(docxDownload.suggestedFilename()));
    if (!firstDocx) firstDocx = docx;
    const zipDoc = await (await JSZip.loadAsync(docx)).file("word/document.xml").async("string");
    check("...with the changed paragraph in it", zipDoc.includes("ανά άτομο, για ένα έτος."));

    // ---- PDF, in the document's own language, free
    await press(page.locator('[data-testid="tool-shell-work"] button').filter({ hasText: EL.common.downloadPdf.label }).first());
    const [pdfDownload] = await Promise.all([page.waitForEvent("download", { timeout: 30_000 }), press(page.locator('[data-testid="document-pdf-download"]'))]);
    const pdf = readFileSync(await pdfDownload.path());
    const pdfText = extractPdfText(pdf).pages.map((p) => p.text).join(" ").replace(/\s+/g, " ");
    check("the PDF downloads, with the same words", pdf.subarray(0, 4).toString() === "%PDF" && ["Τι προσφέρουμε", "Φρέσκο ψωμί", "ανά άτομο, για ένα έτος."].every((s) => pdfText.includes(s)), pdfText.slice(0, 200));

    // ---- the editor, one press away
    const editorHref = await page.locator('[data-testid="document-open-editor"]').getAttribute("href");
    check("the editor is one press away, on the same document", editorHref === `/dashboard/documents/${stored().id}`);
    check(`no page threw (${pageErrors.length})`, pageErrors.length === 0, pageErrors.slice(0, 3).join(" | "));
    await context.close();
  }

  console.log("\n== the Word file, opened by LibreOffice Writer ==");
  {
    const writer = await openInWriter(firstDocx);
    check("Writer opens the file", writer.ok, writer.why);
    if (writer.ok) {
      check(`...and reads its headings as headings, at their levels (${writer.headings.map((h) => `${h.level}:${h.text}`).join(" | ")})`, writer.headings.some((h) => h.level === 1 && h.text.includes("Τι προσφέρουμε")) && writer.headings.some((h) => h.level === 2 && h.text.includes("Τιμή")));
      check(`...its lists as lists (${writer.lists} items)`, writer.lists === 4);
      check("...and every word, the changed paragraph included", ["Πρωινό για", "40 άτομα", "Φρέσκο ψωμί", "ανά άτομο, για ένα έτος.", "Προκαταβολή"].every((s) => writer.text.includes(s)));
    }
  }

  console.log("\n== in English, desktop ==");
  {
    docs.length = 0;
    const { context, page, press } = await open(ON, { viewport: { width: 1440, height: 900 }, touch: false }, "en");
    await page.goto(`${ON}/dashboard/documents`, { waitUntil: "networkidle" });
    check("the writer speaks English", (await page.locator("textarea").first().getAttribute("placeholder")) === EN.dashboard.documents.writer.placeholder);
    await say(page, press, "A catering offer for the Aegean Hotel, breakfast for 40 guests");
    await page.locator('[data-testid="doc-box"]').first().waitFor({ timeout: 60_000 });
    check("the document is in the description's language", (await page.locator('[data-testid="tool-shell-work"]').innerText()).includes("What we offer"));
    const body = await page.locator("main").innerText();
    check("no Greek on the English screen", !/[Ͱ-Ͽ]/.test(body), body.match(/.{0,30}[Ͱ-Ͽ].{0,30}/)?.[0]);
    check(`no page threw (${pageErrors.length})`, pageErrors.length === 0, pageErrors.slice(0, 3).join(" | "));
    await context.close();
  }

  console.log("\n== around it: the provider down, All tools ==");
  {
    const { context, page, press } = await open(ON, { viewport: { width: 390, height: 844 }, touch: true });
    await page.goto(`${ON}/dashboard/documents`, { waitUntil: "networkidle" });
    const made = docs.length;
    await say(page, press, "Επιστολή στον δήμο — ΣΦΑΛΜΑ ΠΑΡΟΧΟΥ");
    await page.getByText(EL.dashboard.documents.writer.errors.unavailable).waitFor({ timeout: 90_000 });
    check("the provider down: said, and nothing saved", docs.length === made);
    await page.goto(`${ON}/dashboard/tools`, { waitUntil: "networkidle" });
    check("with the switch on, All tools shows Document under Make", (await page.locator('[data-testid="tool-tile"]').filter({ hasText: EL.dashboard.tools.names.document }).count()) === 1);
    await context.close();
  }

  console.log("\n== an ordinary account: no credits left, then a Free plan ==");
  {
    credits[0].credits_remaining = 0;
    const { context, page, press } = await open(CHARGED, { viewport: { width: 1440, height: 900 }, touch: false });
    await page.goto(`${CHARGED}/dashboard/documents`, { waitUntil: "networkidle" });
    const asked = modelAsked.length;
    await say(page, press, "Επιστολή στον δήμο για το πεζοδρόμιο");
    await page.getByText(EL.dashboard.documents.writer.errors.insufficient).waitFor({ timeout: 30_000 });
    check("no credits left: said before the model is asked", modelAsked.length === asked);
    credits[0].credits_remaining = 3000;
    MOCK_USER.user_metadata = { subscription_tier: "free" };
    await page.goto(`${CHARGED}/dashboard/documents`, { waitUntil: "networkidle" });
    check("a Free account keeps its notes page, without a writer that would be refused", (await page.locator('[data-testid="tool-shell"]').count()) === 0 && (await page.locator("main").count()) === 1);
    const refused = await page.request.post(`${CHARGED}/api/documents/generate`, { data: { description: "Επιστολή στον δήμο για το πεζοδρόμιο" } });
    check("...and the route refuses it, whatever is sent", refused.status() === 403 && (await refused.json()).code === "not_included");
    MOCK_USER.user_metadata = { subscription_tier: "growth" };
    await context.close();
  }

  console.log("\n== the switch off, desktop ==");
  {
    setFlags({ "document-writer": "off" });
    const { context, page } = await open(ON, { viewport: { width: 1440, height: 900 }, touch: false });
    await page.goto(`${ON}/dashboard/documents`, { waitUntil: "networkidle" });
    check("with the switch off, Documents is the notes page it was", (await page.locator('[data-testid="tool-shell"]').count()) === 0);
    const refused = await page.request.post(`${ON}/api/documents/generate`, { data: { description: "Επιστολή στον δήμο για το πεζοδρόμιο" } });
    check("...the route refuses", refused.status() === 403 && (await refused.json()).code === "not_enabled");
    await page.goto(`${ON}/dashboard/tools`, { waitUntil: "networkidle" });
    check("...and All tools does not show Document", (await page.locator('[data-testid="tool-tile"]').filter({ hasText: EL.dashboard.tools.names.document }).count()) === 0 && (await page.locator('[data-testid="tool-tile"]').count()) > 10);
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
