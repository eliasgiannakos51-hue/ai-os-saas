// A stand-in for the Anthropic Messages API, for the browser tests that
// drive a real route to the model: the app's own SDK is pointed here with
// ANTHROPIC_BASE_URL (the SDK's documented override, as
// scripts/tests/background-jobs.prodtest.mjs and meetings.prodtest.mjs
// already do), so the route, its hold, its parsing and its refusals all
// run for real and only the provider's answer is chosen by the test.
//
// The answers are in the provider's own shapes: a `message` with text or
// with a tool_use block, and the error envelope
// {"type":"error","error":{"type":"overloaded_error",...}} on HTTP 529,
// which is what the API sends when it is overloaded and what the SDK turns
// into the error the app sees.
import http from "node:http";

/** A finished message whose content is one text block. */
export function textMessage(text, model = "claude-test") {
  return {
    status: 200,
    json: {
      id: "msg_test",
      type: "message",
      role: "assistant",
      model,
      content: [{ type: "text", text }],
      stop_reason: "end_turn",
      stop_sequence: null,
      usage: { input_tokens: 1200, output_tokens: 300 },
    },
  };
}

/** A finished message whose content is one forced tool call. */
export function toolMessage(name, input, model = "claude-test") {
  return {
    status: 200,
    json: {
      id: "msg_test",
      type: "message",
      role: "assistant",
      model,
      content: [{ type: "tool_use", id: "toolu_test", name, input }],
      stop_reason: "tool_use",
      stop_sequence: null,
      usage: { input_tokens: 1200, output_tokens: 600 },
    },
  };
}

/** The provider overloaded: HTTP 529 with the API's error envelope. */
export const OVERLOADED = {
  status: 529,
  json: { type: "error", error: { type: "overloaded_error", message: "Overloaded" } },
};

/**
 * Listens on a FIXED port (the prodtest names it, so two tests never share
 * one). `answer(body)` is asked per request and returns {status, json};
 * every request body is kept in `calls`, so a test can read what the app
 * actually sent to the model.
 */
export async function startFakeAnthropic(port, answer) {
  const calls = [];
  let respond = answer;
  const server = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      let body = null;
      try { body = JSON.parse(raw || "null"); } catch {}
      calls.push({ path: req.url, body });
      const { status, json } = respond(body, calls.length);
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(json));
    });
  });
  await new Promise((r) => server.listen(port, "127.0.0.1", r));
  return {
    url: `http://127.0.0.1:${port}`,
    calls,
    setAnswer(next) {
      respond = next;
    },
    close: () => server.close(),
  };
}

/**
 * A search-backed answer, as the API returns one when the server-side
 * web_search tool ran: a text block whose `citations` are
 * web_search_result_location entries (url, title, cited_text), and the
 * searches counted in usage.server_tool_use. lib/research/research.ts takes
 * a report's sources from exactly these blocks.
 */
export function searchMessage(text, sources, model = "claude-test") {
  return {
    status: 200,
    json: {
      id: "msg_test",
      type: "message",
      role: "assistant",
      model,
      content: [
        {
          type: "text",
          text,
          citations: sources.map((s, i) => ({ type: "web_search_result_location", url: s.url, title: s.title, cited_text: text.slice(0, 60), encrypted_index: `e${i}` })),
        },
      ],
      stop_reason: "end_turn",
      stop_sequence: null,
      usage: { input_tokens: 2400, output_tokens: 400, server_tool_use: { web_search_requests: 1 } },
    },
  };
}
