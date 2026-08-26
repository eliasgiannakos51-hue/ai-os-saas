// Reproduction test for the "the AI reply vanished" bug found in the
// V1+V2 audit.
//
// Every streaming consumer (Ionexa Chat, Ask AI, Create Studio chat)
// inlined this shape:
//
//     try {
//       while (true) { await reader.read(); ...accumulate... }
//       if (accumulatedText) commitTheReply()     // <-- INSIDE the try
//     } catch { setError("Network error") }
//
// so a throw anywhere in the loop skipped the commit entirely. The user
// watched an answer stream in token by token, the connection blipped, and
// the whole answer was replaced by "Network error — please try again."
// The tokens were already generated, already measured, already CHARGED.
//
// reader.read() rejects on any dropped connection: a phone changing
// cells, a laptop suspending, a proxy timing out a long response. Long
// replies take longest and are worth most, so the bug hit hardest exactly
// where it cost the most.
//
// These tests drive the real readNdjsonStream against real ReadableStreams
// that fail in the real ways.
//
// Run: node scripts/tests/ndjson-stream.test.mjs
import { readFileSync } from "node:fs";
import ts from "typescript";

let pass = 0,
  fail = 0;
function check(name, actual, expected) {
  const a = JSON.stringify(actual),
    e = JSON.stringify(expected);
  if (a === e) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    fail++;
    console.log(`  FAIL  ${name}\n        expected ${e}\n        actual   ${a}`);
  }
}
function checkTrue(name, cond) {
  check(name, Boolean(cond), true);
}

