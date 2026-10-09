// THE CHAT SCREEN ON A DEPLOYMENT WITH NO VOICE KEYS, AND THE ANSWER'S
// CONTRAST WHILE IT IS STILL BEING WRITTEN.
//
// Two production reports of 2026-09-19, and one harness, because both
// are about the same screen in the same state and a `next build` is ten
// minutes.
//
//   1. "I press Talk and nothing happens. No explanation."
//      The button rendered, was disabled, and carried its reason in a
//      `title` attribute — which needs a mouse, a hover and a second of
//      patience, and on a phone does not exist at all.
//      SUPERSEDED 2026-10-05 by the owner's rule (the voice brief
//      «ΦΩΝΗ ΣΤΟ CHAT», Μέρος Α): «Κουμπί που δεν κάνει τίποτα δεν μένει στην οθόνη» —
//      with no keys the Talk button is not drawn at all, and the reason
//      is on the Voice settings screen. This measures that, with BOTH
//      provider keys removed from the server's environment rather than
//      stubbed. chat-dictation.prodtest.mjs holds every other state.
//
//   2. "While the AI is writing I cannot read what it says."
//      `dim` was chosen on 2026-09-04 and every measurement behind it was
//      taken on FINISHED messages. The streaming block is a different
//      element on a different code path (src/components/chat/chat-workspace.tsx,
//      `sending && streamingText !== null`). So: nine text points on THAT
//      block, while the model is still writing.
//
// WHY THIS FILE WAS RED FROM 2026-10-05 TO 2026-10-08 — THE FILE, NOT THE APP.
//
// It answered /api/chat in the browser with `route.fulfill`, which hands
// the page the whole NDJSON body in one piece, and every delta and the
// end of the turn land in ONE render: measured 2026-10-08 and again
// 2026-10-09 on main at c5257170 (React 19) with a MutationObserver, 0
// frames of the streaming block on either device. It told the two blocks
// apart by "no button", and with neither voice key the finished answer
// had no button either (src/components/voice/voice-player.tsx draws
// nothing without speech) — so on React 19 the check can only have
// passed on the FINISHED answer, until 4981e8f3 (2026-10-05) put a copy
// button under every finished answer, and from then on it could only
// fail. Whether React 18 ever drew the streaming block under this
// harness was never measured. A real answer arrives over time and the
// block IS drawn — part 2 below counts the steps it grows in, and
// requires five.
//
// The phone's "nine points" failure (5 and 8 found in two runs on
// 2026-10-05) was the file too. The points were taken at the middle of
// PARAGRAPH rectangles, which in a paragraph of an even number of lines
// is the gap between two of them; and a paragraph is clipped by the
// scrolling thread, not by the window, so points outside the thread's
// edges measured the chrome around it: on 2026-10-05 a phone point read
// 13,18,32 against 137,150,159, the composer's panel and its muted
// placeholder. Run on 2026-10-08 against the real stream below, that
// sampling still found 7, 1 and 5 points on the phone, one of them in the
// bar above the thread at exactly the --muted colour (141,150,168).
// Points are now taken on LINE boxes, inside the thread's visible box.
//
// THE STREAM IS REAL, END TO END. Nothing in the browser is intercepted.
// The real /api/chat runs — sign-in, plan, the hold on credits, the rows
// it writes into the Supabase stand-in (scripts/lib/mock-supabase.mjs,
// through its `handle` hook) — and asks a local stand-in for the MODEL
// (ANTHROPIC_BASE_URL, which the SDK reads) that streams in the
// provider's own server-sent-event shape, with real gaps between the
// pieces, and HOLDS before its last paragraph until this file has
// measured. While it holds, the page is still because nothing is
// arriving, so the rectangles and the pixels are the same moment.
//
// Around it (MASTER 16 checks, 2026-10-08): a new account with nothing
// yet, Greek and English (NEXT_LOCALE), a desktop with a mouse and a
// phone with real touch (CDP Input.dispatchTouchEvent), the provider
// failing in the middle of an answer, and a Free account.
//
// Run: node scripts/tests/chat-streaming-contrast.prodtest.mjs
//      SKIP_BUILD=1 node scripts/tests/chat-streaming-contrast.prodtest.mjs
//      CHAT_SHOTS=<dir> node scripts/tests/chat-streaming-contrast.prodtest.mjs
import http from "node:http";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { chromium } from "playwright";
import sharp from "sharp";
import { chromiumPath } from "./lib/chromium.mjs";
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
    console.log(`  FAIL  ${label}${detail === undefined ? "" : `\n        ${detail}`}`);
  }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const L = {
  el: JSON.parse(readFileSync("messages/el.json", "utf8")),
  en: JSON.parse(readFileSync("messages/en.json", "utf8")),
};
const plural = (s, n) => {
  const m = /\{count, plural, one \{([^}]*)\} other \{([^}]*)\}\}/.exec(s);
  return m ? s.replace(m[0], (n === 1 ? m[1] : m[2]).replace("#", String(n))) : s;
};

