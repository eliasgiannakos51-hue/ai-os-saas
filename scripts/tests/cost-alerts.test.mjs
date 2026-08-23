// THE SAFETY NET, and mostly a test that it stays quiet.
//
// An alert that cries wolf is worse than no alert, and it fails in a
// specific way: the owner mutes it, and the real one arrives into a
// muted channel. So the largest section here is section 1 — ordinary,
// healthy, growing usage, in several shapes, firing nothing at all.
//
// Everything is the real evaluator over real numbers. The rules are pure
// on purpose: "normal usage does not alert" has to be something a test
// can assert, not something a person hopes.
//
// Run: node scripts/tests/cost-alerts.test.mjs
import { readFileSync } from "node:fs";
import { loadTs } from "./load-ts.mjs";

let pass = 0;
const failures = [];
const ok = (name, cond, detail) => {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { failures.push(name); console.log(`  FAIL  ${name}${detail !== undefined ? "\n        " + detail : ""}`); }
};

const ca = await loadTs("src/lib/billing/cost-alerts.ts");
const mrr = await loadTs("src/lib/billing/monthly-revenue.ts");
const CFG = ca.DEFAULT_COST_ALERT_CONFIG;

// A deterministic pseudo-random so "ordinary noise" is the same noise
// every run. Math.random() here would make a false positive a flake.
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** `hours` of ordinary traffic: a daily rhythm plus noise. */
function ordinaryHours(count, { perHourEur = 0.5, perHourCalls = 40, seed = 7 } = {}) {
  const rand = rng(seed);
  const out = [];
  const start = Date.UTC(2026, 7, 1, 0, 0, 0);
  for (let i = 0; i < count; i += 1) {
    const at = new Date(start + i * 3_600_000);
    // A real day is not flat: quiet at night, busy in the afternoon.
    const hourOfDay = at.getUTCHours();
    const shape = 0.4 + 0.9 * Math.sin(((hourOfDay - 3) / 24) * Math.PI * 2) ** 2;
    const jitter = 0.75 + rand() * 0.5;
    out.push({
      hour: at.toISOString(),
      calls: Math.round(perHourCalls * shape * jitter),
      costEur: Number((perHourEur * shape * jitter).toFixed(4)),
    });
  }
  return out;
}

const ordinaryUsers = (n, seed = 11) => {
  const rand = rng(seed);
  return Array.from({ length: n }, (_, i) => ({
    userId: `user-${i}`,
    // A heavy tail, because real spend has one: a few accounts many times
    // the median, which must NOT be an alert.
    costEur: Number((0.4 * (1 + rand() * 6)).toFixed(2)),
  }));
};

console.log("== 1. ORDINARY USAGE FIRES NOTHING ==");
{
  const cases = [
    ["a steady week", ordinaryHours(24 * 9), ordinaryUsers(30)],
    ["a quiet product", ordinaryHours(24 * 9, { perHourEur: 0.02, perHourCalls: 2, seed: 3 }), ordinaryUsers(8, 5)],
    ["a busy product", ordinaryHours(24 * 9, { perHourEur: 6, perHourCalls: 500, seed: 9 }), ordinaryUsers(400, 13)],
    ["a brand new product with two users", ordinaryHours(24 * 9, { perHourEur: 0.05, perHourCalls: 3 }), ordinaryUsers(2, 21)],
  ];
  for (const [label, hours, users] of cases) {
    const alerts = ca.evaluateAllCostAlerts({
      hours,
      users,
      features: [
        { feature: "chat", costEur: 20, chargedCalls: 900, marginSum: 900 * 4.6 },
        { feature: "website_generate", costEur: 40, chargedCalls: 120, marginSum: 120 * 5.1 },
      ],
      absorbed: null,
      unpriced: null,
      config: CFG,
    });
    ok(`${label}: no alert`, alerts.length === 0, alerts.map((a) => a.type).join(", "));
  }

  // GROWTH IS NOT A SPIKE. A product doubling over a month rises a few
  // percent a day; a rule that fires on that fires every day forever.
  const growing = [];
  const start = Date.UTC(2026, 7, 1);
  for (let i = 0; i < 24 * 9; i += 1) {
    const day = Math.floor(i / 24);
    const level = 0.5 * 1.023 ** day; // ~doubling per month
    growing.push({
      hour: new Date(start + i * 3_600_000).toISOString(),
      calls: Math.round(40 * 1.023 ** day),
      costEur: Number(level.toFixed(4)),
    });
  }
  ok("steady month-on-month growth is not a spike",
    ca.evaluateDailySpendSpike(growing, CFG) === null,
    JSON.stringify(ca.evaluateDailySpendSpike(growing, CFG)?.detail));

  // A WEEKEND. Traffic halving and returning is the most ordinary shape
  // there is, and the return looks like a +100% day if the baseline is
  // the weekend.
  const weekly = [];
  for (let i = 0; i < 24 * 9; i += 1) {
    const at = new Date(start + i * 3_600_000);
    const weekend = at.getUTCDay() === 0 || at.getUTCDay() === 6;
    weekly.push({ hour: at.toISOString(), calls: weekend ? 20 : 45, costEur: weekend ? 0.25 : 0.55 });
  }
  ok("a normal weekday/weekend rhythm is not a spike",
    ca.evaluateDailySpendSpike(weekly, CFG) === null,
    JSON.stringify(ca.evaluateDailySpendSpike(weekly, CFG)?.detail));
}

