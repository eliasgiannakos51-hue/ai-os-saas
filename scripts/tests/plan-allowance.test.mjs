// "1,000 credits/month" is not a promise anyone can check. This suite
// exists because the moment you turn it into "~19 websites a month" it
// BECOMES one — and a promise about what a plan buys is exactly the kind
// of number that rots quietly: someone edits an estimator profile, the
// margin machinery keeps working perfectly, and the pricing page goes on
// claiming a figure that stopped being true.
//
// So every assertion here re-derives the published number from the same
// formula settlement uses and fails if they differ. Nothing is compared
// against a figure typed into this file except the four the business
// actually fixed: the plan prices, the allowances, the multiplier and the
// exchange rate.
//
// The other half of the suite covers the insufficient-credits panel,
// where the interesting bugs are not arithmetic but ADVICE: a suggestion
// to shorten a description that would still not fit, a credit pack that
// does not actually cover the action once its own rate is applied, an
// upgrade recommended on a plan whose allowance cannot pay for the thing
// being upgraded for. Each of those is a specific test below.
//
// Run: node scripts/tests/plan-allowance.test.mjs
import { readFileSync } from "node:fs";

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
const allowanceMod = await loadTs("src/lib/billing/plan-allowance.ts");
const shortfallMod = await loadTs("src/lib/billing/shortfall.ts");
const plansMod = await loadTs("src/lib/billing/plans.ts");
const formula = await loadTs("src/lib/billing/credit-formula.ts");
const estimateMod = await loadTs("src/lib/billing/estimate.ts");
const configMod = await loadTs("src/lib/billing/pricing-config.ts");

const config = configMod.resolvePricingConfig();
const M = config.marginMultiplier;
const { PLANS, getPlan, CREDIT_PACKS } = plansMod;
const { planAllowance, allAllowances, headlineRows, ALLOWANCE_ACTIONS, actionCostUsd, MIN_SAMPLES_FOR_MEASURED } =
  allowanceMod;
const { describeShortfall } = shortfallMod;

// ---------------------------------------------------------------------
// 0. The premise. Every number below is only meaningful if these four
//    are what the business actually sells, so they are pinned here and
//    nowhere else.
// ---------------------------------------------------------------------
console.log("== 0. the published plans ==");
check("margin multiplier", M, 4);
check("USD -> EUR", config.usdToEurRate, 0.92);
check(
  "plan allowances",
  PLANS.map((p) => [p.slug, p.price, p.monthlyCredits]),
  [
    ["free", 0, 100],
    ["starter", 20, 1000],
    ["growth", 50, 3000],
    ["professional", 100, 10000],
    ["ultimate", 200, 25000],
    ["enterprise", "custom", "custom"],
  ]
);

// ---------------------------------------------------------------------
// 1. THE ONE THAT MATTERS. The allowance figures must not be able to
//    break the 4x floor, because they are computed from the same formula
//    that enforces it. Proven per plan, per action, by valuing the quoted
//    credits at that plan's own euro-per-credit rate.
// ---------------------------------------------------------------------
console.log("\n== 1. no allowance figure breaks 4x ==");
{
  let worst = Infinity;
  let worstLabel = "";
  let rows = 0;
  for (const plan of PLANS) {
    const rate = formula.effectiveCreditPriceEur(plan, config);
    const allowance = planAllowance(plan, undefined, config);
    for (const row of allowance.rows) {
      const action = ALLOWANCE_ACTIONS.find((a) => a.key === row.key);
      const costUsd = actionCostUsd(action, undefined, config).usd;
      const costEur = formula.usdToEur(costUsd, config);
      const achieved = (row.creditsPerAction * rate) / costEur;
      rows++;
      if (achieved < worst) {
        worst = achieved;
        worstLabel = `${plan.slug}/${row.key}`;
      }
    }
  }
  checkTrue("every plan x action row was priced", rows >= 25, `only ${rows}`);
  checkTrue(
    `worst achieved margin >= ${M}x (${worst.toFixed(4)}x at ${worstLabel})`,
    worst >= M,
    `${worstLabel} achieved ${worst}`
  );
}

