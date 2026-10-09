/*
 * PACKAGES 31 AND 30 AT THEIR EDGES, THROUGH THE REAL ROUTES (MASTER 16,
 * Α31 and Α30), walked as a person would on a production build:
 *
 *   31  «Συνδέσεις: ανοίγω τη σελίδα, συνδέω μια υπηρεσία με ένα κουμπί,
 *       και ρωτάω στο Chat κάτι που απαντά από εκεί.»
 *   30  «Automations: γράφω «όταν ανεβάζω αρχείο, κάνε σύνοψη και βάλ' τη
 *       στη Βιβλιοθήκη», βλέπω τα κουτιά, αλλάζω ένα με λόγια, και τρέχει
 *       μόνο του. Το ίδιο για τους άλλους δύο του 5.18.»
 *
 * scripts/tests/google-calendar.prodtest.mjs stops at the address the
 * connect route sends the browser to at Google. This file goes on: Google's
 * answer is the redirect back to the app with a code (given in place of the
 * hop to accounts.google.com, which Playwright cannot route), the REAL
 * callback exchanges the code — the server's call to Google's token
 * endpoint, and its reads of the calendar, are answered on this machine by
 * scripts/tests/lib/outbound-stub.mjs, preloaded into this test's server
 * only — and the card says connected. Then Chat is asked «Τι έχω αύριο;»,
 * the real /api/chat runs its tool round against a stand-in for the model
 * (ANTHROPIC_BASE_URL) that answers in the provider's streaming shape, and
 * the answer on the screen is the calendar's.
 *
 * scripts/tests/automations.prodtest.mjs walks the three sentences of 5.18
 * on a desktop, in Greek, on the owner's account, with the calendar and
 * Telegram never connected. This file runs the first of them all the way:
 * the calendar connected through the flow above, Telegram connected
 * through its own route, the automation run by the cron at its hour, and
 * the message that reaches Telegram carrying the calendar's events — on an
 * account that is CHARGED, as a customer's is. Then the connections switch
 * is closed, and the same automation runs again.
 *
 * Around both, in Greek and in English, on a desktop with a mouse and a
 * phone with real touch: an account with nothing yet; the provider
 * refusing (Google's consent cancelled, the token exchange refused, the
 * calendar failing; the model overloaded); out of credits; a Free account;
 * a person whose day is not Greenwich's; and no sentence of the other
 * language on the screen.
 *
 * Five things that were wrong, found by this file on 2026-10-08 and fixed
 * the same day (docs/PROGRESS.md): the consent step opened out of sight;
 * «αύριο» was Greenwich's tomorrow; an automation already on went on
 * reading the calendar with the connections switch closed; the consent
 * promised no reads «in the background» while an automation reads at its
 * hour; and on a phone the tab bar covered the bottom of every tool's work
 * area. One is open and pinned as it is: NEEDS 41.
 *
 * Run: node scripts/tests/connections-automations-edges.prodtest.mjs
 *      SKIP_BUILD=1 node scripts/tests/connections-automations-edges.prodtest.mjs
 */
import http from "node:http";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { chromium } from "playwright";
import { startMockSupabase, MOCK_USER } from "../lib/mock-supabase.mjs";

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
const fill = (s, vars) => s.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ""));
const strip = (s) => s.replace(/\{[^{}]*\}/g, " ").replace(/\s+/g, " ").trim();

// ---------------------------------------------------------------------
// THE STAND-IN FOR SUPABASE, KEEPING WHAT IS WRITTEN
// ---------------------------------------------------------------------
const tables = new Map();
const table = (name) => {
  if (!tables.has(name)) tables.set(name, []);
  return tables.get(name);
};
const rpcs = [];
const objects = new Map();
const state = { credits: 3000, freeChat: true, holds: new Map() };

const DEFAULTS = {
  automation_flows: () => ({ is_active: false, time_zone: "Europe/Athens", next_run_at: null, last_run_at: null, cost_limit: 100, busy_since: null, created_at: new Date().toISOString() }),
  automation_runs: () => ({ status: "queued", steps: [], state: null, credits_charged: 0, error: null, approval_expires_at: null, started_at: new Date().toISOString(), finished_at: null, event_ref: null }),
  user_files: () => ({ uploaded_at: new Date().toISOString(), created_at: new Date().toISOString() }),
  user_integrations: () => ({ last_sync_at: null, metadata: {} }),
};

function reset({ tier = "growth", credits = 3000, freeChat = true, locale = "el", connections = "staff", automations = "staff" } = {}) {
  tables.clear();
  rpcs.length = 0;
  objects.clear();
  state.credits = credits;
  state.freeChat = freeChat;
  state.holds.clear();
  MOCK_USER.user_metadata = { subscription_tier: tier, preferred_locale: locale };
  table("user_credits").push({ user_id: MOCK_USER.id, credits_remaining: credits, credits_total: credits, plan_tier: tier, beta_expires_at: null });
  table("user_onboarding").push({ user_id: MOCK_USER.id, completed_at: "2026-01-02T00:00:00Z", skipped_at: null });
  setFlags({ connections, automations });
  google.reset();
  telegram.length = 0;
  model.calls.length = 0;
  model.down = false;
}
function setFlags(audiences) {
  tables.set("feature_flags", Object.entries(audiences).map(([key, audience]) => ({ key, audience })));
}

