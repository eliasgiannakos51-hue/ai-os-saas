/*
 * PRESS «ΜΙΛΑ», SEE THE GLOBE, AND TALK — IN THE BUILT APP (MASTER 16,
 * package 29).
 *
 * Run: node scripts/tests/voice-conversation.prodtest.mjs
 *      SKIP_BUILD=1 node scripts/tests/voice-conversation.prodtest.mjs
 *
 * The whole loop, through the app's own routes and nothing faked in
 * between: the microphone records a turn and the turn ends on silence
 * (components/voice/use-recorder.ts), api/voice/transcribe sends the clip
 * to the transcription provider, api/chat streams the answer, api/voice/speak
 * reads it aloud, and the microphone opens again for the next turn.
 *
 * THE THREE PROVIDERS ARE LOCAL SERVERS answering as the real ones do:
 * OpenAI's transcription (OPENAI_BASE_URL), Anthropic's streamed messages
 * (ANTHROPIC_BASE_URL, server-sent events with gaps between them) and
 * ElevenLabs' speech (ELEVENLABS_BASE_URL, real MPEG audio frames). The
 * microphone is Chromium's fake capture device playing a WAV this file
 * writes: a second and a half of tone, then silence — a person who says
 * something and stops.
 *
 * And the other half of the package first: the microphone in the field,
 * pressed, spoken into and stopped, writes what was said — through the
 * same transcription route, not a fulfilled request.
 *
 * BOTH DEVICES: 1440x900 with a mouse, 390x844 with touch. In Greek, then
 * the conversation's words in English. Around it: speech not configured
 * (no Talk button), no minutes left (no Talk button), and the transcription
 * provider down (said, and the loop stops rather than charging).
 */
import http from "node:http";
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
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

// ---------------------------------------------------------------------
// The microphone: 1.5 s of a 220 Hz tone, then 4 s of silence, 16-bit mono.
// ---------------------------------------------------------------------
const audioDir = mkdtempSync(path.join(tmpdir(), "voice-conversation-"));
const WAV = path.join(audioDir, "turn.wav");
{
  const rate = 48000;
  const samples = rate * 5.5;
  const data = Buffer.alloc(samples * 2);
  for (let i = 0; i < samples; i++) {
    const v = i < rate * 1.5 ? Math.round(Math.sin((2 * Math.PI * 220 * i) / rate) * 0.4 * 32767) : 0;
    data.writeInt16LE(v, i * 2);
  }
  const head = Buffer.alloc(44);
  head.write("RIFF", 0); head.writeUInt32LE(36 + data.length, 4); head.write("WAVE", 8);
  head.write("fmt ", 12); head.writeUInt32LE(16, 16); head.writeUInt16LE(1, 20); head.writeUInt16LE(1, 22);
  head.writeUInt32LE(rate, 24); head.writeUInt32LE(rate * 2, 28); head.writeUInt16LE(2, 32); head.writeUInt16LE(16, 34);
  head.write("data", 36); head.writeUInt32LE(data.length, 40);
  writeFileSync(WAV, Buffer.concat([head, data]));
}
// The answer read aloud: forty silent MPEG-1 Layer III frames (128 kbit/s,
// 44.1 kHz, mono), about a second — a real MP3 the browser decodes and plays.
const MP3 = Buffer.concat(Array.from({ length: 40 }, () => Buffer.concat([Buffer.from([0xff, 0xfb, 0x90, 0xc0]), Buffer.alloc(413)])));

