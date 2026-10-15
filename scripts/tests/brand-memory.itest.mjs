/*
 * FROM WHAT THE PERSON SAID IN CHAT TO WHAT THE SITE MODEL IS SENT
 * (package 6), through the REAL extractor and the REAL site generator,
 * against a fake model on a local port.
 *
 * 1. Chat: the person says the business name and its colours. The real
 *    extractAndStoreMemory, with the switch on, sends the brand rule to the
 *    model; the fake answers the way the rule asks; three rows are
 *    recorded through chat_memory_record.
 * 2. Site: those rows, read back newest first as lib/memory/store.ts reads
 *    them, become the brief (lib/memory/brand.ts), and the real
 *    generateWebsiteHtml sends the model a request that carries the name
 *    and both colours as exact hex values — for a brief that names
 *    neither.
 * 3. Without the switch the extractor sends the prompt as before and
 *    records one row.
 *
 * Run: node scripts/tests/brand-memory.itest.mjs
 */
import http from "node:http";

let pass = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { failures.push(name); console.log(`  FAIL  ${name}${detail !== undefined ? "\n        " + String(detail).slice(0, 400) : ""}`); }
}
const sse = (res, event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

const EXTRACTED = "Τον λένε Ηλία.\nΕπιχείρηση: «Αύρα Camping».\nΧρώματα επιχείρησης: ναυτικό μπλε και χρυσό";
const SITE = "<!DOCTYPE html>\n<html lang=\"el\">\n<head>\n<meta charset=\"utf-8\">\n<title>Αύρα Camping</title>\n</head>\n<body>\n<header><h1>Αύρα Camping</h1></header>\n<main><section><p>Σκηνές δίπλα στη θάλασσα.</p></section></main>\n<footer><p>2026</p></footer>\n</body>\n</html>\n";
const seen = { extraction: [], generation: [] };

const server = http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    const parsed = JSON.parse(body || "{}");
    if (req.url.endsWith("/count_tokens")) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ input_tokens: 100 }));
      return;
    }
    if (!parsed.stream) {
      seen.extraction.push(parsed);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        id: "msg_mem", type: "message", role: "assistant", model: parsed.model,
        content: [{ type: "text", text: EXTRACTED }], stop_reason: "end_turn", stop_sequence: null,
        usage: { input_tokens: 50, output_tokens: 30 },
      }));
      return;
    }
    seen.generation.push(parsed);
    res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
    sse(res, "message_start", { type: "message_start", message: { id: "msg_site", type: "message", role: "assistant", model: parsed.model, content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 10, output_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 } } });
    sse(res, "content_block_start", { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } });
    sse(res, "content_block_delta", { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: SITE } });
    sse(res, "content_block_stop", { type: "content_block_stop", index: 0 });
    sse(res, "message_delta", { type: "message_delta", delta: { stop_reason: "end_turn", stop_sequence: null }, usage: { output_tokens: 200 } });
    sse(res, "message_stop", { type: "message_stop" });
    res.end();
  });
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
process.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${server.address().port}`;
process.env.ANTHROPIC_API_KEY = "sk-ant-test";
// AND NO SECOND PROVIDER, whatever this machine happens to hold. The
// extractor went onto the router, failover is on by default, and a
// GROQ_API_KEY sitting in the environment would send this test's
// prompts to a real provider over the network the moment the local
// server answered anything but 200. See CLAUDE.md, «The build that
// matters is the one in CI».
delete process.env.OPENAI_API_KEY;
delete process.env.GOOGLE_API_KEY;
delete process.env.GROQ_API_KEY;
delete process.env.AI_PROVIDER_ORDER;
for (const name of Object.keys(process.env)) {
  if (name.startsWith("AI_PROVIDER_ORDER_")) delete process.env[name];
}
// The daily-spend counter the extractor bumps writes through the admin
// client; here it writes to a port that answers everything with nothing.
const nowhere = http.createServer((req, res) => { req.resume(); res.writeHead(200, { "Content-Type": "application/json" }); res.end("[]"); });
await new Promise((r) => nowhere.listen(0, "127.0.0.1", r));
process.env.NEXT_PUBLIC_SUPABASE_URL = `http://127.0.0.1:${nowhere.address().port}`;
process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-test";

const { loadTsWithDeps } = await import("./load-ts.mjs");
const memory = await loadTsWithDeps("src/lib/chat/memory.ts");
const brand = await loadTsWithDeps("src/lib/memory/brand.ts");
const wb = await loadTsWithDeps("src/lib/website-builder.ts");
const { CostAccumulator } = await loadTsWithDeps("src/lib/billing/cost-accumulator.ts");

