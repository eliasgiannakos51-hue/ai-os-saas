// Every Anthropic call must be paid for, at >= the guaranteed margin, on
// EVERY plan. This file is the thing that makes that true tomorrow, not
// just today.
//
// THE PROBLEM IT EXISTS FOR. The margin machinery — reserve, measure real
// usage, settle at ceil(costEur * M / theAccountsOwnCreditPrice) — is
// correct and is genuinely plan-aware. But it only protects the features
// that actually go through it. Anything still charging a FLAT
// CREDIT_COSTS number bypasses it completely, and a flat number cannot
// hold a multiplier, because what a credit is worth depends on the plan:
//
//     list     EUR 0.0200 per credit
//     Starter  EUR 0.0200   (20 / 1000)
//     Growth   EUR 0.0167   (50 / 3000)
//     Pro      EUR 0.0100   (100 / 10000)
//     Ultimate EUR 0.0080   (200 / 25000)
//
// On Ultimate one credit is EUR 0.008, so a flat 1-credit charge can only
// clear 4x if the call cost under EUR 0.002 (~$0.0022). A single Sonnet
// message of 1,000 in / 500 out costs $0.0105 — five times that. The
// margin does not dip on those features, it is absent.
//
// So this test does three things:
//   1. inventories EVERY messages.create / messages.stream in the tree and
//      fails on any that is not declared here. A new AI feature cannot be
//      added silently; the author has to say how it bills.
//   2. brute-forces margin across plan x pack x cost and fails under 4x.
//   3. runs the exact reported Ultimate scenario.
//
// It runs in `npm run build` (see package.json prebuild), so a feature
// that does not bill correctly cannot be deployed.
//
// Run: node scripts/tests/billing-coverage.test.mjs
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

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
function checkTrue(name, cond, detail) {
  check(name, Boolean(cond), true);
  if (!cond && detail) console.log(`        ${detail}`);
}

const { loadTs } = await import("./load-ts.mjs");
const formula = await loadTs("src/lib/billing/credit-formula.ts");
const pricing = await loadTs("src/lib/billing/model-pricing.ts");
const configMod = await loadTs("src/lib/billing/pricing-config.ts");
const margin = await loadTs("src/lib/billing/margin-policy.ts");
const config = configMod.resolvePricingConfig();
const M = config.marginMultiplier;

// ---------------------------------------------------------------------
// 1. The inventory. Every entry states how that call is paid for.
//    "settled"  -> measured usage through reserve/settle. Margin held.
//    "flat"     -> a fixed CREDIT_COSTS number. NOT margin-guaranteed.
//    "unbilled" -> nothing is charged at all.
// Adding a call without adding it here fails the build.
// ---------------------------------------------------------------------
const DECLARED = {
  "src/lib/website-builder.ts": { calls: 4, billing: "settled", note: "generate/edit stream + classifier + patch, all via CostAccumulator" },
  "src/lib/mission-agents.ts": { calls: 3, billing: "settled", note: "planner/reviewer, costs passed in" },
  "src/lib/website-security-review.ts": { calls: 1, billing: "settled", note: "recorded onto the generation's accumulator" },
  "src/lib/mission-step-runner.ts": { calls: 1, billing: "settled" },
  "src/lib/clarification.ts": { calls: 1, billing: "settled" },
  // Moved out of api/create when Create Anything became a background job:
  // the route awaited a vision-capable classification under a 120-second
  // ceiling, and vision is the slow case because the images travel with
  // the message. Still ONE call from this file — the clarifying-questions
  // pre-check moved with it but is counted at lib/clarification.ts, which
  // is where its messages.create lives; it lands on the same accumulator,
  // so a request that stops there is still paid for. Billing otherwise
  // unchanged: a classification that matched nothing still settles (it is
  // a real answer the user reads), and an insert that fails still refunds
  // (nothing was saved).
  "src/lib/jobs/handlers/create.ts": { calls: 1, billing: "settled" },
  "src/app/api/create-studio/detect/route.ts": { calls: 1, billing: "settled" },
  "src/app/api/chat/route.ts": { calls: 1, billing: "settled" },

  "src/app/api/records/ask/route.ts": {
    calls: 1,
    billing: "settled",
    note: "was a flat 1 credit; the input is the WHOLE record, so the price now tracks the record's size. Reservation sized after the record loads.",
  },
  "src/app/api/text-actions/route.ts": {
    calls: 1,
    billing: "settled",
    note: "was a flat 1 credit whether rewriting a sentence or a document.",
  },
  "src/app/api/documents/[id]/pdf/route.ts": {
    calls: 1,
    billing: "settled",
    note: "V4.6. A PDF download translated into another language: ONE Sonnet call over the document's HTML, reserved against the same documentTranslate estimate the dialog quoted BEFORE the download (../pdf/estimate), settled as document_translate once the translated PDF is about to be sent. The untranslated download makes no call and touches nothing.",
  },
  "src/lib/reflection-agent.ts": {
    calls: 1,
    billing: "settled",
    note: "was a flat 2 credits with NO usage tracking at all — the only call whose tokens reached no cost log.",
  },
  "src/lib/chat/memory.ts": {
    calls: 1,
    billing: "settled",
    note: "memory extraction now runs BEFORE the chat settlement and records onto the same accumulator, so one chat turn is one charge covering both calls.",
  },
  "src/lib/agents/agent-builder.ts": {
    calls: 1,
    billing: "settled",
    note: "V3 Autonomous Agents. One forced-tool-use call that designs the agent; recorded onto the same CostAccumulator as the clarification pre-check and settled once by api/agents/build. A build that returns an unusable configuration still SETTLES rather than releasing — the tokens were spent.",
  },
  "src/lib/ai/providers/adapters/anthropic.ts": {
    calls: 1,
    billing: "settled",
    note:
      "V4 #12. THE SHARED ADAPTER, and the one entry in this table that is not a feature. " +
      "It is the Anthropic half of lib/ai/providers/, so the call here is made ON BEHALF OF whichever " +
      "purpose asked — and that is a real weakening of this file's premise, which is that every call " +
      "site declares how it bills. One adapter now serves many callers, and a caller that forgets to " +
      "record its usage would bill nothing while this row still said 'settled'. " +
      "THE HOLE IS CLOSED BELOW rather than noted: the check after this table requires every " +
      "runCompletion() call site to feed the returned usage to a CostAccumulator. The adapter itself " +
      "settles nothing and reserves nothing; it returns tokens and the caller pays for them.",
  },
  "src/lib/agents/agent-runner.ts": {
    calls: 1,
    billing: "settled",
    note: "V4 #12: 2 -> 1 direct calls. The main generation moved onto lib/ai/providers/ (runCompletion), so only the optional web_search research pass still speaks to the SDK here — it needs the server-side search tool, which no other provider in the catalog offers, and an adapter that answered without searching would return a confident unsourced report. Both halves still record onto ONE accumulator per execution. V3 note, unchanged: the optional web_search research pass plus the main run, both recorded onto one accumulator per execution. Retries record onto the SAME accumulator, so a run that tried three times is charged for three attempts — which is why executeAgent reserves AGENT_MAX_ATTEMPTS x the single-run estimate.",
  },
  "src/lib/jobs/handlers/file-ask.ts": {
    calls: 3,
    billing: "settled",
    note: "V3 File Workspace, moved out of api/files/ask when asking became a background job — the route sent a whole document set through one model call under a 60-second ceiling, which is the request most likely to be killed, and a kill lost the answer while keeping the hold. Unchanged in billing: one grounded call, the reservation still sized AFTER the documents load (the cost is dominated by document text, so a hold sized from the question alone is off by orders of magnitude on a long contract), and a call that throws still SETTLES via run-job rather than releasing, because the tokens were spent. The one REFUND path is 'no readable files', where no model call happens at all. 1 -> 3 call sites when a corpus larger than one context window stopped being TRUNCATED and started being read in passes: the single-pass call (unchanged, and still what nearly every question is), the per-part call, and the synthesis that combines the parts. All three record onto the SAME accumulator, so a five-part question is one charge covering six calls — and the reservation in api/files/ask is sized over every pass rather than the first, because a hold sized for one call and settled against six is not a discount, it is an overdraft on an account that was told it could afford the question.",
  },
  "src/lib/research/research.ts": {
    calls: 3,
    billing: "settled",
    note: "V3 Deep Research. The PLANNING half (api/research) is cheap by design: it turns the topic into questions and stops, so the user sees the price of the expensive half before it runs. planResearch (forced tool use), researchQuestion (web search, once per question, sequential), synthesiseReport. All three record onto ONE CostAccumulator per report, settled by api/research/[id]/run — including the failure paths, since every phase that ran spent tokens.",
  },
  "src/lib/import/map-columns.ts": {
    calls: 1,
    billing: "settled",
    note: "V3 Task 16 Instant Value. One forced-tool-use call that decides what a spreadsheet is and maps its columns. It sees the HEADERS and a dozen sample rows, never the whole file — so a 5,000-row upload and a 20-row one cost the same, which is why the importMap profile does not scale with file size. Settled by api/import/csv/analyse whether or not a usable mapping came back; the confirm step (api/import/csv/apply) makes NO AI call and charges nothing, because applying a mapping the user already approved is arithmetic.",
  },
  "src/lib/import/paste.ts": {
    calls: 1,
    billing: "settled",
    note: "V3 Task 16 Instant Value. One forced-tool-use call that extracts structured entries from pasted text. Output genuinely scales with input here, unlike the mapper, so importPaste is proportional. Settled by api/import/paste even when the model correctly answers 'there is nothing here worth recording' — the tokens were spent either way.",
  },
  "src/lib/insights/narrate.ts": {
    calls: 1,
    billing: "settled",
    note: "V3 Task 16 Instant Value. Phrases findings the DETECTORS already computed — the patterns are found by lib/insights/detectors.ts, and this call is given the numbers and asked for grammar. Every number it writes is checked against the evidence and a narration that invents one is discarded in favour of the detector's own wording, so a model failure degrades the prose and never the correctness. Settled by api/insights/generate; when the detectors find nothing this call is never made and nothing is charged.",
  },
  "src/lib/agents/template-fill.ts": {
    calls: 1,
    billing: "settled",
    note: "V4 #22 Template library. ONE forced-tool-use call on the smallest model (Haiku), reached from api/agents/templates/adopt. It fills a template's {subject} slot from the user's own sentence and names the agent in their language — it never writes the task, the schedule or the search flag, all of which come from the template. That is what makes adopting genuinely cheaper than building rather than a discount on the same work: the full builder is a Sonnet call deciding ten fields, this is a Haiku call deciding four, and the margin multiplier is identical (agent_build, via ACTION_TO_FEATURE). Settled by the adopt route AFTER the agent row exists, so a fill whose insert then failed charges nothing; a call that threw before any response records nothing on the accumulator and the reservation is released instead. NO call at all — and nothing charged — when the user typed the subject themselves or ANTHROPIC_API_KEY is absent, which is why the route creates the agent either way.",
  },
  "src/lib/lead-classification.ts": {
    calls: 1,
    billing: "settled",
    note: "reached from the PUBLIC api/websites/[id]/submit-form. Settled against the site OWNER, who is who the triage is for, after an up-front solvency check — a stranger's form POST cannot hold the owner's credits, so the balance must be checked before the call, not after.",
  },
};

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry.startsWith(".")) continue;
    const p = path.join(dir, entry);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(p)) out.push(p);
  }
  return out;
}

