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
import { readFileSync, readdirSync, statSync } from "node:fs";
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
// THREE NAMED, AND THE TREE HAD FOUR.
//
// src/components/voice/voice-conversation.tsx read the same /api/chat
// NDJSON stream with its own inlined `await reader.read()` loop and
// committed the answer only after the loop finished — the exact defect
// the header above describes, on a billed path, in a component no list
// here mentioned. Found 2026-09-17 by deriving the population.
//
// DERIVED: anything under src/components that reads a streaming body.
// A consumer added tomorrow is in scope without anybody remembering it,
// and one that stops streaming drops out of COMMITS by the check below.
const STREAM_READER = /getReader\s*\(\s*\)|readNdjsonStream\s*\(/;
const streamers = [];
(function walkComponents(dir) {
  // SORTED. readdirSync promises no order, so an offender list built from
  // an unsorted walk comes out in a different sequence on a filesystem
  // that hands the files back differently — and a failure whose lines
  // move between machines is a failure two people cannot compare.
  // scripts/scan-order-dependence.mjs found this file by running it twice
  // with every listing reversed.
  for (const entry of [...readdirSync(dir)].sort()) {
    const full = `${dir}/${entry}`;
    if (statSync(full).isDirectory()) walkComponents(full);
    else if (entry.endsWith(".tsx") && STREAM_READER.test(readFileSync(full, "utf8"))) streamers.push(full);
  }
})("src/components");
checkTrue(`components that read a stream (${streamers.length})`, streamers.length >= 4, "the stream detector found almost nothing, so the difference below is empty for the wrong reason");

// The variable each one accumulates into, so the "commits unconditionally"
// check can name it. A streamer with no entry is reported rather than
// skipped — that is the whole point.
// EACH ENTRY NAMES THE VARIABLE *AND* THE COMMIT, because the commit is
// the thing that must survive and its shape differs per consumer. A
// mutant that turned `if (accumulatedText) {` into `if (false) {` — the
// original defect exactly, the reply never reaching the message list —
// stayed green against every property-shaped rule tried here: the
// variable is still branched on three lines later, for the interruption
// toast. So the commit is named, per consumer, and checked literally.
const COMMITS = {
  "src/components/chat/chat-workspace.tsx": { varName: "accumulatedText", commit: "if (accumulatedText) {" },
  "src/components/records/ask-ai-modal.tsx": { varName: "accumulatedText", commit: "if (accumulatedText) {" },
  "src/components/create/studio-chat.tsx": { varName: "accumulated", commit: "if (accumulated) {" },
  // Unconditional: setTurns runs straight after the read, which is
  // stronger than a guard and is why this one is spelled differently.
  "src/components/voice/voice-conversation.tsx": { varName: "answer", commit: "setTurns((current) => [...current, turn]);" },
};
const undeclaredStreamers = streamers.filter((f) => !COMMITS[f]);
check("every streaming component is accounted for here", undeclaredStreamers, []);
const staleStreamers = Object.keys(COMMITS).filter((f) => !streamers.includes(f));
check("no entry names a component that no longer streams", staleStreamers, []);

const CONSUMERS = streamers.map((f) => [f, COMMITS[f].varName, COMMITS[f].commit]);
for (const [file, varName, commit] of CONSUMERS) {
  const src = readFileSync(file, "utf8");
  checkTrue(`${file}: imports readNdjsonStream`, src.includes('from "@/lib/ndjson-stream"'));
  checkTrue(`${file}: uses it`, src.includes("await readNdjsonStream("));
  // The regression to prevent: going back to an inlined loop.
  check(`${file}: no inlined read loop`, /await reader\.read\(\)/.test(src), false);
  check(`${file}: no unguarded JSON.parse of a stream line`, /JSON\.parse\(line\)/.test(src), false);
  // The commit must NOT be reachable only on the happy path.
  // THE PROPERTY IS "READ AFTER THE STREAM ENDS", NOT ONE SPELLING OF IT.
  //
  // This was `src.includes("if (" + varName + ")")`, which is how the
  // three original consumers happen to be written. voice-conversation.tsx
  // commits UNCONDITIONALLY — setTurns runs straight after the read — and
  // branches on the accumulated text with a ternary to choose between the
  // partial and the empty message. That is strictly stronger than an
  // `if`, and the check called it a failure. What actually has to be true
  // is that the variable is used after the reading finishes; combined
  // with "no inlined read loop" above, there is no try/catch left for a
  // commit to be trapped inside.
  const readAt = src.indexOf("readNdjsonStream(");
  // BRANCHED ON, not merely mentioned. "Appears after the read" let
  // `if (accumulatedText)` become `if (false)` with the variable still
  // named three lines down, which is the defect with the branch removed.
  checkTrue(
    `${file}: the commit is reached after the stream ends`,
    readAt >= 0 && src.slice(readAt).includes(commit),
    `expected to find ${JSON.stringify(commit)} after the read — the reply the user watched arrive is not being kept`
  );
  checkTrue(
    `${file}: branches on ${varName} after the stream ends`,
    readAt >= 0 &&
      new RegExp(`if\\s*\\(\\s*!?${varName}\\b|\\b${varName}\\s*\\?|\\b${varName}\\s*&&`).test(src.slice(readAt + 20)),
    "whatever arrived before an interruption is discarded"
  );
  // And the interruption has to be surfaced, distinctly for partial vs none.
  // AND ACTS ON IT. Destructuring `{ interrupted }` is not using it: a
  // mutant that wrote `if (false && interrupted)` left this green, which
  // is the same "consulted and thrown away" shape route-write-bound.test.mjs
  // had to fix for its rate limiters on the same day.
  checkTrue(`${file}: reads the interrupted flag`, /\{ interrupted \}/.test(src));
  checkTrue(
    `${file}: branches on interrupted`,
    /if\s*\(\s*interrupted\b|\binterrupted\s*\?|\binterrupted\s*&&\s*[A-Za-z_$]/.test(src),
    "the interruption is read out of the result and never acted on"
  );
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
