// THE BUILD GATE FOR priceUsage.
//
// It fails if any field of Anthropic's `Usage` object is unaccounted for.
//
// WHY THIS FILE EXISTS. A usage field that priceUsage does not read costs
// real money and is invisible from every dashboard we have: the charge is
// computed from the understated cost, and `achieved_margin` is computed
// from that SAME understated cost, so the row reads a perfectly healthy
// 4x. There is no alert that can see it, because every number in the
// system agrees with every other number. The only observable fact is that
// a field exists which nothing prices — so that is what this tests.
//
// It enforces three things, and the second is the one that survives us:
//
//   1. Every field the registry below calls PRICED must actually move
//      usdCost. Not "is mentioned in the source" — set it, and the price
//      has to change. A field that is read into a variable and then left
//      out of the sum would pass a grep and fail here.
//
//   2. Every field of the SDK's real `Usage` interface must appear in the
//      registry. This is what makes the gate outlive whoever wrote it: an
//      SDK upgrade that adds a billable field fails the build with the
//      field's name, instead of quietly under-charging until someone
//      compares an invoice to a dashboard.
//
//   3. Source rules for the things that change a RATE rather than adding a
//      count — a 1-hour cache_control ttl (2x, not 1.25x), a non-standard
//      service_tier, the web_fetch tool. Each is fine to use; none is fine
//      to use without pricing it.
//
// Run: node scripts/tests/usage-field-coverage.test.mjs
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

let pass = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    failures.push(name);
    console.log(`  FAIL  ${name}${detail ? "\n        " + detail : ""}`);
  }
}

const ROOT = process.cwd();
const { loadTs } = await import("./load-ts.mjs");
const pricing = await loadTs("src/lib/billing/model-pricing.ts");
const { priceUsage, MODEL_PRICING_USD, WEB_SEARCH_USD_PER_QUERY, WEB_FETCH_USD_PER_REQUEST } = pricing;

const MODEL = "claude-sonnet-4-6";
const RATES = MODEL_PRICING_USD[MODEL];

// ---------------------------------------------------------------------------
// THE REGISTRY. Every field of Anthropic's Usage object, and what we do
// with it. Adding a field here is a deliberate act; leaving one out is
// what section 2 catches.
//
//   priced     — it adds cost, and setting it must change usdCost.
//   inclusive  — its tokens are already inside another field we price.
//                Pricing it too would DOUBLE charge, which is its own bug.
//   free       — Anthropic bills nothing for it, written down as a rate.
//   rate-only  — it does not add a count, it changes the RATE of another
//                field. Enforced by the source rules in section 3.
//   ignored    — carries no billing meaning at all.
// ---------------------------------------------------------------------------
const REGISTRY = {
  input_tokens: { disposition: "priced" },
  output_tokens: { disposition: "priced" },
  cache_creation_input_tokens: { disposition: "priced" },
  cache_read_input_tokens: { disposition: "priced" },
  server_tool_use: { disposition: "priced" },
  // The TTL split of cache_creation_input_tokens. It adds no tokens — it
  // decides which of them cost 2x instead of 1.25x — but it MUST change
  // the price when the same tokens are 1-hour rather than 5-minute, and
  // that is testable, so it is treated as priced.
  cache_creation: { disposition: "priced" },
  // "output_tokens remains the inclusive, authoritative total used for
  // billing" — the SDK's own words. Pricing thinking_tokens on top would
  // charge for the same tokens twice.
  output_tokens_details: { disposition: "inclusive" },
  // standard | priority | batch. Priority is billed above the rates in
  // MODEL_PRICING_USD and batch below them, so this changes the rate of
  // every other field rather than adding one of its own.
  service_tier: { disposition: "rate-only" },
  // Which region served the request. Not a billing input.
  inference_geo: { disposition: "ignored" },
};

// ---------------------------------------------------------------------------
console.log("== 1. every PRICED field actually moves the price ==");
// A usage object with every priced field at zero. Each check below turns
// exactly ONE field on and requires the cost to rise.
const ZERO = {
  input_tokens: 0,
  output_tokens: 0,
  cache_creation_input_tokens: 0,
  cache_read_input_tokens: 0,
  cache_creation: { ephemeral_5m_input_tokens: 0, ephemeral_1h_input_tokens: 0 },
  server_tool_use: { web_search_requests: 0, web_fetch_requests: 0 },
};

check("a fully-zero usage costs nothing", priceUsage(ZERO, MODEL).usdCost === 0);

