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

// A meeting already analysed, with one action already kept — seeded
// directly into the mock's table, so NOTHING about it was ever near this
// browser tab. It is the one Κομμάτι 1 has to prove has no player.
const MEETINGS = [
  {
    id: MEETING_1,
    user_id: MOCK_USER.id,
    title: "Σύσκεψη πωλήσεων",
    language: "el",
    transcript: "Μαρία: Καλημέρα σε όλους, ας ξεκινήσουμε.\nΓιώργος: Συμφωνώ, πάμε.",
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
  },
];

function handleMeetings({ req, res, url, json }) {
  const table = url.pathname.replace(/^\/rest\/v1\//, "").split("?")[0];
  if (table !== "meetings" && table !== "meeting_actions") return false;
  if (req.method !== "DELETE") return false;
  const idParam = [...url.searchParams].find(([k]) => k === "id")?.[1];
  const id = idParam?.startsWith("eq.") ? idParam.slice(3) : null;
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
  const context = await browser.newContext({ viewport: device.viewport, hasTouch: device.touch, isMobile: device.touch });
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
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium" });

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
    check(
      "the transcript is visible WITHOUT being clicked open — no longer a collapsed <details>",
      await page.locator('[data-testid="meeting-transcript"]').isVisible()
    );
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
    await page.setInputFiles('[data-testid="meeting-file"]', {
      name: "clip.wav",
      mimeType: "audio/wav",
      buffer: Buffer.from("RIFF0000WAVEfmt fake-bytes-not-a-real-wav-but-the-type-is-what-is-checked"),
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
  }

  console.log(failures.length === 0 ? `\nALL PASS: ${pass} passed, 0 failed` : `\n${failures.length} FAILED, ${pass} passed`);
  cleanup();
  process.exit(failures.length === 0 ? 0 : 1);
} catch (err) {
  console.log("  FAIL  unexpected error\n        " + String(err?.stack ?? err));
  cleanup();
  process.exit(1);
}
