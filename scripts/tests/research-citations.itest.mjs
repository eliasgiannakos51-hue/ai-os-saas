// The half of the citations claim that a build gate cannot make: the
// Anthropic adapter, loaded WITH its vendor SDK, called against a stubbed
// fetch, and the sources read back off what it returns.
//
// WHY THIS IS NOT IN ai-providers.test.mjs. scripts/tests/load-ts.mjs
// refuses a module that imports a bare package, and
// scripts/tests/billing-coverage.test.mjs forbids loadTsWithDeps in any
// *.test.mjs on purpose: a build gate must not depend on node_modules.
// So the build gate runs the MAPPING (lib/ai/providers/citations.ts,
// §5d there) and reads the one line that calls it; this file runs the
// line. Both halves or neither — a mapper nobody calls is as useless as
// a call to a mapper nobody checked.
//
// WHAT IT PROVES, exactly: that a real Anthropic response body, in the
// shape the API sends, comes back out of callAnthropic as sources; that
// `[]` and ABSENT are different answers from different providers; and
// that the three adapters with no web access refuse a research request
// rather than answering it unsourced.
//
// Run: node scripts/tests/research-citations.itest.mjs
const { loadTsWithDeps, loadTs } = await import("./load-ts.mjs");

let pass = 0;
let fail = 0;
function check(name, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    fail++;
    console.log(`  FAIL  ${name}\n        expected ${e}\n        actual   ${a}`);
  }
}

const REQUEST = {
  purpose: "research",
  system: [{ type: "text", text: "You research one question." }],
  messages: [{ role: "user", content: "What is the capital of Greece?" }],
  maxTokens: 64,
  serverWebSearch: { maxUses: 3 },
  requires: ["server_web_search"],
};

/** Call an adapter with fetch stubbed; give back what it returned and the
 *  body it posted. */
async function callWith(mod, exportName, model, reply, request = REQUEST) {
  const real = globalThis.fetch;
  let body = null;
  globalThis.fetch = async (input, init) => {
    const raw = init?.body ?? (typeof input === "object" && input?.body ? await input.clone().text() : null);
    try {
      body = raw ? JSON.parse(raw) : null;
    } catch {
      body = "unparsed";
    }
    return new Response(JSON.stringify(reply), { status: 200, headers: { "Content-Type": "application/json" } });
  };
  try {
    return { out: await mod[exportName]({ apiKey: "k", model, signal: AbortSignal.timeout(20_000), request }), body };
  } finally {
    globalThis.fetch = real;
  }
}

// ---------------------------------------------------------------------
console.log("== Anthropic: a real response body becomes sources ==");
// ---------------------------------------------------------------------
{
  const anthropic = await loadTsWithDeps("src/lib/ai/providers/adapters/anthropic.ts");
  const cite = (url, title) => ({
    type: "web_search_result_location",
    url,
    title,
    cited_text: "Athens is the capital of Greece.",
    encrypted_index: "abc",
  });
  const { out, body } = await callWith(anthropic, "callAnthropic", "claude-sonnet-4-6", {
    id: "msg_01",
    type: "message",
    role: "assistant",
    model: "claude-sonnet-4-6-20260301",
    content: [
      { type: "server_tool_use", id: "srvtoolu_1", name: "web_search", input: { query: "capital of greece" } },
      {
        type: "web_search_tool_result",
        tool_use_id: "srvtoolu_1",
        content: [{ type: "web_search_result", url: "https://looked-at.example/page", title: "Looked at, not used" }],
      },
      {
        type: "text",
        text: "Athens.",
        citations: [cite("https://britannica.example/athens", "Athens | Britannica"), cite("https://britannica.example/athens", "Athens | Britannica")],
      },
      { type: "text", text: " It has been since 1834.", citations: [cite("https://history.example/1834", "1834")] },
    ],
    stop_reason: "end_turn",
    usage: { input_tokens: 1200, output_tokens: 40, server_tool_use: { web_search_requests: 2 } },
  });

  // A FLOOR UNDER THE PROBE. An adapter that never called fetch would
  // leave `body` null and every assertion below it would be about
  // nothing.
  check("the probe captured a request body", body !== null && typeof body === "object", true);
  check("...and it asked for the web search", body?.tools?.some((t) => t.name === "web_search"), true);

  check("the two text blocks' citations arrive as sources", out.citations?.map((c) => c.url), [
    "https://britannica.example/athens",
    "https://history.example/1834",
  ]);
  check("...with their titles", out.citations?.map((c) => c.title), ["Athens | Britannica", "1834"]);
  check("the page the search merely FETCHED is not among them",
    out.citations?.some((c) => c.url.includes("looked-at")), false);
  check("the prose still arrives", out.text, "Athens.\n It has been since 1834.");
  check("and the searches are counted for the cap", out.usage?.server_tool_use?.web_search_requests, 2);

  // `[]` IS AN ANSWER. Anthropic can report citations, so none means the
  // searches found nothing worth citing — which research.ts is allowed
  // to believe, unlike an absent field.
  const { out: nothing } = await callWith(anthropic, "callAnthropic", "claude-sonnet-4-6", {
    id: "msg_02",
    type: "message",
    role: "assistant",
    model: "claude-sonnet-4-6",
    content: [{ type: "text", text: "I could not find anything." }],
    stop_reason: "end_turn",
    usage: { input_tokens: 10, output_tokens: 8 },
  });
  check("an answer with no citations carries an EMPTY list", nothing.citations, []);
  check("...not an absent one", "citations" in nothing, true);
}