const MOVERS = {
  input_tokens: { ...ZERO, input_tokens: 1_000_000 },
  output_tokens: { ...ZERO, output_tokens: 1_000_000 },
  cache_creation_input_tokens: { ...ZERO, cache_creation_input_tokens: 1_000_000 },
  cache_read_input_tokens: { ...ZERO, cache_read_input_tokens: 1_000_000 },
  server_tool_use: { ...ZERO, server_tool_use: { web_search_requests: 10, web_fetch_requests: 0 } },
  // The SAME million cache-write tokens, declared as 1-hour rather than
  // 5-minute. If cache_creation is ignored, this prices identically to
  // cache_creation_input_tokens above and the check fails.
  cache_creation: {
    ...ZERO,
    cache_creation_input_tokens: 1_000_000,
    cache_creation: { ephemeral_5m_input_tokens: 0, ephemeral_1h_input_tokens: 1_000_000 },
  },
};

for (const [field, entry] of Object.entries(REGISTRY)) {
  if (entry.disposition !== "priced") continue;
  const usage = MOVERS[field];
  check(
    `${field}: has a case that changes usdCost`,
    usage !== undefined,
    "add it to MOVERS — a priced field with no case is an untested one"
  );
  if (!usage) continue;
  const baseline =
    field === "cache_creation"
      ? priceUsage({ ...ZERO, cache_creation_input_tokens: 1_000_000 }, MODEL).usdCost
      : 0;
  const priced = priceUsage(usage, MODEL).usdCost;
  check(
    `${field}: priced above its baseline ($${priced.toFixed(4)} > $${baseline.toFixed(4)})`,
    priced > baseline + 1e-12,
    "priceUsage does not read this field, or reads it and leaves it out of the sum"
  );
}

console.log("\n== 1b. the rates are the published ones, not just non-zero ==");
check(
  `input: $${RATES.inputPerMTok}/MTok`,
  Math.abs(priceUsage({ input_tokens: 1_000_000 }, MODEL).usdCost - RATES.inputPerMTok) < 1e-9
);
check(
  `output: $${RATES.outputPerMTok}/MTok`,
  Math.abs(priceUsage({ output_tokens: 1_000_000 }, MODEL).usdCost - RATES.outputPerMTok) < 1e-9
);
check(
  "5-minute cache write is 1.25x input",
  Math.abs(
    priceUsage({ cache_creation_input_tokens: 1_000_000 }, MODEL).usdCost -
      RATES.inputPerMTok * 1.25
  ) < 1e-9
);
check(
  "1-hour cache write is 2x input, NOT 1.25x",
  Math.abs(
    priceUsage(
      {
        cache_creation_input_tokens: 1_000_000,
        cache_creation: { ephemeral_1h_input_tokens: 1_000_000, ephemeral_5m_input_tokens: 0 },
      },
      MODEL
    ).usdCost -
      RATES.inputPerMTok * 2
  ) < 1e-9
);
check(
  "cache read is 0.1x input",
  Math.abs(
    priceUsage({ cache_read_input_tokens: 1_000_000 }, MODEL).usdCost - RATES.inputPerMTok * 0.1
  ) < 1e-9
);
check(
  "a web search is $0.01",
  Math.abs(
    priceUsage({ server_tool_use: { web_search_requests: 1 } }, MODEL).usdCost -
      WEB_SEARCH_USD_PER_QUERY
  ) < 1e-12
);
check("the web-fetch rate is declared (may be zero)", typeof WEB_FETCH_USD_PER_REQUEST === "number");

