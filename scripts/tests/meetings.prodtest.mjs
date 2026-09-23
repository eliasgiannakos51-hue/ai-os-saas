#!/usr/bin/env node
/*
 * THE WHOLE FLOW, THROUGH THE REAL ROUTES, IN A REAL PRODUCTION BUILD.
 *
 * scripts/tests/meetings.test.mjs reads code and runs pure functions. It
 * cannot tell you that the three routes fit together — that the field
 * the transcribe route returns is the field the analyse route needs, that
 * an index chosen on the screen selects the sentence the user saw, or
 * that a refusal comes back as the code the screen knows how to render.
 * Every one of those is a wiring question, and a wiring question is
 * answered by making the request.
 *
 * WHAT IS REAL HERE: `next build`, `next start`, the route handlers, the
 * billing chain, the limit checks, the prompt, the parser.
 *
 * WHAT IS STANDING IN: the database (PostgREST's shapes, and it is
 * STATEFUL for meetings and meeting_actions — an insert that does not
 * come back on the next read cannot exercise a flow), Whisper, and
 * Anthropic. The two providers are reached through their own documented
 * base-URL variables, so nothing in the app knows it is under test.
 *
 * WHAT IS NOT PROVED, and it is the interesting half: whether a real
 * recording of a real Greek meeting comes back with the right names in
 * it. The transcript here is one this file wrote. No test in this
 * repository can answer that; a person with a recording can, in about a
 * minute.
 *
 * Run: node scripts/tests/meetings.prodtest.mjs
 */
import http from "node:http";
import { spawn } from "node:child_process";

let pass = 0;
const failures = [];
const check = (name, cond, detail) => {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    failures.push(name);
    console.log(`  FAIL  ${name}${detail !== undefined ? "\n        " + detail : ""}`);
  }
};

const USER_ID = "00000000-0000-4000-8000-000000000001";
const user = () => ({
  id: USER_ID,
  aud: "authenticated",
  role: "authenticated",
  email: "owner@example.com",
  email_confirmed_at: "2026-01-01T00:00:00Z",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  app_metadata: { provider: "email", providers: ["email"] },
  user_metadata: { subscription_tier: "growth" },
  identities: [],
});

// THE GREEK MEETING. Written here, and the names in it are the point:
// «Γιώργος» and «Νεφέλη» are what a summary must carry through unchanged,
// and «μέχρι την Παρασκευή» is a WHEN that has no date.
const TRANSCRIPT =
  "Λοιπόν, ξεκινάμε. Ο Γιώργος θα στείλει την προσφορά στον πελάτη μέχρι την Παρασκευή. " +
  "Η Νεφέλη αναλαμβάνει να ετοιμάσει τα οικονομικά για τον Μάρτιο. " +
  "Συζητήσαμε επίσης το ενδεχόμενο να αλλάξουμε προμηθευτή, αλλά δεν αποφασίστηκε τίποτα.";

const ANALYSIS = {
  summary:
    "Συζητήθηκε η προσφορά προς τον πελάτη και τα οικονομικά του Μαρτίου. " +
    "Το θέμα του προμηθευτή έμεινε ανοιχτό.",
  actions: [
    { who: "Γιώργος", what: "Στέλνει την προσφορά στον πελάτη", when: "μέχρι την Παρασκευή" },
    { who: "Νεφέλη", what: "Ετοιμάζει τα οικονομικά για τον Μάρτιο" },
    { what: "Χωρίς ανάθεση: επανεξέταση προμηθευτή" },
  ],
};

// --- the stand-in database, and it REMEMBERS -------------------------
const meetings = new Map();
const meetingActions = [];
const seen = { reserve: 0, settle: 0, release: 0, consumeSeconds: 0 };