console.log("== 1. every Anthropic call site is declared ==");
const found = {};
for (const file of walk("src")) {
  const n = (readFileSync(file, "utf8").match(/messages\s*\.\s*(create|stream)\s*\(/g) ?? []).length;
  if (n > 0) found[file.split(path.sep).join("/")] = n;
}
const undeclared = Object.keys(found).filter((f) => !DECLARED[f]);
check("no undeclared AI call site", undeclared, []);
if (undeclared.length) {
  console.log("        A new Anthropic call was added without saying how it bills.");
  console.log("        Add it to DECLARED in scripts/tests/billing-coverage.test.mjs");
}
const vanished = Object.keys(DECLARED).filter((f) => !found[f]);
check("no declared site has disappeared", vanished, []);
for (const [file, meta] of Object.entries(DECLARED)) {
  if (!found[file]) continue;
  check(`${file}: ${meta.calls} call(s)`, found[file], meta.calls);
}

// ---------------------------------------------------------------------
// THE HOLE THE SHARED ADAPTER OPENED, CLOSED.
//
// Until V4 #12 every entry above was a FEATURE, and "this file declares
// how it bills" meant something. lib/ai/providers/adapters/anthropic.ts
// is not a feature: it makes the call on behalf of whoever asked, so the
// declaration has to move to the ASKERS. A call site that invokes
// runCompletion() and never records the usage bills nothing at all, and
// the table above would still read 'settled'.
//
// So every runCompletion() caller is inventoried from the source and
// required to feed the result to a CostAccumulator. Not a proof that the
// amount is right — sections 3 and 4 do the margin arithmetic — but a
// proof that the tokens reach the one settlement path at all, which is
// the property the adapter could otherwise have quietly removed.
console.log("\n== 1b. every runCompletion() caller pays for what it used ==");
{
  const callers = walk("src")
    .map((f) => f.split(path.sep).join("/"))
    .filter((f) => /\brunCompletion\(/.test(readFileSync(f, "utf8")))
    .filter((f) => !f.includes("lib/ai/providers/"));
  check("at least one feature uses the provider layer", callers.length > 0, true);
  const silent = callers.filter((f) => {
    const text = readFileSync(f, "utf8");
    // The usage must reach an accumulator: `costs.record(...)`,
    // `costs.recordBatch(...)` or `addBreakdown(...)` with the outcome's
    // usage. Anything else is a call whose tokens are never charged.
    return !/costs\.(record|recordBatch|addBreakdown)\([^)]*outcome\.usage/s.test(text);
  });
  check("no runCompletion() call site drops its usage on the floor", silent, []);
}

console.log("\n== 2. the billing mode of each site ==");
const settled = Object.entries(DECLARED).filter(([, m]) => m.billing === "settled");
const flat = Object.entries(DECLARED).filter(([, m]) => m.billing === "flat");
const unbilled = Object.entries(DECLARED).filter(([, m]) => m.billing === "unbilled");
console.log(`   settled: ${settled.length}   flat: ${flat.length}   unbilled: ${unbilled.length}`);
for (const [file, m] of [...flat, ...unbilled]) {
  console.log(`   ${m.billing.toUpperCase().padEnd(8)} ${file}\n            ${m.note}`);
}
// These two counts are the whole point of the file. They are asserted at
// their CURRENT values so that the numbers can only be changed
// deliberately — moving a feature onto settlement lowers them and the
// test tells you to update it; adding another flat-fee feature raises
// them and the build fails.
check("flat-fee AI features (not margin-guaranteed)", flat.length, 0);
check("completely unbilled AI calls", unbilled.length, 0);
check("every AI call site is settled on measured usage", settled.length, Object.keys(DECLARED).length);

console.log("\n== 2b. the public contact-form endpoint bills the site owner ==");
// The one AI call in this app that an ANONYMOUS third party can trigger.
// It must charge someone, and it must check that someone can pay before
// spending, because there is no reservation to unwind afterwards.
const form = readFileSync("src/app/api/websites/[id]/submit-form/route.ts", "utf8");
checkTrue("it settles against the website owner", /userId: website\.user_id,[\s\S]{0,200}feature: "lead_classification"/.test(form));
checkTrue("with real measured usage, not a flat fee", /costs,/.test(form) && /new CostAccumulator\(\)/.test(form));
checkTrue("at the owner's own plan rate", /plan: ownerPlan/.test(form));
checkTrue("solvency is checked BEFORE the call", form.indexOf("hasEnoughCredits") < form.indexOf("classifyLeadMessage(apiKey"));
checkTrue("and it settles even if the call threw afterwards", /finally \{[\s\S]{0,400}settleReservation/.test(form));
checkTrue("the classifier records its own usage", /costs\?\.record\("classification", response\.usage, response\.model \|\| MODEL\)/.test(readFileSync("src/lib/lead-classification.ts", "utf8")));
// The abuse ceiling that was already there, asserted so it cannot be
// removed without noticing: an unpaid flood is capped per website/hour.
checkTrue("a per-website hourly cap still gates the endpoint", /MAX_SUBMISSIONS_PER_HOUR = \d+/.test(form));
checkTrue("checked before the AI call, not after", form.indexOf("MAX_SUBMISSIONS_PER_HOUR") < form.indexOf("classifyLeadMessage(apiKey"));
checkTrue("and a honeypot rejects bots earlier still", /_hp/.test(form));
// A visitor must never see the form fail because the OWNER is broke.
checkTrue("an unaffordable classification degrades, it does not 4xx", /if \(affordable\.ok\)/.test(form));

// THE REAL TABLE, not a copy of it.
//
// This was six hand-typed objects — name, price, monthlyCredits — and the
// omission that mattered was `slug`. Nothing needed it until a per-plan
// margin existed; then resolveMarginFor(null, undefined) silently returned
// the GENERAL multiplier for every row, and the section below reported
// every plan at 4x when the shipped policy is 5x. A suite that duplicates
// the thing it verifies eventually verifies the duplicate.
const { PLANS, ANNUAL_MONTHS_CHARGED } = await loadTs("src/lib/billing/plans.ts");
checkTrue("the plan table is the real one, with slugs", PLANS.every((p) => typeof p.slug === "string"));
checkTrue("…in the published order the indices below assume",
  PLANS.map((p) => p.slug).join(",") === "free,starter,growth,professional,ultimate,enterprise");

console.log("\n== 2c. a normal user IS charged for a website generation ==");
// Production showed website_generate at 0 credits. That is bypassCharge
// — admin and beta accounts are free by design, and the owner's own
// email is a hardcoded admin. For everyone else the same EUR 0.255 costs
// real credits, which is what this asserts.
const REAL_COST_EUR = 0.25531762; // the exact production row
const adminSrc = readFileSync("src/lib/auth/admin-emails.ts", "utf8");
checkTrue("the bypass is an explicit admin list, not a default", /HARDCODED_ADMIN_EMAILS = \[/.test(adminSrc));
for (const plan of PLANS) {
  if (typeof plan.price !== "number" || plan.price <= 0) continue;
  const credits = formula.creditsForRealCostOnAccount(REAL_COST_EUR, plan, null, config);
  const m = formula.achievedMarginOnAccount(credits, REAL_COST_EUR, plan, null, config);
  checkTrue(`${plan.name}: ${credits} credits, ${m.toFixed(3)}x`, credits > 0 && m >= M);
}
// Free plan too — it has no per-credit rate, so it pays the list price.
const freeCredits = formula.creditsForRealCostOnAccount(REAL_COST_EUR, PLANS[0], null, config);
checkTrue(`Free: ${freeCredits} credits, not zero`, freeCredits > 0);

console.log("\n== 3. why a flat fee cannot hold the margin ==");
// Not an opinion: the largest real cost a flat charge can cover, per plan.
console.log("   plan          EUR/credit   1 credit covers a call costing up to");
for (const plan of PLANS) {
  const rate = formula.effectiveCreditPriceEur(plan, config);
  const maxCostEur = rate / M;
  console.log(
    `   ${plan.name.padEnd(13)} ${rate.toFixed(4)}       EUR ${maxCostEur.toFixed(5)}  ($${(maxCostEur / config.usdToEurRate).toFixed(5)})`
  );
}
// A single small Sonnet turn: 1,000 in / 500 out.
const smallTurn = pricing.priceUsage({ input_tokens: 1000, output_tokens: 500 }, "claude-sonnet-4-6").usdCost;
const ultimateRate = formula.effectiveCreditPriceEur(PLANS[4], config);
checkTrue(
  `a 1k-in/500-out turn costs $${smallTurn.toFixed(4)}, more than 1 Ultimate credit can cover at ${M}x`,
  smallTurn * config.usdToEurRate > ultimateRate / M
);
check(
  "so a flat 1 credit is the wrong charge for it — it needs this many",
  formula.creditsForRealCostOnAccount(smallTurn * config.usdToEurRate, PLANS[4], null, config),
  Math.ceil((smallTurn * config.usdToEurRate * M) / ultimateRate)
);

console.log("\n== 4. the reported Ultimate scenario ==");
// Ultimate, a website generation costing EUR 0.28. 44 credits was
// reported. At EUR 0.008 per credit that is EUR 0.352 of revenue on
// EUR 0.28 of cost — 1.26x.
const COST_EUR = 0.28;
const ultimate = PLANS[4];
check("Ultimate is EUR 0.008 per credit", Number(ultimateRate.toFixed(6)), 0.008);
const shouldCharge = formula.creditsForRealCostOnAccount(COST_EUR, ultimate, null, config);
check("EUR 0.28 x 4 / EUR 0.008 = 140 credits", shouldCharge, 140);
const achieved = formula.achievedMarginOnAccount(shouldCharge, COST_EUR, ultimate, null, config);
checkTrue(`which is ${achieved.toFixed(4)}x, at or above ${M}x`, achieved >= M);
// And the reported charge, scored honestly.
const reportedMargin = formula.achievedMarginOnAccount(44, COST_EUR, ultimate, null, config);
checkTrue(`44 credits would have been ${reportedMargin.toFixed(3)}x — below ${M}x`, reportedMargin < M);
// The settled path produces 140, not 44, so a settled website generation
// cannot be the source of a 44-credit charge at this cost.
checkTrue("the settled formula does not produce 44 here", shouldCharge !== 44);

console.log("\n== 5. brute force: every plan x pack x cost clears the margin ==");
const PACKS = [null, 10 / 500, 25 / 1500, 50 / 3500, 100 / 8000];
let worst = Infinity,
  worstAt = null,
  combos = 0;
for (const plan of PLANS) {
  for (const pack of PACKS) {
    // From a trivial classifier call to a full 128k-output generation.
    for (let usd = 0.0001; usd < 3; usd *= 1.15) {
      const eur = usd * config.usdToEurRate;
      const credits = formula.creditsForRealCostOnAccount(eur, plan, pack, config);
      const m = formula.achievedMarginOnAccount(credits, eur, plan, pack, config);
      combos++;
      if (m !== null && m < worst) {
        worst = m;
        worstAt = { plan: plan.name, pack, usd: Number(usd.toFixed(6)), credits, margin: m };
      }
    }
  }
}
checkTrue(`worst of ${combos} combinations is ${worst.toFixed(6)}x, still >= ${M}`, worst >= M, JSON.stringify(worstAt));

console.log("\n== 6. worst case per plan: the CREDIT HALF of the ceiling ==");
// THIS SECTION CHECKS ONE SUBSYSTEM, and now says so — the version that
// did not is the reason a combined gate had to be written at all.
//
// It used to be labelled "AI cost <= 25% of the plan price" and passed at
// exactly 25.0%, which reads as compliance. It was not: free chat spent a
// further 18.8% outside credits entirely, for a real combined 43.8% and a
// margin of 2.28x against a stated 4x target — while this check and
// free-chat.test.mjs were both green, each measuring its own half against
// the whole allowance.
//
// The credit half is now budgeted at 1/M with M = 5 per plan, i.e. 20%,
// leaving 5% for the free-quota registry. The whole-ceiling question
// belongs to scripts/tests/combined-ceiling.test.mjs, and is asserted at
// the end of this section rather than implied by it.
const CREDIT_BUDGET_SHARE = 0.2;
console.log("   plan          credits   revenue   max AI cost   % of price   plan M");
for (const plan of PLANS) {
  if (typeof plan.price !== "number" || typeof plan.monthlyCredits !== "number" || plan.price <= 0) continue;
  const rate = formula.effectiveCreditPriceEur(plan, config);
  const planM = margin.resolveMarginFor(null, plan.slug, config, {}).margin;
  const revenue = plan.monthlyCredits * rate;
  const maxCost = revenue / planM;
  const pct = (maxCost / plan.price) * 100;
  console.log(
    `   ${plan.name.padEnd(13)} ${String(plan.monthlyCredits).padEnd(9)} EUR ${revenue.toFixed(2).padEnd(9)} EUR ${maxCost.toFixed(2).padEnd(13)} ${pct.toFixed(1).padEnd(6)}%  ${planM}x`
  );
  checkTrue(
    `${plan.name}: the credit half stays inside its ${CREDIT_BUDGET_SHARE * 100}% budget (${pct.toFixed(1)}%)`,
    pct <= CREDIT_BUDGET_SHARE * 100 + 0.001
  );
}
// The handoff, asserted rather than described, so this file cannot drift
// back into implying it checked the whole thing.
{
  const allowances = await loadTs("src/lib/billing/free-allowances.ts");
  for (const row of allowances.combinedCeilingTable(config, {})) {
    if (row.priceEur === null) continue;
    checkTrue(
      `${row.planSlug}: credits AND every free quota together clear 4x (${row.combinedMargin.toFixed(2)}x)`,
      row.combinedMargin >= 4 - 1e-9
    );
  }
}

console.log("\n== 7. the settlement path really is plan-aware ==");
// The code that makes it so, asserted rather than described.
const src = readFileSync("src/lib/billing/reservations.ts", "utf8");
checkTrue("settlement divides by the ACCOUNT's rate", /creditsForRealCostOnAccount\(realCostEur, plan, packPriceEur, config, marginPolicy\.margin\)/.test(src));
checkTrue("the plan is a required settlement input", /plan: Plan \| null;/.test(src));
checkTrue("a shortfall is logged, not swallowed", /billing:marginBelowTarget/.test(src));
const routeSrc = readFileSync("src/app/api/websites/generate/process/route.ts", "utf8");
checkTrue("the generate route resolves the real plan", /resolveEffectivePlan\(user\)/.test(routeSrc));
checkTrue("and hands it to settlement", /\n\s*plan,\n/.test(routeSrc));
// Free and Enterprise have no per-credit rate, so they must fall back to
// the LIST price — never to zero, which would divide by zero.
// Free has a real rate (its allowance is a marketing cost, and a free
// user who wants more buys at list), and so does "no plan at all". A
// CUSTOM-priced plan is different: its rate is unknowable, so it takes
// the cheapest published one instead — see section 21.
for (const plan of [PLANS[0], null, undefined]) {
  const r = formula.effectiveCreditPriceEur(plan, config);
  checkTrue(`${plan?.name ?? String(plan)} prices at the list rate`, r === config.creditPriceEur);
}
checkTrue(
  "Enterprise does NOT price at the list rate — that would under-charge a bulk deal",
  formula.effectiveCreditPriceEur(PLANS[5], config) < config.creditPriceEur
);

console.log("\n== 8. a charging settlement always charges, and always clears the bar ==");
// Production showed seven ai_cost_log rows with credits_charged = 0 and
// achieved_margin = null against EUR 0.37 of real cost. That is the exact
// signature of bypassCharge — an admin or beta-tester account, which is
// deliberately free. It is also indistinguishable, in the log, from
// billing being broken. Both halves are asserted here.
const res = readFileSync("src/lib/billing/reservations.ts", "utf8");
checkTrue("0 credits and a null margin come from bypassCharge alone", /const creditsCharged = bypassCharge\s*\?\s*0/.test(res) && /const margin = bypassCharge\s*\?\s*null/.test(res));
// So a charging settlement can never land on zero: any positive cost
// produces at least one credit, because ceil() of a positive number is.
let zeroCharges = 0,
  belowBar = 0,
  checked = 0;
for (const plan of PLANS) {
  for (const pack of PACKS) {
    for (let usd = 0.000001; usd < 3; usd *= 1.3) {
      const eur = usd * config.usdToEurRate;
      const credits = formula.creditsForRealCostOnAccount(eur, plan, pack, config);
      const m = formula.achievedMarginOnAccount(credits, eur, plan, pack, config);
      checked++;
      if (credits <= 0) zeroCharges++;
      if (m === null || m < M) belowBar++;
    }
  }
}
check(`no charging settlement yields 0 credits (${checked} checked)`, zeroCharges, 0);
check("and none yields a null or sub-target margin", belowBar, 0);

console.log("\n== 9. the alert cannot be defeated by null ==");
// An alert written as `margin < 4` treats null as healthy, because null
// is not less than 4 — so the one case it exists to catch, a margin that
// could not be computed, was the one case it stayed silent for.
checkTrue(
  "the shortfall alert fires on null as well as on a low number",
  /if \(!bypassCharge && \(margin === null \|\| margin < marginPolicy\.margin/.test(res)
);
checkTrue("and does not fire for a bypass row, which is legitimately null", /!bypassCharge &&/.test(res));
// A zero-credit row must say WHY it is zero, or the next person reading
// the cost log has to guess — which is what happened here.
checkTrue("every settled row records whether it was a bypass", /bypassCharge,\n/.test(res));
checkTrue("and what a bypass would have been charged", /wouldHaveChargedCredits: wouldHaveCharged/.test(res));
checkTrue(
  "which is computed with the same formula as a real charge",
  /wouldHaveCharged = bypassCharge\s*\n?\s*\?\s*creditsForRealCostOnAccount/.test(res)
);

console.log("\n== 10. the build gate cannot depend on the environment ==");
// The deploy broke because suites that bind a port, write into
// node_modules and drive the Anthropic SDK ran inside `next build`. A
// gate that needs a working network is not a gate, it is a coin flip.
const pkg = JSON.parse(readFileSync("package.json", "utf8"));
checkTrue("the build runs the unit suites", /npm run test:unit/.test(pkg.scripts.build));
check("unit suites are *.test.mjs", pkg.scripts["test:unit"].includes("*.test.mjs"), true);
// This file names both patterns in order to search for them, so it would
// otherwise flag itself.
const SELF = "billing-coverage.test.mjs";
// Comments are stripped before scanning, for the same reason
// scripts/tests/i18n-coverage.test.mjs strips them: a suite that documents
// WHY it does not use loadTsWithDeps was flagged for containing the word.
// A scanner that fails on its own subject's rationale teaches people to
// delete the rationale.
const stripJsComments = (src) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
for (const file of readdirSync("scripts/tests").filter((f) => f.endsWith(".test.mjs") && f !== SELF)) {
  const body = stripJsComments(readFileSync(path.join("scripts/tests", file), "utf8"));
  checkTrue(`${file} binds no port`, !/createServer\s*\(/.test(body));
  checkTrue(`${file} writes nothing into node_modules`, !/loadTsWithDeps/.test(body));
}
// Node is pinned, because Vercel otherwise picks its newest — it built
// with v24.15.0 against Next 14.2, which predates it.
check("Node is pinned for the host", pkg.engines?.node, "22.x");

console.log("\n== 11. the four converted endpoints reserve, record and settle ==");
// Each of these used to charge a flat CREDIT_COSTS number (or nothing).
// The three-phase shape is what makes the margin hold, so all three
// phases are checked, not just the settle.
for (const [label, file, feature] of [
  ["records/ask", "src/app/api/records/ask/route.ts", "ask_ai_record"],
  ["text-actions", "src/app/api/text-actions/route.ts", "text_action"],
  ["reflection/generate", "src/app/api/reflection/generate/route.ts", "weekly_reflection"],
]) {
  const body = readFileSync(file, "utf8");
  checkTrue(`${label}: estimates from real input size`, /estimateForAction\(/.test(body));
  checkTrue(`${label}: reserves before calling`, /reserveCredits\(/.test(body));
  checkTrue(`${label}: records measured usage`, /costs\.record\(/.test(body) || /, costs\)/.test(body));
  checkTrue(`${label}: settles as ${feature}`, new RegExp(`feature: "${feature}"`).test(body));
  checkTrue(`${label}: releases the hold on failure`, /releaseReservation\(/.test(body));
  checkTrue(`${label}: at the account's own rate`, /effectiveCreditPriceEurForAccount\(/.test(body) || /plan,/.test(body));
  // The old flat charge must be gone, not merely bypassed.
  checkTrue(`${label}: no flat deductCredits remains`, !/deductCredits\(/.test(body));
}
// The reservation has to be sized AFTER the thing being priced is
// loaded, or it prices a request it has not seen.
const ask = readFileSync("src/app/api/records/ask/route.ts", "utf8");
checkTrue("records/ask sizes the hold after the record loads", ask.indexOf("const systemPrompt = buildSystemPrompt") < ask.indexOf('estimateForAction(\n      "recordAsk"'));
const refl = readFileSync("src/app/api/reflection/generate/route.ts", "utf8");
checkTrue("reflection sizes the hold after the week's stats load", refl.indexOf("loadWeeklyReflectionStats") < refl.indexOf("estimateForAction"));

console.log("\n== 12. chat memory extraction is inside the chat settlement ==");
// It was a second real Claude call running AFTER settleReservation, so
// its tokens could not be billed even in principle — the accumulator was
// already spent.
const chat = readFileSync("src/app/api/chat/route.ts", "utf8");
checkTrue("extraction runs BEFORE the settle", chat.indexOf("await extractAndStoreMemory({") < chat.indexOf("await settleReservation({"));
checkTrue("and shares the turn's accumulator", /extractAndStoreMemory\(\{[\s\S]{0,400}costs,/.test(chat));
checkTrue("the extractor records its own usage", /costs\?\.record\("other", result\.usage, result\.model \|\| MEMORY_MODEL\)/.test(readFileSync("src/lib/chat/memory.ts", "utf8")));
// If the hold does not cover the second call, every chat message is
// short by exactly one Claude call.
const est = readFileSync("src/lib/billing/estimate.ts", "utf8");
checkTrue("the chat estimate holds for the extraction call too", /chatMessage: \{[\s\S]{0,600}auxiliaryCalls: \[\{ inputTokens: \d+/.test(est));
for (const profile of ["recordAsk", "textAction", "weeklyReflection"]) {
  checkTrue(`a ${profile} estimate profile exists`, new RegExp(`\\b${profile}: \\{`).test(est));
}

console.log("\n== 13. a margin shortfall reaches a person, not just a log ==");
const alert = readFileSync("src/lib/email/margin-alert.ts", "utf8");
checkTrue("settlement sends the alert", /sendMarginAlertEmail\(\{/.test(res));
checkTrue("it goes to the admins", /ADMIN_EMAILS/.test(alert));
checkTrue("null is reported as its own diagnosis, not as missing data", /could not be computed \(null\)/.test(alert));
checkTrue("it is rate limited so a systemic cause cannot flood", /COOLDOWN_MS/.test(alert));
// THE SHAPE WAS `catch {` AND THE PROPERTY IS "IT CANNOT THROW".
//
// Those are not the same claim, and the difference showed up the moment
// the catch bound its error to report it: `catch (err) {` is still a
// catch, still cannot throw, and this check went red anyway. A gate that
// fails on a fix is encoding a shape, not a property.
//
// So it is the property now, in three parts — a catch exists, it does not
// re-throw, and it is not empty — read from the code rather than the
// comments, because the prose inside that block discusses both throwing
// and logging.
const alertCode = alert.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
const CATCH = /catch\s*(?:\([^)]*\))?\s*\{/;
checkTrue("and never throws — it runs after the user was charged",
  CATCH.test(alertCode) && !/catch\s*(?:\([^)]*\))?\s*\{[^}]*\bthrow\b/.test(alertCode));
// AND THE OTHER HALF, which the old shape check could not see: an empty
// catch also never throws. The alert that says the product just sold AI
// below cost is exactly the one whose failure nobody would notice, so it
// has to leave a trace. See scripts/tests/email-silence.test.mjs.
checkTrue("...and does not swallow its own failure — this is the alert nobody would miss",
  /catch\s*\([^)]*\)\s*\{[\s\S]{0,300}?console\.error\(/.test(alertCode));

console.log("\n== 14. the environment is reported at runtime, never at build ==");
const envMod = await loadTs("src/lib/env-check.ts");
const full = {
  ...Object.fromEntries(
    [
      "NEXT_PUBLIC_SUPABASE_URL",
      "NEXT_PUBLIC_SUPABASE_ANON_KEY",
      "SUPABASE_SERVICE_ROLE_KEY",
      "ANTHROPIC_API_KEY",
      "NEXT_PUBLIC_SITE_URL",
      "STRIPE_SECRET_KEY",
      "STRIPE_WEBHOOK_SECRET",
      "CRON_SECRET",
      "RESEND_API_KEY",
    ].map((k) => [k, "set"])
  ),
  // The pricing knobs are "recommended", not optional: leaving them
  // unset is exactly how a default silently becomes the live rate.
  USD_TO_EUR_RATE: "0.92",
  CREDIT_MARGIN_MULTIPLIER: "4",
  CREDIT_PRICE_EUR: "0.02",
  // Recommended since the stale-generation incident: unset means the app
  // assumes 800s invocations, which on a smaller platform kills website
  // generations mid-work.
  MAX_FUNCTION_DURATION: "800",
  // Recommended since the refused-email incident: the resend.dev fallback
  // is testing mode, which delivers only to the Resend account owner.
  RESEND_FROM_EMAIL: "Ionexa AI <hello@ionexa.com>",
  // Recommended since the PWA audit: with no VAPID pair, lib/push
  // /web-push.ts turns every send into a silent no-op — an agent finishes,
  // a mission is due, and nothing reaches the phone that was told it
  // would. A deployment that does not want push should decide that, not
  // discover it. (A published example key: 65 bytes of P-256 point, which
  // is 87 base64url characters.)
  NEXT_PUBLIC_VAPID_PUBLIC_KEY: "BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U",
  VAPID_PRIVATE_KEY: "set",
};
let r = envMod.checkEnv(full);
check("a complete environment reports nothing missing", r.missingRequired, []);
check("...and nothing recommended missing", r.missingRecommended, []);
// A truncated or wrongly-pasted VAPID public key fails in the BROWSER, at
// subscribe() time, with an opaque InvalidCharacterError — which is the
// kind of failure an env check exists to move forward in time.
r = envMod.checkEnv({ ...full, NEXT_PUBLIC_VAPID_PUBLIC_KEY: "too-short" });
check(
  "a malformed VAPID public key is flagged",
  r.suspicious.map((x) => x.name),
  ["NEXT_PUBLIC_VAPID_PUBLIC_KEY"]
);
checkTrue("with the expected length named", /87 base64url characters/.test(r.suspicious[0].reason));
r = envMod.checkEnv({ ...full, VAPID_PRIVATE_KEY: "" });
checkTrue(
  "a missing VAPID private key is reported, not assumed",
  r.missingRecommended.includes("VAPID_PRIVATE_KEY")
);

r = envMod.checkEnv({});
check("an empty environment names every required variable", r.missingRequired.length, 5);
checkTrue("including the Anthropic key", r.missingRequired.includes("ANTHROPIC_API_KEY"));
// The value that actually cost money.
r = envMod.checkEnv({ ...full, USD_TO_EUR_RATE: "0.80" });
check("USD_TO_EUR_RATE=0.80 is flagged", r.suspicious.map((x) => x.name), ["USD_TO_EUR_RATE"]);
checkTrue("with the reason spelled out", /outside the sane range/.test(r.suspicious[0].reason));
r = envMod.checkEnv({ ...full, USD_TO_EUR_RATE: "0.92", CREDIT_MARGIN_MULTIPLIER: "2" });
check("a healthy FX rate is not flagged", r.suspicious.map((x) => x.name), ["CREDIT_MARGIN_MULTIPLIER"]);
// Production refused 20 real emails because the sender was Resend's
// shared testing address — which delivers ONLY to the account owner.
// The env report must call that out, and an unset sender must count as
// a missing recommendation, not silence.
r = envMod.checkEnv({ ...full, RESEND_FROM_EMAIL: "Ionexa AI <onboarding@resend.dev>" });
check("the resend.dev testing sender is flagged", r.suspicious.map((x) => x.name), ["RESEND_FROM_EMAIL"]);
checkTrue("with the refusal spelled out", /testing sender/.test(r.suspicious[0].reason));
r = envMod.checkEnv({ ...full, RESEND_FROM_EMAIL: undefined });
checkTrue("an unset sender is a missing recommendation", r.missingRecommended.includes("RESEND_FROM_EMAIL"));
r = envMod.checkEnv(full);
check("a verified-domain sender is clean", r.suspicious, []);
// A key of the wrong LENGTH is refused at every save with "secure storage
// is not configured", which reads as "not set" and sends whoever set it
// looking in the wrong place.
r = envMod.checkEnv({ ...full, INTEGRATION_ENCRYPTION_KEY: "too-short" });
check("a malformed encryption key is flagged", r.suspicious.map((x) => x.name), ["INTEGRATION_ENCRYPTION_KEY"]);
checkTrue("with the fix in the message", /openssl rand -hex 32/.test(r.suspicious[0].reason));
// ...and the key itself must not travel into a log to say so.
checkTrue("the malformed key's VALUE is never echoed", !JSON.stringify(r).includes("too-short"));
checkTrue(
  "nor by the formatter",
  !envMod.formatEnvReport(r).join(" ").includes("too-short")
);
r = envMod.checkEnv({ ...full, INTEGRATION_ENCRYPTION_KEY: "a".repeat(64) });
check("a 64-hex key is accepted", r.suspicious, []);
r = envMod.checkEnv({ ...full, INTEGRATION_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64url") });
check("and so is a 32-byte base64url key", r.suspicious, []);
// Secrets must never be echoed into logs.
r = envMod.checkEnv({ ...full, ANTHROPIC_API_KEY: "sk-ant-supersecret" });
checkTrue("a secret's VALUE is never echoed", !JSON.stringify(r).includes("supersecret"));
// And the check must be incapable of breaking a deploy.
const instr = readFileSync("src/instrumentation.ts", "utf8");
checkTrue("it runs from instrumentation, i.e. at startup", /export async function register/.test(instr));
checkTrue("node runtime only", /NEXT_RUNTIME !== "nodejs"/.test(instr));
checkTrue("it cannot throw or exit", !/throw |process\.exit/.test(instr) && !/throw new Error/.test(readFileSync("src/lib/env-check.ts", "utf8")));
checkTrue("and nothing in the build script validates env", !/env-check/.test(pkg.scripts.build));

console.log("\n== 15. a zero-charge row can always be explained ==");
// Production showed website_generate with credits_charged = 0 and
// achieved_margin = null. There are exactly TWO ways to produce that, and
// they were previously indistinguishable in the log — which is why the
// same row was diagnosed twice and fixed neither time.
//
//   1. bypassCharge  — admin/beta. Legitimate, no revenue by design.
//   2. realCostEur = 0 — the accumulator was never fed. A REAL bug: the
//      AI call happened and we paid for it.
//
// Both come out of the same early return, so the arithmetic really is
// identical:
check("zero cost charges zero credits", formula.creditsForRealCostOnAccount(0, PLANS[4], null, config), 0);
check("...and reports a null margin, exactly like a bypass", formula.achievedMarginOnAccount(0, 0, PLANS[4], null, config), null);
// So the row has to carry its own explanation. These three fields are
// what make the two cases tellable apart from SQL alone.
checkTrue("the row records bypassCharge", /bypassCharge,\n/.test(res));
checkTrue("the row records what a bypass would have cost", /wouldHaveChargedCredits: wouldHaveCharged/.test(res));
checkTrue("the row records how many AI calls were measured", /p_ai_calls: costs\.callCount/.test(res));
// And case 2 must be loud, not silent.
checkTrue("a zero-cost settlement is logged as an error", /billing:zeroCostSettlement/.test(res));
checkTrue("with a diagnosis naming the likely cause", /the accumulator was never fed/.test(res));
checkTrue("distinguishing an unfed accumulator from an unpriced model", /priced at zero/.test(res));

console.log("\n== 16. a failed settlement never reports success ==");
// settleReservation caught the RPC error, logged it, and returned a
// SettlementResult whose creditsCharged said the user had been charged —
// when the database had done nothing at all. The caller could not tell.
checkTrue("SettlementResult says whether it actually settled", /settled: boolean/.test(res));
// MATCHED BY BRACES, ACROSS NEWLINES. The original pattern required the
// whole return on ONE line, so adding a field to SettlementResult — which
// reformatted the object over several lines and changed nothing about the
// property being asserted — turned this red. A regex over a fixed window
// is not the fix either: settleReservation's cost-log metadata object
// repeats the same field names in the same order, so a substring count
// reads one higher than the number of returns and a missing return can
// hide behind it.
function returnObjectsOf(body) {
  const out = [];
  let idx = 0;
  while ((idx = body.indexOf("return {", idx)) !== -1) {
    let depth = 0;
    let j = idx + "return ".length;
    for (; j < body.length; j++) {
      if (body[j] === "{") depth++;
      else if (body[j] === "}") {
        depth--;
        if (depth === 0) { j++; break; }
      }
    }
    out.push(body.slice(idx, j));
    idx = j;
  }
  return out;
}
const settleReturns = returnObjectsOf(res.slice(res.indexOf("export async function settleReservation")));
const returnsWith = (needles) =>
  settleReturns.filter((r) => needles.every((needle) => r.includes(needle)));
checkTrue("settleReservation has exactly three returns", settleReturns.length === 3, String(settleReturns.length));
checkTrue(
  "both failure returns say settled: false and charge nothing",
  returnsWith(["creditsCharged: 0", "settled: false"]).length === 2
);
checkTrue("so does an unhandled throw", (res.match(/settled: false/g) ?? []).length >= 2);
checkTrue(
  "and a real settlement returns settled: true, with the margin it achieved",
  returnsWith(["achievedMargin: margin", "settled: true"]).length === 1
);
// The bypass figure has to come back out of settlement, not merely be
// written to the cost log — a caller that cannot see it has no way to say
// "unlimited (would have cost X)" and shows a bare 0 instead, which is
// what every agent run on an owner's account reported.
checkTrue(
  "every settlement return says whether the account was charged at all",
  returnsWith(["bypassCharge", "wouldHaveChargedCredits"]).length === 3
);
// A stale RPC in the database is the failure that looks like nothing,
// because PostgREST resolves overloads by argument NAME.
checkTrue("the error names the signature-mismatch possibility", /does not match the arguments sent here/.test(res));

console.log("\n== 17. every settlement step is traceable ==");
checkTrue("one line records the whole settlement", /\[billing\] settled \$\{feature\}/.test(res));
for (const field of ["aiCalls", "inputTokens", "outputTokens", "cacheWriteTokens", "cacheReadTokens", "realCostUsd", "effectiveCreditPriceEur", "planSlug", "bypassCharge", "creditsCharged", "achievedMargin", "reservationId"]) {
  checkTrue(`  it includes ${field}`, new RegExp(`${field}[,:]`).test(res.slice(res.indexOf("[billing] settled"))));
}

console.log("\n== 18. the real production row, priced on every plan and pack ==");
// website_generate, 2 AI calls, input 6064, output 14136,
// real_cost_usd $0.28640440, wouldHaveChargedCredits 53.
//
// 53 is the LIST rate. The Ultimate rate gives 132. That is not a bug:
// the rate determines the credits, so a dearer credit means FEWER of
// them, not a thinner margin. The worry it looks like — "53 credits on
// Ultimate is 1.6x" — would only be real if the charge were fixed at 53
// while the rate fell, and it never is.
const REAL_USD = 0.28640440;
const realEur = REAL_USD * config.usdToEurRate;
check("realCostEur", Number(realEur.toFixed(9)), 0.263492048);
check("at the list rate that is 53 credits", formula.creditsForRealCostOnAccount(realEur, null, null, config), 53);
check("and on Ultimate it is 132, not 53", formula.creditsForRealCostOnAccount(realEur, PLANS[4], null, config), 132);
checkTrue("53 on Ultimate WOULD be under target, which is why it is never charged there",
  (53 * formula.effectiveCreditPriceEur(PLANS[4], config)) / realEur < M);

const PACK_ROWS = [
  ["none", null],
  ["EUR 10 / 500", 10 / 500],
  ["EUR 25 / 1,500", 25 / 1500],
  ["EUR 50 / 3,500", 50 / 3500],
  ["EUR 100 / 8,000", 100 / 8000],
];
console.log("   plan          pack              EUR/cr   credits  revenue   margin");
for (const plan of PLANS) {
  for (const [packName, pack] of PACK_ROWS) {
    const rate = formula.effectiveCreditPriceEurForAccount(plan, pack, config);
    const credits = formula.creditsForRealCostOnAccount(realEur, plan, pack, config);
    const m = formula.achievedMarginOnAccount(credits, realEur, plan, pack, config);
    console.log(
      `   ${plan.name.padEnd(13)} ${packName.padEnd(17)} ${rate.toFixed(4)}   ${String(credits).padStart(5)}   EUR ${(credits * rate).toFixed(3).padEnd(7)} ${m.toFixed(4)}x`
    );
    checkTrue(`${plan.name} + ${packName}: ${credits} credits, ${m.toFixed(4)}x >= ${M}`, m >= M);
  }
}

console.log("\n== 19. every real feature, on every plan ==");
// Real real_cost_eur values straight out of production ai_cost_log,
// converted back to USD so the same pipeline prices them.
const REAL_FEATURES = [
  ["website_generate", 0.263492048],
  ["website_generate_precheck", 0.00370668],
  ["website_generate_precheck", 0.00594228],
  ["create_studio_detect", 0.00616584],
  ["chat_message", 0.03550740],
  ["chat_message", 0.03129840],
  ["chat_message", 0.03052836],
];
console.log("   feature                     EUR cost   Free  Start  Growth   Pro   Ultim  worst margin");
let worstOverall = Infinity;
for (const [feature, costEur] of REAL_FEATURES) {
  const cells = [];
  let worstHere = Infinity;
  for (const plan of PLANS.slice(0, 5)) {
    const credits = formula.creditsForRealCostOnAccount(costEur, plan, null, config);
    const m = formula.achievedMarginOnAccount(credits, costEur, plan, null, config);
    cells.push(String(credits).padStart(5));
    if (m < worstHere) worstHere = m;
    checkTrue(`${feature} on ${plan.name}: ${credits} credits, ${m.toFixed(3)}x`, m >= M);
  }
  if (worstHere < worstOverall) worstOverall = worstHere;
  console.log(`   ${feature.padEnd(27)} ${costEur.toFixed(8)} ${cells.join(" ")}   ${worstHere.toFixed(4)}x`);
}
checkTrue(`worst margin across every real feature x plan is ${worstOverall.toFixed(4)}x`, worstOverall >= M);
// The smallest real cost is the tightest case: ceil() rounds a tiny
// charge up to a whole credit, so margin goes UP, never down.
checkTrue("a tiny call still clears the bar", formula.achievedMarginOnAccount(
  formula.creditsForRealCostOnAccount(0.00370668, PLANS[4], null, config), 0.00370668, PLANS[4], null, config) >= M);

console.log("\n== 20. bypass does not distort what a normal user would pay ==");
// wouldHaveChargedCredits exists to answer "what would a normal user on
// this plan have paid". It used to skip the credit-pack lookup entirely
// for bypass accounts (`bypassCharge ? null : await ...`), so for anyone
// holding a pack the figure came out low — the cheapest pack is
// EUR 0.0125 against a EUR 0.02 list price, a 37% understatement.
checkTrue("the pack rate is fetched regardless of bypass", /const packPriceEur = await getPurchasedPackCreditPriceEur\(userId\);/.test(res));
checkTrue("and the hypothetical charge uses it", /wouldHaveCharged = bypassCharge[\s\S]{0,160}creditsForRealCostOnAccount\(realCostEur, plan, packPriceEur, config, marginPolicy\.margin\)/.test(res));
// It must be the SAME function a real charge goes through, or the two
// can drift apart silently.
const chargeExpr = /creditsForRealCostOnAccount\(realCostEur, plan, packPriceEur, config, marginPolicy\.margin\)/g;
checkTrue("computed by the same function as a real charge", (res.match(chargeExpr) ?? []).length >= 2);
// And the row says which plan produced the number, so it can be checked.
checkTrue("the row records the plan it priced against", /planSlug: plan\?\.slug \?\? null/.test(res));
// Concretely: a bypass account holding the cheapest pack.
const packRate = 100 / 8000;
check("a pack holder would have paid 85 credits, not 53",
  formula.creditsForRealCostOnAccount(realEur, null, packRate, config), 85);
checkTrue("which is still >= 4x", formula.achievedMarginOnAccount(85, realEur, null, packRate, config) >= M);

console.log("\n== 21. plan resolution: the tier decides the rate, so it must be right ==");
// PRODUCTION: an owner/admin generation logged planSlug "free" and
// wouldHaveChargedCredits 53, when the owner's real tier prices the same
// EUR 0.2635 at 132. Two precheck rows logged planSlug NULL.
//
// resolvePlanSlug reads ONE place — user_metadata.subscription_tier — and
// nothing else. An owner never bought a subscription, so that field is
// unset and the function fell through to "free". Admin status lives in
// ADMIN_EMAILS, a completely separate axis, which billing never consulted
// even though pricing/page.tsx, team/invite and dashboard/team all do.
// The rule moved to lib/billing/plan-resolution.ts — pure, so it can be
// unit-tested without a Supabase client, which credits.ts cannot.
// credits.ts re-exports it, so no caller changed.
const planResolution = readFileSync("src/lib/billing/plan-resolution.ts", "utf8");
checkTrue(
  "credits.ts still exports it, so no caller had to change",
  /export \{ resolvePlanSlug, resolvePlan \}/.test(readFileSync("src/lib/billing/credits.ts", "utf8"))
);
checkTrue("subscription_tier is read", /user\?\.user_metadata\?\.subscription_tier/.test(planResolution));
// AND A SECOND SOURCE, deliberately. `subscription_tier` is what the
// account pays for; `team_granted_tier` is what a team owner lends it.
// They used to be ONE field, and each write destroyed the other — which is
// how leaving a team cancelled a subscription Stripe was still charging
// for. The answer is the HIGHER of the two, never the more recent.
checkTrue("...and so is team_granted_tier", /user\?\.user_metadata\?\.team_granted_tier/.test(planResolution));
checkTrue("...combined by taking the higher", /higherPlanSlug\(/.test(planResolution));
checkTrue("an admin no longer falls through to free", /if \(isAdminEmail\(user\?\.email\)\) return "enterprise";/.test(planResolution));
checkTrue("...matching what the rest of the app already calls an admin",
  /isAdmin \? "enterprise"/.test(readFileSync("src/app/pricing/page.tsx", "utf8")));

// Enterprise is priced per deal, so its per-credit rate is unknowable.
// It used to fall back to the LIST price — the most EXPENSIVE rate in the
// product, and therefore the least safe guess for a bulk contract.
const ENT = PLANS[5];
// THE NUMBER MOVED WHEN ANNUAL BILLING SHIPPED, and it moved in the safe
// direction. "The cheapest published rate" was Ultimate monthly
// (EUR 200 / 25,000 = EUR 0.008) until annual existed; annual Ultimate
// sells the same credits at ten monthly payments over 300,000, so that is
// now the cheapest rate a customer can actually reach and therefore the
// only safe assumption for a negotiated Enterprise contract.
//
// The assertions below are written against the DERIVED value rather than
// a fresh hardcoded one, so the next plan or interval that undercuts it
// updates this test's expectation by construction instead of turning it
// red. What is pinned is the property: Enterprise never prices above the
// cheapest reachable rate, and the charge never goes DOWN when a cheaper
// rate appears.
const cheapest = formula.cheapestPublishedCreditPriceEur(config);
// DERIVED, because this was the literal 0.0064 — true only while the
// annual discount was 20%. Two months free makes it 0.006667, and a
// pinned literal turns a correct pricing change into a red build.
check(
  "the cheapest published rate now includes annual",
  Number(cheapest.toFixed(6)),
  Number(((200 * ANNUAL_MONTHS_CHARGED) / 300_000).toFixed(6))
);
check(
  "Enterprise prices at exactly that rate",
  Number(formula.effectiveCreditPriceEur(ENT, config).toFixed(8)),
  Number(cheapest.toFixed(8))
);
const entCredits = formula.creditsForRealCostOnAccount(realEur, ENT, null, config);
// Same shape: 165 was this row at the 20% floor. The charge scales
// inversely with the rate, so it is asserted against the pre-annual 132
// scaled by how far the floor moved, not against a fresh literal.
const PRE_ANNUAL_ROW = 132;
const PRE_ANNUAL_FLOOR = 200 / 25_000; // Ultimate MONTHLY
check(
  `so the real production row is ${PRE_ANNUAL_ROW} scaled by the floor (${entCredits}), not 53`,
  Math.abs(entCredits - PRE_ANNUAL_ROW * (PRE_ANNUAL_FLOOR / cheapest)) <= 1,
  true
);
checkTrue(
  "and never fewer than the 132 it was before annual existed",
  entCredits >= 132,
  `got ${entCredits}`
);
checkTrue("which clears the bar", formula.achievedMarginOnAccount(entCredits, realEur, ENT, null, config) >= M);
checkTrue("and the helper is derived from PLANS, not hardcoded",
  /for \(const plan of PLANS\)/.test(readFileSync("src/lib/billing/credit-formula.ts", "utf8")));
// Free is a real rate, not an unknown one: its allowance is a marketing
// cost and a free user who wants more buys at list. It must NOT move.
check("Free still prices at list", formula.effectiveCreditPriceEur(PLANS[0], config), config.creditPriceEur);

console.log("\n== 22. a real user's tier, through every lifecycle step ==");
const meta = (tier) => ({ id: "u", email: "user@example.com", user_metadata: tier ? { subscription_tier: tier } : {} });
check("brand-new user -> free", formula.effectiveCreditPriceEur(null, config), config.creditPriceEur);
for (const [label, tier, expectedRate] of [
  ["subscribed to Starter", "starter", 0.02],
  ["upgraded to Growth", "growth", 50 / 3000],
  ["upgraded to Professional", "professional", 0.01],
  ["upgraded to Ultimate", "ultimate", 0.008],
  ["cancelled, back to free", "free", 0.02],
]) {
  const plan = PLANS.find((p) => p.name.toLowerCase() === tier) ?? PLANS[0];
  check(`${label}: EUR ${expectedRate.toFixed(6)} per credit`, Number(formula.effectiveCreditPriceEur(plan, config).toFixed(8)), Number(expectedRate.toFixed(8)));
}
// Stripe is what writes the tier. If it ever stopped, every paying
// customer would silently be billed as free — this is the line that
// prevents that, so it is asserted rather than assumed.
const stripeHook = readFileSync("src/app/api/webhooks/stripe/route.ts", "utf8");
checkTrue("the Stripe webhook writes subscription_tier", /subscription_tier: planSlug/.test(stripeHook));
checkTrue("signup seeds a tier so the field is never absent", /subscription_tier:/.test(readFileSync("src/app/api/signup/route.ts", "utf8")));
checkTrue("and the auth callback backfills one for older accounts", /subscription_tier: "free"/.test(readFileSync("src/app/auth/callback/route.ts", "utf8")));

console.log("\n== 23. planSlug is never null in a settled row ==");
// Two production rows logged planSlug null, because several routes did
// `bypassCredits ? null : await resolveEffectivePlan(user)`. The saving
// was one metadata read; the cost was that admin and beta rows could not
// be checked against anything, and wouldHaveChargedCredits priced them
// at the list rate instead of the account's own.
const ROUTES_THAT_SETTLE = [
  "src/app/api/records/ask/route.ts",
  "src/app/api/text-actions/route.ts",
  "src/app/api/documents/[id]/pdf/route.ts",
  "src/app/api/reflection/generate/route.ts",
  "src/app/api/websites/generate/route.ts",
  "src/app/api/websites/generate/process/route.ts",
  "src/app/api/automations/create/route.ts",
  "src/app/api/cron/scheduled-runs/route.ts",
  "src/app/api/chat/route.ts",
  "src/app/api/create/route.ts",
  "src/app/api/create-studio/detect/route.ts",
  "src/app/api/mission/plan/route.ts",
];
for (const file of ROUTES_THAT_SETTLE) {
  const body = readFileSync(file, "utf8");
  checkTrue(
    `${file.replace("src/app/api/", "")}: no conditionally-null plan`,
    !/(bypassCredits|isAdmin|bypassCharge)\s*\?\s*null\s*:\s*await resolveEffectivePlan/.test(body) &&
      !/\|\s*null\s*=\s*(bypassCredits|isAdmin)\s*\n?\s*\?\s*null/.test(body)
  );
}

console.log("\n== 24. a vanished website row is a refund, not a JSON coercion error ==");
// Production logged "Cannot coerce the result to a single JSON object"
// (PGRST116): the post-generation save used .single(), so a row deleted
// mid-generation — by the user, or by the stale reaper racing a retry —
// surfaced as a JSON error and the response pretended the save merely
// failed. Both save paths must treat the vanished row as its own case:
// release the hold and say plainly that nothing was charged.
for (const [label, file] of [
  ["generate/process", "src/app/api/websites/generate/process/route.ts"],
  ["edit", "src/app/api/websites/edit/route.ts"],
]) {
  const body = stripJsComments(readFileSync(file, "utf8"));
  checkTrue(`${label}: the save-result update tolerates a vanished row`, /\.update\(\{[\s\S]{0,900}?\.select\(\)\s*\.maybeSingle\(\)/.test(body));
  checkTrue(`${label}: no save-path .single() left to coerce`, !/\.update\(\{[\s\S]{0,900}?\.select\(\)\s*\.single\(\)/.test(body));
  checkTrue(`${label}: a vanished row releases the hold`, /\(updateError \|\| !updatedRecord\)[\s\S]{0,700}?releaseReservation\(/.test(body));
  checkTrue(`${label}: and says nothing was charged`, /Nothing was charged\./.test(body));
  checkTrue(`${label}: as a 410, not a 500`, /status: updateError \? 500 : 410/.test(body));
}

console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