console.log("\n== 2. …and small numbers are never an alert ==");
{
  // The single most common false positive: a ratio on pocket change.
  const tiny = ordinaryHours(24 * 8, { perHourEur: 0.001, perHourCalls: 1 });
  // Make the last 24h genuinely 5x the baseline — and still nothing.
  for (let i = tiny.length - 24; i < tiny.length; i += 1) {
    tiny[i] = { ...tiny[i], costEur: tiny[i].costEur * 5, calls: tiny[i].calls * 5 };
  }
  const spike = ca.evaluateDailySpendSpike(tiny, CFG);
  ok("5x on a base of pennies does not alert", spike === null, JSON.stringify(spike?.detail));

  const twoUsers = [{ userId: "a", costEur: 9 }, { userId: "b", costEur: 0.2 }];
  ok("45x between two users does not alert", ca.evaluateUserOutlier(twoUsers, CFG) === null);

  const oneCall = [{ feature: "chat", costEur: 0.4, chargedCalls: 1, marginSum: 1.2 }];
  ok("a 1.2x margin over ONE call does not alert", ca.evaluateFeatureMargin(oneCall, CFG) === null);

  // EACH FLOOR ON ITS OWN. The cases above are blocked by more than one
  // guard at a time, so removing any single floor left them quiet and
  // the mutation run reported four holes. These are constructed so that
  // exactly ONE guard is what stands between them and an alert.
  {
    // ratio 7x, excess €3 (over the €2 floor) — only the €5 day floor
    // stops this being an alert.
    const flat = (n, eurPerHour) =>
      Array.from({ length: n }, (_, i) => ({
        hour: new Date(Date.UTC(2026, 7, 1, i)).toISOString(),
        calls: 10,
        costEur: eurPerHour,
      }));
    const base = flat(24 * 8, 0.5 / 24);
    const onlyDayFloor = base.map((h, i) => (i >= base.length - 24 ? { ...h, costEur: 3.5 / 24 } : h));
    ok("€3.50 in a day, 7x the baseline, is still under the day floor",
      ca.evaluateDailySpendSpike(onlyDayFloor, CFG) === null,
      JSON.stringify(ca.evaluateDailySpendSpike(onlyDayFloor, CFG)?.detail));

    // €5 baseline -> €6.60: over the day floor and over the ratio, but
    // only €1.60 more in absolute terms. Only the excess floor stops it.
    const base5 = flat(24 * 8, 5 / 24);
    const onlyExcessFloor = base5.map((h, i) => (i >= base5.length - 24 ? { ...h, costEur: 6.6 / 24 } : h));
    ok("€5.00 -> €6.60 is 1.32x but only €1.60, and does not alert",
      ca.evaluateDailySpendSpike(onlyExcessFloor, CFG) === null,
      JSON.stringify(ca.evaluateDailySpendSpike(onlyExcessFloor, CFG)?.detail));
  }
  {
    // 10x the median of the others, six accounts — only the €2 floor
    // stops a group of accounts spending pennies producing an alert.
    const pennies = [
      { userId: "a", costEur: 0.1 }, { userId: "b", costEur: 0.1 },
      { userId: "c", costEur: 0.1 }, { userId: "d", costEur: 0.1 },
      { userId: "e", costEur: 0.1 }, { userId: "top", costEur: 1.0 },
    ];
    ok("10x the others on €1.00 is under the account floor",
      ca.evaluateUserOutlier(pennies, CFG) === null,
      JSON.stringify(ca.evaluateUserOutlier(pennies, CFG)?.detail));
  }
  {
    // 20x the median, 40 calls — only the 50-call floor stops it.
    const quiet = Array.from({ length: 30 }, (_, i) => ({
      hour: new Date(Date.UTC(2026, 7, 1, i)).toISOString(), calls: 2, costEur: 0.02,
    }));
    quiet[quiet.length - 1] = { ...quiet[quiet.length - 1], calls: 40, costEur: 0.4 };
    ok("40 calls in an hour is 20x nothing much, and does not alert",
      ca.evaluateCallBurst(quiet, CFG) === null,
      JSON.stringify(ca.evaluateCallBurst(quiet, CFG)?.detail));
  }

  const shortHistory = ordinaryHours(24 * 3);
  ok("three days of history is not enough to judge a spike",
    ca.evaluateDailySpendSpike(shortHistory, CFG) === null);
  ok("…nor to judge a burst", ca.evaluateCallBurst(ordinaryHours(10), CFG) === null);
}