const supa = http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    const url = new URL(req.url, "http://x");
    const json = (code, data) => {
      res.writeHead(code, { "Content-Type": "application/json" });
      res.end(JSON.stringify(data));
    };
    if (url.pathname === "/auth/v1/user") return json(200, user());
    if (url.pathname.startsWith("/auth/v1/")) return json(200, { user: user(), session: null });

    if (url.pathname.startsWith("/rest/v1/rpc/")) {
      const fn = url.pathname.slice("/rest/v1/rpc/".length);
      if (fn === "consume_rate_limit") return json(200, [{ allowed: true, remaining: 99 }]);
      if (fn === "consume_voice_seconds") {
        seen.consumeSeconds++;
        return json(200, [{ allowed: true, used_seconds: 120, remaining_seconds: 5280 }]);
      }
      if (fn === "voice_usage_this_month") return json(200, [{ used_seconds: 120 }]);
      if (fn === "reserve_credits") {
        seen.reserve++;
        return json(200, [{ reservation_id: "44444444-4444-4444-8444-444444444444", available: 9000 }]);
      }
      if (fn === "settle_reservation") {
        seen.settle++;
        return json(200, null);
      }
      if (fn === "release_reservation") {
        seen.release++;
        return json(200, null);
      }
      return json(200, null);
    }

    if (url.pathname.startsWith("/rest/v1/")) {
      const table = url.pathname.slice("/rest/v1/".length).split("?")[0];
      const single = (req.headers.accept ?? "").includes("vnd.pgrst.object");
      const parsed = body ? JSON.parse(body) : null;

      if (req.method === "POST") {
        if (table === "meetings") {
          const row = {
            id: `m-${meetings.size + 1}`,
            created_at: "2026-09-23T10:00:00Z",
            summary: null,
            proposed_actions: [],
            analysis_error: null,
            analysed_at: null,
            ...parsed,
          };
          meetings.set(row.id, row);
          return json(201, single ? row : [row]);
        }
        if (table === "meeting_actions") {
          const rows = (Array.isArray(parsed) ? parsed : [parsed]).map((r, i) => ({
            id: `a-${meetingActions.length + i + 1}`,
            created_at: "2026-09-23T10:05:00Z",
            done: false,
            due_date: null,
            ...r,
          }));
          meetingActions.push(...rows);
          return json(201, single ? rows[0] : rows);
        }
        return json(201, single ? {} : []);
      }

      if (req.method === "PATCH") {
        if (table === "meetings") {
          // The route filters by id; the stand-in has one meeting per id
          // and the query string carries it as `id=eq.<value>`.
          const id = (url.searchParams.get("id") ?? "").replace(/^eq\./, "");
          const row = { ...(meetings.get(id) ?? {}), ...parsed };
          meetings.set(id, row);
          return json(200, single ? row : [row]);
        }
        return json(200, single ? {} : []);
      }

      if (req.method === "DELETE") {
        if (table === "meetings") {
          const id = (url.searchParams.get("id") ?? "").replace(/^eq\./, "");
          const existed = meetings.delete(id);
          const rows = existed ? [{ id }] : [];
          return json(200, single ? rows[0] ?? null : rows);
        }
        return json(200, []);
      }

      if (table === "meetings") {
        const id = (url.searchParams.get("id") ?? "").replace(/^eq\./, "");
        const rows = id ? [meetings.get(id)].filter(Boolean) : [...meetings.values()];
        if (single) return rows[0] ? json(200, rows[0]) : json(406, { message: "no rows" });
        return json(200, rows);
      }
      if (table === "meeting_actions") {
        const mid = (url.searchParams.get("meeting_id") ?? "").replace(/^eq\./, "");
        return json(200, meetingActions.filter((a) => !mid || a.meeting_id === mid));
      }
      if (table === "user_credits") {
        const row = { user_id: USER_ID, credits_remaining: 9000, credits_total: 9000 };
        return json(200, single ? row : [row]);
      }
      return json(200, single ? {} : []);
    }
    json(200, {});
  });
});

