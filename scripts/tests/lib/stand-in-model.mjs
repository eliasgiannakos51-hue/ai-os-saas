// THE MODEL, ANSWERED ON THIS MACHINE, in the shapes the Anthropic API
// uses — for browser checks that go through the app's own routes.
//
// The server's SDK is pointed here with ANTHROPIC_BASE_URL (the SDK reads
// it), so /api/chat, /api/websites/generate and its worker call this
// instead of the provider. Shared by scripts/tests/brand-memory.prodtest.mjs
// and scripts/tests/chat-opens-tools-edges.prodtest.mjs.
//
// What each request gets is the test's `answer(request)`:
//   { text }                 a finished message (or a stream of it, when
//                            the request asked for a stream)
//   { error: status, type }  the provider's own error body, e.g. 529
//                            overloaded_error
// Every request is kept in `seen`, so a test can say what the model was
// SENT — the name and colours a site's brief carried, for one.
import http from "node:http";

const sse = (res, event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

/** What kind of request this is, from what the app's code puts in it. */
export function requestKind(body) {
  const system = JSON.stringify(body.system ?? "");
  if (system.includes("single-file websites")) return "site";
  if (body.tool_choice?.name) return `tool:${body.tool_choice.name}`;
  if (system.includes("Εξάγεις σημαντικά")) return "memory";
  return body.stream ? "chat" : "other";
}

export async function startStandInModel(answer) {
  const seen = [];
  const server = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      let body = {};
      try { body = JSON.parse(raw || "{}"); } catch {}
      if (req.url.includes("/count_tokens")) {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ input_tokens: 1200 }));
        return;
      }
      const kind = requestKind(body);
      seen.push({ kind, body });
      const out = answer({ kind, body }) ?? { text: "Εντάξει." };
      if (out.error) {
        res.writeHead(out.error, { "Content-Type": "application/json", "request-id": "req_stand_in" });
        res.end(JSON.stringify({ type: "error", error: { type: out.type ?? "api_error", message: out.message ?? "Overloaded" } }));
        return;
      }
      const model = body.model ?? "claude-sonnet-4-6";
      const usage = { input_tokens: 900, output_tokens: 120, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 };
      if (!body.stream) {
        res.writeHead(200, { "Content-Type": "application/json", "request-id": "req_stand_in" });
        res.end(JSON.stringify({ id: "msg_stand_in", type: "message", role: "assistant", model, content: [{ type: "text", text: out.text }], stop_reason: "end_turn", stop_sequence: null, usage }));
        return;
      }
      res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive", "request-id": "req_stand_in" });
      sse(res, "message_start", { type: "message_start", message: { id: "msg_stand_in", type: "message", role: "assistant", model, content: [], stop_reason: null, stop_sequence: null, usage: { ...usage, output_tokens: 1 } } });
      sse(res, "content_block_start", { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } });
      sse(res, "content_block_delta", { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: out.text } });
      sse(res, "content_block_stop", { type: "content_block_stop", index: 0 });
      sse(res, "message_delta", { type: "message_delta", delta: { stop_reason: "end_turn", stop_sequence: null }, usage: { output_tokens: 120 } });
      sse(res, "message_stop", { type: "message_stop" });
      res.end();
    });
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  return { url: `http://127.0.0.1:${server.address().port}`, seen, close: () => server.close() };
}