// ---------------------------------------------------------------------
// 2. The counts are floors, and they are the plan's own arithmetic.
// ---------------------------------------------------------------------
console.log("\n== 2. perMonth is floor(allowance / cost), never rounded up ==");
for (const plan of PLANS) {
  if (typeof plan.monthlyCredits !== "number") continue;
  const allowance = planAllowance(plan, undefined, config);
  for (const row of allowance.rows) {
    const expected = Math.floor(plan.monthlyCredits / row.creditsPerAction);
    check(`${plan.slug}/${row.key} perMonth`, row.perMonth, expected);
    checkTrue(
      `${plan.slug}/${row.key} the quoted count really fits`,
      row.perMonth * row.creditsPerAction <= plan.monthlyCredits,
      `${row.perMonth} x ${row.creditsPerAction} > ${plan.monthlyCredits}`
    );
  }
}

// ---------------------------------------------------------------------
// 3. A plan never advertises an action it cannot perform, and never
//    advertises "0" of one it can.
// ---------------------------------------------------------------------
console.log("\n== 3. nothing is quoted that the plan cannot do ==");
{
  const free = planAllowance(getPlan("free"), undefined, config);
  check(
    "Free quotes no websites (websiteBuilder is false on Free)",
    free.rows.some((r) => r.key === "website"),
    false
  );
  check(
    "Free quotes no agent runs (maxAiAgents is 0 on Free)",
    free.rows.some((r) => r.key === "agentRun"),
    false
  );
  const starter = planAllowance(getPlan("starter"), undefined, config);
  check(
    "Starter does quote websites",
    starter.rows.some((r) => r.key === "website"),
    true
  );

  for (const allowance of allAllowances(undefined, config)) {
    for (const row of headlineRows(allowance)) {
      checkTrue(
        `${allowance.slug} headline "${row.key}" is not zero`,
        row.perMonth > 0,
        `a card reading "~0 ${row.key}" is worse than saying nothing`
      );
    }
  }
  // Enterprise has no published allowance to divide, so it must quote
  // nothing rather than quote zero.
  check("Enterprise headlines nothing", headlineRows(allAllowances(undefined, config)[5]), []);
}

// ---------------------------------------------------------------------
// 4. Measured data. The whole point of reading ai_cost_log is that the
//    published figure tracks reality — but only once there is enough of
//    it to be a fact rather than an anecdote.
// ---------------------------------------------------------------------
console.log("\n== 4. measured medians replace estimates, above the sample floor ==");
{
  const website = ALLOWANCE_ACTIONS.find((a) => a.key === "website");
  const estimated = actionCostUsd(website, undefined, config);
  check("with no data at all, the source is the estimator", estimated.source, "estimated");
  checkTrue("the estimate is a real number", estimated.usd > 0, String(estimated.usd));

  const thin = actionCostUsd(
    website,
    { website_generate: { medianUsd: 9.99, samples: MIN_SAMPLES_FOR_MEASURED - 1 } },
    config
  );
  check("below the sample floor, measured data is ignored", thin.source, "estimated");
  check("...and the number is the estimate, not the anecdote", thin.usd, estimated.usd);

  const solid = actionCostUsd(
    website,
    { website_generate: { medianUsd: 0.27227305, samples: 42 } },
    config
  );
  check("at/above the floor, the median is used", solid.source, "measured");
  check("...and it is the median itself", solid.usd, 0.27227305);
  check("...with the sample count carried through", solid.samples, 42);

  // An action billed under two feature names (a human-started agent run
  // and a cron-started one) must combine them by weight, not pick one.
  const agent = ALLOWANCE_ACTIONS.find((a) => a.key === "agentRun");
  const combined = actionCostUsd(
    agent,
    { agent_run: { medianUsd: 0.1, samples: 10 }, scheduled_agent_run: { medianUsd: 0.2, samples: 30 } },
    config
  );
  check("two feature names combine by sample weight", Number(combined.usd.toFixed(8)), 0.175);
  check("...and report the combined sample count", combined.samples, 40);

  // And the headline number really moves when the measurement does.
  const cheap = planAllowance(
    getPlan("starter"),
    { website_generate: { medianUsd: 0.27227305, samples: 42 } },
    config
  );
  const dear = planAllowance(
    getPlan("starter"),
    { website_generate: { medianUsd: 1.5, samples: 42 } },
    config
  );
  const cheapRow = cheap.rows.find((r) => r.key === "website");
  const dearRow = dear.rows.find((r) => r.key === "website");
  checkTrue(
    `a 5.5x more expensive median buys fewer websites (${cheapRow.perMonth} -> ${dearRow.perMonth})`,
    dearRow.perMonth < cheapRow.perMonth,
    `${cheapRow.perMonth} vs ${dearRow.perMonth}`
  );
}

