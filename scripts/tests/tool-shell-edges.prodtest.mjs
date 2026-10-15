/*
 * THE SHELL AT ITS EDGES, IN THE BUILT APP (packages 3 and 4, checked
 * 2026-10-08).
 *
 * Run: node scripts/tests/tool-shell-edges.prodtest.mjs
 *      SKIP_BUILD=1 node scripts/tests/tool-shell-edges.prodtest.mjs
 *
 * scripts/tests/tool-shell.prodtest.mjs walks the six tools when
 * everything goes right. This walks them where a real account meets them
 * first or worst, on a computer with a mouse and a phone with a finger,
 * in Greek and in English:
 *
 *   EMPTY      a new account with nothing made yet: every tool is the
 *              shell, named in the screen's language, with one field and
 *              at most four options, and what was made before says it is
 *              empty instead of drawing nothing.
 *   CREDITS    the balance is 0, and the REAL routes refuse: the
 *              conversation says it is the credits, in the screen's
 *              language.
 *   PROVIDER   the model answers 529 overloaded_error, in the shape the
 *              Anthropic API answers it, from a local stand-in that the
 *              REAL routes call (ANTHROPIC_BASE_URL, which the SDK reads).
 *              The two that run in a background worker (a site being
 *              built, a question asked of files) are answered by the
 *              browser with the row the worker writes on that failure.
 *              And a Research plan that the HOST answers (504, a text
 *              page) is the service, not the connection.
 *   BOXES     package 4 through the REAL edit routes: a slide, and a part
 *              of the site, are pressed; the model (answered locally)
 *              rewrites EVERYTHING it is sent, and what is saved and shown
 *              changed only in the box that was pressed.
 *   STOP       Stop pressed during a change to one slide stops it.
 *   CONNECTION a file sent to Files while the connection drops says so,
 *              under 4MB (through the app's route) and over it (storage
 *              alone).
 *   FREE       Site, Slides, Posts and Research are not on Free: the page
 *              says which plan has them, in the screen's language.
 *              Analyze and Files are, and are the shell.
 *   OLD PAGES  what only the old pages had, used through the shell (the
 *              owner's decision of 2026-10-09: with the switch on, no
 *              function is lost): a Files collection pressed and one saved
 *              through the REAL /api/files/collections; a Site photo given
 *              to the field, sent with a change through the REAL
 *              /api/websites/edit to the model, and with a new site to
 *              /api/websites/generate and its worker; a Site's versions,
 *              one shown read-only, and a published one put back through
 *              the REAL /api/published/[id]/rollback.
 *
 * On every screen: no English sentence on a Greek screen, no Greek on an
 * English one, no page error, no sideways scroll.
 *
 * Two servers from one build: the test account (charged, so the credit
 * refusals are the real ones) and the owner's account (not charged, so a
 * provider error is reached through the real route without the credit
 * machinery in front of it). Both read the same stand-in, whose rows this
 * file changes between phases.
 */
import http from "node:http";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { chromium } from "playwright";
import sharp from "sharp";
import IntlMessageFormat from "intl-messageformat";
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