// ---------------------------------------------------------------------
// THE STAND-IN FOR SUPABASE, KEEPING WHAT IS WRITTEN
// ---------------------------------------------------------------------
// Rows the routes insert are kept and read back with the filters
// PostgREST was asked for, so the conversation /api/chat creates is the
// one its second message continues, and the answer it saves is counted.
const tables = new Map();
const table = (name) => {
  if (!tables.has(name)) tables.set(name, []);
  return tables.get(name);
};
const rpcs = [];
const state = { credits: 3000 };
let clock = Date.parse("2026-10-08T09:00:00Z");
const now = () => new Date((clock += 1000)).toISOString();

// `freeUsed` is this month's count of free chat messages (every plan has
// some: src/lib/billing/free-chat.ts). The page reads it from
// user_credits and consume_free_chat counts against the limit the route
// sends, as the database function does.
function reset({ tier, credits, freeUsed }) {
  tables.clear();
  rpcs.length = 0;
  state.credits = credits;
  MOCK_USER.user_metadata = { subscription_tier: tier };
  table("user_credits").push({
    user_id: MOCK_USER.id, credits_remaining: credits, credits_total: credits, plan_tier: tier, beta_expires_at: null,
    free_chat_used: freeUsed, free_chat_period_start: new Date().toISOString(),
  });
  table("user_onboarding").push({ user_id: MOCK_USER.id, completed_at: "2026-01-02T00:00:00Z", skipped_at: null });
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
    const cmp = (a, b) => (String(a[col] ?? "") < String(b[col] ?? "") ? -1 : String(a[col] ?? "") > String(b[col] ?? "") ? 1 : 0);
    out = [...out].sort((a, b) => cmp(a, b) * (dir === "desc" ? -1 : 1));
  }
  const limit = Number(params.get("limit") ?? 0);
  return limit > 0 ? out.slice(0, limit) : out;
}

// A stand-in that throws takes the run down and leaves the server behind,
// so a mistake in it is answered as a 500 and said.
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
  if (p.startsWith("/rest/v1/rpc/")) {
    const name = p.slice("/rest/v1/rpc/".length);
    let args = {};
    try { args = JSON.parse(body || "{}"); } catch {}
    rpcs.push({ name, args });
    if (name === "reserve_credits") {
      if (state.credits >= args.p_credits) {
        state.credits -= args.p_credits;
        // Kept on the call, so a settle or a release can be traced to the
        // hold it closes.
        rpcs.at(-1).reservationId = randomUUID();
        return send(200, [{ reservation_id: rpcs.at(-1).reservationId, available: state.credits }]);
      }
      return send(200, [{ reservation_id: null, available: state.credits }]);
    }
    if (name === "consume_free_chat" || name === "release_free_chat") {
      const row = table("user_credits")[0];
      if (name === "release_free_chat") {
        row.free_chat_used = Math.max(0, row.free_chat_used - 1);
        return send(200, null);
      }
      if (row.free_chat_used >= args.p_limit) return send(200, [{ granted: false, used: row.free_chat_used, remaining: 0 }]);
      row.free_chat_used += 1;
      return send(200, [{ granted: true, used: row.free_chat_used, remaining: args.p_limit - row.free_chat_used }]);
    }
    if (name === "consume_rate_limit") return send(200, true);
    res.writeHead(204);
    res.end();
    return true;
  }
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
      tables.set(name, table(name).filter((row) => !matches(row, url.searchParams)));
      return send(204, undefined);
    }
  }
  return false;
}

reset({ tier: "growth", credits: 3000, freeUsed: 0 });
// A fixed port: `next build` inlines NEXT_PUBLIC_SUPABASE_URL, so the
// build and this listener have to agree on it.
const supa = await startMockSupabase({ port: 54541, handle });

// ---------------------------------------------------------------------
// THE STAND-IN FOR THE MODEL: the provider's event stream, at a pace
// ---------------------------------------------------------------------
// Each answer the walk asks for is queued first: what to write before
// holding, what to write after, and whether it ends or fails. A streamed
// call with nothing queued answers one short line and ends, so a call
// this file did not expect cannot hang the run.
const GAP_MS = 14;
const model = { queue: [], streamed: 0 };
function expectAnswer({ held, rest = "", fail = false }) {
  const turn = { held, rest, fail, finished: false };
  turn.holding = new Promise((r) => (turn.reachedHold = r));
  turn.released = new Promise((r) => (turn.release = r));
  model.queue.push(turn);
  return turn;
}
// Small pieces with the spaces kept, as the provider sends them: a few
// words at a time, never a whole paragraph.
const pieces = (text) => text.match(/\S+\s*|\s+/g)?.reduce((out, word, i) => {
  if (i % 3 === 0) out.push(word);
  else out[out.length - 1] += word;
  return out;
}, []) ?? [];

