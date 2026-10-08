/*
 * PACKAGE 9 AT ITS EDGES, THROUGH THE REAL ROUTES (MASTER 16, Α9):
 * «ανεβάζω PDF και εικόνα, ρωτάω για αυτά, και βλέπω ποια στοιχεία
 * μνήμης χρησιμοποίησε» — walked as a person would, on a production build,
 * with nothing standing between the screen and the server.
 *
 * scripts/tests/chat-attachments.prodtest.mjs answers /api/chat and
 * /api/files/register from the browser, so it holds the screen. This file
 * holds the rest: the real /api/files/register reads a real PDF back out of
 * the stand-in's storage, and the real /api/chat reads it with the picture
 * and the remembered facts and asks a local stand-in for the model
 * (ANTHROPIC_BASE_URL, which the SDK reads) that streams in the shape the
 * provider streams. The stand-in for Supabase keeps what is written — rows,
 * uploads, holds on credits — so what the routes did is counted, not
 * assumed.
 *
 * Around the walk, in Greek and in English, on a desktop with a mouse and a
 * phone with real touch:
 *   - an account with nothing yet;
 *   - the same question again in the same conversation, and after a reload;
 *   - the provider failing, and the question asked again;
 *   - out of credits;
 *   - a Free account: no memory, a message with a file is never free, the
 *     Files allowance, a scanned PDF;
 *   - no word of the other language in the chat.
 *
 * And six things that were wrong, found by this file on 2026-10-08 and
 * fixed the same day (docs/PROGRESS.md):
 *   1. a question about an attachment that matched a help article was
 *      answered with the article («Πόσο κοστίζει;» about a photograph);
 *   2. the opening question was checked for clarity WITHOUT its
 *      attachments, so «Κάνε μου περίληψη» about a PDF got a question back;
 *   3. out of credits, a Greek screen said so in English;
 *   4. a PDF that Files refused (the Free allowance, a scan, the hourly
 *      upload limit) said why in English;
 *   5. on a phone with a low balance, the top bar's low-credits notice
 *      pushed the account button off the screen and the page scrolled
 *      sideways;
 *   6. «remove» on a chip (32px) and «From memory» (18px tall) were
 *      smaller than a 44px touch target.
 *
 * Run: node scripts/tests/chat-attachments-edges.prodtest.mjs
 *      SKIP_BUILD=1 node scripts/tests/chat-attachments-edges.prodtest.mjs
 */
import http from "node:http";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { chromium } from "playwright";
import { startMockSupabase, MOCK_USER } from "../lib/mock-supabase.mjs";
import { buildPdf } from "./lib/build-pdf.mjs";

let pass = 0;
const failures = [];
let where = "";
function check(name, cond, detail) {
  const label = where ? `[${where}] ${name}` : name;
  if (cond) {
    pass++;
    console.log(`  PASS  ${label}`);
  } else {
    failures.push(label);
    console.log(`  FAIL  ${label}${detail !== undefined ? "\n        " + detail : ""}`);
  }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const L = { el: JSON.parse(readFileSync("messages/el.json", "utf8")), en: JSON.parse(readFileSync("messages/en.json", "utf8")) };
const fill = (s, vars) => s.replace(/\{(\w+)\}/g, (_, k) => String(vars[k]));
const plural = (s, n) => {
  const m = /\{count, plural, one \{([^}]*)\} other \{([^}]*)\}\}/.exec(s);
  return m ? s.replace(m[0], (n === 1 ? m[1] : m[2]).replace("#", String(n))) : fill(s, { count: n });
};

// ---------------------------------------------------------------------
// THE HELP ARTICLES, as seeded (supabase/migrations/20260816_help_articles_seed.sql):
// the rows the chat's canned answers match against, read from the seed so
// a trigger changed there is the trigger tested here.
// ---------------------------------------------------------------------
const SEED = readFileSync("supabase/migrations/20260816_help_articles_seed.sql", "utf8");
const sqlText = (s) => s.replace(/''/g, "'");
function seededArticle(slug, locale) {
  const re = new RegExp(
    `values \\('${slug}', '${locale}', '((?:[^']|'')*)', '((?:[^']|'')*)', '([\\w-]+)', (\\d+), (true|false), array\\[([^\\]]*)\\]::text\\[\\], (null|'[^']*')\\)`
  );
  const m = re.exec(SEED);
  if (!m) throw new Error(`the seed has no ${slug}/${locale}`);
  return {
    slug, locale, title: sqlText(m[1]), body: sqlText(m[2]), category: m[3], order: Number(m[4]), published: m[5] === "true",
    triggers: [...m[6].matchAll(/'((?:[^']|'')*)'/g)].map((t) => sqlText(t[1])),
    href: m[7] === "null" ? null : m[7].slice(1, -1),
  };
}
const ARTICLES = [
  seededArticle("pricing-overview", "el"), seededArticle("pricing-overview", "en"),
  seededArticle("what-is-ionexa", "el"), seededArticle("what-is-ionexa", "en"),
];