// --- the stand-in Whisper --------------------------------------------
let whisperCalls = 0;
let lastWhisperForm = "";
const openai = http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    whisperCalls++;
    lastWhisperForm = body;
    res.writeHead(200, { "Content-Type": "application/json" });
    // verbose_json, which is what the route asks for — and `language`
    // is the whole reason it does.
    res.end(JSON.stringify({ text: TRANSCRIPT, language: "greek", duration: 120 }));
  });
});

// --- the stand-in Anthropic ------------------------------------------
let anthropicCalls = 0;
let lastSystemPrompt = "";
let anthropicReply = () => JSON.stringify(ANALYSIS);
const anthropic = http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    anthropicCalls++;
    try {
      const parsed = JSON.parse(body);
      lastSystemPrompt = JSON.stringify(parsed.system ?? "");
    } catch {
      lastSystemPrompt = "";
    }
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        id: "msg_test",
        type: "message",
        role: "assistant",
        model: "claude-sonnet-4-6",
        content: [{ type: "text", text: anthropicReply() }],
        stop_reason: "end_turn",
        usage: { input_tokens: 4000, output_tokens: 300 },
      })
    );
  });
});

const SUPA_PORT = 54361;
const OPENAI_PORT = 54362;
const ANTHROPIC_PORT = 54363;
await new Promise((r) => supa.listen(SUPA_PORT, "127.0.0.1", r));
await new Promise((r) => openai.listen(OPENAI_PORT, "127.0.0.1", r));
await new Promise((r) => anthropic.listen(ANTHROPIC_PORT, "127.0.0.1", r));

const PROJECT_REF = "127";
const b64u = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const nowSec = Math.floor(Date.now() / 1000);
const jwt = (claims) => `${b64u({ alg: "HS256", typ: "JWT" })}.${b64u(claims)}.test-signature`;
const session = {
  access_token: jwt({ sub: USER_ID, aud: "authenticated", role: "authenticated", email: "owner@example.com", iat: nowSec, exp: nowSec + 3600 }),
  token_type: "bearer",
  expires_in: 3600,
  expires_at: nowSec + 3600,
  refresh_token: "test-refresh-token",
  user: user(),
};
const COOKIE = `sb-${PROJECT_REF}-auth-token=base64-${Buffer.from(JSON.stringify(session)).toString("base64url")}`;

const PORT = await new Promise((resolve) => {
  const probe = http.createServer();
  probe.listen(0, "127.0.0.1", () => {
    const { port } = probe.address();
    probe.close(() => resolve(port));
  });
});

const env = {
  ...process.env,
  NODE_ENV: "production",
  PORT: String(PORT),
  NEXT_PUBLIC_SUPABASE_URL: `http://127.0.0.1:${SUPA_PORT}`,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: jwt({ iss: "supabase", ref: PROJECT_REF, role: "anon", iat: 1, exp: 2000000000 }),
  SUPABASE_SERVICE_ROLE_KEY: jwt({ iss: "supabase", ref: PROJECT_REF, role: "service_role", iat: 1, exp: 2000000000 }),
  NEXT_PUBLIC_SITE_URL: `http://127.0.0.1:${PORT}`,
  // THE TWO PROVIDERS, POINTED AT THE STAND-INS BY THEIR OWN DOCUMENTED
  // VARIABLES. Nothing in the app knows it is under test.
  OPENAI_API_KEY: "sk-test",
  OPENAI_BASE_URL: `http://127.0.0.1:${OPENAI_PORT}/v1`,
  ANTHROPIC_API_KEY: "sk-ant-test",
  ANTHROPIC_BASE_URL: `http://127.0.0.1:${ANTHROPIC_PORT}`,
};