const modelServer = http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", async () => {
    let asked = {};
    try { asked = JSON.parse(body || "{}"); } catch {}
    const reply = (code, payload) => {
      res.writeHead(code, { "Content-Type": "application/json", "request-id": "req_test" });
      res.end(JSON.stringify(payload));
    };
    const usage = { input_tokens: 1500, output_tokens: 60 };
    if (req.url.startsWith("/v1/messages/count_tokens")) return reply(200, { input_tokens: 12 });
    // The opening-message check (lib/ai/ambiguity.ts, when its own rules
    // cannot decide): the questions here are clear.
    if (asked.tool_choice?.name === "evaluate_request_clarity") {
      return reply(200, {
        id: "msg_c", type: "message", role: "assistant", model: asked.model, stop_reason: "tool_use", usage,
        content: [{ type: "tool_use", id: "tu_c", name: "evaluate_request_clarity", input: { needsClarification: false, questions: [] } }],
      });
    }
    // Memory extraction after the answer, and any other plain call.
    if (!asked.stream) return reply(200, { id: "msg_m", type: "message", role: "assistant", model: asked.model, stop_reason: "end_turn", usage, content: [{ type: "text", text: "NONE" }] });

    model.streamed++;
    const turn = model.queue.shift() ?? { held: "OK.", rest: "", fail: false, reachedHold() {}, released: Promise.resolve() };
    res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", "request-id": "req_test" });
    const sse = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    const write = async (text) => {
      for (const piece of pieces(text)) {
        sse("content_block_delta", { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: piece } });
        await sleep(GAP_MS);
      }
    };
    sse("message_start", { type: "message_start", message: { id: "msg_s", type: "message", role: "assistant", model: asked.model, content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 1500, output_tokens: 1 } } });
    sse("content_block_start", { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } });
    await write(turn.held);
    if (turn.fail) {
      // THE PROVIDER FAILING MID-ANSWER, in its own shape: an `error`
      // event on the open stream (overloaded), and the stream ends.
      sse("error", { type: "error", error: { type: "overloaded_error", message: "Overloaded" } });
      res.end();
      turn.reachedHold();
      return;
    }
    turn.reachedHold();
    await turn.released;
    await write(turn.rest);
    sse("content_block_stop", { type: "content_block_stop", index: 0 });
    sse("message_delta", { type: "message_delta", delta: { stop_reason: "end_turn", stop_sequence: null }, usage: { output_tokens: 600 } });
    sse("message_stop", { type: "message_stop" });
    res.end();
    turn.finished = true;
  });
});
await new Promise((r) => modelServer.listen(0, "127.0.0.1", r));
const MODEL_URL = `http://127.0.0.1:${modelServer.address().port}`;

// ---------------------------------------------------------------------
// THE BUILD AND THE SERVER
// ---------------------------------------------------------------------
const PORT = await new Promise((resolve) => {
  const probe = http.createServer();
  probe.listen(0, "127.0.0.1", () => {
    const { port } = probe.address();
    probe.close(() => resolve(port));
  });
});
const ORIGIN = `http://127.0.0.1:${PORT}`;
const env = {
  ...process.env,
  NODE_ENV: "production",
  PORT: String(PORT),
  NEXT_PUBLIC_SUPABASE_URL: supa.url,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: supa.anonKey,
  SUPABASE_SERVICE_ROLE_KEY: supa.serviceKey,
  NEXT_PUBLIC_SITE_URL: ORIGIN,
  // A customer's screen: nobody is the owner or the test account, so no
  // switch is on and the account is charged like anyone's.
  ADMIN_EMAILS: "",
  TEST_ACCOUNT_EMAILS: "",
  ANTHROPIC_API_KEY: "placeholder-answered-locally",
  ANTHROPIC_BASE_URL: MODEL_URL,
};
// PART 1'S CONDITION. Both voice provider keys are removed from the
// server's environment — src/lib/voice/voice-providers.ts reads them at
// request time, so this is the real deployment state, not a stub of it.
delete env.OPENAI_API_KEY;
delete env.ELEVENLABS_API_KEY;

let server = null;
let browser = null;
function cleanup() {
  // KILL THE GROUP, NOT THE HANDLE: `npx next start` is npx -> sh ->
  // next-server, and the grandchild outlives a kill of the handle.
  // Enforced by scripts/tests/prodtest-hygiene.test.mjs.
  try { if (server?.pid) process.kill(-server.pid, "SIGKILL"); } catch {}
  try { supa.close(); } catch {}
  try { modelServer.close(); } catch {}
}

if (process.env.SKIP_BUILD) {
  console.log("SKIP_BUILD=1 — reusing the existing .next");
} else {
  console.log("running `next build` (production build, not a dev server) ...");
  const build = spawn("npx", ["next", "build"], { env, stdio: ["ignore", "pipe", "pipe"] });
  let buildLog = "";
  build.stdout.on("data", (d) => (buildLog += d));
  build.stderr.on("data", (d) => (buildLog += d));
  if ((await new Promise((r) => build.on("close", r))) !== 0) {
    console.log("  FAIL  next build failed\n" + buildLog.slice(-3000));
    cleanup();
    process.exit(1);
  }
}

server = spawn("npx", ["next", "start", "-p", String(PORT)], { env, stdio: ["ignore", "pipe", "pipe"], detached: true });
let serverLog = "";
server.stdout.on("data", (d) => { serverLog += d; if (process.env.STREAM_SERVER_LOG) process.stderr.write(d); });
server.stderr.on("data", (d) => { serverLog += d; if (process.env.STREAM_SERVER_LOG) process.stderr.write(d); });
let up = false;
for (let i = 0; i < 120 && !up; i++) {
  try {
    up = (await fetch(`${ORIGIN}/login`, { signal: AbortSignal.timeout(2000) })).ok;
  } catch { /* not up yet */ }
  if (!up) await sleep(500);
}
if (!up) {
  console.log("  FAIL  production server did not start\n" + serverLog.slice(-2000));
  cleanup();
  process.exit(1);
}
console.log(`production server up on :${PORT} (next start, NODE_ENV=production)`);