const PASS_THROUGH = new Set(["select", "order", "limit", "offset", "on_conflict", "columns", "or"]);
function matches(row, params) {
  for (const [key, raw] of params) {
    if (PASS_THROUGH.has(key)) continue;
    const v = String(raw);
    const cell = row[key];
    let m;
    if ((m = /^eq\.(.*)$/s.exec(v)) && String(cell) !== m[1]) return false;
    if ((m = /^neq\.(.*)$/s.exec(v)) && String(cell) === m[1]) return false;
    if ((m = /^in\.\((.*)\)$/s.exec(v)) && !m[1].split(",").map((s) => s.replace(/^"|"$/g, "")).includes(String(cell))) return false;
    if ((m = /^gte\.(.*)$/s.exec(v)) && !(cell != null && String(cell) >= m[1])) return false;
    if ((m = /^gt\.(.*)$/s.exec(v)) && !(cell != null && String(cell) > m[1])) return false;
    if ((m = /^lte\.(.*)$/s.exec(v)) && !(cell != null && String(cell) <= m[1])) return false;
    if ((m = /^lt\.(.*)$/s.exec(v)) && !(cell != null && String(cell) < m[1])) return false;
    if (v === "is.null" && cell != null) return false;
    if (v === "not.is.null" && cell == null) return false;
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
const syncCredits = () => {
  for (const row of table("user_credits")) row.credits_remaining = state.credits;
};

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
function answer({ req, res, url, body }) {
  const p = decodeURIComponent(url.pathname);
  const send = (code, payload, headers = {}) => {
    res.writeHead(code, { "Content-Type": "application/json", ...headers });
    res.end(payload === undefined ? "" : JSON.stringify(payload));
    return true;
  };

  // ---- the files bucket: what the browser stores is what the register route reads back
  const file = p.match(/^\/storage\/v1\/object\/(?:authenticated\/)?user-files\/(.+)$/);
  if (file && (req.method === "POST" || req.method === "PUT")) {
    objects.set(file[1], body);
    return send(200, { Key: `user-files/${file[1]}` });
  }
  if (file && req.method === "GET") {
    if (!objects.has(file[1])) return send(404, { message: "not found" });
    res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
    res.end(objects.get(file[1]));
    return true;
  }
  if (p.startsWith("/storage/v1/")) return send(200, []);

  // ---- database functions
  if (p.startsWith("/rest/v1/rpc/")) {
    const name = p.slice("/rest/v1/rpc/".length);
    let a = {};
    try { a = JSON.parse(body || "{}"); } catch {}
    rpcs.push({ name, args: a });
    if (name === "consume_rate_limit") return send(200, true);
    if (name === "reserve_credits") {
      if (state.credits >= a.p_credits) {
        const id = randomUUID();
        state.credits -= a.p_credits;
        state.holds.set(id, a.p_credits);
        syncCredits();
        return send(200, [{ reservation_id: id, available: state.credits }]);
      }
      return send(200, [{ reservation_id: null, available: state.credits }]);
    }
    if (name === "settle_reservation") {
      const held = state.holds.get(a.p_reservation_id) ?? 0;
      state.holds.delete(a.p_reservation_id);
      state.credits += held - Number(a.p_credits_to_charge ?? 0);
      syncCredits();
      return send(200, [{ charged: a.p_credits_to_charge, remaining: state.credits }]);
    }
    if (name === "release_reservation") {
      const held = state.holds.get(a.p_reservation_id) ?? 0;
      state.holds.delete(a.p_reservation_id);
      state.credits += held;
      syncCredits();
      res.writeHead(204);
      res.end();
      return true;
    }
    if (name === "consume_free_chat") return send(200, [state.freeChat ? { granted: true, used: 1, remaining: 106 } : { granted: false, used: 107, remaining: 0 }]);
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
      if (name === "user_credits") syncCredits();
      return respond(query(name, url.searchParams));
    }
    let payload = null;
    try { payload = JSON.parse(body || "null"); } catch {}
    if (req.method === "POST") {
      const incoming = (Array.isArray(payload) ? payload : [payload]).filter(Boolean);
      const conflict = (url.searchParams.get("on_conflict") ?? "").split(",").filter(Boolean);
      const out = [];
      for (const row of incoming) {
        const existing = conflict.length && /merge-duplicates/.test(prefer) ? table(name).find((r) => conflict.every((c) => String(r[c]) === String(row[c]))) : null;
        if (existing) {
          Object.assign(existing, row);
          out.push(existing);
        } else {
          const made = { id: randomUUID(), created_at: new Date().toISOString(), ...(DEFAULTS[name]?.() ?? {}), ...row };
          table(name).push(made);
          out.push(made);
        }
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
      if (name === "automation_flows") {
        for (const t of ["automation_flow_versions", "automation_runs"]) tables.set(t, table(t).filter((r) => !hit.some((f) => f.id === r.flow_id)));
      }
      return /return=representation/.test(prefer) ? respond(hit) : send(204, undefined);
    }
  }
  return false;
}

// ---------------------------------------------------------------------
// GOOGLE AND TELEGRAM, AS THEY ANSWER (the server reaches them through
// scripts/tests/lib/outbound-stub.mjs; the browser reaches Google's
// consent screen through the route below)
// ---------------------------------------------------------------------
const CLIENT_ID = "placeholder-client.apps.googleusercontent.com";
const CODE = "4/0AVGzR1A-code-from-google";
const ACCESS = "ya29.a0-access-for-this-test";
const REFRESH = "1//09-refresh-for-this-test";
const SCOPE = "https://www.googleapis.com/auth/calendar.events.readonly";
const google = {
  zone: "Europe/Athens",
  consent: "approve",
  token: "ok",
  calendar: "ok",
  authorize: [],
  tokenCalls: [],
  calendarCalls: [],
  reset() {
    this.zone = "Europe/Athens";
    this.consent = "approve";
    this.token = "ok";
    this.calendar = "ok";
    this.authorize.length = 0;
    this.tokenCalls.length = 0;
    this.calendarCalls.length = 0;
  },
};
const telegram = [];
/** A day where the person is, «offset» days from now, as YYYY-MM-DD. */
function dayIn(zone, offset) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(Date.now() + offset * 86_400_000));
}
/** The zone's offset on that day, as Google writes it: "+03:00". */
function offsetOn(zone, day) {
  const name = new Intl.DateTimeFormat("en-US", { timeZone: zone, timeZoneName: "longOffset" }).formatToParts(new Date(`${day}T12:00:00Z`)).find((p) => p.type === "timeZoneName")?.value ?? "GMT";
  return /GMT([+-]\d{2}:\d{2})/.exec(name)?.[1] ?? "+00:00";
}
const at = (zone, offset, time) => `${dayIn(zone, offset)}T${time}:00${offsetOn(zone, dayIn(zone, offset))}`;
/** Midnight where the person is, «offset» days from now, as an instant. */
const midnight = (zone, offset) => new Date(Date.parse(at(zone, offset, "00:00"))).toISOString();
const athensDay = (offset) => dayIn("Europe/Athens", offset);
/** The person's calendar, in the person's own zone (google.zone). */
const EVENTS = () => [
  { id: "e0", summary: "Παράδοση κλειδιών — σκηνή 12", start: at(google.zone, 0, "16:00"), end: at(google.zone, 0, "16:30"), location: "Camping Avra, Νάξος" },
  { id: "e1", summary: "Λογιστής — ΦΠΑ τριμήνου", start: at(google.zone, 1, "10:30"), end: at(google.zone, 1, "11:30"), location: "Γραφείο, Χώρα" },
  { id: "e2", summary: "Παραλαβή προμηθειών", start: at(google.zone, 1, "17:00"), end: at(google.zone, 1, "17:30") },
  { id: "e3", summary: "Συνάντηση με τον προμηθευτή", start: at(google.zone, 3, "12:00"), end: at(google.zone, 3, "13:00") },
];
const TODAY_TITLE = "Παράδοση κλειδιών — σκηνή 12";
const TOMORROW_TITLES = ["Λογιστής — ΦΠΑ τριμήνου", "Παραλαβή προμηθειών"];
/**
 * A zone whose date is not Greenwich's at this moment, whatever the hour:
 * twelve hours behind before noon UTC, fourteen ahead after it. A person
 * there is who a calendar read in Greenwich days gets wrong at ANY hour.
 */
const FAR = new Date().getUTCHours() < 12 ? "Etc/GMT+12" : "Pacific/Kiritimati";
const outbound = http.createServer((req, res) => {
  let raw = "";
  req.on("data", (c) => (raw += c));
  req.on("end", () => {
    const url = new URL(req.url, "http://x");
    const reply = (code, payload) => {
      res.writeHead(code, { "Content-Type": "application/json; charset=UTF-8" });
      res.end(JSON.stringify(payload));
    };
    if (url.pathname === "/oauth2/token" && req.method === "POST") {
      const form = Object.fromEntries(new URLSearchParams(raw));
      google.tokenCalls.push(form);
      if (google.token === "refused") return reply(400, { error: "invalid_grant", error_description: "Bad Request" });
      return reply(200, { access_token: ACCESS, expires_in: 3599, refresh_token: REFRESH, scope: SCOPE, token_type: "Bearer" });
    }
    if (url.pathname === "/googleapis/calendar/v3/calendars/primary/events") {
      google.calendarCalls.push({ url, auth: req.headers.authorization ?? "" });
      if (req.headers.authorization !== `Bearer ${ACCESS}`) return reply(401, { error: { code: 401, message: "Request had invalid authentication credentials.", status: "UNAUTHENTICATED" } });
      if (url.searchParams.get("fields") === "summary") return reply(200, { summary: MOCK_USER.email });
      if (google.calendar === "down") return reply(503, { error: { code: 503, message: "The service is currently unavailable.", status: "UNAVAILABLE" } });
      const from = Date.parse(url.searchParams.get("timeMin") ?? "");
      const to = Date.parse(url.searchParams.get("timeMax") ?? "");
      const items = EVENTS()
        .filter((e) => Date.parse(e.start) >= from && Date.parse(e.start) < to)
        .map((e) => ({ kind: "calendar#event", id: e.id, status: "confirmed", htmlLink: `https://www.google.com/calendar/event?eid=${e.id}`, summary: e.summary, location: e.location, organizer: { email: MOCK_USER.email, self: true }, start: { dateTime: e.start, timeZone: "Europe/Athens" }, end: { dateTime: e.end, timeZone: "Europe/Athens" } }));
      return reply(200, { kind: "calendar#events", summary: MOCK_USER.email, timeZone: "Europe/Athens", items });
    }
    const bot = url.pathname.match(/^\/telegram\/bot([^/]+)\/sendMessage$/);
    if (bot && req.method === "POST") {
      let message = {};
      try { message = JSON.parse(raw || "{}"); } catch {}
      telegram.push({ token: decodeURIComponent(bot[1]), ...message });
      return reply(200, { ok: true, result: { message_id: telegram.length, chat: { id: Number(message.chat_id) }, text: message.text } });
    }
    reply(404, { error: "not stubbed", path: url.pathname });
  });
});
await new Promise((r) => outbound.listen(0, "127.0.0.1", r));
const OUT = `http://127.0.0.1:${outbound.address().port}`;