console.log("running `next build` (production build, not a dev server) ...");
const build = spawn("npx", ["next", "build"], { env, stdio: ["ignore", "pipe", "pipe"] });
let buildLog = "";
build.stdout.on("data", (d) => (buildLog += d));
build.stderr.on("data", (d) => (buildLog += d));
if ((await new Promise((r) => build.on("close", r))) !== 0) {
  console.log("  FAIL  next build failed\n" + buildLog.slice(-3000));
  process.exit(1);
}

const server = spawn("npx", ["next", "start", "-p", String(PORT)], {
  env,
  stdio: ["ignore", "pipe", "pipe"],
  detached: true,
});
const cleanup = () => {
  try {
    process.kill(-server.pid, "SIGKILL");
  } catch {
    try {
      server.kill("SIGKILL");
    } catch {
      /* already gone */
    }
  }
  supa.close();
  openai.close();
  anthropic.close();
};
process.on("exit", cleanup);

const origin = `http://127.0.0.1:${PORT}`;
for (let i = 0; i < 60; i++) {
  await new Promise((r) => setTimeout(r, 500));
  try {
    const probe = await fetch(`${origin}/api/health`, { redirect: "manual" });
    if (probe.status < 500) break;
  } catch {
    /* not up yet */
  }
}

// THE COOKIE GOES LAST, and the first version of this had it first —
// `...init` then replaced the whole headers object with the caller's,
// dropping the session, and three checks failed as 401 while the routes
// were correct. A test that fails for its own reasons costs the same
// time as a real defect and teaches nothing.
const post = (path, init = {}) =>
  fetch(`${origin}${path}`, {
    method: "POST",
    ...init,
    headers: { Cookie: COOKIE, ...(init.headers ?? {}) },
  });

/** A believable small audio upload. The route checks the MIME type and
 *  the size, never the bytes — Whisper is the thing that reads those,
 *  and it is standing in. */
const audioBlob = (bytes = 64 * 1024) =>
  new Blob([new Uint8Array(bytes)], { type: "audio/mp4" });

