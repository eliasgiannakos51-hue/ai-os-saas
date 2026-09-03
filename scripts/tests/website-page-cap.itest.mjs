// THE PAGE CAP IS ENFORCED WHERE THE TOKENS ARE SPENT — V4.6.
//
// "It produced 7 pages; the limit is 5." MAX_PAGES_PER_SITE was a line in
// the prompt and a silent `break` in normalisePages: the model wrote
// seven, the worker stored five, the two others were paid for, never
// served, and still in the menu as dead links. This is the test that
// would have caught it: the REAL generateWebsiteHtml through the REAL
// @anthropic-ai/sdk against a local server speaking the Messages
// streaming protocol, which serves a SEVEN-page site, slowly. The
// assertions are about what the stream did — was it aborted, when, what
// was recorded, what came back — not about what the code says.
//
// Run: node scripts/tests/website-page-cap.itest.mjs
import http from "node:http";

let pass = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { failures.push(name); console.log(`  FAIL  ${name}${detail !== undefined ? "\n        " + String(detail).slice(0, 400) : ""}`); }
}

function sse(res, event, data) {
  if (res.destroyed || res.socket?.destroyed) return false;
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  return true;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const page = (i) =>
  `<!--IONEXA:PAGE slug="${i === 0 ? "home" : `page-${i}`}" label="Page ${i}"-->\n` +
  `<!DOCTYPE html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n<title>Page ${i}</title>\n<style>body{margin:0;font-family:system-ui}.hero{padding:80px 24px}</style>\n</head>\n<body>\n<header class="hero"><h1>Page ${i}</h1></header>\n<main><section><h2>Section</h2><p>${"Text. ".repeat(40)}</p></section></main>\n<footer><p>&copy; 2026</p></footer>\n</body>\n</html>\n`;

const PAGES_SERVED = 7;
const COUNTED_OUTPUT_TOKENS = 777;
const state = { messages: 0, countTokens: 0, pagesWritten: 0, aborted: false, countedText: "" };

const server = http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", async () => {
    const parsed = JSON.parse(body || "{}");
    if (req.url.endsWith("/count_tokens")) {
      state.countTokens++;
      state.countedText = parsed.messages?.[0]?.content ?? "";
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ input_tokens: COUNTED_OUTPUT_TOKENS }));
      return;
    }
    state.messages++;
    res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
    req.on("close", () => { if (state.pagesWritten < PAGES_SERVED) state.aborted = true; });
    sse(res, "message_start", { type: "message_start", message: { id: "msg_cap", type: "message", role: "assistant", model: "claude-sonnet-4-6", content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 10, output_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 } } });
    sse(res, "content_block_start", { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } });
    for (let i = 0; i < PAGES_SERVED; i += 1) {
      const text = page(i);
      // Genuinely incremental, and slow enough that an abort lands
      // between pages rather than after the whole site has been sent.
      for (let j = 0; j < text.length; j += 200) {
        if (!sse(res, "content_block_delta", { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: text.slice(j, j + 200) } })) return;
        await sleep(2);
      }
      state.pagesWritten = i + 1;
      await sleep(40);
      if (res.destroyed || res.socket?.destroyed) return;
    }
    sse(res, "content_block_stop", { type: "content_block_stop", index: 0 });
    sse(res, "message_delta", { type: "message_delta", delta: { stop_reason: "end_turn", stop_sequence: null }, usage: { output_tokens: 9999 } });
    sse(res, "message_stop", { type: "message_stop" });
    res.end();
  });
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
process.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${server.address().port}`;
process.env.ANTHROPIC_API_KEY = "sk-ant-test";

const { loadTsWithDeps } = await import("./load-ts.mjs");
const wb = await loadTsWithDeps("src/lib/website-builder.ts");
const { CostAccumulator } = await loadTsWithDeps("src/lib/billing/cost-accumulator.ts");
const { splitGeneratedPages } = await loadTsWithDeps("src/lib/website-multipage.ts");
const { MAX_PAGES_PER_SITE } = await loadTsWithDeps("src/lib/publishing/website-pages.ts");

console.log(`== a ${PAGES_SERVED}-page site against a cap of ${MAX_PAGES_PER_SITE} ==`);
const costs = new CostAccumulator();
const capCalls = [];
let html = "";
let thrown = null;
const startedAt = Date.now();
try {
  html = await wb.generateWebsiteHtml(
    "sk-ant-test",
    "A seven-page brochure site for a bakery",
    undefined,
    () => {},
    undefined,
    costs,
    undefined,
    undefined,
    (cap, started) => capCalls.push({ cap, started })
  );
} catch (e) {
  thrown = e;
}
const elapsed = Date.now() - startedAt;
check("generation resolves rather than throwing", thrown === null, thrown?.message);
check("the upstream saw the client ABORT the stream before the seventh page was sent", state.aborted === true && state.pagesWritten < PAGES_SERVED, JSON.stringify(state));
check(`...and it was aborted as soon as page ${MAX_PAGES_PER_SITE + 1} began — ${MAX_PAGES_PER_SITE} full pages, part of one more`, state.pagesWritten === MAX_PAGES_PER_SITE, state.pagesWritten);
check("the caller was told once: cap, and how many pages were started", capCalls.length === 1 && capCalls[0].cap === MAX_PAGES_PER_SITE && capCalls[0].started === MAX_PAGES_PER_SITE + 1, JSON.stringify(capCalls));
check("exactly one messages call — no continuation round was started on the cut text", state.messages === 1, state.messages);
const split = splitGeneratedPages(html);
check(`what came back splits into a home page and ${MAX_PAGES_PER_SITE - 1} sub-pages`, split.pages.length === MAX_PAGES_PER_SITE - 1, `${split.pages.length} pages, dropped ${JSON.stringify(split.dropped)}`);
check("...with nothing dropped: the cut fell exactly on a page boundary", split.dropped.length === 0, JSON.stringify(split.dropped));
check(`...the ${MAX_PAGES_PER_SITE}th page is complete and the ${MAX_PAGES_PER_SITE + 1}th is absent`, split.pages.at(-1)?.slug === `page-${MAX_PAGES_PER_SITE - 1}` && !html.includes(`slug="page-${MAX_PAGES_PER_SITE}"`), split.pages.map((p) => p.slug).join(","));
// The money.
check("the output side was COUNTED (one count_tokens call on the text that arrived)", state.countTokens === 1 && state.countedText.includes(`<title>Page ${MAX_PAGES_PER_SITE - 1}</title>`), `${state.countTokens} calls; counted text ${state.countedText.length} chars`);
check("exactly one usage record — the partial round", costs.callCount === 1, costs.callCount);
const rec = costs.entries?.[0] ?? costs.records?.[0] ?? costs.calls?.[0] ?? null;
const usage = rec?.usage ?? rec;
check("...whose output tokens are the counted number, not the upstream's final tally (9999) and not zero",
  usage && (usage.output_tokens === COUNTED_OUTPUT_TOKENS || usage.outputTokens === COUNTED_OUTPUT_TOKENS), JSON.stringify(rec).slice(0, 300));
check("...and whose input side came from message_start", usage && (usage.input_tokens === 10 || usage.inputTokens === 10), JSON.stringify(rec).slice(0, 300));
check("it did not wait for the whole seven-page stream", elapsed < 8000, `${elapsed}ms`);

server.close();
console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${failures.length} failed`);
process.exit(failures.length === 0 ? 0 : 1);