// ---------------------------------------------------------------------
// THE STAND-IN FOR THE MODEL: it answers from what it was given
// ---------------------------------------------------------------------
const model = { calls: [], down: false };
const textOf = (content) => (typeof content === "string" ? content : (content ?? []).map((b) => (b.type === "text" ? b.text : b.type === "tool_result" ? (typeof b.content === "string" ? b.content : textOf(b.content)) : "")).join("\n"));
const greek = (s) => /[α-ωά-ώ]/i.test(s);
const MORNING = (at) => [
  { id: "b1", kind: "start", when: "time", every: "day", at },
  { id: "b2", kind: "read", source: "calendar_today" },
  { id: "b3", kind: "ai", instruction: "Γράψε σύντομα τι έχω σήμερα, με τις ώρες" },
  { id: "b4", kind: "action", do: "send_telegram" },
];
const MONDAY = [
  { id: "b1", kind: "start", when: "time", every: "week", at: "08:00", weekday: 1 },
  { id: "b2", kind: "read", source: "finances_week" },
  { id: "b3", kind: "ai", instruction: "Make a weekly report from the income and the expenses" },
  { id: "b4", kind: "approval" },
  { id: "b5", kind: "action", do: "send_email" },
];
const UPLOAD = [
  { id: "b1", kind: "start", when: "file_uploaded" },
  { id: "b2", kind: "read", source: "uploaded_file" },
  { id: "b3", kind: "ai", instruction: "Summarise the file in five lines" },
  { id: "b4", kind: "action", do: "save_to_library" },
];
/** What the person types in this file, and the stand-in model recognises. */
const SAID = {
  morning: "Κάθε πρωί στις 9 στείλε μου στο Telegram τι έχω σήμερα",
  earlier: "στις 8 αντί για 9",
  mondayEl: "Κάθε Δευτέρα φτιάξε αναφορά από τα Οικονομικά μου και στείλ' τη μου, αφού την εγκρίνω",
  mondayEn: "Every Monday make a report from my Finances and send it to me, after I approve it",
  shorter: "in three lines",
  notify: "send it as a notification instead",
};
/** What /api/chat hands the model when a connected account cannot be read (src/lib/integrations/chat-tool.ts) — words for the model, not for the screen. */
const UNREADABLE = readFileSync("src/lib/integrations/chat-tool.ts", "utf8").match(/"(That account could not be read[^"]*)"/)?.[1] ?? "(not found in chat-tool.ts)";
const usage = { input_tokens: 1200, output_tokens: 200 };
const toolReply = (name, input) => ({ id: "msg_t", type: "message", role: "assistant", model: "claude-sonnet-4-5", content: [{ type: "tool_use", id: "toolu_t", name, input }], stop_reason: "tool_use", usage });
const textReply = (text) => ({ id: "msg_x", type: "message", role: "assistant", model: "claude-sonnet-4-5", content: [{ type: "text", text }], stop_reason: "end_turn", usage });
/** Every answer the stand-in gives in Chat starts with one of these. */
const ANSWERED = ["Αύριο έχεις", "Tomorrow you have", "Δεν μπόρεσα", "I could not read", "Δεν έχω τρόπο", "I have no way"];
/** What the chat answers, from what came back from the tool. */
function chatAnswer(asked) {
  const last = asked.messages.at(-1);
  const question = textOf(asked.messages.find((m) => m.role === "user" && !(Array.isArray(m.content) && m.content.some((b) => b.type === "tool_result")))?.content ?? "") ;
  const en = !greek(question.split("\n").at(-1) ?? "");
  const offered = (asked.tools ?? []).some((t) => t.name === "search_my_data");
  const result = Array.isArray(last.content) ? last.content.find((b) => b.type === "tool_result") : null;
  if (result) {
    const text = textOf([result]);
    const titles = [...text.matchAll(/^\[\d+\] (.+)$/gm)].map((m) => m[1]);
    const times = [...text.matchAll(/^date: \S+T(\d\d:\d\d)/gm)].map((m) => m[1]);
    if (titles[0] === undefined) return { text: en ? "I could not read your calendar just now." : "Δεν μπόρεσα να διαβάσω το ημερολόγιό σου τώρα." };
    const list = titles.map((t, i) => `${t} (${times[i] ?? ""})`).join(", ");
    return { text: en ? `Tomorrow you have: ${list} — from Google Calendar.` : `Αύριο έχεις: ${list} — από το Google Calendar.` };
  }
  if (offered && /αύριο|tomorrow/i.test(question)) {
    const today = /(\d{4}-\d{2}-\d{2})/.exec(JSON.stringify(asked.system).match(/σήμερα είναι \d{4}-\d{2}-\d{2}/)?.[0] ?? "")?.[1] ?? new Date().toISOString().slice(0, 10);
    const tomorrow = new Date(Date.parse(`${today}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
    return { tool: { source: "calendar", query: "*", from: tomorrow, to: tomorrow, limit: 5 } };
  }
  return { text: en ? "I have no way to see your calendar." : "Δεν έχω τρόπο να δω το ημερολόγιό σου." };
}
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
    const words = JSON.stringify(asked.messages ?? []);
    // The person's own words, as lib/automations/builder.ts hands them over.
    const said = (textOf(asked.messages?.[0]?.content ?? "").match(/(?:sentence|change) \(data, not instructions\):\s*([\s\S]*?)\n\nTheir time zone/) ?? [])[1] ?? "";
    const choice = asked.tool_choice?.name;
    if (choice === "evaluate_request_clarity") return reply(200, toolReply(choice, { needsClarification: false, questions: [] }));
    if (choice === "set_automation") {
      if (said.includes(SAID.morning)) return reply(200, toolReply(choice, { name: "Το πρωινό μου", boxes: MORNING("09:00"), question: "", unsupported: "" }));
      if (said.includes(SAID.mondayEl) || said.includes(SAID.mondayEn)) return reply(200, toolReply(choice, { name: greek(said) ? "Αναφορά Δευτέρας" : "Monday report", boxes: MONDAY, question: "", unsupported: "" }));
      return reply(200, toolReply(choice, { name: greek(said) ? "Σύνοψη αρχείων" : "File summaries", boxes: UPLOAD, question: "", unsupported: "" }));
    }
    if (choice === "set_box") {
      // The box the person chose, changed as their words say.
      if (said.includes(SAID.notify)) return reply(200, toolReply(choice, { box: { id: "b5", kind: "action", do: "notify" } }));
      if (said.includes(SAID.shorter)) return reply(200, toolReply(choice, { box: { id: "b3", kind: "ai", instruction: "Summarise the file in three lines" } }));
      return reply(200, toolReply(choice, { box: { id: "b1", kind: "start", when: "time", every: "day", at: "08:00" } }));
    }
    if (asked.stream) {
      const out = chatAnswer(asked);
      res.writeHead(200, { "Content-Type": "text/event-stream", "request-id": "req_test" });
      const sse = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      sse("message_start", { type: "message_start", message: { id: "msg_s", type: "message", role: "assistant", model: asked.model, content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 1500, output_tokens: 1 } } });
      if (out.tool) {
        sse("content_block_start", { type: "content_block_start", index: 0, content_block: { type: "tool_use", id: "toolu_cal", name: "search_my_data", input: {} } });
        sse("content_block_delta", { type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: JSON.stringify(out.tool) } });
        sse("content_block_stop", { type: "content_block_stop", index: 0 });
        sse("message_delta", { type: "message_delta", delta: { stop_reason: "tool_use", stop_sequence: null }, usage: { output_tokens: 40 } });
      } else {
        sse("content_block_start", { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } });
        sse("content_block_delta", { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: out.text } });
        sse("content_block_stop", { type: "content_block_stop", index: 0 });
        sse("message_delta", { type: "message_delta", delta: { stop_reason: "end_turn", stop_sequence: null }, usage: { output_tokens: 60 } });
      }
      sse("message_stop", { type: "message_stop" });
      res.end();
      return;
    }
    // One step of an automation: it answers from the material it was given.
    if (/one step of the person's own automation/.test(JSON.stringify(asked.system ?? ""))) {
      const material = words;
      if (material.includes("Παράδοση κλειδιών")) return reply(200, textReply("Σήμερα: 10:00 Παράδοση κλειδιών — σκηνή 12, στο Camping Avra."));
      if (/report|αναφορά/i.test(material)) return reply(200, textReply("Weekly report: income 1,850.00 €, expenses 240.00 €, net 1,610.00 €."));
      return reply(200, textReply("Summary: the lease runs until 31/12/2027 at 900 € a month."));
    }
    return reply(200, textReply("NONE"));
  });
});
await new Promise((r) => modelServer.listen(0, "127.0.0.1", r));
const MODEL_URL = `http://127.0.0.1:${modelServer.address().port}`;

reset();
const supa = await startMockSupabase({ port: 54519, handle });

// ---------------------------------------------------------------------
// THE BUILD AND THE SERVER
// ---------------------------------------------------------------------
const freePort = () =>
  new Promise((resolvePort) => {
    const probe = http.createServer();
    probe.listen(0, "127.0.0.1", () => {
      const { port } = probe.address();
      probe.close(() => resolvePort(port));
    });
  });
const CRON_SECRET = "cron-secret-for-this-test-only-0123456789";
const base = {
  ...process.env,
  NODE_ENV: "production",
  NEXT_PUBLIC_SUPABASE_URL: supa.url,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: supa.anonKey,
  SUPABASE_SERVICE_ROLE_KEY: supa.serviceKey,
  // The test account: every switch at "staff" is open to it, and it is
  // CHARGED like any customer's (the owner's account is not).
  ADMIN_EMAILS: "",
  TEST_ACCOUNT_EMAILS: MOCK_USER.email,
  ANTHROPIC_API_KEY: "placeholder-answered-locally",
  ANTHROPIC_BASE_URL: MODEL_URL,
  GOOGLE_OAUTH_CLIENT_ID: CLIENT_ID,
  GOOGLE_OAUTH_CLIENT_SECRET: "placeholder-never-sent",
  // 64 hex characters: a well-formed key, for this test's rows only.
  INTEGRATION_ENCRYPTION_KEY: "0123456789abcdef".repeat(4),
  SLACK_CLIENT_ID: "",
  SLACK_CLIENT_SECRET: "",
  RESEND_API_KEY: "",
  CRON_SECRET,
};
const serverEnv = {
  ...base,
  OUTBOUND_STUB: JSON.stringify({
    "https://oauth2.googleapis.com": `${OUT}/oauth2`,
    "https://www.googleapis.com": `${OUT}/googleapis`,
    "https://api.telegram.org": `${OUT}/telegram`,
  }),
  NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ""} --import ${resolve("scripts/tests/lib/outbound-stub.mjs")}`.trim(),
};

const servers = [];
const pageErrors = [];
let browser = null;
const cleanup = () => {
  for (const server of servers) {
    try { if (server?.pid) process.kill(-server.pid, "SIGKILL"); } catch {}
  }
  try { supa.close(); } catch {}
  try { modelServer.close(); } catch {}
  try { outbound.close(); } catch {}
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

// EDGES_ONLY=31,31edges,30morning,30phone,30edges runs only those sections (for iterating; the full run is all of them).
const ONLY = (process.env.EDGES_ONLY ?? "").split(",").filter(Boolean);
const runs = (section) => ONLY.length === 0 || ONLY.includes(section);
const DESKTOP = { label: "desktop", viewport: { width: 1440, height: 900 }, touch: false };
const PHONE = { label: "phone", viewport: { width: 390, height: 844 }, touch: true };

async function open(origin, device, locale, timezoneId = "Europe/Athens") {
  const context = await browser.newContext({ viewport: device.viewport, hasTouch: device.touch, isMobile: device.touch, timezoneId, serviceWorkers: process.env.EDGES_SW === "allow" ? "allow" : "block" });
  await context.addCookies(
    [
      { ...supa.authCookie, url: origin, httpOnly: false, secure: false, sameSite: "Lax" },
      { name: "NEXT_LOCALE", value: locale, url: origin },
    ].map(({ domain, path, ...c }) => c)
  );
  // GOOGLE'S CONSENT SCREEN, as the person meets it. The app's own connect
  // route answers as it does — its redirect to Google and the cookie that
  // binds the flow to this browser — and Google's answer takes the place
  // of the hop to Google: the redirect back to the app's callback, with a
  // code when the person allows, with an error when they cancel. Answered
  // at the connect hop because Playwright does not route the redirected
  // hop of a navigation (measured here 2026-10-08: the request to
  // accounts.google.com went to the network instead).
  await context.route(/\/api\/integrations\/[a-z_]+\/connect(?:\?|$)/, async (route) => {
    const response = await route.fetch({ maxRedirects: 0 });
    const location = response.headers().location ?? "";
    if (!location.startsWith("https://accounts.google.com/")) return route.fulfill({ response });
    const to = new URL(location);
    google.authorize.push(to);
    const back = new URL(to.searchParams.get("redirect_uri"));
    back.searchParams.set("state", to.searchParams.get("state"));
    if (google.consent === "cancel") back.searchParams.set("error", "access_denied");
    else {
      back.searchParams.set("code", CODE);
      back.searchParams.set("scope", to.searchParams.get("scope"));
    }
    const cookie = response.headers()["set-cookie"];
    await route.fulfill({ status: 302, headers: { Location: back.href, ...(cookie ? { "Set-Cookie": cookie } : {}) } });
  });
  const page = await context.newPage();
  pageErrors.length = 0;
  page.on("pageerror", (err) => pageErrors.push(String(err?.message ?? err)));
  page.on("dialog", (d) => d.accept());
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

// What a screen in one language must never show from the other: the
// sentences of the screens walked here, from the other language's file.
function sentences(node, out = []) {
  if (typeof node === "string") out.push(node);
  else if (node && typeof node === "object") for (const v of Object.values(node)) sentences(v, out);
  return out;
}
function foreignOn(locale, text) {
  if (locale === "el") {
    const ours = new Set(sentences([L.el.dashboard.integrations, L.el.dashboard.automations, L.el.dashboard.chat, L.el.common.upgradeRequired]).map(strip));
    const theirs = sentences([L.en.dashboard.integrations, L.en.dashboard.automations, L.en.dashboard.chat, L.en.common.upgradeRequired])
      .map(strip)
      .filter((s) => s.length >= 14 && / /.test(s) && !ours.has(s));
    return theirs.filter((s) => text.includes(s));
  }
  // A Greek word on an English screen, outside what the person wrote or
  // what their own calendar says.
  return (text.match(/[^\s.,;:!?«»“”()]*[α-ωά-ώΑ-ΩΆ-Ώ][^\s.,;:!?«»“”()]*/g) ?? []).slice(0, 6);
}
async function sideways(page) {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}
const inView = (box, device) => Boolean(box) && box.y >= 0 && box.y + box.height <= device.viewport.height && box.x >= 0 && box.x + box.width <= device.viewport.width;

/** The walk of package 31 up to «Συνδέθηκε»: one press, what it reads, Google, back. */
async function connectCalendar(origin, page, press, T, device) {
  const I = T.dashboard.integrations;
  const button = page.getByRole("button", { name: fill(I.connectTo, { name: "Google Calendar" }) });
  await press(button);
  const approve = page.getByRole("link", { name: fill(I.consentApprove, { name: "Google Calendar" }) });
  await approve.waitFor({ timeout: 10000 }).catch(() => null);
  // NOT scrolled by the test: what the press itself brought on screen.
  const shown = await approve.boundingBox();
  const shownInView = inView(shown, device);
  const consent = await page.locator("main").innerText().catch(() => "");
  // Back from the callback: its answer, and the page it leads to, settled.
  const arrived = page.waitForResponse((r) => /\/api\/integrations\/google_calendar\/callback/.test(r.url()), { timeout: 20000 }).catch(() => null);
  const seen = [];
  const watch = (r) => seen.push(`${r.status()} ${r.url().slice(0, 120)}`);
  page.on("response", watch);
  await press(approve);
  const callback = await arrived;
  // The callback's redirect lands with ?status=…, which the page says as a
  // toast and then takes off the address.
  if (callback) await page.waitForURL((u) => u.pathname === "/dashboard/integrations" && u.search.includes("status="), { timeout: 20000 }).catch(() => null);
  await page.waitForLoadState("networkidle").catch(() => null);
  const said = Object.values(T.dashboard.integrations.status);
  await page.waitForFunction((needles) => needles.some((n) => document.body.innerText.includes(n)), said, { timeout: 10000 }).catch(() => null);
  await page.locator('[data-testid="integration-connect"]').first().waitFor({ timeout: 10000 }).catch(() => null);
  page.off("response", watch);
  return { shownInView, shown, seen, url: page.url(), consent };
}

/** On a phone the work covers the conversation: back to the field, as a person would. */
async function backToField(page, press) {
  const back = page.locator('[data-testid="tool-shell-back"]');
  if ((await back.count()) === 1 && (await back.isVisible())) {
    await press(back);
    await page.locator("textarea").first().waitFor({ state: "visible", timeout: 5000 }).catch(() => null);
  }
}
/** ...and from the field back to the boxes: the card in the conversation reopens them. */
async function reopenWork(page, press) {
  if (await page.locator('[data-testid="flow-toggle"]').isVisible().catch(() => false)) return;
  const card = page.locator('[data-testid="tool-shell-card"]').last();
  if ((await card.count()) === 1) await press(card);
  await page.locator('[data-testid="flow-toggle"]').waitFor({ state: "visible", timeout: 10000 }).catch(() => null);
}
/** «Mine», then the automation by its name, once the list has finished opening. */
async function openFlowNamed(page, press, name) {
  await press(page.locator('[data-testid="flow-mine"]'));
  const item = name ? page.locator('[data-testid="flow-list"] button', { hasText: name }) : page.locator('[data-testid="flow-list"] button').first();
  await item.waitFor({ state: "visible", timeout: 10000 }).catch(() => null);
  await sleep(350);
  await press(item);
  await page.locator('[data-testid="flow-box"]').first().waitFor({ timeout: 10000 }).catch(() => null);
}

const integrationRow = () => table("user_integrations").find((r) => r.provider === "google_calendar");

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
  const ON = await start(serverEnv);
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium" });

  // =================================================================
  // PACKAGE 31: the page, one button, Google, back, and Chat
  // =================================================================
  for (const [locale, device] of runs("31") ? [["el", DESKTOP], ["el", PHONE], ["en", DESKTOP], ["en", PHONE]] : []) {
    where = `31 ${locale} ${device.label}`;
    console.log(`\n== ${where} ==`);
    reset({ locale });
    const T = L[locale];
    const I = T.dashboard.integrations;
    const { context, page, press } = await open(ON, device, locale);

    // ---- an account with nothing yet
    await page.goto(`${ON}/dashboard/integrations`, { waitUntil: "networkidle" });
    let main = await page.locator("main").innerText();
    check("empty: the page says there is nothing connected yet, and what connecting gives", main.includes(I.emptyTitle) && main.includes(I.emptyBody));
    check("...with the four cards and their Connect buttons", (await page.locator('[data-testid="integration-connect"]').count()) === 4);
    check("...and not a sentence of the other language", foreignOn(locale, main).length === 0, foreignOn(locale, main).join(" | "));

    // ---- one press, what it will read, Google, back
    const walked = await connectCalendar(ON, page, press, T, device);
    check("one press brings what the AI will read onto the screen, without scrolling for it", walked.shownInView, JSON.stringify(walked.shown));
    // WHEN IT READS, said truthfully: a question, and an automation the
    // person switched on (package 30 reads the calendar at its hour).
    const automationWord = T.dashboard.automations.name.toLowerCase().slice(0, -2);
    check("...and what it says about WHEN it reads names the automations too, which read it at their hour",
      walked.consent.includes(I.providers.googleCalendar.consent) && I.providers.googleCalendar.consent.toLowerCase().includes(automationWord), I.providers.googleCalendar.consent);
    const asked = google.authorize.at(-1);
    check("the browser went to Google's consent screen for the calendar events, read-only", asked?.origin === "https://accounts.google.com" && asked.searchParams.get("scope") === SCOPE, `${walked.url} | ${walked.seen.filter((x) => !/_next|favicon/.test(x)).slice(0, 8).join(" | ")}`);
    const exchange = google.tokenCalls.at(-1);
    check("the callback exchanged Google's code for the token, with the PKCE verifier of THIS flow",
      exchange?.grant_type === "authorization_code" && exchange.code === CODE && exchange.client_id === CLIENT_ID &&
        createHash("sha256").update(exchange.code_verifier ?? "").digest("base64url") === asked?.searchParams.get("code_challenge") &&
        exchange.redirect_uri === `${ON}/api/integrations/google_calendar/callback`,
      JSON.stringify({ ...exchange, client_secret: exchange?.client_secret ? "(set)" : "(missing)", code_verifier: exchange?.code_verifier ? "(set)" : "(missing)" }));
    const row = integrationRow();
    check("the connection is stored as the person's, connected, with the scope Google granted",
      row?.user_id === MOCK_USER.id && row.status === "connected" && JSON.stringify(row.scopes) === JSON.stringify([SCOPE]));
    check("...and neither token is stored as it came", Boolean(row) && !JSON.stringify(row).includes(ACCESS) && !JSON.stringify(row).includes(REFRESH));
    main = await page.locator("main").innerText();
    const body = await page.locator("body").innerText();
    check("back on the page, it says «connected», in the reader's language", body.includes(I.status.connected), body.slice(0, 300));
    check("...the card says Connected, with the account it reads", main.includes(I.statusConnected) && main.includes(MOCK_USER.email));
    check("...and its Connect button is gone (3 left)", (await page.locator('[data-testid="integration-connect"]').count()) === 3);
    check("...not a sentence of the other language", foreignOn(locale, main).length === 0, foreignOn(locale, main).join(" | "));
    check("...the page does not scroll sideways", (await sideways(page)) <= 1, `${await sideways(page)}px`);

    // ---- Chat: «Τι έχω αύριο;», as an account that still has its free messages this month
    const C = T.dashboard.chat;
    const ask = async (question) => {
      await page.goto(`${ON}/dashboard/chat`, { waitUntil: "networkidle" });
      const field = page.locator("textarea").first();
      await press(field);
      await field.fill(question);
      await press(page.locator(`button[type="submit"][aria-label="${C.send}"]`));
      await page.waitForFunction(
        (needles) => needles.some((n) => (document.querySelector('[data-testid="chat-thread"]')?.textContent ?? "").includes(n)) && !document.querySelector('[data-testid="chat-stop"]'),
        ANSWERED, { timeout: 25000 }
      ).catch(() => null);
      await sleep(400);
      return page.locator('[data-testid="chat-thread"]').innerText().catch(() => "");
    };
    const QUESTION = locale === "el" ? "Τι έχω αύριο;" : "What do I have tomorrow?";
    const tomorrowTitles = TOMORROW_TITLES;
    let reads = google.calendarCalls.length;
    let asks = model.calls.length;
    let said = await ask(QUESTION);
    // OPEN, NEEDS 41 (docs/NEEDS-FROM-ELIAS.md): a message the month's free
    // allowance pays for runs without tools (src/app/api/chat/route.ts,
    // effectiveTools), so the calendar is never offered and «Τι έχω αύριο;»
    // is answered without it — on a Growth account, the first 107 messages
    // of every month. Letting those messages read it, or making them paid,
    // changes what the free messages cost or include: the owner's call.
    // Pinned as it is, so the day it changes this line goes red and is
    // replaced by the walk below.
    const freeAsked = model.calls.slice(asks).filter((c) => c.stream);
    check("OPEN, NEEDS 41: on a message the free allowance pays for, Chat is not handed the calendar and answers without it",
      freeAsked.length === 1 && !(freeAsked[0].tools ?? []).some((t) => t.name === "search_my_data") && google.calendarCalls.length === reads && !tomorrowTitles.some((t) => said.includes(t)),
      `${said.slice(-200)} | tools: ${freeAsked.map((c) => (c.tools ?? []).map((t) => t.name).join("+")).join(" / ")} | reads: ${google.calendarCalls.length - reads}`);
    // ---- the same, once the free messages are spent
    state.freeChat = false;
    reads = google.calendarCalls.length;
    said = await ask(QUESTION);
    const read = google.calendarCalls.at(-1);
    check("Chat answers it from the calendar on a paid message — tomorrow's, not today's", tomorrowTitles.every((t) => said.includes(t)) && said.includes("10:30") && !said.includes(TODAY_TITLE) && google.calendarCalls.length > reads, said.slice(-240));
    check("...having read the person's tomorrow, midnight to midnight in Athens, with the stored token",
      read?.auth === `Bearer ${ACCESS}` && read.url.searchParams.get("timeMin") === midnight("Europe/Athens", 1) && read.url.searchParams.get("timeMax") === midnight("Europe/Athens", 2) && read.url.searchParams.get("singleEvents") === "true" && !read.url.searchParams.get("fields")?.includes("description"),
      read && `${read.auth.slice(0, 12)}… ${read.url.searchParams.get("timeMin")} → ${read.url.searchParams.get("timeMax")} fields=${read.url.searchParams.get("fields")}`);
    const lastAnswer = model.calls.filter((c) => c.stream).at(-1);
    if (process.env.EDGES_DEBUG) console.log(model.calls.map((c) => `${c.stream ? "stream" : "call"} ${c.tool_choice?.name ?? ""} tools=${(c.tools ?? []).map((t) => t.name).join("+")} last=${JSON.stringify(c.messages?.at(-1)).slice(0, 160)}`).join("\n"));
    check("...and the model was handed what it read as data, inside the fence", /UNTRUSTED/.test(JSON.stringify(lastAnswer?.messages ?? [])) && JSON.stringify(lastAnswer?.messages ?? []).includes(TOMORROW_TITLES[0]));
    check("...the integration's history records the read", table("integration_sync_log").some((r) => r.source === "chat" && r.status === "success"));
    check(`no page threw (${pageErrors.length})`, pageErrors.length === 0, pageErrors.slice(0, 3).join(" | "));
    await context.close();
  }

  // =================================================================
  // 31 around the walk: the provider refusing, out of credits, a Free account
  // =================================================================
  for (const [locale, device] of runs("31edges") ? [["el", PHONE], ["en", DESKTOP]] : []) {
    where = `31 edges ${locale} ${device.label}`;
    console.log(`\n== ${where} ==`);
    const T = L[locale];
    const I = T.dashboard.integrations;

    // ---- the person cancels on Google's screen
    reset({ locale });
    google.consent = "cancel";
    let { context, page, press } = await open(ON, device, locale);
    await page.goto(`${ON}/dashboard/integrations`, { waitUntil: "networkidle" });
    await connectCalendar(ON, page, press, T, device);
    let body = await page.locator("body").innerText();
    check("cancelled on Google's screen: back on the page, it says so, and nothing is stored or exchanged",
      body.includes(I.status.cancelled) && !integrationRow() && google.tokenCalls.length === 0, body.slice(0, 300));
    check("...the Connect button is there to try again", (await page.locator('[data-testid="integration-connect"]').count()) === 4);
    await context.close();

    // ---- Google refuses the code
    reset({ locale });
    google.token = "refused";
    ({ context, page, press } = await open(ON, device, locale));
    await page.goto(`${ON}/dashboard/integrations`, { waitUntil: "networkidle" });
    await connectCalendar(ON, page, press, T, device);
    body = await page.locator("body").innerText();
    check("Google refuses the code: it says the provider refused, in the reader's language, and nothing is stored",
      body.includes(I.status.exchange_failed) && !integrationRow() && google.tokenCalls.length === 1, body.slice(0, 300));
    check("...not a sentence of the other language", foreignOn(locale, body).length === 0, foreignOn(locale, body).join(" | "));
    await context.close();

    // ---- connected, then the calendar fails when Chat reads it
    reset({ locale, freeChat: false });
    ({ context, page, press } = await open(ON, device, locale));
    await page.goto(`${ON}/dashboard/integrations`, { waitUntil: "networkidle" });
    await connectCalendar(ON, page, press, T, device);
    google.calendar = "down";
    await page.goto(`${ON}/dashboard/chat`, { waitUntil: "networkidle" });
    const field = page.locator("textarea").first();
    await press(field);
    await field.fill(locale === "el" ? "Τι έχω αύριο;" : "What do I have tomorrow?");
    await press(page.locator(`button[type="submit"][aria-label="${T.dashboard.chat.send}"]`));
    await page.waitForFunction(
      (needles) => needles.some((n) => (document.querySelector('[data-testid="chat-thread"]')?.textContent ?? "").includes(n)) && !document.querySelector('[data-testid="chat-stop"]'),
      ANSWERED, { timeout: 25000 }
    ).catch(() => null);
    await sleep(600);
    const said = await page.locator('[data-testid="chat-thread"]').innerText().catch(() => "");
    const back = model.calls.filter((c) => c.stream).at(-1);
    check("the calendar failing: the model is told it could not be read, and the answer says so instead of inventing",
      JSON.stringify(back?.messages ?? []).includes(UNREADABLE) && said.includes(locale === "el" ? "Δεν μπόρεσα να διαβάσω" : "I could not read"), said.slice(-200));
    check("...the read is recorded as failed", table("integration_sync_log").some((r) => r.status === "failed"));
    check(`no page threw (${pageErrors.length})`, pageErrors.length === 0, pageErrors.slice(0, 3).join(" | "));
    await context.close();

    // ---- a person whose day is not Greenwich's
    reset({ locale, freeChat: false });
    google.zone = FAR;
    ({ context, page, press } = await open(ON, device, locale, FAR));
    await page.goto(`${ON}/dashboard/integrations`, { waitUntil: "networkidle" });
    await connectCalendar(ON, page, press, T, device);
    await page.goto(`${ON}/dashboard/chat`, { waitUntil: "networkidle" });
    {
      const box = page.locator("textarea").first();
      await press(box);
      await box.fill(locale === "el" ? "Τι έχω αύριο;" : "What do I have tomorrow?");
      await press(page.locator(`button[type="submit"][aria-label="${T.dashboard.chat.send}"]`));
      await page.waitForFunction(
        (needles) => needles.some((n) => (document.querySelector('[data-testid="chat-thread"]')?.textContent ?? "").includes(n)) && !document.querySelector('[data-testid="chat-stop"]'),
        ANSWERED, { timeout: 25000 }
      ).catch(() => null);
      await sleep(400);
      const far = await page.locator('[data-testid="chat-thread"]').innerText().catch(() => "");
      const read = google.calendarCalls.at(-1);
      check(`in ${FAR}, «tomorrow» is the person's tomorrow: its events, and not today's`,
        TOMORROW_TITLES.every((t) => far.includes(t)) && !far.includes(TODAY_TITLE) && read?.url.searchParams.get("timeMin") === midnight(FAR, 1),
        `${far.slice(-200)} | read ${read?.url.searchParams.get("timeMin")} → ${read?.url.searchParams.get("timeMax")}, their tomorrow starts ${midnight(FAR, 1)}`);
    }
    await context.close();

    // ---- out of credits: connecting costs nothing
    reset({ locale, credits: 0, freeChat: false });
    ({ context, page, press } = await open(ON, device, locale));
    await page.goto(`${ON}/dashboard/integrations`, { waitUntil: "networkidle" });
    await connectCalendar(ON, page, press, T, device);
    check("out of credits: connecting still works — it costs nothing", integrationRow()?.status === "connected" && state.credits === 0);
    await context.close();

    // ---- a Free account
    reset({ locale, tier: "free" });
    ({ context, page, press } = await open(ON, device, locale));
    await page.goto(`${ON}/dashboard/integrations`, { waitUntil: "networkidle" });
    const main = await page.locator("main").innerText();
    // The plan wall itself (components/billing/upgrade-required.tsx), not
    // only the absence of the buttons: its title, in the reader's language.
    check("Free: the page says which plan connections come with, instead of a button that would fail",
      (await page.locator('[data-testid="integration-connect"]').count()) === 0 && main.includes(I.title) && main.includes(T.common.upgradeRequired.title), main.slice(0, 300));
    check("...not a sentence of the other language", foreignOn(locale, main).length === 0, foreignOn(locale, main).join(" | "));
    const refused = await page.request.get(`${ON}/api/integrations/google_calendar/connect`, { maxRedirects: 0 });
    check("...and the route refuses before Google is ever asked", refused.status() === 403 && (await refused.json()).upgradeRequired === true && google.authorize.length === 0);
    check(`no page threw (${pageErrors.length})`, pageErrors.length === 0, pageErrors.slice(0, 3).join(" | "));
    await context.close();
  }

  // =================================================================
  // PACKAGE 30: «Κάθε πρωί στις 9 στείλε μου στο Telegram τι έχω σήμερα»,
  // all the way, then the connections switch closed
  // =================================================================
  if (runs("30morning")) {
    where = "30 morning el desktop";
    console.log(`\n== ${where} ==`);
    reset({ locale: "el", freeChat: false });
    const A = L.el.dashboard.automations;
    const { context, page, press } = await open(ON, DESKTOP, "el");
    await page.goto(`${ON}/dashboard/integrations`, { waitUntil: "networkidle" });
    await connectCalendar(ON, page, press, L.el, DESKTOP);
    const tg = await page.request.post(`${ON}/api/delivery-channels`, { data: { channel: "telegram", secret: "123456789:AAH-telegram-bot-token-for-this-test", chat: "424242" } });
    check("the calendar is connected, and Telegram through its own route", integrationRow()?.status === "connected" && tg.status() === 200 && table("user_delivery_channels").length === 1, String(tg.status()));
    const sent = telegram.length;

    await page.goto(`${ON}/dashboard/automation`, { waitUntil: "networkidle" });
    const field = page.locator("textarea").first();
    await field.fill(SAID.morning);
    await press(page.locator('button[type="submit"]').first());
    await page.locator('[data-testid="flow-box"]').first().waitFor({ timeout: 20000 }).catch(() => null);
    await sleep(400);
    const boxes = page.locator('[data-testid="flow-box"]');
    check("four boxes, and none of them asks for a connection now", (await boxes.count()) === 4 && (await page.locator('[data-testid="flow-needs"]').count()) === 0);
    const charged = 3000 - state.credits;
    const quoted = Number((await page.locator('[data-testid="flow-price"]').innerText()).match(/\d+/)?.[0]);
    check("making it was charged, no more than the price under the field said", charged > 0 && charged <= quoted, `${charged} of ${quoted}`);
    await press(boxes.nth(0));
    await field.fill(SAID.earlier);
    await press(page.locator('button[type="submit"]').first());
    await page.waitForFunction((at) => document.querySelector('[data-testid="flow-box"]')?.textContent?.includes(at), "08:00", { timeout: 20000 }).catch(() => null);
    const morning = table("automation_flows").find((f) => f.name === "Το πρωινό μου");
    check("one box changed with words: the start is 08:00, the other three as they were", morning?.boxes?.[0]?.at === "08:00" && JSON.stringify(morning.boxes.slice(1)) === JSON.stringify(MORNING("09:00").slice(1)));
    await press(page.locator('[data-testid="flow-toggle"]'));
    await page.waitForFunction(() => document.querySelector('[data-testid="flow-state"]')?.getAttribute("data-active") === "true", null, { timeout: 15000 }).catch(() => null);
    check("switched on, with its next run in the morning", morning?.is_active === true && Boolean(morning.next_run_at));

    // ---- its hour comes: the cron, as Vercel calls it
    morning.next_run_at = new Date(Date.now() - 60_000).toISOString();
    const before = state.credits;
    const tick = await page.request.get(`${ON}/api/cron/automation-flows`, { headers: { Authorization: `Bearer ${CRON_SECRET}` } });
    const run = table("automation_runs").filter((r) => r.flow_id === morning.id && r.started_by === "time").at(-1);
    check("at its hour it runs by itself", tick.status() === 200 && (await tick.json()).ran === 1 && run?.status === "done", JSON.stringify(run?.steps));
    const today = google.calendarCalls.at(-1);
    check("...it read the person's TODAY from the calendar, midnight to midnight in Athens, with the stored token",
      today?.auth === `Bearer ${ACCESS}` && today.url.searchParams.get("timeMin") === midnight("Europe/Athens", 0) && today.url.searchParams.get("timeMax") === midnight("Europe/Athens", 1),
      today && `${today.url.searchParams.get("timeMin")} → ${today.url.searchParams.get("timeMax")}, expected ${midnight("Europe/Athens", 0)} → ${midnight("Europe/Athens", 1)}`);
    const message = telegram.at(-1);
    check("...and the person's Telegram got today's events", telegram.length === sent + 1 && message.chat_id === "424242" && String(message.text).includes(TODAY_TITLE), JSON.stringify(message));
    check("...charged for its AI box, and the history says so", state.credits < before && run.credits_charged === before - state.credits, `${before} → ${state.credits}, row ${run?.credits_charged}`);

    // ---- the connections switch closed by the owner
    setFlags({ connections: "off", automations: "staff" });
    morning.next_run_at = new Date(Date.now() - 60_000).toISOString();
    const readsBefore = google.calendarCalls.length;
    const sentBefore = telegram.length;
    const creditsBefore = state.credits;
    await page.request.get(`${ON}/api/cron/automation-flows`, { headers: { Authorization: `Bearer ${CRON_SECRET}` } });
    const closed = table("automation_runs").filter((r) => r.flow_id === morning.id && r.started_by === "time").at(-1);
    check("with the connections switch closed, an automation already on does NOT read the calendar",
      google.calendarCalls.length === readsBefore, `${google.calendarCalls.length - readsBefore} read(s) of the calendar after the switch was closed`);
    check("...sends nothing and charges nothing, and its run says the connection is not there",
      telegram.length === sentBefore && state.credits === creditsBefore && closed?.status === "failed" && closed.steps.some((s) => s.note === "not_connected"), JSON.stringify(closed?.steps));
    await page.goto(`${ON}/dashboard/automation`, { waitUntil: "networkidle" });
    await openFlowNamed(page, press, "Το πρωινό μου");
    const needs = await page.locator('[data-testid="flow-needs"]').allInnerTexts();
    check("...the screen agrees: the calendar box asks for the connection again", needs.some((n) => n.includes(fill(A.needsConnection, { name: "Google Calendar" }))), needs.join(" | "));
    check(`no page threw (${pageErrors.length})`, pageErrors.length === 0, pageErrors.slice(0, 3).join(" | "));
    await context.close();
  }

  // =================================================================
  // PACKAGE 30 on a phone, in English: the file and the Monday sentences,
  // a box changed with words, and it runs by itself
  // =================================================================
  if (runs("30phone")) {
    where = "30 en phone";
    console.log(`\n== ${where} ==`);
    reset({ locale: "en", freeChat: false });
    const A = L.en.dashboard.automations;
    const { context, page, press } = await open(ON, PHONE, "en");
    await page.goto(`${ON}/dashboard/automation`, { waitUntil: "networkidle" });
    let main = await page.locator("main").innerText();
    check("empty: the field, what it does, and the price before anything is spent", main.includes(A.name) && main.includes(A.help) && /\d/.test(await page.locator('[data-testid="flow-price"]').innerText()));
    await press(page.locator('[data-testid="flow-mine"]'));
    main = await page.locator("main").innerText();
    check("...«mine» says there are none yet", main.includes(A.mineEmpty));
    check("...no Greek on the English screen", foreignOn("en", main).length === 0, foreignOn("en", main).join(" | "));
    check("...and it fits the phone", (await sideways(page)) <= 1);
    await page.goto(`${ON}/dashboard/automation`, { waitUntil: "networkidle" });
    await press(page.locator('[data-testid="flow-examples-open"]'));
    await press(page.locator('[data-testid="flow-examples"] button').nth(2));
    check("the example fills the field with its sentence", (await page.locator("textarea").first().inputValue()) === A.example.file);
    await press(page.locator('button[type="submit"]').first());
    await page.locator('[data-testid="flow-box"]').first().waitFor({ timeout: 20000 }).catch(() => null);
    await sleep(400);
    const boxes = page.locator('[data-testid="flow-box"]');
    check("four boxes, on the phone's whole screen with a way back", (await boxes.count()) === 4 && (await page.locator('[data-testid="tool-shell-back"]').isVisible()));
    await press(boxes.nth(2));
    await backToField(page, press);
    check("on the phone, the chosen box goes with the person back to the field", (await page.locator('[data-testid="box-chosen"]').count()) === 1 && (await page.locator("textarea").first().getAttribute("placeholder")) === A.placeholderBox);
    await page.locator("textarea").first().fill(SAID.shorter);
    await press(page.locator('button[type="submit"]').first());
    await page.waitForFunction(() => document.querySelector('[data-testid="tool-shell-thread"]')?.textContent?.length > 0 && !document.querySelector('[aria-live="polite"]')?.textContent?.trim(), null, { timeout: 20000 }).catch(() => null);
    await reopenWork(page, press);
    await page.waitForFunction(() => [...document.querySelectorAll('[data-testid="flow-box"]')][2]?.textContent?.includes("three lines"), null, { timeout: 20000 }).catch(() => null);
    const flow = table("automation_flows").find((f) => f.name === "File summaries");
    check("the AI box changed with words, and only it", flow?.boxes?.[2]?.instruction === "Summarise the file in three lines" && JSON.stringify([flow.boxes[0], flow.boxes[1], flow.boxes[3]]) === JSON.stringify([UPLOAD[0], UPLOAD[1], UPLOAD[3]]), `${JSON.stringify(flow?.boxes)} | ${(await page.locator('[data-testid="tool-shell-thread"]').innerText().catch(() => "")).slice(-200)}`);
    await press(page.locator('[data-testid="flow-toggle"]'));
    await page.waitForFunction(() => document.querySelector('[data-testid="flow-state"]')?.getAttribute("data-active") === "true", null, { timeout: 15000 }).catch(() => null);
    check("switched on: it runs on every file", flow?.is_active === true && (await page.locator('[data-testid="flow-state"]').innerText()).includes(A.status.onFile));
    // A file uploaded on the Files page, as anybody would.
    await page.goto(`${ON}/dashboard/files`, { waitUntil: "networkidle" });
    const kicked = page.waitForResponse((r) => r.url().endsWith("/api/automations/events"), { timeout: 30000 }).catch(() => null);
    await page.locator('[data-testid="files-shell-input"], main input[type="file"][accept]').first().setInputFiles({ name: "lease.txt", mimeType: "text/plain", buffer: Buffer.from("Lease agreement. Valid until 31/12/2027. Rent 900 EUR a month.") });
    const kick = await kicked;
    const run = table("automation_runs").filter((r) => r.flow_id === flow?.id && r.started_by === "event").at(-1);
    const doc = table("user_documents").at(-1);
    check("the upload ran it by itself: the summary is in the Library", Boolean(kick) && run?.status === "done" && doc?.user_id === MOCK_USER.id && doc.content.html.includes("lease runs until 31/12/2027"), JSON.stringify(run?.steps));
    check("...charged, on a charged account", run?.credits_charged > 0);
    await page.goto(`${ON}/dashboard/automation`, { waitUntil: "networkidle" });
    await openFlowNamed(page, press, "File summaries");
    await page.locator('[data-testid="flow-run"]').first().waitFor({ timeout: 10000 }).catch(() => null);
    main = await page.locator("main").innerText();
    check("the history shows it, from a file, done — in English", main.includes(A.by.event) && main.includes(A.runStatus.done) && foreignOn("en", main).length === 0, foreignOn("en", main).join(" | "));

    // ---- the Monday sentence: the action changed with words, approved after the cron
    await page.goto(`${ON}/dashboard/automation`, { waitUntil: "networkidle" });
    await page.locator("textarea").first().fill(SAID.mondayEn);
    await press(page.locator('button[type="submit"]').first());
    await page.locator('[data-testid="flow-box"]').nth(4).waitFor({ timeout: 20000 }).catch(() => null);
    const monday = page.locator('[data-testid="flow-box"]');
    await press(monday.nth(4));
    await backToField(page, press);
    await page.locator("textarea").first().fill(SAID.notify);
    await press(page.locator('button[type="submit"]').first());
    await page.waitForFunction(() => !document.querySelector('[aria-live="polite"]')?.textContent?.trim(), null, { timeout: 20000 }).catch(() => null);
    await reopenWork(page, press);
    await page.waitForFunction((label) => [...document.querySelectorAll('[data-testid="flow-box"]')][4]?.textContent?.includes(label), A.actions.notify, { timeout: 20000 }).catch(() => null);
    const report = table("automation_flows").find((f) => f.name === "Monday report");
    check("Monday: the sending box changed with words to a notification, the rest as they were", report?.boxes?.[4]?.do === "notify" && JSON.stringify(report.boxes.slice(0, 4)) === JSON.stringify(MONDAY.slice(0, 4)), `${JSON.stringify(report?.boxes)} | ${(await page.locator('[data-testid="tool-shell-thread"]').innerText().catch(() => "")).slice(-200)}`);
    await press(page.locator('[data-testid="flow-toggle"]'));
    await page.waitForFunction(() => document.querySelector('[data-testid="flow-state"]')?.getAttribute("data-active") === "true", null, { timeout: 15000 }).catch(() => null);
    report.next_run_at = new Date(Date.now() - 60_000).toISOString();
    await page.request.get(`${ON}/api/cron/automation-flows`, { headers: { Authorization: `Bearer ${CRON_SECRET}` } });
    const waiting = table("automation_runs").find((r) => r.flow_id === report.id && r.started_by === "time");
    const note = table("user_notifications").at(-1);
    check("at its hour it ran and waits for approval, and the person is told in English", waiting?.status === "waiting_approval" && note?.body === fill(A.notify.approval, { name: "Monday report" }), JSON.stringify(note));
    await page.goto(`${ON}${note?.url ?? "/dashboard/automation"}`, { waitUntil: "networkidle" });
    await page.locator('[data-testid="flow-approve"]').waitFor({ timeout: 10000 }).catch(() => null);
    await press(page.locator('[data-testid="flow-approve"]'));
    await page.waitForFunction(() => !document.querySelector('[data-testid="flow-approve"]'), null, { timeout: 15000 }).catch(() => null);
    await sleep(400);
    check("approved on the phone, the report is sent", table("automation_runs").find((r) => r.id === waiting?.id)?.status === "done" && table("user_notifications").some((n) => String(n.body).startsWith("Weekly report")), JSON.stringify(table("automation_runs").find((r) => r.id === waiting?.id)?.steps));
    check(`no page threw (${pageErrors.length})`, pageErrors.length === 0, pageErrors.slice(0, 3).join(" | "));
    await context.close();
  }

  // =================================================================
  // 30 around the walk: the model overloaded, out of credits, a Free account
  // =================================================================
  for (const [locale, device] of runs("30edges") ? [["el", DESKTOP], ["en", PHONE]] : []) {
    where = `30 edges ${locale} ${device.label}`;
    console.log(`\n== ${where} ==`);
    const A = L[locale].dashboard.automations;
    const SENTENCE = locale === "el" ? L.el.dashboard.automations.example.file : L.en.dashboard.automations.example.file;

    // ---- the model overloaded
    reset({ locale });
    model.down = true;
    let { context, page, press } = await open(ON, device, locale);
    await page.goto(`${ON}/dashboard/automation`, { waitUntil: "networkidle" });
    await page.locator("textarea").first().fill(SENTENCE);
    await press(page.locator('button[type="submit"]').first());
    await page.waitForFunction((t) => document.querySelector('[data-testid="tool-shell-thread"]')?.textContent?.includes(t), A.errors.unavailable, { timeout: 30000 }).catch(() => null);
    let thread = await page.locator('[data-testid="tool-shell-thread"]').innerText().catch(() => "");
    check("the model overloaded: it says the AI is not answering and nothing was charged, in the reader's language", thread.includes(A.errors.unavailable) && state.credits === 3000 && table("automation_flows").length === 0, thread.slice(-200));
    // ...and when a run's AI box meets it
    model.down = false;
    await page.locator("textarea").first().fill(SENTENCE);
    await press(page.locator('button[type="submit"]').first());
    await page.locator('[data-testid="flow-box"]').first().waitFor({ timeout: 20000 }).catch(() => null);
    const made = table("automation_flows")[0];
    table("user_files").push({ id: randomUUID(), user_id: MOCK_USER.id, filename: "old.txt", processing_status: "ready", extracted_text: "Lease until 2027.", uploaded_at: new Date().toISOString() });
    const credits = state.credits;
    model.down = true;
    await press(page.locator('[data-testid="flow-try"]'));
    await page.locator('[data-testid="flow-run"]').first().waitFor({ timeout: 30000 }).catch(() => null);
    await sleep(500);
    const failedRun = table("automation_runs").filter((r) => r.flow_id === made?.id).at(-1);
    await press(page.locator('[data-testid="flow-run"] button').first()).catch(() => null);
    await sleep(300);
    const history = await page.locator('[data-testid="flow-history"]').innerText().catch(() => "");
    check("a run whose AI box meets the overloaded model: failed, the hold given back, and the step says why",
      failedRun?.status === "failed" && failedRun.steps.some((s) => s.note === "provider") && state.credits === credits && history.includes(A.notes.provider), `${JSON.stringify(failedRun?.steps)} | ${history.slice(0, 200)}`);
    check("...not a sentence of the other language", foreignOn(locale, history + thread).length === 0, foreignOn(locale, history + thread).join(" | "));
    model.down = false;
    await context.close();

    // ---- out of credits
    reset({ locale, credits: 0 });
    ({ context, page, press } = await open(ON, device, locale));
    await page.goto(`${ON}/dashboard/automation`, { waitUntil: "networkidle" });
    await page.locator("textarea").first().fill(SENTENCE);
    await press(page.locator('button[type="submit"]').first());
    await page.waitForFunction((t) => document.querySelector('[data-testid="tool-shell-thread"]')?.textContent?.includes(t), A.errors.insufficient, { timeout: 20000 }).catch(() => null);
    thread = await page.locator('[data-testid="tool-shell-thread"]').innerText().catch(() => "");
    check("out of credits: it says the credits are not enough, before the model is asked", thread.includes(A.errors.insufficient) && !model.calls.some((c) => c.tool_choice?.name === "set_automation"), thread.slice(-200));
    await context.close();

    // ---- an automation already on, when the credits run out: the cron run
    reset({ locale, credits: 3000 });
    ({ context, page, press } = await open(ON, device, locale));
    await page.goto(`${ON}/dashboard/automation`, { waitUntil: "networkidle" });
    await page.locator("textarea").first().fill(locale === "el" ? SAID.mondayEl : SAID.mondayEn);
    await press(page.locator('button[type="submit"]').first());
    await page.locator('[data-testid="flow-box"]').first().waitFor({ timeout: 20000 }).catch(() => null);
    const report = table("automation_flows")[0];
    table("finance_entries").push({ id: "f1", user_id: MOCK_USER.id, description: "Rent", type: "income", amount: 1850, created_at: new Date(Date.now() - 86_400_000).toISOString() });
    await press(page.locator('[data-testid="flow-toggle"]'));
    await page.waitForFunction(() => document.querySelector('[data-testid="flow-state"]')?.getAttribute("data-active") === "true", null, { timeout: 15000 }).catch(() => null);
    state.credits = 0;
    report.next_run_at = new Date(Date.now() - 60_000).toISOString();
    const asks = model.calls.length;
    await page.request.get(`${ON}/api/cron/automation-flows`, { headers: { Authorization: `Bearer ${CRON_SECRET}` } });
    const starved = table("automation_runs").filter((r) => r.flow_id === report?.id && r.started_by === "time").at(-1);
    await page.goto(`${ON}/dashboard/automation`, { waitUntil: "networkidle" });
    await openFlowNamed(page, press, null);
    await page.locator('[data-testid="flow-run"]').first().waitFor({ timeout: 10000 }).catch(() => null);
    if (device.touch) {
      // The bottom of the work area, scrolled as far as it goes, clears the
      // tab bar the phone draws over it.
      // Scrolled as a thumb does: to the very end of the work area.
      await page.evaluate(() => {
        const scroller = document.querySelector('[data-testid="tool-shell-work"]')?.lastElementChild;
        if (scroller) scroller.scrollTop = scroller.scrollHeight;
      });
      await sleep(200);
      const last = page.locator('[data-testid="flow-run"]').last();
      const runBox = await last.boundingBox().catch(() => null);
      const barBox = await page.locator('[data-testid="mobile-tab-bar"]').boundingBox().catch(() => null);
      check("on the phone the history's last run can be scrolled above the tab bar, to be pressed",
        Boolean(runBox && barBox) && runBox.y + runBox.height <= barBox.y + 1, `run ${JSON.stringify(runBox)} | tab bar ${JSON.stringify(barBox)}`);
    }
    await press(page.locator('[data-testid="flow-run"] button').first()).catch(() => null);
    await sleep(300);
    const said = await page.locator('[data-testid="flow-history"]').innerText().catch(() => "");
    check("credits run out under an automation that is on: its run stops at the AI box, the model is not asked, no debt",
      starved?.status === "failed" && starved.steps.some((s) => s.note === "no_credits") && model.calls.length === asks && state.credits === 0, JSON.stringify(starved?.steps));
    check("...and its history says so, in the reader's language", said.includes(A.notes.no_credits), `${said.slice(0, 200)} | ${page.url()} | ${(await page.locator("main").innerText()).slice(0, 300)}`);
    await context.close();

    // ---- a Free account
    reset({ locale, tier: "free", credits: 50 });
    ({ context, page, press } = await open(ON, device, locale));
    await page.goto(`${ON}/dashboard/automation`, { waitUntil: "networkidle" });
    const freeMain = await page.locator("main").innerText();
    check("Free: the tool opens with its price, as on every plan", freeMain.includes(A.name) && /\d/.test(await page.locator('[data-testid="flow-price"]').innerText()));
    await page.locator("textarea").first().fill(SENTENCE);
    await press(page.locator('button[type="submit"]').first());
    await page.locator('[data-testid="flow-box"]').first().waitFor({ timeout: 20000 }).catch(() => null);
    check("...and a Free account makes the file automation, charged from its credits", (await page.locator('[data-testid="flow-box"]').count()) === 4 && state.credits < 50);
    check("...not a sentence of the other language", foreignOn(locale, await page.locator("main").innerText()).length === 0, foreignOn(locale, await page.locator("main").innerText()).join(" | "));
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
