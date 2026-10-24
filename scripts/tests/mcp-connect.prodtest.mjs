/*
 * CONNECT BY ADDRESS, END TO END, AS A PERSON MEETS IT: the real production
 * build, the real routes, the real screen in a browser, against a stand-in
 * database that KEEPS what is written, a stand-in model, and a stand-in MCP
 * server (scripts/tests/lib/mock-mcp-server.mjs) that requires a token and
 * whose tool description AND result are an instruction aimed at the model.
 *
 * Run: node scripts/tests/mcp-connect.prodtest.mjs
 *      SKIP_BUILD=1 MCP_SHOTS=/tmp/shots node scripts/tests/mcp-connect.prodtest.mjs
 *
 * What it holds (Phase 2, tool 1 of the final All tools grid, 2026-10-26):
 *   1. A refused address (private, metadata, plain http, credentials in it,
 *      a redirect) saves nothing; a wrong token saves nothing.
 *   2. A right address and token connect: the tools are listed, read-only
 *      ones marked, the token stored ENCRYPTED, bound to this person, and
 *      never in any response or page.
 *   3. Asking in words: a read-only tool runs at once and its result is shown
 *      as text; a tool that is not read-only comes back as a plan and does
 *      NOT run until the press — not through the route without `approved:
 *      true` either; the model sees the tool list inside a fence whose own
 *      closing tag was removed; the app's injected instruction is not obeyed.
 *   4. The model call is charged; a refusal or a provider failure charges
 *      nothing; the app's own call is free.
 *   5. User B sees none of user A's apps and can touch none of them.
 *   6. A Free account may connect one app and not a second.
 *   7. Greek and English, a computer and a phone, no sideways scroll, 44px.
 */
import http from "node:http";
import { spawn } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import { chromium } from "playwright";
import { startMockSupabase, MOCK_USER } from "../lib/mock-supabase.mjs";
import { chromiumPath } from "./lib/chromium.mjs";
import { startMockMcp, INJECTION } from "./lib/mock-mcp-server.mjs";

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
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const L = { el: JSON.parse(readFileSync("messages/el.json", "utf8")), en: JSON.parse(readFileSync("messages/en.json", "utf8")) };
const fill = (s, vars) => s.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ""));

const USER_A = MOCK_USER.id;
const USER_B = "00000000-0000-4000-8000-0000000000b2";
const TOKEN = "tok_live_9f8e7d6c5b4a39281706";
const KEY = "0123456789abcdef".repeat(4);