// ---------------------------------------------------------------------
// THE STAND-IN FOR SUPABASE, KEEPING WHAT IS WRITTEN
// ---------------------------------------------------------------------
const tables = new Map();
const table = (name) => {
  if (!tables.has(name)) tables.set(name, []);
  return tables.get(name);
};
const objects = new Map(); // "bucket/path" -> { bytes, type }
const rpcs = []; // { name, args }
const state = { credits: 3000, uploadsBlocked: false };
let clock = Date.parse("2026-10-08T09:00:00Z");
const now = () => new Date((clock += 1000)).toISOString();

const MEMORY = { el: "Η επιχείρηση λέγεται Αύρα και είναι στη Νάξο", en: "The business is called Avra and is on Naxos" };

function reset({ locale, tier = "growth", credits = 3000, files = 0 }) {
  tables.clear();
  objects.clear();
  rpcs.length = 0;
  state.credits = credits;
  state.uploadsBlocked = false;
  MOCK_USER.user_metadata = { subscription_tier: tier };
  table("user_credits").push({ user_id: MOCK_USER.id, credits_remaining: credits, credits_total: credits, plan_tier: tier, beta_expires_at: null });
  table("user_onboarding").push({ user_id: MOCK_USER.id, completed_at: "2026-01-02T00:00:00Z", skipped_at: null });
  table("chat_memory").push({ id: "a1111111-1111-4111-8111-111111111111", user_id: MOCK_USER.id, memory_text: MEMORY[locale], memory_fold: "x", times_seen: 3, last_seen_at: "2026-10-01T10:00:00Z", created_at: "2026-09-01T10:00:00Z" });
  table("help_articles").push(...ARTICLES);
  for (let i = 0; i < files; i++) {
    table("user_files").push({ id: randomUUID(), user_id: MOCK_USER.id, filename: `old-${i}.pdf`, file_type: "pdf", size_bytes: 1000, page_count: 1, char_count: 10, processing_status: "ready", error: null, extracted_text: "[[PAGE 1|Page 1]]\nold", uploaded_at: "2026-09-01T10:00:00Z", created_at: "2026-09-01T10:00:00Z" });
  }
}

const PASS_THROUGH = new Set(["select", "order", "limit", "offset", "on_conflict", "columns"]);
function matches(row, params) {
  for (const [key, raw] of params) {
    if (PASS_THROUGH.has(key)) continue;
    const v = String(raw);
    let m;
    if ((m = /^eq\.(.*)$/s.exec(v)) && String(row[key]) !== m[1]) return false;
    if ((m = /^neq\.(.*)$/s.exec(v)) && String(row[key]) === m[1]) return false;
    if ((m = /^in\.\((.*)\)$/s.exec(v)) && !m[1].split(",").map((s) => s.replace(/^"|"$/g, "")).includes(String(row[key]))) return false;
    if (v === "is.null" && row[key] != null) return false;
    if (v === "not.is.null" && row[key] == null) return false;
  }
  return true;
}
function query(name, params) {
  let out = table(name).filter((row) => matches(row, params));
  const order = params.get("order");
  if (order) {
    const [col, dir] = order.split(",")[0].split(".");
    out = [...out].sort((a, b) => (String(a[col] ?? "") < String(b[col] ?? "") ? -1 : String(a[col] ?? "") > String(b[col] ?? "") ? 1 : 0) * (dir === "desc" ? -1 : 1));
  }
  const limit = Number(params.get("limit") ?? 0);
  return limit > 0 ? out.slice(0, limit) : out;
}

/** The file part of a multipart upload, as the browser's FormData sends it. */
function filePart(raw, contentType) {
  const b = /boundary=(?:"([^"]+)"|([^;]+))/.exec(contentType ?? "");
  if (!b) return { bytes: raw, type: contentType || "application/octet-stream" };
  const boundary = Buffer.from(`--${b[1] ?? b[2]}`);
  let at = raw.indexOf(boundary);
  while (at >= 0) {
    const next = raw.indexOf(boundary, at + boundary.length);
    if (next < 0) break;
    const part = raw.subarray(at + boundary.length + 2, next - 2);
    const headEnd = part.indexOf("\r\n\r\n");
    const head = part.subarray(0, headEnd).toString("utf8");
    if (/filename=/.test(head)) {
      return { bytes: Buffer.from(part.subarray(headEnd + 4)), type: /content-type:\s*([^\r\n]+)/i.exec(head)?.[1]?.trim() ?? "application/octet-stream" };
    }
    at = next;
  }
  return { bytes: raw, type: "application/octet-stream" };
}