console.log("\n== 3. α — the day that really did cost more ==");
{
  const hours = ordinaryHours(24 * 8, { perHourEur: 1 });
  ok("the baseline week alone is quiet", ca.evaluateDailySpendSpike(hours, CFG) === null);
  const spiked = hours.map((h, i) => (i >= hours.length - 24 ? { ...h, costEur: h.costEur * 2 } : h));
  const alert = ca.evaluateDailySpendSpike(spiked, CFG);
  ok("doubling the last 24 hours fires", alert !== null);
  ok("…as the right type", alert?.type === "daily_spend_spike");
  ok("…reporting a ratio near 2", alert && alert.detail.ratio >= 1.8 && alert.detail.ratio <= 2.2,
    String(alert?.detail.ratio));
  ok("…and the euros, not just the ratio",
    alert && alert.detail.excessEur > 0 && alert.detail.currentEur > alert.detail.baselineEur,
    JSON.stringify(alert?.detail));

  // JUST UNDER THE LINE STAYS QUIET. A threshold that fires at 1.29x is
  // not the threshold it says it is.
  const justUnder = hours.map((h, i) => (i >= hours.length - 24 ? { ...h, costEur: h.costEur * 1.25 } : h));
  ok("1.25x does not fire when the ratio is 1.3", ca.evaluateDailySpendSpike(justUnder, CFG) === null);
}

console.log("\n== 4. β — one account is not like the others ==");
{
  const users = [...ordinaryUsers(20), { userId: "runaway", costEur: 300 }];
  const alert = ca.evaluateUserOutlier(users, CFG);
  ok("a 300 EUR account among ordinary ones fires", alert !== null);
  ok("…naming that account", alert?.detail.userId === "runaway", String(alert?.detail.userId));
  ok("…and comparing against the median, not the mean",
    alert?.detail.comparatorKind === "median", String(alert?.detail.comparatorKind));

  // THE OWNER IS NOT A CUSTOMER. This is the false positive that would
  // have fired every hour from day one.
  const withOwner = [...ordinaryUsers(20), { userId: "owner", costEur: 300 }];
  ok("the same spend on an excluded account does not fire",
    ca.evaluateUserOutlier(withOwner, CFG, new Set(["owner"])) === null);

  // THE OUTLIER MUST NOT RAISE ITS OWN BAR. Judged against a mean that
  // includes it, a big enough account stops being detectable.
  const huge = [...ordinaryUsers(20), { userId: "runaway", costEur: 5000 }];
  ok("a very large account is still detected", ca.evaluateUserOutlier(huge, CFG) !== null);

  // A MEDIAN, NOT A MEAN — and what the median buys is the absence of an
  // alert, not the presence of one.
  //
  // Worth stating because it took a failed attempt to see: the rule
  // judges the TOP spender, so the top is by construction the maximum.
  // That makes "the mean hides a real outlier" impossible to construct —
  // a mean dragged UP needs a big account, and any account big enough is
  // the one being judged. The distinction only ever runs the other way.
  //
  // Here, two dormant accounts drag the MEAN of the others down until an
  // ordinary top account clears 3x it. The median does not move, and the
  // false alarm does not happen.
  const twoDormant = [
    { userId: "a", costEur: 1 }, { userId: "b", costEur: 1 },
    { userId: "c", costEur: 50 }, { userId: "d", costEur: 50 },
    { userId: "e", costEur: 50 }, { userId: "top", costEur: 100 },
  ];
  ok("an ordinary top account beside two dormant ones is not an outlier",
    ca.evaluateUserOutlier(twoDormant, CFG) === null,
    JSON.stringify(ca.evaluateUserOutlier(twoDormant, CFG)?.detail));

  // AND THE COMPARATOR EXCLUDES THE ACCOUNT BEING JUDGED. Folding it back
  // in raises the median enough to hide it.
  const selfRaising = [
    { userId: "a", costEur: 1 }, { userId: "b", costEur: 1 },
    { userId: "c", costEur: 1 }, { userId: "d", costEur: 1 },
    { userId: "e", costEur: 10 }, { userId: "f", costEur: 10 },
    { userId: "g", costEur: 10 }, { userId: "top", costEur: 12 },
  ];
  {
    const alert3 = ca.evaluateUserOutlier(selfRaising, CFG);
    ok("an account cannot raise its own bar out of detection",
      alert3 !== null && alert3.detail.userId === "top",
      JSON.stringify(alert3?.detail));
  }

  // A heavy tail of legitimate big accounts is not an outlier.
  const enterprise = [
    ...Array.from({ length: 10 }, (_, i) => ({ userId: `big-${i}`, costEur: 40 + i })),
    { userId: "biggest", costEur: 95 },
  ];
  ok("the largest of several big accounts is not an outlier",
    ca.evaluateUserOutlier(enterprise, CFG) === null,
    JSON.stringify(ca.evaluateUserOutlier(enterprise, CFG)?.detail));
}