// ---------------------------------------------------------------------
// 5. The numbers the owner asked to see by hand, recomputed here.
//    $1.50 of real cost, at 4x, on every plan's own rate.
// ---------------------------------------------------------------------
console.log("\n== 5. the hand-computed per-plan charge for a $1.50 action ==");
{
  const eur = formula.usdToEur(1.5, config);
  check("$1.50 in EUR", Number(eur.toFixed(4)), 1.38);
  const expected = { free: 276, starter: 276, growth: 332, professional: 552, ultimate: 690 };
  for (const [slug, credits] of Object.entries(expected)) {
    const plan = getPlan(slug);
    check(`${slug} charges`, formula.creditsForRealCostOnPlan(eur, plan, config), credits);
    const achieved = formula.achievedMarginOnPlan(credits, eur, plan, config);
    checkTrue(`${slug} still clears ${M}x (${achieved.toFixed(3)}x)`, achieved >= M, String(achieved));
  }
  // And the real measured generation from the production cost log.
  const realEur = formula.usdToEur(0.27227305, config);
  check(
    "the logged $0.27227305 generation on Ultimate",
    formula.creditsForRealCostOnPlan(realEur, getPlan("ultimate"), config),
    126
  );
  check(
    "...and on Starter, which is the plan the shortfall complaint was about",
    formula.creditsForRealCostOnPlan(realEur, getPlan("starter"), config),
    51
  );
}

// ---------------------------------------------------------------------
// 6. The shortfall panel: arithmetic.
// ---------------------------------------------------------------------
console.log("\n== 6. shortfall arithmetic ==");
const baseInput = {
  action: "websiteGenerate",
  model: "claude-sonnet-4-6",
  inputChars: 2000,
  imageCount: 0,
  available: 30,
  plan: getPlan("starter"),
  purchasedPackPriceEur: null,
};
{
  const s = describeShortfall(baseInput, config);
  check("shortfall = needed - available", s.shortfall, s.needed - s.available);
  checkTrue("needed is a real reserve", s.needed > 0, String(s.needed));
  checkTrue(
    `the floor is below the full request (${s.floorCredits} < ${s.needed})`,
    s.floorCredits < s.needed,
    "an empty description must cost less than a long one, or the estimator is not size-sensitive"
  );
  // needed must be EXACTLY what the reservation will ask for — a panel
  // that quotes a different number than the route holds is the bug this
  // whole flow exists to avoid.
  const rate = formula.effectiveCreditPriceEurForAccount(getPlan("starter"), null, config);
  const direct = estimateMod.estimateForAction(
    "websiteGenerate",
    { model: "claude-sonnet-4-6", inputChars: 2000, imageCount: 0 },
    config,
    rate
  ).reserveCredits;
  check("the quoted 'needed' is the reservation, not a second estimate", s.needed, direct);
}

