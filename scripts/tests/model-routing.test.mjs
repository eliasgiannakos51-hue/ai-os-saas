// MODEL ROUTING (V4 #34) AND THE INTELLIGENT ROUTER (V4 #35).
//
// THE FIVE THINGS THAT WOULD BE WRONG QUIETLY, and every one of them
// looks like a saving on a dashboard:
//
//   A DOWNGRADE THAT COSTS MORE. Haiku's prompt cache needs 4,096 tokens
//   of prefix; Sonnet's needs 1,024. A request with 2,000 tokens of
//   system prefix caches on Sonnet and does NOT cache on Haiku, so the
//   "cheaper" model bills 3.3x as much for that prefix on every single
//   call — while the per-token rate went down and every report says the
//   change worked. Section 2 is the arithmetic.
//
//   AN UNDER-ROUTED REQUEST. A bad answer the user paid for costs more
//   than the fraction of a cent an over-route costs us. Every default
//   must lean expensive.
//
//   AN ESCALATION THE USER PAYS FOR TWICE. They never chose the cheap
//   model; our routing did.
//
//   AN ESCALATION THAT LAUNDERS A REFUSAL. Retrying a policy refusal on
//   a stronger model is shopping for a different answer.
//
//   A ROUTER THAT OSCILLATES. Reacting to two failures out of two makes
//   the route flap and makes every measurement meaningless.
//
// Runs in the build gate; needs no API key.
//
// Run: node scripts/tests/model-routing.test.mjs
import { readFileSync } from "node:fs";
import { loadTs } from "./load-ts.mjs";

let pass = 0;
const failures = [];
const ok = (name, cond, detail) => {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { failures.push(name); console.log(`  FAIL  ${name}${detail !== undefined ? "\n        " + detail : ""}`); }
};
const eq = (name, actual, expected) =>
  ok(name, JSON.stringify(actual) === JSON.stringify(expected), `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);

const tiers = await loadTs("src/lib/ai/routing/tiers.ts");
const cls = await loadTs("src/lib/ai/routing/classify.ts");
const r = await loadTs("src/lib/ai/routing/route.ts");
const catalog = await loadTs("src/lib/ai/providers/catalog.ts");

// =====================================================================
console.log("\n== 1. THE LADDER IS REAL ==");
// =====================================================================
// A tier naming a model the catalog does not have cannot be priced,
// cannot have its cache minimum read, and would be routed to blind.
for (const [tier, modelId] of Object.entries(tiers.TIER_MODELS)) {
  ok(`${tier} names a model the catalog knows (${modelId})`, catalog.catalogModel(modelId) !== null, modelId);
}
for (const modelId of tiers.LADDER) {
  ok(`the ladder's ${modelId} is in the catalog`, catalog.catalogModel(modelId) !== null);
}
eq("four tiers", [...tiers.TIERS], ["trivial", "simple", "complex", "expert"]);
// ONE RUNG AT A TIME. Skipping to the top on any failure makes the cheap
// tiers a liability rather than a saving.
eq("haiku climbs to sonnet", tiers.nextRung("claude-haiku-4-5"), "claude-sonnet-4-6");
eq("sonnet climbs to opus", tiers.nextRung("claude-sonnet-4-6"), "claude-opus-4-6");
eq("opus is the top", tiers.nextRung("claude-opus-4-6"), null);
eq("an unknown model has no rung above it", tiers.nextRung("gpt-9"), null);
// The ladder must be genuinely ordered by price, or "escalate" means
// something other than "spend more to get a better answer".
{
  const prices = [...tiers.LADDER].map((id) => catalog.catalogModel(id).inputPerMTok);
  ok(`the ladder is ordered cheapest-first (${prices.join(" < ")})`, prices.every((p, i) => i === 0 || prices[i - 1] < p));
}

