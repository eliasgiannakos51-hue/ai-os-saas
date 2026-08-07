// V3 Task 16 — the insight detectors.
//
// Half of this file tests that a real pattern is FOUND. The other half —
// the half that matters more — tests that nothing is found when nothing
// is there.
//
// The failure mode this product must not have is a confident sentence
// about somebody's business that is an artefact of the data rather than a
// fact about it. Three ways that happens, all pinned below:
//
//   1. Not enough rows. Three trades on a Monday is not a pattern.
//   2. No baseline. If a third of ALL trades are on Mondays, Mondays
//      holding a third of the losses is not news.
//   3. Import timestamps read as event times. An import writes 400 rows
//      in one second; if `created_at` were used as a fallback for
//      `occurred_at`, every detector would find a 100% weekday
//      concentration that is purely an artefact of the upload.
//
// Run: node scripts/tests/insight-detectors.test.mjs
import { loadTs } from "./load-ts.mjs";

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
function checkTrue(name, cond) {
  check(name, Boolean(cond), true);
}

const d = await loadTs("src/lib/insights/detectors.ts");

// 2025-01-06 is a Monday. Every date below is derived from it so the
// weekday arithmetic in the test is as checkable as the code's.
const MONDAY = Date.UTC(2025, 0, 6);
const DAY = 86_400_000;
function day(offset, hour = 12) {
  return new Date(MONDAY + offset * DAY + hour * 3_600_000).toISOString();
}

console.log("== 1. worst trades on one weekday ==");

// 20 trades spread evenly across the week; the five worst losses are all
// on Mondays. The baseline is 4/20 = 20% Monday, so a 100% Monday share
// among the worst is a genuine excess.
const weekdayTrades = [];
for (let i = 0; i < 20; i++) {
  const offset = i % 7;
  const isMonday = offset === 0;
  weekdayTrades.push({
    symbol: isMonday ? `MON${i}` : `SYM${i}`,
    pnl: isMonday ? -500 - i * 10 : 80 - (i % 3) * 60,
    occurred_at: day(offset + Math.floor(i / 7) * 7),
  });
}
const weekday = d.detectWorstTradeWeekday(weekdayTrades);
checkTrue("a real weekday concentration is found", weekday !== null);
check("...and it names the right day", weekday?.evidence.weekday, "Monday");
check("...with a stable detector id", weekday?.detector, "worst_trade_weekday");
check("...and points at the trading module", weekday?.moduleSlug, "trading");
checkTrue("...and reports the sample it rests on", weekday?.sampleSize === 20);
// The evidence has to carry the baseline, not just the share — a claim
// without its baseline is not checkable.
checkTrue("...and carries the baseline it beat", typeof weekday?.evidence.baselinePercent === "number");
checkTrue("...and names symbols the user can go and look at", (weekday?.evidence.symbols ?? []).length > 0);
checkTrue("...and the statement contains the day", weekday?.statement.includes("Monday"));

// SILENCE 1: too few rows. Same shape, four trades.
check(
  "four trades produce nothing",
  d.detectWorstTradeWeekday([
    { symbol: "A", pnl: -500, occurred_at: day(0) },
    { symbol: "B", pnl: -400, occurred_at: day(0) },
    { symbol: "C", pnl: -300, occurred_at: day(0) },
    { symbol: "D", pnl: 100, occurred_at: day(1) },
  ]),
  null
);

// SILENCE 2: no baseline excess. EVERY trade is on a Monday, so the
// worst ones being on a Monday is arithmetic, not insight.
const allMonday = Array.from({ length: 20 }, (_, i) => ({
  symbol: `S${i}`,
  pnl: i < 8 ? -100 - i : 50,
  occurred_at: day(i * 7),
}));
check("an all-Monday book produces nothing", d.detectWorstTradeWeekday(allMonday), null);

// SILENCE 3: the import artefact. 30 trades that all lack occurred_at —
// exactly what a CSV with no date column produces. If created_at were
// ever used as a fallback, this would report a 100% concentration on
// whatever weekday the import happened to run.
const undated = Array.from({ length: 30 }, (_, i) => ({
  symbol: `S${i}`,
  pnl: i < 12 ? -100 - i : 60,
  created_at: day(0),
  occurred_at: null,
}));
check("undated rows produce no time-based finding", d.detectWorstTradeWeekday(undated), null);
// ...and the honest thing IS said, by the data-quality detector.
const missing = d.detectMissingDates(undated, "trading");
checkTrue("...but the missing dates are reported", missing !== null);
check("...with the right count", missing?.evidence.withoutDate, 30);