// ---------------------------------------------------------------------
// The stand-in, with rows this file can change between phases.
// ---------------------------------------------------------------------
const ANALYSIS_ID = "33333333-3333-4333-8333-333333333333";
const FILE_ID = "55555555-5555-4555-8555-555555555555";
const SITE_ID = "77777777-7777-4777-8777-777777777777";
// The site is the person's own words, so it is in the screen's language:
// its headings are the names of its boxes.
const SITE_HTML = {
  el: "<!doctype html><html><head><title>Φούρνος</title></head><body><header><h1>Ο φούρνος της γειτονιάς</h1></header>" +
    "<section><h2>Πρωινό στο γραφείο σας</h2><p>Κάθε πρωί.</p></section><footer><p>Πάτρα</p></footer></body></html>",
  en: "<!doctype html><html><head><title>Bakery</title></head><body><header><h1>The corner bakery</h1></header>" +
    "<section><h2>Breakfast at your office</h2><p>Every morning.</p></section><footer><p>Patras</p></footer></body></html>",
};
const ROWS = {
  analysis: {
    data_analyses: [{
      id: ANALYSIS_ID, user_id: MOCK_USER.id, title: "sales.csv", file_name: "sales.csv",
      row_count: 3, truncated: false, ragged_rows: 0, created_at: "2026-10-07T08:00:00Z", analysed_at: null,
      headers: ["region", "amount"], rows: [["Athens", "10"], ["Patras", "4"], ["Athens", "6"]],
      profile: {
        rowCount: 3, duplicateRows: 0, correlations: [],
        columns: [
          { name: "region", index: 0, type: "text", filled: 3, missing: 0, unique: 2, topValues: [{ value: "Athens", count: 2 }, { value: "Patras", count: 1 }] },
          { name: "amount", index: 1, type: "number", filled: 3, missing: 0, unique: 3, topValues: [], numeric: { min: 4, max: 10, mean: 6.67, median: 6, sum: 20, stdDev: 2.5, outlierCount: 0 } },
        ],
      },
      findings: null,
    }],
  },
  file: {
    user_files: [{
      id: FILE_ID, user_id: MOCK_USER.id, filename: "contract.pdf", file_type: "pdf", storage_path: `${MOCK_USER.id}/contract.pdf`,
      size_bytes: 120000, page_count: 12, char_count: 30000, processing_status: "ready", error: null, uploaded_at: "2026-10-07T07:00:00Z",
      extracted_text: "Cancellation requires thirty days written notice.",
    }],
  },
  site: (locale) => ({
    user_websites: [{
      id: SITE_ID, user_id: MOCK_USER.id, name: "Bakery", html_content: SITE_HTML[locale], status: "completed", error_message: null,
      description: "A site for a bakery", reference_image_url: null, has_reference_images: false, is_large_request: false,
      free_retry_used: false, created_at: "2026-10-07T10:00:00Z", pages: null, generation_notes: null, editing_started_at: null,
    }],
  }),
};
const state = { credits: 3000, rows: {} };
// Every write the routes make, as Postgres would take it: a PATCH merges
// into the rows (one row per table here, so its filters select it), and
// is kept so a check can read what was SAVED.
const writes = [];
const bucket = new Map();
// The reference bucket a Site's photos go into from the browser
// (lib/website-builder/site-photos.ts) and /api/websites/edit reads back
// (lib/website-reference-image-server.ts): path -> { type, bytes }.
const photoBucket = new Map();
// The browser sends a photo as a multipart form (storage-js, a Blob body);
// the server sends its optimised copy as the bytes themselves.
function storedFile(req, raw) {
  const type = String(req.headers["content-type"] ?? "");
  const boundary = /boundary=(?:"([^"]+)"|([^;]+))/.exec(type);
  if (!boundary) return { type, bytes: raw };
  const marker = Buffer.from(`--${boundary[1] ?? boundary[2]}`);
  for (let at = raw.indexOf(marker); at >= 0; ) {
    const next = raw.indexOf(marker, at + marker.length);
    if (next < 0) break;
    const part = raw.subarray(at + marker.length + 2, next - 2);
    const split = part.indexOf("\r\n\r\n");
    const head = part.subarray(0, split).toString("utf8");
    if (/filename=/.test(head)) return { type: /content-type:\s*([^\r\n]+)/i.exec(head)?.[1] ?? "application/octet-stream", bytes: Buffer.from(part.subarray(split + 4)) };
    at = next;
  }
  return { type, bytes: raw };
}
// ROWS THE ROUTES WRITE and a later read must see: a collection and its
// files, a version a rollback appends.
const INSERTED = new Set(["file_collections", "file_collection_items", "site_versions"]);
// FILTERED where two rows must not both answer: a rollback reads ONE
// published version by its id, and the newest by order and limit.
function filtered(rows, params) {
  let out = rows;
  for (const [key, value] of params) if (value.startsWith("eq.")) out = out.filter((row) => String(row[key]) === value.slice(3));
  const order = params.get("order");
  if (order) {
    const [column, direction] = order.split(".");
    out = [...out].sort((a, b) => (direction === "desc" ? -1 : 1) * (a[column] > b[column] ? 1 : a[column] < b[column] ? -1 : 0));
  }
  const limit = Number(params.get("limit"));
  return limit > 0 ? out.slice(0, limit) : out;
}
const rowsOf = (table) => {
  if (table === "user_credits") return [{ user_id: MOCK_USER.id, credits_remaining: state.credits, credits_total: 3000, plan_tier: MOCK_USER.user_metadata?.subscription_tier ?? "free", beta_expires_at: null, min_pack_credit_price_eur: null }];
  if (table === "user_onboarding") return [{ user_id: MOCK_USER.id, completed_at: "2026-01-02T00:00:00Z", skipped_at: null }];
  return state.rows[table] ?? [];
};
const supa = await startMockSupabase({
  port: 54437,
  handle: ({ req, res, url, body, raw, json }) => {
    // The private bucket a file goes into from the browser, and is read
    // back from by /api/files/register.
    const object = url.pathname.match(/^\/storage\/v1\/object\/(?:authenticated\/)?user-files\/(.+)$/);
    if (object && (req.method === "POST" || req.method === "PUT")) {
      bucket.set(decodeURIComponent(object[1]), body);
      json(200, { Key: `user-files/${object[1]}` });
      return true;
    }
    if (object && req.method === "GET") {
      const bytes = bucket.get(decodeURIComponent(object[1]));
      if (bytes === undefined) json(404, { statusCode: "404", error: "not_found", message: "Object not found" });
      else {
        res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
        res.end(bytes);
      }
      return true;
    }
    if (url.pathname.startsWith("/storage/v1/object/user-files")) {
      json(200, []);
      return true;
    }
    const reference = url.pathname.match(/^\/storage\/v1\/object\/(?:authenticated\/|public\/)?website-references\/(.+)$/);
    if (reference && (req.method === "POST" || req.method === "PUT")) {
      photoBucket.set(decodeURIComponent(reference[1]), storedFile(req, raw));
      json(200, { Key: `website-references/${reference[1]}` });
      return true;
    }
    if (reference && (req.method === "GET" || req.method === "HEAD")) {
      const photo = photoBucket.get(decodeURIComponent(reference[1]));
      if (!photo) json(404, { statusCode: "404", error: "not_found", message: "Object not found" });
      else {
        res.writeHead(200, { "Content-Type": photo.type, "Content-Length": photo.bytes.length });
        res.end(req.method === "HEAD" ? undefined : photo.bytes);
      }
      return true;
    }
    if (url.pathname === "/storage/v1/object/list/website-references") {
      json(200, []);
      return true;
    }
    if (!url.pathname.startsWith("/rest/v1/")) return false;
    const table = url.pathname.slice("/rest/v1/".length).split("?")[0];
    if (req.method === "POST" && INSERTED.has(table)) {
      let given = [];
      try { given = [].concat(JSON.parse(body || "[]")); } catch {}
      const made = given.map((row) => ({ id: randomUUID(), created_at: new Date().toISOString(), ...row }));
      state.rows[table] = [...(state.rows[table] ?? []), ...made];
      for (const row of made) writes.push({ table, insert: row });
      if ((req.headers.accept ?? "").includes("vnd.pgrst.object")) json(201, made[0]);
      else json(201, made);
      return true;
    }
    if (req.method === "PATCH" && state.rows[table]) {
      let patch = {};
      try { patch = JSON.parse(body || "{}"); } catch {}
      writes.push({ table, patch });
      state.rows[table] = state.rows[table].map((row) => ({ ...row, ...patch }));
    }
    const rows = req.method === "GET" && table === "site_versions" ? filtered(rowsOf(table), url.searchParams) : rowsOf(table);
    if ((req.headers.prefer ?? "").includes("count=")) {
      res.writeHead(200, { "Content-Type": "application/json", "Content-Range": rows.length > 0 ? `0-${rows.length - 1}/${rows.length}` : "*/0" });
      res.end(JSON.stringify(req.method === "HEAD" ? null : rows));
      return true;
    }
    if ((req.headers.accept ?? "").includes("vnd.pgrst.object")) {
      if (rows[0]) json(200, rows[0]);
      else json(406, { message: "no rows" });
      return true;
    }
    json(200, rows);
    return true;
  },
});

// ---------------------------------------------------------------------
// The model, answered locally. "down": 529 overloaded_error, as
// api.anthropic.com answers it. "rewrite": the model that changes
// everything it is sent — every slide, every part of the page — so a box
// that stays a box is the routes' doing, not the model's restraint.
// ---------------------------------------------------------------------
const OVERLOADED = { type: "error", error: { type: "overloaded_error", message: "Overloaded" } };
const REWRITTEN = "ΞΑΝΑΓΡΑΜΜΕΝΟ";
let modelMode = "down";
let modelCalls = 0;
// How many requests reached the model with a photo in them.
let modelImages = 0;
const toolAnswer = (name, input) => ({ id: "msg_edges", type: "message", role: "assistant", model: "claude-sonnet-4-5", content: [{ type: "tool_use", id: "toolu_edges", name, input }], stop_reason: "tool_use", stop_sequence: null, usage: { input_tokens: 900, output_tokens: 300 } });
function streamText(res, text) {
  const sse = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", "request-id": "req_edges" });
  sse("message_start", { type: "message_start", message: { id: "msg_edges", type: "message", role: "assistant", model: "claude-sonnet-4-5", content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 900, output_tokens: 1 } } });
  sse("content_block_start", { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } });
  for (let i = 0; i < text.length; i += 400) sse("content_block_delta", { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: text.slice(i, i + 400) } });
  sse("content_block_stop", { type: "content_block_stop", index: 0 });
  sse("message_delta", { type: "message_delta", delta: { stop_reason: "end_turn", stop_sequence: null }, usage: { output_tokens: 400 } });
  sse("message_stop", { type: "message_stop" });
  res.end();
}
const model = http.createServer((req, res) => {
  let raw = "";
  req.on("data", (c) => (raw += c));
  req.on("end", () => {
    modelCalls++;
    if (/"type":"image"/.test(raw)) modelImages++;
    if (modelMode === "down") {
      res.writeHead(529, { "Content-Type": "application/json", "request-id": "req_edges", "x-should-retry": "false" });
      return res.end(JSON.stringify(OVERLOADED));
    }
    const asked = JSON.parse(raw || "{}");
    const said = JSON.stringify(asked.messages ?? []);
    const reply = (out) => { res.writeHead(200, { "Content-Type": "application/json", "request-id": "req_edges" }); res.end(JSON.stringify(out)); };
    const tool = asked.tool_choice?.name;
    if (tool === "write_deck") {
      return reply(toolAnswer("write_deck", {
        title: `${REWRITTEN} deck`,
        slides: [1, 2, 3].map((n) => ({ layout: "bullets", title: `${REWRITTEN} ${n}`, bullets: [`${REWRITTEN} point ${n}`], notes: "" })),
      }));
    }
    if (tool === "apply_website_edit") return reply(toolAnswer(tool, { isSimpleChange: false, findText: "", replaceText: "" }));
    if (tool === "review_content_safety") return reply(toolAnswer(tool, { isSafe: true, concerns: [] }));
    if (asked.stream) {
      // The page it was sent, with EVERY text in it rewritten and the
      // marked part still marked, as a model that ignored "only this" would.
      const sent = JSON.parse(said)?.[0]?.content;
      const text = typeof sent === "string" ? sent : JSON.stringify(sent);
      const page = text.slice(text.indexOf("<!doctype html>"), text.lastIndexOf("</html>") + "</html>".length);
      return streamText(res, page.replace(/>([^<>]+)</g, (_, t) => `>${REWRITTEN} ${t}<`));
    }
    reply({ id: "msg_edges", type: "message", role: "assistant", model: "claude-sonnet-4-5", content: [{ type: "text", text: "" }], stop_reason: "end_turn", stop_sequence: null, usage: { input_tokens: 10, output_tokens: 1 } });
  });
});
await new Promise((r) => model.listen(0, "127.0.0.1", r));
// What the SDK makes of that answer (APIError.makeMessage: status, then
// the body), which is what a worker stores when it writes err.message.
const SDK_MESSAGE = `529 ${JSON.stringify(OVERLOADED)}`;

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
  ANTHROPIC_API_KEY: "placeholder-answered-locally",
  ANTHROPIC_BASE_URL: `http://127.0.0.1:${model.address().port}`,
  ADMIN_EMAILS: "",
  TEST_ACCOUNT_EMAILS: "",
};