// =====================================================================
console.log("\n== 2. THE CACHE TRAP, AS ARITHMETIC ==");
// =====================================================================
// This is the specific warning in the brief, and it is not a rounding
// error: it inverts the sign of the saving.
{
  const haikuMin = catalog.catalogModel("claude-haiku-4-5").cacheMinimumTokens;
  const sonnetMin = catalog.catalogModel("claude-sonnet-4-6").cacheMinimumTokens;
  eq("haiku's cache minimum is 4096", haikuMin, 4096);
  eq("sonnet's cache minimum is 1024", sonnetMin, 1024);

  // THE DANGEROUS BAND: at or above Sonnet's minimum, below Haiku's.
  for (const prefix of [1024, 2000, 3000, 4095]) {
    const haiku = r.routeInputCostUsd("claude-haiku-4-5", prefix);
    const sonnet = r.routeInputCostUsd("claude-sonnet-4-6", prefix);
    ok(
      `at ${prefix} tokens the "cheaper" model costs MORE ($${haiku.toFixed(6)} vs $${sonnet.toFixed(6)})`,
      haiku > sonnet
    );
  }
  // Outside the band it behaves as intuition expects, which is exactly
  // why the band is invisible without measuring it.
  for (const prefix of [500, 4096, 8000]) {
    const haiku = r.routeInputCostUsd("claude-haiku-4-5", prefix);
    const sonnet = r.routeInputCostUsd("claude-sonnet-4-6", prefix);
    ok(`at ${prefix} tokens the cheaper model really is cheaper`, haiku < sonnet);
  }
  ok("an unpriced model reports null, never 0", r.routeInputCostUsd("no-such-model", 1000) === null);
}
{
  // AND THE ROUTER REFUSES THE DOWNGRADE. Detecting the trap and routing
  // into it anyway would be a comment, not a guard.
  const trapped = r.route({ feature: "text_action", prefixTokens: 2000 });
  eq("a simple request with a 2000-token prefix is NOT sent to haiku", trapped.modelId, "claude-sonnet-4-6");
  ok("…and says why", trapped.reasons.some((x) => x.startsWith("cache:downgrade-costs-more")), trapped.reasons.join(" | "));
  ok("…and reports what it would have cost", trapped.wouldHaveCostUsd > trapped.estimatedInputCostUsd);
  ok("…and that the prefix does cache where it landed", trapped.cached === true);

  const fine = r.route({ feature: "text_action", prefixTokens: 8000 });
  eq("the same request with an 8000-token prefix does go to haiku", fine.modelId, "claude-haiku-4-5");
  eq("…with no override to report", fine.wouldHaveCostUsd, null);

  const tiny = r.route({ feature: "text_action", prefixTokens: 200 });
  eq("a tiny prefix goes to haiku too", tiny.modelId, "claude-haiku-4-5");

  // THE DECISION CARRIES THE PREFIX IT WAS MADE AGAINST. The logger
  // recorded a constant 0 in its first version because the decision did
  // not carry it — which would have made every stored row claim the trap
  // could not apply, in the one table that exists to show that it does.
  eq("the decision reports the prefix it was made against", trapped.prefixTokens, 2000);
  eq("…and a zero prefix is a real zero", r.route({ feature: "chat_message" }).prefixTokens, 0);
}

// =====================================================================
console.log("\n== 3. WHEN IN DOUBT, GO UP ==");
// =====================================================================
eq("an unknown feature defaults to complex, never trivial", cls.classify({ feature: "brand_new_thing" }).tier, "complex");
ok("…and says a classifier could decide better", cls.classify({ feature: "brand_new_thing" }).needsClassifier === true);
ok("a known feature needs no classifier", cls.classify({ feature: "chat_message" }).needsClassifier === false);

// UNATTENDED WORK NEVER RUNS TRIVIAL. Nobody reads a bad answer and
// tries again — it goes into a report, an email or a database row.
eq("an unattended trivial feature is lifted to complex",
  cls.classify({ feature: "agent_template_fill", unattended: true }).tier, "complex");
eq("…and attended, it stays trivial",
  cls.classify({ feature: "agent_template_fill" }).tier, "trivial");
eq("an unattended simple feature is lifted too",
  cls.classify({ feature: "text_action", unattended: true }).tier, "complex");
// An unattended EXPERT feature must not be dragged DOWN to complex by
// the same rule — the floor is a floor, not an assignment.
eq("an unattended expert feature stays expert",
  cls.classify({ feature: "website_generate", unattended: true }).tier, "expert");

// STRUCTURED OUTPUT LIFTS THE FLOOR. Malformed JSON costs a whole second
// call, so the saving at the cheapest rung is illusory there.
eq("structured output lifts trivial to simple",
  cls.classify({ feature: "agent_template_fill", structured: true }).tier, "simple");

// SIZE IS A SIGNAL WHATEVER THE FEATURE SAYS.
eq("a huge prefix forces complex", cls.classify({ feature: "text_action", systemTokens: 9000 }).tier, "complex");
eq("…but never demotes an expert feature",
  cls.classify({ feature: "website_generate", systemTokens: 9000 }).tier, "expert");
