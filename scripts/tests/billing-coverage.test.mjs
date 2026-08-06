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
  "src/app/api/create/route.ts": { calls: 1, billing: "settled" },
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
checkTrue("the classifier records its own usage", /costs\?\.record\("classification", response\.usage, MODEL\)/.test(readFileSync("src/lib/lead-classification.ts", "utf8")));
// The abuse ceiling that was already there, asserted so it cannot be
// removed without noticing: an unpaid flood is capped per website/hour.
checkTrue("a per-website hourly cap still gates the endpoint", /MAX_SUBMISSIONS_PER_HOUR = \d+/.test(form));
checkTrue("checked before the AI call, not after", form.indexOf("MAX_SUBMISSIONS_PER_HOUR") < form.indexOf("classifyLeadMessage(apiKey"));
checkTrue("and a honeypot rejects bots earlier still", /_hp/.test(form));
// A visitor must never see the form fail because the OWNER is broke.
checkTrue("an unaffordable classification degrades, it does not 4xx", /if \(affordable\.ok\)/.test(form));

const PLANS = [
  { name: "Free", price: 0, monthlyCredits: 100 },
  { name: "Starter", price: 20, monthlyCredits: 1000 },
  { name: "Growth", price: 50, monthlyCredits: 3000 },
  { name: "Professional", price: 100, monthlyCredits: 10000 },
  { name: "Ultimate", price: 200, monthlyCredits: 25000 },
  { name: "Enterprise", price: "custom", monthlyCredits: "custom" },
];

console.log("\n== 2c. a normal user IS charged for a website generation ==");
// Production showed website_generate at 0 credits. That is bypassCharge
// — admin and beta accounts are free by design, and the owner's own
// email is a hardcoded admin. For everyone else the same EUR 0.255 costs
// real credits, which is what this asserts.
const REAL_COST_EUR = 0.25531762; // the exact production row
const adminSrc = readFileSync("src/lib/admin.ts", "utf8");
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

console.log("\n== 6. worst case per plan: spend the whole allowance on one action ==");
// The guarantee restated as the business rule: if every credit is spent
// at >= Mx, total AI cost can never exceed 1/M of revenue.
console.log("   plan          credits   revenue   max AI cost   % of price");
for (const plan of PLANS) {
  if (typeof plan.price !== "number" || typeof plan.monthlyCredits !== "number" || plan.price <= 0) continue;
  const rate = formula.effectiveCreditPriceEur(plan, config);
  const revenue = plan.monthlyCredits * rate;
  const maxCost = revenue / M;
  const pct = (maxCost / plan.price) * 100;
  console.log(
    `   ${plan.name.padEnd(13)} ${String(plan.monthlyCredits).padEnd(9)} EUR ${revenue.toFixed(2).padEnd(9)} EUR ${maxCost.toFixed(2).padEnd(13)} ${pct.toFixed(1)}%`
  );
  checkTrue(`${plan.name}: AI cost <= 25% of the plan price (${pct.toFixed(1)}%)`, pct <= 25.001);
}

console.log("\n== 7. the settlement path really is plan-aware ==");
// The code that makes it so, asserted rather than described.
const src = readFileSync("src/lib/billing/reservations.ts", "utf8");
checkTrue("settlement divides by the ACCOUNT's rate", /creditsForRealCostOnAccount\(realCostEur, plan, packPriceEur, config\)/.test(src));
checkTrue("the plan is a required settlement input", /plan: Plan \| null;/.test(src));
checkTrue("a shortfall is logged, not swallowed", /billing:marginBelowTarget/.test(src));
const routeSrc = readFileSync("src/app/api/websites/generate/process/route.ts", "utf8");
checkTrue("the generate route resolves the real plan", /resolveEffectivePlan\(user\)/.test(routeSrc));
checkTrue("and hands it to settlement", /\n\s*plan,\n/.test(routeSrc));
// Free and Enterprise have no per-credit rate, so they must fall back to
// the LIST price — never to zero, which would divide by zero.
for (const plan of [PLANS[0], PLANS[5], null, undefined]) {
  const r = formula.effectiveCreditPriceEur(plan, config);
  checkTrue(`${plan?.name ?? String(plan)} falls back to the list price`, r === config.creditPriceEur);
}

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
  /if \(!bypassCharge && \(margin === null \|\| margin < config\.marginMultiplier/.test(res)
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
for (const file of readdirSync("scripts/tests").filter((f) => f.endsWith(".test.mjs") && f !== SELF)) {
  const body = readFileSync(path.join("scripts/tests", file), "utf8");
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
checkTrue("the extractor records its own usage", /costs\?\.record\("other", result\.usage, MEMORY_MODEL\)/.test(readFileSync("src/lib/chat/memory.ts", "utf8")));
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
checkTrue("and never throws — it runs after the user was charged", /catch \{[\s\S]{0,120}\}/.test(alert));

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
};
let r = envMod.checkEnv(full);
check("a complete environment reports nothing missing", r.missingRequired, []);
check("...and nothing recommended missing", r.missingRecommended, []);
r = envMod.checkEnv({});
check("an empty environment names every required variable", r.missingRequired.length, 5);
checkTrue("including the Anthropic key", r.missingRequired.includes("ANTHROPIC_API_KEY"));
// The value that actually cost money.
r = envMod.checkEnv({ ...full, USD_TO_EUR_RATE: "0.80" });
check("USD_TO_EUR_RATE=0.80 is flagged", r.suspicious.map((x) => x.name), ["USD_TO_EUR_RATE"]);
checkTrue("with the reason spelled out", /outside the sane range/.test(r.suspicious[0].reason));
r = envMod.checkEnv({ ...full, USD_TO_EUR_RATE: "0.92", CREDIT_MARGIN_MULTIPLIER: "2" });
check("a healthy FX rate is not flagged", r.suspicious.map((x) => x.name), ["CREDIT_MARGIN_MULTIPLIER"]);
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
checkTrue("an RPC error returns settled: false", /return \{ creditsCharged: 0[^}]*settled: false \}/.test(res));
checkTrue("so does an unhandled throw", (res.match(/settled: false/g) ?? []).length >= 2);
checkTrue("and a real settlement returns settled: true", /achievedMargin: margin, settled: true \}/.test(res));
// A stale RPC in the database is the failure that looks like nothing,
// because PostgREST resolves overloads by argument NAME.
checkTrue("the error names the signature-mismatch possibility", /does not match the arguments sent here/.test(res));

console.log("\n== 17. every settlement step is traceable ==");
checkTrue("one line records the whole settlement", /\[billing\] settled \$\{feature\}/.test(res));
for (const field of ["aiCalls", "inputTokens", "outputTokens", "cacheWriteTokens", "cacheReadTokens", "realCostUsd", "effectiveCreditPriceEur", "planSlug", "bypassCharge", "creditsCharged", "achievedMargin", "reservationId"]) {
  checkTrue(`  it includes ${field}`, new RegExp(`${field}[,:]`).test(res.slice(res.indexOf("[billing] settled"))));
}

console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
