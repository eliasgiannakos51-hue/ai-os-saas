// AGENT DEPTH TIERS AND THE TEMPLATE LIBRARY (V4 #21 + #22).
//
// THE TWO THINGS THAT WOULD BE WRONG QUIETLY:
//
//   A TIER THAT IS HELD AT ONE PRICE AND RUN AT ANOTHER. The hold is
//   sized from an estimate profile; the run is what the runner actually
//   does. If a tier's ten searches are held for and four are run, the
//   user is over-held and nobody notices. If four are held for and ten
//   are run, settlement charges more than was ever reserved — which is
//   the balance-goes-negative case the three-phase billing exists to
//   prevent. Both directions are checked below, from the SPECS, so the
//   profile and the runner cannot disagree.
//
//   A "CHEAPER" ROUTE THAT IS ONLY CHEAPER FOR US. Adopting a template
//   must cost less because LESS WORK IS DONE, not because a discount was
//   applied to the same work. The margin proof is the whole of section 5:
//   every tier and both build paths, over a sweep of real costs, at or
//   above 4x — because the formula that charges is the one being
//   exercised, not a claim about it.
//
// Run: node scripts/tests/agent-depth.test.mjs
import { readFileSync } from "node:fs";
import { loadTs } from "./load-ts.mjs";

let pass = 0;
const failures = [];
const ok = (name, cond, detail) => {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { failures.push(name); console.log(`  FAIL  ${name}${detail !== undefined ? "\n        " + detail : ""}`); }
};

const depth = await loadTs("src/lib/agents/agent-depth.ts");
const templates = await loadTs("src/lib/agents/agent-templates.ts");
const estimate = await loadTs("src/lib/billing/estimate.ts");
const pricing = await loadTs("src/lib/billing/pricing-config.ts");
const formula = await loadTs("src/lib/billing/credit-formula.ts");
const modelPricing = await loadTs("src/lib/billing/model-pricing.ts");
const marginPolicy = await loadTs("src/lib/billing/margin-policy.ts");
const unicode = await loadTs("src/lib/text/unicode-patterns.ts");

const {
  AGENT_DEPTHS, AGENT_DEPTH_SPECS, AGENT_DEPTH_SECONDS, isAgentDepth, parseAgentDepth,
  DEFAULT_AGENT_DEPTH, agentMaxSteps, agentMaxSources, searchesForRound,
  suggestAgentDepth, TEMPLATE_FILL_MODEL, AGENT_BUILDER_MODEL,
} = depth;
const {
  TEMPLATE_SLOT, BUILT_IN_TEMPLATES, findBuiltInTemplate, fillTemplate,
  anonymiseTaskPrompt, validateShareableTemplate, scoreTemplateMatch,
  MIN_PATTERN_CHARS, TEMPLATE_LIMITS, SHARE_REFUSAL_REASONS,
} = templates;

const CONFIG = pricing.resolvePricingConfig();
const runnerSrc = readFileSync("src/lib/agents/agent-runner.ts", "utf8");
const executeSrc = readFileSync("src/lib/agents/execute-agent.ts", "utf8");
const builderSrc = readFileSync("src/lib/agents/agent-builder.ts", "utf8");
const migrationSql = readFileSync("supabase/migrations/20260826000000_agent_templates.sql", "utf8");
const adoptSrc = readFileSync("src/app/api/agents/templates/adopt/route.ts", "utf8");
const shareSrc = readFileSync("src/app/api/agents/templates/share/route.ts", "utf8");
const runRouteSrc = readFileSync("src/app/api/agents/[id]/run/route.ts", "utf8");
const pickerSrc = readFileSync("src/components/agents/depth-picker.tsx", "utf8");
const matchesSrc = readFileSync("src/components/agents/template-matches.tsx", "utf8");