console.log("\n== 1c. the two cache-write fields are not DOUBLE counted ==");
// cache_creation is the TTL split OF cache_creation_input_tokens, not an
// addition to it. Adding them would over-charge by exactly 2x on every
// cached call — the mirror image of the bug this file guards against, and
// just as invisible.
const mixed = priceUsage(
  {
    cache_creation_input_tokens: 1_000_000,
    cache_creation: { ephemeral_5m_input_tokens: 600_000, ephemeral_1h_input_tokens: 400_000 },
  },
  MODEL
);
const expectedMixed = (600_000 / 1e6) * RATES.inputPerMTok * 1.25 + (400_000 / 1e6) * RATES.inputPerMTok * 2;
check(
  `600k@5m + 400k@1h costs $${expectedMixed.toFixed(4)}, not the sum of both fields`,
  Math.abs(mixed.usdCost - expectedMixed) < 1e-9,
  `got $${mixed.usdCost.toFixed(6)}`
);
check(
  "the reported totals add back to the 1M Anthropic billed us for",
  mixed.cacheWriteTokens + mixed.cacheWrite1hTokens === 1_000_000
);
// A response that reports the total but no breakdown must still price
// every token — older API versions and the streaming accumulator both do
// this.
const noBreakdown = priceUsage({ cache_creation_input_tokens: 1_000_000 }, MODEL);
check(
  "a total with no TTL breakdown is still fully priced, at the 5m rate",
  noBreakdown.cacheWriteTokens === 1_000_000 && noBreakdown.cacheWrite1hTokens === 0
);
// And a breakdown with no total — the safe direction is to trust the
// larger of the two, never to charge nothing.
const noTotal = priceUsage(
  { cache_creation: { ephemeral_5m_input_tokens: 0, ephemeral_1h_input_tokens: 500_000 } },
  MODEL
);
check(
  "a breakdown with no total is priced rather than dropped",
  noTotal.cacheWrite1hTokens === 500_000 && noTotal.usdCost > 0
);

// ---------------------------------------------------------------------------
console.log("\n== 2. the registry covers the SDK's real Usage type ==");
// Read from the installed SDK, not from a copy of it. That is the whole
// point: the next `npm update @anthropic-ai/sdk` that adds a billable
// field has to fail HERE, with the field's name, rather than in a month's
// margin report.
const SDK_DTS = path.join(ROOT, "node_modules/@anthropic-ai/sdk/resources/messages/messages.d.ts");
check(
  "the Anthropic SDK types are installed (this gate needs them)",
  existsSync(SDK_DTS),
  `expected ${SDK_DTS} — run npm ci`
);

if (existsSync(SDK_DTS)) {
  const dts = readFileSync(SDK_DTS, "utf8");
  // The `Usage` interface body, up to its closing brace at column 0.
  const body = dts.match(/^export interface Usage \{\n([\s\S]*?)^\}/m)?.[1] ?? "";
  check("the Usage interface was located in the SDK types", body.length > 0);
  const sdkFields = [...body.matchAll(/^ {4}([a-z_0-9]+)\??:/gm)].map((m) => m[1]);
  check(`the SDK's Usage has ${sdkFields.length} fields`, sdkFields.length >= 5, sdkFields.join(", "));

  for (const field of sdkFields) {
    check(
      `SDK field "${field}" is accounted for in the registry`,
      Object.prototype.hasOwnProperty.call(REGISTRY, field),
      `Anthropic's Usage carries "${field}" and nothing in this repo decides what it costs.\n` +
        `        Add it to REGISTRY in this file with a disposition, and to priceUsage if it is billable.`
    );
  }

  // The reverse direction: a registry entry for a field the SDK dropped is
  // dead weight that makes the gate look more thorough than it is.
  for (const field of Object.keys(REGISTRY)) {
    check(
      `registry field "${field}" still exists in the SDK`,
      sdkFields.includes(field),
      "the SDK no longer reports this — remove it from REGISTRY"
    );
  }

  // AnthropicUsageLike is what priceUsage is allowed to see. A field that
  // is priced but missing from the type cannot be passed in by a caller.
  const src = readFileSync(path.join(ROOT, "src/lib/billing/model-pricing.ts"), "utf8");
  const shape = src.match(/export type AnthropicUsageLike = \{([\s\S]*?)^\};/m)?.[1] ?? "";
  for (const [field, entry] of Object.entries(REGISTRY)) {
    if (entry.disposition === "ignored" || entry.disposition === "inclusive") continue;
    check(
      `AnthropicUsageLike declares "${field}"`,
      new RegExp(`^\\s*${field}\\??:`, "m").test(shape),
      "priceUsage cannot read a field its input type does not have"
    );
  }
}

// ---------------------------------------------------------------------------
console.log("\n== 3. the rate-changing switches cannot be turned on unpriced ==");
// These do not add a field to usage — they change what the existing
// fields cost. A grep is the right tool: the failure is someone WRITING
// `ttl: "1h"` in a request, months from now, with no idea that the price
// of a cache write doubles when they do.
function sourceFiles(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      sourceFiles(full, out);
    } else if (/\.tsx?$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}
const files = sourceFiles(path.join(ROOT, "src"));
check(`scanned ${files.length} source files`, files.length > 100);