eq("long user text forces complex", cls.classify({ feature: "text_action", text: "x".repeat(5000) }).tier, "complex");
eq("…and likewise never demotes expert",
  cls.classify({ feature: "deep_research", text: "x".repeat(5000) }).tier, "expert");

// Every rule names itself, or a routing dashboard can show what happened
// but never why, and an unexplained route cannot be tuned.
for (const input of [
  { feature: "chat_message" },
  { feature: "unknown_x" },
  { feature: "text_action", unattended: true },
  { feature: "text_action", systemTokens: 9000 },
  { feature: "text_action", text: "x".repeat(5000) },
  { feature: "agent_template_fill", structured: true },
]) {
  const c = cls.classify(input);
  ok(`every decision names its rule (${c.rule})`, typeof c.rule === "string" && c.rule.length > 3);
}

// =====================================================================
console.log("\n== 4. FIFTY MILLISECONDS IS THE BUDGET; THIS IS THE COST ==");
// =====================================================================
{
  // The deterministic path does no IO, so the whole point is that it is
  // not close to the budget. Measured rather than asserted.
  const inputs = Array.from({ length: 10_000 }, (_, i) => ({
    feature: i % 3 === 0 ? "chat_message" : i % 3 === 1 ? "text_action" : "unknown_thing",
    prefixTokens: (i * 37) % 9000,
    text: "x".repeat(i % 100),
  }));
  const started = process.hrtime.bigint();
  for (const input of inputs) r.route(input);
  const perCallMs = Number(process.hrtime.bigint() - started) / 1e6 / inputs.length;
  ok(`routing costs ${perCallMs.toFixed(4)}ms per call, budget 50ms`, perCallMs < 50);
  // A THOUSANDTH OF THE BUDGET, not merely inside it. If this ever
  // approaches 1ms something has started doing real work in a function
  // that must not.
  ok(`…and is far below it (${perCallMs.toFixed(4)}ms < 1ms)`, perCallMs < 1);
}

// =====================================================================
console.log("\n== 5. WHAT MAY ESCALATE, AND WHAT MAY NOT ==");
// =====================================================================
for (const reason of ["malformed_output", "capability_declined", "truncated", "verification_failed"]) {
  const d = r.decideEscalation({ modelId: "claude-haiku-4-5", failureReason: reason, attempts: 1 });
  ok(`${reason} escalates`, d.escalate === true, JSON.stringify(d));
  eq(`…one rung, to sonnet`, d.modelId, "claude-sonnet-4-6");
}
// A REFUSAL IS NOT WEAKNESS. Retrying it on a stronger model is shopping
// for a different answer to a question already answered correctly.
for (const reason of ["safety_refusal", "rate_limited", "auth_error", "server_error", "user_cancelled"]) {
  const d = r.decideEscalation({ modelId: "claude-haiku-4-5", failureReason: reason, attempts: 1 });
  ok(`${reason} does NOT escalate`, d.escalate === false, JSON.stringify(d));
  ok(`…and says why`, typeof d.reason === "string" && d.reason.length > 10);
}
{
  const capped = r.decideEscalation({ modelId: "claude-haiku-4-5", failureReason: "truncated", attempts: 2 });
  ok("two models for one request is the limit", capped.escalate === false, JSON.stringify(capped));
  const top = r.decideEscalation({ modelId: "claude-opus-4-6", failureReason: "truncated", attempts: 1 });
  ok("the strongest model cannot escalate", top.escalate === false, JSON.stringify(top));
}