console.log("\n== 2. win rate by direction ==");
const directional = [
  ...Array.from({ length: 10 }, (_, i) => ({ direction: "long", result: i < 8 ? "win" : "loss", pnl: i < 8 ? 100 : -50 })),
  ...Array.from({ length: 10 }, (_, i) => ({ direction: "short", result: i < 2 ? "win" : "loss", pnl: i < 2 ? 100 : -50 })),
];
const dirFinding = d.detectDirectionWinRate(directional);
checkTrue("a real divergence is found", dirFinding !== null);
check("...and names the better side", dirFinding?.evidence.betterSide, "long");
check("...with the right rates", [dirFinding?.evidence.longPercent, dirFinding?.evidence.shortPercent], [80, 20]);
// A missing `result` column falls back to the P&L sign — the user's own
// record either way, never an inference from something else.
const noResult = directional.map(({ result, ...rest }) => rest);
checkTrue("the P&L sign stands in for a missing result column", d.detectDirectionWinRate(noResult) !== null);
// SILENCE: similar rates are not a finding.
check(
  "similar win rates produce nothing",
  d.detectDirectionWinRate([
    ...Array.from({ length: 10 }, () => ({ direction: "long", result: "win" })),
    ...Array.from({ length: 10 }, (_, i) => ({ direction: "short", result: i < 9 ? "win" : "loss" })),
  ]),
  null
);
// SILENCE: one side too thin to have a rate.
check(
  "two shorts cannot be compared to anything",
  d.detectDirectionWinRate([
    ...Array.from({ length: 15 }, () => ({ direction: "long", result: "win" })),
    { direction: "short", result: "loss" },
    { direction: "short", result: "loss" },
  ]),
  null
);

console.log("\n== 3. revenue concentration ==");
const concentrated = [
  { type: "income", amount: 5000, counterparty: "Acme Ltd", occurred_at: day(0) },
  { type: "income", amount: 4000, counterparty: "acme ltd ", occurred_at: day(30) },
  { type: "income", amount: 6000, counterparty: "Globex", occurred_at: day(60) },
  { type: "income", amount: 900, counterparty: "Initech", occurred_at: day(1) },
  { type: "income", amount: 800, counterparty: "Umbrella", occurred_at: day(2) },
  { type: "income", amount: 700, counterparty: "Soylent", occurred_at: day(3) },
  { type: "income", amount: 600, counterparty: "Wayne", occurred_at: day(4) },
  { type: "income", amount: 500, counterparty: "Stark", occurred_at: day(5) },
];
const revenue = d.detectRevenueConcentration(concentrated);
checkTrue("a real concentration is found", revenue !== null);
// "Acme Ltd" and "acme ltd " are one client. A concentration analysis
// that splits one client into three understates the risk it exists to
// surface.
check("casing and spacing do not split a client", revenue?.evidence.totalClients, 7);
// Acme totals 9000 across its two rows and so outranks Globex at 6000 —
// which is the whole reason the grouping has to happen before the
// ranking, not after.
check("...and the top two are named, by TOTAL not by row", revenue?.evidence.topNames, ["Acme Ltd", "Globex"]);
check("...with their totals", revenue?.evidence.topAmounts, [9000, 6000]);
// 15000 of 18500.
check("...and the right share", revenue?.evidence.sharePercent, 81);
check("...counted on the counterparty, not the memo", revenue?.evidence.groupedByDescription, false);

// A book with the client name only in the memo field is extremely
// common. It is analysed, and the fallback is RECORDED so the claim
// carries its own caveat.
const memoOnly = concentrated.map(({ counterparty, ...rest }) => ({ ...rest, description: counterparty }));
const memoFinding = d.detectRevenueConcentration(memoOnly);
checkTrue("a memo-only book is still analysed", memoFinding !== null);
check("...and says it fell back to the description", memoFinding?.evidence.groupedByDescription, true);

// SILENCE: evenly spread income is not a concentration.
check(
  "an evenly spread book produces nothing",
  d.detectRevenueConcentration(
    Array.from({ length: 12 }, (_, i) => ({ type: "income", amount: 1000, counterparty: `Client ${i}` }))
  ),
  null
);
// SILENCE: too few rows, and too few distinct clients.
check("five rows produce nothing", d.detectRevenueConcentration(concentrated.slice(0, 5)), null);
check(
  "two clients are not a distribution",
  d.detectRevenueConcentration(
    Array.from({ length: 10 }, (_, i) => ({ type: "income", amount: 100, counterparty: i % 2 ? "A" : "B" }))
  ),
  null
);
// Expenses must not be counted as revenue.
check(
  "expenses are excluded from revenue",
  d.detectRevenueConcentration(concentrated.map((r) => ({ ...r, type: "expense" }))),
  null
);