console.log("1. The tiers");
{
  ok("three tiers, no duplicates", AGENT_DEPTHS.length === 3 && new Set(AGENT_DEPTHS).size === 3);
  ok("they run cheapest first", AGENT_DEPTHS.join(",") === "simple,standard,deep");
  for (const d of AGENT_DEPTHS) ok(`isAgentDepth("${d}")`, isAgentDepth(d));
  for (const bad of ["Simple", "SIMPLE", "", " deep", "exhaustive", "__proto__", null, 1, {}, ["deep"]]) {
    ok(`isAgentDepth rejects ${JSON.stringify(bad) ?? String(bad)}`, isAgentDepth(bad) === false);
  }

  // THE DEFAULT IS LOAD-BEARING. Every agent that existed before this
  // field ran with Sonnet, four searches, one research pass and a
  // 3,000-token answer. Any other default silently changes what those
  // agents do and cost, on a schedule, without anybody asking.
  ok("the default is standard", DEFAULT_AGENT_DEPTH === "standard");
  ok("standard is Sonnet", AGENT_DEPTH_SPECS.standard.model === "claude-sonnet-4-6");
  ok("...with four searches", AGENT_DEPTH_SPECS.standard.maxSearches === 4);
  ok("...one research pass", AGENT_DEPTH_SPECS.standard.researchRounds === 1);
  ok("...and a 3,000-token answer", AGENT_DEPTH_SPECS.standard.outputTokens === 3000);
  ok("parseAgentDepth falls back to standard", parseAgentDepth("exhaustive") === DEFAULT_AGENT_DEPTH);
  ok("...for every non-string too",
    [null, undefined, 7, {}].every((v) => parseAgentDepth(v) === DEFAULT_AGENT_DEPTH));

  // A LADDER, in every dimension that costs money. A tier that is more
  // expensive without being more capable is a tier nobody should pick.
  const specs = AGENT_DEPTHS.map((d) => AGENT_DEPTH_SPECS[d]);
  ok("searches increase with depth",
    specs[0].maxSearches < specs[1].maxSearches && specs[1].maxSearches < specs[2].maxSearches,
    specs.map((s) => s.maxSearches).join(","));
  ok("output length increases with depth",
    specs[0].outputTokens < specs[1].outputTokens && specs[1].outputTokens < specs[2].outputTokens);
  ok("research passes never decrease",
    specs[0].researchRounds <= specs[1].researchRounds && specs[1].researchRounds <= specs[2].researchRounds);
  ok("deep is the only one with two passes", specs[2].researchRounds === 2);

  // A DIFFERENT MODEL PER TIER (#21 ε), and each one has to be priced.
  const models = AGENT_DEPTHS.map((d) => AGENT_DEPTH_SPECS[d].model);
  ok("three distinct models", new Set(models).size === 3, models.join(","));
  for (const model of models) {
    ok(`${model} is in the pricing table`, modelPricing.isKnownModel(model),
      "an unpriced model falls back to the WORST rate, which silently over-charges");
  }
  const rates = models.map((m) => modelPricing.pricingForModel(m).inputPerMTok);
  ok("the models get more expensive with depth",
    rates[0] < rates[1] && rates[1] < rates[2], rates.join(","));

  ok("every tier has a stated time range",
    AGENT_DEPTHS.every((d) => Array.isArray(AGENT_DEPTH_SECONDS[d]) && AGENT_DEPTH_SECONDS[d][0] < AGENT_DEPTH_SECONDS[d][1]));
  ok("...and they get longer with depth",
    AGENT_DEPTH_SECONDS.simple[1] <= AGENT_DEPTH_SECONDS.standard[1] &&
      AGENT_DEPTH_SECONDS.standard[1] <= AGENT_DEPTH_SECONDS.deep[1]);
}

console.log("\n2. Steps, sources and the per-round search budget");
{
  for (const d of AGENT_DEPTHS) {
    ok(`${d}: steps = research passes + the write`,
      agentMaxSteps(d, true) === AGENT_DEPTH_SPECS[d].researchRounds + 1);
    // A tier's "10 sources" is a CEILING, not a promise: an agent that
    // does not search consults none, and the picker must not advertise
    // otherwise.
    ok(`${d}: no web search means one step`, agentMaxSteps(d, false) === 1);
    ok(`${d}: no web search means no sources`, agentMaxSources(d, false) === 0);
    ok(`${d}: sources match the spec`, agentMaxSources(d, true) === AGENT_DEPTH_SPECS[d].maxSearches);

    // THE SUM IS THE CAP. Giving each of deep's two passes the full ten
    // would double the most expensive line in the run against a hold
    // sized for ten.
    const total = Array.from({ length: AGENT_DEPTH_SPECS[d].researchRounds }, (_, i) =>
      searchesForRound(d, i)).reduce((a, b) => a + b, 0);
    ok(`${d}: the rounds add up to exactly maxSearches`,
      total === AGENT_DEPTH_SPECS[d].maxSearches, `${total} vs ${AGENT_DEPTH_SPECS[d].maxSearches}`);
    ok(`${d}: every round gets at least one search`,
      Array.from({ length: AGENT_DEPTH_SPECS[d].researchRounds }, (_, i) => searchesForRound(d, i))
        .every((n) => n >= 1));
  }
  ok("the first round gets the larger half", searchesForRound("deep", 0) >= searchesForRound("deep", 1));
}

