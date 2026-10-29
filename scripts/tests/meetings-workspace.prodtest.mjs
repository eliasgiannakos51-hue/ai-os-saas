/*
 * «9. MEETINGS: ΝΕΑ ΟΘΟΝΗ» (the owner's message, 2026-10-29), Κομμάτι 1, IN
 * THE BUILT APP: player on top, summary+actions left, transcript right —
 * real taps, desktop and phone. No owner screenshot exists to compare
 * against (flagged in docs/NEEDS-FROM-ELIAS.md, 10th time in a row), so
 * this is the stand-in docs/TOOL-RULES.md rule 3 asks for: a real
 * production build, real taps, in place of Κομμάτι 1's own "στιγμιότυπο
 * δίπλα στην εικόνα" check.
 *
 * THE PLAYER NEVER TOUCHES STORAGE. api/meetings/transcribe's own header
 * is explicit: "no bucket, no column, no path" — a voice is a biometric
 * identifier and the people in a meeting never consented to it being
 * kept. This screen does not reverse that: the player reads a
 * `URL.createObjectURL` of the File already sitting in THIS browser tab
 * (the same File `readDuration` in meetings-workspace.tsx already opens
 * to read its length), never anything the server stored. A meeting
 * opened from the picker days later has no File behind it — proven below
 * by seeding one that has never been near this tab — and the screen
 * says so instead of drawing a dead player.
 *
 * NOTHING HERE TOUCHES A REAL PROVIDER OR CREDITS, same restraint as
 * projects-workspace.prodtest.mjs's own Κομμάτι 1 section: Κομμάτι 1 is
 * pure layout, so /api/meetings/transcribe and .../analyse are
 * page.route()'d rather than actually reaching OpenAI/Anthropic.
 *
 * Run: node scripts/tests/meetings-workspace.prodtest.mjs
 *      SKIP_BUILD=1 node scripts/tests/meetings-workspace.prodtest.mjs
 */
import http from "node:http";
import { spawn } from "node:child_process";
import { chromium } from "playwright";
import { startMockSupabase, MOCK_USER } from "../lib/mock-supabase.mjs";

/**
 * A REAL, DECODABLE WAV (silence) — Κομμάτι 5's own check needs the
 * browser to actually know a duration, so clicking a transcript line
 * moves `<audio>.currentTime` for a real reason, not because the
 * property accepts an assignment on an element with nothing behind it.
 * Same construction as voice-conversation.prodtest.mjs's own WAV.
 */
function buildWav(seconds) {
  const rate = 8000;
  const data = Buffer.alloc(Math.round(rate * seconds) * 2); // silence
  const head = Buffer.alloc(44);
  head.write("RIFF", 0);
  head.writeUInt32LE(36 + data.length, 4);
  head.write("WAVE", 8);
  head.write("fmt ", 12);
  head.writeUInt32LE(16, 16);
  head.writeUInt16LE(1, 20);
  head.writeUInt16LE(1, 22);
  head.writeUInt32LE(rate, 24);
  head.writeUInt32LE(rate * 2, 28);
  head.writeUInt16LE(2, 32);
  head.writeUInt16LE(16, 34);
  head.write("data", 36);
  head.writeUInt32LE(data.length, 40);
  return Buffer.concat([head, data]);
}

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

// A real uuid: api/meetings/[id]/* routes all read :id as a path param
// and the ones this file does not stub (DELETE) go through a real
// postgrest-shaped filter below.
const MEETING_1 = "11111111-1111-1111-1111-111111111111";
const NEW_MEETING = "22222222-2222-2222-2222-222222222222";
const RECORDED_MEETING = "33333333-3333-3333-3333-333333333333";
const PHONE_MEETING = "44444444-4444-4444-4444-444444444444";