// ---------------------------------------------------------------------
// 7. The simplification advice must be TRUE — the suggested version has
//    to actually fit, and the quoted price has to be the price.
// ---------------------------------------------------------------------
console.log("\n== 7. the simplification suggestion is honest ==");
{
  const rate = formula.effectiveCreditPriceEurForAccount(getPlan("starter"), null, config);
  const priceAt = (chars, images = 0) =>
    estimateMod.estimateForAction(
      "websiteGenerate",
      { model: "claude-sonnet-4-6", inputChars: chars, imageCount: images },
      config,
      rate
    ).reserveCredits;

  // A balance chosen to sit BETWEEN the floor and the full request, which
  // is the only regime where "describe it more simply" is real advice.
  const floor = priceAt(0);
  const full = priceAt(6000);
  const available = Math.floor((floor + full) / 2);
  const s = describeShortfall(
    { ...baseInput, inputChars: 6000, available },
    config
  );
  checkTrue(`a simpler option was offered (floor ${floor}, full ${full}, have ${available})`, s.simpler !== null);
  if (s.simpler) {
    check("the quoted price of the simpler version is its real price", s.simpler.credits, priceAt(s.simpler.inputChars));
    checkTrue(
      `the simpler version actually fits (${s.simpler.credits} <= ${available})`,
      s.simpler.credits <= available
    );
    checkTrue("the simpler version is genuinely cheaper", s.simpler.credits < s.needed);
    checkTrue("it is shorter than what the user wrote", s.simpler.inputChars < 6000);
    // Maximal: one character more must not fit. This is what makes it a
    // suggestion rather than an arbitrary smaller number — advising a
    // 200-character rewrite when 4,000 would have fitted is bad advice
    // that no "does it fit" assertion would catch.
    checkTrue(
      `it is the LARGEST description that fits (${s.simpler.inputChars} chars; +1 costs ${priceAt(
        s.simpler.inputChars + 1
      )})`,
      priceAt(s.simpler.inputChars + 1) > available || s.simpler.inputChars + 1 > 6000
    );
  }

  // Below the floor there is no honest advice to give, and the panel must
  // say so instead of suggesting a rewrite that cannot work.
  const hopeless = describeShortfall({ ...baseInput, inputChars: 6000, available: floor - 1 }, config);
  check("below the floor, no simplification is offered", hopeless.simpler, null);
  checkTrue("...and the floor is reported so the UI can explain why", hopeless.floorCredits >= floor);

  // A trivial saving is not an option worth showing.
  const barely = describeShortfall({ ...baseInput, inputChars: 6000, available: full - 1 }, config);
  if (barely.simpler) {
    checkTrue(
      `a suggestion, if shown, is a real reduction (${barely.simpler.shrinkPercent}%)`,
      barely.simpler.shrinkPercent >= 5 || barely.simpler.dropImages
    );
  } else {
    check("a 1-credit saving is not dressed up as an option", barely.simpler, null);
  }

  // Images: keep them if trimming text is enough, drop them only if not.
  const withImages = { ...baseInput, inputChars: 6000, imageCount: 3 };
  const enoughForText = describeShortfall(
    { ...withImages, available: priceAt(1000, 3) },
    config
  );
  if (enoughForText.simpler) {
    check("images the user chose are kept when trimming text suffices", enoughForText.simpler.dropImages, false);
  }
  const onlyWithoutImages = describeShortfall(
    { ...withImages, available: priceAt(0, 0) },
    config
  );
  if (onlyWithoutImages.simpler) {
    check(
      "images are only dropped when nothing else fits",
      onlyWithoutImages.simpler.dropImages,
      true
    );
    check(
      "...and the price quoted is the no-image price",
      onlyWithoutImages.simpler.credits,
      priceAt(onlyWithoutImages.simpler.inputChars, 0)
    );
  }
}

