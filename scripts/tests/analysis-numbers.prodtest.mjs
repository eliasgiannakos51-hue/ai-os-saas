/*
 * ANALYZE WITH EXCEL: A CHART, AN EXPLANATION, AND HOW EVERY NUMBER WAS
 * MADE — IN THE BUILT APP (MASTER 16, package 16).
 *
 * Run: node scripts/tests/analysis-numbers.prodtest.mjs
 *      SKIP_BUILD=1 node scripts/tests/analysis-numbers.prodtest.mjs
 *
 * One production build, the real routes: a real .xlsx is uploaded through
 * Analyze's own option (api/data-analysis/upload), «Find patterns» asks the
 * model (api/data-analysis/[id]/analyse), and the page draws what was
 * found. The model is a local server answering as Anthropic does
 * (ANTHROPIC_BASE_URL): it reads the FACTS the brief now carries and
 * answers with their references — and with one typed number that is no
 * fact, which must not reach the screen. The database is the stand-in.
 *
 * Every number checked here is checked against the arithmetic done in this
 * file over the same rows, not against what the page says about itself.
 *
 * BOTH DEVICES: 1440x900 with a mouse, 390x844 with touch. Greek, then
 * English on a computer. Around it: the provider down, no credits left, a
 * Free account, the switch off.
 */
import http from "node:http";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { chromium } from "playwright";
import { startMockSupabase, MOCK_USER } from "../lib/mock-supabase.mjs";

const require = createRequire(import.meta.url);
const JSZip = require("jszip");

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

/** A real .xlsx: shared strings, a styled date column, numbers. */
async function workbook(header, rows) {
  const zip = new JSZip();
  const strings = [];
  const sid = (s) => { const i = strings.indexOf(s); if (i >= 0) return i; strings.push(s); return strings.length - 1; };
  const col = (i) => String.fromCharCode(65 + i);
  const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");
  const cell = (v, r, c) => {
    const ref = `${col(c)}${r}`;
    if (v && typeof v === "object" && "date" in v) return `<c r="${ref}" s="1"><v>${v.date}</v></c>`;
    if (typeof v === "number") return `<c r="${ref}"><v>${v}</v></c>`;
    return `<c r="${ref}" t="s"><v>${sid(v)}</v></c>`;
  };
  const sheetRows = [header, ...rows].map((row, i) => `<row r="${i + 1}">${row.map((v, c) => cell(v, i + 1, c)).join("")}</row>`).join("");
  zip.file("[Content_Types].xml", `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/></Types>`);
  zip.file("xl/workbook.xml", `<?xml version="1.0"?><workbook><sheets><sheet name="Πωλήσεις" sheetId="1" r:id="rId1"/></sheets></workbook>`);
  zip.file("xl/_rels/workbook.xml.rels", `<?xml version="1.0"?><Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>`);
  zip.file("xl/styles.xml", `<?xml version="1.0"?><styleSheet><cellXfs count="2"><xf numFmtId="0"/><xf numFmtId="14"/></cellXfs></styleSheet>`);
  zip.file("xl/worksheets/sheet1.xml", `<?xml version="1.0"?><worksheet><sheetData>${sheetRows}</sheetData></worksheet>`);
  zip.file("xl/sharedStrings.xml", `<?xml version="1.0"?><sst>${strings.map((s) => `<si><t>${esc(s)}</t></si>`).join("")}</sst>`);
  return Buffer.from(await zip.generateAsync({ type: "nodebuffer" }));
}
// Excel serials: 45658 is 2025-01-01, 45689 is 2025-02-01, 45717 is 2025-03-01.
const SALES = [
  [{ date: 45658 }, "Νάξος", 1200, 14],
  [{ date: 45658 }, "Πάρος", 800, 9],
  [{ date: 45689 }, "Νάξος", 1500.5, 17],
  [{ date: 45689 }, "Σύρος", 300, 4],
  [{ date: 45717 }, "Πάρος", 950, 11],
  [{ date: 45717 }, "Νάξος", 0.1, 1],
];
const XLSX = await workbook(["Μήνας", "Νησί", "Έσοδα", "Παραγγελίες"], SALES);
// The arithmetic, here: what the screen must show.
const SUM = SALES.reduce((s, r) => s + r[2], 0); // 4750.6
const MEAN = SUM / SALES.length;
const BY_ISLAND = {};
for (const r of SALES) BY_ISLAND[r[1]] = { sum: (BY_ISLAND[r[1]]?.sum ?? 0) + r[2], rows: (BY_ISLAND[r[1]]?.rows ?? 0) + 1 };

