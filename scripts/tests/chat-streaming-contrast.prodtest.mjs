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
//      patience, and on a phone does not exist at all. A control that
//      does nothing and says nothing is worse than one that is absent:
//      absent does not promise.
//      components/publishing/publish-control.tsx already had the right
//      shape and said so in its own words — the reason is "rendered as
//      VISIBLE text". This measures that the Talk button now does the
//      same, with BOTH provider keys removed from the server's
//      environment rather than stubbed.
//
//   2. "While the AI is writing I cannot read what it says."
//      `dim` was chosen on 2026-09-04 and measured at 6.57:1 worst —
//      and every one of those measurements was taken on FINISHED
//      messages seeded into chat_messages. The streaming block is a
//      different element on a different code path
//      (chat-workspace.tsx's `sending && streamingText !== null`), and
//      no gate in this repository had ever photographed it. The class
//      is on both, which the source shows; whether it READS while
//      streaming was unverified, which is not the same as fine.
//      So: a real stream, driven through the component's own NDJSON
//      reader, measured at nine text points WHILE it is mid-flight.
//
// THE STREAM IS INTERCEPTED, NOT MOCKED IN THE APP. Playwright fulfils
// /api/chat with a real NDJSON body in the shape readNdjsonStream
// expects — meta, deltas, done. The component's own parser runs, its own
// state updates, its own CSS applies. Nothing in src/ knows this is a
// test.
//
// Run: node scripts/tests/chat-streaming-contrast.prodtest.mjs
//      CHAT_SHOTS=<dir> node scripts/tests/chat-streaming-contrast.prodtest.mjs
import http from "node:http";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { chromiumPath } from "./lib/chromium.mjs";

let pass = 0,
  fail = 0;
// A bail-out counts as a FAILURE rather than as its own flag: an
// explicit success exit is what scripts/tests/prodtest-hygiene.test.mjs
// requires, and `fail === 0 && !someFlag ? 0 : 1` is not one — success
// would be left to the event loop draining.
function checkTrue(name, cond, detail) {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    fail++;
    console.log(`  FAIL  ${name}${detail === undefined ? "" : `\n        ${detail}`}`);
  }
}

const USER = {
  id: "00000000-0000-4000-8000-000000000001",
  aud: "authenticated",
  role: "authenticated",
  email: "owner@example.com",
  email_confirmed_at: "2026-01-01T00:00:00Z",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  app_metadata: { provider: "email", providers: ["email"] },
  user_metadata: {},
  identities: [],
};

// --- a local stand-in for the Supabase project ------------------------
// GoTrue's /auth/v1/user plus PostgREST table reads. Every table answers
// with an empty result unless named, which is all the dashboard layout
// needs to render its shell.
const CONV_ID = "11111111-2222-4333-8444-555555555555";
const TABLE_ROWS = {
  user_credits: [{ user_id: USER.id, credits_remaining: 500, credits_total: 500 }],
  chat_conversations: [
    {
      id: CONV_ID,
      user_id: USER.id,
      title: "Contrast measurement",
      is_pinned: false,
      created_at: "2026-09-19T00:00:00Z",
      updated_at: "2026-09-19T00:00:00Z",
    },
  ],
};

