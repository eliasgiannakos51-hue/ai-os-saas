/*
 * PACKAGE 10 THROUGH THE REAL ROUTES, AND ITS EDGES (MASTER 16, Α10:
 * «Site: παίρνω site πέντε σελίδων, αλλάζω μια ενότητα με λόγια, και το
 * δημοσιεύω σε δική του διεύθυνση.»)
 *
 * Run: node scripts/tests/site-pages-edges.prodtest.mjs
 *      SKIP_BUILD=1 node scripts/tests/site-pages-edges.prodtest.mjs
 *
 * scripts/tests/site-pages.prodtest.mjs answers the Site's own routes in
 * the browser, so it proves the SCREEN. This file proves the routes under
 * it: nothing here is answered by page.route. What is real: `next build`,
 * `next start`, /api/websites/generate, /api/websites/generate/process,
 * /api/websites/status, /api/websites/edit, /api/websites/[id]/undo,
 * /api/websites/[id]/publish, and the public /s/<address> route that
 * serves what publishing wrote.
 *
 * WHAT STANDS IN: the database (PostgREST's shapes, and STATEFUL — an
 * insert is what the next read returns, a filter filters), and Anthropic,
 * reached through ANTHROPIC_BASE_URL, the SDK's own documented variable,
 * so nothing in the app knows it is under test. The model writes five
 * pages in the Messages streaming protocol; a provider outage is answered
 * the way the real API answers one (HTTP 529, overloaded_error).
 *
 * THE EDGES, each where it applies to this package:
 *   - the empty state: a new account with no site yet;
 *   - a provider error, on making a site and on changing one;
 *   - out of credits, on making a site and on changing one;
 *   - a change the safety review holds back, and one sent while another
 *     change to the same site is still being made;
 *   - publishing at the plan's limit of live sites;
 *   - a brief that is not a website at all;
 *   - a Free account: the Site is not in its plan, said in its language,
 *     and the routes refuse it too;
 *   - Greek and English (NEXT_LOCALE): on a Greek screen no sentence of
 *     the server's English, on an English screen no Greek.
 *
 * BOTH DEVICES: 1440x900 with a mouse, 390x844 with real touch (CDP
 * Input.dispatchTouchEvent).
 */
import http from "node:http";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { chromium } from "playwright";
import { chromiumPath } from "./lib/chromium.mjs";

let pass = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    failures.push(name);
    console.log(`  FAIL  ${name}${detail !== undefined ? "\n        " + String(detail).slice(0, 600) : ""}`);
  }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Fixed: `next build` inlines NEXT_PUBLIC_SUPABASE_URL, so the stand-in
// must listen where the build was told it would.
const SUPA_PORT = 54461;
const ANTHROPIC_PORT = 54462;
// The app's own port is fixed too: NEXT_PUBLIC_SITE_URL is inlined at
// build, and the address publishing hands back is built from it, so a
// SKIP_BUILD run on another port would link to the last run's server.
const PORT = 54463;
const USER_ID = "00000000-0000-4000-8000-0000000000a5";
const EMAIL = "site-edges@example.com";
const account = { tier: "growth" };
const user = () => ({
  id: USER_ID,
  aud: "authenticated",
  role: "authenticated",
  email: EMAIL,
  email_confirmed_at: "2026-01-01T00:00:00Z",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  app_metadata: { provider: "email", providers: ["email"] },
  user_metadata: { subscription_tier: account.tier },
  identities: [],
});

const el = JSON.parse(readFileSync("messages/el.json", "utf8"));
const en = JSON.parse(readFileSync("messages/en.json", "utf8"));

// =====================================================================
// THE STAND-IN DATABASE. PostgREST's filter grammar, as supabase-js
// writes it, over rows held in memory.
// =====================================================================
let db;
let clock = Date.parse("2026-10-08T09:00:00Z");
// Strictly increasing, so the undo route's replay (ordered by created_at)
// sees the history in the order it was written.
const stamp = () => new Date(Math.max(Date.now(), (clock += 1000))).toISOString();
function resetDb(credits) {
  db = {
    user_credits: [{ user_id: USER_ID, credits_remaining: credits, credits_total: 3000, plan_tier: account.tier }],
    user_onboarding: [{ user_id: USER_ID, completed_at: "2026-01-02T00:00:00Z", skipped_at: null }],
    user_websites: [],
    website_versions: [],
    published_sites: [],
    site_versions: [],
  };
}
resetDb(3000);
const rpcSeen = [];

const DEFAULTS = {
  user_websites: () => ({
    id: randomUUID(), created_at: stamp(), updated_at: stamp(), status: "pending", error_message: null, html_content: "",
    pages: null, generation_notes: null, attempt_count: 0, editing_started_at: null, cancel_requested_at: null,
    reference_image_url: null, has_reference_images: false, is_large_request: false, free_retry_used: false, timeline: null, description: null,
  }),
  website_versions: () => ({ id: randomUUID(), created_at: stamp() }),
  published_sites: () => ({ id: randomUUID(), created_at: stamp(), updated_at: stamp(), view_count: 0, status: "live", is_active: true }),
};