// ---------------------------------------------------------------------
// THE STAND-IN FOR SUPABASE, KEEPING WHAT IS WRITTEN
// ---------------------------------------------------------------------
const tables = new Map();
const table = (name) => {
  if (!tables.has(name)) tables.set(name, []);
  return tables.get(name);
};
const state = { credits: 3000, tier: "growth", holds: new Map() };
const PASS_THROUGH = new Set(["select", "order", "limit", "offset", "on_conflict", "columns", "or"]);
function matches(row, params) {
  for (const [key, raw] of params) {
    if (PASS_THROUGH.has(key)) continue;
    const v = String(raw);
    let m;
    if ((m = /^eq\.(.*)$/s.exec(v)) && String(row[key]) !== m[1]) return false;
  }
  return true;
}
function handle({ req, res, url, body }) {
  const p = decodeURIComponent(url.pathname);
  const send = (code, payload, headers = {}) => {
    res.writeHead(code, { "Content-Type": "application/json", ...headers });
    res.end(payload === undefined ? "" : JSON.stringify(payload));
    return true;
  };
  if (p.startsWith("/rest/v1/rpc/")) {
    const name = p.slice("/rest/v1/rpc/".length);
    let a = {};
    try { a = JSON.parse(body || "{}"); } catch {}
    if (name === "consume_rate_limit") return send(200, true);
    if (name === "reserve_credits") {
      if (state.credits >= a.p_credits) {
        const id = randomUUID();
        state.credits -= a.p_credits;
        state.holds.set(id, a.p_credits);
        return send(200, [{ reservation_id: id, available: state.credits }]);
      }
      return send(200, [{ reservation_id: null, available: state.credits }]);
    }
    if (name === "settle_reservation") {
      const held = state.holds.get(a.p_reservation_id) ?? 0;
      state.holds.delete(a.p_reservation_id);
      state.credits += held - Number(a.p_credits_to_charge ?? 0);
      return send(200, [{ charged: a.p_credits_to_charge, remaining: state.credits }]);
    }
    if (name === "release_reservation") {
      const held = state.holds.get(a.p_reservation_id) ?? 0;
      state.holds.delete(a.p_reservation_id);
      state.credits += held;
      res.writeHead(204);
      res.end();
      return true;
    }
    res.writeHead(204);
    res.end();
    return true;
  }
  if (!p.startsWith("/rest/v1/")) return false;
  const name = p.slice("/rest/v1/".length);
  const prefer = String(req.headers.prefer ?? "");
  const single = String(req.headers.accept ?? "").includes("vnd.pgrst.object");
  const respond = (list, code = 200) => {
    const headers = {};
    if (/count=/.test(prefer)) headers["Content-Range"] = list.length > 0 ? `0-${list.length - 1}/${list.length}` : "*/0";
    if (single) return list[0] ? send(code, list[0], headers) : send(406, { code: "PGRST116", message: "no rows" });
    if (req.method === "HEAD") return send(code, undefined, headers);
    return send(code, list, headers);
  };
  if (req.method === "GET" || req.method === "HEAD") {
    if (name === "user_credits") {
      return respond([{ user_id: MOCK_USER.id, credits_remaining: state.credits, credits_total: 3000, plan_tier: state.tier, beta_expires_at: null, free_chat_used: 0, free_chat_period_start: new Date().toISOString() }]);
    }
    let out = table(name).filter((row) => matches(row, url.searchParams));
    const order = url.searchParams.get("order");
    if (order) {
      const [col, dir] = order.split(",")[0].split(".");
      out = [...out].sort((a, b) => (String(a[col] ?? "") < String(b[col] ?? "") ? -1 : 1) * (dir === "desc" ? -1 : 1));
    }
    return respond(out);
  }
  let payload = null;
  try { payload = JSON.parse(body || "null"); } catch {}
  if (req.method === "POST") {
    const incoming = (Array.isArray(payload) ? payload : [payload]).filter(Boolean);
    const out = [];
    for (const row of incoming) {
      // unique (user_id, url) on mcp_servers, as the migration says
      if (name === "mcp_servers" && table(name).some((r) => r.user_id === row.user_id && r.url === row.url)) {
        return send(409, { code: "23505", message: "duplicate key value violates unique constraint" });
      }
      const made = { id: randomUUID(), created_at: new Date().toISOString(), ...row };
      table(name).push(made);
      out.push(made);
    }
    return /return=representation/.test(prefer) ? respond(out, 201) : send(201, undefined);
  }
  if (req.method === "PATCH") {
    const hit = table(name).filter((row) => matches(row, url.searchParams));
    hit.forEach((row) => Object.assign(row, payload ?? {}));
    return /return=representation/.test(prefer) ? respond(hit) : send(204, undefined);
  }
  if (req.method === "DELETE") {
    const hit = table(name).filter((row) => matches(row, url.searchParams));
    tables.set(name, table(name).filter((row) => !hit.includes(row)));
    return /return=representation/.test(prefer) ? respond(hit) : send(204, undefined);
  }
  return false;
}

// ---------------------------------------------------------------------
// THE STAND-IN FOR THE MODEL: it picks a tool from the person's words
// ---------------------------------------------------------------------
const model = { calls: [], down: false };
const usage = { input_tokens: 900, output_tokens: 120 };
const toolReply = (name, input) => ({ id: "msg_t", type: "message", role: "assistant", model: "claude-sonnet-4-5", content: [{ type: "tool_use", id: "toolu_t", name, input }], stop_reason: "tool_use", usage });
const modelServer = http.createServer((req, res) => {
  let raw = "";
  req.on("data", (c) => (raw += c));
  req.on("end", () => {
    const asked = JSON.parse(raw || "{}");
    const reply = (code, payload) => {
      res.writeHead(code, { "Content-Type": "application/json", "request-id": "req_test" });
      res.end(JSON.stringify(payload));
    };
    if (req.url.startsWith("/v1/messages/count_tokens")) return reply(200, { input_tokens: 12 });
    model.calls.push(asked);
    if (model.down) return reply(529, { type: "error", error: { type: "overloaded_error", message: "Overloaded" } });
    const content = asked.messages?.[0]?.content;
    const text = typeof content === "string" ? content : (content ?? []).map((b) => b.text ?? "").join("\n");
    const said = (text.match(/<person_request>\n([\s\S]*?)\n<\/person_request>/) ?? [])[1] ?? "";
    if (/echo/i.test(said)) return reply(200, toolReply("choose_tool", { tool: "echo", arguments: { text: "hello" }, say: "Θα ξαναπώ το κείμενο." }));
    if (/delete/i.test(said)) return reply(200, toolReply("choose_tool", { tool: "delete_note", arguments: { id: "1" }, say: "Θα σβήσει τη σημείωση 1." }));
    if (/evil/i.test(said)) return reply(200, toolReply("choose_tool", { tool: "evil", arguments: {}, say: "Θα καλέσει το evil." }));
    if (/invent/i.test(said)) return reply(200, toolReply("choose_tool", { tool: "format_disk", arguments: {}, say: "x" }));
    return reply(200, toolReply("choose_tool", { tool: "none", arguments: {}, say: "Τίποτα σε αυτή την εφαρμογή δεν ταιριάζει." }));
  });
});
await new Promise((r) => modelServer.listen(0, "127.0.0.1", r));
const MODEL_URL = `http://127.0.0.1:${modelServer.address().port}`;