const supaHits = [];
const supa = http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    supaHits.push(`${req.method} ${req.url}`);
    const url = new URL(req.url, "http://x");
    const json = (code, data) => {
      res.writeHead(code, { "Content-Type": "application/json" });
      res.end(JSON.stringify(data));
    };
    if (url.pathname === "/auth/v1/user") return json(200, USER);
    if (url.pathname.startsWith("/auth/v1/")) return json(200, { user: USER, session: null });
    if (url.pathname.startsWith("/rest/v1/")) {
      const table = url.pathname.slice("/rest/v1/".length);
      const rows = TABLE_ROWS[table] ?? [];
      // PostgREST returns a bare object (not an array) for .single()
      const single = (req.headers.accept ?? "").includes("vnd.pgrst.object");
      if (single) return rows[0] ? json(200, rows[0]) : json(406, { message: "no rows" });
      return json(200, rows);
    }
    json(200, {});
  });
});
// A FIXED port, because NEXT_PUBLIC_* values are inlined into the server
// and middleware bundles by `next build` — they are not read at start
// time. The build below has to bake in the same URL this server listens
// on, which is also why this file builds rather than reusing an existing
// .next: a build made against the real project would send middleware's
// getUser() to the real Supabase.
const SUPA_PORT = 54329;
await new Promise((r) => supa.listen(SUPA_PORT, "127.0.0.1", r));
const SUPA_URL = `http://127.0.0.1:${SUPA_PORT}`;

// A session cookie in the exact shape @supabase/ssr writes and reads.
// supabase-js derives the cookie name from the URL's first hostname
// label (`sb-${hostname.split(".")[0]}-auth-token`), so for 127.0.0.1
// that is literally "127".
const PROJECT_REF = "127";
// Well-formed JWTs. supabase-js parses the access token locally to read
// its expiry before it will call the server with it, so an opaque string
// makes it drop the session and report "not logged in" without any
// network call at all. The signature is never checked here — getUser()
// always verifies against the auth server, which is the stand-in above.
const b64u = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const nowSec = Math.floor(Date.now() / 1000);
const jwt = (claims) =>
  `${b64u({ alg: "HS256", typ: "JWT" })}.${b64u(claims)}.test-signature`;
const ANON_KEY = jwt({ iss: "supabase", ref: PROJECT_REF, role: "anon", iat: 1, exp: 2000000000 });
const SERVICE_KEY = jwt({ iss: "supabase", ref: PROJECT_REF, role: "service_role", iat: 1, exp: 2000000000 });
const session = {
  access_token: jwt({
    sub: USER.id,
    aud: "authenticated",
    role: "authenticated",
    email: USER.email,
    iat: nowSec,
    exp: nowSec + 3600,
  }),
  token_type: "bearer",
  expires_in: 3600,
  expires_at: nowSec + 3600,
  refresh_token: "test-refresh-token",
  user: USER,
};
const AUTH_COOKIE = {
  name: `sb-${PROJECT_REF}-auth-token`,
  value: "base64-" + Buffer.from(JSON.stringify(session)).toString("base64url"),
};

// --- the production server --------------------------------------------
// Claim a free port by binding one and releasing it, rather than
// hardcoding: a leftover `next start` from an earlier run silently holds
// the port and serves its OWN, older build, which looks exactly like the
// app being broken.
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
  NEXT_PUBLIC_SUPABASE_URL: SUPA_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY,
  NEXT_PUBLIC_SITE_URL: `http://127.0.0.1:${PORT}`,
  // THE POINT OF THIS FILE. Both voice provider keys are removed from
  // the server's environment, which is the deployment state the owner
  // reported from: press Talk, nothing happens, no explanation.
  // lib/voice/voice-providers.ts reads process.env at REQUEST time
  // (transcriptionConfigured / speechConfigured), so unsetting them here
  // is the real condition and not a stub of it.
  OPENAI_API_KEY: undefined,
  ELEVENLABS_API_KEY: undefined,
  ANTHROPIC_API_KEY: "sk-ant-not-used-the-stream-is-intercepted",
};
delete env.OPENAI_API_KEY;
delete env.ELEVENLABS_API_KEY;