try {
  // -------------------------------------------------------------------
  console.log("\n== 1. an upload becomes a transcript, and the audio is not kept ==");
  // -------------------------------------------------------------------
  const form = new FormData();
  form.append("audio", audioBlob(), "συσκεψη-14-03.m4a");
  form.append("seconds", "120");
  const res1 = await post("/api/meetings/transcribe", { body: form });
  const data1 = await res1.json();
  check(`the upload is accepted (HTTP ${res1.status})`, res1.ok && data1.ok === true, JSON.stringify(data1).slice(0, 400));
  check("the transcript comes back", data1.transcript === TRANSCRIPT, String(data1.transcript).slice(0, 120));
  check("...and it was saved", data1.saved === true && Boolean(data1.meeting?.id));
  check("Whisper was called exactly once", whisperCalls === 1, String(whisperCalls));
  check("the minutes were consumed", seen.consumeSeconds === 1, String(seen.consumeSeconds));
  check("credits were reserved and settled", seen.reserve === 1 && seen.settle === 1, JSON.stringify(seen));
  check("a receipt came back", typeof data1.usage === "object" && data1.usage !== null, JSON.stringify(data1.usage));

  // THE LANGUAGE HINT. Its ABSENCE is the assertion: the route must not
  // bias an English meeting towards a Greek interface.
  check(
    "no language hint was sent to Whisper",
    !/name="language"/.test(lastWhisperForm),
    lastWhisperForm.slice(0, 200)
  );
  check("the detected language came back as a CODE, not the provider's word",
    data1.language === "el", String(data1.language));

  // THE TITLE IS FROM THE TRANSCRIPT, NOT THE FILENAME — and the
  // filename here is the shape a real one has: a person and a date.
  check(
    "the title is not the filename",
    !String(data1.meeting.title).includes("συσκεψη-14-03"),
    String(data1.meeting.title)
  );
  check("...it is the start of what was said", String(data1.meeting.title).startsWith("Λοιπόν"), String(data1.meeting.title));

  const stored = [...meetings.values()][0];
  check(
    "nothing audio-shaped was written to the database",
    !Object.keys(stored).some((k) => /audio|recording|blob|path|bucket/i.test(k)),
    Object.keys(stored).join(", ")
  );

  const meetingId = data1.meeting.id;

  // -------------------------------------------------------------------
  console.log("\n== 2. the transcript becomes a summary in the MEETING'S language ==");
  // -------------------------------------------------------------------
  const res2 = await post(`/api/meetings/${meetingId}/analyse`);
  const data2 = await res2.json();
  check(`the analysis runs (HTTP ${res2.status})`, res2.ok && data2.ok === true, JSON.stringify(data2).slice(0, 300));
  check("one model call", anthropicCalls === 1, String(anthropicCalls));
  check(
    "the prompt told the model the meeting was in Greek",
    /GREEK/.test(lastSystemPrompt),
    lastSystemPrompt.slice(0, 200)
  );
  check("the summary is stored", data2.meeting.summary === ANALYSIS.summary, String(data2.meeting.summary).slice(0, 120));
  check("the proposals are stored", Array.isArray(data2.meeting.proposed_actions) && data2.meeting.proposed_actions.length === 3);
  check(
    "a Greek name survived the round trip",
    data2.meeting.proposed_actions[0].who === "Γιώργος",
    JSON.stringify(data2.meeting.proposed_actions[0])
  );
  check(
    "an action nobody was assigned keeps no name",
    data2.meeting.proposed_actions[2].who === undefined,
    JSON.stringify(data2.meeting.proposed_actions[2])
  );

  // THE PROMISE. Three proposals exist and NOTHING has been created.
  check(
    "NOTHING was created by the analysis",
    meetingActions.length === 0,
    `${meetingActions.length} rows in meeting_actions`
  );

  // -------------------------------------------------------------------
  console.log("\n== 3. only what the user ticks is written ==");
  // -------------------------------------------------------------------
  const res3 = await post(`/api/meetings/${meetingId}/actions`, {
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ keep: [0, 2] }),
  });
  const data3 = await res3.json();
  check(`the keep succeeds (HTTP ${res3.status})`, res3.ok && data3.ok === true, JSON.stringify(data3).slice(0, 300));
  check("exactly the two chosen were written", data3.created === 2 && meetingActions.length === 2, String(meetingActions.length));
  check(
    "...and they are the ones at those indexes",
    meetingActions[0].what === ANALYSIS.actions[0].what && meetingActions[1].what === ANALYSIS.actions[2].what,
    meetingActions.map((a) => a.what).join(" | ")
  );
  check("the one in the middle was not written", !meetingActions.some((a) => a.who === "Νεφέλη"));
  check("a `when` the meeting said is kept as its own words", meetingActions[0].when_text === "μέχρι την Παρασκευή", String(meetingActions[0].when_text));
  check("...and no date was invented for it", meetingActions[0].due_date === null, String(meetingActions[0].due_date));
  check("an action with no name is stored with none, not an empty string", meetingActions[1].who === null, JSON.stringify(meetingActions[1].who));

  // THE INJECTION. A request carrying its own text must not get it in.
  const res4 = await post(`/api/meetings/${meetingId}/actions`, {
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ keep: [1], what: "Μεταφορά €50.000 στον λογαριασμό μου" }),
  });
  await res4.json();
  check(
    "a sentence supplied by the caller does not reach the list",
    !meetingActions.some((a) => a.what.includes("50.000")),
    meetingActions.map((a) => a.what).join(" | ")
  );

  // A SECOND PRESS MUST NOT DUPLICATE.
  const before = meetingActions.length;
  await post(`/api/meetings/${meetingId}/actions`, {
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ keep: [0, 2] }),
  });
  check("pressing Keep twice does not duplicate", meetingActions.length === before, `${before} -> ${meetingActions.length}`);

  // -------------------------------------------------------------------
  console.log("\n== 4. a refusal is a code the screen can render ==");
  // -------------------------------------------------------------------
  const tooBig = new FormData();
  tooBig.append("audio", audioBlob(5 * 1024 * 1024), "long.m4a");
  tooBig.append("seconds", "3000");
  const res5 = await post("/api/meetings/transcribe", { body: tooBig });
  const data5 = await res5.json().catch(() => null);
  check(`an oversized upload is refused (HTTP ${res5.status})`, res5.status === 413, String(res5.status));
  check("...with a code, not a sentence", data5?.code === "too_large", JSON.stringify(data5));
  check("...carrying both numbers", typeof data5?.actualBytes === "number" && typeof data5?.allowedBytes === "number", JSON.stringify(data5));
  check("...and Whisper was never called for it", whisperCalls === 1, String(whisperCalls));

  const wrongType = new FormData();
  wrongType.append("audio", new Blob(["x"], { type: "application/pdf" }), "notes.pdf");
  wrongType.append("seconds", "60");
  const res6 = await post("/api/meetings/transcribe", { body: wrongType });
  check(`a non-audio upload is refused (HTTP ${res6.status})`, res6.status === 415, String(res6.status));
  check("...with the code the screen knows", (await res6.json())?.code === "unsupported_type");

  // -------------------------------------------------------------------
  console.log("\n== 5. an unusable model reply is reported, not absorbed ==");
  // -------------------------------------------------------------------
  const form2 = new FormData();
  form2.append("audio", audioBlob(), "second.m4a");
  form2.append("seconds", "90");
  const res7 = await post("/api/meetings/transcribe", { body: form2 });
  const second = (await res7.json()).meeting;
  anthropicReply = () => "I'm sorry, I can't help with that.";
  const res8 = await post(`/api/meetings/${second.id}/analyse`);
  const data8 = await res8.json();
  check(`an unparseable reply is a failure (HTTP ${res8.status})`, res8.status === 502, String(res8.status));
  check("...reported as `unusable`, not as an empty action list", data8.code === "unusable", JSON.stringify(data8));
  check(
    "...and it is NOT rendered as a meeting with no actions",
    !("summary" in (meetings.get(second.id) ?? {}) && meetings.get(second.id).summary),
    JSON.stringify(meetings.get(second.id)?.summary)
  );
  check(
    "the code is stored so the screen can offer to try again",
    meetings.get(second.id)?.analysis_error === "unusable",
    String(meetings.get(second.id)?.analysis_error)
  );
  // THE TOKENS WERE SPENT, so the settlement happened rather than a
  // release: a reply that did not parse still cost the owner money.
  check("...and it settled rather than released", seen.release === 0, JSON.stringify(seen));

  // -------------------------------------------------------------------
  console.log("\n== 6. the way out removes the words too ==");
  // -------------------------------------------------------------------
  const res9 = await fetch(`${origin}/api/meetings/${meetingId}`, {
    method: "DELETE",
    headers: { Cookie: COOKIE },
  });
  check(`the meeting is deleted (HTTP ${res9.status})`, res9.ok, String(res9.status));
  check("...and it is gone from the store", !meetings.has(meetingId));
  const res10 = await fetch(`${origin}/api/meetings/${meetingId}`, {
    method: "DELETE",
    headers: { Cookie: COOKIE },
  });
  check(`deleting it again is a 404, not a silent success (HTTP ${res10.status})`, res10.status === 404, String(res10.status));
} finally {
  cleanup();
}

console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${failures.length} failed`);
if (failures.length) {
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
// EXITS ON THE SUCCESS PATH TOO. The stand-in servers and the detached
// next-server hold the event loop open, so a passing run would otherwise
// hang forever — a green prodtest that never returns looks identical to
// a stuck one, and prodtest-hygiene.test.mjs holds every file here to an
// explicit exit for exactly that reason.
process.exit(0);