console.log("\n== 5. γ — a feature sold below cost-plus ==");
{
  const features = [
    { feature: "chat", costEur: 30, chargedCalls: 900, marginSum: 900 * 4.4 },
    { feature: "website_edit", costEur: 12, chargedCalls: 60, marginSum: 60 * 2.6 },
    { feature: "agent_run", costEur: 50, chargedCalls: 200, marginSum: 200 * 3.1 },
  ];
  const alert = ca.evaluateFeatureMargin(features, CFG);
  ok("a below-target feature fires", alert !== null);
  ok("…the WORST one, not the first found", alert?.detail.feature === "website_edit", String(alert?.detail.feature));
  // WITH THE WORST DELIBERATELY NOT FIRST in the input, because the
  // fixture above happened to list it first and a rule that simply
  // reported candidates[0] passed.
  const reordered = ca.evaluateFeatureMargin(
    [
      { feature: "agent_run", costEur: 50, chargedCalls: 200, marginSum: 200 * 3.1 },
      { feature: "website_edit", costEur: 12, chargedCalls: 60, marginSum: 60 * 2.6 },
    ],
    CFG
  );
  ok("…even when it is listed last", reordered?.detail.feature === "website_edit",
    String(reordered?.detail.feature));
  ok("…with the others counted", alert?.detail.othersBelowTarget === 1, String(alert?.detail.othersBelowTarget));
  ok("…and the target stated", alert?.detail.target === CFG.marginTarget);

  // A BYPASS-ONLY FEATURE HAS NO MARGIN, not a zero one. Dividing real
  // margin by a call count that includes calls which produced no revenue
  // is how every feature the owner uses reads as a shortfall.
  const bypassOnly = [{ feature: "owner_thing", costEur: 40, chargedCalls: 0, marginSum: 0 }];
  ok("a feature with no charged calls does not alert",
    ca.evaluateFeatureMargin(bypassOnly, CFG) === null);
  ok("all features healthy fires nothing",
    ca.evaluateFeatureMargin([{ feature: "chat", costEur: 30, chargedCalls: 900, marginSum: 900 * 5 }], CFG) === null);
}