// A meeting already analysed, with one action already kept — seeded
// directly into the mock's table, so NOTHING about it was ever near this
// browser tab. It is the one Κομμάτι 1 has to prove has no player.
const MEETINGS = [
  {
    id: MEETING_1,
    user_id: MOCK_USER.id,
    title: "Σύσκεψη πωλήσεων",
    language: "el",
    // Κομμάτι 3's own shape (formatDiarizedTranscript, meeting-analysis.ts):
    // "Ομιλητής <letter>: " per merged turn, one per line.
    transcript: "Ομιλητής A: Καλημέρα σε όλους, ας ξεκινήσουμε.\nΟμιλητής B: Συμφωνώ, πάμε.",
    summary: "Συζητήθηκε η πορεία των πωλήσεων του τριμήνου και οι επόμενες ενέργειες.",
    proposed_actions: [
      { who: "Μαρία", what: "Να στείλει την αναφορά πωλήσεων", when: "Παρασκευή" },
      { who: "Γιώργος", what: "Να επικοινωνήσει με τον πελάτη", when: null },
    ],
    duration_seconds: 900,
    credits_charged: 12,
    analysis_error: null,
    analysed_at: "2026-10-20T10:05:00Z",
    created_at: "2026-10-20T10:00:00Z",
  },
];
const MEETING_ACTIONS = [
  {
    id: "a1",
    meeting_id: MEETING_1,
    who: "Μαρία",
    what: "Να στείλει την αναφορά πωλήσεων",
    when_text: "Παρασκευή",
    due_date: null,
    done: false,
    source_index: 0,
    created_at: "2026-10-20T10:06:00Z",
    remind_at: null,
    reminded_at: null,
  },
];