console.log("\n3. The runner does what the tier says");
{
  // These are the strings that decide a model and a search budget at run
  // time, and every one of them typechecks either way.
  ok("the model comes from the spec", /model: spec\.model/.test(runnerSrc));
  ok("...for the research pass too", (runnerSrc.match(/model: spec\.model/g) ?? []).length === 2);
  ok("the output cap comes from the spec", /max_tokens: spec\.outputTokens/.test(runnerSrc));
  ok("the research cap comes from the spec", /max_tokens: spec\.researchTokens/.test(runnerSrc));
  ok("the search cap comes from the round budget", /webSearchTool\(searches\)/.test(runnerSrc));
  // BOTH SITES. The research return truncates, and so does the
  // accumulation across rounds — a `.replace` that fixed one would leave
  // the other pinned to a constant, which is exactly what the mutation
  // suite did to this assertion.
  ok("every research truncation follows the tier's ceiling",
    (runnerSrc.match(/slice\(0, spec\.researchChars\)/g) ?? []).length === 2,
    String((runnerSrc.match(/slice\(0, spec\.researchChars\)/g) ?? []).length));
  ok("...and no constant character cap survives beside them",
    !/slice\(0, (?!spec\.)\d{4,}\)/.test(runnerSrc));
  ok("research runs once per round", /for \(let round = 0; round < spec\.researchRounds/.test(runnerSrc));
  // A pass that found nothing ENDS the research: paying for a second
  // search budget after the model said NONE buys the same answer twice.
  ok("a barren pass stops the loop", /if \(!result\.findings\) \{[\s\S]{0,300}break;/.test(runnerSrc));
  ok("the depth is parsed, never indexed raw",
    /parseAgentDepth\(params\.depth\) : parseAgentDepth\(config\.depth\)/.test(runnerSrc));

  // THE HOLD IS SIZED FROM THE SPEC. Pricing every tier against one
  // model over-charges simple by three and UNDER-RESERVES deep by
  // nearly half — and the under-reserve is the one that ends with a
  // balance going negative mid-run.
  ok("the estimate uses the tier's own model", /      model: spec\.model,/.test(executeSrc));
  ok("...and the tier's own search budget",
    /expectedWebSearches: params\.needsWebSearch \? spec\.maxSearches : 0/.test(executeSrc));
  ok("...and nothing in the estimate is a hard-coded model",
    !/model: "claude-/.test(executeSrc));

  // ONE depth for the hold, the run and the receipt.
  ok("executeAgent resolves the depth once", /const runDepth = parseAgentDepth\(/.test(executeSrc));
  // FOUR SITES, exactly: the estimate, both runAgentTask calls, and the
  // cost row. ">= 3" let a mutation delete the one that sizes the hold
  // and still pass.
  ok("the resolved depth reaches every site that needs it",
    (executeSrc.match(/depth: runDepth/g) ?? []).length === 4,
    String((executeSrc.match(/depth: runDepth/g) ?? []).length));
  ok("...including the estimate that sizes the hold",
    /estimateAgentRun\(\{[\s\S]{0,300}depth: runDepth,/.test(executeSrc));
  ok("the depth lands on the cost row", /depth: runDepth,\n\s*depthOverridden/.test(executeSrc));

  // The per-run override (#21 δ) is validated at BOTH ends: the route
  // that receives it and the worker that reads it back out of jsonb.
  ok("the run route validates the override", /isAgentDepth\(body\?\.depth\)/.test(runRouteSrc));
  const handler = readFileSync("src/lib/jobs/handlers/agent-run.ts", "utf8");
  ok("the worker validates it again", /isAgentDepth\(rawDepth\)/.test(handler),
    "the job input is a jsonb column read by a worker that did not write it");
}

console.log("\n4. The estimate profile matches the tier it prices");
{
  const profiles = { simple: "agentRunSimple", standard: "agentRunStandard", deep: "agentRunDeep" };
  for (const d of AGENT_DEPTHS) {
    const profile = estimate.ACTION_PROFILES[profiles[d]];
    const spec = AGENT_DEPTH_SPECS[d];
    ok(`${d}: a profile exists`, !!profile);
    if (!profile) continue;
    // ONE AUXILIARY CALL PER RESEARCH PASS. A profile with fewer models
    // a run that makes more calls than it was held for.
    ok(`${d}: one auxiliary call per research pass`,
      profile.auxiliaryCalls.length === spec.researchRounds,
      `${profile.auxiliaryCalls.length} vs ${spec.researchRounds}`);
    ok(`${d}: each research call is sized at the tier's token ceiling`,
      profile.auxiliaryCalls.every((c) => c.outputTokens >= spec.researchTokens),
      JSON.stringify(profile.auxiliaryCalls));
    // baseOutputChars must cover the tier's output ceiling, or the hold
    // is short of what the run may legitimately produce.
    ok(`${d}: the output allowance covers the tier's ceiling`,
      profile.baseOutputChars >= spec.outputTokens * estimate.CHARS_PER_TOKEN,
      `${profile.baseOutputChars} vs ${spec.outputTokens * estimate.CHARS_PER_TOKEN}`);
    // Every tier settles under ONE feature, so CREDIT_MARGIN_AGENT_RUN
    // governs all three — a per-tier key would let one drop below the
    // floor while the feature looked configured.
    ok(`${d}: settles as agent_run`, marginPolicy.ACTION_TO_FEATURE[profiles[d]] === "agent_run");
  }
  ok("the untiered agentRun profile still exists", !!estimate.ACTION_PROFILES.agentRun,
    "it is what an agent with no depth recorded is priced at, and that must not move");
  ok("adopting settles as a build, not a run",
    marginPolicy.ACTION_TO_FEATURE.agentTemplateFill === "agent_build");
}

console.log("\n5. THE MARGIN. Every tier, both build paths, over a sweep.");
{
  // The formula that CHARGES, exercised — not a claim about it.
  // credits = ceil(real_eur * M / P); revenue = credits * P; so
  // revenue/cost >= M for every input. Checked here against the real
  // per-tier estimates rather than trusted.
  const MIN = 4;
  const paths = [
    ...AGENT_DEPTHS.map((d) => [`run:${d}`, { profile: { simple: "agentRunSimple", standard: "agentRunStandard", deep: "agentRunDeep" }[d], model: AGENT_DEPTH_SPECS[d].model, searches: AGENT_DEPTH_SPECS[d].maxSearches }]),
    ["build:template", { profile: "agentTemplateFill", model: TEMPLATE_FILL_MODEL, searches: 0 }],
    ["build:full", { profile: "agentBuild", model: AGENT_BUILDER_MODEL, searches: 0 }],
  ];

  for (const [label, p] of paths) {
    for (const inputChars of [100, 600, 2000, 4000]) {
      for (const planSlug of ["free", "starter", "growth", "professional", "ultimate", "enterprise"]) {
        const est = estimate.estimateForAction(
          p.profile,
          { model: p.model, inputChars, expectedWebSearches: p.searches, planSlug },
          CONFIG,
          CONFIG.creditPriceEur
        );
        const revenueEur = est.estimatedCredits * CONFIG.creditPriceEur;
        const costEur = formula.usdToEur(est.estimatedUsd, CONFIG);
        const ratio = costEur > 0 ? revenueEur / costEur : Infinity;
        ok(`${label} / ${inputChars} chars / ${planSlug}: margin ${ratio.toFixed(2)}x >= ${MIN}x`,
          ratio >= MIN, `revenue €${revenueEur.toFixed(4)} vs cost €${costEur.toFixed(4)}`);
      }
    }
  }

  // AND THE SAME PROPERTY DIRECTLY ON THE FORMULA, over a wide sweep of
  // real costs — including the tiny ones, where rounding UP is what makes
  // the guarantee hold and rounding to nearest would break it.
  for (const usd of [0.0001, 0.001, 0.01, 0.05, 0.15, 0.35, 1, 5]) {
    const eur = formula.usdToEur(usd, CONFIG);
    const credits = formula.creditsForRealCostEur(eur, CONFIG, MIN);
    const ratio = (credits * CONFIG.creditPriceEur) / eur;
    ok(`the formula holds at $${usd}: ${ratio.toFixed(2)}x`, ratio >= MIN, String(credits));
  }

  // ADOPTING IS CHEAPER BECAUSE IT DOES LESS, and that is checkable: the
  // fill call's estimated COST must be below the full builder's, at the
  // same margin. A "cheaper" path with the same cost would be a discount.
  const fill = estimate.estimateForAction(
    "agentTemplateFill",
    { model: TEMPLATE_FILL_MODEL, inputChars: 600, planSlug: "growth" },
    CONFIG, CONFIG.creditPriceEur
  );
  const build = estimate.estimateForAction(
    "agentBuild",
    { model: AGENT_BUILDER_MODEL, inputChars: 600, planSlug: "growth" },
    CONFIG, CONFIG.creditPriceEur
  );
  ok("the template path really costs us less",
    fill.estimatedUsd < build.estimatedUsd,
    `fill $${fill.estimatedUsd.toFixed(5)} vs build $${build.estimatedUsd.toFixed(5)}`);
  ok("...and therefore charges less",
    fill.estimatedCredits <= build.estimatedCredits,
    `${fill.estimatedCredits} vs ${build.estimatedCredits}`);
  ok("the fill model is the cheapest one in the ladder",
    modelPricing.pricingForModel(TEMPLATE_FILL_MODEL).inputPerMTok <=
      Math.min(...AGENT_DEPTHS.map((d) => modelPricing.pricingForModel(AGENT_DEPTH_SPECS[d].model).inputPerMTok)));

  // The prices actually land near the brief's targets. Reported rather
  // than asserted tightly: the numbers come FROM the caps, and a test
  // that pinned them exactly would be a test of arithmetic, not of the
  // tiers. The loose bounds catch a tier that has drifted an order of
  // magnitude.
  for (const [d, lo, hi] of [["simple", 2, 12], ["standard", 12, 40], ["deep", 40, 120]]) {
    const est = estimate.estimateForAction(
      { simple: "agentRunSimple", standard: "agentRunStandard", deep: "agentRunDeep" }[d],
      { model: AGENT_DEPTH_SPECS[d].model, inputChars: 600, expectedWebSearches: AGENT_DEPTH_SPECS[d].maxSearches, planSlug: "growth" },
      CONFIG, CONFIG.creditPriceEur
    );
    console.log(`        ${d}: ${est.estimatedCredits} credits ($${est.estimatedUsd.toFixed(4)})`);
    ok(`${d} lands in its intended band`, est.estimatedCredits >= lo && est.estimatedCredits <= hi,
      String(est.estimatedCredits));
  }
}

console.log("\n6. The builder suggests, and never suggests the expensive one");
{
  ok("the tool schema offers all three",
    AGENT_DEPTHS.every((d) => new RegExp(`"${d}"`).test(builderSrc)));
  ok("depth is a required tool field", /"needsWebSearch",\n\s*"depth",/.test(builderSrc));
  ok("the prompt warns that the cost recurs", /every run|EVERY TIME IT RUNS/i.test(builderSrc));
  ok("...and says to default to standard", /WHEN IN DOUBT CHOOSE "standard"/.test(builderSrc));

  const fold = unicode.foldForMatch;
  ok("a price question suggests simple", suggestAgentDepth("what is the price of gold", fold).depth === "simple");
  ok("...in Greek too", suggestAgentDepth("η τιμή του χρυσού", fold).depth === "simple");
  ok("an ordinary request suggests standard",
    suggestAgentDepth("news about my industry", fold).depth === "standard");
  // A HEURISTIC MUST NOT SPEND SOMEBODY'S MONTH. "in depth" gets
  // standard — the tier that answers most things — and `deep` sits
  // beside it with its price.
  ok("even an 'in depth' request only suggests standard",
    suggestAgentDepth("give me an in depth analysis of the market landscape", fold).depth === "standard");
  ok("...and says why it did not go deeper",
    suggestAgentDepth("comprehensive market research", fold).reason === "deep_signal");
  ok("the heuristic NEVER returns deep",
    ["deep dive", "comprehensive", "σε βάθος", "full report", "everything about tesla", "x"]
      .every((s) => suggestAgentDepth(s, fold).depth !== "deep"));
  ok("an empty request still returns a usable tier",
    isAgentDepth(suggestAgentDepth("", fold).depth));
}

console.log("\n7. The picker shows the price, every time");
{
  ok("credits is a required prop", /credits: number;/.test(pickerSrc));
  ok("every option renders its own figure", /formatNumber\(fact\.credits, locale\)/.test(pickerSrc));
  // Rendered OUTSIDE any conditional on selection: the comparison is the
  // decision, so an unselected option's price is the one that matters.
  ok("the price is not hidden on unselected options",
    !/selected &&[\s\S]{0,80}fact\.credits/.test(pickerSrc));
  ok("the tier list comes from AGENT_DEPTHS", /AGENT_DEPTHS\.map/.test(pickerSrc));
  ok("the picker is used in three places",
    ["src/components/agents/agents-workspace.tsx"].every((f) =>
      (readFileSync(f, "utf8").match(/<DepthPicker/g) ?? []).length === 3),
    "create preview, edit panel and the per-run override");
  const facts = readFileSync("src/app/dashboard/agents/page.tsx", "utf8");
  ok("the prices are computed on the SERVER", /agentRunEstimatesByDepth\(/.test(facts),
    "a figure computed in the browser is a second implementation of the pricing");
  ok("...from the same specs the runner uses", /AGENT_DEPTH_SPECS\[depth\]\.model/.test(facts));
}

console.log("\n8. Templates: the pattern, the slot, and filling it");
{
  ok("the slot is one token", TEMPLATE_SLOT === "{subject}");
  ok("there are enough built-ins to be a library", BUILT_IN_TEMPLATES.length >= 10, String(BUILT_IN_TEMPLATES.length));
  ok("slugs are unique",
    new Set(BUILT_IN_TEMPLATES.map((t) => t.slug)).size === BUILT_IN_TEMPLATES.length);
  for (const t of BUILT_IN_TEMPLATES) {
    ok(`${t.slug} has the slot`, t.taskPattern.includes(TEMPLATE_SLOT));
    ok(`${t.slug} is long enough to carry structure`, t.taskPattern.length >= MIN_PATTERN_CHARS);
    ok(`${t.slug} has a real depth`, isAgentDepth(t.depth));
    ok(`${t.slug} has keywords`, t.keywords.length >= 4);
    // NO USER DATA IN THE CURATED SET, by construction — they were
    // written from nothing. Checked anyway, because "written from
    // nothing" is a claim about a process.
    ok(`${t.slug} carries no contact details`,
      !/[^\s@]+@[^\s@]+\.[a-z]{2,}|https?:\/\/|\d{4,}/i.test(`${t.title} ${t.description} ${t.taskPattern}`));
  }
  ok("every tier is represented", AGENT_DEPTHS.every((d) => BUILT_IN_TEMPLATES.some((t) => t.depth === d)));
  ok("findBuiltInTemplate finds one", findBuiltInTemplate("price-check")?.depth === "simple");
  ok("...and returns undefined for a stranger", findBuiltInTemplate("nope") === undefined);

  ok("filling replaces the slot", fillTemplate("watch {subject} daily", "Nvidia") === "watch Nvidia daily");
  // replaceAll, not replace: one filled and one literal "{subject}"
  // emailed every morning is the failure this prevents.
  ok("every occurrence is filled",
    !fillTemplate("{subject} and {subject}", "X").includes(TEMPLATE_SLOT));
  ok("the subject is trimmed", fillTemplate("about {subject}.", "  Acme  ") === "about Acme.");
  ok("an empty subject leaves no marker",
    !fillTemplate("about {subject}.", "").includes(TEMPLATE_SLOT));
}

console.log("\n9. Anonymisation: refusal-first, and it does not guess at names");
{
  const PROMPT = "Check what Acme Ltd has done this week and report pricing changes with sources for each item found.";
  const good = anonymiseTaskPrompt(PROMPT, "Acme Ltd");
  ok("a clean share produces a pattern", good.ok === true);
  ok("...with the slot in it", good.ok && good.pattern.includes(TEMPLATE_SLOT));
  ok("...and the subject gone", good.ok && !good.pattern.includes("Acme"));

  // THE FOLDED RE-CHECK. Stricter than the replacement on purpose: a
  // refusal costs somebody an edit, a miss publishes their name.
  const cased = anonymiseTaskPrompt(
    "Check what Acme Ltd has done and compare it with ACME LTD last year, reporting every difference found.",
    "Acme Ltd"
  );
  ok("a differently-cased survivor is refused", !cased.ok && cased.reason === "subject_still_present");
  const accented = anonymiseTaskPrompt(
    "Παρακολούθησε τι κάνει το Καφές Κέντρο και σύγκρινέ το με το ΚΑΦΕΣ ΚΕΝΤΡΟ πέρυσι, με πηγές.",
    "Καφές Κέντρο"
  );
  ok("an accent-variant survivor is refused too",
    !accented.ok && accented.reason === "subject_still_present",
    "foldForMatch is what catches Καφές vs ΚΑΦΕΣ");

  // THE SUBJECT MUST NOT APPEAR IN THE CONTACT DETAIL, or the folded
  // re-check fires first and the test proves the wrong rule. (Both
  // refuse — which is the point of having two — but a fixture that
  // triggers the earlier one tells you nothing about the later one.)
  for (const [text, reason] of [
    ["Email the results to me at nikos@example.com and check what Acme did this week with full sources.", "contains_contact_details"],
    ["Check https://rivalwatch.example.org weekly for what Acme changed and report every difference found.", "contains_contact_details"],
    ["Follow @rivalwatch for what Acme posts each week and summarise it with sources for every claim made.", "contains_contact_details"],
    ["Call the office on 2101234567 about what Acme shipped this week and report it with sources for each.", "contains_numbers"],
  ]) {
    const result = anonymiseTaskPrompt(text, "Acme");
    ok(`refused: ${reason}`, !result.ok && result.reason === reason,
      result.ok ? "it was ALLOWED" : result.reason);
  }
  // AND THE ORDERING, stated: when the contact detail CONTAINS the
  // subject, the survivor check is what fires. Still a refusal, and the
  // stricter of the two is the one that should win.
  const both = anonymiseTaskPrompt(
    "Check https://acme.example.com weekly for what Acme changed and report every difference you find.",
    "Acme"
  );
  ok("a URL containing the subject refuses as a survivor",
    !both.ok && both.reason === "subject_still_present", both.ok ? "ALLOWED" : both.reason);
  ok("no subject named is a refusal", anonymiseTaskPrompt(PROMPT, "").reason === "no_slot");
  ok("a one-character subject is a refusal", anonymiseTaskPrompt(PROMPT, "A").reason === "no_slot");
  ok("a subject that is not in the task is a refusal",
    anonymiseTaskPrompt(PROMPT, "Something Else").reason === "no_slot");
  ok("what is left must carry structure",
    anonymiseTaskPrompt("Watch Acme", "Acme").reason === "too_short");
  ok("every refusal reason is reachable",
    SHARE_REFUSAL_REASONS.length === 6 && SHARE_REFUSAL_REASONS.includes("subject_still_present"));

  // The title and description NEVER pass through anonymiseTaskPrompt, so
  // they are checked separately — a pattern scrubbed clean under a title
  // reading "Watch acme.com for Nikos" has published exactly what the
  // scrub was for.
  const base = { taskPattern: `Check what ${TEMPLATE_SLOT} did this week and report every pricing change with a source.`, scheduleCron: "0 9 * * 1", depth: "standard", needsWebSearch: true, outputFormat: "report" };
  ok("a good template validates",
    validateShareableTemplate({ ...base, title: "Competitor watch", description: "What a rival did." }).ok);
  ok("an email in the TITLE is refused",
    !validateShareableTemplate({ ...base, title: "Ask nikos@example.com", description: "ok description" }).ok);
  ok("a link in the DESCRIPTION is refused",
    !validateShareableTemplate({ ...base, title: "Fine title", description: "See https://acme.example.com" }).ok);
  ok("a long number in the description is refused",
    !validateShareableTemplate({ ...base, title: "Fine title", description: "Ring 2101234567" }).ok);
  // A VALID TITLE AND DESCRIPTION, so the only thing wrong is the slot.
  // The first version of this used title "T", which is refused for being
  // too short — so the assertion passed with the slot check disabled.
  const noSlot = validateShareableTemplate({
    ...base,
    taskPattern: "Check what the company did this week and report every pricing change with a source for each.",
    title: "Competitor watch",
    description: "What a rival did this week.",
  });
  ok("a pattern with no slot is refused", !noSlot.ok, noSlot.ok ? "it was ALLOWED" : noSlot.reason);
  ok("...and the reason names the slot", !noSlot.ok && /subject/.test(noSlot.reason));
  ok("an over-long title is refused",
    !validateShareableTemplate({ ...base, title: "x".repeat(TEMPLATE_LIMITS.title + 1), description: "ok" }).ok);
  ok("an unknown depth becomes standard",
    validateShareableTemplate({ ...base, depth: "exhaustive", title: "Fine", description: "Fine" })
      .template.depth === "standard");
}

console.log("\n10. Matching");
{
  const fold = unicode.foldForMatch;
  const competitor = BUILT_IN_TEMPLATES.find((t) => t.slug === "competitor-watch");
  const price = BUILT_IN_TEMPLATES.find((t) => t.slug === "price-check");
  ok("a competitor request scores on the competitor template",
    scoreTemplateMatch("I want to watch my competitor every week", competitor, fold) >= 3);
  ok("...and not on the price one",
    scoreTemplateMatch("I want to watch my competitor every week", competitor, fold) >
      scoreTemplateMatch("I want to watch my competitor every week", price, fold));
  ok("an empty request scores nothing", scoreTemplateMatch("", competitor, fold) === 0);
  ok("single letters are ignored", scoreTemplateMatch("a b c", competitor, fold) === 0);
  ok("scoring folds accents",
    scoreTemplateMatch("τιμη", { title: "Price", description: "", keywords: ["τιμή"] }, fold) >= 3);
  // THE TITLE OUTWEIGHS A PASSING MENTION, and that has to be asserted
  // where nothing else can carry the score: a word ONLY in the title,
  // versus the same word ONLY in the description.
  const inTitle = scoreTemplateMatch("regulation",
    { title: "Regulation monitor", description: "nothing relevant", keywords: [] }, fold);
  const inDescription = scoreTemplateMatch("regulation",
    { title: "Nothing relevant", description: "watches regulation changes", keywords: [] }, fold);
  ok("a word in the title scores three", inTitle === 3, String(inTitle));
  ok("...and one only in the description scores one", inDescription === 1, String(inDescription));
  ok("...so the title genuinely outweighs it", inTitle > inDescription);

  // THE DATABASE DOES THE REAL RANKING, and it says so rather than
  // claiming to be semantic.
  ok("the migration says the matching is not semantic",
    /NOT SEMANTIC/i.test(migrationSql));
  ok("the route says so too",
    /NOT SEMANTIC MATCHING/.test(readFileSync("src/app/api/agents/templates/route.ts", "utf8")));
  ok("matching reuses search_fold", /public\.search_fold\(/.test(migrationSql));
  ok("...and the tsvector is weighted title > keywords > description",
    /'A'\)[\s\S]{0,200}'B'\)[\s\S]{0,200}'C'\)/.test(migrationSql));
}

console.log("\n11. The routes");
{
  // "BUILD A NEW ONE" IS ALWAYS OFFERED (#22 γ). Rendered outside the
  // matches branch, and never disabled by there being a match.
  const alwaysIndex = matchesSrc.indexOf("ALWAYS RENDERED");
  const branchEnd = matchesSrc.indexOf("{matches.length > 0 && (");
  ok("build-new is rendered outside the matches branch",
    alwaysIndex > branchEnd && alwaysIndex !== -1);
  ok("...and both prices are shown together",
    /templateCredits/.test(matchesSrc) && /buildNewLabel/.test(matchesSrc));
  ok("the user is told it is ready-made", /t\("found"/.test(matchesSrc));
  ok("...and shown the actual task", /match\.taskPattern/.test(matchesSrc));

  // Adopting.
  ok("adopt reads the template through the CALLER's client",
    /supabase\s*\n?\s*\.from\("agent_templates"\)/.test(adoptSrc));
  ok("the task always comes from the template", /fillTemplate\(pattern, subject\)/.test(adoptSrc));
  ok("...and the draft is validated like any other", /validateAgentDraft\(draft/.test(adoptSrc));
  // COMPARED ON THE CALLS, not on the identifiers: `reserveCredits` is
  // imported at the top of the file, so an indexOf on the bare name
  // compares the cap check against an import statement and passes for a
  // route that reserves first.
  ok("the plan cap is checked before anything is spent",
    adoptSrc.indexOf("checkAgentActivationCap(user.id") !== -1 &&
      adoptSrc.indexOf("checkAgentActivationCap(user.id") < adoptSrc.indexOf("reserveCredits(user.id"),
    "a user at their cap must not pay for a fill call that cannot become an agent");
  ok("no model call when the subject is already known",
    /const needsFill = Boolean\(apiKey\) && !subjectOverride;/.test(adoptSrc));
  ok("a fill failure still creates the agent",
    /NOT FATAL[\s\S]{0,300}logApiError/.test(adoptSrc));
  ok("nothing is charged when nothing was spent",
    /if \(costs\.callCount > 0\)[\s\S]{0,600}releaseReservation/.test(adoptSrc));
  ok("the use counter moves only after the agent exists",
    adoptSrc.indexOf("record_template_use") > adoptSrc.indexOf(".insert({"));
  ok("adoption is email-only", /resolveDeliveryOwnership\(user\.id, "email"\)/.test(adoptSrc),
    "a shared template must not point an agent at a channel the adopter never chose");

  // Sharing.
  ok("share reads the agent through the CALLER's client, so RLS decides",
    /supabase\s*\n?\s*\.from\("user_agents"\)/.test(shareSrc));
  ok("the refusal carries a CODE, for translation", /code: anonymised\.reason/.test(shareSrc));
  ok("the slug is built from the typed title, not the agent's name",
    /validated\.template\.title\s*\n?\s*\.toLowerCase\(\)/.test(shareSrc));
  ok("the insert uses the admin client, because there is no insert policy",
    /const admin = createAdminClient\(\)/.test(shareSrc));
  ok("nothing about delivery is shared",
    !/delivery_target|delivery_method|timezone/.test(shareSrc.split("insert({")[1] ?? ""));
  ok("the share is rate limited", /scope: "agent_template_share"/.test(shareSrc));
}

console.log("\n12. The migration's own rules");
{
  const code = migrationSql.split("\n").map((l) => (l.trim().startsWith("--") ? "" : l)).join("\n");
  for (const forbidden of ["drop table", "truncate"]) {
    ok(`no ${forbidden}`, !new RegExp(forbidden, "i").test(code));
  }
  ok("no delete at all", !/\bdelete from\b/i.test(code));
  ok("the slot is mandatory in the DATABASE",
    /check \(position\('\{subject\}' in task_pattern\) > 0\)/.test(code));
  // THE CONSTRAINT BODY, not just its name. `check (true and ...)` keeps
  // the name and every pattern inside it while refusing nothing — which
  // is exactly what the mutation suite did to the laxer version of this.
  const constraint = code.slice(
    code.indexOf("add constraint agent_templates_no_contact_details"),
    code.indexOf(");", code.indexOf("add constraint agent_templates_no_contact_details"))
  );
  ok("contact details are refused by a CHECK constraint", constraint.length > 0);
  ok("...on email addresses", /!~\*\s*'\[\^\[:space:\]@\]\+@/.test(constraint));
  ok("...on links", /!~\*\s*'https\?:/.test(constraint));
  ok("...on long digit runs", /!~\s*'\[0-9\]\{4,\}'/.test(constraint));
  ok("...and the whole thing is not short-circuited by a tautology",
    !/\b(true|false)\b/.test(constraint), constraint.slice(0, 120));
  ok("...including long digit runs", /\[0-9\]\{4,\}/.test(code));
  ok("the depth column is constrained to the three tiers",
    /check \(depth in \('simple', 'standard', 'deep'\)\)/.test(code));
  ok("RLS is on", /alter table public\.agent_templates enable row level security/.test(code));
  ok("every signed-in user may read", /for select\s*\n\s*using \(auth\.uid\(\) is not null\)/.test(code));
  ok("only a sharer may withdraw their own",
    /for delete\s*\n\s*using \(shared_by is not null and auth\.uid\(\) = shared_by\)/.test(code));
  ok("nobody may insert or update", !/for insert|for update/.test(code));
  ok("...and the grant says so too",
    /revoke insert, update on public\.agent_templates from authenticated/.test(code));
  ok("anon reaches nothing", /revoke all on public\.agent_templates from anon/.test(code));
  ok("match_agent_templates is SECURITY INVOKER",
    /create or replace function public\.match_agent_templates[\s\S]*?security invoker/.test(code));
  ok("record_template_use is not callable by a user",
    /revoke all on function public\.record_template_use\(text\) from authenticated/.test(code));
  // Every built-in in the TypeScript list must exist in the seed, or the
  // library the code describes is not the library the database holds.
  for (const t of BUILT_IN_TEMPLATES) {
    ok(`the seed contains ${t.slug}`, migrationSql.includes(`('${t.slug}'`));
  }
}

console.log(`\n${pass} passed, ${failures.length} failed`);
if (failures.length) { failures.forEach((f) => console.log("  - " + f)); process.exit(1); }