const fill = (s, vars = {}) => s.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ""));
const icu = (s, locale, vars) => String(new IntlMessageFormat(s, locale).format(vars));
// A real photograph, so the route's resize and its optimised copy (sharp)
// have something to read.
const PNG = await sharp({ create: { width: 48, height: 48, channels: 3, background: { r: 200, g: 90, b: 40 } } }).png().toBuffer();
const MESSAGES = {
  el: JSON.parse(readFileSync("messages/el.json", "utf8")),
  en: JSON.parse(readFileSync("messages/en.json", "utf8")),
};

// A SENTENCE IN THE OTHER LANGUAGE. On a Greek screen, three or more Latin
// words in a row (a name, a loanword or "PDF" alone is not a sentence); on
// an English one, any Greek letter.
function foreign(text, locale) {
  if (locale === "el") return text.match(/[A-Za-z][A-Za-z'’]*(?: [A-Za-z][A-Za-z'’]*){2,}/g) ?? [];
  return text.match(/[Ͱ-Ͽἀ-῿]+/g) ?? [];
}

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

const TOOLS = [
  { key: "site", path: "/dashboard/website-builder" },
  { key: "slides", path: "/dashboard/presentations" },
  { key: "posts", path: "/dashboard/posts" },
  { key: "research", path: "/dashboard/deep-research" },
  { key: "analyze", path: "/dashboard/data-analysis" },
  { key: "files", path: "/dashboard/files" },
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
  const TEST = await start({ ...base, TEST_ACCOUNT_EMAILS: MOCK_USER.email });
  const OWNER = await start({ ...base, ADMIN_EMAILS: MOCK_USER.email });
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium" });

  for (const device of [
    { label: "desktop", viewport: { width: 1440, height: 900 }, touch: false },
    { label: "phone", viewport: { width: 390, height: 844 }, touch: true },
  ]) {
    for (const locale of ["el", "en"]) {
      const M = MESSAGES[locale];
      const W = {
        names: M.dashboard.tools.names,
        back: M.dashboard.toolShell.back,
        insufficient: M.errors.codes.insufficientCredits.what,
        upstream: M.errors.codes.upstreamUnavailable.what,
      };
      const run = `${device.label} ${locale}`;
      console.log(`\n== ${run} (${device.viewport.width}x${device.viewport.height}) ==`);
      const context = await browser.newContext({ viewport: device.viewport, hasTouch: device.touch, isMobile: device.touch });
      await context.addCookies(
        [TEST, OWNER].flatMap((origin) => [
          { ...supa.authCookie, url: origin, httpOnly: false, secure: false, sameSite: "Lax" },
          { name: "NEXT_LOCALE", value: locale, url: origin },
        ]).map(({ domain, path, ...c }) => c)
      );
      const page = await context.newPage();
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
      const field = page.locator("main textarea");
      async function say(text) {
        await field.fill(text);
        await field.press("Enter");
      }
      // The last thing the tool said in the conversation, once it has said
      // something after `before` turns.
      async function lastToolTurn(before, timeout = 30000) {
        const turns = page.locator('[data-testid="tool-shell-thread"] [data-role="tool"]');
        const deadline = Date.now() + timeout;
        while (Date.now() < deadline) {
          if ((await turns.count()) > before) return (await turns.last().innerText()).trim();
          await page.waitForTimeout(250);
        }
        return null;
      }
      const toolTurns = () => page.locator('[data-testid="tool-shell-thread"] [data-role="tool"]').count();
      async function shellText() {
        return (await page.locator('[data-testid="tool-shell"]').innerText().catch(() => "")) || "";
      }
      // On a phone the work covers the conversation; back to the field.
      async function backToField() {
        const back = page.getByRole("button", { name: W.back });
        if (device.touch && (await back.count()) === 1 && (await back.isVisible())) {
          await press(back);
          await page.waitForTimeout(250);
        }
      }
      function inLanguage(label, text) {
        const wrong = foreign(text, locale);
        check(`${run}: ${label} — nothing in the other language`, wrong.length === 0, JSON.stringify(wrong.slice(0, 4)));
      }

      // ================================================================
      console.log(`-- empty: a new account with nothing made yet`);
      MOCK_USER.user_metadata = { subscription_tier: "growth" };
      state.credits = 3000;
      state.rows = {};
      for (const tool of TOOLS) {
        await page.goto(`${TEST}${tool.path}`, { waitUntil: "networkidle" });
        const shell = page.locator('[data-testid="tool-shell"]');
        const name = W.names[tool.key];
        check(`${run}: ${tool.key} is the shell, named «${name}»`,
          (await shell.count()) === 1 && (await shell.locator("h1").innerText()).trim() === name);
        const fields = await page.locator('main textarea, main input:not([type]), main input[type=text], main input[type=search], main input[type=email], main input[type=url], main input[type=number]').count();
        const options = await page.locator('[data-testid="tool-shell-options"] > *').count();
        check(`${run}: ${tool.key} — one field (${fields}) and at most four options (${options})`, fields === 1 && options >= 1 && options <= 4);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        check(`${run}: ${tool.key} — the page does not scroll sideways`, overflow <= 1, `${overflow}px`);
        inLanguage(`${tool.key}, empty`, await shellText());
      }
      // What was made before, with nothing made: said, not blank.
      for (const [tool, path, option, empty] of [
        ["posts", "/dashboard/posts", "posts-recent", M.posts.history.empty],
        ["slides", "/dashboard/presentations", "slides-recent", M.presentations.history.empty],
        ["research", "/dashboard/deep-research", "research-recent", M.dashboard.deepResearch.empty.title],
      ]) {
        await page.goto(`${TEST}${path}`, { waitUntil: "networkidle" });
        await press(page.locator(`[data-testid="${option}"]`));
        const work = page.locator('[data-testid="tool-shell-work"]');
        const shown = await work.waitFor({ state: "visible", timeout: 5000 }).then(() => true, () => false);
        check(`${run}: ${tool} — what was made before says it is empty`, shown && (await work.innerText()).includes(empty), shown ? await work.innerText() : "no work area");
        await backToField();
      }
      await page.goto(`${TEST}/dashboard/website-builder`, { waitUntil: "networkidle" });
      check(`${run}: site — with no site yet, what was made before cannot be opened`, await page.locator('[data-testid="site-recent"]').isDisabled());
      await page.goto(`${TEST}/dashboard/data-analysis`, { waitUntil: "networkidle" });
      await say(locale === "el" ? "Ποια περιοχή πούλησε περισσότερα;" : "Which region sold most?");
      check(`${run}: analyze — a question with no file says to give it a file`, (await lastToolTurn(0, 5000)) === M.dashboard.toolShell.analyze.needFile);
      await page.goto(`${TEST}/dashboard/files`, { waitUntil: "networkidle" });
      if (!device.touch) {
        check(`${run}: files — with no file, the files beside the conversation say there are none`,
          (await page.locator('[data-testid="tool-shell-work"]').innerText().catch(() => "")).includes(M.dashboard.files.empty));
      }
      await say(locale === "el" ? "Τι λέει για την ακύρωση;" : "What does it say about cancelling?");
      check(`${run}: files — a question with no file says to choose one first`, (await lastToolTurn(0, 5000)) === M.dashboard.files.selectFirst);
      await backToField();

      // ================================================================
      console.log(`-- credits: the balance is 0, and the real routes refuse`);
      state.credits = 0;
      state.rows = { ...ROWS.analysis, ...ROWS.file };
      const brief = {
        site: locale === "el" ? "Site για τον φούρνο μας, με πρωινό στα γραφεία." : "A site for our bakery, with breakfast for offices.",
        slides: locale === "el" ? "Παρουσίαση του πρωινού για γραφεία, σε τρεις διευθυντές." : "A deck on office breakfasts for three managers.",
        posts: locale === "el" ? "Ο φούρνος μας φέρνει πλέον πρωινό στα γραφεία του κέντρου." : "Our bakery now brings breakfast to offices downtown.",
        research: locale === "el" ? "Ο ευρωπαϊκός κανονισμός για την τεχνητή νοημοσύνη στις μικρές εταιρείες λογισμικού" : "The EU AI Act for small SaaS companies",
        analyze: locale === "el" ? "Ποια περιοχή πούλησε περισσότερα;" : "Which region sold most?",
        files: locale === "el" ? "Τι λέει για την ακύρωση;" : "What does it say about cancelling?",
      };
      const credits = [
        ["posts", "/dashboard/posts", M.posts.errors.insufficient],
        ["slides", "/dashboard/presentations", M.presentations.errors.insufficient],
        ["site", "/dashboard/website-builder", W.insufficient],
        // Research and Files say it in their own words since the package
        // check of packages 11 and 12 (components/research/failure-words.ts,
        // components/files/failure-words.ts).
        ["research", "/dashboard/deep-research", M.dashboard.deepResearch.refused.noCredits],
        ["analyze", "/dashboard/data-analysis", W.insufficient],
        ["files", "/dashboard/files", M.dashboard.files.askNoCredits],
      ];
      for (const [tool, path, expected] of credits) {
        await page.goto(`${TEST}${path}`, { waitUntil: "networkidle" });
        if (tool === "files") {
          if (device.touch) await press(page.locator('[data-testid="files-shell-files"]'));
          await press(page.locator('[data-testid="files-shell-list"] input[type=checkbox]').first());
          await backToField();
        }
        const before = await toolTurns();
        await say(brief[tool]);
        const said = await lastToolTurn(before);
        check(`${run}: ${tool} — out of credits, the conversation says it is the credits`, said !== null && said.includes(expected), said ?? "nothing was said");
        inLanguage(`${tool}, out of credits`, await shellText());
        await backToField();
      }

      // ================================================================
      console.log(`-- provider: the model answers 529 overloaded_error`);
      state.credits = 3000;
      state.rows = { ...ROWS.analysis, ...ROWS.file, ...ROWS.site(locale) };
      const calledBefore = modelCalls;
      const provider = [
        ["posts", "/dashboard/posts", M.posts.errors.unavailable],
        ["slides", "/dashboard/presentations", M.presentations.errors.unavailable],
        ["research", "/dashboard/deep-research", M.dashboard.deepResearch.refused.unavailable],
        ["analyze", "/dashboard/data-analysis", M.dataAnalysis.analyse.unavailable],
      ];
      for (const [tool, path, expected] of provider) {
        await page.goto(`${OWNER}${path}`, { waitUntil: "networkidle" });
        const before = await toolTurns();
        await say(brief[tool]);
        const said = await lastToolTurn(before, 45000);
        check(`${run}: ${tool} — the model is down, and the conversation says so`, said !== null && said.includes(expected), said ?? "nothing was said");
        inLanguage(`${tool}, model down`, await shellText());
        await backToField();
      }
      // A change to a finished site: the real /api/websites/edit, the model down.
      await page.goto(`${OWNER}/dashboard/website-builder?project=${SITE_ID}`, { waitUntil: "networkidle" });
      await backToField();
      {
        const before = await toolTurns();
        await say(locale === "el" ? "Άλλαξε το πρωινό σε μεσημεριανό." : "Change breakfast to lunch.");
        const said = await lastToolTurn(before, 45000);
        check(`${run}: site — a change while the model is down says so`, said !== null && said.includes(W.upstream), said ?? "nothing was said");
        inLanguage("site change, model down", await shellText());
        await backToField();
      }
      check(`${run}: the real routes did call the model (${modelCalls - calledBefore})`, modelCalls - calledBefore >= 5);
      // A plan answered by the HOST, not the route: a function that runs out
      // of time answers 504 with a text page. The page was reached, so it is
      // not the connection, and whether it cost cannot be known from here.
      await page.route("**/api/research", (r) =>
        r.request().method() === "POST"
          ? r.fulfill({ status: 504, contentType: "text/plain", body: "An error occurred with your deployment\n\nFUNCTION_INVOCATION_TIMEOUT" })
          : r.continue()
      );
      await page.goto(`${OWNER}/dashboard/deep-research`, { waitUntil: "networkidle" });
      {
        const before = await toolTurns();
        await say(brief.research);
        const said = await lastToolTurn(before, 20000);
        check(`${run}: research — a plan the host timed out says the service, not the connection`,
          said !== null && said.includes(W.upstream) && !said.includes(M.errors.codes.offline.what), said ?? "nothing was said");
        inLanguage("research, host timeout", await shellText());
        await backToField();
      }
      await page.unrouteAll({ behavior: "ignoreErrors" });
      // A site being BUILT fails in the worker, which writes the row the
      // status route then returns (api/websites/generate/process, the
      // anthropic_call stage: `${err.message} No credits were charged —
      // please try again.`).
      state.rows = {};
      const failedSite = {
        ...ROWS.site(locale).user_websites[0], id: "88888888-8888-4888-8888-888888888888", html_content: "", status: "failed",
        error_message: `${SDK_MESSAGE} No credits were charged — please try again.`,
      };
      await page.route("**/api/websites/generate", (r) => r.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true, generated: true, record: { ...failedSite, status: "processing", error_message: null } }) }));
      await page.route("**/api/websites/generate/process", (r) => r.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true, failed: true }) }));
      await page.route(`**/api/websites/status?id=${failedSite.id}`, (r) => r.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true, record: failedSite }) }));
      await page.goto(`${OWNER}/dashboard/website-builder`, { waitUntil: "networkidle" });
      {
        const before = await toolTurns();
        await say(brief.site);
        // "Building…" first, then the failure.
        await lastToolTurn(before, 10000);
        const said = await lastToolTurn(before + 1, 20000);
        check(`${run}: site — a build that fails in the worker says so, and that nothing was charged`,
          said !== null && said.includes(M.dashboard.websiteBuilder.generateFailed) && said.includes(M.errors.credits.notCharged), said ?? "nothing was said");
        inLanguage("site build, model down", await shellText());
      }
      await page.unrouteAll({ behavior: "ignoreErrors" });
      // A question asked of files fails in the worker, which writes the
      // SDK's own message into ai_jobs.error (lib/jobs/run-job.ts, failJob).
      state.rows = { ...ROWS.file };
      const JOB = "66666666-6666-4666-8666-666666666666";
      await page.route("**/api/jobs?kind=file_ask", (r) => r.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true, job: null }) }));
      await page.route("**/api/files/ask", (r) => r.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true, jobId: JOB }) }));
      await page.route(`**/api/jobs/${JOB}`, (r) =>
        r.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true, job: { id: JOB, status: "failed", stepLabel: null, error: SDK_MESSAGE, creditsCharged: 0, result: null } }) })
      );
      await page.goto(`${OWNER}/dashboard/files`, { waitUntil: "networkidle" });
      if (device.touch) await press(page.locator('[data-testid="files-shell-files"]'));
      await press(page.locator('[data-testid="files-shell-list"] input[type=checkbox]').first());
      await backToField();
      {
        const before = await toolTurns();
        await say(brief.files);
        const said = await lastToolTurn(before, 20000);
        check(`${run}: files — a question that fails in the worker says so`, said !== null && said.includes(M.dashboard.files.askFailed), said ?? "nothing was said");
        inLanguage("files question, model down", await shellText());
      }
      await page.unrouteAll({ behavior: "ignoreErrors" });

      // ================================================================
      console.log(`-- boxes: the real edit routes, a model that rewrites everything`);
      modelMode = "rewrite";
      {
        const DECK_ID = "12121212-1212-4212-8212-121212121212";
        const stored = {
          version: 1, title: locale === "el" ? "Πρωινό στο γραφείο" : "Office breakfast", locale, imageSource: "none",
          slides: (locale === "el" ? ["Πρωινό στο γραφείο", "Τι φέρνουμε", "Τιμές"] : ["Office breakfast", "What we bring", "Prices"]).map((title, i) => ({
            layout: i === 0 ? "title" : "bullets", title, bullets: i === 0 ? [] : [`${title} — 1`], notes: "", imageQuery: null, image: null,
          })),
        };
        state.rows = { ai_presentations: [{ id: DECK_ID, user_id: MOCK_USER.id, title: stored.title, description: null, slide_count: 3, slides: stored, image_source: "none", source: "generated", error: null, credits_charged: 4, created_at: "2026-10-07T09:00:00Z", locale }] };
        writes.length = 0;
        await page.goto(`${OWNER}/dashboard/presentations?record=${DECK_ID}`, { waitUntil: "networkidle" });
        const second = page.locator('[data-testid="slide-box"]').nth(1);
        const shown = await second.waitFor({ state: "visible", timeout: 5000 }).then(() => true, () => false);
        if (shown) await press(second);
        await backToField();
        const before = await toolTurns();
        await say(locale === "el" ? "Πρόσθεσε μια τιμή." : "Add a price.");
        const said = await lastToolTurn(before, 30000);
        check(`${run}: slides box — the real route changed slide 2, and the conversation says only it`,
          said !== null && said.startsWith(fill(M.dashboard.toolShell.box.slideChanged, { n: 2 })), said ?? "nothing was said");
        const saved = writes.filter((w) => w.table === "ai_presentations" && w.patch.slides).pop()?.patch.slides;
        check(`${run}: slides box — what was SAVED is the stored deck with only slide 2 rewritten`,
          saved && saved.title === stored.title && saved.slides[0].title === stored.slides[0].title && saved.slides[2].title === stored.slides[2].title &&
            JSON.stringify(saved.slides[2]) === JSON.stringify(stored.slides[2]) && saved.slides[1].title === `${REWRITTEN} 2`,
          JSON.stringify(saved?.slides?.map((x) => x.title)));
        const work = page.locator('[data-testid="tool-shell-work"]');
        if (!(await work.isVisible().catch(() => false))) await press(page.locator('[data-testid="tool-shell-card"]').last());
        const titles = await page.locator('[data-testid="slide-box"]').allInnerTexts();
        check(`${run}: slides box — and the deck on the screen is that deck`,
          titles.length === 3 && titles[0].includes(stored.slides[0].title) && titles[1].includes(`${REWRITTEN} 2`) && titles[2].includes(stored.slides[2].title) && !titles.join(" ").includes(`${REWRITTEN} 1`) && !titles.join(" ").includes(`${REWRITTEN} 3`),
          JSON.stringify(titles));
        await backToField();
      }
      {
        state.rows = { ...ROWS.site(locale) };
        writes.length = 0;
        await page.goto(`${OWNER}/dashboard/website-builder?project=${SITE_ID}`, { waitUntil: "networkidle" });
        const part = page.locator('[data-testid="site-box"]').nth(1);
        const shown = await part.waitFor({ state: "visible", timeout: 5000 }).then(() => true, () => false);
        const partName = shown ? (await part.innerText()).replace(/^2\.\s*/, "") : "";
        if (shown) await press(part);
        await backToField();
        const before = await toolTurns();
        await say(locale === "el" ? "Βάλε και ωράριο." : "Add opening hours.");
        const said = await lastToolTurn(before, 45000);
        check(`${run}: site box — the real route changed the part, and the conversation says only it`,
          said !== null && partName.length > 0 && said.startsWith(fill(M.dashboard.toolShell.box.partChanged, { name: partName })), said ?? "nothing was said");
        const html = writes.filter((w) => w.table === "user_websites" && typeof w.patch.html_content === "string").pop()?.patch.html_content ?? "";
        const stored = SITE_HTML[locale];
        const header = stored.match(/<header>[\s\S]*?<\/header>/)[0];
        const footer = stored.match(/<footer>[\s\S]*?<\/footer>/)[0];
        const section = html.match(/<section[^>]*>[\s\S]*?<\/section>/)?.[0] ?? "";
        check(`${run}: site box — what was SAVED keeps the header and footer as stored, and only the part is rewritten`,
          html.includes(header) && html.includes(footer) && section.includes(REWRITTEN) && !/data-ionexa-box/.test(html) &&
            !html.slice(html.indexOf("<body")).replace(section, "").includes(REWRITTEN),
          html.slice(0, 600));
        await backToField();
      }
      modelMode = "down";

      // ================================================================
      console.log(`-- old pages: collections, reference photos, versions, through the shell`);
      // What only the old Files and Site pages had (the owner's decision of
      // 2026-10-09), used through the shell and its REAL routes.
      {
        const OFFER_ID = "56565656-5656-4565-8565-565656565656";
        const COLLECTION_ID = "57575757-5757-4575-8575-575757575757";
        const [contract] = ROWS.file.user_files;
        const offer = { ...contract, id: OFFER_ID, filename: "offer.pdf", storage_path: `${MOCK_USER.id}/offer.pdf` };
        const kept = locale === "el" ? "Συμβόλαια" : "Contracts";
        const named = locale === "el" ? "Προσφορές 2026" : "Offers 2026";
        state.rows = {
          user_files: [contract, offer],
          file_collections: [{ id: COLLECTION_ID, user_id: MOCK_USER.id, name: kept, description: null, created_at: "2026-10-07T07:30:00Z" }],
          file_collection_items: [{ collection_id: COLLECTION_ID, file_id: contract.id, user_id: MOCK_USER.id }],
        };
        writes.length = 0;
        await page.goto(`${TEST}/dashboard/files`, { waitUntil: "networkidle" });
        if (device.touch) await press(page.locator('[data-testid="files-shell-files"]'));
        const chips = page.locator('[data-testid="files-collection"]');
        const flat = async () => (await chips.allInnerTexts()).map((x) => x.replace(/\s+/g, " ").trim());
        const shown = await chips.first().waitFor({ state: "visible", timeout: 5000 }).then(() => true, () => false);
        check(`${run}: files — the collections are there, each with how many files it holds`,
          shown && JSON.stringify(await flat()) === JSON.stringify([`${kept} · 1`]), shown ? JSON.stringify(await flat()) : "no collection");
        if (shown) await press(chips.first());
        const ticks = page.locator('[data-testid="files-shell-list"] input[type=checkbox]');
        check(`${run}: files — a collection pressed selects its files again`,
          (await ticks.nth(0).isChecked()) && !(await ticks.nth(1).isChecked()) && (await chips.first().getAttribute("aria-pressed")) === "true");
        await press(ticks.nth(1));
        let before = await toolTurns();
        await press(page.locator('[data-testid="files-collection-save"]'));
        const question = await lastToolTurn(before, 5000);
        check(`${run}: files — saving what is selected asks its name in the conversation, and the field says so`,
          question !== null && question.startsWith(icu(M.dashboard.files.collectionName, locale, { count: 2 })) &&
            (await field.isVisible()) && (await field.getAttribute("placeholder")) === M.dashboard.files.collectionPlaceholder,
          JSON.stringify({ question, placeholder: await field.getAttribute("placeholder") }));
        before = await toolTurns();
        await say(named);
        const saved = await lastToolTurn(before, 15000);
        const made = writes.find((w) => w.table === "file_collections" && w.insert)?.insert;
        const members = writes.filter((w) => w.table === "file_collection_items" && w.insert).map((w) => w.insert.file_id).sort();
        check(`${run}: files — the name is saved through the real route, with both files selected`,
          saved === fill(M.dashboard.files.collectionCreated, { name: named }) && made?.name === named && JSON.stringify(members) === JSON.stringify([contract.id, OFFER_ID].sort()),
          JSON.stringify({ saved, name: made?.name, members }));
        if (device.touch) await press(page.locator('[data-testid="files-shell-files"]'));
        check(`${run}: files — and the new collection is there at once, with its two files, pressed`,
          JSON.stringify(await flat()) === JSON.stringify([`${named} · 2`, `${kept} · 1`]) && (await chips.first().getAttribute("aria-pressed")) === "true",
          JSON.stringify(await flat()));
        check(`${run}: files, collections — the page does not scroll sideways`,
          (await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)) <= 1);
        inLanguage("files, collections", await shellText());
        await backToField();
      }
      {
        modelMode = "rewrite";
        modelImages = 0;
        state.rows = { ...ROWS.site(locale) };
        writes.length = 0;
        photoBucket.clear();
        const editBodies = [];
        const onRequest = (request) => {
          if (/\/api\/websites\/edit$/.test(request.url()) && request.method() === "POST") editBodies.push(request.postDataJSON());
        };
        page.on("request", onRequest);
        await page.goto(`${OWNER}/dashboard/website-builder?project=${SITE_ID}`, { waitUntil: "networkidle" });
        await backToField();
        const attach = page.locator('[data-testid="composer-attach-input"]');
        const tray = page.locator('[data-testid="site-photos"]');
        let before = await toolTurns();
        await attach.setInputFiles([
          { name: "logo.png", mimeType: "image/png", buffer: PNG },
          { name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("not a photograph") },
        ]);
        const refused = await lastToolTurn(before, 5000);
        const trayText = await tray.innerText().catch(() => "");
        check(`${run}: site — a photo given to the field is shown above it; what is not a photo is refused in the screen's words`,
          refused === M.dashboard.toolShell.site.photoType && (await tray.locator("img").count()) === 1 && trayText.includes(fill(M.dashboard.toolShell.site.photos, { count: 1, max: 20 })),
          JSON.stringify({ refused, trayText }));
        before = await toolTurns();
        await say(locale === "el" ? "Βάλε το λογότυπο στην κεφαλίδα." : "Put the logo in the header.");
        const changed = await lastToolTurn(before, 45000);
        const sent = editBodies.at(-1)?.referenceImagePaths ?? [];
        check(`${run}: site — the photo goes up to the account's own folder, and with the change through the real route to the model`,
          changed !== null && changed.startsWith(M.dashboard.toolShell.site.changed) && sent.length === 1 && sent[0].startsWith(`${MOCK_USER.id}/`) &&
            Boolean(photoBucket.get(sent[0])?.bytes.equals(PNG)) && modelImages > 0,
          JSON.stringify({ changed, sent, stored: [...photoBucket.keys()], modelImages }));
        check(`${run}: site — once sent, the photo leaves the field`, (await tray.count()) === 0);
        // The conversation only: the stand-in model writes its marker into
        // the site's own headings, which the parts above the preview show.
        inLanguage("site, a change with a photo", await page.locator('[data-testid="tool-shell-thread"]').innerText());
        // A NEW site with a photo: the bytes go up first, and the same path
        // reaches /api/websites/generate and its worker, as the old page
        // sends it. Answered here: the build is not what is checked.
        const NEW_ID = "79797979-7979-4797-8797-797979797979";
        const bodies = { generate: null, process: null };
        const building = { ...ROWS.site(locale).user_websites[0], id: NEW_ID, status: "processing", html_content: "" };
        await page.route("**/api/websites/generate", (r) => {
          bodies.generate = r.request().postDataJSON();
          return r.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true, generated: true, record: building }) });
        });
        // The worker is started with a keepalive request, which the browser
        // sends past page.route: what the page hands it is read where the
        // page calls fetch, and answered there.
        await page.evaluate(() => {
          const send = window.fetch.bind(window);
          window.__workerBodies = [];
          window.fetch = (input, init) => {
            const address = typeof input === "string" ? input : input.url;
            if (!address.includes("/api/websites/generate/process")) return send(input, init);
            window.__workerBodies.push(typeof init?.body === "string" ? init.body : null);
            return Promise.resolve(new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } }));
          };
        });
        await page.route(`**/api/websites/status?id=${NEW_ID}`, (r) =>
          r.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true, record: { ...building, status: "completed", html_content: SITE_HTML[locale] } }) })
        );
        await backToField();
        await press(page.locator('[data-testid="site-new"]'));
        await attach.setInputFiles({ name: "shop.png", mimeType: "image/png", buffer: PNG });
        before = await toolTurns();
        await say(brief.site);
        await lastToolTurn(before, 15000);
        for (let i = 0; i < 40 && !bodies.process; i++) {
          const handed = await page.evaluate(() => window.__workerBodies?.[0] ?? null);
          if (handed) bodies.process = JSON.parse(handed);
          else await page.waitForTimeout(250);
        }
        const given = bodies.generate?.referenceImagePaths ?? [];
        check(`${run}: site — a new site's photo goes up first, and its path reaches the route and its worker`,
          given.length === 1 && given[0] !== sent[0] && given[0].startsWith(`${MOCK_USER.id}/`) && photoBucket.has(given[0]) &&
            JSON.stringify(bodies.process?.referenceImagePaths) === JSON.stringify(given) && (await tray.count()) === 0,
          JSON.stringify({ given, process: bodies.process?.referenceImagePaths ?? null }));
        page.off("request", onRequest);
        await page.unrouteAll({ behavior: "ignoreErrors" });
        modelMode = "down";
        await backToField();
      }
      {
        const PUBLISHED_ID = "81818181-8181-4818-8818-818181818181";
        const hours = locale === "el" ? "Βάλε και ωράριο." : "Add opening hours.";
        const firstHeading = locale === "el" ? "Η πρώτη εκδοχή" : "The first draft";
        const firstHtml = SITE_HTML[locale].replace(/<h1>[^<]*<\/h1>/, `<h1>${firstHeading}</h1>`);
        const version = (n, html, said, at) => ({ id: `9${n}9${n}9${n}9${n}-9${n}9${n}-4${n}9${n}-8${n}9${n}-9${n}9${n}9${n}9${n}9${n}9${n}`, website_id: SITE_ID, user_id: MOCK_USER.id, version_number: n, html_content: html, pages: null, change_description: said, created_at: at });
        const shownAs = (n, html, at) => ({ id: `8${n}8${n}8${n}8${n}-8${n}8${n}-4${n}8${n}-8${n}8${n}-8${n}8${n}8${n}8${n}8${n}8${n}`, published_site_id: PUBLISHED_ID, user_id: MOCK_USER.id, version_number: n, html_content: html, pages: null, change_description: null, published_at: at });
        state.rows = {
          ...ROWS.site(locale),
          website_versions: [
            version(3, SITE_HTML[locale], `[undo] ${hours}`, "2026-10-07T12:00:00Z"),
            version(2, SITE_HTML[locale], hours, "2026-10-07T11:00:00Z"),
            version(1, firstHtml, null, "2026-10-07T10:00:00Z"),
          ],
          published_sites: [{ id: PUBLISHED_ID, user_id: MOCK_USER.id, website_id: SITE_ID, subdomain: "bakery", status: "live", is_active: true, view_count: 3, html_content: SITE_HTML[locale], pages: null, published_at: "2026-10-07T12:30:00Z", updated_at: "2026-10-07T12:30:00Z" }],
          site_versions: [shownAs(2, SITE_HTML[locale], "2026-10-07T12:30:00Z"), shownAs(1, firstHtml, "2026-10-07T10:30:00Z")],
        };
        writes.length = 0;
        await page.goto(`${OWNER}/dashboard/website-builder?project=${SITE_ID}`, { waitUntil: "networkidle" });
        // Opened by its address, the site is the work on arrival, on a phone
        // too; «History» is above its preview.
        const open = page.locator('[data-testid="site-history-open"]');
        const reachable = await open.waitFor({ state: "visible", timeout: 10000 }).then(() => true, () => false);
        const where = reachable ? await open.boundingBox() : null;
        check(`${run}: site — «History» is on the published site, inside the screen`,
          where !== null && where.x >= 0 && where.x + where.width <= device.viewport.width, JSON.stringify(where));
        await press(open);
        const listed = page.locator('[data-testid="site-version"]');
        const liveRows = page.locator('[data-testid="site-live-versions"] li');
        const ready = await listed.first().waitFor({ state: "visible", timeout: 10000 }).then(() => true, () => false);
        await liveRows.first().waitFor({ state: "visible", timeout: 10000 }).catch(() => {});
        const rows = ready ? await listed.allInnerTexts() : [];
        const WB = M.dashboard.websiteBuilder;
        check(`${run}: site — every version is one press away on top of the site, said in the screen's language`,
          rows.length === 3 && rows[0].includes(fill(WB.versionLabel, { number: 3 })) && rows[0].includes(fill(M.dashboard.toolShell.site.undid, { change: hours })) &&
            rows[1].includes(hours) && rows[2].includes(WB.versionOriginal) && !rows.join(" ").includes("[undo]"),
          JSON.stringify(rows));
        check(`${run}: site — and once published, what the public saw, with Roll back on all but the newest`,
          (await liveRows.count()) === 2 && (await liveRows.first().innerText()).includes(M.dashboard.publishing.currentlyLive) && (await page.locator('[data-testid="site-rollback"]').count()) === 1,
          JSON.stringify(await liveRows.allInnerTexts()));
        check(`${run}: site, versions — the page does not scroll sideways`,
          (await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)) <= 1);
        inLanguage("site, versions", await shellText());
        // A version pressed is shown in the latest's place, read-only.
        await press(listed.nth(2));
        const viewing = page.locator('[data-testid="site-viewing"]');
        const earlier = page.locator('[data-testid="site-version-preview"]');
        const seen = await viewing.waitFor({ state: "visible", timeout: 5000 }).then(() => true, () => false);
        check(`${run}: site — a version pressed is shown read-only and sandboxed, in the latest's place`,
          seen && (await viewing.innerText()).includes(fill(WB.viewingOldVersion, { number: 1 })) && ((await earlier.getAttribute("srcdoc")) ?? "").includes(firstHeading) && (await earlier.getAttribute("sandbox")) === "",
          seen ? await viewing.innerText() : "no version shown");
        if (seen) await press(page.locator('[data-testid="site-latest"]'));
        check(`${run}: site — and the latest comes back`, (await viewing.count()) === 0 && (await earlier.count()) === 0);
        // ROLL BACK, through the real route: the version the public saw before.
        page.once("dialog", (dialog) => void dialog.accept());
        await press(open);
        await liveRows.first().waitFor({ state: "visible", timeout: 10000 }).catch(() => {});
        await press(page.locator('[data-testid="site-rollback"]'));
        const deadline = Date.now() + 15000;
        while (Date.now() < deadline && (await liveRows.count()) !== 3) await page.waitForTimeout(250);
        const restored = writes.find((w) => w.table === "published_sites" && typeof w.patch?.html_content === "string")?.patch;
        const appended = writes.find((w) => w.table === "site_versions" && w.insert)?.insert;
        const newest = (await liveRows.count()) === 3 ? await liveRows.first().innerText() : "";
        check(`${run}: site — Roll back puts the earlier version live through the real route, and the list says so in the screen's language`,
          Boolean(restored?.html_content.includes(firstHeading)) && restored?.status === "live" && appended?.version_number === 3 &&
            newest.includes(fill(M.dashboard.publishing.rollbackSuccess, { number: 1 })) && typeof appended?.change_description === "string" &&
            // In English the screen's words and the row's are the same words.
            (locale === "en" || !newest.includes(appended.change_description)),
          JSON.stringify({ restored: restored?.html_content?.slice(0, 120) ?? null, appended: appended?.version_number ?? null, newest }));
        inLanguage("site, rolled back", await shellText());
        await backToField();
      }

      // ================================================================
      console.log(`-- stop: a change to one slide, stopped while it runs`);
      // The field shows Stop while a change runs; the edit route stops the
      // model on the request's own abort (api/presentations/[id]/edit,
      // `signal: request.signal`). So Stop must abort the request, and the
      // conversation must say it stopped — not show the changed deck later.
      state.rows = {};
      const DECK_ID = "11111111-1111-4111-8111-111111111111";
      const slide = (layout, title, bullets) => ({ layout, title, bullets, notes: "", imageQuery: null, image: null });
      const DECK = { version: 1, title: "Office breakfast", locale, imageSource: "none", slides: [slide("title", "Office breakfast", []), slide("bullets", "What we bring", ["Bread", "Coffee"]), slide("bullets", "Prices", ["From ten people"])] };
      // The page itself gave the request up (net::ERR_ABORTED), which is
      // what reaches the route as request.signal.
      let editAborted = false;
      // What the change asked for: ONE slide, the second (slideIndex 1).
      let editBody = null;
      const onFailed = (request) => {
        if (/\/api\/presentations\/[^/]+\/edit$/.test(request.url())) editAborted = true;
      };
      page.on("requestfailed", onFailed);
      await page.route("**/api/presentations/generate", (r) => r.fulfill({ contentType: "application/json", body: JSON.stringify({ id: DECK_ID, deck: DECK, creditsCharged: 4 }) }));
      await page.route("**/api/presentations/*/edit", async (r) => {
        try { editBody = r.request().postDataJSON(); } catch { editBody = null; }
        await new Promise((res) => setTimeout(res, 4000));
        await r.fulfill({ contentType: "application/json", body: JSON.stringify({ id: DECK_ID, deck: { ...DECK, title: "CHANGED" }, creditsCharged: 2 }) }).catch(() => {});
      });
      await page.goto(`${OWNER}/dashboard/presentations`, { waitUntil: "networkidle" });
      await say(brief.slides);
      await page.locator('[data-testid="tool-shell-work"]').waitFor({ state: "visible", timeout: 10000 }).catch(() => {});
      const slideBox = page.locator('[data-testid="slide-box"]').nth(1);
      if (await slideBox.isVisible().catch(() => false)) await press(slideBox);
      await backToField();
      {
        const before = await toolTurns();
        await say(locale === "el" ? "Πρόσθεσε μια τιμή." : "Add a price.");
        const stop = page.locator('[data-testid="chat-stop"]');
        const stopShown = await stop.waitFor({ state: "visible", timeout: 3000 }).then(() => true, () => false);
        if (stopShown) await press(stop);
        await page.waitForTimeout(5000);
        const said = await lastToolTurn(before, 1000);
        check(`${run}: slides — Stop during a change to one slide stops it, and the conversation says so`,
          stopShown && said === M.aiSteps.stopped && editAborted && editBody?.slideIndex === 1,
          JSON.stringify({ stopShown, said, editAborted, slideIndex: editBody?.slideIndex ?? null }));
      }
      page.off("requestfailed", onFailed);
      await page.unrouteAll({ behavior: "ignoreErrors" });

      // ================================================================
      console.log(`-- connection: a file sent while the connection drops`);
      // The requests are dropped, not the browser taken offline: offline,
      // the app shows its own offline screen (app/offline/page.tsx) and the
      // Files screen is not there to say anything. This is the connection
      // failing under a page that still thinks it is online.
      state.rows = {};
      await page.goto(`${TEST}/dashboard/files`, { waitUntil: "networkidle" });
      await page.route(`${supa.url}/storage/v1/object/**`, (r) => r.abort("internetdisconnected"));
      await page.route("**/api/files/upload", (r) => r.abort("internetdisconnected"));
      {
        const before = await toolTurns();
        await page.locator('[data-testid="files-shell-input"]').setInputFiles({ name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("Cancellation requires thirty days written notice.\n") });
        const said = await lastToolTurn(before, 15000);
        check(`${run}: files — a file sent while the connection drops says the connection`, said !== null && said.includes(M.errors.codes.offline.what), said ?? "nothing was said");
        inLanguage("files, connection dropped", await shellText());
      }
      {
        // Over 4MB the bytes cannot go through the app's own route
        // (lib/files/upload-file.ts, ROUTE_BODY_LIMIT), so storage that
        // could not be reached is the whole answer — and its own message
        // is the browser's English «Failed to fetch».
        const before = await toolTurns();
        await page.locator('[data-testid="files-shell-input"]').setInputFiles({ name: "minutes.txt", mimeType: "text/plain", buffer: Buffer.alloc(5 * 1024 * 1024, "a") });
        const said = await lastToolTurn(before, 15000);
        check(`${run}: files — a file over 4MB sent while the connection drops says the connection`, said !== null && said.includes(M.errors.codes.offline.what), said ?? "nothing was said");
        inLanguage("files over 4MB, connection dropped", await shellText());
      }
      await page.unrouteAll({ behavior: "ignoreErrors" });
      await backToField();

      // ================================================================
      console.log(`-- free: the plan decides`);
      MOCK_USER.user_metadata = { subscription_tier: "free" };
      state.credits = 3000;
      state.rows = {};
      for (const tool of TOOLS) {
        await page.goto(`${TEST}${tool.path}`, { waitUntil: "networkidle" });
        const isShell = (await page.locator('[data-testid="tool-shell"]').count()) === 1;
        const mainText = await page.locator("main").innerText();
        if (tool.key === "analyze" || tool.key === "files") {
          check(`${run}: ${tool.key} on Free — the shell`, isShell);
        } else {
          check(`${run}: ${tool.key} on Free — the page says which plan has it`,
            !isShell && mainText.includes(M.common.upgradeRequired.title), mainText.slice(0, 200));
        }
        inLanguage(`${tool.key} on Free`, mainText);
      }
      // Free holds three files (lib/files/limits.ts). With three, a fourth
      // goes into the bucket and the REAL /api/files/register refuses it.
      state.rows = {
        user_files: [1, 2, 3].map((n) => ({ ...ROWS.file.user_files[0], id: `5555555${n}-5555-4555-8555-555555555555`, filename: `contract-${n}.pdf` })),
      };
      await page.goto(`${TEST}/dashboard/files`, { waitUntil: "networkidle" });
      {
        const before = await toolTurns();
        await page.locator('[data-testid="files-shell-input"]').setInputFiles({ name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("Cancellation requires thirty days written notice.\n") });
        const said = await lastToolTurn(before, 20000);
        check(`${run}: files on Free, with its three files — a fourth is refused as the plan's limit`,
          said !== null && said.includes(M.dashboard.files.uploadFileCap), said ?? "nothing was said");
        inLanguage("files on Free, the fourth file", await shellText());
        await backToField();
      }
      MOCK_USER.user_metadata = { subscription_tier: "growth" };

      check(`${run}: no page threw (${pageErrors.length})`, pageErrors.length === 0, pageErrors.slice(0, 3).join(" | "));
      await context.close();
    }
  }
} catch (err) {
  check("the run completed", false, String(err?.stack ?? err) + (pageErrors.length ? `\n        page errors: ${pageErrors.slice(0, 3).join(" | ")}` : ""));
} finally {
  if (browser) await browser.close().catch(() => {});
  cleanup();
}

console.log(failures.length ? `\nFAILURES: ${pass} passed, ${failures.length} failed` : `\nALL PASS: ${pass} passed, 0 failed`);
process.exit(failures.length === 0 ? 0 : 1);