// ---------------------------------------------------------------------
// The database: conversations and messages kept as rows; holds and charges recorded.
// ---------------------------------------------------------------------
const store = { chat_conversations: [], chat_messages: [] };
let seq = 0;
const uuid = () => `${String(++seq).padStart(8, "0")}-0000-4000-8000-00000000c4a7`;
const reserved = [];
const settled = [];
const consumed = [];
let usedSeconds = 0;
function matches(row, url) {
  for (const [k, v] of url.searchParams) if (v.startsWith("eq.") && String(row[k]) !== v.slice(3)) return false;
  return true;
}
function rest({ req, res, url, body, json }) {
  const table = url.pathname.replace(/^\/rest\/v1\//, "");
  if (table === "rpc/consume_rate_limit") return json(200, true), true;
  if (table === "rpc/reserve_credits") {
    const args = JSON.parse(body || "{}");
    reserved.push(args);
    return json(200, [{ reservation_id: uuid(), available: credits[0].credits_remaining }]), true;
  }
  if (table === "rpc/settle_reservation") return settled.push(JSON.parse(body || "{}")), json(200, null), true;
  if (table === "rpc/release_reservation") return json(200, null), true;
  if (table === "rpc/voice_usage_this_month") return json(200, [{ transcribe_seconds: usedSeconds, speak_seconds: 0 }]), true;
  if (table === "rpc/consume_voice_seconds") {
    const args = JSON.parse(body || "{}");
    consumed.push(args);
    const allowed = usedSeconds + Number(args.p_seconds ?? 0) <= Number(args.p_limit_seconds ?? 0);
    if (allowed) usedSeconds += Number(args.p_seconds ?? 0);
    return json(200, [{ allowed, used_seconds: usedSeconds, remaining_seconds: Math.max(0, Number(args.p_limit_seconds ?? 0) - usedSeconds) }]), true;
  }
  if (!(table in store)) return false;
  const rows = store[table];
  const hit = rows.filter((r) => matches(r, url));
  const single = (req.headers.accept ?? "").includes("vnd.pgrst.object");
  const answer = (list) => (single ? (list[0] ? json(200, list[0]) : json(406, { message: "no rows" })) : json(200, list));
  if ((req.headers.prefer ?? "").includes("count=")) {
    res.writeHead(200, { "Content-Type": "application/json", "Content-Range": hit.length ? `0-${hit.length - 1}/${hit.length}` : "*/0" });
    return res.end(req.method === "HEAD" ? "" : JSON.stringify(hit)), true;
  }
  if (req.method === "GET") return answer(hit), true;
  if (req.method === "POST") {
    const input = JSON.parse(body || "[]");
    const made = (Array.isArray(input) ? input : [input]).map((r) => ({ id: uuid(), created_at: new Date(Date.now() + seq).toISOString(), updated_at: new Date().toISOString(), ...r }));
    rows.push(...made);
    return answer(made), true;
  }
  if (req.method === "PATCH") {
    for (const r of hit) Object.assign(r, JSON.parse(body || "{}"));
    return answer(hit), true;
  }
  return false;
}
const credits = [{ user_id: MOCK_USER.id, credits_remaining: 5000, credits_total: 5000 }];
const onboarding = [{ user_id: MOCK_USER.id, completed_at: "2026-01-02T00:00:00Z", skipped_at: null }];
MOCK_USER.user_metadata = { subscription_tier: "ultimate" };
const supa = await startMockSupabase({ port: 54411, tableRows: { user_credits: credits, user_onboarding: onboarding }, handle: rest });

// ---------------------------------------------------------------------
// The three providers.
// ---------------------------------------------------------------------
const heard = { el: ["τι ώρα ανοίγει το camping;", "και πότε κλείνει;"], en: ["what time does the camping open?", "and when does it close?"] };
const ANSWERS = {
  "τι ώρα ανοίγει το camping;": "Ανοίγει στις 8 το πρωί.",
  "και πότε κλείνει;": "Κλείνει στις 10 το βράδυ.",
  "what time does the camping open?": "It opens at 8 in the morning.",
  "and when does it close?": "It closes at 10 at night.",
};
let lang = "el";
let transcribeDown = false;
const providerLog = { transcribe: [], chat: [], speak: [] };
const providers = http.createServer((req, res) => {
  const chunks = [];
  req.on("data", (c) => chunks.push(c));
  req.on("end", () => {
    const raw = Buffer.concat(chunks);
    if (req.url.startsWith("/openai/audio/transcriptions")) {
      providerLog.transcribe.push({ bytes: raw.length, type: req.headers["content-type"] ?? "", auth: Boolean(req.headers.authorization) });
      if (transcribeDown) {
        res.writeHead(503, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: { message: "Service Unavailable" } }));
      }
      const said = heard[lang][(providerLog.transcribe.length - 1) % 2];
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ text: said, language: lang === "el" ? "greek" : "english", duration: 1.6 }));
    }
    if (req.url.startsWith("/eleven/text-to-speech/")) {
      providerLog.speak.push({ text: JSON.parse(raw.toString() || "{}").text ?? "", key: Boolean(req.headers["xi-api-key"]) });
      res.writeHead(200, { "Content-Type": "audio/mpeg" });
      return res.end(MP3);
    }
    if (req.url.startsWith("/anthropic/v1/messages")) {
      const sent = JSON.parse(raw.toString() || "{}");
      const lastUser = [...(sent.messages ?? [])].reverse().find((m) => m.role === "user");
      const text = typeof lastUser?.content === "string" ? lastUser.content : (lastUser?.content ?? []).map((b) => b.text ?? "").join(" ");
      const question = Object.keys(ANSWERS).find((q) => text.includes(q));
      const answer = question ? ANSWERS[question] : "Εντάξει.";
      providerLog.chat.push({ stream: sent.stream === true, question: question ?? null });
      if (sent.stream !== true) {
        res.writeHead(200, { "Content-Type": "application/json", "request-id": "req_test" });
        return res.end(JSON.stringify({ id: "msg", type: "message", role: "assistant", model: sent.model, content: [{ type: "text", text: answer }], stop_reason: "end_turn", usage: { input_tokens: 40, output_tokens: 12 } }));
      }
      res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", "request-id": "req_test" });
      const send = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify({ type: event, ...data })}\n\n`);
      send("message_start", { message: { id: "msg_v", type: "message", role: "assistant", model: sent.model, content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 60, output_tokens: 1 } } });
      send("content_block_start", { index: 0, content_block: { type: "text", text: "" } });
      const words = answer.split(/(?<= )/);
      let i = 0;
      const tick = setInterval(() => {
        if (i < words.length) return send("content_block_delta", { index: 0, delta: { type: "text_delta", text: words[i++] } });
        clearInterval(tick);
        send("content_block_stop", { index: 0 });
        send("message_delta", { delta: { stop_reason: "end_turn", stop_sequence: null }, usage: { output_tokens: 14 } });
        send("message_stop", {});
        res.end();
      }, 40);
      return;
    }
    res.writeHead(404);
    res.end();
  });
});
await new Promise((r) => providers.listen(0, "127.0.0.1", r));
const P = `http://127.0.0.1:${providers.address().port}`;

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
  TEST_ACCOUNT_EMAILS: MOCK_USER.email,
  ANTHROPIC_API_KEY: "placeholder-answered-locally",
  ANTHROPIC_BASE_URL: `${P}/anthropic`,
  OPENAI_API_KEY: "placeholder-answered-locally",
  OPENAI_BASE_URL: `${P}/openai`,
  ELEVENLABS_API_KEY: "placeholder-answered-locally",
  ELEVENLABS_BASE_URL: `${P}/eleven`,
};
const msgs = (loc) => JSON.parse(readFileSync(`messages/${loc}.json`, "utf8"));
const EL = msgs("el");
const EN = msgs("en");