// A real `next build`, into its own output directory.
//
// This has to build rather than reuse the existing .next, because Next
// INLINES every NEXT_PUBLIC_* value into the server and middleware
// bundles at build time — they are not read when the server starts. A
// build made against .env.local would send middleware's getUser() to the
// real Supabase project no matter what is set here, which is exactly why
// the first run of this test redirected to /login without the stand-in
// server ever being contacted.
// Values already present in process.env win over .env.local (@next/env
// never overrides an inherited variable), so the stand-in URL and keys
// above are what get inlined.
console.log("running `next build` (production build, not a dev server) ...");
const build = spawn("npx", ["next", "build"], { env, stdio: ["ignore", "pipe", "pipe"] });
let buildLog = "";
build.stdout.on("data", (d) => (buildLog += d));
build.stderr.on("data", (d) => (buildLog += d));
const buildCode = await new Promise((r) => build.on("close", r));
if (buildCode !== 0) {
  console.log("  FAIL  next build failed\n" + buildLog.slice(-3000));
  supa.close();
  process.exit(1);
}
console.log("build ok — starting `next start`");

const server = spawn("npx", ["next", "start", "-p", String(PORT)], {
  env,
  stdio: ["ignore", "pipe", "pipe"],
  detached: true,
});
let serverLog = "";
server.stdout.on("data", (d) => (serverLog += d));
server.stderr.on("data", (d) => (serverLog += d));