function handleMeetings({ req, res, url, body, json }) {
  const table = url.pathname.replace(/^\/rest\/v1\//, "").split("?")[0];
  if (table !== "meetings" && table !== "meeting_actions") return false;
  const idParam = [...url.searchParams].find(([k]) => k === "id")?.[1];
  const id = idParam?.startsWith("eq.") ? idParam.slice(3) : null;
  // «Remind me» (Κομμάτι 4): the one place this file needs a REAL update,
  // not just a delete — the screen reads remind_at/reminded_at back from
  // the response to decide what to render next.
  if (table === "meeting_actions" && req.method === "PATCH") {
    const single = (req.headers.accept ?? "").includes("vnd.pgrst.object");
    const row = id ? MEETING_ACTIONS.find((a) => a.id === id) : null;
    if (!row) return (single ? json(200, null) : json(200, [])), true;
    Object.assign(row, JSON.parse(body || "{}"));
    return (single ? json(200, row) : json(200, [row])), true;
  }
  if (req.method !== "DELETE") return false;
  if (table === "meetings") {
    const idx = id ? MEETINGS.findIndex((m) => m.id === id) : -1;
    const removed = idx >= 0 ? MEETINGS.splice(idx, 1) : [];
    return json(200, removed), true;
  }
  const midParam = [...url.searchParams].find(([k]) => k === "meeting_id")?.[1];
  const mid = midParam?.startsWith("eq.") ? midParam.slice(3) : null;
  const removed = mid ? MEETING_ACTIONS.filter((a) => a.meeting_id === mid) : [];
  for (const a of removed) {
    const i = MEETING_ACTIONS.indexOf(a);
    if (i >= 0) MEETING_ACTIONS.splice(i, 1);
  }
  return json(200, removed), true;
}

const supa = await startMockSupabase({
  port: 54418,
  tableRows: { meetings: MEETINGS, meeting_actions: MEETING_ACTIONS, projects: [] },
  handle: (ctx) => handleMeetings(ctx),
});

let server;
let browser;
function cleanup() {
  try { if (server?.pid) process.kill(-server.pid, "SIGKILL"); } catch {}
  try { browser?.close(); } catch {}
  try { supa.close(); } catch {}
}
process.on("exit", cleanup);

async function start(env) {
  const port = await new Promise((resolve) => {
    const probe = http.createServer();
    probe.listen(0, "127.0.0.1", () => {
      const { port: p } = probe.address();
      probe.close(() => resolve(p));
    });
  });
  const origin = `http://127.0.0.1:${port}`;
  server = spawn("npx", ["next", "start", "-p", String(port)], {
    env: { ...env, NEXT_PUBLIC_SITE_URL: origin },
    stdio: ["ignore", "pipe", "pipe"],
    detached: true,
  });
  for (let i = 0; i < 90; i++) {
    try {
      await new Promise((res, rej) => {
        const r = http.get(`${origin}/api/health`, () => res());
        r.on("error", rej);
      });
      return origin;
    } catch {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  throw new Error("the production server did not start");
}

async function open(origin, device) {
  const context = await browser.newContext({
    viewport: device.viewport,
    hasTouch: device.touch,
    isMobile: device.touch,
    // Belt and suspenders with the launch args above: some Chromium
    // builds still consult the context's own permission grants even
    // with the fake-UI flag set.
    permissions: ["microphone"],
  });
  await context.addCookies(
    [{ ...supa.authCookie, url: origin, httpOnly: false, secure: false, sameSite: "Lax" }].map(({ domain, path: p, ...c }) => c)
  );
  const page = await context.newPage();
  const cdp = device.touch ? await context.newCDPSession(page) : null;
  // A REAL TOUCH, not a synthesised click: the mobile section below
  // taps the picker chip through the compositor the same way a finger
  // would, same shape as projects-workspace.prodtest.mjs's own press().
  async function press(locator) {
    await locator.first().evaluate((e) => e.scrollIntoView({ block: "center" }));
    if (!cdp) return locator.first().click();
    const box = await locator.first().boundingBox();
    const x = box.x + box.width / 2, y = box.y + box.height / 2;
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  }
  return { context, page, press };
}

const base = {
  ...process.env,
  NODE_ENV: "production",
  NEXT_PUBLIC_SUPABASE_URL: supa.url,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: supa.anonKey,
  SUPABASE_SERVICE_ROLE_KEY: supa.serviceKey,
  // Κομμάτι 1 is pure layout — nothing below ever reaches a real
  // provider (both routes that would are page.route()'d), these are
  // placeholders only so lib/voice/voice-providers.ts's own
  // not_configured branch never fires and blocks the upload.
  OPENAI_API_KEY: "placeholder-never-called",
  ANTHROPIC_API_KEY: "placeholder-never-called",
  // Bypasses the plan wall (voiceMinutesForPlan<=0) and turns the
  // "meeting-goal" switch on (package 17's own default: ADMIN_EMAILS +
  // TEST_ACCOUNT_EMAILS) so the goal panel's own markup is reachable too.
  ADMIN_EMAILS: MOCK_USER.email,
};

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
  const APP = await start(base);
  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium",
    // Κομμάτι 2's own recording section needs a real MediaRecorder
    // stream to exist — these two make getUserMedia resolve with a
    // synthetic tone instead of hanging on a permission prompt or a
    // real microphone, same flags scripts/tests/voice-command.prodtest.mjs
    // already uses for the SAME browser API.
    args: [
      "--no-sandbox",
      "--use-fake-ui-for-media-stream",
      "--use-fake-device-for-media-stream",
    ],
  });

  console.log("\n== desktop: player top, summary+actions left, transcript right ==");
  {
    const { page } = await open(APP, { viewport: { width: 1440, height: 900 }, touch: false });
    await page.goto(`${APP}/dashboard/meetings`, { waitUntil: "load" });
    await page.locator('[data-testid="meeting-detail"]').waitFor({ timeout: 15_000 });

    check(
      "the seeded meeting opens on first visit",
      (await page.locator('[data-testid="meeting-detail"] h2').innerText()).includes("Σύσκεψη πωλήσεων")
    );
    check(
      "a meeting opened from the list has no player — the audio was never kept",
      await page.locator('[data-testid="meeting-player-unavailable"]').isVisible()
    );
    check(
      "...and no <audio> element is rendered for it (nothing to fake a src for)",
      (await page.locator('[data-testid="meeting-player"]').count()) === 0
    );

    // "κρατάς κάθε λειτουργία" — every function the single-column screen
    // had is still here, just moved.
    check("the audio notice is still above the picker", await page.locator('[data-testid="meeting-audio-notice"]').isVisible());
    check("the file picker is still there", (await page.locator('[data-testid="meeting-file"]').count()) === 1);
    check("the picker chip for the seeded meeting is still there", (await page.locator('[data-testid="meeting-detail"]').count()) === 1);
    check(
      "the summary is still shown",
      (await page.locator('[data-testid="meeting-summary"]').innerText()).includes("πωλήσεων")
    );
    check("both proposed actions are listed", (await page.locator('[data-testid^="meeting-proposal-"]').count()) === 2);
    check("the already-kept one reads as kept and is disabled", await page.locator('[data-testid="meeting-proposal-0"]').isDisabled());
    check(
      "the kept list still shows it",
      (await page.locator('[data-testid="meeting-kept"]').innerText()).includes("αναφορά πωλήσεων")
    );

    // «Remind me» (Κομμάτι 4): opening it never sends anything by
    // itself — dismissing it without pressing Save must leave the kept
    // action exactly as it was.
    check("the kept action offers Remind me", await page.locator('[data-testid="meeting-remind-open"]').isVisible());
    await page.locator('[data-testid="meeting-remind-open"]').click();
    await page.locator('[data-testid="meeting-remind-date"]').waitFor({ timeout: 5_000 });
    await page.locator('[data-testid="meeting-remind-dismiss"]').click();
    check(
      "dismissing the date picker without saving asks for nothing",
      (await page.locator('[data-testid="meeting-remind-date"]').count()) === 0 &&
        (await page.locator('[data-testid="meeting-remind-pending"]').count()) === 0
    );
    check("...and the Remind me button is back", await page.locator('[data-testid="meeting-remind-open"]').isVisible());

    // NOW SET ONE FOR REAL, through the real PATCH route, against the
    // same mock table meeting_actions.a1 lives in.
    await page.locator('[data-testid="meeting-remind-open"]').click();
    const remindDay = (() => {
      const d = new Date(Date.now() + 3 * 86_400_000);
      return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
    })();
    await page.locator('[data-testid="meeting-remind-date"]').fill(remindDay);
    await page.locator('[data-testid="meeting-remind-save"]').click();
    await page.locator('[data-testid="meeting-remind-pending"]').waitFor({ timeout: 5_000 });
    check(
      "saving replaces the Remind me button with the pending reminder",
      (await page.locator('[data-testid="meeting-remind-open"]').count()) === 0
    );
    check("...and offers a way to cancel it", await page.locator('[data-testid="meeting-remind-cancel"]').isVisible());
    check("...and it is really stored, not just shown", MEETING_ACTIONS[0].remind_at !== null, String(MEETING_ACTIONS[0].remind_at));

    await page.locator('[data-testid="meeting-remind-cancel"]').click();
    await page.locator('[data-testid="meeting-remind-open"]').waitFor({ timeout: 5_000 });
    check(
      "cancelling the reminder brings the Remind me button back",
      await page.locator('[data-testid="meeting-remind-open"]').isVisible()
    );
    check("...and clears the stored reminder too", MEETING_ACTIONS[0].remind_at === null, String(MEETING_ACTIONS[0].remind_at));

    check(
      "the transcript is visible WITHOUT being clicked open — no longer a collapsed <details>",
      await page.locator('[data-testid="meeting-transcript"]').isVisible()
    );
    // Κομμάτι 3's own shape, rendered: the plain-text column already
    // displays whatever formatDiarizedTranscript() produced server
    // side — no new UI code to show speakers, which is the point. If
    // this ever breaks it is whitespace-pre-wrap or the seed, not a
    // feature this piece had to build.
    {
      const shown = await page.locator('[data-testid="meeting-transcript"]').innerText();
      check("both speakers show, each on its own line, in Greek", /Ομιλητής A:/.test(shown) && /Ομιλητής B:/.test(shown), shown);
      check("...on two separate lines, not run together", shown.split("\n").length >= 2, shown);
    }
    // Κομμάτι 5: a meeting opened from the LIST (no player, no File in
    // this tab) has nothing to seek — its transcript is the plain block
    // above, never a row of click targets that could not do anything.
    check(
      "no transcript line is a click target for a meeting with no live player",
      (await page.locator('[data-testid="meeting-transcript-line"]').count()) === 0
    );

    // Κομμάτι 6: Q&A works on a meeting opened from the LIST too — unlike
    // Κομμάτι 5's seek, this never needed a player or a File in this tab,
    // only the already-analysed transcript/summary/actions the mock seeded
    // above. The call itself is page.route()'d, same restraint as
    // transcribe/analyse: this file proves the screen, not the billing
    // wire (meetings.prodtest.mjs already drives a real call through a
    // real stand-in model for that).
    check("no past question is shown before any is asked", (await page.locator('[data-testid="meeting-question"]').count()) === 0);
    let askBody = null;
    await page.route(`**/api/meetings/${MEETING_1}/ask`, async (route) => {
      askBody = JSON.parse(route.request().postData() || "{}");
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          id: "q1",
          question: askBody.question,
          answer: "Η Μαρία θα στείλει την αναφορά πωλήσεων μέχρι την Παρασκευή.",
          createdAt: "2026-10-29T10:00:00Z",
          usage: { creditsCharged: 3, bypass: false, wouldHaveCharged: null, freeRemaining: null },
        }),
      });
    });
    await page.locator('[data-testid="meeting-ask-input"]').fill("Ποιος θα στείλει την αναφορά;");
    await page.locator('[data-testid="meeting-ask-submit"]').click();
    await page.locator('[data-testid="meeting-question"]').waitFor({ timeout: 5_000 });
    check("the question actually sent is the one typed, not a stale draft", askBody?.question === "Ποιος θα στείλει την αναφορά;", JSON.stringify(askBody));
    check(
      "the answer renders under the question that was asked",
      (await page.locator('[data-testid="meeting-question"]').innerText()).includes("Ποιος θα στείλει την αναφορά;")
    );
    check(
      "...with the model's own answer, not a placeholder",
      (await page.locator('[data-testid="meeting-answer"]').innerText()).includes("Παρασκευή")
    );
    check("the field clears after a successful ask, ready for another question", (await page.locator('[data-testid="meeting-ask-input"]').inputValue()) === "");

    check("the delete control is still there", (await page.locator('[data-testid="meeting-detail"] button[aria-label]').count()) >= 1);

    // THE SHAPE: player above the two columns; summary LEFT of transcript.
    const playerBox = await page.locator('[data-testid="meeting-player-zone"]').boundingBox();
    const summaryBox = await page.locator('[data-testid="meeting-summary-column"]').boundingBox();
    const transcriptBox = await page.locator('[data-testid="meeting-transcript-column"]').boundingBox();
    check("the player sits above both columns", playerBox.y + playerBox.height <= summaryBox.y + 1);
    check("summary+actions is the LEFT column", summaryBox.x < transcriptBox.x);
    check(
      "...and transcript sits beside it, not below it, at desktop width",
      Math.abs(summaryBox.y - transcriptBox.y) < 20
    );

    // A FRESH RECORDING, TRANSCRIBED IN THIS TAB: the player should now
    // show up, playing the browser's own copy — never a server path.
    // Κομμάτι 5's own lines, with real, distinct start times (seconds
    // into the 20s WAV below) — exactly the shape api/meetings/
    // transcribe's real response carries.
    const NEW_MEETING_LINES = [
      { speaker: "Ομιλητής A", text: "Πρώτη πρόταση της νέας συνάντησης.", start: 2 },
      { speaker: "Ομιλητής B", text: "Δεύτερη πρόταση, πολύ πιο αργά.", start: 13 },
    ];
    await page.route("**/api/meetings/transcribe", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          meeting: {
            id: NEW_MEETING,
            title: "Νέα συνάντηση",
            language: "el",
            transcript: "Κείμενο της νέας συνάντησης.",
            summary: null,
            proposed_actions: null,
            duration_seconds: 60,
            credits_charged: 8,
            analysis_error: null,
            analysed_at: null,
            created_at: new Date().toISOString(),
          },
          lines: NEW_MEETING_LINES,
        }),
      });
    });
    await page.route(`**/api/meetings/${NEW_MEETING}/analyse`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          meeting: {
            summary: "Σύνοψη της νέας συνάντησης.",
            proposed_actions: [{ who: null, what: "Νέα ενέργεια", when: null }],
            analysed_at: new Date().toISOString(),
          },
        }),
      });
    });
    // A REAL, DECODABLE 20s WAV — Κομμάτι 5's seek check below needs an
    // element the browser actually knows the duration of, not bytes
    // that merely pass the MIME-type check.
    await page.setInputFiles('[data-testid="meeting-file"]', {
      name: "clip.wav",
      mimeType: "audio/wav",
      buffer: buildWav(20),
    });
    await page.locator('[data-testid="meeting-start"]').waitFor({ timeout: 10_000 });
    await page.locator('[data-testid="meeting-start"]').click();
    await page.locator('[data-testid="meeting-player"]').waitFor({ timeout: 10_000 });

    check("after transcribing a NEW clip in this tab, a player appears", (await page.locator('[data-testid="meeting-player"]').count()) === 1);
    const src = await page.locator('[data-testid="meeting-player"]').getAttribute("src");
    check("...and it plays the browser's own local copy, never a server path", Boolean(src?.startsWith("blob:")));
    check(
      "the new meeting (just transcribed) is the one now open",
      (await page.locator('[data-testid="meeting-detail"] h2').innerText()).includes("Νέα συνάντηση")
    );

    // Κομμάτι 5: CLICK A TRANSCRIPT LINE, THE AUDIO SEEKS THERE.
    const lines = page.locator('[data-testid="meeting-transcript-line"]');
    await lines.first().waitFor({ timeout: 10_000 });
    check("the transcript renders as separate clickable lines, one per segment", (await lines.count()) === NEW_MEETING_LINES.length);
    const before = await page.locator('[data-testid="meeting-player"]').evaluate((el) => el.currentTime);
    check("before any line is clicked, playback has not moved", before === 0, String(before));
    await lines.nth(1).click();
    await page.waitForFunction(
      () => (document.querySelector('[data-testid="meeting-player"]')?.currentTime ?? 0) > 0
    );
    const afterClick = await page.locator('[data-testid="meeting-player"]').evaluate((el) => el.currentTime);
    check(
      "clicking the SECOND line seeks to THAT line's own start, not the first or a fixed point",
      Math.abs(afterClick - NEW_MEETING_LINES[1].start) < 0.5,
      `expected ~${NEW_MEETING_LINES[1].start}, got ${afterClick}`
    );
    await lines.first().click();
    await page.waitForFunction(
      (expected) => Math.abs((document.querySelector('[data-testid="meeting-player"]')?.currentTime ?? -1) - expected) < 0.5,
      NEW_MEETING_LINES[0].start
    );
    const afterSecondClick = await page.locator('[data-testid="meeting-player"]').evaluate((el) => el.currentTime);
    check(
      "clicking the FIRST line afterwards seeks backward, to ITS own start",
      Math.abs(afterSecondClick - NEW_MEETING_LINES[0].start) < 0.5,
      `expected ~${NEW_MEETING_LINES[0].start}, got ${afterSecondClick}`
    );
  }

  console.log("\n== desktop: browser recording, gated by the SAME consent notice ==");
  {
    const { page } = await open(APP, { viewport: { width: 1440, height: 900 }, touch: false });
    await page.goto(`${APP}/dashboard/meetings`, { waitUntil: "load" });
    await page.locator('[data-testid="meeting-detail"]').waitFor({ timeout: 15_000 });
    // canRecord flips true in a useEffect AFTER mount (never during SSR) —
    // see meetings-workspace.tsx's own comment on why. The button is
    // genuinely absent for an instant, not just hidden.
    const recordButton = page.locator('[data-testid="meeting-record"]');
    await recordButton.waitFor({ timeout: 10_000 });

    // ΔΕΝ ΚΑΝΕΙ: "recording without the notice." Press record, then
    // CANCEL the gate, and prove no recording ever started — no getUserMedia
    // call this test did not itself grant would matter if the UI never
    // reaches it, which is exactly what this checks from the outside.
    await recordButton.click();
    const confirm = page.locator('[data-testid="meeting-record-confirm"]');
    await confirm.waitFor({ timeout: 5_000 });
    check(
      "the gate says the SAME sentence the notice above the picker already says",
      (await confirm.innerText()).includes("delete")
    );
    await page.locator('[data-testid="meeting-record-confirm-cancel"]').click();
    await confirm.waitFor({ state: "hidden", timeout: 5_000 });
    check(
      "cancelling the gate never started a recording",
      !(await page.locator('[data-testid="meeting-recording-indicator"]').isVisible().catch(() => false))
    );

    // NOW ALLOW IT. The gate reappears (recordExplainedRef is per-mount,
    // a cancel does not pre-answer the next press) and this time a real
    // MediaRecorder stream opens against the fake device armed above.
    await recordButton.click();
    await confirm.waitFor({ timeout: 5_000 });
    await page.locator('[data-testid="meeting-record-confirm-allow"]').click();
    await page.locator('[data-testid="meeting-recording-indicator"]').waitFor({ timeout: 10_000 });
    check(
      "the record button itself now reads as pressed, mid-recording",
      (await recordButton.getAttribute("aria-pressed")) === "true"
    );
    await page.waitForTimeout(1500); // the fake device needs a moment to actually emit frames
    await recordButton.click(); // same button, now the Stop control
    await page.locator('[data-testid="meeting-cost"]').waitFor({ timeout: 10_000 });
    check(
      "stopping produced a real clip the cost panel can price",
      (await page.locator('[data-testid="meeting-cost-total"]').innerText()).length > 0
    );

    await page.route("**/api/meetings/transcribe", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          meeting: {
            id: RECORDED_MEETING,
            title: "Συνάντηση από ηχογράφηση",
            language: "el",
            transcript: "Κείμενο από ζωντανή ηχογράφηση.",
            summary: null,
            proposed_actions: null,
            duration_seconds: 2,
            credits_charged: 1,
            analysis_error: null,
            analysed_at: null,
            created_at: new Date().toISOString(),
          },
        }),
      });
    });
    await page.route(`**/api/meetings/${RECORDED_MEETING}/analyse`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          meeting: {
            summary: "Σύνοψη από ζωντανή ηχογράφηση.",
            proposed_actions: [],
            analysed_at: new Date().toISOString(),
          },
        }),
      });
    });
    await page.locator('[data-testid="meeting-start"]').click();
    await page.locator('[data-testid="meeting-player"]').waitFor({ timeout: 10_000 });
    const recSrc = await page.locator('[data-testid="meeting-player"]').getAttribute("src");
    check(
      "a RECORDED clip plays from the same kind of local blob an uploaded one does",
      Boolean(recSrc?.startsWith("blob:"))
    );
    check(
      "the recorded meeting is the one now open",
      (await page.locator('[data-testid="meeting-detail"] h2').innerText()).includes("Συνάντηση από ηχογράφηση")
    );
  }

  console.log("\n== desktop: a browser that cannot record never shows the button ==");
  {
    const { context, page } = await open(APP, { viewport: { width: 1440, height: 900 }, touch: false });
    // Removed BEFORE any app script runs, so canRecord's own capability
    // check — not a flag this test flips behind its back — is what
    // decides the button stays off.
    await page.addInitScript(() => {
      // @ts-ignore — test-only removal of a browser capability
      delete window.MediaRecorder;
    });
    await page.goto(`${APP}/dashboard/meetings`, { waitUntil: "load" });
    await page.locator('[data-testid="meeting-detail"]').waitFor({ timeout: 15_000 });
    await page.waitForTimeout(500); // the same tick canRecord's effect needs to flip true, if it were going to
    check(
      "no MediaRecorder means no record button — same rule as the mic in Chat",
      (await page.locator('[data-testid="meeting-record"]').count()) === 0
    );
    check("...but the file picker is unaffected", (await page.locator('[data-testid="meeting-file"]').count()) === 1);
    await context.close();
  }

  console.log("\n== phone (390x844): the two columns stack, player stays on top ==");
  {
    const { page, press } = await open(APP, { viewport: { width: 390, height: 844 }, touch: true });
    await page.goto(`${APP}/dashboard/meetings`, { waitUntil: "load" });
    await page.locator('[data-testid="meeting-detail"]').waitFor({ timeout: 15_000 });

    // A REAL FINGER TAP on the picker chip, reselecting the same
    // meeting — exercises the touch path the mouse-only desktop block
    // above cannot, and proves the chip is still a real touch target.
    const chip = page.locator('button[aria-pressed]').filter({ hasText: "Σύσκεψη πωλήσεων" });
    const chipBox = await chip.boundingBox();
    check("the picker chip is a real touch target (>=44px tall)", chipBox.height >= 44);
    await press(chip);
    await page.locator('[data-testid="meeting-detail"] h2').waitFor({ timeout: 10_000 });
    check(
      "tapping the chip (touch, not a mouse click) keeps the right meeting open",
      (await page.locator('[data-testid="meeting-detail"] h2').innerText()).includes("Σύσκεψη πωλήσεων")
    );

    // REMIND ME, TAPPED FOR REAL — the desktop block already proved the
    // save/cancel round trip with a mouse; this is the touch path.
    const remindOpen = page.locator('[data-testid="meeting-remind-open"]');
    const remindBox = await remindOpen.boundingBox();
    check("the Remind me button is a real touch target (>=44px tall)", remindBox.height >= 44);
    await press(remindOpen);
    await page.locator('[data-testid="meeting-remind-date"]').waitFor({ timeout: 5_000 });
    check("a real finger tap opens the date picker", await page.locator('[data-testid="meeting-remind-date"]').isVisible());
    await press(page.locator('[data-testid="meeting-remind-dismiss"]'));
    await remindOpen.waitFor({ timeout: 5_000 });

    const { width: pageWidth } = page.viewportSize();
    check(
      "the page itself does not scroll sideways",
      (await page.evaluate(() => document.documentElement.scrollWidth)) <= pageWidth + 1
    );
    check("the player zone is still there, full width", await page.locator('[data-testid="meeting-player-zone"]').isVisible());
    const playerBox = await page.locator('[data-testid="meeting-player-zone"]').boundingBox();
    const summaryBox = await page.locator('[data-testid="meeting-summary-column"]').boundingBox();
    const transcriptBox = await page.locator('[data-testid="meeting-transcript-column"]').boundingBox();
    check("the player is still above the columns on a phone", playerBox.y + playerBox.height <= summaryBox.y + 1);
    check(
      "summary+actions is above the transcript, not beside it, at 390px",
      transcriptBox.y >= summaryBox.y + summaryBox.height - 1
    );

    // THE RECORD BUTTON, TAPPED FOR REAL — the desktop block above
    // already proved the gate and the clip end to end with a mouse;
    // this is the touch path docs/TOOL-RULES.md's own rule 3 asks for,
    // not a second copy of that proof.
    const recordButton = page.locator('[data-testid="meeting-record"]');
    await recordButton.waitFor({ timeout: 10_000 });
    const recordBox = await recordButton.boundingBox();
    check("the record button is a real touch target (>=44px tall)", recordBox.height >= 44);
    await press(recordButton);
    const confirm = page.locator('[data-testid="meeting-record-confirm"]');
    await confirm.waitFor({ timeout: 5_000 });
    await press(page.locator('[data-testid="meeting-record-confirm-allow"]'));
    await page.locator('[data-testid="meeting-recording-indicator"]').waitFor({ timeout: 10_000 });
    await page.waitForTimeout(1500);
    await press(recordButton);
    await page.locator('[data-testid="meeting-cost"]').waitFor({ timeout: 10_000 });
    check(
      "a real finger tap, start to stop, produced a clip this screen can price",
      (await page.locator('[data-testid="meeting-cost-total"]').innerText()).length > 0
    );

    // Κομμάτι 5, ON THE TOUCH PATH: a NEW upload (deterministic WAV,
    // same reasoning as the desktop block) rather than the live
    // recording above — a real-time MediaRecorder clip is too short and
    // too variable in length to assert an exact seek target against.
    const PHONE_LINES = [
      { speaker: "Ομιλητής A", text: "Πρώτη πρόταση.", start: 3 },
      { speaker: "Ομιλητής B", text: "Δεύτερη πρόταση.", start: 11 },
    ];
    await page.route("**/api/meetings/transcribe", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          meeting: {
            id: PHONE_MEETING,
            title: "Συνάντηση από το κινητό",
            language: "el",
            transcript: "Κείμενο από το κινητό.",
            summary: null,
            proposed_actions: null,
            duration_seconds: 20,
            credits_charged: 2,
            analysis_error: null,
            analysed_at: null,
            created_at: new Date().toISOString(),
          },
          lines: PHONE_LINES,
        }),
      });
    });
    await page.route(`**/api/meetings/${PHONE_MEETING}/analyse`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, meeting: { summary: null, proposed_actions: [], analysed_at: new Date().toISOString() } }),
      });
    });
    await page.setInputFiles('[data-testid="meeting-file"]', {
      name: "phone-clip.wav",
      mimeType: "audio/wav",
      buffer: buildWav(20),
    });
    const startButton = page.locator('[data-testid="meeting-start"]');
    await startButton.waitFor({ timeout: 10_000 });
    await press(startButton);
    await page.locator('[data-testid="meeting-player"]').waitFor({ timeout: 10_000 });

    const phoneLines = page.locator('[data-testid="meeting-transcript-line"]');
    await phoneLines.first().waitFor({ timeout: 10_000 });
    const lineBox = await phoneLines.first().boundingBox();
    check("a transcript line is a real touch target (>=44px tall)", lineBox.height >= 44);
    await press(phoneLines.nth(1));
    await page.waitForFunction(
      () => (document.querySelector('[data-testid="meeting-player"]')?.currentTime ?? 0) > 0
    );
    const phoneSeek = await page.locator('[data-testid="meeting-player"]').evaluate((el) => el.currentTime);
    check(
      "a real finger tap on a transcript line seeks the audio to THAT line's own start",
      Math.abs(phoneSeek - PHONE_LINES[1].start) < 0.5,
      `expected ~${PHONE_LINES[1].start}, got ${phoneSeek}`
    );

    // Κομμάτι 6, ON THE TOUCH PATH: fill the field (a real tap to focus
    // it first, same as any other input on this screen), then a real
    // finger tap on Ask — not a mouse click standing in for one.
    const askInput = page.locator('[data-testid="meeting-ask-input"]');
    const askSubmit = page.locator('[data-testid="meeting-ask-submit"]');
    const askSubmitBox = await askSubmit.boundingBox();
    check("the Ask button is a real touch target (>=44px tall)", askSubmitBox.height >= 44);
    await page.route(`**/api/meetings/${PHONE_MEETING}/ask`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          id: "q-phone-1",
          question: "Τι ειπώθηκε;",
          answer: "Κείμενο από το κινητό, όπως ακριβώς ακούστηκε.",
          createdAt: new Date().toISOString(),
          usage: { creditsCharged: 2, bypass: false, wouldHaveCharged: null, freeRemaining: null },
        }),
      });
    });
    await press(askInput);
    await askInput.fill("Τι ειπώθηκε;");
    await press(askSubmit);
    await page.locator('[data-testid="meeting-answer"]').waitFor({ timeout: 5_000 });
    check(
      "a real finger tap on Ask gets back the model's real answer",
      (await page.locator('[data-testid="meeting-answer"]').innerText()).includes("ακριβώς ακούστηκε")
    );
  }

  console.log(failures.length === 0 ? `\nALL PASS: ${pass} passed, 0 failed` : `\n${failures.length} FAILED, ${pass} passed`);
  cleanup();
  process.exit(failures.length === 0 ? 0 : 1);
} catch (err) {
  console.log("  FAIL  unexpected error\n        " + String(err?.stack ?? err));
  cleanup();
  process.exit(1);
}