function colOf(row, col) {
  const json = col.match(/^([\w]+)->>?([\w]+)$/);
  if (json) return row[json[1]]?.[json[2]];
  return row[col];
}
function compare(a, raw) {
  if (a === null || a === undefined) return null;
  if (typeof a === "number") return a - Number(raw);
  const da = Date.parse(a), db_ = Date.parse(raw);
  if (!Number.isNaN(da) && !Number.isNaN(db_) && /\d{4}-\d\d-\d\d/.test(String(a))) return da - db_;
  return String(a) < raw ? -1 : String(a) > raw ? 1 : 0;
}
function splitTop(s) {
  const out = [];
  let depth = 0, cur = "", quoted = false;
  for (const ch of s) {
    if (ch === '"') quoted = !quoted;
    if (!quoted && ch === "(") depth++;
    if (!quoted && ch === ")") depth--;
    if (!quoted && ch === "," && depth === 0) { out.push(cur); cur = ""; continue; }
    cur += ch;
  }
  if (cur) out.push(cur);
  return out;
}
function matchExpr(row, col, expr) {
  let negate = false;
  if (expr.startsWith("not.")) { negate = true; expr = expr.slice(4); }
  const dot = expr.indexOf(".");
  const op = expr.slice(0, dot);
  const raw = decodeURIComponent(expr.slice(dot + 1));
  const v = colOf(row, col);
  let r;
  switch (op) {
    case "eq": r = v !== null && v !== undefined && String(v) === raw; break;
    case "neq": r = !(v !== null && v !== undefined && String(v) === raw); break;
    case "gt": r = (compare(v, raw) ?? -1) > 0; break;
    case "gte": r = (compare(v, raw) ?? -1) >= 0; break;
    case "lt": r = (compare(v, raw) ?? 1) < 0; break;
    case "lte": r = (compare(v, raw) ?? 1) <= 0; break;
    case "is": r = raw === "null" ? v === null || v === undefined : String(v) === raw; break;
    case "in": r = raw.replace(/^\(|\)$/g, "").split(",").map((x) => x.replace(/^"|"$/g, "")).includes(String(v)); break;
    case "cs": {
      try {
        const want = JSON.parse(raw);
        r = v && typeof v === "object" && Object.entries(want).every(([k, w]) => JSON.stringify(v[k]) === JSON.stringify(w));
      } catch { r = false; }
      break;
    }
    case "like": case "ilike": {
      const re = new RegExp("^" + raw.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/[*%]/g, ".*") + "$", op === "ilike" ? "i" : "");
      r = typeof v === "string" && re.test(v);
      break;
    }
    default: r = true;
  }
  return negate ? !r : r;
}
function matchOr(row, body) {
  return splitTop(body.replace(/^\(|\)$/g, "")).some((item) => {
    if (item.startsWith("and(")) return splitTop(item.slice(4, -1)).every((c) => matchCond(row, c));
    return matchCond(row, item);
  });
}
function matchCond(row, cond) {
  const dot = cond.indexOf(".");
  return matchExpr(row, cond.slice(0, dot), cond.slice(dot + 1));
}
const RESERVED = new Set(["select", "order", "limit", "offset", "on_conflict", "columns"]);
function filterRows(rows, params) {
  return rows.filter((row) => {
    for (const [k, v] of params) {
      if (RESERVED.has(k)) continue;
      if (k === "or") { if (!matchOr(row, v)) return false; continue; }
      if (!matchExpr(row, k, v)) return false;
    }
    return true;
  });
}
function orderRows(rows, order) {
  if (!order) return rows;
  const keys = order.split(",").map((part) => {
    const [col, dir] = part.split(".");
    return { col, desc: dir === "desc" };
  });
  return [...rows].sort((a, b) => {
    for (const { col, desc } of keys) {
      const c = compare(a[col], String(b[col] ?? ""));
      if (c === null) continue;
      if (c !== 0) return desc ? -c : c;
    }
    return 0;
  });
}

function rpc(fn, args) {
  rpcSeen.push(fn);
  const credits = db.user_credits[0];
  if (fn === "reserve_credits") {
    if (credits.credits_remaining >= args.p_credits) {
      credits.credits_remaining -= args.p_credits;
      const id = randomUUID();
      (db.credit_reservations ??= []).push({ id, credits: args.p_credits });
      return [{ reservation_id: id, available: credits.credits_remaining }];
    }
    return [{ reservation_id: null, available: credits.credits_remaining }];
  }
  if (fn === "settle_reservation" || fn === "release_reservation") {
    const held = (db.credit_reservations ?? []).find((r) => r.id === args.p_reservation_id);
    if (held) {
      credits.credits_remaining += held.credits;
      held.credits = 0;
    }
    if (fn === "settle_reservation") credits.credits_remaining -= Number(args.p_credits_to_charge ?? 0);
    return null;
  }
  if (fn === "consume_rate_limit") return true;
  return null;
}