const js = ts.transpileModule(readFileSync("src/lib/ndjson-stream.ts", "utf8"), {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { readNdjsonStream } = await import("data:text/javascript;base64," + Buffer.from(js).toString("base64"));

const enc = new TextEncoder();
const line = (o) => enc.encode(JSON.stringify(o) + "\n");

/** A stream that yields the given chunks, then optionally errors. */
function streamOf(chunks, { errorAfter = null } = {}) {
  let i = 0;
  return new ReadableStream({
    async pull(controller) {
      if (errorAfter !== null && i === errorAfter) {
        // Exactly what a dropped TCP connection surfaces as.
        controller.error(new TypeError("network error"));
        return;
      }
      if (i >= chunks.length) {
        controller.close();
        return;
      }
      controller.enqueue(chunks[i++]);
    },
  });
}

/** Collect deltas the way every real consumer does. */
function collector() {
  const state = { text: "", meta: null, error: null, events: 0 };
  return [
    state,
    (event) => {
      state.events++;
      if (event.type === "meta") state.meta = event;
      else if (event.type === "delta") {
        if (typeof event.text === "string") state.text += event.text;
      } else if (event.type === "error") state.error = event.error;
    },
  ];
}

console.log("== 1. THE BUG: a mid-stream drop must not delete what arrived ==");
{
  const [state, onEvent] = collector();
  const chunks = [
    line({ type: "meta", conversationId: "c1" }),
    line({ type: "delta", text: "Here is the " }),
    line({ type: "delta", text: "first half of a long answer. " }),
    line({ type: "delta", text: "And a bit more. " }),
  ];
  // Connection dies after 3 of the 4 chunks — mid-reply.
  let readError = null;
  const res = await readNdjsonStream(streamOf(chunks, { errorAfter: 3 }), onEvent).catch((err) => {
    readError = err;
    return null;
  });

  // NOT `check(name, true, true)`. That asserted a constant: it could not
  // fail, and its label claimed something it never verified. It carried a
  // little signal — the file aborts if the apply throws — but only until
  // the reader stops throwing for a different reason, after which the line
  // keeps printing PASS about nothing. The rejection is caught here
  // instead, so the check has an outcome that can be wrong.
  check("reading does not throw", readError === null, true);
  check("the interruption is REPORTED, not hidden", res.interrupted, true);
  // This is the assertion that fails against the old inlined code, because
  // the old code never reached its commit block at all.
  check(
    "everything received before the drop is KEPT",
    state.text,
    "Here is the first half of a long answer. "
  );
  check("earlier meta survives too", state.meta?.conversationId, "c1");
  checkTrue("some events were delivered", state.events >= 3);
}

console.log("\n== 2. a clean stream is not reported as interrupted ==");
{
  const [state, onEvent] = collector();
  const res = await readNdjsonStream(
    streamOf([
      line({ type: "meta", conversationId: "c2", isNewConversation: true }),
      line({ type: "delta", text: "Complete " }),
      line({ type: "delta", text: "answer." }),
      line({ type: "done" }),
    ]),
    onEvent
  );
  check("not interrupted", res.interrupted, false);
  check("full text", state.text, "Complete answer.");
  check("no malformed lines", res.malformedLines, 0);
}

console.log("\n== 3. one corrupt line costs that line, not the response ==");
{
  const [state, onEvent] = collector();
  const res = await readNdjsonStream(
    streamOf([
      line({ type: "delta", text: "before " }),
      enc.encode("{not valid json at all\n"),
      line({ type: "delta", text: "after" }),
    ]),
    onEvent
  );
  // Old behaviour: JSON.parse throws -> catch -> "before " is discarded
  // and the "after" chunk is never read.
  check("the stream continues past the bad line", state.text, "before after");
  check("the bad line is counted", res.malformedLines, 1);
  check("a recoverable parse failure is not an interruption", res.interrupted, false);
}

console.log("\n== 4. chunk boundaries are respected (a line split across reads) ==");
{
  const [state, onEvent] = collector();
  const whole = JSON.stringify({ type: "delta", text: "split across two reads" }) + "\n";
  await readNdjsonStream(
    streamOf([enc.encode(whole.slice(0, 11)), enc.encode(whole.slice(11))]),
    onEvent
  );
  check("a line split mid-JSON is reassembled", state.text, "split across two reads");
}
{
  const [state, onEvent] = collector();
  // Several events arriving in ONE chunk.
  const merged =
    JSON.stringify({ type: "delta", text: "a" }) + "\n" +
    JSON.stringify({ type: "delta", text: "b" }) + "\n" +
    JSON.stringify({ type: "delta", text: "c" }) + "\n";
  await readNdjsonStream(streamOf([enc.encode(merged)]), onEvent);
  check("multiple events in one chunk all fire", state.text, "abc");
}
{
  const [state, onEvent] = collector();
  // A multi-byte UTF-8 character split across the chunk boundary. Greek is
  // the app's second language, so this is not hypothetical.
  const bytes = enc.encode(JSON.stringify({ type: "delta", text: "Καλημέρα" }) + "\n");
  await readNdjsonStream(
    streamOf([bytes.slice(0, 15), bytes.slice(15)]),
    onEvent
  );
  check("a UTF-8 character split across chunks is not mangled", state.text, "Καλημέρα");
}

console.log("\n== 5. a final line with no trailing newline is not dropped ==");
{
  const [state, onEvent] = collector();
  await readNdjsonStream(
    streamOf([enc.encode(JSON.stringify({ type: "delta", text: "no trailing newline" }))]),
    onEvent
  );
  check("the last event still fires", state.text, "no trailing newline");
}

console.log("\n== 6. a throwing handler cannot lose prior state ==");
{
  let seen = "";
  const res = await readNdjsonStream(
    streamOf([
      line({ type: "delta", text: "kept" }),
      line({ type: "boom" }),
      line({ type: "delta", text: " lost" }),
    ]),
    (event) => {
      if (event.type === "boom") throw new Error("handler bug");
      if (event.type === "delta") seen += event.text;
    }
  );
  check("the handler's throw is contained", res.interrupted, true);
  check("state accumulated before the throw survives", seen, "kept");
}

console.log("\n== 7. an empty stream is not an error ==");
{
  const [state, onEvent] = collector();
  const res = await readNdjsonStream(streamOf([]), onEvent);
  check("no events", state.events, 0);
  check("not interrupted", res.interrupted, false);
}
{
  // A stream that errors on the very FIRST read — no text was ever shown,
  // so the caller must show a plain error, not a "partial reply" notice.
  const [state, onEvent] = collector();
  const res = await readNdjsonStream(streamOf([line({ type: "delta", text: "x" })], { errorAfter: 0 }), onEvent);
  check("interrupted", res.interrupted, true);
  check("nothing accumulated", state.text, "");
}

console.log("\n== 8. every consumer actually uses it, and keeps partial text ==");
const CONSUMERS = [
  ["src/components/chat/chat-workspace.tsx", "accumulatedText"],
  ["src/components/records/ask-ai-modal.tsx", "accumulatedText"],
  ["src/components/create/studio-chat.tsx", "accumulated"],
];
for (const [file, varName] of CONSUMERS) {
  const src = readFileSync(file, "utf8");
  checkTrue(`${file}: imports readNdjsonStream`, src.includes('from "@/lib/ndjson-stream"'));
  checkTrue(`${file}: uses it`, src.includes("await readNdjsonStream("));
  // The regression to prevent: going back to an inlined loop.
  check(`${file}: no inlined read loop`, /await reader\.read\(\)/.test(src), false);
  check(`${file}: no unguarded JSON.parse of a stream line`, /JSON\.parse\(line\)/.test(src), false);
  // The commit must NOT be reachable only on the happy path.
  checkTrue(`${file}: commits ${varName} after reading, unconditionally`, src.includes(`if (${varName})`));
  // And the interruption has to be surfaced, distinctly for partial vs none.
  checkTrue(`${file}: reads the interrupted flag`, /\{ interrupted \}/.test(src));
  checkTrue(`${file}: distinguishes partial from empty`, src.includes("streamInterruptedPartial"));
  // A raw "undefined" must never be concatenated into a reply.
  checkTrue(`${file}: guards delta text type`, /typeof event\.text === "string"/.test(src));
}

// The user-facing strings must exist in every locale, or next-intl renders
// the raw key at the exact moment the user is already having a bad time.
const LOCALES = ["en", "el", "es", "fr", "de", "it", "pt", "zh", "ja", "ar"];
const NAMESPACES = [
  ["dashboard", "chat"],
  ["askAi"],
  ["dashboard", "createStudio"],
];
for (const loc of LOCALES) {
  const msgs = JSON.parse(readFileSync(`messages/${loc}.json`, "utf8"));
  for (const path of NAMESPACES) {
    let node = msgs;
    for (const k of path) node = node?.[k];
    for (const key of ["streamInterrupted", "streamInterruptedPartial"]) {
      checkTrue(`${loc}: ${path.join(".")}.${key}`, typeof node?.[key] === "string" && node[key].length > 0);
    }
  }
}

console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