// ---------------------------------------------------------------------
// 8. THE SUBTLE ONE. Buying a pack lowers the account's effective
//    per-credit rate, which RAISES what the action costs in credits. A
//    pack picked by "credits >= today's shortfall" can therefore fail to
//    cover the very action it was recommended for.
// ---------------------------------------------------------------------
console.log("\n== 8. a recommended pack actually covers the action ==");
{
  for (const available of [0, 5, 30, 100, 250]) {
    const s = describeShortfall({ ...baseInput, inputChars: 8000, available }, config);
    if (!s.pack) {
      // Legitimate only if NO pack covers it. Prove that rather than
      // accepting silence.
      let anyCovers = false;
      for (const pack of CREDIT_PACKS) {
        const rateAfter = formula.effectiveCreditPriceEurForAccount(
          getPlan("starter"),
          pack.price / pack.credits,
          config
        );
        const after = estimateMod.estimateForAction(
          "websiteGenerate",
          { model: "claude-sonnet-4-6", inputChars: 8000, imageCount: 0 },
          config,
          rateAfter
        ).reserveCredits;
        if (available + pack.credits >= after) anyCovers = true;
      }
      check(`have ${available}: no pack offered, and none would have worked`, anyCovers, false);
      continue;
    }
    const pack = CREDIT_PACKS.find((p) => p.id === s.pack.id);
    const rateAfter = formula.effectiveCreditPriceEurForAccount(
      getPlan("starter"),
      pack.price / pack.credits,
      config
    );
    const realCostAfter = estimateMod.estimateForAction(
      "websiteGenerate",
      { model: "claude-sonnet-4-6", inputChars: 8000, imageCount: 0 },
      config,
      rateAfter
    ).reserveCredits;
    check(
      `have ${available}: quoted post-purchase price is the real one`,
      s.pack.creditsAfterPurchase,
      realCostAfter
    );
    checkTrue(
      `have ${available}: the ${s.pack.id} pack really covers it (${available} + ${s.pack.credits} >= ${realCostAfter})`,
      available + s.pack.credits >= realCostAfter
    );
    // And it is the cheapest one that does.
    const cheaper = CREDIT_PACKS.filter((p) => p.price < s.pack.price);
    for (const p of cheaper) {
      const r = formula.effectiveCreditPriceEurForAccount(getPlan("starter"), p.price / p.credits, config);
      const after = estimateMod.estimateForAction(
        "websiteGenerate",
        { model: "claude-sonnet-4-6", inputChars: 8000, imageCount: 0 },
        config,
        r
      ).reserveCredits;
      checkTrue(
        `have ${available}: the cheaper ${p.id} pack would NOT have covered it`,
        available + p.credits < after,
        `${p.id} would have worked and was skipped`
      );
    }
  }

  // The trap itself, stated as a property: the biggest pack has the
  // cheapest credits and therefore makes the action cost MORE credits.
  const smallRate = formula.effectiveCreditPriceEurForAccount(
    getPlan("starter"),
    CREDIT_PACKS[0].price / CREDIT_PACKS[0].credits,
    config
  );
  const bigRate = formula.effectiveCreditPriceEurForAccount(
    getPlan("starter"),
    CREDIT_PACKS[3].price / CREDIT_PACKS[3].credits,
    config
  );
  const priceSmall = estimateMod.estimateForAction(
    "websiteGenerate",
    { model: "claude-sonnet-4-6", inputChars: 8000 },
    config,
    smallRate
  ).reserveCredits;
  const priceBig = estimateMod.estimateForAction(
    "websiteGenerate",
    { model: "claude-sonnet-4-6", inputChars: 8000 },
    config,
    bigRate
  ).reserveCredits;
  checkTrue(
    `the bulk pack really does raise the credit price (${priceSmall} -> ${priceBig})`,
    priceBig > priceSmall,
    "if this ever stops being true the pack recommendation can be simplified"
  );
}

// ---------------------------------------------------------------------
// 9. Same trap, upgrades. A plan whose monthly allowance cannot pay for
//    the action AT THAT PLAN'S RATE must never be recommended for it.
// ---------------------------------------------------------------------
console.log("\n== 9. a recommended upgrade actually covers the action ==");
{
  for (const [slug, chars] of [
    ["free", 2000],
    ["free", 20000],
    ["starter", 20000],
    ["growth", 20000],
  ]) {
    const plan = getPlan(slug);
    const s = describeShortfall(
      { ...baseInput, plan, inputChars: chars, available: 0 },
      config
    );
    if (!s.upgrade) {
      check(`${slug}/${chars} chars: nothing above it is quoted, so nothing is offered`, s.upgrade, null);
      continue;
    }
    const target = getPlan(s.upgrade.slug);
    const rate = formula.effectiveCreditPriceEurForAccount(target, null, config);
    const costThere = estimateMod.estimateForAction(
      "websiteGenerate",
      { model: "claude-sonnet-4-6", inputChars: chars, imageCount: 0 },
      config,
      rate
    ).reserveCredits;
    check(`${slug}/${chars}: quoted price on ${s.upgrade.slug} is the real one`, s.upgrade.creditsOnPlan, costThere);
    checkTrue(
      `${slug}/${chars}: ${s.upgrade.slug}'s ${s.upgrade.monthlyCredits} credits cover ${costThere}`,
      s.upgrade.monthlyCredits >= costThere
    );
    checkTrue(`${slug}/${chars}: the suggestion is an UPGRADE`, plansMod.planRank(s.upgrade.slug) > plansMod.planRank(slug));
    check(`${slug}/${chars}: Enterprise is never suggested`, s.upgrade.slug === "enterprise", false);
  }
}