// ---------------------------------------------------------------------
console.log("\n== The three that cannot search refuse, rather than answer unsourced ==");
// ---------------------------------------------------------------------
{
  const OTHERS = [
    ["openai", "src/lib/ai/providers/adapters/openai.ts", "callOpenAi", "openai/gpt-5",
      { choices: [{ message: { content: "Athens." } }], usage: {} }],
    ["google", "src/lib/ai/providers/adapters/google.ts", "callGoogle", "google/gemini-2.5-flash",
      { candidates: [{ content: { parts: [{ text: "Athens." }] } }], usageMetadata: {} }],
    ["groq", "src/lib/ai/providers/adapters/groq.ts", "callGroq", "groq/llama-3.3-70b-versatile",
      { choices: [{ message: { content: "Athens." } }], usage: {} }],
  ];
  for (const [name, file, exportName, model, reply] of OTHERS) {
    const mod = await loadTsWithDeps(file);

    let refused = null;
    try {
      await callWith(mod, exportName, model, reply);
    } catch (err) {
      refused = err;
    }
    check(`${name}: a request carrying serverWebSearch is refused`, refused !== null, true);
    check(`${name}: ...as a 400, which does not fail over to another unsearchable provider`,
      refused?.status ?? refused?.statusCode ?? null, 400);

    // AND WITHOUT THE SEARCH IT ANSWERS NORMALLY — with no citations
    // field at all. This is the half that makes the line above mean
    // something: the refusal is about the search, not about the adapter
    // being broken.
    const plain = { ...REQUEST };
    delete plain.serverWebSearch;
    delete plain.requires;
    const { out } = await callWith(mod, exportName, model, reply, plain);
    check(`${name}: an ordinary answer arrives`, out.text, "Athens.");
    check(`${name}: ...and the citations key is ABSENT, not empty`, "citations" in out, false);
  }
}

// ---------------------------------------------------------------------
console.log("\n== And the whole path: a question in, sources out ==");
// ---------------------------------------------------------------------
//
// THE PART NOTHING ELSE COVERS. §5d of the build gate runs the mapper
// and reads the two lines that join it to the adapter and to the
// report. This runs the join: researchQuestion -> runCompletion ->
// resolveChain -> the lazily imported Anthropic adapter -> the mapper ->
// finding.sources, with only the network replaced.
{
  const previous = {
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    GOOGLE_API_KEY: process.env.GOOGLE_API_KEY,
    GROQ_API_KEY: process.env.GROQ_API_KEY,
  };
  // The key is set HERE rather than inherited: a machine without one
  // would otherwise leave the chain empty and every check below would
  // pass on an unanswered question. The other three are removed so a
  // deliberate failure cannot fail over to a real provider over the
  // real network.
  process.env.ANTHROPIC_API_KEY = "test-key-not-a-real-one";
  delete process.env.OPENAI_API_KEY;
  delete process.env.GOOGLE_API_KEY;
  delete process.env.GROQ_API_KEY;

  const research = await loadTsWithDeps("src/lib/research/research.ts");
  const { CostAccumulator } = await loadTsWithDeps("src/lib/billing/cost-accumulator.ts");

  const reply = {
    id: "msg_03",
    type: "message",
    role: "assistant",
    model: "claude-sonnet-4-6",
    content: [
      {
        type: "text",
        text: "Athens has been the capital since 1834.",
        citations: [
          { type: "web_search_result_location", url: "https://britannica.example/athens", title: "Athens | Britannica" },
          { type: "web_search_result_location", url: "https://history.example/1834", title: "1834" },
        ],
      },
    ],
    stop_reason: "end_turn",
    usage: { input_tokens: 1500, output_tokens: 60, server_tool_use: { web_search_requests: 3 } },
  };

  const real = globalThis.fetch;
  let posted = null;
  let calls = 0;
  globalThis.fetch = async (input, init) => {
    calls++;
    try {
      posted = JSON.parse(init?.body ?? "null");
    } catch {
      posted = "unparsed";
    }
    return new Response(JSON.stringify(reply), { status: 200, headers: { "Content-Type": "application/json" } });
  };
  let result;
  const costs = new CostAccumulator();
  try {
    result = await research.researchQuestion({
      topic: "Greece",
      question: { question: "What is the capital of Greece?", why: "the obvious one" },
      language: "en",
      costs,
      userId: "u-1",
    });
  } finally {
    globalThis.fetch = real;
    for (const [k, v] of Object.entries(previous)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }

  check("exactly one model call was made", calls, 1);
  check("...to Anthropic, with the web search on",
    posted?.tools?.some((t) => t.name === "web_search"), true);
  check("the finding is not marked failed", Boolean(result.finding.failed), false);
  check("the summary is the model's prose", result.finding.summary, "Athens has been the capital since 1834.");
  check("BOTH sources arrive under the finding", result.finding.sources.map((s) => s.url), [
    "https://britannica.example/athens",
    "https://history.example/1834",
  ]);
  check("...with their titles, which is what the report prints",
    result.finding.sources.map((s) => s.title), ["Athens | Britannica", "1834"]);
  check("the searches are counted against the cap", result.searches, 3);
  check("and the call was recorded onto the accumulator", costs.snapshot().length, 1);
}

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