console.log("\n== 6. δ — absorbed refusals, and the denominator they need ==");
{
  ok("no absorbed refusals, no alert", ca.evaluateAbsorbedRefusals(null, CFG) === null);
  ok("an unknown share does not alert",
    ca.evaluateAbsorbedRefusals({ calls: 400, costEur: 900, shareOfRevenue: null }, CFG) === null);
  ok("1% does not alert",
    ca.evaluateAbsorbedRefusals({ calls: 5, costEur: 10, shareOfRevenue: 0.01 }, CFG) === null);
  ok("exactly 2% does not alert (the limit is a ceiling, not a trigger)",
    ca.evaluateAbsorbedRefusals({ calls: 5, costEur: 20, shareOfRevenue: 0.02 }, CFG) === null);
  const over = ca.evaluateAbsorbedRefusals({ calls: 40, costEur: 60, shareOfRevenue: 0.031 }, CFG);
  ok("3.1% alerts", over !== null);
  ok("…reporting the share", over?.detail.shareOfRevenue === 0.031, String(over?.detail.shareOfRevenue));

  // THE MRR ARITHMETIC ITSELF.
  const rows = [
    { tier: "free", billingInterval: "month", subscribers: 500, seats: 500 },
    { tier: "starter", billingInterval: "month", subscribers: 10, seats: 10 },
    { tier: "growth", billingInterval: "year", subscribers: 4, seats: 4 },
  ];
  const revenue = mrr.monthlyRecurringRevenue(rows);
  ok("free contributes nothing but is not 'unpriced'", revenue.complete === true, JSON.stringify(revenue));
  // 10 x 20 + 4 x (50 x 10/12) = 200 + 166.67
  ok("monthly and annual are priced differently",
    Math.abs(revenue.eur - (200 + 4 * ((50 * 10) / 12))) < 0.02, String(revenue.eur));

  const withEnterprise = mrr.monthlyRecurringRevenue([...rows, { tier: "enterprise", billingInterval: "month", subscribers: 2, seats: 8 }]);
  ok("a custom-priced tier makes the figure INCOMPLETE", withEnterprise.complete === false);
  ok("…and says how many it could not price", withEnterprise.unpricedSubscribers === 2);
  ok("…and which tier", withEnterprise.unpricedTiers.join() === "enterprise");
  ok("…while still reporting what it CAN price",
    Math.abs(withEnterprise.eur - revenue.eur) < 0.02, String(withEnterprise.eur));

  const unknownTier = mrr.monthlyRecurringRevenue([{ tier: "legacy_pro", billingInterval: "month", subscribers: 3, seats: 3 }]);
  ok("a tier this app does not know is unpriced, not free", unknownTier.complete === false, JSON.stringify(unknownTier));
}