// ---------------------------------------------------------------------
// 10. The pricing page must READ these numbers, not restate them. A
//     hand-written "~2 websites" in the JSX is the exact failure this
//     whole file is here to make impossible.
// ---------------------------------------------------------------------
console.log("\n== 10. the pricing page derives, never states ==");
{
  const page = readFileSync("src/app/pricing/page.tsx", "utf8");
  checkTrue("the page calls planAllowance/allAllowances", /allAllowances\s*\(/.test(page));
  checkTrue("the page reads measured costs", /getMeasuredCosts\s*\(/.test(page));
  // Strip comments before looking for hand-typed claims, so a comment
  // that mentions "~19 websites" as an example does not fail its own file.
  const code = page.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const handTyped = code.match(/~\s*\d+\s*(websites?|missions?|messages?|agents?)/gi) ?? [];
  check("no hand-typed allowance claim in the JSX", handTyped, []);
}

// ---------------------------------------------------------------------
// 11. The refusal is not a dead end any more: both routes that can refuse
//     on credits return the structured answer.
// ---------------------------------------------------------------------
console.log("\n== 11. the routes return the panel's data ==");
for (const file of ["src/app/api/websites/generate/route.ts", "src/app/api/chat/route.ts"]) {
  const src = readFileSync(file, "utf8");
  checkTrue(`${file} computes a shortfall`, /describeShortfall\s*\(/.test(src));
  checkTrue(`${file} returns it to the client`, /\bshortfall,/.test(src));
}
{
  const panel = readFileSync("src/components/billing/credit-shortfall-panel.tsx", "utf8");
  checkTrue("the panel offers the free option", /simplerTitle/.test(panel));
  checkTrue("the panel offers a pack", /shortfall\.pack/.test(panel));
  checkTrue("the panel offers an upgrade", /shortfall\.upgrade/.test(panel));
  checkTrue(
    "the panel explains when simplifying cannot help",
    /noSimplerOption/.test(panel),
    "without this branch the panel silently omits the free option and looks like an upsell"
  );
  const workspace = readFileSync("src/components/website-builder/website-builder-workspace.tsx", "utf8");
  checkTrue("the Website Builder renders it", /CreditShortfallPanel/.test(workspace));
  checkTrue(
    "...instead of the red error box",
    /shortfall \?/.test(workspace),
    "a credit refusal painted red reads as a failure and gets closed unread"
  );
}

// ---------------------------------------------------------------------
// 12. Every string the two new surfaces render exists in all ten locales.
// ---------------------------------------------------------------------
console.log("\n== 12. i18n ==");
{
  const LOCALES = ["en", "el", "es", "fr", "de", "it", "pt", "zh", "ja", "ar"];
  const required = [
    ["pricing", "allowance", "tableTitle"],
    ["pricing", "allowance", "perMonthHeader"],
    ["pricing", "allowance", "creditsEach"],
    ["pricing", "allowance", "footnoteMeasured"],
    ["pricing", "allowance", "footnoteEstimated"],
    ["pricing", "allowance", "approx"],
    ...ALLOWANCE_ACTIONS.map((a) => ["pricing", "allowance", "action", a.key]),
    ["creditShortfall", "title"],
    ["creditShortfall", "summary"],
    ["creditShortfall", "simplerTitle"],
    ["creditShortfall", "simplerBody"],
    ["creditShortfall", "simplerBodyNoImages"],
    ["creditShortfall", "noSimplerOption"],
    ["creditShortfall", "packTitle"],
    ["creditShortfall", "packBody"],
    ["creditShortfall", "upgradeTitle"],
    ["creditShortfall", "upgradeBody"],
    ["creditShortfall", "checkoutFailed"],
  ];
  const missing = [];
  for (const loc of LOCALES) {
    const messages = JSON.parse(readFileSync(`messages/${loc}.json`, "utf8"));
    for (const path of required) {
      let node = messages;
      for (const part of path) node = node?.[part];
      if (typeof node !== "string" || !node.trim()) missing.push(`${loc}:${path.join(".")}`);
    }
  }
  check("no missing translation", missing, []);
  // Every ALLOWANCE_ACTIONS entry needs a label, and vice versa — a new
  // action added to the catalog without a label renders the raw key path
  // to the user, which next-intl does not treat as an error.
  const en = JSON.parse(readFileSync("messages/en.json", "utf8"));
  check(
    "action labels and the action catalog agree",
    Object.keys(en.pricing.allowance.action).sort(),
    ALLOWANCE_ACTIONS.map((a) => a.key).sort()
  );
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
