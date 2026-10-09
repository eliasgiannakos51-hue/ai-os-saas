/*
 * A DECK WITH A REAL CHART FROM THE PERSON'S OWN FILE, IN THE BUILT APP,
 * AND A POWERPOINT THAT OPENS (MASTER 16, package 13).
 *
 * Run: node scripts/tests/slides-charts.prodtest.mjs
 *      SKIP_BUILD=1 node scripts/tests/slides-charts.prodtest.mjs
 *
 * One production build, the real routes all the way: the spreadsheet goes
 * through api/data-analysis/upload (parsed and profiled there), the brief
 * through api/presentations/generate (which reads the file back by id and
 * owner and computes the charts), the model is a local server answering
 * as Anthropic does (ANTHROPIC_BASE_URL), and the downloads come from
 * api/presentations/[id]/pptx and /pdf. The database is the stand-in.
 *
 * THE POWERPOINT IS OPENED BY ANOTHER PROGRAM: LibreOffice Impress reads
 * the .pptx and writes it back as OpenDocument, and the chart it read —
 * its kind and every value — is checked in what it wrote. Without
 * LibreOffice this test fails and says so; it never passes without having
 * opened the file (the nightly job installs it).
 *
 * BOTH DEVICES: 1440x900 with a mouse, 390x844 with touch — the «+» is
 * pressed with a finger and the file chosen in the chooser it opens. In
 * Greek, then in English on a computer. Around it: a file with nothing to
 * draw (refused, nothing asked of the model), a file that is not a
 * spreadsheet, the provider down, no credits left, a Free account, and
 * the switch off.
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
// The tables the upload and the deck write and read, kept as rows.
// ---------------------------------------------------------------------
const STATEFUL = ["data_analyses", "data_analysis_charts", "ai_presentations"];
const store = Object.fromEntries(STATEFUL.map((t) => [t, []]));
let seq = 0;
const uuid = () => `${String(++seq).padStart(8, "0")}-0000-4000-8000-000000000000`;
function matches(row, url) {
  for (const [key, raw] of url.searchParams) {
    if (["select", "order", "limit", "offset", "on_conflict", "columns"].includes(key)) continue;
    const [op, ...rest] = raw.split(".");
    const value = rest.join(".");
    if (op === "eq" && String(row[key]) !== value) return false;
  }
  return true;
}
const DEFAULTS = { ai_presentations: () => ({ created_at: new Date(Date.now() + seq).toISOString(), updated_at: new Date().toISOString() }), data_analyses: () => ({ created_at: new Date().toISOString() }) };
const asked = { uploads: 0, generate: [] };
function rest({ req, res, url, body, json }) {
  const table = url.pathname.replace(/^\/rest\/v1\//, "");
  if (table === "rpc/consume_rate_limit") return json(200, true), true;
  if (!STATEFUL.includes(table)) return false;
  const rows = store[table];
  const hit = rows.filter((r) => matches(r, url));
  const single = (req.headers.accept ?? "").includes("vnd.pgrst.object");
  const answer = (list) => (single ? (list[0] ? json(200, list[0]) : json(406, { message: "no rows" })) : json(200, list));
  if (req.method === "GET" || req.method === "HEAD") {
    let list = [...hit].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
    const limit = Number(url.searchParams.get("limit"));
    if (limit) list = list.slice(0, limit);
    // maybeSingle asks for an array and takes the first.
    answer(list);
    return true;
  }
  if (req.method === "POST") {
    const input = JSON.parse(body || "[]");
    const made = (Array.isArray(input) ? input : [input]).map((r) => ({ id: uuid(), ...(DEFAULTS[table]?.() ?? {}), ...r }));
    rows.push(...made);
    if (table === "data_analyses") asked.uploads++;
    answer(made);
    return true;
  }
  if (req.method === "PATCH") {
    for (const r of hit) Object.assign(r, JSON.parse(body || "{}"));
    answer(hit);
    return true;
  }
  if (req.method === "DELETE") {
    for (const r of hit) rows.splice(rows.indexOf(r), 1);
    answer(hit);
    return true;
  }
  return false;
}

const flags = [];
const credits = [{ user_id: MOCK_USER.id, credits_remaining: 3000, credits_total: 3000 }];
MOCK_USER.user_metadata = { subscription_tier: "growth" };
const supa = await startMockSupabase({ port: 54397, tableRows: { feature_flags: flags, user_credits: credits }, handle: rest });
const setFlags = (audiences) => flags.splice(0, flags.length, ...Object.entries(audiences).map(([key, audience]) => ({ key, audience })));

// ---------------------------------------------------------------------
// The model, answered as the model would: it reads the CHARTS list it was
// sent and puts the island chart on a slide, by its number.
// ---------------------------------------------------------------------
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
    // The English run gives the English file.
    const english = words.includes("sales.xlsx");
    const editing = words.includes("THE CHANGE ASKED FOR");
    const list = words.match(/\\n(\d+)\. bar chart \\"(?:Έσοδα|Revenue) by (?:Νησί|Island)\\"/);
    const n = list ? Number(list[1]) : 1;
    const input = english
      ? { title: "Our sales", slides: [
          { layout: "title", title: "Our sales", bullets: ["2025"], notes: "", imageQuery: null, chart: null },
          { layout: "chart", title: "Naxos leads", bullets: ["Naxos 2,700.8", "Syros last"], notes: "Read the bars left to right.", imageQuery: null, chart: n },
          { layout: "bullets", title: "Next", bullets: ["Open a shop on Syros"], notes: "", imageQuery: null, chart: null },
        ] }
      : { title: "Οι πωλήσεις μας", slides: [
          { layout: "title", title: "Οι πωλήσεις μας", bullets: ["2025"], notes: "", imageQuery: null, chart: null },
          { layout: "chart", title: editing ? "Πρώτη η Νάξος" : "Η Νάξος μπροστά", bullets: ["Νάξος 2.700,8", "Η Σύρος τελευταία"], notes: "Διάβασε τις μπάρες από αριστερά.", imageQuery: null, chart: n },
          { layout: "bullets", title: "Επόμενα", bullets: ["Κατάστημα στη Σύρο"], notes: "", imageQuery: null, chart: null },
        ] };
    res.writeHead(200, { "Content-Type": "application/json", "request-id": "req_test" });
    res.end(JSON.stringify({ id: "msg", type: "message", role: "assistant", model: "claude-sonnet-4-6", content: [{ type: "tool_use", id: "t", name: "write_deck", input }], stop_reason: "tool_use", usage: { input_tokens: 1400, output_tokens: 600 } }));
  });
});
await new Promise((r) => model.listen(0, "127.0.0.1", r));
const MODEL_URL = `http://127.0.0.1:${model.address().port}`;

// ---------------------------------------------------------------------
// The person's files.
// ---------------------------------------------------------------------
async function workbook(header, rows, sheetName) {
  const zip = new JSZip();
  const strings = [];
  const sid = (s) => { const i = strings.indexOf(s); if (i >= 0) return i; strings.push(s); return strings.length - 1; };
  const col = (i) => String.fromCharCode(65 + i);
  const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");
  const cell = (v, r, c) => (typeof v === "number" ? `<c r="${col(c)}${r}"><v>${v}</v></c>` : `<c r="${col(c)}${r}" t="s"><v>${sid(v)}</v></c>`);
  const sheetRows = [header, ...rows].map((row, i) => `<row r="${i + 1}">${row.map((v, c) => cell(v, i + 1, c)).join("")}</row>`).join("");
  zip.file("xl/workbook.xml", `<?xml version="1.0"?><workbook><sheets><sheet name="${sheetName}" sheetId="1" r:id="rId1"/></sheets></workbook>`);
  zip.file("xl/_rels/workbook.xml.rels", `<?xml version="1.0"?><Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>`);
  zip.file("xl/worksheets/sheet1.xml", `<?xml version="1.0"?><worksheet><sheetData>${sheetRows}</sheetData></worksheet>`);
  zip.file("xl/sharedStrings.xml", `<?xml version="1.0"?><sst>${strings.map((s) => `<si><t>${esc(s)}</t></si>`).join("")}</sst>`);
  return Buffer.from(await zip.generateAsync({ type: "nodebuffer" }));
}
const XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const SALES_EL = await workbook(["Νησί", "Έσοδα"], [["Νάξος", 1200], ["Πάρος", 800], ["Νάξος", 1500.8], ["Σύρος", 300], ["Πάρος", 950], ["Νάξος", 0]], "Πωλήσεις");
const SALES_EN = await workbook(["Island", "Revenue"], [["Naxos", 1200], ["Paros", 800], ["Naxos", 1500.8], ["Syros", 300], ["Paros", 950], ["Naxos", 0]], "Sales");
const ISLANDS = [["Νάξος", 2700.8], ["Πάρος", 1750], ["Σύρος", 300]];

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
  ANTHROPIC_BASE_URL: MODEL_URL,
  UNSPLASH_ACCESS_KEY: "",
};

const msg = (loc) => JSON.parse(readFileSync(`messages/${loc}.json`, "utf8")).presentations;
const EL = msg("el");
const EN = msg("en");
const fill = (s, vars) => s.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ""));
const plural = (s, n) => s.replace(/\{rows, plural, one \{# ([^}]*)\} other \{# ([^}]*)\}\}/, (_, one, other) => `${n} ${n === 1 ? one : other}`);

const servers = [];
const pageErrors = [];
let browser = null;
const loProfile = mkdtempSync(path.join(tmpdir(), "slides-charts-lo-"));
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
  page.on("request", (r) => {
    if (r.url().endsWith("/api/presentations/generate") && r.method() === "POST") asked.generate.push(JSON.parse(r.postData() || "{}"));
  });
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

/** The «+», pressed as the device presses, and the file given to the chooser it opens. */
async function giveFile(page, press, file) {
  const [chooser] = await Promise.all([page.waitForEvent("filechooser", { timeout: 10_000 }), press(page.locator('[data-testid="composer-attach"]'))]);
  await chooser.setFiles(file);
}
async function say(page, press, text) {
  await page.locator("textarea").first().fill(text);
  await press(page.locator('button[type="submit"]').first());
}
const lastToolTurn = (page) => page.locator('[data-testid="tool-shell-thread"] li[data-role="tool"]').last();