async function waitForServer() {
  for (let i = 0; i < 120; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/login`, { signal: AbortSignal.timeout(2000) });
      if (r.ok) return true;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

function cleanup() {
  try {
    // KILL THE GROUP, NOT THE HANDLE. `npx next start` is npx -> sh ->
    // next-server. SIGKILL to the npx handle leaves the grandchild alive,
    // reparented to init, still holding its port and serving its build.
    // Measured across one full survey of the suite: thirteen orphaned
    // next-server processes, the oldest 41 minutes old. `detached: true`
    // on the spawn puts the whole tree in its own group so this reaches
    // all of it. Enforced by scripts/tests/prodtest-hygiene.test.mjs.
    try {
      process.kill(-server.pid, "SIGKILL");
    } catch {
      server.kill("SIGKILL");
    }
  } catch {
    /* already gone */
  }
  supa.close();
}

const up = await waitForServer();
if (!up || /EADDRINUSE|Failed to start server/.test(serverLog)) {
  console.log("  FAIL  production server did not start\n" + serverLog.slice(-2000));
  cleanup();
  process.exit(1);
}
console.log(`production server up on :${PORT} (next start, NODE_ENV=production)`);

// --- contrast maths, on real pixels ----------------------------------
// The same formulae as scripts/tests/chat-measure.prodtest.mjs: WCAG
// relative luminance, read off a PNG rather than computed from CSS. A
// figure derived from the declared colours would not know the globe is
// behind the text, which is the entire question.
const lin = (c) => {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};
const lum = (r, g, b) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
const ratio = (a, b) => {
  const la = lum(...a), lb = lum(...b);
  return +(((Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)).toFixed(2));
};

const SHOT_DIR = process.env.CHAT_SHOTS || "";
const { chromium } = await import("playwright");
const sharp = (await import("sharp")).default;
const browser = await chromium.launch({ executablePath: chromiumPath() });

// The reply the intercepted stream writes, in chunks, slowly enough that
// the page spends real time in the streaming state. Long enough to give
// nine separate text leaves once it is a few paragraphs in.
// LONG ON PURPOSE. `route.fulfill` hands the whole body over at once,
// so the only thing that keeps the component in its streaming state for
// a measurable time is the volume the NDJSON reader has to decode and
// the re-renders each delta triggers. The first version sent eight
// chunks; the phone finished the turn before the screenshot and the
// nine points were measured on the FINISHED message — the exact block
// this file exists to avoid measuring. REPEATS below multiplies it.
const REPEATS = 220;
const BASE_CHUNKS = [
  "Here is what the numbers say about last quarter. ",
  "Revenue rose in three of the four months, and the one that fell was the month with the fewest working days.\n\n",
  "The clearest pattern is in repeat purchases. Customers who bought twice in their first month went on to buy four more times on average, ",
  "while those who bought once bought roughly one further time.\n\n",
  "Two things follow from that. The first is that the second purchase is worth more attention than the first. ",
  "The second is that discounting the first purchase is probably cheaper than discounting later ones.\n\n",
  "If you want, I can break this down by product line, or by the channel each customer arrived through. ",
  "Both are in the data you already have, and neither needs another import.\n\n",
];
const REPLY_CHUNKS = Array.from({ length: REPEATS }, () => BASE_CHUNKS).flat();

const VIEWPORTS = [
  { name: "1440x900", width: 1440, height: 900 },
  { name: "390x844", width: 390, height: 844 },
];

const results = {};

try {
  for (const vp of VIEWPORTS) {
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      hasTouch: vp.width < 768,
      isMobile: vp.width < 768,
    });
    await context.addCookies([
      { ...AUTH_COOKIE, domain: "127.0.0.1", path: "/", httpOnly: false, secure: false, sameSite: "Lax" },
    ]);
    const page = await context.newPage();

    // THE STREAM. Fulfilled with the whole NDJSON body at once and then
    // read by the component at its own pace would give no streaming
    // window at all, so the response is written chunk by chunk with a
    // delay between them — which is what a real model call looks like
    // to this reader.
    await page.route("**/api/chat", async (route) => {
      if (route.request().method() !== "POST") return route.continue();
      const lines = [
        JSON.stringify({ type: "meta", conversationId: CONV_ID, isNewConversation: false }),
        ...REPLY_CHUNKS.map((text) => JSON.stringify({ type: "delta", text })),
        JSON.stringify({ type: "done", usage: { creditsCharged: 1 } }),
      ];
      await route.fulfill({
        status: 200,
        headers: { "Content-Type": "application/x-ndjson", "Cache-Control": "no-store" },
        body: lines.join("\n") + "\n",
      });
    });

    const resp = await page.goto(`http://127.0.0.1:${PORT}/dashboard/chat`, { waitUntil: "networkidle" });
    checkTrue(`${vp.name}: /dashboard/chat renders (HTTP ${resp?.status()})`, resp?.status() === 200, String(resp?.status()));
    await page.waitForTimeout(800);

    // ---------------------------------------------------------------
    // 1. THE TALK BUTTON SAYS WHY.
    // ---------------------------------------------------------------
    const talk = await page.evaluate(() => {
      const btn = document.querySelector('[data-testid="voice-conversation-start"]');
      if (!btn) return { present: false };
      const describedBy = btn.getAttribute("aria-describedby");
      const reasonEl = describedBy ? document.getElementById(describedBy) : null;
      const r = reasonEl?.getBoundingClientRect();
      return {
        present: true,
        disabled: btn.disabled,
        title: btn.getAttribute("title"),
        describedBy,
        reasonText: (reasonEl?.textContent ?? "").trim(),
        reasonPainted: Boolean(r && r.width > 0 && r.height > 0),
      };
    });
    checkTrue(`${vp.name}: the Talk button is on screen`, talk.present, "it was hidden, which is the older defect");
    checkTrue(`${vp.name}: ...and disabled, because neither key is set`, talk.disabled === true, JSON.stringify(talk));
    checkTrue(
      `${vp.name}: ...and carries NO title attribute`,
      talk.title === null,
      `title=${JSON.stringify(talk.title)} — a hover is not an explanation, and a phone has no hover`
    );
    checkTrue(
      `${vp.name}: ...and the reason is painted text next to it`,
      talk.reasonPainted && talk.reasonText.length > 30,
      `describedBy=${talk.describedBy} painted=${talk.reasonPainted} text=${JSON.stringify(talk.reasonText)}`
    );
    checkTrue(
      `${vp.name}: ...naming what is missing rather than saying "unavailable"`,
      /key|provider/i.test(talk.reasonText),
      talk.reasonText
    );
    if (vp.name === "1440x900") results.reason = talk.reasonText;

    // ---------------------------------------------------------------
    // 2. CONTRAST WHILE THE ANSWER IS STILL BEING WRITTEN.
    // ---------------------------------------------------------------
    const composer = await page.$('textarea, [contenteditable="true"]');
    checkTrue(`${vp.name}: the composer is there to type into`, Boolean(composer), "no textarea on the chat page");
    if (!composer) {
      fail++;
      await context.close();
      continue;
    }
    await composer.fill("Tell me what the numbers say about last quarter.");
    await composer.press("Enter");

    // MID-STREAM, NOT AFTER. The streaming block only exists while
    // `sending && streamingText !== null`, so the measurement waits for
    // that element specifically and reads it before the turn completes.
    await page.waitForSelector(".chat-ground-dim", { timeout: 15000 });
    // WHICH .chat-ground-dim IS THE STREAMING ONE.
    //
    // Both states use the class, which is the point — but measuring the
    // finished message and calling it "while streaming" is the whole
    // failure this file was written to avoid, and the first run did
    // exactly that on the phone. The finished block carries a "Listen"
    // player and a transition button; the streaming block carries
    // nothing but the text and the AI notice (chat-workspace.tsx says
    // why: half a sentence read aloud is a clip charged for text that
    // changed a second later). So: the dim block with no <button> in
    // it, and there has to be one.
    const STREAM_SEL = ".chat-ground-dim";
    const streaming = await page.evaluate((sel) => {
      const blocks = [...document.querySelectorAll(sel)];
      const streamingIdx = blocks.findIndex((b) => b.querySelector("button") === null);
      return {
        count: blocks.length,
        streamingIdx,
        chars: streamingIdx >= 0 ? blocks[streamingIdx].textContent.trim().length : 0,
      };
    }, STREAM_SEL);
    checkTrue(
      `${vp.name}: an answer is mid-stream right now (${streaming.chars} chars, block ${streaming.streamingIdx} of ${streaming.count})`,
      streaming.streamingIdx >= 0 && streaming.chars > 200,
      `${JSON.stringify(streaming)} — no dim block without a Listen button means the turn had already finished, and every ratio below would be of the finished message`
    );
    if (streaming.streamingIdx < 0) {
      fail++;
      await context.close();
      continue;
    }

    // THE RECTS AND THE PIXELS MUST BE THE SAME MOMENT.
    //
    // The first version read the leaf rectangles AFTER the screenshot,
    // and on the phone three of the nine points came back at exactly
    // 1:1 — a thirteen-by-nine window of one uniform colour, which is
    // not a contrast failure but a sample of blank page. The thread
    // auto-scrolls as the answer grows (useStickToBottom), so by the
    // time the rects were read the pixels underneath them belonged to a
    // different scroll offset. At 1440 there was enough room that it
    // barely moved, which is how the artefact looked like a
    // phone-specific design problem.
    //
    // So: read, shoot, read again, and require the two readings to
    // agree to the pixel. A pass that cannot prove the page was still
    // is not a measurement of anything.
    const readLeaves = () =>
      page.evaluate(() => {
        const blocks = [...document.querySelectorAll(".chat-ground-dim")];
        const block = blocks.find((b) => b.querySelector("button") === null);
        if (!block) return [];
        const out = [];
        const walker = document.createTreeWalker(block, NodeFilter.SHOW_ELEMENT);
        while (walker.nextNode()) {
          const el = walker.currentNode;
          if (el.children.length > 0) continue;
          const t = (el.textContent ?? "").trim();
          if (t.length < 3) continue;
          const r = el.getBoundingClientRect();
          if (r.width < 24 || r.height < 8) continue;
          if (r.top < 0 || r.bottom > window.innerHeight) continue;
          out.push({ x: r.left, y: r.top, w: r.width, h: r.height, text: t.slice(0, 30) });
        }
        return out;
      });
    const sameRects = (a, b) =>
      a.length === b.length &&
      a.every((l, i) => Math.abs(l.x - b[i].x) < 1 && Math.abs(l.y - b[i].y) < 1 && l.text === b[i].text);

    const shot = `${SHOT_DIR || "/tmp"}/chat-streaming-${vp.width}x${vp.height}.png`;
    let leaves = [];
    let stable = false;
    for (let attempt = 0; attempt < 8 && !stable; attempt++) {
      const before = await readLeaves();
      await page.screenshot({ path: shot });
      const after = await readLeaves();
      if (before.length > 0 && sameRects(before, after)) {
        leaves = after;
        stable = true;
      } else {
        await page.waitForTimeout(120);
      }
    }
    checkTrue(
      `${vp.name}: the page held still across the screenshot`,
      stable,
      "the thread kept scrolling between reading the rectangles and reading the pixels — every ratio below would be of a different frame"
    );
    if (!stable) {
      fail++;
      await context.close();
      continue;
    }
    const img = sharp(shot);
    const { width: shotW, height: shotH } = await img.metadata();
    const raw = await img.raw().toBuffer();
    const channels = raw.length / (shotW * shotH);
    const pixel = (x, y) => {
      const i = (Math.round(y) * shotW + Math.round(x)) * channels;
      return [raw[i], raw[i + 1], raw[i + 2]];
    };

    // NINE POINTS ON REAL TEXT LEAVES inside the streaming block, not on
    // a grid: an empty patch reads 1:1, and 1:1 means "no text here"
    // rather than "a failure" — which is why a 1:1 reading is rejected
    // as an invalid sample below rather than reported as contrast.

    // WHICH POINTS ARE TEXT IS DECIDED BY THE PIXELS, NOT BY THE DOM.
    //
    // Two DOM-based attempts failed here, and the second one is the
    // instructive one. Three phone samples kept reading 1:1 with the
    // header's flat colour in both slots, so the leaves were behind the
    // sticky chrome — and `document.elementFromPoint` said they were
    // NOT, because the chrome over them is `pointer-events: none` and
    // hit-testing looks straight through it. A DOM API that answers
    // "what would a click hit" cannot answer "what would an eye see",
    // and no amount of tightening the containment test fixes that.
    //
    // So the candidate leaves are offered, and a window is only a text
    // point if it CONTAINS INK: a luminance spread across the sampled
    // rectangle. A flat window is not a contrast failure, it is not a
    // text point at all, and counting it as either is inventing a
    // result. Spread across each leaf rather than clustered, because
    // the globe is a wireframe and a stroke crossing one word and not
    // the next is exactly what a single sample misses.
    const candidates = [];
    for (const leaf of leaves) {
      for (const fx of [0.15, 0.5, 0.85]) {
        candidates.push({ x: leaf.x + leaf.w * fx, y: leaf.y + leaf.h / 2, text: leaf.text });
      }
    }

    // THE DARKEST AND LIGHTEST PIXEL IN A SMALL WINDOW around each
    // point: text is thin, and a point that lands between two strokes
    // measures the background against itself and reports 1:1. The pair
    // is ink against whatever is immediately behind it.
    const sample = (p) => {
      let darkest = [255, 255, 255], lightest = [0, 0, 0];
      for (let dx = -6; dx <= 6; dx++) {
        for (let dy = -4; dy <= 4; dy++) {
          const x = Math.min(shotW - 1, Math.max(0, p.x + dx));
          const y = Math.min(shotH - 1, Math.max(0, p.y + dy));
          const c = pixel(x, y);
          if (lum(...c) < lum(...darkest)) darkest = c;
          if (lum(...c) > lum(...lightest)) lightest = c;
        }
      }
      return { text: p.text, contrast: ratio(darkest, lightest), x: Math.round(p.x), y: Math.round(p.y), darkest, lightest };
    };
    // INK THRESHOLD. A rendered glyph against any ground in this app
    // separates by far more than this; a flat patch of chrome separates
    // by almost nothing. 1.5 is comfortably between the two and is not
    // a contrast standard — the standard is asserted separately, on the
    // points that pass this.
    const INK = 1.5;
    const all = candidates.map(sample);
    const skipped = all.filter((m) => m.contrast < INK).length;
    const measured = all.filter((m) => m.contrast >= INK).slice(0, 9);

    results[vp.name] = { points: measured.length, worst: measured.length ? Math.min(...measured.map((m) => m.contrast)) : 0, shot };
    console.log(`\n  ${vp.name}: ${measured.length} text points measured mid-stream`);
    for (const m of measured)
      console.log(
        `      ${String(m.contrast).padStart(6)}:1  @${String(m.x).padStart(4)},${String(m.y).padStart(4)}  ` +
          `ink=${m.darkest.join(",")} bg=${m.lightest.join(",")}  ${JSON.stringify(m.text)}`
      );

    checkTrue(
      `${vp.name}: nine points were found on the streaming answer (${measured.length})`,
      measured.length === 9,
      `${measured.length} — fewer than nine means the sample is smaller than the claim`
    );
    // HOW MANY WERE SKIPPED IS PRINTED, never hidden: a run that had to
    // throw away most of its candidates to find nine is a run whose
    // nine may not be representative, and the reader can see that.
    console.log(`      (${skipped} of ${all.length} candidate windows held no ink and were not counted)`);
    checkTrue(
      `${vp.name}: most candidate windows were text (${all.length - skipped}/${all.length})`,
      all.length > 0 && (all.length - skipped) / all.length >= 0.5,
      `${skipped} of ${all.length} held no ink — the leaf rectangles and the pixels disagree, so the nine below may not be where the text is`
    );
    checkTrue(
      `${vp.name}: the worst of them clears 4.5:1 (${results[vp.name].worst}:1)`,
      results[vp.name].worst >= 4.5,
      `${results[vp.name].worst}:1 on ${measured.length} points, while streaming`
    );

    // ---------------------------------------------------------------
    // 3. WHAT THIS FILE CANNOT MEASURE, SAID HERE RATHER THAN OMITTED.
    //
    // Contrast is not the only way text can be unreadable, and on this
    // screen it turned out not to be the way: nine points at ~15.7:1 is
    // not a legibility problem. The report said "while the AI is
    // writing I cannot read what it says", and the other candidate is
    // MOVEMENT — the thread sticks to the bottom as tokens arrive
    // (hooks/use-stick-to-bottom.ts), so a line a person has started
    // reading is somewhere else by the time they finish it.
    //
    // THAT CANNOT BE MEASURED HERE, and a version of this file did
    // measure it and reported 0px of travel in one second. The number
    // was meaningless: `route.fulfill` hands Playwright the entire
    // NDJSON body in one piece, so the component receives every delta
    // in a single burst and the "streaming" state this file samples is
    // a frozen snapshot of a finished stream. The contrast figures
    // above are unaffected — the element, its classes and the ground
    // behind it are the real streaming ones — but nothing here arrives
    // over time, so nothing here can say how far the page moves while
    // it does.
    //
    // WHAT WOULD MEASURE IT: a stand-in for the model endpoint rather
    // than for the app's own route — ANTHROPIC_BASE_URL pointed at a
    // local server emitting content_block_delta events with real gaps,
    // so the app's own streaming path runs at a real pace. That needs
    // the Supabase stand-in to answer the reserve/settle RPCs too.
    // docs/v6-list.md carries it as an open item rather than a claim.

    await context.close();
  }
} finally {
  await browser.close();
  cleanup();
}

console.log("\n  NOT MEASURED HERE: how far the answer moves while it is being written.");
console.log("  See section 3 — this harness delivers the stream in one piece, so it cannot say.");
console.log("\n  the sentence the user sees when neither voice key is set:");
console.log(`      ${results.reason ?? "(not captured)"}`);
for (const vp of VIEWPORTS) {
  const r = results[vp.name];
  if (r) console.log(`  ${vp.name}: worst ${r.worst}:1 over ${r.points} points, mid-stream — ${r.shot}`);
}

console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