// A stand-in that throws takes the whole run down with it and leaves the
// server behind, so a mistake in it is answered as a 500 and said.
function handle(args) {
  try {
    return answer(args);
  } catch (err) {
    console.log(`  stand-in error: ${err?.stack ?? err}`);
    args.res.writeHead(500, { "Content-Type": "application/json" });
    args.res.end(JSON.stringify({ message: String(err) }));
    return true;
  }
}
function answer({ req, res, url, body, raw }) {
  const p = decodeURIComponent(url.pathname);
  const send = (code, payload, headers = {}) => {
    res.writeHead(code, { "Content-Type": "application/json", ...headers });
    res.end(payload === undefined ? "" : JSON.stringify(payload));
    return true;
  };

  // ---- storage
  if (p.startsWith("/storage/v1/object/sign/")) {
    const key = p.slice("/storage/v1/object/sign/".length);
    if (req.method === "POST") return send(200, { signedURL: `/object/sign/${key}?token=t` });
    const object = objects.get(key);
    if (!object) return send(404, { statusCode: "404", error: "not_found", message: "Object not found" });
    res.writeHead(200, { "Content-Type": object.type });
    res.end(object.bytes);
    return true;
  }
  if (p.startsWith("/storage/v1/object/")) {
    const rest = p.slice("/storage/v1/object/".length).replace(/^authenticated\//, "");
    if (req.method === "DELETE") {
      let prefixes = [];
      try { prefixes = JSON.parse(body || "{}").prefixes ?? []; } catch {}
      const removed = prefixes.filter((path) => objects.delete(`${rest}/${path}`));
      return send(200, removed.map((name) => ({ name })));
    }
    if (req.method === "POST" || req.method === "PUT") {
      objects.set(rest, filePart(raw, req.headers["content-type"]));
      return send(200, { Key: rest, Id: randomUUID() });
    }
    const object = objects.get(rest);
    if (!object) return send(400, { statusCode: "404", error: "not_found", message: "Object not found" });
    res.writeHead(200, { "Content-Type": object.type });
    res.end(object.bytes);
    return true;
  }
  if (p.startsWith("/storage/v1/")) return send(200, {});

  // ---- database functions
  if (p.startsWith("/rest/v1/rpc/")) {
    const name = p.slice("/rest/v1/rpc/".length);
    let args = {};
    try { args = JSON.parse(body || "{}"); } catch {}
    rpcs.push({ name, args });
    if (name === "reserve_credits") {
      if (state.credits >= args.p_credits) {
        state.credits -= args.p_credits;
        return send(200, [{ reservation_id: randomUUID(), available: state.credits }]);
      }
      return send(200, [{ reservation_id: null, available: state.credits }]);
    }
    if (name === "consume_free_chat") return send(200, [{ granted: true, used: 1, remaining: 9 }]);
    // The hourly upload limit (lib/rate-limit.ts), reached when the test says so.
    if (name === "consume_rate_limit") return send(200, !(state.uploadsBlocked && args.p_scope === "file_upload"));
    res.writeHead(204);
    res.end();
    return true;
  }

  // ---- tables
  if (p.startsWith("/rest/v1/")) {
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
      for (const row of name === "user_credits" ? table(name) : []) row.credits_remaining = state.credits;
      return respond(query(name, url.searchParams));
    }
    let payload = null;
    try { payload = JSON.parse(body || "null"); } catch {}
    if (req.method === "POST") {
      const added = (Array.isArray(payload) ? payload : [payload]).filter(Boolean).map((row) => ({ id: randomUUID(), created_at: now(), ...row }));
      table(name).push(...added);
      return /return=representation/.test(prefer) ? respond(added, 201) : send(201, undefined);
    }
    if (req.method === "PATCH") {
      const hit = table(name).filter((row) => matches(row, url.searchParams));
      hit.forEach((row) => Object.assign(row, payload ?? {}));
      return /return=representation/.test(prefer) ? respond(hit) : send(204, undefined);
    }
    if (req.method === "DELETE") {
      const keep = table(name).filter((row) => !matches(row, url.searchParams));
      tables.set(name, keep);
      return send(204, undefined);
    }
  }
  return false;
}

reset({ locale: "el" });
const supa = await startMockSupabase({ port: 54443, handle });