// ---------------------------------------------------------------------
// The tables Analyze writes and reads, kept as rows.
// ---------------------------------------------------------------------
const STATEFUL = ["data_analyses", "data_analysis_charts"];
const store = Object.fromEntries(STATEFUL.map((t) => [t, []]));
let seq = 0;
const uuid = () => `${String(++seq).padStart(8, "0")}-0000-4000-8000-0000000000a6`;
function matches(row, url) {
  for (const [key, raw] of url.searchParams) {
    if (["select", "order", "limit", "offset", "on_conflict", "columns"].includes(key)) continue;
    const [op, ...rest] = raw.split(".");
    if (op === "eq" && String(row[key]) !== rest.join(".")) return false;
  }
  return true;
}
const reserved = [];
function rest({ req, url, body, json }) {
  const table = url.pathname.replace(/^\/rest\/v1\//, "");
  if (table === "rpc/consume_rate_limit") return json(200, true), true;
  // A HOLD, as the database makes it: granted while the balance covers it.
  if (table === "rpc/reserve_credits") {
    const args = JSON.parse(body || "{}");
    const enough = credits[0].credits_remaining >= Number(args.p_credits ?? 0);
    if (enough) reserved.push(args);
    return json(200, enough ? [{ reservation_id: uuid(), available: credits[0].credits_remaining }] : []), true;
  }
  if (!STATEFUL.includes(table)) return false;
  const rows = store[table];
  const hit = rows.filter((r) => matches(r, url));
  const single = (req.headers.accept ?? "").includes("vnd.pgrst.object");
  const answer = (list) => (single ? (list[0] ? json(200, list[0]) : json(406, { message: "no rows" })) : json(200, list));
  if (req.method === "GET" || req.method === "HEAD") return answer([...hit].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))), true;
  if (req.method === "POST") {
    const input = JSON.parse(body || "[]");
    const made = (Array.isArray(input) ? input : [input]).map((r) => ({ id: uuid(), created_at: new Date(Date.now() + seq).toISOString(), ...r }));
    rows.push(...made);
    return answer(made), true;
  }
  if (req.method === "PATCH") {
    for (const r of hit) Object.assign(r, JSON.parse(body || "{}"));
    return answer(hit), true;
  }
  return false;
}
const flags = [];
const credits = [{ user_id: MOCK_USER.id, credits_remaining: 3000, credits_total: 3000 }];
MOCK_USER.user_metadata = { subscription_tier: "growth" };
const supa = await startMockSupabase({ port: 54403, tableRows: { feature_flags: flags, user_credits: credits }, handle: rest });
const setFlags = (audiences) => flags.splice(0, flags.length, ...Object.entries(audiences).map(([key, audience]) => ({ key, audience })));