// ---------------------------------------------------------------------
// CONTRAST, ON REAL PIXELS
// ---------------------------------------------------------------------
// WCAG relative luminance, read off a PNG rather than computed from CSS:
// a figure derived from the declared colours would not know what is
// actually behind the letters, which is the whole question.
const lin = (c) => {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};
const lum = (r, g, b) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
const ratio = (a, b) => {
  const la = lum(...a), lb = lum(...b);
  return +(((Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)).toFixed(2));
};
// INK THRESHOLD. A rendered glyph against any ground in this app separates
// by far more than this; a flat patch separates by almost nothing. It is
// not a contrast standard — 4.5:1 is asserted separately, on the points
// that pass this.
const INK = 1.5;
const SHOT_DIR = process.env.CHAT_SHOTS || "";

// THE ANSWERS. Long enough that, held before the last paragraph, the
// thread is full of the answer on a phone and on a desktop.
const REPLY = {
  en: {
    question: "Tell me what the numbers say about last quarter.",
    paragraphs: [
      "Here is what the numbers say about last quarter. Revenue rose in three of the four months, and the one that fell was the month with the fewest working days.",
      "The clearest pattern is in repeat purchases. Customers who bought twice in their first month went on to buy four more times on average, while those who bought once bought roughly one further time.",
      "Two things follow from that. The first is that the second purchase is worth more attention than the first. The second is that discounting the first purchase is probably cheaper than discounting later ones.",
      "Returns stayed low across the quarter, at under two in every hundred orders, and most of them came from a single product whose size chart was wrong until the middle of the second month.",
      "The busiest days were Thursdays and Fridays, and the quietest were Mondays. Orders placed after eight in the evening were larger on average than orders placed in the morning, by about a fifth.",
      "New customers came mostly from search in the first month and mostly from recommendations by the third, which is the shape a shop has when the people who already buy from it start telling others.",
      "If you want, I can break this down by product line, or by the channel each customer arrived through. Both are in the data you already have, and neither needs another import.",
    ],
    rest: "One more thing worth watching next quarter: the share of orders from returning customers. It rose from a third to nearly half, and it is the number most likely to tell you early whether the second-purchase effect is holding.",
  },
  el: {
    question: "Πες μου τι λένε τα νούμερα για το τελευταίο τρίμηνο.",
    paragraphs: [
      "Αυτά λένε τα νούμερα για το τελευταίο τρίμηνο. Τα έσοδα ανέβηκαν στους τρεις από τους τέσσερις μήνες, και αυτός που έπεσε ήταν ο μήνας με τις λιγότερες εργάσιμες μέρες.",
      "Το πιο καθαρό μοτίβο είναι στις επαναλαμβανόμενες αγορές. Όσοι αγόρασαν δύο φορές τον πρώτο τους μήνα αγόρασαν κατά μέσο όρο άλλες τέσσερις, ενώ όσοι αγόρασαν μία φορά αγόρασαν περίπου άλλη μία.",
      "Από αυτό βγαίνουν δύο πράγματα. Το πρώτο είναι ότι η δεύτερη αγορά αξίζει περισσότερη προσοχή από την πρώτη. Το δεύτερο είναι ότι η έκπτωση στην πρώτη αγορά μάλλον κοστίζει λιγότερο από την έκπτωση στις επόμενες.",
      "Οι επιστροφές έμειναν χαμηλά όλο το τρίμηνο, κάτω από δύο στις εκατό παραγγελίες, και οι περισσότερες ήρθαν από ένα προϊόν με λάθος πίνακα μεγεθών ως τη μέση του δεύτερου μήνα.",
      "Οι πιο πολυάσχολες μέρες ήταν η Πέμπτη και η Παρασκευή, και οι πιο ήσυχες οι Δευτέρες. Οι παραγγελίες μετά τις οκτώ το βράδυ ήταν κατά μέσο όρο μεγαλύτερες από τις πρωινές, περίπου κατά ένα πέμπτο.",
      "Οι νέοι πελάτες ήρθαν κυρίως από την αναζήτηση τον πρώτο μήνα και κυρίως από συστάσεις τον τρίτο, που είναι το σχήμα ενός καταστήματος όταν όσοι ήδη αγοράζουν αρχίζουν να το λένε σε άλλους.",
      "Αν θέλεις, μπορώ να το χωρίσω ανά σειρά προϊόντων ή ανά κανάλι από το οποίο ήρθε κάθε πελάτης. Και τα δύο υπάρχουν ήδη στα δεδομένα σου, και κανένα δεν χρειάζεται νέα εισαγωγή.",
    ],
    rest: "Κάτι ακόμα που αξίζει να προσέξεις το επόμενο τρίμηνο: το μερίδιο των παραγγελιών από πελάτες που ξαναγοράζουν. Ανέβηκε από το ένα τρίτο σχεδόν στο μισό, και είναι ο αριθμός που θα σου πει νωρίτερα αν το φαινόμενο της δεύτερης αγοράς κρατά.",
  },
};
const heldText = (locale) => REPLY[locale].paragraphs.join("\n\n") + "\n\n";
const squash = (s) => String(s).replace(/\s+/g, "");