const supa = http.createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", req.headers.origin ?? "*");
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Headers", req.headers["access-control-request-headers"] ?? "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, PUT, DELETE, OPTIONS, HEAD");
  res.setHeader("Access-Control-Expose-Headers", "Content-Range");
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    return res.end();
  }
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    const url = new URL(req.url, "http://x");
    const json = (code, data, headers = {}) => {
      res.writeHead(code, { "Content-Type": "application/json", ...headers });
      res.end(req.method === "HEAD" ? undefined : JSON.stringify(data));
    };
    if (url.pathname === "/auth/v1/user") return json(200, user());
    if (url.pathname.startsWith("/auth/v1/")) return json(200, { user: user(), session: null });
    if (url.pathname.startsWith("/storage/v1/")) return json(200, []);
    if (!url.pathname.startsWith("/rest/v1/")) return json(200, {});

    const name = url.pathname.slice("/rest/v1/".length);
    if (name.startsWith("rpc/")) {
      let args = {};
      try { args = JSON.parse(body || "{}"); } catch {}
      return json(200, rpc(name.slice(4), args));
    }
    const table = (db[name] ??= []);
    const params = [...url.searchParams.entries()];
    const prefer = req.headers.prefer ?? "";
    const single = (req.headers.accept ?? "").includes("vnd.pgrst.object");
    const represent = prefer.includes("return=representation");
    const answer = (rows, code = 200) => {
      if (single) {
        if (rows.length !== 1) return json(406, { code: "PGRST116", details: `The result contains ${rows.length} rows`, message: "JSON object requested, multiple (or no) rows returned" });
        return json(code, rows[0]);
      }
      return json(code, rows);
    };

    if (req.method === "POST") {
      let parsed = [];
      try { parsed = JSON.parse(body || "[]"); } catch {}
      const incoming = Array.isArray(parsed) ? parsed : [parsed];
      const conflict = url.searchParams.get("on_conflict");
      const written = incoming.map((r) => {
        if (conflict && prefer.includes("merge-duplicates")) {
          const keys = conflict.split(",");
          const existing = table.find((row) => keys.every((k) => String(row[k]) === String(r[k])));
          if (existing) return Object.assign(existing, r);
        }
        const row = { ...(DEFAULTS[name]?.() ?? { id: randomUUID(), created_at: stamp() }), ...r };
        table.push(row);
        return row;
      });
      if (!represent) { res.writeHead(201); return res.end(); }
      return answer(written, 201);
    }
    const matched = filterRows(table, params);
    if (req.method === "PATCH") {
      let patch = {};
      try { patch = JSON.parse(body || "{}"); } catch {}
      for (const row of matched) Object.assign(row, patch, name === "user_websites" ? { updated_at: stamp() } : {});
      if (!represent) { res.writeHead(204); return res.end(); }
      return answer(matched);
    }
    if (req.method === "DELETE") {
      db[name] = table.filter((row) => !matched.includes(row));
      if (!represent) { res.writeHead(204); return res.end(); }
      return answer(matched);
    }
    // GET / HEAD
    let rows = orderRows(matched, url.searchParams.get("order"));
    const total = rows.length;
    const offset = Number(url.searchParams.get("offset") ?? 0);
    const limit = url.searchParams.get("limit");
    rows = rows.slice(offset, limit === null ? undefined : offset + Number(limit));
    if (prefer.includes("count=")) {
      return json(200, rows, { "Content-Range": total > 0 ? `0-${Math.max(0, rows.length - 1)}/${total}` : "*/0" });
    }
    return answer(rows);
  });
});

// =====================================================================
// THE STAND-IN ANTHROPIC. Answers by what each call asks for: the
// generation streams; the classifier, the cheap edit and the safety
// review are forced tool calls; count_tokens counts.
// =====================================================================
const model = {
  down: false,
  calls: 0,
  edit: null,
  site: null,
  // The safety review's verdict: false holds a change back.
  safe: true,
  // The classifier's verdict: true says the brief is not a website, with
  // no sentence of its own (the route then uses its English default).
  offTopic: false,
};
const OVERLOADED = { type: "error", error: { type: "overloaded_error", message: "Overloaded" } };

function sse(res, event, data) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}
const anthropic = http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", async () => {
    model.calls++;
    let parsed = {};
    try { parsed = JSON.parse(body || "{}"); } catch {}
    if (model.down) {
      res.writeHead(529, { "Content-Type": "application/json", "request-id": "req_stand_in" });
      return res.end(JSON.stringify(OVERLOADED));
    }
    if (req.url.endsWith("/count_tokens")) {
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ input_tokens: 100 }));
    }
    const usage = { input_tokens: 1200, output_tokens: 300, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 };
    if (parsed.stream) {
      const text = model.site ?? "";
      res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
      sse(res, "message_start", { type: "message_start", message: { id: "msg_site", type: "message", role: "assistant", model: parsed.model, content: [], stop_reason: null, stop_sequence: null, usage: { ...usage, output_tokens: 1 } } });
      sse(res, "content_block_start", { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } });
      for (let i = 0; i < text.length; i += 800) {
        sse(res, "content_block_delta", { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: text.slice(i, i + 800) } });
        await sleep(2);
      }
      sse(res, "content_block_stop", { type: "content_block_stop", index: 0 });
      sse(res, "message_delta", { type: "message_delta", delta: { stop_reason: "end_turn", stop_sequence: null }, usage: { output_tokens: 6000 } });
      sse(res, "message_stop", { type: "message_stop" });
      return res.end();
    }
    const tool = parsed.tool_choice?.name;
    let input = {};
    if (tool === "classify_website_request") input = { isWebsiteRequest: !model.offTopic, message: "" };
    else if (tool === "evaluate_request_clarity") input = { needsClarification: false, questions: [] };
    else if (tool === "review_content_safety") input = model.safe ? { isSafe: true, concerns: [] } : { isSafe: false, concerns: ["Asks visitors for their card number"] };
    else if (tool === "apply_website_edit") input = model.edit ?? { isSimpleChange: false, findText: "", replaceText: "" };
    const content = tool ? [{ type: "tool_use", id: "toolu_stand_in", name: tool, input }] : [{ type: "text", text: "[]" }];
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ id: "msg_stand_in", type: "message", role: "assistant", model: parsed.model, content, stop_reason: tool ? "tool_use" : "end_turn", stop_sequence: null, usage }));
  });
});

