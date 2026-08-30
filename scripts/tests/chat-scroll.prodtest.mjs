// The chat scroll contract, in a real browser, against a real build.
//
// WHAT WAS REPORTED. "When I send a message the page goes down and DOES
// NOT LET ME scroll up to read the earlier ones. It throws me back down."
// The cause: an effect scrolled to the bottom on EVERY change of the
// streaming text — several times a second during a reply — so scrolling
// up was undone within milliseconds.
//
// The contract this file enforces (exactly the reported specification):
//   1. opening a conversation lands at its latest message;
//   2. a reply arriving while the reader is AT the bottom follows;
//   3. send → scroll up → send again → the view MUST NOT move back down;
//   4. instead a "new message" affordance appears;
//   5. pressing it returns to the bottom and the affordance goes away.
//
// The AI reply is a Playwright route interception producing the same
// NDJSON the real /api/chat streams (meta → delta* → done) — no model
// call, but the full client code path: streamingText updates, message
// append, credit receipt.
//
// TWO DEVICES. Every step below runs on a desktop mouse wheel AND on a
// phone-sized touch drag, because the reported bug is a scrolling bug and
// scrolling is the most device-dependent thing a web page does. See the
// DEVICES list for why the touch gesture goes through CDP rather than
// through dispatchEvent.
//
// MUTATION: make the follow unconditional again (call follow() without
// the at-bottom check, or scroll on every delta) -> step 3 goes red.
//
// Run: node scripts/tests/chat-scroll.prodtest.mjs
import http from "node:http";
import { spawn } from "node:child_process";

let pass = 0;
const failures = [];
// EVERY CHECK CARRIES ITS DEVICE. The same assertion runs on a desktop
// wheel and on a phone drag; a failure line that does not say which one
// sends whoever reads it to the wrong half of the problem.
let deviceLabel = "";
function check(name, cond, detail) {
  const tagged = deviceLabel ? `[${deviceLabel}] ${name}` : name;
  if (cond) {
    pass++;
    console.log(`  PASS  ${tagged}`);
  } else {
    failures.push(tagged);
    console.log(`  FAIL  ${tagged}${detail !== undefined ? "\n        " + detail : ""}`);
  }
}

const USER_ID = "00000000-0000-4000-8000-000000000001";
const CONVO_ID = "cccccccc-1111-4111-8111-111111111111";
const user = () => ({
  id: USER_ID,
  aud: "authenticated",
  role: "authenticated",
  email: "owner@example.com",
  email_confirmed_at: "2026-01-01T00:00:00Z",
  created_at: "2026-01-01T00:00:00Z",
  app_metadata: { provider: "email", providers: ["email"] },
  user_metadata: { subscription_tier: "growth", stripe_customer_id: "cus_test" },
  identities: [],
});

// Enough history that the thread genuinely overflows its container —
// a scroll contract cannot be tested in a view with no scrollbar.
const MESSAGES = Array.from({ length: 40 }, (_, i) => ({
  id: `dddddddd-2222-4222-8222-${String(i + 1).padStart(12, "0")}`,
  conversation_id: CONVO_ID,
  role: i % 2 === 0 ? "user" : "assistant",
  content: `Message ${i + 1}. ${"Some longer content so each bubble takes real vertical space. ".repeat(3)}`,
  created_at: new Date(Date.UTC(2026, 1, 1, 10, i)).toISOString(),
}));

const TABLE_ROWS = {
  user_credits: [{ user_id: USER_ID, credits_remaining: 2500, credits_total: 3000 }],
  chat_conversations: [
    {
      id: CONVO_ID,
      title: "Long conversation",
      is_pinned: false,
      created_at: "2026-02-01T09:00:00Z",
      updated_at: "2026-02-01T11:00:00Z",
    },
  ],
  chat_messages: MESSAGES,
};