// =====================================================================
console.log("\n== 6. CHARGED ONCE, FOR WHAT SUCCEEDED ==");
// =====================================================================
{
  const charge = r.escalationCharge([
    { modelId: "claude-haiku-4-5", succeeded: false, costUsd: 0.0004 },
    { modelId: "claude-sonnet-4-6", succeeded: true, costUsd: 0.0031 },
  ]);
  // NOT THE SUM, NOT THE MAXIMUM, NOT THE CHEAP ONE. The user never chose
  // the cheap model; our routing did, and the failed attempt is our cost.
  eq("the user pays for the attempt that worked", charge.chargeUsd, 0.0031);
  eq("…and the failed attempt is absorbed", charge.absorbedUsd, 0.0004);
  eq("…and the charged model is named", charge.chargedModel, "claude-sonnet-4-6");
}
{
  const allFailed = r.escalationCharge([
    { modelId: "claude-haiku-4-5", succeeded: false, costUsd: 0.0004 },
    { modelId: "claude-sonnet-4-6", succeeded: false, costUsd: 0.0031 },
  ]);
  // NOTHING SUCCEEDED, SO NOTHING IS CHARGED. The rule the whole billing
  // system already follows.
  eq("a wholly failed request charges nothing", allFailed.chargeUsd, 0);
  eq("…and absorbs both attempts", allFailed.absorbedUsd, 0.0035);
  eq("…and names no charged model", allFailed.chargedModel, null);
}
{
  const first = r.escalationCharge([{ modelId: "claude-haiku-4-5", succeeded: true, costUsd: 0.0004 }]);
  eq("no escalation means the cheap price stands", first.chargeUsd, 0.0004);
  eq("…with nothing absorbed", first.absorbedUsd, 0);
}

// =====================================================================
console.log("\n== 7. LEARNING, WITHOUT OSCILLATING ==");
// =====================================================================
{
  const failing = { "text_action:claude-haiku-4-5": 0.4 };
  // TWO FAILURES OUT OF TWO IS NOT EVIDENCE. Reacting to it makes the
  // route flap and makes every measurement of the change meaningless.
  const tooEarly = r.route({ feature: "text_action", successRates: failing, sampleCounts: { "text_action:claude-haiku-4-5": 2 } });
  eq("a low rate over 2 runs changes nothing", tooEarly.modelId, "claude-haiku-4-5");

  const enough = r.route({ feature: "text_action", successRates: failing, sampleCounts: { "text_action:claude-haiku-4-5": 50 } });
  eq("a low rate over 50 runs climbs a rung", enough.modelId, "claude-sonnet-4-6");
  ok("…and says what it learned", enough.reasons.some((x) => x.startsWith("learned:")), enough.reasons.join(" | "));

  // A HEALTHY RATE CHANGES NOTHING. A router that climbs on good numbers
  // is a router that always ends up at the top.
  const healthy = r.route({
    feature: "text_action",
    successRates: { "text_action:claude-haiku-4-5": 0.97 },
    sampleCounts: { "text_action:claude-haiku-4-5": 500 },
  });
  eq("a healthy rate stays put", healthy.modelId, "claude-haiku-4-5");

  // AND IT STOPS AT THE TOP rather than looping.
  const allBad = {
    "text_action:claude-haiku-4-5": 0.1,
    "text_action:claude-sonnet-4-6": 0.1,
    "text_action:claude-opus-4-6": 0.1,
  };
  const counts = { "text_action:claude-haiku-4-5": 99, "text_action:claude-sonnet-4-6": 99, "text_action:claude-opus-4-6": 99 };
  const topped = r.route({ feature: "text_action", successRates: allBad, sampleCounts: counts });
  eq("everything failing lands at the top and stops", topped.modelId, "claude-opus-4-6");
  ok("…and says it is already at the top", topped.reasons.some((x) => x.includes("already at the top")), topped.reasons.join(" | "));
}

// =====================================================================
console.log("\n== 8. THE ROUTER DOES NOT CALL ANYTHING ==");
// =====================================================================
{
  // Purity is what makes every branch above testable with no key and no
  // network, and it is what keeps the 50ms budget a non-issue.
  for (const file of [
    "src/lib/ai/routing/tiers.ts",
    "src/lib/ai/routing/classify.ts",
    "src/lib/ai/routing/route.ts",
  ]) {
    const src = readFileSync(file, "utf8");
    ok(`${file} does no IO`, !/fetch\(|createAdminClient|createClient\(|@anthropic-ai|process\.env/.test(src));
  }
  // AND THE COST MODEL IS NOT DUPLICATED. `rate = cached ? x * ratio : x`
  // in two files is two sources of truth for the number that decides
  // every route.
  const routeSrc = readFileSync("src/lib/ai/routing/route.ts", "utf8");
  ok("the router delegates its cost model to cache-policy", /prefixInputCostUsd/.test(routeSrc));
  ok("…and does not re-implement the cache ratio", !/0\.1|CACHE_READ_RATIO\s*=/.test(routeSrc));
}

console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${failures.length} failed`);
if (failures.length) { console.log(failures.map((f) => "  - " + f).join("\n")); process.exit(1); }
