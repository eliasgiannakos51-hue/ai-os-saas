// THE VOICE CONVERSATION: LISTEN, ANSWER, SPEAK, LISTEN AGAIN (MASTER 16,
// package 29).
//
// What would be wrong quietly:
//
//   SPEECH THAT CAN ONLY GO TO ONE PLACE. Until package 29 the ElevenLabs
//   address was a constant, so the last step of the loop could not be
//   pointed at a stand-in and the loop had never run end to end in a
//   build. Section 1 sends a real request through synthesiseSpeech to a
//   local server named by ELEVENLABS_BASE_URL, and requires the real
//   address when it is unset.
//
//   A LOOP THAT STOPS AFTER ONE TURN, or speaks before the answer is in,
//   or keeps the microphone open after it is closed. Section 2 holds the
//   order in the component, comments stripped; the browser test
//   (voice-conversation.prodtest.mjs) runs it.
//
// Run: node scripts/tests/voice-conversation.test.mjs
import http from "node:http";
import { readFileSync } from "node:fs";
import { loadTs } from "./load-ts.mjs";
import { stripComments } from "../check-mutation-markers.mjs";

let pass = 0;
const failures = [];
const ok = (name, cond, detail) => {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { failures.push(name); console.log(`  FAIL  ${name}${detail !== undefined ? "\n        " + detail : ""}`); }
};
const read = (f) => stripComments(readFileSync(f, "utf8"));

console.log("== 1. speech goes where ELEVENLABS_BASE_URL says, and to ElevenLabs when it says nothing ==");
{
  const providers = read("src/lib/voice/voice-providers.ts");
  ok("unset or blank, it is ElevenLabs' own API", /if \(typeof raw !== "string" \|\| raw\.trim\(\) === ""\) return "https:\/\/api\.elevenlabs\.io\/v1";/.test(providers));
  ok("the speech request is built from it, not from a constant", /fetch\(`\$\{elevenLabsBase\(\)\}\$\{ELEVENLABS_TTS_PATH\}\/\$\{voiceIdFor\(params\.voiceKey\)\}`/.test(providers) && !/https:\/\/api\.elevenlabs\.io\/v1\/text-to-speech/.test(providers));

  const asked = [];
  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      asked.push({ url: req.url, key: req.headers["xi-api-key"], body: JSON.parse(body || "{}") });
      res.writeHead(200, { "Content-Type": "audio/mpeg" });
      res.end(Buffer.from([0xff, 0xfb, 0x90, 0xc0, 0, 0, 0, 0]));
    });
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const saved = { key: process.env.ELEVENLABS_API_KEY, base: process.env.ELEVENLABS_BASE_URL };
  process.env.ELEVENLABS_API_KEY = "test-key";
  process.env.ELEVENLABS_BASE_URL = `http://127.0.0.1:${server.address().port}/v1/`;
  try {
    const V = await loadTs("src/lib/voice/voice-providers.ts");
    const out = await V.synthesiseSpeech({ text: "Ανοίγει στις 8 το πρωί.", voiceKey: "default" });
    ok("a real request reaches the server it names, the trailing slash trimmed", asked.length === 1 && /^\/v1\/text-to-speech\/[^/]+$/.test(asked[0].url), JSON.stringify(asked.map((a) => a.url)));
    ok("...with the key, and the words to say", asked[0]?.key === "test-key" && asked[0]?.body?.text === "Ανοίγει στις 8 το πρωί.");
    ok("...and its bytes come back as the audio", out.ok === true && out.audio.byteLength === 8 && out.contentType === "audio/mpeg");
  } catch (err) {
    ok("the speech call ran", false, String(err?.stack ?? err).slice(0, 400));
  } finally {
    process.env.ELEVENLABS_API_KEY = saved.key ?? "";
    if (saved.base === undefined) delete process.env.ELEVENLABS_BASE_URL;
    else process.env.ELEVENLABS_BASE_URL = saved.base;
    server.close();
  }
  ok("the variable is documented where every other one is", /\nELEVENLABS_BASE_URL=\n/.test(readFileSync(".env.local.example", "utf8")));
}

console.log("\n== 2. the loop, in its order ==");
{
  const conv = read("src/components/voice/voice-conversation.tsx");
  const at = (s) => conv.indexOf(s);
  ok("heard, then answered, then spoken — in that order", at('fetch("/api/voice/transcribe"') > 0 && at('fetch("/api/voice/transcribe"') < at('fetch("/api/chat"') && at('fetch("/api/chat"') < at('fetch("/api/voice/speak"'));
  ok("what is spoken is the answer, cut to one request", /body: JSON\.stringify\(\{ text: turn\.answer\.slice\(0, MAX_SPEAK_CHARS\), voice: DEFAULT_VOICE \}\)/.test(conv));
  ok("when the voice ends, it listens again by itself", /audio\.onended = \(\) => \{\s*if \(abandonedRef\.current\) return;\s*listen\(\);\s*\};/.test(conv));
  ok("a failed voice still listens again: the answer is already on screen", /if \(!speakResponse\.ok\) \{\s*listen\(\);\s*return;\s*\}/.test(conv));
  ok("a failed hearing stops and says why, and nothing is asked of the model", /if \(!stt\.ok\) \{\s*addToast\(voiceError\(stt\), "error"\);\s*setState\("idle"\);\s*return;\s*\}/.test(conv) && at("if (!stt.ok)") < at('fetch("/api/chat"'));
  ok("a turn ends on silence", /useRecorder\(\{\s*autoStopOnSilence: true,/.test(conv));
  ok("the press that opens it starts the first turn — once", /useEffect\(\(\) => \{\s*if \(startedRef\.current\) return;\s*startedRef\.current = true;\s*listen\(\);\s*\}, \[listen\]\);/.test(conv));
  ok("closing stops the microphone and the voice", /function close\(\) \{\s*abandonedRef\.current = true;\s*recorder\.stop\(\);\s*stopSpeaking\(\);/.test(conv));
  ok("the globe is what it shows, and the state is on the page", /<VoiceOrb state=\{state\}/.test(conv) && /data-state=\{state\}/.test(conv) && /import \{ GlobeMark \} from "@\/components\/ui\/globe-mark";/.test(readFileSync("src/components/voice/voice-orb.tsx", "utf8")));
  const chat = read("src/components/chat/chat-workspace.tsx");
  ok("«Μίλα» is drawn only when both providers are set up and minutes are left", /const talkAvailable =\s*voiceAvailability\.loaded && voiceAvailability\.transcribeAvailable && voiceAvailability\.speakAvailable && voiceAvailability\.hasMinutes;/.test(chat) && /talkAvailable && \(\s*<button/.test(chat));
}

console.log(failures.length ? `\nFAILURES: ${pass} passed, ${failures.length} failed` : `\nALL PASS: ${pass} passed, 0 failed`);
process.exitCode = failures.length ? 1 : 0;