// What a screen in one language must never show from the other: every
// sentence of the other language's messages that this one translates
// differently, and, on an English screen, any Greek letter at all.
function leaves(node, path = "", out = new Map()) {
  if (typeof node === "string") out.set(path, node);
  else if (node && typeof node === "object") for (const [k, v] of Object.entries(node)) leaves(v, path ? `${path}.${k}` : k, out);
  return out;
}
const FLAT = { el: leaves(L.el), en: leaves(L.en) };
const foreignSentences = (locale) => {
  const other = locale === "el" ? "en" : "el";
  return [...FLAT[other]]
    .filter(([key, s]) => !/[{<]/.test(s) && s.length >= 14 && /\s/.test(s) && FLAT[locale].get(key) !== s)
    .map(([, s]) => s);
};
const ENGLISH_ON_GREEK = foreignSentences("el");
async function screenText(page) {
  return page.evaluate(() => {
    const seen = [document.body.innerText];
    for (const el of document.querySelectorAll("[placeholder], [aria-label], [title]")) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      for (const a of ["placeholder", "aria-label", "title"]) if (el.getAttribute(a)) seen.push(el.getAttribute(a));
    }
    return seen.join("\n");
  });
}
function foreignOn(locale, text) {
  if (locale === "en") {
    const greek = text.match(/[^\n]*[\u0370-\u03ff\u1f00-\u1fff][^\n]*/g) ?? [];
    return greek;
  }
  return ENGLISH_ON_GREEK.filter((s) => text.includes(s));
}

// ---------------------------------------------------------------------
// THE WALK
// ---------------------------------------------------------------------
const results = [];
// The block being written: an answer whose row of actions has no copy
// button yet (src/components/chat/answer-actions.tsx draws copy only on
// a finished answer). Counted in the page from the first frame, so the
// number of steps it grew in is the page's own record, not a sample.
const WATCH_STREAM = () => {
  window.__stream = { lengths: new Set() };
  const look = () => {
    for (const block of document.querySelectorAll(".chat-ground-dim")) {
      const actions = block.querySelector('[data-testid="answer-actions"]');
      if (!actions || actions.querySelector('[data-testid="answer-copy"]')) continue;
      window.__stream.lengths.add(block.textContent.length);
    }
  };
  new MutationObserver(look).observe(document, { subtree: true, childList: true, characterData: true });
};

async function open({ device, locale }) {
  const context = await browser.newContext({ viewport: device.viewport, hasTouch: device.touch, isMobile: device.touch, locale: locale === "el" ? "el-GR" : "en-US" });
  await context.addCookies([
    { ...supa.authCookie, url: ORIGIN, httpOnly: false, secure: false, sameSite: "Lax" },
    { name: "NEXT_LOCALE", value: locale, url: ORIGIN },
  ]);
  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", (err) => pageErrors.push(String(err?.message ?? err)));
  await page.addInitScript(WATCH_STREAM);
  const cdp = device.touch ? await context.newCDPSession(page) : null;
  async function press(locator) {
    if (!cdp) return locator.click();
    const box = await locator.boundingBox();
    const x = box.x + box.width / 2, y = box.y + box.height / 2;
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  }
  return { context, page, press, pageErrors };
}

/** Types the question and sends it: Enter at a desk, the send button under a thumb. */
async function ask(page, press, device, locale, text) {
  const field = page.locator("textarea").first();
  await press(field);
  await page.keyboard.type(text);
  if (device.touch) await press(page.getByRole("button", { name: L[locale].dashboard.chat.send, exact: true }));
  else await page.keyboard.press("Enter");
}

const lastAnswer = (page) => page.evaluate(() => {
  const blocks = [...document.querySelectorAll(".chat-ground-dim")];
  const block = blocks.at(-1);
  if (!block) return null;
  const prose = block.querySelector(":scope > .leading-relaxed");
  return {
    count: blocks.length,
    text: prose?.textContent ?? "",
    writing: Boolean(block.querySelector('[data-testid="answer-actions"]') && !block.querySelector('[data-testid="answer-copy"]')),
    notice: block.querySelector(":scope > p:last-child")?.textContent?.trim() ?? "",
  };
});