const SUPA_PORT = 54431;
MOCK_USER.email = "member@example.com";
MOCK_USER.user_metadata = { subscription_tier: "growth", preferred_locale: "el" };
const supa = await startMockSupabase({ port: SUPA_PORT, handle });

const freePort = () =>
  new Promise((resolve) => {
    const probe = http.createServer();
    probe.listen(0, "127.0.0.1", () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
const PORT = await freePort();
const ORIGIN = `http://127.0.0.1:${PORT}`;
const env = {
  ...process.env,
  NODE_ENV: "production",
  PORT: String(PORT),
  NEXT_PUBLIC_SUPABASE_URL: supa.url,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: supa.anonKey,
  SUPABASE_SERVICE_ROLE_KEY: supa.serviceKey,
  NEXT_PUBLIC_SITE_URL: ORIGIN,
  ADMIN_EMAILS: "",
  TEST_ACCOUNT_EMAILS: "",
  ANTHROPIC_API_KEY: "sk-ant-stand-in-not-a-key",
  ANTHROPIC_BASE_URL: MODEL_URL,
  INTEGRATION_ENCRYPTION_KEY: KEY,
  // The stand-in MCP server is on this machine over http; the switch opens
  // loopback only (src/lib/mcp/ssrf.ts), and exists for this test.
  MCP_ALLOW_INSECURE_LOCAL: "1",
  GOOGLE_OAUTH_CLIENT_ID: "",
  GOOGLE_OAUTH_CLIENT_SECRET: "",
  SLACK_CLIENT_ID: "",
  SLACK_CLIENT_SECRET: "",
};

const SHOT_DIR = process.env.MCP_SHOTS || "";
if (SHOT_DIR) mkdirSync(SHOT_DIR, { recursive: true });
const servers = [];
const mocks = [];
let server = null;
let browser = null;
const cleanup = async () => {
  try { if (server?.pid) process.kill(-server.pid, "SIGKILL"); } catch {}
  try { supa.close(); } catch {}
  try { modelServer.close(); } catch {}
  for (const m of mocks) await m.close().catch(() => {});
};
const mock = async (opts) => {
  const m = await startMockMcp(opts);
  mocks.push(m);
  return m;
};

try {
  if (process.env.SKIP_BUILD) {
    console.log("SKIP_BUILD=1 — reusing the existing .next");
  } else {
    console.log("running `next build` (production) ...");
    const build = spawn("npx", ["next", "build"], { env, stdio: ["ignore", "pipe", "pipe"] });
    let log = "";
    build.stdout.on("data", (d) => (log += d));
    build.stderr.on("data", (d) => (log += d));
    if ((await new Promise((r) => build.on("close", r))) !== 0) {
      console.log("  FAIL  next build failed\n" + log.slice(-3000));
      await cleanup();
      process.exit(1);
    }
  }
  server = spawn("npx", ["next", "start", "-p", String(PORT)], { env, stdio: ["ignore", "pipe", "pipe"], detached: true });
  let up = false;
  for (let i = 0; i < 90 && !up; i++) {
    try {
      await new Promise((res, rej) => { const r = http.get(`${ORIGIN}/api/health`, () => res()); r.on("error", rej); });
      up = true;
    } catch { await sleep(1000); }
  }
  if (!up) { console.log("  FAIL  the production server did not start"); await cleanup(); process.exit(1); }

  browser = await chromium.launch({ executablePath: chromiumPath() });
  const pageErrors = [];
  async function open(device, locale) {
    const context = await browser.newContext({ viewport: device.viewport, hasTouch: device.touch, isMobile: device.touch, deviceScaleFactor: device.touch ? 3 : 1 });
    await context.addCookies([
      { ...supa.authCookie, domain: "127.0.0.1", path: "/", httpOnly: false, secure: false, sameSite: "Lax" },
      { name: "NEXT_LOCALE", value: locale, domain: "127.0.0.1", path: "/" },
    ]);
    const page = await context.newPage();
    page.on("pageerror", (err) => pageErrors.push(String(err?.message ?? err)));
    page.on("dialog", (d) => d.accept());
    return { context, page };
  }
  const DESKTOP = { label: "desktop", viewport: { width: 1440, height: 900 }, touch: false };
  const PHONE = { label: "phone", viewport: { width: 390, height: 844 }, touch: true };
  const asUser = (id) => { MOCK_USER.id = id; };
  const post = (page, path, data) => page.request.post(`${ORIGIN}${path}`, { data });
  const rowsOf = (id) => table("mcp_servers").filter((r) => r.user_id === id);

  // =================================================================
  console.log("\n== 1. a refused address or a wrong token saves nothing (el, desktop) ==");
  // =================================================================
  const T = L.el.dashboard.integrations.mcp;
  const app = await mock({ token: TOKEN });
  const { context, page } = await open(DESKTOP, "el");
  await page.goto(`${ORIGIN}/dashboard/integrations`, { waitUntil: "networkidle" });
  const section = page.locator('[data-testid="mcp-apps"]');
  check("the by-address section is on the page, with its title and its form", (await section.count()) === 1 && (await section.innerText()).includes(T.title) && (await page.locator('[data-testid="mcp-add-form"]').count()) === 1);
  check("...and it is empty to begin with", (await page.locator('[data-testid="mcp-empty"]').count()) === 1);
  check("no provider card and no dead Connect button without Google or Slack set up", (await page.locator('[data-testid="integration-connect"]').count()) === 0);

  const refusals = [
    ["https://169.254.169.254/latest/meta-data/", 400, "blocked_host"],
    ["https://10.0.0.5/mcp", 400, "blocked_host"],
    ["http://example.com/mcp", 400, "not_https"],
    ["https://user:pw@example.com/mcp", 400, "credentials_in_url"],
    ["not an address", 400, "invalid_url"],
  ];
  for (const [url, status, code] of refusals) {
    const r = await post(page, "/api/mcp", { name: "x", url, token: "" });
    check(`${url} is refused (${code}) and nothing is saved`, r.status() === status && (await r.json()).code === code && rowsOf(USER_A).length === 0, `${r.status()}`);
  }
  const redirecting = await mock({ redirect: true });
  const red = await post(page, "/api/mcp", { name: "x", url: redirecting.url, token: "" });
  check("a server that redirects is refused, not followed, and nothing is saved", red.status() === 422 && (await red.json()).code === "redirect_refused" && rowsOf(USER_A).length === 0 && redirecting.calls.length === 1);
  const noToken = await post(page, "/api/mcp", { name: "Notes", url: app.url, token: "" });
  check("an app that wants a token and gets none: refused, nothing saved", noToken.status() === 422 && (await noToken.json()).code === "unauthorized" && rowsOf(USER_A).length === 0);
  await page.fill('[data-testid="mcp-name"]', "Notes");
  await page.fill('[data-testid="mcp-url"]', app.url);
  await page.fill('[data-testid="mcp-token"]', "wrong-token");
  await page.click('[data-testid="mcp-add"]');
  const toast = await page.getByText(T.errors.unauthorized, { exact: true }).first().waitFor({ state: "visible", timeout: 10000 }).then(() => true, () => false);
  check("a wrong token in the form: the screen says so, in Greek, and nothing is saved", toast && rowsOf(USER_A).length === 0);

  // =================================================================
  console.log("\n== 2. a right address and token connect, and the token is kept encrypted ==");
  // =================================================================
  await page.fill('[data-testid="mcp-token"]', TOKEN);
  await page.click('[data-testid="mcp-add"]');
  await page.locator('[data-testid="mcp-server"]').first().waitFor({ state: "visible", timeout: 15000 }).catch(() => {});
  const card = await page.locator('[data-testid="mcp-server"]').first().innerText().catch(() => "");
  check("the app is listed with its name, its host and its tool count", card.includes("Notes") && card.includes(new URL(app.url).host) && card.includes(fill(T.toolsCount, { count: 3 })), card);
  check("...every tool is shown, read-only ones marked and the others saying they need a press",
    ["echo", "delete_note", "evil"].every((n) => card.includes(n)) && card.includes(T.readOnly) && card.includes(T.needsPress), card);
  check("...and says a token is stored, without saying which", card.includes(T.tokenStored) && !card.includes(TOKEN));
  const row = rowsOf(USER_A)[0];
  check("one row, the caller's", rowsOf(USER_A).length === 1 && row.user_id === USER_A && row.name === "Notes" && row.url === app.url);
  check("the token is stored ENCRYPTED: not the token, in the app's own v1 format", typeof row.auth_token_encrypted === "string" && row.auth_token_encrypted.startsWith("v1.") && !row.auth_token_encrypted.includes(TOKEN));
  check("...and no column of the row holds it in the clear", !JSON.stringify(row).includes(TOKEN));
  check("the tools the app described were saved, with the read-only claims", row.tools.length === 3 && row.tools.find((t) => t.name === "echo").readOnly === true && row.tools.find((t) => t.name === "delete_note").readOnly === false);
  const listed = await page.request.get(`${ORIGIN}/api/mcp`);
  const listedText = await listed.text();
  check("GET /api/mcp lists the app with hasToken, and no token and no ciphertext", listed.status() === 200 && listedText.includes('"hasToken":true') && !listedText.includes(TOKEN) && !listedText.includes("v1.") && !listedText.includes("auth_token"));
  const html = await page.content();
  check("the page, as the browser holds it, never carries the token", !html.includes(TOKEN) && !(await page.locator('[data-testid="mcp-token"]').inputValue()).length);
  const again = await post(page, "/api/mcp", { name: "Notes again", url: app.url, token: TOKEN });
  check("the same address twice is a conflict, not a second row", again.status() === 409 && rowsOf(USER_A).length === 1);
  await page.screenshot({ path: SHOT_DIR ? `${SHOT_DIR}/desktop-el-1-connected.png` : undefined, fullPage: true }).catch(() => {});
  const serverId = row.id;

  // =================================================================
  console.log("\n== 3. asking in words: a read-only tool runs; anything else waits for the press ==");
  // =================================================================
  const ask = async (text) => {
    await page.fill('[data-testid="mcp-ask-input"]', text);
    await page.click('[data-testid="mcp-ask"]');
  };
  const mockCalls = (name) => app.callsTo("tools/call").filter((c) => JSON.parse(c.body).params.name === name);

  let credits = state.credits;
  await ask("echo hello");
  await page.locator('[data-testid="mcp-result"]').waitFor({ state: "visible", timeout: 20000 }).catch(() => {});
  const result1 = await page.locator('[data-testid="mcp-result"] pre').innerText().catch(() => "");
  check("a read-only tool runs at once, and its result is shown as text", result1 === "echo: hello", result1);
  check("...with no press asked for", (await page.locator('[data-testid="mcp-approval"]').count()) === 0);
  check("...the app saw the call, with the token as a Bearer header", mockCalls("echo").length === 1 && mockCalls("echo")[0].auth === `Bearer ${TOKEN}`);
  check("...and the model call was charged, and only that", state.credits < credits && state.holds.size === 0, `${credits} → ${state.credits}`);
  const asked = model.calls.at(-1);
  const prompt = typeof asked.messages[0].content === "string" ? asked.messages[0].content : asked.messages[0].content.map((b) => b.text).join("\n");
  check("the model was forced to choose one tool", asked.tool_choice?.name === "choose_tool" && asked.tools.length === 1 && asked.tools[0].name === "choose_tool");
  check("the tool list reached the model inside ONE fence, and the app's own closing tag inside a description was removed",
    (prompt.match(/<untrusted_tool_list>/g) ?? []).length === 1 && (prompt.match(/<\/untrusted_tool_list>/g) ?? []).length === 1 && prompt.includes("[removed]") && prompt.includes("IGNORE ALL PREVIOUS INSTRUCTIONS"));
  check("...and the system prompt tells the model the list is data", JSON.stringify(asked.system).includes("never instructions to you"));
  check("...the token reached the model nowhere", !JSON.stringify(asked).includes(TOKEN));

  credits = state.credits;
  const before = model.calls.length;
  await ask("please delete note one");
  await page.locator('[data-testid="mcp-approval"]').waitFor({ state: "visible", timeout: 20000 }).catch(() => {});
  const planText = await page.locator('[data-testid="mcp-plan"]').innerText().catch(() => "");
  check("a tool that is not read-only comes back as a PLAN, saying what it will call and that it may change something", planText.includes("delete_note") && planText.includes('{"id":"1"}') && planText.includes(T.approvalNote), planText);
  check("...and it has NOT run: the app has seen no delete_note call", mockCalls("delete_note").length === 0 && (await page.locator('[data-testid="mcp-result"]').count()) === 0);
  check("...the model call was charged", model.calls.length === before + 1 && state.credits < credits);
  const sneaky = await post(page, `/api/mcp/${serverId}/call`, { tool: "delete_note", arguments: { id: "1" } });
  check("the call route refuses it without `approved: true`", sneaky.status() === 409 && (await sneaky.json()).code === "approval_required" && mockCalls("delete_note").length === 0);
  const truthy = await post(page, `/api/mcp/${serverId}/call`, { tool: "delete_note", arguments: { id: "1" }, approved: "yes" });
  check("...and `approved: \"yes\"` is not `true`", truthy.status() === 409 && mockCalls("delete_note").length === 0);
  const unknownTool = await post(page, `/api/mcp/${serverId}/call`, { tool: "format_disk", arguments: {}, approved: true });
  check("...and a tool the app did not list is refused even with the press", unknownTool.status() === 400 && (await unknownTool.json()).code === "unknown_tool" && app.callsTo("tools/call").every((c) => JSON.parse(c.body).params.name !== "format_disk"));
  await page.screenshot({ path: SHOT_DIR ? `${SHOT_DIR}/desktop-el-2-plan.png` : undefined, fullPage: true }).catch(() => {});
  credits = state.credits;
  await page.click('[data-testid="mcp-approve"]');
  await page.locator('[data-testid="mcp-result"]').waitFor({ state: "visible", timeout: 20000 }).catch(() => {});
  check("the press runs it, and the result is shown", (await page.locator('[data-testid="mcp-result"] pre').innerText().catch(() => "")) === "deleted note 1" && mockCalls("delete_note").length === 1);
  check("...with the token, once", mockCalls("delete_note")[0].auth === `Bearer ${TOKEN}`);
  check("...and the call itself cost nothing", state.credits === credits, `${credits} → ${state.credits}`);
  check("...the approval box is gone after it ran", (await page.locator('[data-testid="mcp-approval"]').count()) === 0);

  await ask("evil please");
  await page.locator('[data-testid="mcp-result"]').waitFor({ state: "visible", timeout: 20000 }).catch(() => {});
  const evilText = await page.locator('[data-testid="mcp-result"] pre').innerText().catch(() => "");
  check("an app's result that is an instruction is shown as TEXT", evilText === INJECTION, evilText.slice(0, 120));
  check("...and not obeyed: no delete_note beyond the one the person pressed", mockCalls("delete_note").length === 1 && mockCalls("evil").length === 1);
  check("...it was not fed back to any model: one model call per question", model.calls.length === before + 2);
  check("...and it made no element of its own on the page", (await page.locator('[data-testid="mcp-result"] pre > *').count()) === 0);

  const none = model.calls.length;
  await ask("what is the weather");
  await page.getByText("Τίποτα σε αυτή την εφαρμογή δεν ταιριάζει.", { exact: true }).waitFor({ state: "visible", timeout: 20000 }).catch(() => {});
  check("a request nothing fits says so, and runs nothing", model.calls.length === none + 1 && (await page.locator('[data-testid="mcp-result"]').count()) === 0 && (await page.locator('[data-testid="mcp-approval"]').count()) === 0);
  const inventedBefore = app.calls.length;
  const invent = await post(page, `/api/mcp/${serverId}/run`, { request: "invent a tool" });
  check("a model that names a tool the app never listed gets nothing run (unusable plan)", invent.status() === 422 && (await invent.json()).code === "unusable_plan" && app.calls.length === inventedBefore);

  console.log("\n== 4. nothing charged when it is refused or the model is down ==");
  const modelBeforePoor = model.calls.length;
  state.credits = 0;
  const poor = await post(page, `/api/mcp/${serverId}/run`, { request: "echo hello" });
  const poorBody = await poor.json();
  check("without credits: refused, the model not called, the app not called", poor.status() === 402 && poorBody.code === "insufficient_credits" && model.calls.length === modelBeforePoor && mockCalls("echo").length === 1, `${poor.status()} ${JSON.stringify(poorBody)} model ${model.calls.length} vs ${modelBeforePoor}, echo calls ${mockCalls("echo").length}`);
  state.credits = 3000;
  model.down = true;
  const down = await post(page, `/api/mcp/${serverId}/run`, { request: "echo hello" });
  check("with the model down: says so, and nothing is charged", down.status() === 503 && (await down.json()).code === "ai_unavailable" && state.credits === 3000 && state.holds.size === 0, `${state.credits}`);
  model.down = false;
  const empty = await post(page, `/api/mcp/${serverId}/run`, { request: "   " });
  check("an empty request is refused before anything is spent", empty.status() === 400 && state.credits === 3000);
  const refreshed = await post(page, `/api/mcp/${serverId}/refresh`, {});
  check("refreshing asks the app for its tools again, free", refreshed.status() === 200 && (await refreshed.json()).server.tools.length === 3 && state.credits === 3000);

  // =================================================================
  console.log("\n== 5. user B sees none of user A's apps, and can touch none ==");
  // =================================================================
  const callsBefore = app.calls.length;
  asUser(USER_B);
  const bList = await page.request.get(`${ORIGIN}/api/mcp`);
  check("B's list is empty", bList.status() === 200 && (await bList.json()).servers.length === 0);
  const bDelete = await page.request.delete(`${ORIGIN}/api/mcp/${serverId}`);
  check("B cannot delete A's app (404) and it is still there", bDelete.status() === 404 && rowsOf(USER_A).length === 1);
  const bRefresh = await post(page, `/api/mcp/${serverId}/refresh`, {});
  const bRun = await post(page, `/api/mcp/${serverId}/run`, { request: "echo hello" });
  const bCall = await post(page, `/api/mcp/${serverId}/call`, { tool: "echo", arguments: { text: "x" }, approved: true });
  check("...nor refresh, run or call it (404)", bRefresh.status() === 404 && bRun.status() === 404 && bCall.status() === 404);
  check("...and the app was never contacted for B, with A's token or any other", app.calls.length === callsBefore);
  await page.goto(`${ORIGIN}/dashboard/integrations`, { waitUntil: "networkidle" });
  check("B's page shows no app and none of A's host", (await page.locator('[data-testid="mcp-server"]').count()) === 0 && !(await page.content()).includes(new URL(app.url).host));
  const second = await mock({});
  const bAdd = await post(page, "/api/mcp", { name: "Mine", url: second.url, token: "" });
  check("B connects an app of their own", bAdd.status() === 200 && rowsOf(USER_B).length === 1 && rowsOf(USER_A).length === 1);
  const bSame = await post(page, "/api/mcp", { name: "Same address as A", url: app.url, token: TOKEN });
  check("...and the same address as A's is B's to connect (unique per person, not across people)", bSame.status() === 200 && rowsOf(USER_B).length === 2);
  check("...B's copy of A's token is encrypted for B: A's ciphertext differs", rowsOf(USER_B).find((r) => r.url === app.url).auth_token_encrypted !== row.auth_token_encrypted);
  asUser(USER_A);
  const aList = await page.request.get(`${ORIGIN}/api/mcp`);
  check("back as A: only A's app is listed", (await aList.json()).servers.map((s) => s.id).join() === serverId);
  asUser(USER_B);
  for (const r of rowsOf(USER_B)) await page.request.delete(`${ORIGIN}/api/mcp/${r.id}`);
  asUser(USER_A);

  // =================================================================
  console.log("\n== 6. removing an app ==");
  // =================================================================
  await page.goto(`${ORIGIN}/dashboard/integrations`, { waitUntil: "networkidle" });
  check("the app is on the page after a reload", (await page.locator('[data-testid="mcp-server"]').count()) === 1);
  await page.click('[data-testid="mcp-remove"]');
  await page.locator('[data-testid="mcp-empty"]').waitFor({ state: "visible", timeout: 10000 }).catch(() => {});
  check("removing it empties the list, and the row and its token are gone", (await page.locator('[data-testid="mcp-empty"]').count()) === 1 && rowsOf(USER_A).length === 0);
  check(`no page threw (${pageErrors.length})`, pageErrors.length === 0, pageErrors.slice(0, 3).join(" | "));
  await context.close();

  // =================================================================
  console.log("\n== 7. a Free account: one app, not two ==");
  // =================================================================
  state.tier = "free";
  MOCK_USER.user_metadata = { subscription_tier: "free", preferred_locale: "en" };
  {
    const { context: ctx, page: fp } = await open(DESKTOP, "en");
    await fp.goto(`${ORIGIN}/dashboard/integrations`, { waitUntil: "networkidle" });
    const E = L.en.dashboard.integrations.mcp;
    check("a Free account sees the by-address section, in English", (await fp.locator('[data-testid="mcp-apps"]').innerText()).includes(E.title));
    check("...and no plan wall in front of it", !(await fp.locator("main").innerText()).includes(L.en.common.upgradeRequired.title));
    const one = await post(fp, "/api/mcp", { name: "One", url: app.url, token: TOKEN });
    check("it may connect one app", one.status() === 200 && rowsOf(USER_A).length === 1);
    const two = await post(fp, "/api/mcp", { name: "Two", url: second.url, token: "" });
    const twoBody = await two.json();
    check("...and a second is refused with the limit", two.status() === 403 && twoBody.code === "limit" && twoBody.cap === 1 && rowsOf(USER_A).length === 1, JSON.stringify(twoBody));
    await fp.goto(`${ORIGIN}/dashboard/integrations`, { waitUntil: "networkidle" });
    check("...the page says so in English, and shows the allowance", (await fp.locator("main").innerText()).includes(fill(E.limitNote, { cap: 1 })));
    await fp.request.delete(`${ORIGIN}/api/mcp/${rowsOf(USER_A)[0].id}`);
    await ctx.close();
  }
  state.tier = "growth";
  MOCK_USER.user_metadata = { subscription_tier: "growth", preferred_locale: "el" };

  // =================================================================
  console.log("\n== 8. a phone, in Greek: the screen fits and its targets are 44px ==");
  // =================================================================
  {
    const { context: ctx, page: pp } = await open(PHONE, "el");
    await pp.request.post(`${ORIGIN}/api/mcp`, { data: { name: "Notes", url: app.url, token: TOKEN } });
    await pp.goto(`${ORIGIN}/dashboard/integrations`, { waitUntil: "networkidle" });
    const overflow = await pp.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    check("no sideways scroll", overflow <= 1, `${overflow}px`);
    const boxes = await pp.evaluate(() => ["mcp-add", "mcp-ask", "mcp-remove", "mcp-name", "mcp-url", "mcp-ask-input"].map((id) => { const r = document.querySelector(`[data-testid="${id}"]`)?.getBoundingClientRect(); return [id, r ? Math.round(r.height) : 0]; }));
    check("every button and field is at least 44px high", boxes.every(([, h]) => h >= 44), JSON.stringify(boxes));
    // A real finger: the touch events a phone sends, not a click.
    const cdp = await ctx.newCDPSession(pp);
    const finger = async (locator) => {
      await locator.evaluate((e) => e.scrollIntoView({ block: "center" }));
      await sleep(300);
      const box = await locator.boundingBox();
      const x = box.x + box.width / 2, y = box.y + box.height / 2;
      await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
      await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    };
    await pp.fill('[data-testid="mcp-ask-input"]', "echo hello");
    await finger(pp.locator('[data-testid="mcp-ask"]'));
    await pp.locator('[data-testid="mcp-result"]').waitFor({ state: "visible", timeout: 20000 }).catch(() => {});
    check("a finger asks, and the result is there", (await pp.locator('[data-testid="mcp-result"] pre').innerText().catch(() => "")) === "echo: hello");
    const overflow2 = await pp.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    check("...still no sideways scroll", overflow2 <= 1, `${overflow2}px`);
    if (SHOT_DIR) await pp.screenshot({ path: `${SHOT_DIR}/phone-el-3-result.png`, fullPage: true });
    check(`no page threw (${pageErrors.length})`, pageErrors.length === 0, pageErrors.slice(0, 3).join(" | "));
    await ctx.close();
  }
} catch (err) {
  check("the run completed", false, String(err?.stack ?? err));
} finally {
  try { await browser?.close(); } catch {}
  await cleanup();
}

console.log(failures.length === 0 ? `\nALL PASS: ${pass} passed, 0 failed` : `\n${failures.length} FAILED, ${pass} passed`);
process.exit(failures.length === 0 ? 0 : 1);