const supa = http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    const url = new URL(req.url, "http://x");
    const cors = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "*",
      "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,HEAD,OPTIONS",
    };
    const json = (code, data, extra = {}) => {
      res.writeHead(code, { "Content-Type": "application/json", ...cors, ...extra });
      res.end(JSON.stringify(data));
    };
    if (req.method === "OPTIONS") {
      res.writeHead(204, cors);
      return res.end();
    }
    if (url.pathname === "/auth/v1/user") return json(200, user());
    if (url.pathname.startsWith("/auth/v1/")) return json(200, { user: user(), session: null });
    if (url.pathname.startsWith("/rest/v1/")) {
      const table = url.pathname.slice("/rest/v1/".length);
      if (req.method === "POST") return json(201, []);
      const rows = TABLE_ROWS[table] ?? [];
      if ((req.headers.prefer ?? "").includes("count=")) {
        res.writeHead(200, {
          "Content-Type": "application/json",
          "Content-Range": rows.length > 0 ? `0-${rows.length - 1}/${rows.length}` : `*/0`,
          ...cors,
        });
        return res.end(JSON.stringify(req.method === "HEAD" ? null : rows));
      }
      const single = (req.headers.accept ?? "").includes("vnd.pgrst.object");
      if (single) return rows[0] ? json(200, rows[0]) : json(406, { message: "no rows" });
      return json(200, rows);
    }
    json(200, {});
  });
});

const SUPA_PORT = 54345;
await new Promise((r) => supa.listen(SUPA_PORT, "127.0.0.1", r));
const SUPA_URL = `http://127.0.0.1:${SUPA_PORT}`;

const PROJECT_REF = "127";
const b64u = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const nowSec = Math.floor(Date.now() / 1000);
const jwt = (claims) => `${b64u({ alg: "HS256", typ: "JWT" })}.${b64u(claims)}.test-signature`;
const ANON_KEY = jwt({ iss: "supabase", ref: PROJECT_REF, role: "anon", iat: 1, exp: 2000000000 });
const SERVICE_KEY = jwt({ iss: "supabase", ref: PROJECT_REF, role: "service_role", iat: 1, exp: 2000000000 });
const session = {
  access_token: jwt({
    sub: USER_ID,
    aud: "authenticated",
    role: "authenticated",
    email: "owner@example.com",
    iat: nowSec,
    exp: nowSec + 3600,
  }),
  token_type: "bearer",
  expires_in: 3600,
  expires_at: nowSec + 3600,
  refresh_token: "test-refresh-token",
  user: user(),
};
const AUTH_COOKIE = {
  name: `sb-${PROJECT_REF}-auth-token`,
  value: "base64-" + Buffer.from(JSON.stringify(session)).toString("base64url"),
};

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
};

console.log("running `next build` (production build, not a dev server) ...");
const build = spawn("npx", ["next", "build"], { env, stdio: ["ignore", "pipe", "pipe"] });
let buildLog = "";
build.stdout.on("data", (d) => (buildLog += d));
build.stderr.on("data", (d) => (buildLog += d));
if ((await new Promise((r) => build.on("close", r))) !== 0) {
  console.log("  FAIL  next build failed\n" + buildLog.slice(-3000));
  supa.close();
  process.exit(1);
}

const server = spawn("npx", ["next", "start", "-p", String(PORT)], { env, stdio: ["ignore", "pipe", "pipe"] });
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
    server.kill("SIGKILL");
  } catch {
    /* already gone */
  }
  supa.close();
}
if (!(await waitForServer())) {
  console.log("  FAIL  production server did not start\n" + serverLog.slice(-2000));
  cleanup();
  process.exit(1);
}
console.log(`production server up on :${PORT}\n`);