await new Promise((r) => supa.listen(SUPA_PORT, "127.0.0.1", r));
await new Promise((r) => anthropic.listen(ANTHROPIC_PORT, "127.0.0.1", r));

// =====================================================================
// THE SITE THE MODEL WRITES: five pages, each with the same parts —
// header (with the menu), two sections, footer — so "the third part of
// the third page" means the same thing on every run.
// =====================================================================
const SITES = {
  el: {
    brief: "Site για την ταβέρνα και τα δωμάτια Αύρα στη Νάξο.",
    second: "Site για τον φούρνο Στάχυ στη Νάξο.",
    third: "Site για το κάμπινγκ Ήλιος στην Πάρο.",
    poem: "Γράψε μου ένα ποίημα για τη θάλασσα.",
    change: "Βάλε ωράριο 9 με 21.",
    pages: [
      ["home", "Αρχική", "Αύρα Νάξος", "Καλώς ήρθατε στην Αύρα."],
      ["menu", "Μενού", "Μενού", "Μουσακάς, χωριάτικη."],
      ["rooms", "Δωμάτια", "Δωμάτια", "Δίκλινα με θέα."],
      ["gallery", "Φωτογραφίες", "Φωτογραφίες", "Η παραλία μας."],
      ["contact", "Επικοινωνία", "Επικοινωνία", "Γράψτε μας."],
    ],
    hours: ["Ωράριο", "Καθημερινά."],
    footer: "Αύρα 2026",
    changed: "Καθημερινά, 9 με 21.",
  },
  en: {
    brief: "A site for the Avra tavern and rooms on Naxos.",
    second: "A site for the Stachy bakery on Naxos.",
    third: "A site for the Helios campsite on Paros.",
    poem: "Write me a poem about the sea.",
    change: "Set the opening hours to 9 to 21.",
    pages: [
      ["home", "Home", "Avra Naxos", "Welcome to Avra."],
      ["menu", "Menu", "Menu", "Moussaka, village salad."],
      ["rooms", "Rooms", "Rooms", "Double rooms with a view."],
      ["gallery", "Photos", "Photos", "Our beach."],
      ["contact", "Contact", "Contact", "Write to us."],
    ],
    hours: ["Hours", "Every day."],
    footer: "Avra 2026",
    changed: "Every day, 9 to 21.",
  },
};
function siteText(locale) {
  const s = SITES[locale];
  const nav = s.pages.map(([slug, label]) => `<a href="${slug === "home" ? "." : slug}">${label}</a>`).join("");
  return s.pages
    .map(([slug, label, title, body]) =>
      `<!--IONEXA:PAGE slug="${slug}" label="${label}"-->\n` +
      `<!DOCTYPE html>\n<html lang="${locale}">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n<title>${title}</title>\n<meta name="description" content="${body}">\n<style>body{margin:0;font-family:system-ui}</style>\n</head>\n<body>\n` +
      `<header><nav>${nav}</nav></header>\n<main>\n<section><h2>${title}</h2><p>${body}</p></section>\n<section><h2>${s.hours[0]}</h2><p>${s.hours[1]}</p></section>\n</main>\n<footer><p>${s.footer}</p></footer>\n</body>\n</html>\n`
    )
    .join("");
}

// =====================================================================
// THE APP
// =====================================================================
const b64u = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const jwt = (claims) => `${b64u({ alg: "HS256", typ: "JWT" })}.${b64u(claims)}.test-signature`;
const nowSec = Math.floor(Date.now() / 1000);
const session = {
  access_token: jwt({ sub: USER_ID, aud: "authenticated", role: "authenticated", email: EMAIL, iat: nowSec, exp: nowSec + 7200 }),
  token_type: "bearer",
  expires_in: 7200,
  expires_at: nowSec + 7200,
  refresh_token: "test-refresh-token",
  user: user(),
};
const AUTH_COOKIE = { name: "sb-127-auth-token", value: "base64-" + Buffer.from(JSON.stringify(session)).toString("base64url") };

const ORIGIN = `http://127.0.0.1:${PORT}`;
const env = {
  ...process.env,
  NODE_ENV: "production",
  NEXT_PUBLIC_SUPABASE_URL: `http://127.0.0.1:${SUPA_PORT}`,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: jwt({ iss: "supabase", ref: "127", role: "anon", iat: 1, exp: 2000000000 }),
  SUPABASE_SERVICE_ROLE_KEY: jwt({ iss: "supabase", ref: "127", role: "service_role", iat: 1, exp: 2000000000 }),
  NEXT_PUBLIC_SITE_URL: ORIGIN,
  ADMIN_EMAILS: "",
  TEST_ACCOUNT_EMAILS: EMAIL,
  ANTHROPIC_API_KEY: "sk-ant-test",
  ANTHROPIC_BASE_URL: `http://127.0.0.1:${ANTHROPIC_PORT}`,
  // Absent on purpose: no photo provider, so no network call leaves.
  UNSPLASH_ACCESS_KEY: "",
};