function soffice() {
  for (const bin of [process.env.SOFFICE_PATH, "soffice", "libreoffice"].filter(Boolean)) {
    const probe = spawnSync(bin, ["--version"], { encoding: "utf8" });
    if (probe.status === 0) return bin;
  }
  return null;
}

/** LibreOffice Impress opens the .pptx and writes it as OpenDocument: what
 *  chart it read, and the values in it, come back from what it wrote. */
async function openInImpress(pptx) {
  const bin = soffice();
  if (!bin) return { ok: false, why: "LibreOffice (soffice) is not installed — install libreoffice-impress" };
  const dir = mkdtempSync(path.join(tmpdir(), "slides-charts-"));
  const file = path.join(dir, "deck.pptx");
  writeFileSync(file, pptx);
  const run = spawnSync(bin, [`-env:UserInstallation=file://${loProfile}`, "--headless", "--convert-to", "odp", "--outdir", dir, file], { encoding: "utf8", timeout: 120_000 });
  let odp = null;
  try { odp = readFileSync(path.join(dir, "deck.odp")); } catch {}
  const pdfRun = spawnSync(bin, [`-env:UserInstallation=file://${loProfile}`, "--headless", "--convert-to", "pdf", "--outdir", dir, file], { encoding: "utf8", timeout: 120_000 });
  let pdf = null;
  try { pdf = readFileSync(path.join(dir, "deck.pdf")); } catch {}
  rmSync(dir, { recursive: true, force: true });
  if (!odp) return { ok: false, why: `Impress could not open it: ${(run.stdout + run.stderr).slice(-300)}` };
  const zip = await JSZip.loadAsync(odp);
  const objects = Object.keys(zip.files).filter((n) => /^Object \d+\/content\.xml$/.test(n));
  const charts = await Promise.all(objects.map(async (n) => {
    const xml = await zip.file(n).async("string");
    return {
      kind: (xml.match(/<chart:chart [^>]*chart:class="chart:(\w+)"/) ?? [])[1] ?? null,
      cells: [...xml.matchAll(/<table:table-cell[^>]*?office:value="([^"]+)"/g)].map((m) => Number(m[1])),
      text: [...xml.matchAll(/<text:p>([^<]*)<\/text:p>/g)].map((m) => m[1]),
    };
  }));
  const pages = pdf ? (pdf.toString("latin1").match(/\/Type\s*\/Page[^s]/g) ?? []).length : 0;
  return { ok: true, charts, pages, pdfOk: pdfRun.status === 0 };
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
  // The owner's account: not charged, so the deck is walked without the
  // credit machinery. CHARGED is the same build for an ordinary account.
  const ON = await start({ ...base, ADMIN_EMAILS: MOCK_USER.email, TEST_ACCOUNT_EMAILS: MOCK_USER.email });
  const CHARGED = await start({ ...base, TEST_ACCOUNT_EMAILS: MOCK_USER.email });
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium" });

  let firstPptx = null;
  for (const device of [
    { label: "desktop", viewport: { width: 1440, height: 900 }, touch: false },
    { label: "phone", viewport: { width: 390, height: 844 }, touch: true },
  ]) {
    console.log(`\n== ${device.label}: a spreadsheet in, a deck with its chart out ==`);
    setFlags({});
    store.ai_presentations.length = 0;
    const { context, page, press } = await open(ON, device);
    await page.goto(`${ON}/dashboard/presentations`, { waitUntil: "networkidle" });
    check("Slides opens in the shell, with the «+» in its field", (await page.locator('[data-testid="tool-shell"]').count()) === 1 && (await page.locator('[data-testid="composer-attach"]').isVisible()));
    check("...whose name says what it takes", (await page.locator('[data-testid="composer-attach"]').getAttribute("aria-label")) === EL.chart.attach);
    await press(page.locator('[data-testid="slides-recent"]'));
    check("a new account's history is empty, and says so", (await page.locator('[data-testid="tool-shell-work"]').innerText()).includes(EL.history.empty));
    await press(page.locator('[data-testid="tool-shell-close"]:visible, [data-testid="tool-shell-back"]:visible').first());

    const uploadsBefore = asked.uploads;
    await giveFile(page, press, { name: "πωλήσεις.xlsx", mimeType: XLSX_TYPE, buffer: SALES_EL });
    const chip = page.locator('[data-testid="slides-data-chip"]');
    await page.locator('[data-testid="slides-data-chip"][data-state="ready"]').waitFor({ timeout: 20_000 });
    check("the file is read at once, by the upload route", asked.uploads === uploadsBefore + 1 && store.data_analyses.at(-1)?.file_name === "πωλήσεις.xlsx");
    check(`...and the chip says how many rows it has («${plural(EL.chart.ready, 6)}»)`, (await chip.innerText()).includes(plural(EL.chart.ready, 6)), await chip.innerText());
    const dataId = store.data_analyses.at(-1).id;

    const modelBefore = modelAsked.length;
    await say(page, press, "Παρουσίαση για τις πωλήσεις μας στα νησιά, για τη συνάντηση της Δευτέρας");
    await page.locator('[data-testid="slide-chart"]').first().waitFor({ timeout: 60_000 });
    const sent = asked.generate.at(-1) ?? {};
    check("the brief went with the file's id", sent.dataId === dataId, JSON.stringify(sent));
    const toModel = JSON.stringify(modelAsked[modelBefore]?.messages ?? []);
    check("the model was shown the charts, computed from the file, inside the untrusted block", modelAsked.length === modelBefore + 1 && /CHARTS \(computed/.test(toModel) && toModel.includes("Νάξος: 2700.8") && toModel.indexOf("CHARTS (computed") > toModel.indexOf("<<<UNTRUSTED_SOURCE_MATERIAL>>>") && toModel.indexOf("CHARTS (computed") < toModel.indexOf("<<<END_UNTRUSTED_SOURCE_MATERIAL>>>"));
    const row = store.ai_presentations.at(-1);
    const stored = row?.slides?.slides?.find((s) => s.chart);
    check("the stored deck carries the chart with the file's sums, not the model's", stored && JSON.stringify(stored.chart.points.map((p) => [p.label, p.value])) === JSON.stringify(ISLANDS), JSON.stringify(stored?.chart?.points));
    const figure = page.locator('[data-testid="slide-chart"]').first();
    check("the chart slide is on the screen, drawn as bars", (await figure.getAttribute("data-kind")) === "bar" && (await figure.locator("rect").count()) === 3);
    const values = await figure.locator('[data-testid="slide-chart-values"]').innerText();
    check("...with every island and its value, as Greek writes numbers", ["Νάξος", "2.700,8", "Πάρος", "1.750", "Σύρος", "300"].every((s) => values.includes(s)), values);
    const caption = await figure.locator('[data-testid="slide-chart-source"]').innerText();
    const how = fill(EL.chart.how.sum, { y: "Έσοδα", x: "Νησί" });
    check("...and where they came from: the file, its rows, the arithmetic", caption.includes(fill(EL.chart.source, { file: "πωλήσεις.xlsx", rows: 6, how })), caption);
    check("...with the file one press away in Analyze", (await figure.locator("a").getAttribute("href")) === `/dashboard/data-analysis?id=${dataId}`);
    check("the chip is gone: the next deck starts without the file", (await page.locator('[data-testid="slides-data-chip"]').count()) === 0);

    // ---- the chart slide changed with words, as a box: the words change,
    // the file's numbers stay.
    await press(page.locator('[data-testid="slide-box"]').nth(1));
    const editsBefore = modelAsked.length;
    await say(page, press, "πιο σύντομος τίτλος");
    await page.getByText("Πρώτη η Νάξος").first().waitFor({ timeout: 60_000 });
    const editAsked = JSON.stringify(modelAsked[editsBefore]?.messages ?? []);
    check("an edit of the chart slide shows the model the deck's chart by its number", /chart: 1/.test(editAsked) && editAsked.includes("Νάξος: 2700.8"));
    const after = store.ai_presentations.at(-1)?.slides?.slides?.[1];
    check("...and the slide changed its words and kept the file's numbers", after?.title === "Πρώτη η Νάξος" && JSON.stringify(after?.chart?.points.map((p) => [p.label, p.value])) === JSON.stringify(ISLANDS), JSON.stringify(after));
    if (device.touch) await press(page.locator('[data-testid="tool-shell-card"]').last());
    if (device.touch) {
      check("on the phone the deck covers the conversation, and goes back with one press", (await page.locator('[data-testid="tool-shell-back"]').isVisible()));
    }

    // ---- the PowerPoint, downloaded, then opened by Impress
    const [pptxDownload] = await Promise.all([page.waitForEvent("download", { timeout: 30_000 }), press(page.locator('[data-testid="slides-pptx"]'))]);
    const pptx = readFileSync(await pptxDownload.path());
    check(`the PowerPoint downloads (${pptx.length} bytes, ${pptxDownload.suggestedFilename()})`, pptx[0] === 0x50 && pptx[1] === 0x4b && /\.pptx$/.test(pptxDownload.suggestedFilename()));
    const zip = await JSZip.loadAsync(pptx);
    const chartXml = await zip.file(Object.keys(zip.files).find((n) => /^ppt\/charts\/chart\d+\.xml$/.test(n)) ?? "nothing")?.async("string");
    check("...with a native bar chart of the file's numbers", Boolean(chartXml) && /<c:barChart>/.test(chartXml) && ISLANDS.every(([label, value]) => chartXml.includes(`<c:v>${label}</c:v>`) && chartXml.includes(`<c:v>${value}</c:v>`)));
    if (!firstPptx) firstPptx = pptx;

    // ---- the PDF
    const [pdfDownload] = await Promise.all([page.waitForEvent("download", { timeout: 30_000 }), press(page.locator('[data-testid="tool-shell-work"] button').filter({ hasText: EL.result.exportPdf }).first())]);
    const pdf = readFileSync(await pdfDownload.path());
    const pdfText = extractPdfText(pdf).pages.map((p) => p.text).join("\n").replace(/\s+/g, "");
    check("the PDF downloads, and its chart page says every value and where it came from", pdf.subarray(0, 4).toString() === "%PDF" && ["Νάξος:2.700,8", "Πάρος:1.750", "Σύρος:300", "Απότοπωλήσεις.xlsx(6γραμμές)"].every((s) => pdfText.includes(s)), pdfText.slice(0, 300));
    check(`no page threw (${pageErrors.length})`, pageErrors.length === 0, pageErrors.slice(0, 3).join(" | "));
    await context.close();
  }

  console.log("\n== the PowerPoint, opened by LibreOffice Impress ==");
  {
    const impress = await openInImpress(firstPptx);
    check("Impress opens the file", impress.ok, impress.why);
    if (impress.ok) {
      const bar = impress.charts.find((c) => c.kind === "bar");
      check(`...and reads one chart in it, a bar chart (${impress.charts.map((c) => c.kind).join(", ")})`, impress.charts.length === 1 && Boolean(bar));
      check("...whose data are the file's sums, under the file's names", bar && JSON.stringify(bar.cells) === JSON.stringify(ISLANDS.map(([, v]) => v)) && ISLANDS.every(([label]) => bar.text.includes(label)), JSON.stringify(bar));
      check(`...and lays it out as a three-slide deck (${impress.pages} pages)`, impress.pdfOk && impress.pages === 3);
    }
  }

  console.log("\n== in English, desktop ==");
  {
    store.ai_presentations.length = 0;
    const { context, page, press } = await open(ON, { viewport: { width: 1440, height: 900 }, touch: false }, "en");
    await page.goto(`${ON}/dashboard/presentations`, { waitUntil: "networkidle" });
    await giveFile(page, press, { name: "sales.xlsx", mimeType: XLSX_TYPE, buffer: SALES_EN });
    await page.locator('[data-testid="slides-data-chip"][data-state="ready"]').waitFor({ timeout: 20_000 });
    check(`the chip is in English («${plural(EN.chart.ready, 6)}»)`, (await page.locator('[data-testid="slides-data-chip"]').innerText()).includes(plural(EN.chart.ready, 6)));
    await say(page, press, "A deck about our sales on the islands, for Monday's meeting");
    await page.locator('[data-testid="slide-chart"]').first().waitFor({ timeout: 60_000 });
    const figure = page.locator('[data-testid="slide-chart"]').first();
    const values = await figure.locator('[data-testid="slide-chart-values"]').innerText();
    check("the values read as English writes numbers", ["Naxos", "2,700.8", "Paros", "1,750"].every((s) => values.includes(s)), values);
    const caption = await figure.locator('[data-testid="slide-chart-source"]').innerText();
    check("...and the source in English", caption.includes(fill(EN.chart.source, { file: "sales.xlsx", rows: 6, how: fill(EN.chart.how.sum, { y: "Revenue", x: "Island" }) })), caption);
    const body = await page.locator("main").innerText();
    check("no Greek on the English screen", !/[Ͱ-Ͽ]/.test(body), body.match(/.{0,30}[Ͱ-Ͽ].{0,30}/)?.[0]);
    check(`no page threw (${pageErrors.length})`, pageErrors.length === 0, pageErrors.slice(0, 3).join(" | "));
    await context.close();
  }

  console.log("\n== around it: nothing to draw, not a spreadsheet, the provider down ==");
  {
    const { context, page, press } = await open(ON, { viewport: { width: 390, height: 844 }, touch: true });
    const decksMade = () => store.ai_presentations.filter((r) => r.slides).length;
    const madeBefore = decksMade();
    await page.goto(`${ON}/dashboard/presentations`, { waitUntil: "networkidle" });
    await giveFile(page, press, { name: "σημειώσεις.docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", buffer: Buffer.from("x") });
    const uploadsBefore = asked.uploads;
    await page.locator('[data-testid="slides-data-chip"][data-state="failed"]').waitFor({ timeout: 10_000 });
    check("a file that is not a spreadsheet says so, and is not sent anywhere", (await page.locator('[data-testid="slides-data-chip"]').innerText()).includes(EL.chart.failed.type) && asked.uploads === uploadsBefore);
    await press(page.locator('[data-testid="slides-data-remove"]'));
    check("...and is taken away with one press", (await page.locator('[data-testid="slides-data-chip"]').count()) === 0);

    await giveFile(page, press, { name: "πελάτες.csv", mimeType: "text/csv", buffer: Buffer.from("Όνομα,Email\nΆννα,a@x.gr\nΒασίλης,b@x.gr\nΓιώργος,c@x.gr\n") });
    await page.locator('[data-testid="slides-data-chip"][data-state="ready"]').waitFor({ timeout: 20_000 });
    const modelBefore = modelAsked.length;
    const decksBefore = store.ai_presentations.length;
    await say(page, press, "Παρουσίαση για τους πελάτες μας και τι θέλουν");
    await page.getByText(EL.chart.noData).waitFor({ timeout: 30_000 });
    check("a file with nothing to draw is refused in words, before the model is asked", modelAsked.length === modelBefore && store.ai_presentations.length === decksBefore);

    await press(page.locator('[data-testid="slides-data-remove"]'));
    await giveFile(page, press, { name: "πωλήσεις.xlsx", mimeType: XLSX_TYPE, buffer: SALES_EL });
    await page.locator('[data-testid="slides-data-chip"][data-state="ready"]').waitFor({ timeout: 20_000 });
    await say(page, press, "Παρουσίαση για τις πωλήσεις — ΣΦΑΛΜΑ ΠΑΡΟΧΟΥ");
    await page.getByText(EL.errors.unavailable).waitFor({ timeout: 90_000 });
    check("the provider down: said, and no deck saved", decksMade() === madeBefore);
    check(`no page threw (${pageErrors.length})`, pageErrors.length === 0, pageErrors.slice(0, 3).join(" | "));
    await context.close();
  }

  console.log("\n== an ordinary account: no credits left, then a Free plan ==");
  {
    credits[0].credits_remaining = 0;
    const { context, page, press } = await open(CHARGED, { viewport: { width: 1440, height: 900 }, touch: false });
    await page.goto(`${CHARGED}/dashboard/presentations`, { waitUntil: "networkidle" });
    await giveFile(page, press, { name: "πωλήσεις.xlsx", mimeType: XLSX_TYPE, buffer: SALES_EL });
    await page.locator('[data-testid="slides-data-chip"][data-state="ready"]').waitFor({ timeout: 20_000 });
    const modelBefore = modelAsked.length;
    await say(page, press, "Παρουσίαση για τις πωλήσεις μας στα νησιά");
    await page.getByText(EL.errors.insufficient).waitFor({ timeout: 30_000 });
    check("no credits left: said before the model is asked", modelAsked.length === modelBefore);
    credits[0].credits_remaining = 3000;

    MOCK_USER.user_metadata = { subscription_tier: "free" };
    await page.goto(`${CHARGED}/dashboard/presentations`, { waitUntil: "networkidle" });
    check("a Free account sees the plan Slides is on, not a field that would be refused", (await page.locator('[data-testid="tool-shell"]').count()) === 0 && (await page.locator('[data-testid="composer-attach"]').count()) === 0);
    const refused = await page.request.post(`${CHARGED}/api/presentations/generate`, { data: { description: "Παρουσίαση για τις πωλήσεις", dataId: store.data_analyses.at(-1).id } });
    check("...and the route refuses it, whatever is sent", refused.status() === 403 && (await refused.json()).code === "not_included");
    MOCK_USER.user_metadata = { subscription_tier: "growth" };
    await context.close();
  }

  console.log("\n== the switch off, desktop ==");
  {
    setFlags({ "slides-charts": "off" });
    const { context, page } = await open(ON, { viewport: { width: 1440, height: 900 }, touch: false });
    await page.goto(`${ON}/dashboard/presentations`, { waitUntil: "networkidle" });
    check("with the switch off Slides has no «+» for a file", (await page.locator('[data-testid="tool-shell"]').count()) === 1 && (await page.locator('[data-testid="composer-attach"]').count()) === 0);
    const refused = await page.request.post(`${ON}/api/presentations/generate`, { data: { description: "Παρουσίαση για τις πωλήσεις", dataId: store.data_analyses.at(-1).id } });
    check("...and the route refuses a file", refused.status() === 403 && (await refused.json()).error === "not_enabled");
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