const servers = [];
const pageErrors = [];
let browser = null;
const cleanup = () => {
  for (const server of servers) {
    try { if (server?.pid) process.kill(-server.pid, "SIGKILL"); } catch {}
  }
  try { supa.close(); } catch {}
  try { providers.close(); } catch {}
  try { rmSync(audioDir, { recursive: true, force: true }); } catch {}
};
async function start(env) {
  const port = await freePort();
  const origin = `http://127.0.0.1:${port}`;
  const server = spawn("npx", ["next", "start", "-p", String(port)], { env: { ...env, PORT: String(port), NEXT_PUBLIC_SITE_URL: origin }, stdio: ["ignore", "pipe", "pipe"], detached: true });
  servers.push(server);
  for (let i = 0; i < 90; i++) {
    try {
      await new Promise((res, rej) => { const r = http.get(`${origin}/api/health`, () => res()); r.on("error", rej); });
      return origin;
    } catch { await new Promise((r) => setTimeout(r, 1000)); }
  }
  throw new Error("the production server did not start");
}
async function open(origin, device, locale = "el") {
  const context = await browser.newContext({ viewport: device.viewport, hasTouch: device.touch, isMobile: device.touch, permissions: ["microphone"] });
  await context.addCookies(
    [
      { ...supa.authCookie, url: origin, httpOnly: false, secure: false, sameSite: "Lax" },
      { name: "NEXT_LOCALE", value: locale, url: origin },
    ].map(({ domain, path: p, ...c }) => c)
  );
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
  return { context, page, press };
}
const overlay = (page) => page.locator('[data-testid="voice-conversation"]');
const stateOf = async (page) => (await overlay(page).getAttribute("data-state")) ?? "";
async function waitState(page, wanted, ms = 30_000) {
  const end = Date.now() + ms;
  const seen = [];
  while (Date.now() < end) {
    const s = await stateOf(page).catch(() => "");
    if (seen.at(-1) !== s) seen.push(s);
    if (s === wanted) return seen;
    await page.waitForTimeout(50);
  }
  throw new Error(`the conversation never reached "${wanted}" (saw ${seen.join(" -> ")})`);
}
async function startTalking(page, press) {
  const talk = page.locator('[data-testid="voice-conversation-start"]');
  await talk.waitFor({ timeout: 20_000 });
  for (let i = 0; i < 3; i++) {
    await press(talk);
    if (await overlay(page).waitFor({ timeout: 4000 }).then(() => true, () => false)) return;
  }
  throw new Error("the voice conversation did not open");
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
  const APP = await start(base);
  const NO_SPEECH = await start({ ...base, ELEVENLABS_API_KEY: "" });
  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium",
    args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", `--use-file-for-fake-audio-capture=${WAV}%noloop`, "--autoplay-policy=no-user-gesture-required"],
  });

  for (const device of [
    { label: "desktop", viewport: { width: 1440, height: 900 }, touch: false },
    { label: "phone", viewport: { width: 390, height: 844 }, touch: true },
  ]) {
    console.log(`\n== ${device.label}: two turns, out loud ==`);
    lang = "el";
    for (const k of Object.keys(providerLog)) providerLog[k].length = 0;
    reserved.length = 0;
    settled.length = 0;
    const { context, page, press } = await open(APP, device);
    await page.goto(`${APP}/dashboard/chat`, { waitUntil: "networkidle" });

    // THE MICROPHONE FIRST: press, speak, stop, and the words are in the box.
    const field = page.getByPlaceholder(EL.dashboard.chat.composerPlaceholder).first();
    await field.waitFor({ timeout: 20_000 });
    const mic = page.getByRole("button", { name: EL.voice.startListening }).first();
    await mic.waitFor({ timeout: 20_000 });
    await press(mic);
    const permission = page.getByRole("dialog", { name: EL.voice.permission.title });
    if (await permission.waitFor({ timeout: 3000 }).then(() => true, () => false)) await press(permission.getByRole("button", { name: EL.voice.permission.allow }));
    const stopMic = page.getByRole("button", { name: EL.voice.stopListening }).last();
    check("the microphone records, and says so", await stopMic.waitFor({ timeout: 10_000 }).then(() => true, () => false));
    await page.waitForTimeout(1800);
    await press(stopMic);
    const draft = page.getByRole("dialog", { name: EL.voice.draft.title });
    if (await draft.waitFor({ timeout: 8000 }).then(() => true, () => false)) await press(draft.getByRole("button", { name: EL.voice.draft.use }));
    await page.waitForFunction((want) => [...document.querySelectorAll("textarea")].some((t) => t.value.includes(want)), heard.el[0], { timeout: 20_000 }).catch(() => {});
    check("what was said is written in the field, through the real transcription route", (await field.inputValue()).includes(heard.el[0]) && providerLog.transcribe.length === 1, await field.inputValue());
    check("...and nothing was sent on the person's behalf", providerLog.chat.length === 0);
    await field.fill("");
    providerLog.transcribe.length = 0;

    await startTalking(page, press);
    check("«Μίλα» opens the conversation, and the globe is in it", (await overlay(page).locator('[data-testid="voice-orb"] svg').count()) >= 1, await overlay(page).innerHTML().then((h) => h.slice(0, 200)));
    check("...with the words that say what it is doing, in Greek", (await overlay(page).innerText()).includes(EL.voice.conversation.title));
    const first = await waitState(page, "listening").then(async () => (await overlay(page).innerText()).includes(EL.voice.states.listening));
    check("it listens at once, and says so", first);
    const path1 = await waitState(page, "speaking", 45_000);
    check(`the turn ended on silence and went through thinking to speaking (${path1.join(" -> ")})`, path1.includes("thinking"));
    const text1 = await overlay(page).innerText();
    check("what was heard and what was answered are on the screen", text1.includes(heard.el[0]) && text1.includes(ANSWERS[heard.el[0]]), text1.slice(0, 300));
    check("the clip reached the transcription provider as audio, with the key", providerLog.transcribe.length === 1 && providerLog.transcribe[0].bytes > 2000 && /multipart\/form-data/.test(providerLog.transcribe[0].type) && providerLog.transcribe[0].auth);
    check("the question reached the model as a streamed message", providerLog.chat.some((c) => c.stream && c.question === heard.el[0]));
    check("the answer, and only the answer, was sent to be read aloud", providerLog.speak.length === 1 && providerLog.speak[0].text === ANSWERS[heard.el[0]] && providerLog.speak[0].key);
    const path2 = await waitState(page, "speaking", 45_000).then(() => waitState(page, "listening", 20_000)).catch(() => null);
    await waitState(page, "speaking", 45_000).catch(() => null);
    const text2 = await overlay(page).innerText();
    check("when it finished speaking it listened again by itself, and the second turn was answered", path2 !== null && text2.includes(heard.el[1]) && text2.includes(ANSWERS[heard.el[1]]), text2.slice(0, 400));
    check("both turns are in the conversation, saved", store.chat_messages.filter((m) => m.role === "user").length >= 2 && store.chat_messages.some((m) => m.role === "assistant" && String(m.content).includes(ANSWERS[heard.el[1]])));
    check(`each spoken step was held and settled (${settled.map((s) => s.p_feature).join(", ")})`, settled.filter((s) => s.p_feature === "voice").length >= 4 && settled.some((s) => s.p_feature !== "voice"));
    // INTERRUPTION: a tap while it speaks stops the voice and listens.
    await press(overlay(page).locator('[data-testid="voice-conversation-area"]'));
    const after = await waitState(page, "listening", 10_000).then(() => true, () => false);
    check("a tap while it speaks cuts in and it listens", after);
    // CLOSING: nothing more is recorded or sent.
    await press(overlay(page).getByRole("button", { name: EL.voice.conversation.close }));
    await overlay(page).waitFor({ state: "detached", timeout: 10_000 });
    const calls = providerLog.transcribe.length + providerLog.speak.length;
    await page.waitForTimeout(4000);
    check("closed: gone, and nothing more reaches a provider", (await overlay(page).count()) === 0 && providerLog.transcribe.length + providerLog.speak.length === calls);
    check(`no page threw (${pageErrors.length})`, pageErrors.length === 0, pageErrors.slice(0, 3).join(" | "));
    await context.close();
  }

  console.log("\n== in English, desktop ==");
  {
    lang = "en";
    for (const k of Object.keys(providerLog)) providerLog[k].length = 0;
    const { context, page, press } = await open(APP, { viewport: { width: 1440, height: 900 }, touch: false }, "en");
    await page.goto(`${APP}/dashboard/chat`, { waitUntil: "networkidle" });
    await startTalking(page, press);
    await waitState(page, "speaking", 45_000);
    const text = await overlay(page).innerText();
    check("the conversation speaks English, its own words and the answer", text.includes(EN.voice.conversation.title) && text.includes(ANSWERS[heard.en[0]]) && !/[Ͱ-Ͽ]/.test(text), text.slice(0, 300));
    await press(overlay(page).getByRole("button", { name: EN.voice.conversation.close }));
    await context.close();
  }

  console.log("\n== around it: speech not set up, no minutes left, the provider down ==");
  {
    const { context, page, press } = await open(NO_SPEECH, { viewport: { width: 390, height: 844 }, touch: true });
    await page.goto(`${NO_SPEECH}/dashboard/chat`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1500);
    check("without a speech key there is no «Μίλα» to press", (await page.locator('[data-testid="voice-conversation-start"]').count()) === 0);
    await context.close();

    usedSeconds = 10_000_000;
    const out = await open(APP, { viewport: { width: 1440, height: 900 }, touch: false });
    await out.page.goto(`${APP}/dashboard/chat`, { waitUntil: "networkidle" });
    await out.page.waitForTimeout(1500);
    check("no minutes left this month: no «Μίλα» either", (await out.page.locator('[data-testid="voice-conversation-start"]').count()) === 0);
    await out.context.close();
    usedSeconds = 0;

    lang = "el";
    transcribeDown = true;
    for (const k of Object.keys(providerLog)) providerLog[k].length = 0;
    const down = await open(APP, { viewport: { width: 390, height: 844 }, touch: true });
    await down.page.goto(`${APP}/dashboard/chat`, { waitUntil: "networkidle" });
    await startTalking(down.page, down.press);
    await waitState(down.page, "listening");
    const stopped = await waitState(down.page, "idle", 45_000).then(() => true, () => false);
    check("the transcription provider down: the loop stops and waits, and nothing is answered or spoken", stopped && providerLog.chat.length === 0 && providerLog.speak.length === 0);
    check("...and the person is told, in their language", (await down.page.locator("body").innerText()).includes(EL.voice.errors.provider_error));
    transcribeDown = false;
    await down.context.close();
  }
} catch (err) {
  check("the run completed", false, String(err?.stack ?? err) + (pageErrors.length ? `\n        page errors: ${pageErrors.slice(0, 3).join(" | ")}` : ""));
} finally {
  if (browser) await browser.close().catch(() => {});
  cleanup();
}

console.log(failures.length ? `\nFAILURES: ${pass} passed, ${failures.length} failed` : `\nALL PASS: ${pass} passed, 0 failed`);
process.exit(failures.length === 0 ? 0 : 1);