// ---------------------------------------------------------------------
// THE STAND-IN FOR THE MODEL: it answers from what it was given
// ---------------------------------------------------------------------
const model = { calls: [], down: false };
const textOf = (content) => (typeof content === "string" ? content : (content ?? []).filter((b) => b.type === "text").map((b) => b.text).join("\n"));
const modelServer = http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    const asked = JSON.parse(body || "{}");
    const reply = (code, payload) => {
      res.writeHead(code, { "Content-Type": "application/json", "request-id": "req_test" });
      res.end(JSON.stringify(payload));
    };
    if (req.url.startsWith("/v1/messages/count_tokens")) return reply(200, { input_tokens: 12 });
    model.calls.push(asked);
    if (model.down) return reply(529, { type: "error", error: { type: "overloaded_error", message: "Overloaded" } });
    const usage = { input_tokens: 1500, output_tokens: 60 };
    const question = textOf(asked.messages.at(-1).content).split("\n").at(-1);
    if (asked.tool_choice?.name === "evaluate_request_clarity") {
      // As a model reads a request that does not name its object, when it
      // is not shown the object.
      const vague = /περίληψη|summar|what is this|τι είναι αυτό/i.test(question);
      return reply(200, {
        id: "msg_c", type: "message", role: "assistant", model: asked.model, stop_reason: "tool_use", usage,
        content: [{ type: "tool_use", id: "tu_c", name: "evaluate_request_clarity", input: vague
          ? { needsClarification: true, questions: [{ question: "Περίληψη ποιου κειμένου;", suggestions: ["Ενός άρθρου", "Ενός email"] }] }
          : { needsClarification: false, questions: [] } }],
      });
    }
    if (!asked.stream) return reply(200, { id: "msg_m", type: "message", role: "assistant", model: asked.model, stop_reason: "end_turn", usage, content: [{ type: "text", text: "NONE" }] });

    // THE ANSWER, from what arrived with the question.
    const last = asked.messages.at(-1).content;
    const blocks = Array.isArray(last) ? last : [];
    const docs = textOf(blocks);
    const page2 = /<document name="menu\.pdf">[\s\S]*--- [^\n]*2 ---\nMoussaka 12 EUR[\s\S]*<\/document>/.test(docs);
    const page3 = /<document name="menu\.pdf">[\s\S]*--- [^\n]*3 ---\nDesserts 6 EUR[\s\S]*<\/document>/.test(docs);
    const image = blocks.some((b) => b.type === "image" && b.source?.type === "base64" && b.source.data.length > 100);
    const system = Array.isArray(asked.system) ? asked.system.map((s) => s.text).join("\n") : String(asked.system ?? "");
    const english = !/[α-ωά-ώ]/i.test(question);
    const remembered = Object.values(MEMORY).some((m) => system.includes(m)) && system.includes("⟦μνήμη: 1, 3⟧");
    const pieces = [];
    if (/γλυκ|dessert/i.test(question)) pieces.push(page3 ? (english ? "Desserts are 6 EUR (page 3)." : "Τα γλυκά κάνουν 6 ευρώ (σελίδα 3).") : english ? "I see no menu." : "Δεν βλέπω κατάλογο.");
    else if (page2) pieces.push(english ? "Moussaka costs 12 EUR (page 2)." : "Ο μουσακάς κοστίζει 12 ευρώ (σελίδα 2).");
    else pieces.push(english ? "I see no document." : "Δεν βλέπω κάποιο έγγραφο.");
    if (image) pieces.push(english ? " The picture shows a blue plan." : " Στην εικόνα βλέπω ένα μπλε σχέδιο.");
    if (remembered) pieces.push(english ? " For Avra on Naxos I would list it first." : " Για την Αύρα στη Νάξο θα τον έβαζα πρώτο.", "\n⟦μνήμη: 1⟧");
    res.writeHead(200, { "Content-Type": "text/event-stream", "request-id": "req_test" });
    const sse = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    sse("message_start", { type: "message_start", message: { id: "msg_s", type: "message", role: "assistant", model: asked.model, content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 1500, output_tokens: 1 } } });
    sse("content_block_start", { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } });
    for (const text of pieces) sse("content_block_delta", { type: "content_block_delta", index: 0, delta: { type: "text_delta", text } });
    sse("content_block_stop", { type: "content_block_stop", index: 0 });
    sse("message_delta", { type: "message_delta", delta: { stop_reason: "end_turn", stop_sequence: null }, usage: { output_tokens: 60 } });
    sse("message_stop", { type: "message_stop" });
    res.end();
  });
});
await new Promise((r) => modelServer.listen(0, "127.0.0.1", r));
const MODEL_URL = `http://127.0.0.1:${modelServer.address().port}`;

// ---------------------------------------------------------------------
// THE BUILD AND THE SERVER
// ---------------------------------------------------------------------
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
  // The test account: the switch is on, and the account is CHARGED like
  // any customer's (admin is not), so holds and the Free path are real.
  TEST_ACCOUNT_EMAILS: MOCK_USER.email,
  ANTHROPIC_API_KEY: "placeholder-answered-locally",
  ANTHROPIC_BASE_URL: MODEL_URL,
};

const servers = [];
const pageErrors = [];
let currentPage = null;
let browser = null;
const cleanup = () => {
  for (const server of servers) {
    try { if (server?.pid) process.kill(-server.pid, "SIGKILL"); } catch {}
  }
  try { supa.close(); } catch {}
  try { modelServer.close(); } catch {}
};

async function start(env) {
  const port = await freePort();
  const origin = `http://127.0.0.1:${port}`;
  const server = spawn("npx", ["next", "start", "-p", String(port)], { env: { ...env, PORT: String(port), NEXT_PUBLIC_SITE_URL: origin }, stdio: ["ignore", "pipe", "pipe"], detached: true });
  servers.push(server);
  server.stderr.on("data", (d) => process.env.EDGES_SERVER_LOG && process.stderr.write(d));
  server.stdout.on("data", (d) => process.env.EDGES_SERVER_LOG && process.stderr.write(d));
  for (let i = 0; i < 90; i++) {
    try {
      await new Promise((res, rej) => { const r = http.get(`${origin}/api/health`, () => res()); r.on("error", rej); });
      return origin;
    } catch { await sleep(1000); }
  }
  throw new Error("the production server did not start");
}