console.log("\n== 4. expense concentration ==");
const spend = [
  ...Array.from({ length: 6 }, () => ({ type: "expense", amount: 2000, counterparty: "AWS" })),
  { type: "expense", amount: 300, counterparty: "Slack" },
  { type: "expense", amount: 200, counterparty: "Figma" },
  { type: "expense", amount: 150, counterparty: "Notion" },
];
const expense = d.detectExpenseConcentration(spend);
checkTrue("a dominant supplier is found", expense !== null);
check("...and is named", expense?.evidence.name, "AWS");
check("...with its entry count", expense?.evidence.entries, 6);
check(
  "an evenly spread spend produces nothing",
  d.detectExpenseConcentration(Array.from({ length: 10 }, (_, i) => ({ type: "expense", amount: 100, counterparty: `V${i}` }))),
  null
);

console.log("\n== 5. margin trend ==");
// Three months at +1000, then a month at -500.
const monthly = [];
for (let m = 0; m < 3; m++) {
  for (let i = 0; i < 3; i++) {
    monthly.push({ type: "income", amount: 1000, occurred_at: new Date(Date.UTC(2025, m, 5 + i)).toISOString() });
    monthly.push({ type: "expense", amount: 667, occurred_at: new Date(Date.UTC(2025, m, 6 + i)).toISOString() });
  }
}
for (let i = 0; i < 3; i++) {
  monthly.push({ type: "income", amount: 300, occurred_at: new Date(Date.UTC(2025, 3, 5 + i)).toISOString() });
  monthly.push({ type: "expense", amount: 500, occurred_at: new Date(Date.UTC(2025, 3, 6 + i)).toISOString() });
}
const trend = d.detectMarginTrend(monthly);
checkTrue("a real month-over-month move is found", trend !== null);
check("...and its direction", trend?.evidence.direction, "down");
check("...against the AVERAGE of prior months, not just the last one", trend?.evidence.monthsCompared, 4);
// SILENCE: two months is not a trend, and undated rows cannot be bucketed.
check("two months produce nothing", d.detectMarginTrend(monthly.slice(0, 12)), null);
check(
  "undated finance rows produce nothing",
  d.detectMarginTrend(monthly.map(({ occurred_at, ...rest }) => rest)),
  null
);

console.log("\n== 6. outlier loss ==");
const outlier = [
  { symbol: "BIG", pnl: -5000 },
  ...Array.from({ length: 9 }, (_, i) => ({ symbol: `S${i}`, pnl: -100 - i })),
];
const outlierFinding = d.detectOutlierLoss(outlier);
checkTrue("a dominating single loss is found", outlierFinding !== null);
check("...and is named", outlierFinding?.evidence.symbol, "BIG");
checkTrue("...with how many times larger it was", Number(outlierFinding?.evidence.timesLarger) > 3);
check(
  "evenly sized losses produce nothing",
  d.detectOutlierLoss(Array.from({ length: 10 }, (_, i) => ({ symbol: `S${i}`, pnl: -100 }))),
  null
);

console.log("\n== 7. captured but never acted on ==");
const ideas = Array.from({ length: 12 }, () => ({ created_at: day(0) }));
const unactioned = d.detectUnactionedIdeas(ideas, 0);
checkTrue("12 ideas and no mission is a finding", unactioned !== null);
check("...with the count", unactioned?.evidence.ideaCount, 12);
check("one existing mission silences it", d.detectUnactionedIdeas(ideas, 1), null);
check("four ideas are not a backlog", d.detectUnactionedIdeas(ideas.slice(0, 4), 0), null);

console.log("\n== 8. the whole pass ==");
const all = d.runDetectors({ trades: weekdayTrades, finance: concentrated, ideas, missionCount: 0 });
checkTrue(`several findings came back (${all.length})`, all.length >= 3);
// Ordering is a decision, not a coincidence: where the money comes from
// outranks a trading weekday, which outranks a data-quality note. The
// user reads the first one.
check("revenue concentration leads", all[0].detector, "revenue_concentration");
checkTrue("every finding has a sample size", all.every((f) => f.sampleSize > 0));
checkTrue("every finding has evidence", all.every((f) => Object.keys(f.evidence).length > 0));
checkTrue("every finding has a statement", all.every((f) => f.statement.length > 20));
checkTrue("no two findings share a detector id", new Set(all.map((f) => f.detector)).size === all.length);

// THE EMPTY-ACCOUNT CASE. A brand new user with nothing imported must
// get zero findings — never a hedged, generic sentence.
check("an empty account produces nothing at all", d.runDetectors({ trades: [], finance: [], ideas: [], missionCount: 0 }), []);
// And an account with a little data still produces nothing rather than
// something weak.
check(
  "a thin account produces nothing",
  d.runDetectors({
    trades: [{ symbol: "A", pnl: -10, occurred_at: day(0) }],
    finance: [{ type: "income", amount: 100, counterparty: "X" }],
    ideas: [{ created_at: day(0) }],
    missionCount: 0,
  }),
  []
);

console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