const oneHourTtl = [];
const priorityTier = [];
const webFetchTool = [];
for (const file of files) {
  const text = readFileSync(file, "utf8");
  const rel = path.relative(ROOT, file);
  // `ttl: "1h"` inside a cache_control block. Fine to use — but only
  // because priceUsage now charges 2x for it.
  if (/ttl\s*:\s*["']1h["']/.test(text)) oneHourTtl.push(rel);
  // Requesting a non-standard tier. MODEL_PRICING_USD holds standard rates
  // only.
  if (/service_tier\s*:\s*["'](?!standard)[a-z]+["']/.test(text)) priorityTier.push(rel);
  // Offering the web_fetch server tool.
  if (/type\s*:\s*["']web_fetch_[0-9]{8}["']/.test(text)) webFetchTool.push(rel);
}

// 1-hour caching is ALLOWED, because it is now priced. The gate is that
// pricing exists, not that the feature is banned.
check(
  "1-hour cache writes are priced at 2x, so using them is safe",
  Math.abs(RATES.cacheWrite1hPerMTok - RATES.inputPerMTok * 2) < 1e-9,
  `files using ttl:"1h": ${oneHourTtl.join(", ") || "(none yet)"}`
);
check(
  "no source requests a service_tier MODEL_PRICING_USD does not price",
  priorityTier.length === 0,
  `priority/batch tier requested in: ${priorityTier.join(", ")}.\n` +
    "        Those tiers are billed off the standard rates in MODEL_PRICING_USD — add rates before using one."
);
check(
  "the web_fetch server tool is either unused or priced",
  webFetchTool.length === 0 || WEB_FETCH_USD_PER_REQUEST > 0,
  `web_fetch offered in: ${webFetchTool.join(", ")} while WEB_FETCH_USD_PER_REQUEST is 0`
);

// The tier guard has to work at RUNTIME too — the model can be served on a
// tier we never asked for.
check(
  "usage served on a priority tier is flagged as unpriced",
  pricing.isUnpricedServiceTier({ service_tier: "priority" }) === true
);
check(
  "standard is not flagged",
  pricing.isUnpricedServiceTier({ service_tier: "standard" }) === false
);
check("a missing tier is not flagged", pricing.isUnpricedServiceTier({}) === false);

// ---------------------------------------------------------------------------
console.log("\n== 4. the accumulator carries every priced field through ==");
const { CostAccumulator } = await loadTs("src/lib/billing/cost-accumulator.ts");
const acc = new CostAccumulator();
const RICH = {
  input_tokens: 10_000,
  output_tokens: 2_000,
  cache_creation_input_tokens: 8_000,
  cache_creation: { ephemeral_5m_input_tokens: 5_000, ephemeral_1h_input_tokens: 3_000 },
  cache_read_input_tokens: 40_000,
  server_tool_use: { web_search_requests: 2, web_fetch_requests: 1 },
};
acc.record("generation", RICH, MODEL);
const totals = acc.totals();
const direct = priceUsage(RICH, MODEL);
check("the accumulator's total equals the priced call", Math.abs(totals.usdCost - direct.usdCost) < 1e-12);
check("the 1-hour slice survives into totals", totals.cacheWrite1hTokens === 3_000);
check("the 5-minute slice survives into totals", totals.cacheWriteTokens === 5_000);
check("web fetches survive into totals", totals.webFetches === 1);

// A snapshot written by an EARLIER deploy has no cacheWrite1hTokens key.
// `+ undefined` would make the whole total NaN, and a NaN cost settles as
// zero credits — the silent under-charge in its purest form.
const legacy = CostAccumulator.restore([
  {
    stage: "generation",
    model: MODEL,
    usage: {
      inputTokens: 1000,
      outputTokens: 500,
      cacheWriteTokens: 200,
      cacheReadTokens: 100,
      webSearches: 1,
      usdCost: 0.0123,
    },
  },
]);
const legacyTotals = legacy.totals();
check(
  "a pre-upgrade snapshot restores to a finite cost, not NaN",
  Number.isFinite(legacyTotals.usdCost) && Math.abs(legacyTotals.usdCost - 0.0123) < 1e-12,
  `got ${legacyTotals.usdCost}`
);
check(
  "and its missing fields read as 0, not undefined",
  legacyTotals.cacheWrite1hTokens === 0 && legacyTotals.webFetches === 0
);

// ---------------------------------------------------------------------------
console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${failures.length} failed`);
if (failures.length) {
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