/** Nine points or more on the answer being written, or why there are not nine. */
async function measure(page, label) {
  // The rectangles and the pixels must be the same moment. With the model
  // holding nothing arrives, so the page should be still — read, shoot,
  // read again, and require the two readings to agree to the pixel.
  const readLines = () =>
    page.evaluate(() => {
      const block = [...document.querySelectorAll(".chat-ground-dim")].at(-1);
      const prose = block?.querySelector(":scope > .leading-relaxed");
      const thread = document.querySelector('[data-testid="chat-thread"]');
      // STILL BEING WRITTEN in this frame: the same test as WATCH_STREAM.
      // Without it, a model that does not hold finishes before the
      // screenshot and every ratio is of the finished answer, green.
      const writing = Boolean(block?.querySelector('[data-testid="answer-actions"]') && !block.querySelector('[data-testid="answer-copy"]'));
      if (!prose || !thread) return { lines: [], view: null, writing };
      const t = thread.getBoundingClientRect();
      // WHAT AN EYE CAN SEE: the thread's own box, cut to the window. A
      // line under its bottom edge is behind the composer, not on screen.
      const view = { top: Math.max(t.top, 0), bottom: Math.min(t.bottom, window.innerHeight), left: Math.max(t.left, 0), right: Math.min(t.right, window.innerWidth) };
      const rows = [];
      const walker = document.createTreeWalker(prose, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) {
        const node = walker.currentNode;
        if (!node.textContent.trim()) continue;
        const range = document.createRange();
        range.selectNodeContents(node);
        for (const r of range.getClientRects()) {
          if (r.width < 24 || r.height < 8) continue;
          if (r.top < view.top || r.bottom > view.bottom || r.left < view.left || r.right > view.right) continue;
          // One row per line: fragments of the same line are joined.
          const row = rows.find((x) => Math.abs(x.top - r.top) < 1);
          if (row) { row.left = Math.min(row.left, r.left); row.right = Math.max(row.right, r.right); }
          else rows.push({ top: r.top, bottom: r.bottom, left: r.left, right: r.right });
        }
      }
      rows.sort((a, b) => a.top - b.top);
      return { lines: rows.map((r) => ({ x: r.left, y: r.top, w: r.right - r.left, h: r.bottom - r.top })), view, writing };
    });
  const same = (a, b) => a.length === b.length && a.every((l, i) => Math.abs(l.x - b[i].x) < 1 && Math.abs(l.y - b[i].y) < 1 && Math.abs(l.w - b[i].w) < 1);
  const shot = `${SHOT_DIR || "/tmp"}/chat-streaming-${label}.png`;
  let lines = [], stable = false, view = null, writing = false;
  for (let attempt = 0; attempt < 8 && !stable; attempt++) {
    const before = await readLines();
    await page.screenshot({ path: shot });
    const after = await readLines();
    if (before.lines.length > 0 && same(before.lines, after.lines)) {
      ({ lines, view } = after);
      writing = before.writing && after.writing;
      stable = true;
    } else await sleep(150);
  }
  check("the page held still across the screenshot", stable, "the thread moved between reading the lines and reading the pixels — every ratio would be of a different frame");
  if (!stable) return null;
  check("...and in that frame the answer was still being written", writing, "it had finished before the screenshot — every ratio below is of the finished answer");

  const img = sharp(shot);
  const { width: W, height: H } = await img.metadata();
  const raw = await img.raw().toBuffer();
  const ch = raw.length / (W * H);
  const px = (x, y) => {
    const i = (Math.round(y) * W + Math.round(x)) * ch;
    return [raw[i], raw[i + 1], raw[i + 2]];
  };
  // SPREAD OVER THE SCREEN: up to six lines, evenly from the first visible
  // to the last, three points along each — the start, the middle and the
  // end of the line, at the middle of its height, where the letters are.
  // Up to eighteen candidates, all measured below.
  const chosen = [];
  const step = Math.max(1, (lines.length - 1) / 5);
  for (let k = 0; k < 6 && Math.round(k * step) < lines.length; k++) {
    const line = lines[Math.round(k * step)];
    if (!chosen.includes(line)) chosen.push(line);
  }
  const candidates = chosen.flatMap((l) => [0.15, 0.5, 0.85].map((fx) => ({ x: l.x + l.w * fx, y: l.y + l.h / 2 })));
  // THE DARKEST AND LIGHTEST PIXEL in a small window around each point:
  // text is thin, and the pair is the letter against what is right behind it.
  const sample = (p) => {
    let dark = [255, 255, 255], light = [0, 0, 0];
    for (let dx = -6; dx <= 6; dx++) {
      for (let dy = -4; dy <= 4; dy++) {
        const c = px(Math.min(W - 1, Math.max(0, p.x + dx)), Math.min(H - 1, Math.max(0, p.y + dy)));
        if (lum(...c) < lum(...dark)) dark = c;
        if (lum(...c) > lum(...light)) light = c;
      }
    }
    return { contrast: ratio(dark, light), x: Math.round(p.x), y: Math.round(p.y), dark, light };
  };
  const all = candidates.map(sample);
  const inked = all.filter((m) => m.contrast >= INK);
  // EVERY ONE WITH INK IS MEASURED, and at least nine are required. The
  // first nine alone would be the top three lines only, and the lines
  // being written are the ones at the bottom, next to the field.
  const measured = inked;
  const worst = measured.length ? Math.min(...measured.map((m) => m.contrast)) : 0;
  console.log(`      ${lines.length} lines visible in the thread (${Math.round(view.top)}–${Math.round(view.bottom)}px); ${measured.length} points measured:`);
  for (const m of measured) console.log(`      ${String(m.contrast).padStart(6)}:1  @${String(m.x).padStart(4)},${String(m.y).padStart(4)}  dark=${m.dark.join(",")} light=${m.light.join(",")}`);
  // HOW MANY WERE SKIPPED IS PRINTED, never hidden.
  console.log(`      (${all.length - inked.length} of ${all.length} candidate windows held no ink)`);
  check(`at least nine points were found on the answer being written (${measured.length})`, measured.length >= 9, `${measured.length} — fewer than nine means the sample is smaller than the claim`);
  check(`most candidate windows were text (${inked.length}/${all.length})`, all.length > 0 && inked.length / all.length >= 0.5, "the line boxes and the pixels disagree, so the points may not be where the text is");
  check(`the worst of them clears 4.5:1 (${worst}:1)`, worst >= 4.5, `${worst}:1 on ${measured.length} points, while the answer is being written`);
  return { worst, points: measured.length, shot };
}