const PNG = await sharp({ create: { width: 64, height: 48, channels: 3, background: { r: 30, g: 120, b: 200 } } }).png().toBuffer();
const MENU = buildPdf(["MENU - Taverna Avra", "Moussaka 12 EUR", "Desserts 6 EUR"]);
const SCAN = buildPdf([""]);
const menuFile = { name: "menu.pdf", mimeType: "application/pdf", buffer: MENU };
const planFile = { name: "plan.png", mimeType: "image/png", buffer: PNG };
const scanFile = { name: "scan.pdf", mimeType: "application/pdf", buffer: SCAN };

// What a screen in one language must never show from the other: every
// sentence the Chat, its attachments and the error lines have in the other
// language, and the server's own English sentences that used to reach it.
function sentences(node, out = []) {
  if (typeof node === "string") out.push(node);
  else if (node && typeof node === "object") for (const v of Object.values(node)) sentences(v, out);
  return out;
}
const SERVER_ENGLISH = ["Not enough credits", "No credits were charged", "Your plan includes", "no text layer", "could not be read", "appears to be empty", "Too many uploads", "Something went wrong"];
function foreignOn(locale, text) {
  if (locale === "el") {
    const theirs = sentences([L.en.dashboard.chat, L.en.errors.codes, L.en.errors.credits])
      .filter((s) => s.length >= 14 && / /.test(s) && !/[{}]/.test(s) && !sentences([L.el.dashboard.chat, L.el.errors]).includes(s));
    return [...SERVER_ENGLISH, ...theirs].filter((s) => text.includes(s));
  }
  return (text.match(/[^\s.,;:!?«»“”()]*[α-ωά-ώΑ-ΩΆ-Ώ][^\s.,;:!?«»“”()]*/g) ?? []).slice(0, 6);
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
  const ON = await start(base);
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium" });

  for (const locale of ["el", "en"]) {
    const T = L[locale];
    const A = T.dashboard.chat.attach;
    const E = T.errors;
    const Q = locale === "el"
      ? { price: "Τι τιμή έχει ο μουσακάς;", desserts: "Και τα γλυκά;", vague: "Κάνε μου περίληψη", canned: "Πόσο κοστίζει;", twelve: "12 ευρώ", six: "6 ευρώ", noDoc: "Δεν βλέπω κάποιο έγγραφο" }
      : { price: "How much is the moussaka?", desserts: "And the desserts?", vague: "Summarise it", canned: "What is this?", twelve: "12 EUR", six: "6 EUR", noDoc: "I see no document" };
    const cannedBody = ARTICLES.find((a) => a.locale === locale && a.triggers.some((t) => Q.canned.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").includes(t))).body;

    for (const device of [
      { label: "desktop", viewport: { width: 1440, height: 900 }, touch: false },
      { label: "phone", viewport: { width: 390, height: 844 }, touch: true },
    ]) {
      where = `${locale} ${device.label}`;
      console.log(`\n== ${locale} · ${device.label} ${device.viewport.width}x${device.viewport.height} ==`);
      reset({ locale });
      const context = await browser.newContext({ viewport: device.viewport, hasTouch: device.touch, isMobile: device.touch });
      await context.addCookies(
        [
          { ...supa.authCookie, url: ON, httpOnly: false, secure: false, sameSite: "Lax" },
          { name: "NEXT_LOCALE", value: locale, url: ON },
        ].map(({ domain, path, ...c }) => c)
      );
      const page = await context.newPage();
      currentPage = page;
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
      const field = page.locator("textarea").first();
      const sendButton = page.locator(`button[type="submit"][aria-label="${T.dashboard.chat.send}"]`);
      const plus = page.locator('[data-testid="composer-attach"]');
      const chips = page.locator('[data-testid="chat-attach-chip"]');
      const thread = page.locator('[data-testid="chat-thread"]');
      /** Choose files the way a person does: press «+», pick in the dialog. */
      async function attach(files) {
        const chooser = page.waitForEvent("filechooser", { timeout: 5000 });
        await press(plus);
        await (await chooser).setFiles(files);
      }
      async function chipsSettled() {
        await page.waitForFunction(() => ![...document.querySelectorAll('[data-testid="chat-attach-chip"]')].some((c) => c.getAttribute("data-state") === "reading"), null, { timeout: 15000 }).catch(() => null);
      }
      async function ask(text) {
        await press(field);
        await field.fill(text);
        await press(sendButton);
      }
      /** Until the thread has said something new and stopped sending. */
      async function settled(needles) {
        await page.waitForFunction(
          (ns) => ns.some((n) => document.body.innerText.includes(n)) && !document.querySelector('[data-testid="chat-stop"]'),
          needles, { timeout: 25000 }
        ).catch(() => null);
        await sleep(400);
      }
      const visible = async () => (await page.locator("main").innerText().catch(() => "")) || (await page.locator("body").innerText());
      const fresh = async () => {
        await page.goto(`${ON}/dashboard/chat`, { waitUntil: "networkidle" });
      };
      const calls = () => model.calls.length;
      // THE PAGE NEVER SCROLLS SIDEWAYS, measured after every step: what
      // overflows is named by its innermost elements outside anything fixed
      // (a fixed bar widens WITH the page, so it is a symptom, not a cause).
      const sideways = [];
      async function measureSideways(step) {
        const found = await page.evaluate(() => {
          const width = document.documentElement.clientWidth;
          const over = document.documentElement.scrollWidth - width;
          if (over <= 1) return null;
          const inFixed = (e) => { for (let n = e; n; n = n.parentElement) if (getComputedStyle(n).position === "fixed") return true; return false; };
          const wide = (e) => e.getBoundingClientRect().right > width + 1;
          const leaves = [...document.querySelectorAll("body *")].filter((e) => wide(e) && !inFixed(e) && ![...e.children].some(wide));
          return `${over}px: ` + leaves.slice(0, 3).map((e) => {
            const near = e.closest("[data-testid]")?.getAttribute("data-testid") ?? "(no testid)";
            return `${e.tagName.toLowerCase()} in ${near} "${(e.textContent ?? "").trim().slice(0, 50)}" to ${Math.round(e.getBoundingClientRect().right)}px`;
          }).join(", ");
        });
        if (found) sideways.push(`after ${step}: ${found}`);
      }
      const answerCalls = (since) => model.calls.slice(since).filter((c) => c.stream);

      // ---- 1. an account with nothing yet
      await fresh();
      check("empty: the Chat opens with the «+» in the field, a 44px target", (await plus.count()) === 1 && ((await plus.boundingBox())?.height ?? 0) >= 44 && (await plus.getAttribute("aria-label")) === A.label);
      check("...nothing on the tray, nothing to send yet", (await chips.count()) === 0 && (await sendButton.isDisabled()));
      check("...and not a word of the other language", foreignOn(locale, await visible()).length === 0, foreignOn(locale, await visible()).join(" | "));

      await measureSideways("step 1");
      // ---- 2. a PDF and a picture, asked about, through the real routes
      await attach([menuFile, planFile]);
      await chips.first().waitFor({ timeout: 5000 }).catch(() => null);
      await chipsSettled();
      const pdfObjects = [...objects.keys()].filter((k) => k.startsWith(`user-files/${MOCK_USER.id}/`));
      const registered = table("user_files").find((f) => f.filename === "menu.pdf");
      check("the PDF went into Files, and Files read its three pages", pdfObjects.length === 1 && registered?.processing_status === "ready" && registered?.page_count === 3, JSON.stringify(registered ?? null)?.slice(0, 200));
      check("...the chip says so", (await chips.nth(0).innerText()).includes(plural(A.pages, 3)), await chips.nth(0).innerText());
      // Touch targets of at least 44px (docs/CONTEXT.md, ΣΥΣΤΗΜΑ DESIGN).
      const removeBox = await page.locator('[data-testid="chat-attach-remove"]').first().boundingBox();
      check("...and its «remove» is a 44px target", removeBox && removeBox.width >= 44 && removeBox.height >= 44, JSON.stringify(removeBox));
      let since = calls();
      await ask(Q.price);
      await settled([Q.twelve, Q.noDoc]);
      let asked = answerCalls(since)[0];
      check("the model got the document with its pages and the picture", Boolean(asked) && /--- [^\n]*2 ---\nMoussaka 12 EUR/.test(textOf(asked.messages.at(-1).content)) && asked.messages.at(-1).content.some((b) => b.type === "image"));
      check("...and was not first asked whether the question is clear", !model.calls.slice(since).some((c) => c.tool_choice?.name === "evaluate_request_clarity"));
      const said = await thread.innerText();
      check("the answer is on the screen, from the document and the picture", said.includes(Q.twelve) && (locale === "el" ? said.includes("μπλε σχέδιο") : said.includes("blue plan")), said.slice(-300));
      check("...without the memory marker", !said.includes("⟦"));
      const memory = page.locator('[data-testid="chat-memories-used"]').last();
      check("under it, «From memory (1)»", (await memory.count()) === 1 && (await memory.innerText()).includes(plural(A.memoryUsed, 1)));
      const memoryBox = await memory.locator("summary").boundingBox();
      check("...a 44px target to open", memoryBox && memoryBox.height >= 44, JSON.stringify(memoryBox));
      await press(memory.locator("summary"));
      await sleep(200);
      check("...opened: the fact it used", (await memory.innerText()).includes(MEMORY[locale]));
      const sentRow = page.locator('[data-testid="chat-sent-attachments"]').last();
      check("the question shows what it carried", (await sentRow.innerText()).includes("menu.pdf") && (await sentRow.locator("img").count()) === 1);
      const userRows = table("chat_messages").filter((m) => m.role === "user");
      const answerRows = table("chat_messages").filter((m) => m.role === "assistant");
      check("the user's row keeps both attachments", userRows.length === 1 && (userRows[0].attachments ?? []).map((a) => a.kind).join(",") === "pdf,image", JSON.stringify(userRows[0]?.attachments));
      check("the answer's row keeps the memory, not the marker", answerRows.length === 1 && !String(answerRows[0].content).includes("⟦") && answerRows[0].provenance?.memories?.[0]?.text === MEMORY[locale]);
      check("a message with files is paid, never free: held, settled, no free message used",
        rpcs.some((r) => r.name === "reserve_credits") && rpcs.some((r) => r.name === "settle_reservation") && !rpcs.some((r) => r.name === "consume_free_chat"), rpcs.map((r) => r.name).join(","));

      await measureSideways("step 2");
      // ---- 3. the next question in the same conversation still sees the PDF
      since = calls();
      await ask(Q.desserts);
      await settled([Q.six, "I see no menu", "Δεν βλέπω κατάλογο"]);
      check("a follow-up in the same conversation is answered from the same PDF", (await thread.innerText()).includes(Q.six) && answerCalls(since).length === 1);

      await measureSideways("step 3");
      // ---- 4. a reload shows it all again
      const conversationId = table("chat_conversations")[0]?.id;
      await page.goto(`${ON}/dashboard/chat?c=${conversationId}`, { waitUntil: "networkidle" });
      await page.locator('[data-testid="chat-sent-attachments"]').first().waitFor({ timeout: 8000 }).catch(() => null);
      await page.waitForFunction(() => !!document.querySelector('[data-testid="chat-sent-attachments"] img'), null, { timeout: 5000 }).catch(() => null);
      check("after a reload: the PDF, the picture and «From memory»",
        (await page.locator('[data-testid="chat-sent-attachments"]').first().innerText().catch(() => "")).includes("menu.pdf") &&
          (await page.locator('[data-testid="chat-sent-attachments"] img').count()) === 1 &&
          (await page.locator('[data-testid="chat-memories-used"]').first().innerText().catch(() => "")).includes(plural(A.memoryUsed, 1)));
      check("...and not a word of the other language", foreignOn(locale, await visible()).length === 0, foreignOn(locale, await visible()).join(" | "));

      await measureSideways("step 4");
      // ---- 5. an opening question that names no object, about a PDF
      await fresh();
      await attach([menuFile]);
      await chipsSettled();
      since = calls();
      await ask(Q.vague);
      await settled([Q.twelve, Q.noDoc, "Περίληψη ποιου κειμένου"]);
      check("«" + Q.vague + "» about a PDF is answered from it, not met with a question",
        (await page.locator('[data-testid="chat-clarify"]').count()) === 0 && (await thread.innerText()).includes(Q.twelve),
        (await thread.innerText()).slice(-200));
      check("...the clarity check is not paid for with the object attached", !model.calls.slice(since).some((c) => c.tool_choice?.name === "evaluate_request_clarity"));

      await measureSideways("step 5");
      // ---- 6. a question about a picture that a help article also matches
      await fresh();
      await attach([planFile]);
      since = calls();
      await ask(Q.canned);
      await settled([Q.noDoc, cannedBody.slice(0, 40)]);
      check("«" + Q.canned + "» about a picture reaches the model with the picture",
        answerCalls(since).length === 1 && answerCalls(since)[0].messages.at(-1).content.some?.((b) => b.type === "image"));
      check("...and is not answered with the help article", !(await thread.innerText()).includes(cannedBody.slice(0, 40)));

      await measureSideways("step 6");
      // ---- 7. the provider fails, then the question is asked again
      await fresh();
      await attach([menuFile]);
      await chipsSettled();
      model.down = true;
      const releasesBefore = rpcs.filter((r) => r.name === "release_reservation").length;
      const settlesBefore = rpcs.filter((r) => r.name === "settle_reservation").length;
      await ask(Q.price);
      await settled([E.codes.serverError.what, E.codes.upstreamUnavailable.what]);
      const failed = await visible();
      check("provider down: the screen says so in its own language", failed.includes(E.codes.serverError.what) || failed.includes(E.codes.upstreamUnavailable.what), failed.slice(-300));
      check("...and nothing in the other", foreignOn(locale, failed).length === 0, foreignOn(locale, failed).join(" | "));
      check("...the hold is given back, nothing settled",
        rpcs.filter((r) => r.name === "release_reservation").length === releasesBefore + 1 && rpcs.filter((r) => r.name === "settle_reservation").length === settlesBefore);
      model.down = false;
      since = calls();
      await ask(Q.price);
      await settled([Q.twelve, Q.noDoc]);
      check("asked again without attaching again: answered from the same PDF", (await thread.innerText()).includes(Q.twelve) && answerCalls(since).length === 1);

      await measureSideways("step 7");
      // ---- 8. out of credits
      await fresh();
      state.credits = 0;
      await attach([menuFile, planFile]);
      await chipsSettled();
      since = calls();
      const imagesBefore = [...objects.keys()].filter((k) => k.startsWith("create-attachments/")).length;
      await ask(Q.price);
      await settled([E.codes.insufficientCredits.what, "Not enough credits"]);
      const broke = await visible();
      check("out of credits: said in the screen's language", broke.includes(E.codes.insufficientCredits.what), broke.slice(-300));
      check("...and nothing in the other", foreignOn(locale, broke).length === 0, foreignOn(locale, broke).join(" | "));
      check("...nothing asked of the model, nothing held", calls() === since && !rpcs.slice(-6).some((r) => r.name === "reserve_credits" && r.args.p_credits <= 0));
      check("...the picture that went up for it is removed, the tray kept", [...objects.keys()].filter((k) => k.startsWith("create-attachments/")).length === imagesBefore && (await chips.count()) === 2);
      state.credits = 3000;

      await measureSideways("step 8");
      // ---- 9. a Free account, new: nothing in Files yet
      MOCK_USER.user_metadata = { subscription_tier: "free" };
      state.credits = 100;
      tables.set("user_files", []);
      await fresh();
      await attach([menuFile]);
      await chipsSettled();
      const rpcsBefore = rpcs.length;
      since = calls();
      await ask(Q.price);
      await settled([Q.twelve, Q.noDoc]);
      check("Free: a question about a PDF is answered", (await thread.innerText()).includes(Q.twelve));
      check("...paid from its credits, not as a free message", rpcs.slice(rpcsBefore).some((r) => r.name === "reserve_credits") && !rpcs.slice(rpcsBefore).some((r) => r.name === "consume_free_chat"));
      check("...and Free remembers nothing, so there is no «From memory»", (await page.locator('[data-testid="chat-memories-used"]').count()) === 0 && !answerCalls(since).some((c) => JSON.stringify(c.system ?? "").includes(MEMORY[locale])));
      // At the Files allowance (3 on Free, lib/files/limits.ts).
      while (table("user_files").length < 3) table("user_files").push({ id: randomUUID(), user_id: MOCK_USER.id, filename: "old.pdf", processing_status: "ready", size_bytes: 10 });
      await fresh();
      await attach([menuFile]);
      await chipsSettled();
      const capped = await chips.first().innerText().catch(() => "");
      check("Free at its Files allowance: the chip says so in the screen's language", (await chips.first().getAttribute("data-state")) === "failed" && capped.includes(fill(A.fileLimit ?? "\u0000", { name: "menu.pdf" })), capped);
      check("...nothing in the other language, and sending waits",
        foreignOn(locale, await visible()).length === 0 && (await page.locator('[data-testid="chat-attach-hold"]').innerText().catch(() => "")) === A.holdFailed, foreignOn(locale, await visible()).join(" | "));
      MOCK_USER.user_metadata = { subscription_tier: "growth" };

      await measureSideways("step 9");
      // ---- 10. a scanned PDF
      await fresh();
      await attach([scanFile]);
      await chipsSettled();
      const scanned = await chips.first().innerText().catch(() => "");
      check("a scanned PDF: the chip says it has no text, in the screen's language", (await chips.first().getAttribute("data-state")) === "failed" && scanned.includes(fill(A.unreadable, { name: "scan.pdf" })), scanned);
      check("...nothing in the other language", foreignOn(locale, await visible()).length === 0, foreignOn(locale, await visible()).join(" | "));
      await measureSideways("step 10");

      // ---- 11. the hourly upload limit
      await fresh();
      state.uploadsBlocked = true;
      await attach([menuFile]);
      await chipsSettled();
      const limited = await chips.first().innerText().catch(() => "");
      check("the hourly upload limit: the chip says so in the screen's language", (await chips.first().getAttribute("data-state")) === "failed" && limited.includes(A.uploadLimit ?? "\u0000"), limited);
      check("...nothing in the other language", foreignOn(locale, await visible()).length === 0, foreignOn(locale, await visible()).join(" | "));
      state.uploadsBlocked = false;
      await measureSideways("step 11");
      check("the page never scrolls sideways, at any step", sideways.length === 0, sideways.slice(0, 3).join("\n        "));
      check(`no page threw (${pageErrors.length})`, pageErrors.length === 0, pageErrors.slice(0, 3).join(" | "));
      await context.close();
    }
  }
  where = "";
} catch (err) {
  // EDGES_SHOTS=<dir> keeps a picture of the screen the run stopped on.
  if (process.env.EDGES_SHOTS && currentPage) await currentPage.screenshot({ path: `${process.env.EDGES_SHOTS}/edges-stopped.png`, fullPage: true }).catch(() => {});
  check("the run completed", false, String(err?.stack ?? err) + (pageErrors.length ? `\n        page errors: ${pageErrors.slice(0, 3).join(" | ")}` : ""));
} finally {
  if (browser) await browser.close().catch(() => {});
  cleanup();
}

console.log(failures.length ? `\nFAILURES: ${pass} passed, ${failures.length} failed` : `\nALL PASS: ${pass} passed, 0 failed`);
process.exit(failures.length === 0 ? 0 : 1);