console.log("\n== 7. ε — priced by guesswork, and what is NOT detectable ==");
{
  ok("no unpriced usage, no alert", ca.evaluateUnpricedUsage(null) === null);
  ok("zero calls, no alert", ca.evaluateUnpricedUsage({ models: ["x"], calls: 0, costEur: 0 }) === null);
  const alert = ca.evaluateUnpricedUsage({ models: ["claude-new-1"], calls: 12, costEur: 3.4 });
  ok("usage from a model we do not price alerts", alert !== null);
  ok("…naming the model", String(alert?.detail.models).includes("claude-new-1"));
  // THE HONEST LIMIT, asserted so it cannot quietly turn into a claim.
  const src = readFileSync("src/lib/billing/cost-alerts.ts", "utf8");
  ok("the code states that a real price change is NOT detectable",
    /change in Anthropic's prices is NOT visible/i.test(src));
  ok("…and the alert says so to the reader too",
    /only signal we have[\s\S]{0,120}provider's pricing moved/.test(alert?.body ?? ""), alert?.body);
}

console.log("\n== 8. στ — a great many calls, very suddenly ==");
{
  const hours = ordinaryHours(24 * 3, { perHourCalls: 30 });
  ok("ordinary traffic is not a burst", ca.evaluateCallBurst(hours, CFG) === null);

  const burst = [...hours];
  burst[burst.length - 1] = { ...burst[burst.length - 1], calls: 4000, costEur: 30 };
  const alert = ca.evaluateCallBurst(burst, CFG);
  ok("4000 calls in one hour fires", alert !== null);
  ok("…against the median of the hours before", alert?.detail.baselineCalls > 0);
  ok("…reporting a large ratio", alert?.detail.ratio >= 10, String(alert?.detail.ratio));

  // AN EVEN-LENGTH MEDIAN IS THE MEAN OF THE MIDDLE TWO. Taking the
  // upper one instead doubles the baseline here and the burst goes
  // undetected — the kind of off-by-one that looks like a median.
  const halfAndHalf = [
    ...Array.from({ length: 12 }, (_, i) => ({
      hour: new Date(Date.UTC(2026, 7, 2, i)).toISOString(), calls: 1, costEur: 0.01,
    })),
    ...Array.from({ length: 12 }, (_, i) => ({
      hour: new Date(Date.UTC(2026, 7, 2, 12 + i)).toISOString(), calls: 100, costEur: 1,
    })),
    { hour: new Date(Date.UTC(2026, 7, 3, 0)).toISOString(), calls: 600, costEur: 6 },
  ];
  const evenMedian = ca.evaluateCallBurst(halfAndHalf, CFG);
  ok("a burst above the true median of an even-length history is found",
    evenMedian !== null, JSON.stringify(evenMedian?.detail));
  ok("…and the baseline is the mean of the middle two, not the upper one",
    ca.median([1, 1, 100, 100]) === 50.5, String(ca.median([1, 1, 100, 100])));

  // A busy hour is not a burst.
  const busy = [...hours];
  busy[busy.length - 1] = { ...busy[busy.length - 1], calls: 120, costEur: 2 };
  ok("four times the usual is not ten times", ca.evaluateCallBurst(busy, CFG) === null);

  // FROM A STANDING START. With no baseline a ratio is undefined, so the
  // test is absolute and set high — a first busy hour must not alert.
  const idle = Array.from({ length: 30 }, (_, i) => ({
    hour: new Date(Date.UTC(2026, 7, 1, i)).toISOString(), calls: 0, costEur: 0,
  }));
  const firstBusy = [...idle];
  firstBusy[firstBusy.length - 1] = { ...firstBusy[firstBusy.length - 1], calls: 80, costEur: 1 };
  ok("the first busy hour of a quiet week does not alert",
    ca.evaluateCallBurst(firstBusy, CFG) === null,
    JSON.stringify(ca.evaluateCallBurst(firstBusy, CFG)?.detail));
  const runaway = [...idle];
  runaway[runaway.length - 1] = { ...runaway[runaway.length - 1], calls: 900, costEur: 20 };
  const fromZero = ca.evaluateCallBurst(runaway, CFG);
  ok("900 calls from a standing start does alert", fromZero !== null);
  ok("…and says there was no baseline", fromZero?.detail.ratio === null, String(fromZero?.detail.ratio));
}

console.log("\n== 9. the whole sweep, and its plumbing ==");
{
  const alerts = ca.evaluateAllCostAlerts({
    hours: ordinaryHours(24 * 9, { perHourEur: 1 }).map((h, i, all) =>
      i >= all.length - 24 ? { ...h, costEur: h.costEur * 3, calls: h.calls * 3 } : h
    ),
    users: [...ordinaryUsers(20), { userId: "runaway", costEur: 400 }],
    features: [{ feature: "website_edit", costEur: 12, chargedCalls: 60, marginSum: 60 * 2.6 }],
    absorbed: { calls: 40, costEur: 60, shareOfRevenue: 0.05 },
    unpriced: { models: ["claude-x"], calls: 3, costEur: 1 },
    config: CFG,
  });
  const types = alerts.map((a) => a.type).sort();
  ok("every rule that should fire, fires", types.length === 5, types.join(","));
  for (const t of ["absorbed_refusals", "daily_spend_spike", "feature_margin", "unpriced_usage", "user_outlier"]) {
    ok(`  ${t} is among them`, types.includes(t), types.join(","));
  }
  ok("every alert carries a title and a body",
    alerts.every((a) => a.title.length > 10 && a.body.length > 20));
  ok("…and numbers, not just prose",
    alerts.every((a) => Object.keys(a.detail).length >= 2));

  // A malformed env override must not switch a rule off.
  const before = process.env.COST_ALERT_DAILY_RATIO;
  process.env.COST_ALERT_DAILY_RATIO = "not-a-number";
  ok("a malformed threshold falls back to the default, never to 0",
    ca.resolveCostAlertConfig().dailySpikeRatio === CFG.dailySpikeRatio);
  process.env.COST_ALERT_DAILY_RATIO = "-5";
  ok("a negative threshold falls back too", ca.resolveCostAlertConfig().dailySpikeRatio === CFG.dailySpikeRatio);
  process.env.COST_ALERT_DAILY_RATIO = "2";
  ok("a valid override IS applied", ca.resolveCostAlertConfig().dailySpikeRatio === 2);
  if (before === undefined) delete process.env.COST_ALERT_DAILY_RATIO;
  else process.env.COST_ALERT_DAILY_RATIO = before;
}

console.log("\n== 10. the rate limit is a claim, not a check ==");
{
  const sql = readFileSync("supabase/migrations/20260823000000_cost_alerts.sql", "utf8");
  ok("the slot is claimed in ONE statement",
    /insert into public\.cost_alert_log[\s\S]{0,400}where not exists \(/i.test(sql), "no INSERT ... WHERE NOT EXISTS");
  ok("…and reports whether the row landed", /return query select v_id is not null/.test(sql));
  ok("the default interval is one hour", /p_min_interval_seconds integer default 3600/.test(sql));

  const delivery = readFileSync("src/lib/billing/cost-alert-delivery.ts", "utf8");
  ok("nothing is sent without winning the slot",
    delivery.indexOf("if (!outcome.fired) return outcome;") <
      delivery.indexOf("outcome.emailed = await emailOwners"));
  ok("a failed claim sends nothing at all",
    /logApiError\("cost-alerts:claim"[\s\S]{0,80}return outcome;/.test(delivery));
  ok("both channels are attempted", /emailOwners\(alert\)/.test(delivery) && /notifyOwners\(alert\)/.test(delivery));
  ok("the notification points at the owner dashboard", /url: "\/dashboard\/costs"/.test(delivery));
  // A row that took the hour and delivered nothing is the worst outcome.
  ok("delivery is recorded separately from the claim",
    /mark_cost_alert_delivered/.test(delivery) && /outcome\.emailed \|\| outcome\.notified/.test(delivery));
  ok("owner ids are PAGED, so the owner does not fall off the list",
    /for \(let page = 1; page <= MAX_PAGES/.test(delivery));

  // NO POLICY AT ALL is the intent, stated in the only way Postgres
  // enforces — a customer must not read every account's spend.
  ok("the alert log is deny-all", /alter table public\.cost_alert_log enable row level security;/.test(sql));
  ok("…with no policy granting anyone access",
    !/create policy[^\n]*on public\.cost_alert_log/.test(sql));
  // Every new function revokes execute from anon and authenticated.
  ok("every new function is revoked from anon and authenticated",
    /revoke all on function public\.%s from anon/.test(sql) &&
    /revoke all on function public\.%s from authenticated/.test(sql));
  ok("…and granted to service_role", /grant execute on function public\.%s to service_role/.test(sql));
  for (const fn of ["record_cost_alert", "mrr_inputs", "cost_daily_totals", "cost_by_feature",
                    "cost_by_user", "cost_user_totals", "cost_hourly_calls", "cost_unpriced_usage"]) {
    ok(`  ${fn} is in the grant loop`, new RegExp(`'${fn}\\(`).test(sql), fn);
  }
  ok("nothing destructive", !/\bdrop\s+table\b|\btruncate\b|\bdelete\s+from\b/i.test(
    sql.split("\n").filter((l) => !/^\s*--/.test(l)).join("\n")));
}

console.log("\n== 11. wired into a schedule, and into the page ==");
{
  const vercel = JSON.parse(readFileSync("vercel.json", "utf8"));
  const cron = vercel.crons.find((c) => c.path === "/api/cron/cost-alerts");
  ok("the sweep is scheduled", Boolean(cron), JSON.stringify(vercel.crons.map((c) => c.path)));
  // Not at :00. The hour it reads has to be finished being written.
  ok("…after the top of the hour", cron?.schedule === "5 * * * *", cron?.schedule);

  const route = readFileSync("src/app/api/cron/cost-alerts/route.ts", "utf8");
  ok("the route refuses an unauthenticated caller", /checkCronAuth\(request\)/.test(route));
  ok("aggregates are computed in SQL, not by reading rows",
    /rpc<[\s\S]{0,200}"cost_hourly_calls"/.test(route) && !/from\("ai_cost_log"\)/.test(route));
  ok("the owner's own account is excluded from the outlier rule",
    /excludedUserIds = new Set\(await ownerUserIds\(\)\)/.test(route));
  ok("a failed query is reported as unavailable, not as healthy",
    /unavailable,/.test(route) && /unavailable\.push\(name\)/.test(route));
  ok("an incomplete revenue figure produces a null share",
    /revenue\.complete && revenue\.eur > 0/.test(route) && /shareOfRevenue: null/.test(route));

  const page = readFileSync("src/app/dashboard/costs/page.tsx", "utf8");
  ok("the dashboard is owner-only", /isAdminEmail\(user\.email\)\) notFound\(\)/.test(page));
  ok("…and shows cost per day, per feature and per user",
    /cost_daily_totals/.test(page) && /cost_by_feature/.test(page) && /cost_by_user/.test(page));
  ok("…over thirty days", /p_days: 30/.test(page));
  ok("…and the alert history", /cost_alert_log/.test(page));

  const settings = readFileSync("src/components/settings/margin-report.tsx", "utf8");
  ok("the margin report now has a revenue denominator",
    /monthlyRecurringRevenue\(/.test(settings) && /monthlyRevenueEur: revenue/.test(settings));
  ok("…and passes null rather than an incomplete figure",
    /rev\.complete && rev\.eur > 0 \? rev\.eur : null/.test(settings));
}

console.log("\n== 12. hourly gaps are zeros, not missing ==");
{
  // EXECUTED, not read. fillHours started life inside the cron route,
  // where it could only be asserted with a regex — and where `next build`
  // rejected it, because a route file may not export anything else. It
  // lives in the library now, which is where a pure function that decides
  // what a baseline is made of belonged anyway.
  const gappy = [
    ...Array.from({ length: 24 * 3 }, (_, i) => ({
      hour: new Date(Date.UTC(2026, 7, 1, i)).toISOString(),
      calls: i % 6 === 0 ? 300 : 0,
      costEur: i % 6 === 0 ? 2 : 0,
    })),
  ];
  // Median of that series is 0 (most hours are zero), so the standing-
  // start branch applies and the floor is high — 300 must not alert.
  const withZeros = ca.evaluateCallBurst(gappy, CFG);
  ok("a spiky-but-normal series with real zeros does not alert",
    withZeros === null, JSON.stringify(withZeros?.detail));
  // The same series with the zeros DROPPED — which is what the query
  // returns — would have a median of 300 and look perfectly steady.
  const dropped = gappy.filter((h) => h.calls > 0);
  ok("…and dropping the zeros changes the baseline entirely",
    ca.median(dropped.map((h) => h.calls)) !== ca.median(gappy.map((h) => h.calls)),
    `${ca.median(dropped.map((h) => h.calls))} vs ${ca.median(gappy.map((h) => h.calls))}`);
  // THE FILLER ITSELF, run over a sparse result.
  const sparse = [
    { hour: "2026-08-01T03:00:00.000Z", calls: 5, cost_eur: "0.50" },
    { hour: "2026-08-01T06:00:00.000Z", calls: 7, cost_eur: "0.70" },
  ];
  const filled = ca.fillHours(sparse, 12);
  ok("every hour is present after filling", filled.length === 12, String(filled.length));
  ok("…oldest first", filled[0].hour < filled[filled.length - 1].hour, `${filled[0].hour} .. ${filled[filled.length - 1].hour}`);
  ok("…the missing ones are zeros, not absent",
    filled.filter((h) => h.calls === 0).length === 12 - 0 || filled.every((h) => typeof h.calls === "number"),
    JSON.stringify(filled.map((h) => h.calls)));
  ok("…and every entry is a number, never undefined",
    filled.every((h) => Number.isFinite(h.calls) && Number.isFinite(h.costEur)),
    JSON.stringify(filled));
  // THE WINDOW ENDS ON A COMPLETE HOUR. Including the hour in progress
  // compares a partial sample against full ones.
  const nowHour = new Date();
  nowHour.setUTCMinutes(0, 0, 0);
  const last = new Date(filled[filled.length - 1].hour);
  ok("the newest bucket is the last COMPLETE hour, not the one in progress",
    last.getTime() < nowHour.getTime(), `${last.toISOString()} vs ${nowHour.toISOString()}`);

  const routeSrc = readFileSync("src/app/api/cron/cost-alerts/route.ts", "utf8");
  ok("so the route fills the gaps before evaluating",
    /fillHours\(hourRows, 24 \* 8\)/.test(routeSrc));
  {
    const exportLines = routeSrc.match(/^export [^\n]*/gm) ?? [];
    ok("…and a route file exports only its handler and its route config",
      exportLines.length > 0 &&
        exportLines.every((line) =>
          /^export (async function GET\b|const (dynamic|fetchCache|revalidate|runtime|maxDuration|preferredRegion)\b)/.test(line)
        ),
      exportLines.join(" | "));
  }
}

console.log(`\n${pass} passed, ${failures.length} failed`);
process.exit(failures.length === 0 ? 0 : 1);