let server = null;
let browser = null;
const pageErrors = [];
const cleanup = () => {
  try { if (server?.pid) process.kill(-server.pid, "SIGKILL"); } catch {}
  try { supa.close(); } catch {}
  try { anthropic.close(); } catch {}
};

// Text of the server's own English, or of an SDK's error, that must never
// be what a person reads. Measured from the routes this file drives.
const SERVER_PROSE = [/Not enough credits \(you have/, /No credits were charged/, /overloaded/i, /\b529\b/, /request failed/i, /Upgrade your plan or purchase/, /You've reached your plan's limit/, /Website Builder generates real websites/];
// Not empty: a list with nothing in it would pass every screen.
check(`the server's sentences to look for (${SERVER_PROSE.length})`, SERVER_PROSE.length >= 6);
// Three Latin words in a row: a sentence, not a brand name or a word
// Greek borrows ("credits", "site").
const latinRuns = (text) => [...text.matchAll(/[A-Za-z][A-Za-z'’]+(?:[ ,.:;—-]+[A-Za-z][A-Za-z'’]+){2,}/g)].map((m) => m[0]);
const greekLetters = (text) => (text.match(/[\u0370-\u03ff\u1f00-\u1fff]+/g) ?? []);

// A screen in this locale: no sentence of the server's English, and on a
// Greek screen no English sentence at all; on an English one, no Greek.
function sameLanguage(locale, label, text) {
  const prose = SERVER_PROSE.filter((re) => re.test(text)).map(String);
  check(`${label}: none of the server's English or the provider's error is shown`, prose.length === 0, prose.join(", ") + " — in: " + text.slice(-400));
  if (locale === "el") {
    const runs = latinRuns(text);
    check(`${label}: no English sentence on the Greek screen`, runs.length === 0, JSON.stringify(runs));
  } else {
    const greek = greekLetters(text);
    check(`${label}: no Greek on the English screen`, greek.length === 0, JSON.stringify(greek.slice(0, 8)));
  }
}

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
      cleanup();
      process.exit(1);
    }
  }
  server = spawn("npx", ["next", "start", "-p", String(PORT)], { env: { ...env, PORT: String(PORT) }, stdio: ["ignore", "pipe", "pipe"], detached: true });
  let serverLog = "";
  server.stdout.on("data", (d) => (serverLog += d));
  server.stderr.on("data", (d) => (serverLog += d));
  let up = false;
  for (let i = 0; i < 90 && !up; i++) {
    try {
      await new Promise((res, rej) => { const r = http.get(`${ORIGIN}/api/health`, () => res()); r.on("error", rej); });
      up = true;
    } catch { await sleep(1000); }
  }
  if (!up) throw new Error("the production server did not start\n" + serverLog.slice(-2000));
  browser = await chromium.launch({ executablePath: chromiumPath() });

  for (const locale of ["el", "en"]) {
    const M = locale === "el" ? el : en;
    const S = M.dashboard.toolShell;
    const W = M.dashboard.websiteBuilder;
    const E = M.errors;
    const site = SITES[locale];
    for (const device of [
      { label: "desktop", viewport: { width: 1440, height: 900 }, touch: false },
      { label: "phone", viewport: { width: 390, height: 844 }, touch: true },
    ]) {
      console.log(`\n== ${locale} · ${device.label} ${device.viewport.width}x${device.viewport.height} ==`);
      account.tier = "growth";
      resetDb(3000);
      model.down = false;
      model.safe = true;
      model.offTopic = false;
      model.edit = null;
      model.site = siteText(locale);
      const context = await browser.newContext({ viewport: device.viewport, hasTouch: device.touch, isMobile: device.touch });
      await context.addCookies([
        { ...AUTH_COOKIE, url: ORIGIN },
        { name: "NEXT_LOCALE", value: locale, url: ORIGIN },
      ]);
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
      const field = page.locator("main textarea");
      const thread = page.locator('[data-testid="tool-shell-thread"]');
      const toolTurns = thread.locator('li[data-role="tool"]');
      const mainText = async () => (await page.locator("main").innerText().catch(() => "")) ?? "";
      async function waitFor(fn, ms = 30000) {
        const until = Date.now() + ms;
        while (Date.now() < until) {
          if (await fn()) return true;
          await sleep(250);
        }
        return false;
      }
      // What the Site says next: the text of the `k`-th tool turn after
      // the `n` already there, once it has been said.
      async function said(n, k = 1, ms = 45000) {
        await waitFor(async () => (await toolTurns.count()) >= n + k, ms);
        const count = await toolTurns.count();
        return count >= n + k ? await toolTurns.nth(n + k - 1).innerText() : "";
      }
      async function backToField() {
        if (!device.touch) return;
        const back = page.locator('[data-testid="tool-shell-back"]');
        if ((await back.count()) > 0 && (await back.isVisible())) {
          await press(back);
          await sleep(300);
        }
      }
      async function openWork() {
        if (!device.touch || (await page.locator('[data-testid="site-preview"]').count()) > 0) return;
        await press(page.locator('[data-testid="tool-shell-card"]').last());
        await sleep(300);
      }
      // ---- THE EMPTY STATE: a new account, no site yet ----------------
      await page.goto(`${ORIGIN}/dashboard/website-builder`, { waitUntil: "networkidle" });
      check("the empty Site is the shell, with its field", (await page.locator('[data-testid="tool-shell"]').count()) === 1 && (await field.count()) === 1);
      const options = page.locator('[data-testid="tool-shell-options"] > *');
      check(`...four options, the pages among them (${await options.count()})`, (await options.count()) === 4 && (await page.locator('[data-testid="site-page-count"]').count()) === 1);
      check("...«sites made before» and «new site» wait until there is one", (await page.locator('[data-testid="site-recent"]').isDisabled()) && (await page.locator('[data-testid="site-new"]').isDisabled()));
      check("...and nothing is open beside it", (await page.locator('[data-testid="tool-shell-work"]').count()) === 0);
      sameLanguage(locale, "the empty Site", await mainText());

      // ---- FIVE PAGES, made by the real routes ------------------------
      await press(page.locator('[data-testid="site-page-count"]'));
      await press(page.locator('[data-testid="site-page-count-choice"]').filter({ hasText: "5" }));
      await field.fill(site.brief);
      await sleep(200);
      check("the price is shown before anything is made", (await mainText()).includes(W.estimatedCost.split("{")[0].trim()));
      let n = await toolTurns.count();
      await field.press("Enter");
      const ready = await said(n, 2, 60000);
      const row = db.user_websites[0];
      check("the routes made the site: generate, then the worker, to «completed»", row?.status === "completed", JSON.stringify({ status: row?.status, error: row?.error_message }));
      check("...with five pages: the home page and four more", row && 1 + (row.pages?.length ?? 0) === 5, JSON.stringify(row?.pages?.map((p) => p.slug)));
      check("...the brief carried the five-page request to the model", /PAGES REQUESTED: 5\. Write exactly 5 pages/.test(row?.description ?? ""));
      check("...and the cost was settled, not just held", rpcSeen.includes("reserve_credits") && rpcSeen.includes("settle_reservation") && db.user_credits[0].credits_remaining < 3000, `${db.user_credits[0].credits_remaining} left; rpcs ${[...new Set(rpcSeen)].join(",")}`);
      check("the Site says it is ready", ready.includes(S.site.done.split("}")[1].slice(0, 12)), ready);
      await openWork();
      const tabs = page.locator('[data-testid="site-page"]');
      await waitFor(async () => (await tabs.count()) === 5, 15000);
      check("...and shows the five pages as tabs", (await tabs.count()) === 5, String(await tabs.count()));

      // ---- ONE PART OF THE THIRD PAGE, changed in words ---------------
      await press(tabs.nth(2));
      await sleep(300);
      const parts = page.locator('[data-testid="site-box"]');
      check("the third page opens with its parts listed", (await tabs.nth(2).getAttribute("aria-current")) === "page" && (await parts.count()) >= 3, String(await parts.count()));
      await press(parts.nth(2));
      await sleep(300);
      const before = JSON.parse(JSON.stringify(db.user_websites[0]));
      model.edit = { isSimpleChange: true, findText: site.hours[1], replaceText: site.changed };
      n = await toolTurns.count();
      await field.fill(site.change);
      await field.press("Enter");
      const changedSaid = await said(n);
      const after = db.user_websites[0];
      const roomsBefore = before.pages.find((p) => p.slug === "rooms").html;
      const roomsAfter = after.pages.find((p) => p.slug === "rooms").html;
      check("the change reached the third page", roomsAfter.includes(site.changed), roomsAfter.slice(0, 200));
      check("...and only that part of it: the rest of the page is as it was", roomsAfter.replace(site.changed, site.hours[1]) === roomsBefore);
      check("...and no other page, nor the home page, moved", after.html_content === before.html_content && after.pages.filter((p) => p.slug !== "rooms").every((p, i) => p.html === before.pages.filter((q) => q.slug !== "rooms")[i].html));
      check("...the history kept both states", db.website_versions.length >= 2, String(db.website_versions.length));
      check("...and the Site says only that part changed", changedSaid.includes(S.box.partChanged.split("}")[1].slice(0, 12)), changedSaid);
      await openWork();
      check("the screen shows the changed page", ((await page.locator('[data-testid="site-preview"] iframe').getAttribute("srcdoc")) ?? "").includes(site.changed));

      // ---- UNDO, through the real route --------------------------------
      n = await toolTurns.count();
      await press(page.locator('[data-testid="site-undo"]'));
      const undoneSaid = await said(n, 1, 15000);
      check("undo puts the page back, in the database", db.user_websites[0].pages.find((p) => p.slug === "rooms").html === roomsBefore);
      check("...and says so", undoneSaid.includes(S.pages.undone), undoneSaid);

      // ---- PUBLISHED AT ITS OWN ADDRESS --------------------------------
      // First at the plan's limit: as many other sites live as Growth
      // allows (lib/publishing/publish-limits.ts), so the route refuses.
      await openWork();
      const ADDRESS = `avra-${locale}-${device.label}`;
      const others = Array.from({ length: 5 }, (_, i) => ({
        id: randomUUID(), user_id: USER_ID, website_id: randomUUID(), subdomain: `other-${i}-${locale}-${device.label}`,
        status: "live", is_active: true, html_content: "<!DOCTYPE html><html><body>x</body></html>", pages: null, created_at: stamp(),
      }));
      db.published_sites.push(...others);
      await press(page.getByRole("button", { name: M.dashboard.publishing.publish, exact: true }));
      const input = page.locator("#publish-subdomain");
      await input.waitFor({ timeout: 5000 }).catch(() => null);
      await input.fill(ADDRESS);
      await sleep(300);
      await press(page.locator('[role="dialog"] button.bg-button'));
      const toasts = page.locator('[role="status"]');
      await waitFor(async () => (await toasts.count()) > 0, 10000);
      const limitToast = (await toasts.allInnerTexts()).join(" ");
      check("at the plan's limit nothing more is published", db.published_sites.length === others.length, String(db.published_sites.length));
      check("...and the Site says the limit in its own words", limitToast.includes(M.dashboard.publishing.limitReached ?? "\u0000"), limitToast);
      sameLanguage(locale, "a publish at the plan's limit", limitToast);
      db.published_sites = db.published_sites.filter((r) => !others.includes(r));
      // The dialog stays open on a refusal: the same press, now under the limit.
      await press(page.locator('[role="dialog"] button.bg-button'));
      await waitFor(async () => db.published_sites.length === 1, 10000);
      await sleep(500);
      check("published: the route wrote the address, with all five pages", db.published_sites[0]?.subdomain === ADDRESS && (db.published_sites[0]?.pages?.length ?? 0) === 4, JSON.stringify({ subdomain: db.published_sites[0]?.subdomain, pages: db.published_sites[0]?.pages?.length }));
      check("...and the screen links to it", (await page.locator(`a[href="${ORIGIN}/s/${ADDRESS}"]`).count()) >= 1);
      const visitor = await context.newPage();
      const home = await visitor.goto(`${ORIGIN}/s/${ADDRESS}`, { waitUntil: "domcontentloaded" });
      const homeHtml = await visitor.content();
      check("the address serves the home page", home?.status() === 200 && homeHtml.includes(site.pages[0][3]), String(home?.status()));
      check("...whose menu leads to the other pages under the same address", homeHtml.includes(`href="/s/${ADDRESS}/rooms"`), homeHtml.match(/href="[^"]*rooms[^"]*"/)?.[0]);
      const rooms = await visitor.goto(`${ORIGIN}/s/${ADDRESS}/rooms`, { waitUntil: "domcontentloaded" });
      check("...and the third page is served there", rooms?.status() === 200 && (await visitor.content()).includes(site.pages[2][3]), String(rooms?.status()));
      await visitor.close();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      check("the page does not scroll sideways", overflow <= 1, `${overflow}px`);
      sameLanguage(locale, "the made, changed and published Site", await mainText());

      // ---- A PROVIDER ERROR, changing the site -------------------------
      await backToField();
      model.down = true;
      const callsBefore = model.calls;
      const versionsBefore = db.website_versions.length;
      const creditsBefore = db.user_credits[0].credits_remaining;
      n = await toolTurns.count();
      await field.fill(site.change);
      await field.press("Enter");
      const outageSaid = await said(n, 1, 60000);
      check("provider down on a change: the model was asked, nothing was saved", model.calls > callsBefore && db.website_versions.length === versionsBefore, `${model.calls - callsBefore} calls`);
      check("...nothing was charged", db.user_credits[0].credits_remaining === creditsBefore, `${creditsBefore} → ${db.user_credits[0].credits_remaining}`);
      check("...and the Site says the AI is not answering, and that nothing was charged", outageSaid.includes(E.codes.upstreamUnavailable.what) && outageSaid.includes(E.credits.refunded), outageSaid);
      sameLanguage(locale, "a change during an outage", outageSaid);
      model.down = false;

      // ---- OUT OF CREDITS, changing the site ---------------------------
      db.user_credits[0].credits_remaining = 0;
      const callsDry = model.calls;
      await backToField();
      n = await toolTurns.count();
      await field.fill(site.change);
      await field.press("Enter");
      const drySaid = await said(n, 1, 20000);
      check("out of credits on a change: no model call, nothing saved", model.calls === callsDry && db.website_versions.length === versionsBefore, `${model.calls - callsDry} calls`);
      check("...and the Site says there are not enough credits, and nothing was charged", drySaid.includes(E.codes.insufficientCredits.what) && drySaid.includes(E.credits.notCharged), drySaid);
      sameLanguage(locale, "a change with no credits", drySaid);

      // ---- A CHANGE THE SAFETY REVIEW HOLDS BACK -----------------------
      db.user_credits[0].credits_remaining = 3000;
      model.safe = false;
      const htmlHeld = db.user_websites[0].html_content;
      await backToField();
      n = await toolTurns.count();
      await field.fill(site.change);
      await field.press("Enter");
      const heldSaid = await said(n, 1, 30000);
      check("a change the safety review holds back is not saved, nor charged", db.website_versions.length === versionsBefore && db.user_websites[0].html_content === htmlHeld && db.user_credits[0].credits_remaining === 3000, `${db.website_versions.length - versionsBefore} versions, ${db.user_credits[0].credits_remaining} credits`);
      check("...and the Site says so in its own words, and that nothing was charged", heldSaid.includes(S.site.held ?? "\u0000") && heldSaid.includes(E.credits.notCharged), heldSaid);
      sameLanguage(locale, "a change held back by the safety review", heldSaid);
      model.safe = true;

      // ---- A CHANGE WHILE ANOTHER IS STILL BEING MADE -------------------
      db.user_websites[0].editing_started_at = new Date().toISOString();
      const callsBusy = model.calls;
      await backToField();
      n = await toolTurns.count();
      await field.fill(site.change);
      await field.press("Enter");
      const busySaid = await said(n, 1, 20000);
      check("a change while another is being made: refused before the model, nothing saved", model.calls === callsBusy && db.website_versions.length === versionsBefore, `${model.calls - callsBusy} calls`);
      check("...and the Site says to wait, in its own words, and that nothing was charged", busySaid.includes(S.site.busy ?? "\u0000") && busySaid.includes(E.credits.notCharged), busySaid);
      sameLanguage(locale, "a change while another runs", busySaid);
      db.user_websites[0].editing_started_at = null;

      // ---- OUT OF CREDITS, making a new site ---------------------------
      db.user_credits[0].credits_remaining = 0;
      await backToField();
      await press(page.locator('[data-testid="site-new"]'));
      const sitesBefore = db.user_websites.length;
      n = await toolTurns.count();
      await field.fill(site.second);
      await field.press("Enter");
      const dryNewSaid = await said(n, 1, 20000);
      check("out of credits on a new site: no row, no generation", db.user_websites.length === sitesBefore, `${db.user_websites.length - sitesBefore} rows`);
      check("...and the Site says there are not enough credits, and nothing was charged", dryNewSaid.includes(E.codes.insufficientCredits.what) && dryNewSaid.includes(E.credits.notCharged), dryNewSaid);
      sameLanguage(locale, "a new site with no credits", dryNewSaid);

      // ---- A BRIEF THAT IS NOT A WEBSITE ---------------------------------
      db.user_credits[0].credits_remaining = 3000;
      model.offTopic = true;
      await backToField();
      n = await toolTurns.count();
      await field.fill(site.poem);
      await field.press("Enter");
      const offSaid = await said(n, 1, 30000);
      check("a brief that is not a website: no row, nothing made", db.user_websites.length === sitesBefore, `${db.user_websites.length - sitesBefore} rows`);
      check("...and the Site says what it makes, in its own words", offSaid.includes(S.site.offTopic ?? "\u0000"), offSaid);
      sameLanguage(locale, "a brief that is not a website", offSaid);
      model.offTopic = false;

      // ---- A PROVIDER ERROR, making a new site -------------------------
      // The checks before a site — the classifier above — are charged at
      // what they cost: api/websites/generate settles them (settlePrechecks).
      db.user_credits[0].credits_remaining = 3000;
      model.down = true;
      await backToField();
      n = await toolTurns.count();
      await field.fill(site.third);
      await field.press("Enter");
      const failSaid = await said(n, 2, 90000);
      const failedRow = db.user_websites.find((w) => w.status === "failed");
      check("provider down on a new site: the worker marked it failed", Boolean(failedRow), JSON.stringify(db.user_websites.map((w) => w.status)));
      check("...and nothing was charged", db.user_credits[0].credits_remaining === 3000, String(db.user_credits[0].credits_remaining));
      check("...and the Site says it could not be made, and that nothing was charged", failSaid.includes(W.generateFailed) && failSaid.includes(E.credits.notCharged), failSaid);
      sameLanguage(locale, "a new site during an outage", failSaid);
      model.down = false;
      // The failed site, opened from the list of sites: the same words.
      await backToField();
      await press(page.locator('[data-testid="site-recent"]'));
      await sleep(400);
      sameLanguage(locale, "the list of sites, with a failed one", await mainText());

      check(`no page threw (${pageErrors.length})`, pageErrors.length === 0, pageErrors.slice(0, 3).join(" | "));
      await context.close();
    }

    // ---- A FREE ACCOUNT: not in the plan, said in its language --------
    for (const device of [
      { label: "desktop", viewport: { width: 1440, height: 900 }, touch: false },
      { label: "phone", viewport: { width: 390, height: 844 }, touch: true },
    ]) {
      console.log(`\n== ${locale} · Free · ${device.label} ==`);
      account.tier = "free";
      resetDb(50);
      const callsBefore = model.calls;
      const context = await browser.newContext({ viewport: device.viewport, hasTouch: device.touch, isMobile: device.touch });
      await context.addCookies([
        { ...AUTH_COOKIE, url: ORIGIN },
        { name: "NEXT_LOCALE", value: locale, url: ORIGIN },
      ]);
      const page = await context.newPage();
      pageErrors.length = 0;
      page.on("pageerror", (err) => pageErrors.push(String(err?.message ?? err)));
      await page.goto(`${ORIGIN}/dashboard/website-builder`, { waitUntil: "networkidle" });
      const main = await page.locator("main").innerText();
      check("Free: the Site is not offered as a field", (await page.locator('[data-testid="tool-shell"]').count()) === 0);
      check("...the page says it needs an upgrade, in this language", main.includes(M.common.upgradeRequired.title), main.slice(0, 300));
      const cta = page.getByRole("link", { name: new RegExp(M.common.upgradeRequired.cta.split("{")[0].trim()) });
      check("...with one way on: the plan that has it", (await cta.count()) === 1);
      sameLanguage(locale, "the Free Site", main);
      const refused = await page.evaluate(async () => {
        const r = await fetch("/api/websites/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "x", description: "Site για φούρνο.", referenceImagePaths: [], skipClarification: true }) });
        return { status: r.status, body: await r.json().catch(() => null) };
      });
      check("...and the route refuses it as well: 403, no row, no model call", refused.status === 403 && db.user_websites.length === 0 && model.calls === callsBefore, JSON.stringify(refused));
      check(`no page threw (${pageErrors.length})`, pageErrors.length === 0, pageErrors.slice(0, 3).join(" | "));
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
