// The test that would have caught "the generated website was too large and
// got cut off before finishing" — twice.
//
// WHAT PRODUCTION ACTUALLY REPORTED (ai_cost_log):
//     website_generate: input 6091, output 13624,
//                       cache_write 11557, cache_read 5158
//     -> "The generated website was too large and got cut off before
//         finishing — try a shorter or simpler description."
//
// 13,624 output tokens against a 64,000 ceiling. The response was NOWHERE
// NEAR max_tokens, so the message was not merely unhelpful, it was wrong.
// And there is exactly one generate row in the log — no "retry" row — so
// the continuation loop ran once and stopped.
//
// ROOT CAUSE. streamHtmlToCompletion passes `tools: [WEB_SEARCH_TOOL]`.
// When Claude's server-side search loop hits its own iteration limit the
// turn ends with stop_reason "pause_turn" — the documented "I am not done,
// send this back to me" signal. The continuation condition was:
//
//     const doneOrExhausted =
//       stopReason !== "max_tokens" || ...        // pause_turn -> true
//     if (doneOrExhausted) break;
//
// so ANY stop reason other than max_tokens ended the loop, discarded a
// half-written document, and threw the "too large" error. We paid for
// 13,624 output tokens plus an 11,557-token cache write and shipped the
// user nothing. Pure loss, and it repeated because the previous fix raised
// the token ceiling — which was never the binding constraint.
//
// HOW THIS TEST IS BUILT. It calls the REAL generateWebsiteHtml through
// the REAL @anthropic-ai/sdk, with the real SSE wire parsing, the real
// stream accumulation and the real CostAccumulator. The only thing
// replaced is Anthropic's server: ANTHROPIC_BASE_URL points at a local
// HTTP server that speaks the Messages streaming protocol. Nothing in our
// own code path is stubbed, because the last two rounds of this bug were
// both "verified" by harnesses that supplied what the real path lacked.
//
// Run: node scripts/tests/website-continuation.itest.mjs
import http from "node:http";

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

// ---------------------------------------------------------------------
// A local server speaking Anthropic's Messages streaming protocol.
// ---------------------------------------------------------------------

/** Each queued item describes one round the fake upstream should return. */
let script = [];
/** Every request body the SDK actually sent, in order. */
let requests = [];

function sse(res, event, data) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

function respondStream(res, spec) {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  const usage = {
    input_tokens: spec.inputTokens ?? 10,
    output_tokens: 1,
    cache_creation_input_tokens: spec.cacheWrite ?? 0,
    cache_read_input_tokens: spec.cacheRead ?? 0,
  };
  sse(res, "message_start", {
    type: "message_start",
    message: {
      id: "msg_test",
      type: "message",
      role: "assistant",
      model: "claude-sonnet-4-6",
      content: [],
      stop_reason: null,
      stop_sequence: null,
      usage,
    },
  });

  let index = 0;
  // A real search-using turn interleaves server_tool_use and
  // web_search_tool_result blocks between the text blocks. Emitting them
  // matters: it is what makes the assistant turn we echo back on a
  // pause_turn resume look like the one the API actually produced.
  if (spec.withSearch) {
    sse(res, "content_block_start", {
      type: "content_block_start",
      index,
      content_block: { type: "server_tool_use", id: "srvtoolu_1", name: "web_search", input: {} },
    });
    sse(res, "content_block_delta", {
      type: "content_block_delta",
      index,
      delta: { type: "input_json_delta", partial_json: '{"query":"bakery"}' },
    });
    sse(res, "content_block_stop", { type: "content_block_stop", index });
    index++;
    sse(res, "content_block_start", {
      type: "content_block_start",
      index,
      content_block: {
        type: "web_search_tool_result",
        tool_use_id: "srvtoolu_1",
        content: [
          {
            type: "web_search_result",
            title: "Bakery",
            url: "https://example.com/bakery",
            encrypted_content: "enc",
            page_age: null,
          },
        ],
      },
    });
    sse(res, "content_block_stop", { type: "content_block_stop", index });
    index++;
  }

  for (const chunk of spec.textChunks ?? [spec.text ?? ""]) {
    sse(res, "content_block_start", {
      type: "content_block_start",
      index,
      content_block: { type: "text", text: "" },
    });
    // Split so the stream is genuinely incremental, exercising the
    // onDelta accumulation rather than a single atomic write.
    for (let i = 0; i < chunk.length; i += 400) {
      sse(res, "content_block_delta", {
        type: "content_block_delta",
        index,
        delta: { type: "text_delta", text: chunk.slice(i, i + 400) },
      });
    }
    sse(res, "content_block_stop", { type: "content_block_stop", index });
    index++;
  }

  sse(res, "message_delta", {
    type: "message_delta",
    delta: { stop_reason: spec.stopReason, stop_sequence: null },
    usage: { output_tokens: spec.outputTokens ?? 100 },
  });
  sse(res, "message_stop", { type: "message_stop" });
  res.end();
}