// ---------------------------------------------------------------------
// The model: it reads the facts it was given and cites them.
// ---------------------------------------------------------------------
const modelAsked = [];
const model = http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    const sent = JSON.parse(body || "{}");
    modelAsked.push(sent);
    const brief = JSON.stringify(sent.messages ?? []);
    if (/ΣΦΑΛΜΑ/.test(JSON.stringify(sent))) {
      res.writeHead(529, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ type: "error", error: { type: "overloaded_error", message: "Overloaded" } }));
    }
    const id = (re) => (brief.match(re) ?? [])[1];
    const sum = id(/\[(F\d+)\] sum of \\"Έσοδα\\"/);
    const mean = id(/\[(F\d+)\] mean of \\"Έσοδα\\"/);
    const naxos = id(/\[(F\d+)\] rows where \\"Νησί\\" is \\"Νάξος\\"/);
    const withFacts = Boolean(sum && mean && naxos);
    const reply = withFacts
      ? {
          summary: `Πωλήσεις έξι μηνών σε τρία νησιά, έσοδα {${sum}} συνολικά.`,
          findings: [
            { headline: `Η Νάξος έχει τις περισσότερες γραμμές ({${naxos}})`, detail: `Ο μέσος όρος εσόδων είναι {${mean}}· το μεγαλύτερο ποσό είναι 1500.5.`, columns: ["Έσοδα", "Νησί"] },
            { headline: "Τα έσοδα ανέβηκαν 37%", detail: "Από μήνα σε μήνα.", columns: ["Έσοδα"] },
          ],
          charts: [{ kind: "bar", title: "Έσοδα ανά νησί", x: "Νησί", y: "Έσοδα", aggregation: "sum", reason: "πού είναι τα έσοδα" }],
          suggestedQuestions: [],
        }
      : {
          summary: "Πωλήσεις σε τρία νησιά, έσοδα περίπου 4751.",
          findings: [{ headline: "Η Νάξος έχει τις περισσότερες γραμμές", detail: "Μέσος όρος 791.77.", columns: ["Έσοδα", "Νησί"] }],
          charts: [],
          suggestedQuestions: [],
        };
    res.writeHead(200, { "Content-Type": "application/json", "request-id": "req_test" });
    res.end(JSON.stringify({ id: "msg", type: "message", role: "assistant", model: "claude-sonnet-4-6", content: [{ type: "text", text: JSON.stringify(reply) }], stop_reason: "end_turn", usage: { input_tokens: 1500, output_tokens: 400 } }));
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
  GROQ_API_KEY: "",
  ANTHROPIC_API_KEY: "placeholder-answered-locally",
  ANTHROPIC_BASE_URL: `http://127.0.0.1:${model.address().port}`,
};
const msgs = (loc) => JSON.parse(readFileSync(`messages/${loc}.json`, "utf8"));
const EL = msgs("el");
const EN = msgs("en");
const fill = (s, vars) => s.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ""));
const elNumber = (v) => new Intl.NumberFormat("el", { maximumFractionDigits: 2 }).format(v);
const enNumber = (v) => new Intl.NumberFormat("en", { maximumFractionDigits: 2 }).format(v);

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
async function open(origin, device, locale = "el") {
  const context = await browser.newContext({ viewport: device.viewport, hasTouch: device.touch, isMobile: device.touch });
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
/** The file's pane: open beside the conversation on a computer, behind its card on a phone. */
async function showFile(page, press) {
  if ((await page.locator('[data-testid="analysis-file"]').count()) === 0) await press(page.locator('[data-testid="tool-shell-card"]').first());
  await page.locator('[data-testid="analysis-file"]').waitFor({ timeout: 15_000 });
}
async function uploadAndAnalyse(origin, page, press, M) {
  await page.goto(`${origin}/dashboard/data-analysis`, { waitUntil: "networkidle" });
  await page.locator('[data-testid="analysis-upload-input"]').setInputFiles([{ name: "πωλήσεις.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer: XLSX }]);
  await page.waitForURL(/\?id=/, { timeout: 30_000 });
  await page.waitForLoadState("networkidle");
  const asked = modelAsked.length;
  const answered = page.waitForResponse((r) => /\/api\/data-analysis\/[^/]+\/analyse$/.test(r.url()), { timeout: 60_000 });
  await press(page.locator('[data-testid="analysis-analyse"]'));
  const response = await answered;
  if (!response.ok()) throw new Error(`the analysis was refused: ${response.status()} ${await response.text()}`);
  await page.getByText(M.dataAnalysis.analyse.done).first().waitFor({ timeout: 60_000 });
  return asked;
}
/** The findings, once the page has drawn them again. */
async function findingsDrawn(page) {
  await page.locator('[data-testid="analysis-finding"]').first().waitFor({ timeout: 30_000 });
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

  for (const device of [
    { label: "desktop", viewport: { width: 1440, height: 900 }, touch: false },
    { label: "phone", viewport: { width: 390, height: 844 }, touch: true },
  ]) {
    console.log(`\n== ${device.label}: an Excel in, a chart and an explanation out, every number with how it was made ==`);
    setFlags({});
    const { context, page, press } = await open(ON, device);
    const asked = await uploadAndAnalyse(ON, page, press, EL);
    const sent = modelAsked[asked];
    const brief = JSON.stringify(sent?.messages ?? []);
    check("the model was given the facts, by id, and told to cite them", modelAsked.length === asked + 1 && /FACTS \(every number you may use/.test(brief) && /\[F\d+\] sum of \\"Έσοδα\\" = 4751 \(6 rows\)/.test(brief) && /never type the digits yourself/.test(brief));
    check("...and never the rows beyond the sample", !/0\.1 \| 1\b.*0\.1 \| 1\b/.test(brief));
    await showFile(page, press);
    await findingsDrawn(page);
    const file = page.locator('[data-testid="analysis-file"]');
    const findings = page.locator('[data-testid="analysis-finding"]');
    check(`the finding whose numbers are facts is shown, the typed «37%» one is not (${await findings.count()})`, (await findings.count()) === 1 && !(await file.innerText()).includes("37%"));
    check("...and it is said that one was left out", (await page.getByText(fill(EL.dataAnalysis.how.dropped, { count: 1 })).count()) >= 1);
    const facts = page.locator('[data-testid="fact"]');
    const values = await facts.allInnerTexts();
    check(`every number is a fact computed here: ${values.join(" · ")}`, values.includes(elNumber(SUM)) && values.includes(elNumber(MEAN)) && values.includes(elNumber(1500.5)) && values.includes("3"), values.join(" | "));
    // Press the sum: what it is, and over how many rows.
    await press(facts.filter({ hasText: elNumber(SUM) }).first());
    const how = page.locator('[data-testid="fact-how"]').first();
    await how.waitFor({ timeout: 5000 });
    check("pressing the sum says what it is and from how many rows", (await how.innerText()).includes(fill(EL.dataAnalysis.how.sum, { column: "Έσοδα", rows: 6 })), await how.innerText());
    // The largest, typed by the model, became the fact it is.
    await press(facts.filter({ hasText: elNumber(1500.5) }).first());
    check("a number the model typed is the computed largest «Έσοδα», and says so", (await page.locator('[data-testid="fact-how"]').allInnerTexts()).some((t) => t.includes(fill(EL.dataAnalysis.how.max, { column: "Έσοδα", rows: 6 }))));
    // Every fact used, listed.
    await press(page.locator('[data-testid="analysis-how"] summary'));
    const listed = await page.locator('[data-testid="analysis-how-fact"]').allInnerTexts();
    check(`every fact used is listed under «${EL.dataAnalysis.how.title}» (${listed.length})`, listed.length === 4 && listed.some((l) => l.includes(fill(EL.dataAnalysis.how.topCount, { column: "Νησί", label: "Νάξος", rows: 6 }))), listed.join(" | "));
    // The chart: how each value was made, with its rows.
    const chartHow = page.locator('[data-testid="chart-how"]').filter({ hasText: fill(EL.dataAnalysis.how.chart.sum, { x: "Νησί", y: "Έσοδα" }) }).first();
    await press(chartHow.locator("summary"));
    const rowsShown = await chartHow.locator('[data-testid="chart-how-row"]').allInnerTexts();
    const wrong = Object.entries(BY_ISLAND).filter(([island, { sum, rows }]) => !rowsShown.some((r) => r.includes(island) && r.includes(elNumber(sum)) && r.includes(fill(EL.dataAnalysis.how.point, { rows }))));
    check(`every bar says its value and its rows, as computed here (${rowsShown.length})`, rowsShown.length === 3 && wrong.length === 0, rowsShown.join(" | "));
    check("the findings were saved with their facts", store.data_analyses.at(-1)?.findings?.facts?.length === 4 && store.data_analyses.at(-1).findings.findings[0].detailParts.some((p) => p.fact));
    check(`no page threw (${pageErrors.length})`, pageErrors.length === 0, pageErrors.slice(0, 3).join(" | "));
    await context.close();
  }

  console.log("\n== in English, desktop ==");
  {
    const { context, page, press } = await open(ON, { viewport: { width: 1440, height: 900 }, touch: false }, "en");
    await uploadAndAnalyse(ON, page, press, EN);
    await showFile(page, press);
    await findingsDrawn(page);
    const values = await page.locator('[data-testid="fact"]').allInnerTexts();
    check("the numbers are written as English writes them", values.includes(enNumber(SUM)) && values.includes(enNumber(1500.5)), values.join(" | "));
    await press(page.locator('[data-testid="fact"]').filter({ hasText: enNumber(MEAN) }).first());
    check("...and explained in English", (await page.locator('[data-testid="fact-how"]').first().innerText()).includes(fill(EN.dataAnalysis.how.mean, { column: "Έσοδα", rows: 6 })));
    check(`no page threw (${pageErrors.length})`, pageErrors.length === 0, pageErrors.slice(0, 3).join(" | "));
    await context.close();
  }

  console.log("\n== around it: the provider down, no credits, a Free account ==");
  {
    const { context, page, press } = await open(ON, { viewport: { width: 390, height: 844 }, touch: true });
    await page.goto(`${ON}/dashboard/data-analysis`, { waitUntil: "networkidle" });
    await page.locator('[data-testid="analysis-upload-input"]').setInputFiles([{ name: "ΣΦΑΛΜΑ.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer: XLSX }]);
    await page.waitForURL(/\?id=/, { timeout: 30_000 });
    await page.waitForLoadState("networkidle");
    await press(page.locator('[data-testid="analysis-analyse"]'));
    await page.getByText(EL.dataAnalysis.analyse.unavailable).first().waitFor({ timeout: 90_000 });
    check("the provider down: said, and nothing found is saved", !store.data_analyses.at(-1).findings);
    await context.close();

    credits[0].credits_remaining = 0;
    const charged = await open(CHARGED, { viewport: { width: 1440, height: 900 }, touch: false });
    await charged.page.goto(`${CHARGED}/dashboard/data-analysis?id=${store.data_analyses.at(-1).id}`, { waitUntil: "networkidle" });
    const before = modelAsked.length;
    await charged.press(charged.page.locator('[data-testid="analysis-analyse"]'));
    await charged.page.getByText(EL.dataAnalysis.analyse.failed).first().waitFor({ timeout: 30_000 });
    check("no credits left: refused before the model is asked", modelAsked.length === before);
    credits[0].credits_remaining = 3000;
    MOCK_USER.user_metadata = { subscription_tier: "free" };
    const holds = reserved.length;
    const asked = await uploadAndAnalyse(CHARGED, charged.page, charged.press, EL);
    await showFile(charged.page, charged.press);
    await findingsDrawn(charged.page);
    check("a Free account has Analyze, with every number's making", modelAsked.length === asked + 1 && (await charged.page.locator('[data-testid="fact"]').count()) >= 3);
    check("...and is held credits for it first, the facts included in the hold", reserved.length === holds + 1 && Number(reserved.at(-1).p_credits) > 0);
    MOCK_USER.user_metadata = { subscription_tier: "growth" };
    await charged.context.close();
  }

  console.log("\n== the switch off, desktop ==");
  {
    setFlags({ "analysis-provenance": "off" });
    const { context, page, press } = await open(ON, { viewport: { width: 1440, height: 900 }, touch: false });
    const asked = await uploadAndAnalyse(ON, page, press, EL);
    await showFile(page, press);
    await findingsDrawn(page);
    check("the model is sent no facts", !/FACTS \(every number/.test(JSON.stringify(modelAsked[asked]?.messages ?? [])) && !/never type the digits/.test(JSON.stringify(modelAsked[asked]?.messages ?? [])));
    check("...and the page is Analyze as it was: no pressable numbers, no «how» lists", (await page.locator('[data-testid="fact"], [data-testid="analysis-how"], [data-testid="chart-how"]').count()) === 0 && (await page.locator('[data-testid="analysis-finding"]').count()) === 1);
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