// ---------------------------------------------------------------------
// TWO DEVICES, BECAUSE A WHEEL IS NOT A THUMB.
//
// V4.6 #11.1. This file ran at 1280x900 with a mouse and nothing else,
// and the bug that was reported is a scrolling bug — the single most
// device-dependent thing a web page does. A wheel emits discrete deltas
// and its scroll events are dispatched promptly; a touch drag is
// continuous, keeps moving after the finger leaves (momentum), and on a
// phone the element that scrolls may not even be the same one.
//
// So every step below runs twice, and the gesture is the device's own.
//
// THE TOUCH GESTURE GOES THROUGH CDP, not through dispatchEvent. A touch
// event created by dispatchEvent is untrusted and the browser does not
// scroll for it — the test would move nothing and then assert about it,
// which is the "test that supplies its own arguments" shape. CDP's
// Input.dispatchTouchEvent produces trusted input and real native
// scrolling, momentum included.
const DEVICES = [
  {
    label: "desktop 1280x900, mouse wheel",
    context: {
      viewport: { width: 1280, height: 900 },
      storageState: { cookies: [{ ...AUTH_COOKIE, domain: "127.0.0.1", path: "/" }], origins: [] },
    },
    async scrollUp(page, thread) {
      const box = await thread.boundingBox();
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      for (let i = 0; i < 12; i++) {
        await page.mouse.wheel(0, -400);
        await page.waitForTimeout(35);
      }
    },
  },
  {
    // 390x844 is the iPhone 14/15 CSS viewport and the size
    // layout-stress.prodtest.mjs already calls "the phone the app is most
    // used on" at 375. hasTouch/isMobile switch Chromium into the mobile
    // input and viewport model, which is what makes the difference below
    // a real one rather than a narrow window.
    label: "mobile 390x844, touch drag",
    context: {
      viewport: { width: 390, height: 844 },
      hasTouch: true,
      isMobile: true,
      deviceScaleFactor: 3,
      storageState: { cookies: [{ ...AUTH_COOKIE, domain: "127.0.0.1", path: "/" }], origins: [] },
    },
    async scrollUp(page, thread) {
      const box = await thread.boundingBox();
      const cdp = await page.context().newCDPSession(page);
      const x = Math.round(box.x + box.width / 2);
      // Four short drags rather than one long one, which is how a person
      // actually flicks through a thread, and which gives the page four
      // separate chances to fight back.
      for (let drag = 0; drag < 4; drag++) {
        let y = Math.round(box.y + box.height * 0.25);
        const end = Math.round(box.y + box.height * 0.85);
        await cdp.send("Input.dispatchTouchEvent", {
          type: "touchStart",
          touchPoints: [{ x, y }],
        });
        while (y < end) {
          y += 40;
          await cdp.send("Input.dispatchTouchEvent", {
            type: "touchMove",
            touchPoints: [{ x, y: Math.min(y, end) }],
          });
          await page.waitForTimeout(12);
        }
        await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
        await page.waitForTimeout(120);
      }
      await cdp.detach();
    },
  },
];

const { chromium } = await import("playwright");
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium" });