// THE SYSTEM PROMPT ARRIVES AS BLOCKS, NOT AS A STRING. The router
// (lib/ai/providers/complete.ts) sends `system` as an array of text
// blocks so the cache breakpoints lib/ai/cached-system.ts places survive
// the wire; the Anthropic API accepts both shapes, and this file used to
// read the string one. `String([{type,text}])` is "[object Object]",
// which is exactly as long as it is useless: the POSITIVE check below
// would have gone red and said so, but the NEGATIVE one — "the
// extractor's prompt is as before" — would have passed on an empty
// reading, for ever. Hence the join, and hence the floor each check
// carries that the text it searched was not empty.
const systemText = (sent) => {
  const system = sent?.system;
  if (typeof system === "string") return system;
  if (!Array.isArray(system)) return "";
  return system.map((block) => (typeof block?.text === "string" ? block.text : "")).join("\n");
};

function fakeSupabase() {
  const recorded = [];
  return { recorded, rpc: async (name, args) => { recorded.push({ name, args }); return { data: null, error: null }; } };
}
const turn = (db, on) => memory.extractAndStoreMemory({
  apiKey: "sk-ant-test",
  supabase: db,
  userId: "11111111-1111-4111-8111-111111111111",
  conversationId: "22222222-2222-4222-8222-222222222222",
  userMessage: "Η επιχείρησή μου λέγεται Αύρα Camping και τα χρώματά της είναι ναυτικό μπλε και χρυσό.",
  assistantMessage: "Ωραία, το κράτησα.",
  costs: new CostAccumulator(),
  brand: on,
});

try {
  console.log("== 1. Chat, with the switch on ==");
  const db = fakeSupabase();
  await turn(db, true);
  const system = systemText(seen.extraction[0]);
  check("the extractor was asked at all, with a prompt that is not empty", system.length > 0, `${seen.extraction.length} call(s), system ${system.length} chars`);
  check("the extractor asked for the name line and the colours line", system.includes(brand.BRAND_NAME_PREFIX) && system.includes(brand.BRAND_COLOURS_PREFIX));
  const texts = db.recorded.map((r) => r.args.p_memory_text);
  check("three rows recorded, through chat_memory_record", db.recorded.length === 3 && db.recorded.every((r) => r.name === "chat_memory_record"), JSON.stringify(texts));
  check("...one of them the name, one the colours", texts.includes("Επιχείρηση: Αύρα Camping") && texts.includes("Χρώματα επιχείρησης: ναυτικό μπλε και χρυσό"));

  console.log("\n== 2. Site, for a brief that names neither ==");
  const stored = [...texts].reverse().map((text) => ({ text }));
  const description = "Φτιάξε μου site για το camping μου στη Νάξο.";
  const { brief, used } = brand.brandBriefFor(brand.readBrand(stored), description);
  await wb.generateWebsiteHtml("sk-ant-test", `${description}${brief}`, undefined, () => {}, undefined, new CostAccumulator());
  const request = JSON.stringify(seen.generation[0] ?? {});
  check("the site model was called", seen.generation.length >= 1);
  check("...and sent the business name", request.includes("Αύρα Camping"));
  check("...and the primary colour as an exact hex", request.includes("PRIMARY COLOUR: exactly #1f2a44"));
  check("...and the secondary colour as an exact hex", request.includes("SECONDARY COLOUR: exactly #c9a227"));
  check("...and the screen is told what was used", used.name === "Αύρα Camping" && used.colours.join(",") === "ναυτικό μπλε,χρυσό");

  console.log("\n== 3. Chat, with the switch off ==");
  seen.extraction.length = 0;
  const off = fakeSupabase();
  await turn(off, false);
  const systemOff = systemText(seen.extraction[0]);
  check("the extractor's prompt is as before", systemOff.length > 0 && !systemOff.includes(brand.BRAND_NAME_PREFIX), `system ${systemOff.length} chars`);
  check("...and the answer is one row, as before", off.recorded.length === 1 && off.recorded[0].args.p_memory_text === EXTRACTED);
} catch (err) {
  check("the run completed", false, err?.stack ?? err);
} finally {
  server.close();
  nowhere.close();
}

console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILED"}: ${pass} passed, ${failures.length} failed`);
process.exit(failures.length === 0 ? 0 : 1);