const DEVICES = [
  { label: "desktop", viewport: { width: 1440, height: 900 }, touch: false },
  { label: "phone", viewport: { width: 390, height: 844 }, touch: true },
];

try {
  browser = await chromium.launch({ executablePath: chromiumPath() });
  for (const device of DEVICES) {
    for (const locale of ["el", "en"]) {
      // ---------------------------------------------------------------
      // A NEW ACCOUNT WITH NOTHING YET, on a paid plan whose free chat
      // messages for the month are used up — so the answer is charged,
      // through the hold on credits.
      // ---------------------------------------------------------------
      where = `${device.label} ${locale}`;
      console.log(`\n== ${device.label} ${device.viewport.width}x${device.viewport.height}, ${locale}, a new account ==`);
      reset({ tier: "growth", credits: 3000, freeUsed: 107 });
      model.queue.length = 0;
      const { context, page, press, pageErrors } = await open({ device, locale });
      const T = L[locale];
      const resp = await page.goto(`${ORIGIN}/dashboard/chat`, { waitUntil: "networkidle" });
      check(`/dashboard/chat renders (HTTP ${resp?.status()})`, resp?.status() === 200);
      check("with nothing yet, Chat is the empty screen", (await page.locator('[data-testid="chat-empty"]').count()) === 1);

      // 1. NO KEYS, NO TALK BUTTON.
      check("with neither voice key, there is no Talk button to press", (await page.locator('[data-testid="voice-conversation-start"]').count()) === 0);

      // 2. THE ANSWER, WHILE IT IS BEING WRITTEN.
      const turn = expectAnswer({ held: heldText(locale), rest: REPLY[locale].rest });
      await ask(page, press, device, locale, REPLY[locale].question);
      const held = await Promise.race([turn.holding.then(() => true), sleep(30000).then(() => false)]);
      check("the question reached the model through /api/chat", held, `the model was asked ${model.streamed} time(s)`);
      // The screen catches up with what the model has written so far.
      const tail = squash(heldText(locale)).slice(-40);
      const caughtUp = await page
        .waitForFunction((t) => {
          const block = [...document.querySelectorAll(".chat-ground-dim")].at(-1);
          return Boolean(block && block.textContent.replace(/\s+/g, "").includes(t));
        }, tail, { timeout: 15000 })
        .then(() => true, () => false);
      const mid = await lastAnswer(page);
      const steps = await page.evaluate(() => window.__stream.lengths.size);
      check(
        `an answer is mid-stream right now: the model is still writing it, and ${squash(mid?.text ?? "").length} characters are on screen`,
        caughtUp && mid?.writing === true && turn.finished === false && (await page.locator('[data-testid="chat-stop"]').count()) === 1,
        JSON.stringify({ caughtUp, writing: mid?.writing, finished: turn.finished })
      );
      check(`...and it arrived on screen in steps as it was written (${steps})`, steps >= 5, `${steps} — one or none means the screen was handed the answer whole`);
      check("...what is on screen is exactly what the model has written so far", squash(mid?.text) === squash(heldText(locale)), `${squash(mid?.text).length} vs ${squash(heldText(locale)).length}`);
      check("...under it, the AI notice in the reader's language", mid?.notice === T.common.aiGenerated.short, JSON.stringify(mid?.notice));
      const m = await measure(page, `${device.viewport.width}x${device.viewport.height}-${locale}`);
      if (m) results.push({ where, ...m });
      const foreignMid = foreignOn(locale, await screenText(page));
      check("no word of the other language on the screen while it writes", foreignMid.length === 0, foreignMid.slice(0, 3).join(" | "));

      // ...and it finishes.
      turn.release();
      const done = await page
        .waitForFunction(() => Boolean([...document.querySelectorAll(".chat-ground-dim")].at(-1)?.querySelector('[data-testid="answer-copy"]')), null, { timeout: 15000 })
        .then(() => true, () => false);
      const end = await lastAnswer(page);
      const full = heldText(locale) + REPLY[locale].rest;
      check("the answer finishes, whole, and the stop button goes", done && squash(end?.text) === squash(full) && (await page.locator('[data-testid="chat-stop"]').count()) === 0, JSON.stringify({ done, chars: squash(end?.text).length, want: squash(full).length }));
      const saved = table("chat_messages").filter((r) => r.role === "assistant");
      check("...and it is saved as written", saved.length === 1 && squash(saved[0].content) === squash(full), `${saved.length} saved`);
      // THE CHAT'S OWN HOLDS. Other things on the screen hold credits too
      // (the finished answer's paid transition detector,
      // src/components/transitions/transition-button.tsx), so each hold is
      // followed by its id from reserve to settle or release.
      const holds = () => rpcs.filter((r) => r.name === "reserve_credits" && r.args.p_action === "chat_message");
      const closed = (n, hold) => rpcs.filter((r) => r.name === n && r.args.p_reservation_id === hold?.reservationId).length;
      const [firstHold] = holds();
      check(
        "...charged through one hold on credits, settled once",
        holds().length === 1 && closed("settle_reservation", firstHold) === 1 && closed("release_reservation", firstHold) === 0,
        JSON.stringify(rpcs.map((r) => `${r.name}${r.args.p_action ? `:${r.args.p_action}` : ""}`))
      );

      // ---------------------------------------------------------------
      // THE PROVIDER FAILING HALFWAY THROUGH THE NEXT ANSWER.
      // ---------------------------------------------------------------
      const partial = REPLY[locale].paragraphs.slice(0, 2).join("\n\n");
      const failing = expectAnswer({ held: partial, fail: true });
      await ask(page, press, device, locale, locale === "el" ? "Και ανά κανάλι;" : "And by channel?");
      await Promise.race([failing.holding, sleep(30000)]);
      const errorLine = page.locator("p.text-danger");
      await errorLine.first().waitFor({ timeout: 15000 }).catch(() => null);
      const codes = T.errors.codes.serverError;
      const expected = `${codes.what} ${codes.next} ${T.errors.credits.unverified}`;
      const after = await lastAnswer(page);
      check("provider error: what was written stays on screen", after?.count === 2 && squash(after.text) === squash(partial), JSON.stringify({ count: after?.count, chars: squash(after?.text).length }));
      check("...and the screen says it failed, in the reader's language", (await errorLine.count()) === 1 && (await errorLine.innerText()).trim() === expected, `${await errorLine.allInnerTexts()} — want ${expected}`);
      check("...and the stop button goes", (await page.locator('[data-testid="chat-stop"]').count()) === 0);
      const failedHold = holds()[1];
      check(
        "...and the credits held for it are released, not charged",
        holds().length === 2 && closed("release_reservation", failedHold) === 1 && closed("settle_reservation", failedHold) === 0,
        JSON.stringify(rpcs.map((r) => `${r.name}${r.args.p_action ? `:${r.args.p_action}` : ""}`))
      );
      const foreignErr = foreignOn(locale, await screenText(page));
      check("...with no word of the other language on the screen", foreignErr.length === 0, foreignErr.slice(0, 3).join(" | "));
      check(`no page threw (${pageErrors.length})`, pageErrors.length === 0, pageErrors.slice(0, 3).join(" | "));
      await context.close();
    }

    // -----------------------------------------------------------------
    // A FREE ACCOUNT: the same answer, in the smaller envelope, with its
    // allowance under the field.
    // -----------------------------------------------------------------
    where = `${device.label} el Free`;
    console.log(`\n== ${device.label}, el, a Free account ==`);
    reset({ tier: "free", credits: 0, freeUsed: 0 });
    model.queue.length = 0;
    const { context, page, press, pageErrors } = await open({ device, locale: "el" });
    await page.goto(`${ORIGIN}/dashboard/chat`, { waitUntil: "networkidle" });
    const turn = expectAnswer({ held: heldText("el"), rest: REPLY.el.rest });
    await ask(page, press, device, "el", REPLY.el.question);
    await Promise.race([turn.holding, sleep(30000)]);
    const tail = squash(heldText("el")).slice(-40);
    await page
      .waitForFunction((t) => Boolean([...document.querySelectorAll(".chat-ground-dim")].at(-1)?.textContent.replace(/\s+/g, "").includes(t)), tail, { timeout: 15000 })
      .catch(() => null);
    const mid = await lastAnswer(page);
    check("a Free message is written the same way, while the model still writes", mid?.writing === true && turn.finished === false && rpcs.some((r) => r.name === "consume_free_chat") && !rpcs.some((r) => r.name === "reserve_credits"), JSON.stringify({ writing: mid?.writing, rpcs: rpcs.map((r) => r.name) }));
    // What is left is the plan's monthly number, as the route sent it to
    // consume_free_chat, less the one just used.
    const limit = rpcs.find((r) => r.name === "consume_free_chat")?.args?.p_limit;
    const allowance = plural(L.el.credits.freeChat.remaining, limit - 1);
    check("...with what is left of the allowance under the field, in Greek", (await page.getByText(allowance, { exact: true }).count()) === 1, allowance);
    const m = await measure(page, `${device.viewport.width}x${device.viewport.height}-el-free`);
    if (m) results.push({ where, ...m });
    turn.release();
    await page
      .waitForFunction(() => Boolean([...document.querySelectorAll(".chat-ground-dim")].at(-1)?.querySelector('[data-testid="answer-copy"]')), null, { timeout: 15000 })
      .catch(() => null);
    check("...and it finishes", squash((await lastAnswer(page))?.text) === squash(heldText("el") + REPLY.el.rest));
    check(`no page threw (${pageErrors.length})`, pageErrors.length === 0, pageErrors.slice(0, 3).join(" | "));
    await context.close();
  }
} catch (err) {
  check("the run completed", false, String(err?.stack ?? err));
} finally {
  if (browser) await browser.close().catch(() => {});
  cleanup();
}

console.log("\n  NOT MEASURED HERE: how far the answer moves while it is being written.");
console.log("  The answer now arrives at a real pace, so it can be; see docs/v6-list.md §15.");
for (const r of results) console.log(`  ${r.where}: worst ${r.worst}:1 over ${r.points} points, mid-stream — ${r.shot}`);

console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${failures.length} failed`);
process.exit(failures.length === 0 ? 0 : 1);