const server = http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    requests.push(JSON.parse(body || "{}"));
    const spec = script.shift();
    if (!spec) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ type: "error", error: { type: "api_error", message: "script exhausted" } }));
      return;
    }
    respondStream(res, spec);
  });
});

await new Promise((r) => server.listen(0, "127.0.0.1", r));
process.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${server.address().port}`;
process.env.ANTHROPIC_API_KEY = "sk-ant-test";

const { loadTsWithDeps } = await import("./load-ts.mjs");
const wb = await loadTsWithDeps("src/lib/website-builder.ts");
const { CostAccumulator } = await loadTsWithDeps("src/lib/billing/cost-accumulator.ts");

// A document long enough to clear looksLikeCompleteHtmlDocument's 100-char
// floor, split at a point a real truncation could plausibly land on.
const HEAD =
  '<!DOCTYPE html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n<title>Corner Bakery</title>\n<style>\nbody{margin:0;font-family:system-ui}\n.hero{padding:80px 24px;background:#111;color:#fff}\n</style>\n</head>\n<body>\n<header class="hero"><h1>Corner Bakery</h1><p>Fresh every morning.</p></header>\n<main>\n<section><h2>Our bread</h2><p>Sourdough, baguettes, rye.</p></section>';
const TAIL = '\n<section><h2>Visit us</h2><p>12 High Street.</p></section>\n</main>\n<footer><p>&copy; 2026 Corner Bakery</p></footer>\n</body>\n</html>';

function reset(...specs) {
  script = specs;
  requests = [];
}

async function generate(costs) {
  return wb.generateWebsiteHtml(
    "sk-ant-test",
    "A website for a corner bakery",
    undefined,
    () => {},
    undefined,
    costs
  );
}

// ---------------------------------------------------------------------
console.log("== 1. the exact production failure: pause_turn at 13,624 tokens ==");
// Round 0 reproduces the logged row byte for byte: a search-using turn
// that stops with pause_turn after 13,624 output tokens, holding a
// half-written document. Before the fix this threw "too large".
reset(
  {
    withSearch: true,
    text: HEAD,
    stopReason: "pause_turn",
    inputTokens: 6091,
    outputTokens: 13624,
    cacheWrite: 11557,
    cacheRead: 5158,
  },
  { text: TAIL, stopReason: "end_turn", inputTokens: 20000, outputTokens: 900 }
);
let costs = new CostAccumulator();
let html = null,
  err = null;
try {
  html = await generate(costs);
} catch (e) {
  err = e;
}
check("no error is thrown", err?.message ?? null, null);
checkTrue("the document is complete", html?.trim().endsWith("</html>"));
checkTrue("the first round's HTML is kept, not discarded", html?.includes("Corner Bakery"));
checkTrue("the continuation is appended", html?.includes("12 High Street"));
check("a second call was actually made", requests.length, 2);

console.log("\n== 2. a pause_turn resume echoes the assistant turn, with no extra user message ==");
// The documented resume for pause_turn is to send the assistant response
// back unchanged and let the model carry on. Injecting a "Continue." user
// message instead is what breaks an in-flight server-tool loop.
const resume = requests[1];
check("last message is the assistant turn", resume.messages.at(-1).role, "assistant");
check("no continuation instruction was injected", resume.messages.length, 2);
const echoed = resume.messages[1].content;
checkTrue("the echoed turn is structured content, not flattened text", Array.isArray(echoed));
checkTrue(
  "the server_tool_use block survives the round trip",
  echoed.some((b) => b.type === "server_tool_use")
);
checkTrue(
  "the web_search_tool_result block survives too",
  echoed.some((b) => b.type === "web_search_tool_result")
);

console.log("\n== 3. every round is billed, including the continuation ==");
// One generate row and no retry row in ai_cost_log is exactly how the
// production failure was spotted. Undercounting rounds hides the cost of
// the case where cost is highest.
const t = costs.totals();
check("two rounds recorded", costs.entries.length, 2);
check("round 0 is the generation stage", costs.entries[0].stage, "generation");
check("round 1 is billed as a retry", costs.entries[1].stage, "retry");
check("round 0 input tokens match the log", costs.entries[0].usage.inputTokens, 6091);
check("round 0 output tokens match the log", costs.entries[0].usage.outputTokens, 13624);
check("round 0 cache-write tokens match the log", costs.entries[0].usage.cacheWriteTokens, 11557);
check("round 0 cache-read tokens match the log", costs.entries[0].usage.cacheReadTokens, 5158);
checkTrue("the continuation round adds cost, it is not free", t.usdCost > costs.entries[0].usage.usdCost);

console.log("\n== 4. max_tokens still continues, with an explicit instruction ==");
// The pre-existing path has to keep working: a genuine ceiling hit is
// resumed by asking for the rest, not by echoing the assistant turn.
reset(
  { text: HEAD, stopReason: "max_tokens", outputTokens: 64000 },
  { text: TAIL, stopReason: "end_turn", outputTokens: 900 }
);
err = null;
try {
  html = await generate(new CostAccumulator());
} catch (e) {
  err = e;
}
check("max_tokens truncation recovers", err?.message ?? null, null);
checkTrue("and the document is complete", html?.trim().endsWith("</html>"));
check("the continuation is a user turn", requests[1].messages.at(-1).role, "user");
checkTrue(
  "asking for the raw continuation, not a restart",
  /Continue the HTML document EXACTLY where you left off/.test(requests[1].messages.at(-1).content)
);

console.log("\n== 5. end_turn on a half-written document also continues ==");
// A model that simply stops mid-document reports end_turn. The old
// condition treated that as success and threw the "too large" error, for
// the same reason pause_turn failed: it only ever looked at max_tokens.
reset(
  { text: HEAD, stopReason: "end_turn", outputTokens: 9000 },
  { text: TAIL, stopReason: "end_turn", outputTokens: 900 }
);
err = null;
try {
  html = await generate(new CostAccumulator());
} catch (e) {
  err = e;
}
check("a premature end_turn recovers", err?.message ?? null, null);
checkTrue("and the document is complete", html?.trim().endsWith("</html>"));

console.log("\n== 6. a complete document never pays for an extra round ==");
reset({ text: HEAD + TAIL, stopReason: "end_turn", outputTokens: 5000 });
costs = new CostAccumulator();
err = null;
try {
  html = await generate(costs);
} catch (e) {
  err = e;
}
check("no error", err?.message ?? null, null);
check("exactly one call", requests.length, 1);
check("exactly one billed round", costs.entries.length, 1);

console.log("\n== 7. a refusal stops immediately instead of burning rounds ==");
// Continuing after a refusal cannot produce a document; each extra round
// would be more money spent on a guaranteed failure.
reset({ text: "I can't help with that.", stopReason: "refusal", outputTokens: 20 });
err = null;
try {
  await generate(new CostAccumulator());
} catch (e) {
  err = e;
}
checkTrue("it fails", Boolean(err));
check("without a second call", requests.length, 1);
checkTrue("and does not blame the size", !/too large/i.test(err.message));

console.log("\n== 8. when it does give up, the message names the real reason ==");
// "Try a shorter or simpler description" told the user to fix a problem
// they did not have. A wrong diagnosis is worse than a vague one: it sends
// them to shorten a description that was never too long.
reset(
  { withSearch: true, text: HEAD, stopReason: "pause_turn", outputTokens: 13624 },
  { withSearch: true, text: "\n<section><h2>More</h2></section>", stopReason: "pause_turn", outputTokens: 9000 },
  { withSearch: true, text: "\n<section><h2>Even more</h2></section>", stopReason: "pause_turn", outputTokens: 9000 },
  { withSearch: true, text: "\n<section><h2>Still more</h2></section>", stopReason: "pause_turn", outputTokens: 9000 },
  { withSearch: true, text: "\n<section><h2>Yet more</h2></section>", stopReason: "pause_turn", outputTokens: 9000 }
);
err = null;
try {
  await generate(new CostAccumulator());
} catch (e) {
  err = e;
}
checkTrue("it still fails when it truly cannot finish", Boolean(err));
checkTrue(
  "the message does not claim the description was too large",
  !/too large|shorter or simpler/i.test(err?.message ?? "")
);
checkTrue("it says the generation was interrupted", /interrupted/i.test(err?.message ?? ""));
checkTrue("more than one round was actually attempted", requests.length > 1);

console.log("\n== 9. the ceiling is the model's real maximum ==");
// 13,624 was never near 64,000, so this was not the cause — but the
// ceiling should still be the model's documented max rather than a number
// chosen when the continuation path did not work.
const { readFileSync } = await import("node:fs");
const src = readFileSync("src/lib/website-builder.ts", "utf8");
const maxTokens = Number(src.match(/const WEBSITE_MAX_TOKENS = (\d+)/)?.[1]);
check("WEBSITE_MAX_TOKENS is claude-sonnet-4-6's 128000 ceiling", maxTokens, 128000);
check("and that is what the request actually carries", requests[0].max_tokens, 128000);

console.log("\n== 10. text after a search is not dropped on the non-streaming path ==");
// response.content.find(first text block) silently discarded everything
// written AFTER a web_search_tool_result — which, for a searching
// generation, is most of the document. The edit path takes that branch.
checkTrue(
  "all text blocks are concatenated, not just the first",
  /content\s*\.filter\([\s\S]{0,200}type === "text"\)[\s\S]{0,160}\.join\(""\)/.test(src)
);
reset({
  withSearch: true,
  textChunks: [HEAD, TAIL],
  stopReason: "end_turn",
  outputTokens: 5000,
});
err = null;
try {
  html = await wb.generateWebsiteHtml("sk-ant-test", "A bakery", undefined, undefined, undefined, new CostAccumulator());
} catch (e) {
  err = e;
}
check("no error without an onDelta callback", err?.message ?? null, null);
checkTrue("the post-search text survives", html?.includes("12 High Street"));
check("and no continuation was needed", requests.length, 1);

// ---------------------------------------------------------------------
// 11-15: the SECOND interrupted-generation bug — research narration.
// ---------------------------------------------------------------------
//
// WHAT THE USER REPORTED, verbatim:
//   "The website generation was interrupted before the generated page was
//    finished."
// on an account where the page had, in fact, been written.
//
// That string is thrown by assertCompleteHtmlResponse when the stop reason
// is not max_tokens AND looksLikeCompleteHtmlDocument() says no. Both
// inputs were being taken from the RAW accumulated response, and
// looksLikeCompleteHtmlDocument requires the string to START with
// <!doctype. A turn that uses web_search does not: it opens with a
// sentence about what it is looking up, then searches, then writes the
// document. One sentence of narration in front of a perfect page was
// enough to fail the check and throw.
//
// The continuation gate had the same prefix test, so the half-written case
// could not even be resumed — it was discarded un-continued.
//
// This is why the failure looked random and why it got WORSE as the
// research instructions got stronger: it tracked whether the model
// narrated, not whether it finished.
const NARRATION = "I'll look up what's actually around that area before writing the page.\n\n";

console.log("\n== 11. a narrated, COMPLETE generation is not reported as interrupted ==");
reset({ withSearch: true, text: NARRATION + HEAD + TAIL, stopReason: "end_turn", outputTokens: 9000 });
err = null;
html = null;
try {
  html = await generate(new CostAccumulator());
} catch (e) {
  err = e;
}
check("no error is thrown", err?.message ?? null, null);
checkTrue("specifically not the interrupted error", !/interrupted/i.test(err?.message ?? ""));
checkTrue("the document is returned", html?.startsWith("<!DOCTYPE html>"));
checkTrue("and it is complete", html?.trim().endsWith("</html>"));
checkTrue("the narration is not in the saved HTML", !html?.includes("I'll look up"));
check("no wasted continuation round", requests.length, 1);

console.log("\n== 12. a narrated, TRUNCATED generation is resumed rather than discarded ==");
// The prefix gate refused to continue here, so the user paid for a
// half-written page and got an error.
reset(
  { withSearch: true, text: NARRATION + HEAD, stopReason: "end_turn", outputTokens: 9000 },
  { text: TAIL, stopReason: "end_turn", outputTokens: 900 }
);
err = null;
html = null;
try {
  html = await generate(new CostAccumulator());
} catch (e) {
  err = e;
}
check("no error", err?.message ?? null, null);
check("a continuation round really ran", requests.length, 2);
checkTrue("the first round's work is kept", html?.includes("Corner Bakery"));
checkTrue("the continuation is appended", html?.includes("12 High Street"));
checkTrue("and the narration is gone", !html?.includes("I'll look up"));

console.log("\n== 13. commentary AFTER the document is stripped from the downloaded file ==");
reset({
  text: HEAD + TAIL + "\n\nLet me know if you'd like a different colour scheme!",
  stopReason: "end_turn",
  outputTokens: 5000,
});
err = null;
html = null;
try {
  html = await generate(new CostAccumulator());
} catch (e) {
  err = e;
}
check("no error", err?.message ?? null, null);
checkTrue("the file ends at </html>", html?.trim().endsWith("</html>"));
checkTrue("the sign-off is not in the file", !html?.includes("colour scheme"));

console.log("\n== 14. the live preview shows the page, not the narration ==");
// onDelta writes straight into user_websites.html_content, which the
// polling client renders in an iframe. Feeding it the raw stream renders
// the model's research narration as the website for the first seconds.
reset({ withSearch: true, text: NARRATION + HEAD + TAIL, stopReason: "end_turn", outputTokens: 9000 });
const deltas = [];
err = null;
try {
  await wb.generateWebsiteHtml(
    "sk-ant-test",
    "A website for a corner bakery",
    undefined,
    (accumulated) => deltas.push(accumulated),
    undefined,
    new CostAccumulator()
  );
} catch (e) {
  err = e;
}
check("no error", err?.message ?? null, null);
checkTrue("deltas were emitted", deltas.length > 0);
checkTrue(
  "no delta ever carries the narration into the preview",
  deltas.every((d) => !d.includes("I'll look up"))
);
checkTrue(
  "the last delta is the document",
  deltas.at(-1)?.startsWith("<!DOCTYPE html>")
);

console.log("\n== 15. research is instructed as mandatory, and the budget matches ==");
// The tool was always wired; the instruction was "use it when the
// description implies..." plus "do NOT search for things you already know
// well", which for "a café in Thessaloniki" resolves to no search at all.
checkTrue("the prompt names research as mandatory", /MANDATORY RESEARCH/.test(src));
checkTrue("it forbids skipping on familiarity", /already know this.{0,40}NOT a reason to skip/is.test(src));
checkTrue("it requires searching a named place", /THE PLACE/.test(src));
checkTrue("it requires searching the industry", /THE INDUSTRY/.test(src));
checkTrue("it requires searching real numbers", /THE NUMBERS/.test(src));
checkTrue(
  "it still forbids inventing the user's own business facts",
  /NEVER establishes facts about THIS user's own business/.test(src)
);
const genSearches = Number(src.match(/const WEBSITE_MAX_SEARCHES = (\d+)/)?.[1]);
checkTrue("the generate search budget covers three subjects plus follow-ups", genSearches >= 6);
reset({ text: HEAD + TAIL, stopReason: "end_turn", outputTokens: 5000 });
await generate(new CostAccumulator()).catch(() => {});
const searchTool = (requests[0].tools ?? []).find((t) => t.type === "web_search_20250305");
checkTrue("the request really offers web search", Boolean(searchTool));
check("with the raised budget", searchTool?.max_uses, genSearches);

// ---------------------------------------------------------------------
// 16-17: the user's brief actually reaches the model LAST.
// ---------------------------------------------------------------------
//
// REPORTED: "I give specific instructions and the result partly ignores
// them."
//
// The static system prompt measures ~16,500 characters against a typical
// description of ~250 — sixty-six to one. Every one of those characters is
// a rule the model is asked to follow, and nothing said the person's own
// instructions outranked them. Worse, the brief was NOT even the last
// thing the model read: the user message was built as
// `description + referenceImageUrlList`, so the final text before the
// answer was a list of storage URLs.
//
// Asserting this against the REAL request body matters more than
// asserting it against the source: the thing that decides the outcome is
// what the SDK actually put on the wire.
console.log("\n== 16. the brief is the LAST thing in the user message ==");
reset({ text: HEAD + TAIL, stopReason: "end_turn", outputTokens: 5000 });
await wb
  .generateWebsiteHtml(
    "sk-ant-test",
    "A dark green site for a law firm. No animations.",
    undefined,
    () => {},
    "https://example.com/api/websites/x/submit-form",
    new CostAccumulator()
  )
  .catch(() => {});

let sent = requests[0];
let userContent = sent.messages[0].content;
let userText = typeof userContent === "string" ? userContent : userContent.at(-1).text;
checkTrue("the brief is labelled as the user's own", /THE USER'S BRIEF/.test(userText));
checkTrue("and says it overrides the system prompt", /overrides every general preference/.test(userText));
checkTrue("the brief text is present", /dark green site for a law firm/.test(userText));
checkTrue(
  "and nothing follows it",
  userText.trim().endsWith("A dark green site for a law firm. No animations.")
);

console.log("\n== 17. precedence is stated, last, and outside the cached block ==");
check("the system prompt is sent as three blocks", sent.system.length, 3);
checkTrue("the last block is the precedence statement", /^PRECEDENCE/.test(sent.system[2].text));
checkTrue("it says the brief wins", /If the brief contradicts a default above, the brief wins/.test(sent.system[2].text));
checkTrue(
  "it still protects the non-negotiables",
  /cannot override[\s\S]{0,400}safety limits/.test(sent.system[2].text)
);
checkTrue("the big static block is cached", sent.system[0].cache_control?.type === "ephemeral");
checkTrue("the precedence block is NOT cached", !sent.system[2].cache_control);
checkTrue("nor is the per-site form block", !sent.system[1].cache_control);

console.log("\n== 18. with reference images, the URLs come BEFORE the brief ==");
reset({ text: HEAD + TAIL, stopReason: "end_turn", outputTokens: 5000 });
await wb
  .generateWebsiteHtml(
    "sk-ant-test",
    "Use my photos in the gallery.",
    [{ base64: "aGk=", mediaType: "image/png", url: "https://storage.example.com/u/1.png" }],
    () => {},
    undefined,
    new CostAccumulator()
  )
  .catch(() => {});
sent = requests[0];
userText = sent.messages[0].content.at(-1).text;
checkTrue("the image URL list is present", /storage\.example\.com\/u\/1\.png/.test(userText));
checkTrue(
  "but it comes before the brief, not after it",
  userText.indexOf("storage.example.com") < userText.indexOf("THE USER'S BRIEF")
);
checkTrue("and the brief is still last", userText.trim().endsWith("Use my photos in the gallery."));

server.close();
console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