for (const device of DEVICES) {
  console.log(`\n################ ${device.label} ################`);
  deviceLabel = device.label.split(" ")[0];
  const context = await browser.newContext(device.context);
  const page = await context.newPage();

  // The reply, as the real route streams it: meta → deltas → done.
  let replyCounter = 0;
  await page.route("**/api/chat", async (route) => {
    replyCounter++;
    const lines = [
      JSON.stringify({ type: "meta", conversationId: CONVO_ID, isNewConversation: false }),
      ...Array.from({ length: 12 }, (_, i) =>
        JSON.stringify({ type: "delta", text: `chunk ${replyCounter}.${i} of a streamed reply. ` })
      ),
      JSON.stringify({ type: "done", credits: 1 }),
    ];
    await route.fulfill({
      status: 200,
      contentType: "application/x-ndjson",
      body: lines.join("\n") + "\n",
    });
  });

  const thread = () => page.locator('[data-testid="chat-thread"]');
  async function scrollState() {
    return thread().evaluate((el) => ({
      top: el.scrollTop,
      height: el.scrollHeight,
      client: el.clientHeight,
      fromBottom: el.scrollHeight - el.scrollTop - el.clientHeight,
    }));
  }

  try {
    console.log("== 1. opening a conversation lands at the latest message ==");
    await page.goto(`http://127.0.0.1:${PORT}/dashboard/chat?c=${CONVO_ID}`, {
      waitUntil: "networkidle",
      timeout: 60000,
    });
    await page.waitForSelector('[data-testid="chat-thread"]', { timeout: 15000 });
    // The 40 seeded messages load client-side; wait for the last one.
    await page.waitForSelector("text=Message 40.", { timeout: 15000 });
    await page.waitForTimeout(400);
    let s = await scrollState();
    check(`the thread overflows (${s.height}px in ${s.client}px)`, s.height > s.client * 2);
    check(`and starts at the bottom (${Math.round(s.fromBottom)}px from it)`, s.fromBottom < 120);

    console.log("\n== 2. a reply arriving while AT the bottom follows ==");
    await page.fill("textarea", "First question");
    await page.keyboard.press("Enter");
    await page.waitForSelector("text=chunk 1.11", { timeout: 15000 });
    await page.waitForTimeout(400);
    s = await scrollState();
    check(`the view followed the reply (${Math.round(s.fromBottom)}px from bottom)`, s.fromBottom < 120);

    console.log("\n== 3. scrolled up, a new reply MUST NOT drag the view down ==");
    await thread().evaluate((el) => {
      el.scrollTop = 0;
    });
    await page.waitForTimeout(300);
    s = await scrollState();
    check(`the reader is at the top (${Math.round(s.top)}px)`, s.top < 40);
    await page.fill("textarea", "Second question, sent from the top");
    await page.keyboard.press("Enter");
    await page.waitForSelector("text=chunk 2.11", { timeout: 15000 });
    await page.waitForTimeout(600);
    s = await scrollState();
    // THE reported bug. If this is red, the reader was dragged down again.
    check(
      `the view stayed up (scrollTop ${Math.round(s.top)}px, ${Math.round(s.fromBottom)}px from bottom)`,
      s.fromBottom > 200
    );

    console.log("\n== 4. instead, a 'new message' affordance appears ==");
    const jump = page.locator('[data-testid="chat-jump-to-latest"]');
    check("the jump button is visible", await jump.isVisible());

    console.log("\n== 5. pressing it returns to the bottom ==");
    await jump.click();
    // WAITED OUT, NOT TIMED, and the trajectory printed.
    //
    // jumpToBottom uses behavior:"smooth", so the position lands over
    // several frames — how many depends on the distance, the device and
    // how busy the main thread is. A fixed 700ms read the desktop run at
    // 122px on one run and 409px on the next while mobile read 0px on
    // both: three different numbers for one behaviour, which is a fact
    // about the wait rather than about the product.
    //
    // This polls until the number stops moving and says how long that
    // took. It is STRICTER than the fixed wait, not looser: the 120px
    // threshold is unchanged and now applies to where the view actually
    // came to rest instead of to wherever the animation happened to be
    // at 700ms. If the settled position is short of the bottom, that is
    // the product and this will say so.
    // "STOPPED" IS NOT "NEVER STARTED", and the first draft of this loop
    // could not tell the difference. It returned on the first pair of
    // equal readings, which on desktop were the two taken BEFORE the
    // smooth scroll began — so it reported "settled after 100ms" at
    // 4344px from the bottom, the position the view had never left. The
    // mobile trail is what showed it up:
    //   7222 -> 6817 -> 5780 -> 3907 -> 1921 -> 680 -> 32 -> 0 -> 0
    // against a desktop trail of 4344 -> 4344.
    //
    // So settling now requires that the view MOVED first, and there is a
    // floor of 800ms before "it never moved" is accepted as the answer —
    // which is itself a finding worth printing rather than a reason to
    // keep waiting.
    const settle = await (async () => {
      let previous = null;
      let moved = false;
      const trail = [];
      for (let i = 0; i < 50; i++) {
        const now = await scrollState();
        trail.push(Math.round(now.fromBottom));
        if (previous !== null && Math.abs(now.top - previous) >= 1) moved = true;
        if (previous !== null && Math.abs(now.top - previous) < 1 && (moved || i >= 8)) {
          return { s: now, ms: i * 100, moved, trail };
        }
        previous = now.top;
        await page.waitForTimeout(100);
      }
      return { s: await scrollState(), ms: 5000, moved, trail };
    })();
    s = settle.s;
    console.log(
      `        ${settle.moved ? "settled" : "NEVER MOVED, gave up"} after ${settle.ms}ms — ` +
        `from bottom: ${settle.trail.join(" -> ")}`
    );
    check(`the view is at the bottom again (${Math.round(s.fromBottom)}px)`, s.fromBottom < 120);
    check("and the button is gone", !(await jump.isVisible()));

    console.log("\n== 6. THE REPORTED CASE: scrolling WHILE the reply is arriving ==");
    // Steps 1-5 scroll while IDLE and then send, so the scroll event has
    // long been delivered before a chunk lands. The user's sentence is the
    // other order — "the AI is writing AND it takes the screen down" — and
    // that is a race between an asynchronously-dispatched scroll event and
    // a re-render happening several times a second.
    //
    // route.fulfill() cannot express it: it hands over the whole body at
    // once, so nothing arrives "during" anything. The page's own fetch is
    // replaced here with one that emits the same NDJSON over roughly two
    // seconds — a real stream through the real client path.
    //
    // WHAT THIS STEP PROVES ON WHICH DEVICE — measured by reverting the
    // fix, not reasoned about.
    //
    // THE OLD NOTE HERE SAID this step could not catch the race at all:
    // "reverting the fix in lib/chat/follow-decision.ts leaves it GREEN
    // TOO — Playwright's mouse.wheel dispatches its scroll events
    // promptly enough that the flag is current before the next chunk
    // renders". That was true, and it was true because the file only
    // ever ran with a mouse. It is no longer the whole story.
    //
    // Measured, with the `movedByHuman` branch deleted from decideFollow
    // and both devices run:
    //
    //   desktop 1280x900, wheel  — ALL ELEVEN CHECKS STILL GREEN
    //   mobile  390x844, touch   — "and the new-message affordance is
    //                              offered instead" goes RED
    //
    // The race window a wheel never opens, a thumb does. That is
    // consistent with where the report came from, and it is why this
    // file runs twice.
    //
    // NOTE WHICH ASSERTION FAILS: not the position — the view ends at
    // 585px from the bottom either way, because the flick's own momentum
    // carries it back up after the last chunk lands — but the
    // AFFORDANCE. Under the old rule the stale flag still reads "stuck",
    // the decision is "scroll" instead of "notify", and the reader is
    // left up the thread with a reply below and nothing saying so. A
    // position-only assertion would have called that a pass.
    //
    // scripts/tests/chat-scroll-race.test.mjs remains the deterministic
    // proof of the same rule as five numbers, and it is the one that
    // cannot go flaky. This is the proof that those five numbers
    // describe a real browser.
    await page.evaluate((CONVO_ID_FOR_TEST) => {
      const real = window.fetch;
      window.fetch = async (input, init) => {
        const url = typeof input === "string" ? input : (input && input.url) || "";
        if (!url.includes("/api/chat")) return real(input, init);
        const lines = [
          JSON.stringify({ type: "meta", conversationId: CONVO_ID_FOR_TEST, isNewConversation: false }),
          ...Array.from({ length: 25 }, (_, i) =>
            JSON.stringify({ type: "delta", text: `slow chunk ${i} of a reply that arrives over time. ` })
          ),
          JSON.stringify({ type: "done", credits: 1 }),
        ];
        const encoder = new TextEncoder();
        let i = 0;
        const stream = new ReadableStream({
          pull(controller) {
            return new Promise((resolve) => {
              setTimeout(() => {
                if (i >= lines.length) controller.close();
                else controller.enqueue(encoder.encode(lines[i++] + "\n"));
                resolve();
              }, 80);
            });
          },
        });
        return new Response(stream, {
          status: 200,
          headers: { "Content-Type": "application/x-ndjson" },
        });
      };
    }, CONVO_ID);

    await thread().evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });
    await page.waitForTimeout(200);
    await page.fill("textarea", "Third question, and I will scroll while you answer");
    await page.keyboard.press("Enter");

    // UNDER WAY, not finished. Then wheel the way a person does — several
    // turns rather than one assignment, because a scripted scrollTop write
    // dispatches its event promptly and a gesture does not.
    await page.waitForSelector("text=slow chunk 3", { timeout: 20000 });
    await device.scrollUp(page, thread());
    s = await scrollState();
    console.log(`        wheeled up mid-stream to scrollTop ${Math.round(s.top)}`);
    check(
      `the wheel actually moved the view (${Math.round(s.fromBottom)}px from bottom)`,
      s.fromBottom > 300,
      "the gesture did not move it, so the assertion below would pass on nothing"
    );

    // Now let the rest of the stream land. Every remaining chunk
    // re-renders and calls follow(); this is the moment the bug happens.
    await page.waitForSelector("text=slow chunk 24", { timeout: 25000 });
    await page.waitForTimeout(700);
    s = await scrollState();
    check(
      `the view stayed where the reader put it (${Math.round(s.fromBottom)}px from bottom)`,
      s.fromBottom > 300,
      `dragged back down to ${Math.round(s.fromBottom)}px — the reported bug, mid-stream`
    );
    check(
      "and the new-message affordance is offered instead",
      await page.locator('[data-testid="chat-jump-to-latest"]').isVisible()
    );
  } catch (err) {
    failures.push("unhandled error");
    console.log(`  FAIL  unhandled error\n        ${err.stack ?? err.message}`);
  } finally {
    await context.close();
  }

}

await browser.close();
cleanup();

console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${failures.length} failed`);
process.exit(failures.length === 0 ? 0 : 1);
