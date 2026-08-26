// TRADING JOURNAL, STRATEGY GUARDIAN, BANK AND CRYPTO (V4 #14 + #15).
//
// WHAT THIS ENVIRONMENT COULD NOT DO, first. There is no bank aggregator
// key, no chain-explorer key, and no ANTHROPIC_API_KEY. Nothing was ever
// synced from a real bank, no wallet balance was ever read, and no model
// ever parsed a rule. Everything below is arithmetic, schema and text —
// which is most of this workstream, because the Strategy Guardian is
// deliberately arithmetic rather than a model call.
//
// THE THINGS THAT WOULD BE WRONG QUIETLY:
//
//   A COUNT THAT IS NOT A COUNT. "You broke your 2% rule eight times in
//   March" is the whole product. A trader who checks one of the eight and
//   finds it was 1.9% never trusts the feature again, and would be right
//   not to. Section 3 is the arithmetic, boundary by boundary.
//
//   A SESSION RULE THAT PUNISHES THE OVERLAP. London runs 07:00-16:00 UTC
//   and New York 12:00-21:00. A 13:00 trade is in BOTH, and reporting it
//   as breaking "only London" is the error that ends trust fastest.
//
//   A STATISTIC PRINTED FROM NOTHING. A win rate over three trades, a
//   profit factor with no losses, a percentage drawdown against an
//   assumed balance. Each has a number that can be printed and a meaning
//   that does not exist.
//
//   A SEED PHRASE IN A DATABASE. Section 6. The schema has nowhere to put
//   one and the validator refuses it without echoing it back.
//
//   ADVICE. Section 7, as a cross-product of phrasings in two languages.
//
// Run: node scripts/tests/trading-journal.test.mjs
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { loadTs } from "./load-ts.mjs";

let pass = 0;
const failures = [];
const ok = (name, cond, detail) => {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { failures.push(name); console.log(`  FAIL  ${name}${detail !== undefined ? "\n        " + detail : ""}`); }
};

const journal = await loadTs("src/lib/trading/journal.ts");
const stats = await loadTs("src/lib/trading/stats.ts");
const rules = await loadTs("src/lib/trading/rules.ts");
const guardian = await loadTs("src/lib/trading/guardian.ts");
const conduct = await loadTs("src/lib/trading/conduct.ts");
const secretGuard = await loadTs("src/lib/finance/secret-guard.ts");
const readOnly = await loadTs("src/lib/finance/read-only.ts");

const {
  TRADING_SESSIONS, SESSION_HOURS_UTC, sessionsAt, primarySessionAt, normaliseInstrument,
  durationSeconds, netPnl, grossPnl, isShort, outcomeOf, plannedRiskReward, tradingDay,
} = journal;
const {
  MIN_SAMPLE_FOR_RATE, computeStats, equityCurve, statsByInstrument, statsBySession, afterLossPattern,
} = stats;
const { RULE_KINDS, RULE_BOUNDS, parseRuleParams, parseRulesFromText, isRuleKind } = rules;
const { evaluate, summarise } = guardian;
const {
  TRADING_CONDUCT_EN, TRADING_CONDUCT_EL, findConductBreaches, containsAdvice,
} = conduct;
const { scanForSecret, assertNoSecret, checkWalletAddress, WALLET_CHAINS, MAX_ADDRESS_LENGTH } = secretGuard;
const { checkReadOnly, READ_ONLY_METHODS } = readOnly;
const unicode = await loadTs("src/lib/text/unicode-patterns.ts");
const { foldForMatch, isFolded } = unicode;

const src = (p) => readFileSync(p, "utf8");
const stripTs = (t) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
const stripSql = (t) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/--.*$/gm, "");

const JOURNAL_SQL = src("supabase/migrations/20260830000000_trading_journal.sql");
const FINANCE_SQL = src("supabase/migrations/20260831000000_bank_crypto.sql");

/** A trade with sane defaults, so each test states only what it is about. */
function trade(overrides = {}) {
  return {
    id: overrides.id ?? `t${Math.abs(hash(JSON.stringify(overrides)))}`,
    accountId: null,
    instrument: "EURUSD",
    direction: "long",
    size: 1,
    entryPrice: null,
    exitPrice: null,
    stopPrice: null,
    targetPrice: null,
    riskAmount: null,
    commission: null,
    pnl: 0,
    enteredAt: "2026-03-02T09:00:00.000Z",
    exitedAt: "2026-03-02T10:00:00.000Z",
    session: "london",
    ...overrides,
  };
}
function hash(s) {
  let h = 0;
  for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h;
}

// ===========================================================================
console.log("\n== 1. sessions, and the overlap everybody gets wrong ==");
// ===========================================================================

ok("five sessions including 'other'", TRADING_SESSIONS.length === 5 && TRADING_SESSIONS.includes("other"));
ok("London is 07:00-16:00 UTC and New York 12:00-21:00",
  SESSION_HOURS_UTC.london.start === 7 && SESSION_HOURS_UTC.london.end === 16 &&
  SESSION_HOURS_UTC.new_york.start === 12 && SESSION_HOURS_UTC.new_york.end === 21);

// THE OVERLAP. 13:00 UTC is London AND New York.
{
  const active = sessionsAt("2026-03-02T13:00:00.000Z");
  ok("13:00 UTC is in BOTH London and New York",
    active.includes("london") && active.includes("new_york"), active.join(","));
  ok("...and the primary session picks exactly one, for grouping",
    primarySessionAt("2026-03-02T13:00:00.000Z") === "london");
}
// THE PRECEDENCE IS BY LIQUIDITY, and it is asserted at the hours where
// it actually discriminates — a check only at 13:00 would pass under any
// order that happens to put London first.
{
  ok("08:00 is Tokyo AND London; the primary is London",
    sessionsAt("2026-03-02T08:00:00.000Z").length === 2 &&
    primarySessionAt("2026-03-02T08:00:00.000Z") === "london");
  ok("02:00 is Tokyo AND Sydney; the primary is Tokyo, not Sydney",
    sessionsAt("2026-03-02T02:00:00.000Z").length === 2 &&
    primarySessionAt("2026-03-02T02:00:00.000Z") === "tokyo",
    primarySessionAt("2026-03-02T02:00:00.000Z"));
  ok("22:00 is Sydney alone", primarySessionAt("2026-03-02T22:00:00.000Z") === "sydney");
  ok("17:00 is New York alone", primarySessionAt("2026-03-02T17:00:00.000Z") === "new_york");
}
ok("08:00 UTC is London and Tokyo, not New York",
  JSON.stringify(sessionsAt("2026-03-02T08:00:00.000Z").sort()) === JSON.stringify(["london", "tokyo"]));
// SYDNEY WRAPS MIDNIGHT — 21:00 to 06:00 — which a naive range test gets
// wrong at both ends.
ok("Sydney contains 23:00 (after its start, before midnight)",
  sessionsAt("2026-03-02T23:00:00.000Z").includes("sydney"));
ok("...and 02:00 (after midnight, before its end)",
  sessionsAt("2026-03-02T02:00:00.000Z").includes("sydney"));
ok("...and NOT 12:00", !sessionsAt("2026-03-02T12:00:00.000Z").includes("sydney"));
// THE FOUR SESSIONS COVER THE WHOLE DAY between them (Tokyo 00-09,
// London 07-16, New York 12-21, Sydney 21-06), so 'other' is never
// DERIVED from a valid time. It exists as a stored value for rows written
// before this column did, and as the last entry in the primary
// precedence. Asserting the coverage is the honest version of what the
// first draft of this check got wrong.
ok("every hour of the day is inside at least one real session, so 'other' is never derived",
  Array.from({ length: 24 }, (_, h) =>
    sessionsAt(`2026-03-02T${String(h).padStart(2, "0")}:30:00.000Z`)
  ).every((s) => s.length > 0 && !s.includes("other")));
ok("an unparseable time reports no session at all", sessionsAt("not a date").length === 0 && primarySessionAt(null) === null);

// EVERY HOUR OF THE DAY, so a gap in coverage cannot hide between the
// cases above.
for (let hour = 0; hour < 24; hour += 1) {
  const iso = `2026-03-02T${String(hour).padStart(2, "0")}:00:00.000Z`;
  const active = sessionsAt(iso);
  ok(`hour ${hour} resolves to at least one session and one primary`,
    active.length > 0 && primarySessionAt(iso) !== null, active.join(","));
}

ok("instruments normalise so one market is one bucket",
  normaliseInstrument("eur/usd") === "EURUSD" &&
  normaliseInstrument("EUR USD") === "EURUSD" &&
  normaliseInstrument(" eur-usd ") === "EURUSD");
ok("...and a symbol that is only punctuation is nothing, not an empty bucket",
  normaliseInstrument("///") === null && normaliseInstrument("") === null && normaliseInstrument(null) === null);

// ===========================================================================
console.log("\n== 2. what a trade did, and what it did not record ==");
// ===========================================================================

ok("a recorded P&L is the source of truth", grossPnl(trade({ pnl: 42 })) === 42);
ok("...and is derived from prices when absent",
  grossPnl(trade({ pnl: null, entryPrice: 100, exitPrice: 110, size: 2 })) === 20);
ok("a short is derived the other way round",
  grossPnl(trade({ pnl: null, direction: "short", entryPrice: 100, exitPrice: 90, size: 2 })) === 20);
ok("'sell', 'short' and 's' are all short; anything else is long",
  isShort("Sell") && isShort("SHORT") && isShort("s") && !isShort("long") && !isShort("") && !isShort(null));
// GREEK, TYPED THE WAY GREEK IS ACTUALLY TYPED. A `.toLowerCase()` here
// maps "ΠΩΛΗΣΗ" to "πωληση" and "Πώληση" to "πώληση" — two strings, one
// literal — so a Greek trader's own word for a short would register as a
// long and every one of their shorts would have the wrong sign.
ok("Greek for 'short' is recognised in capitals, in lower case and without accents",
  isShort("ΠΩΛΗΣΗ") && isShort("Πώληση") && isShort("πωληση"),
  `${isShort("ΠΩΛΗΣΗ")}/${isShort("Πώληση")}/${isShort("πωληση")}`);
ok("a P&L that cannot be derived is NULL, not zero",
  grossPnl(trade({ pnl: null, entryPrice: 100, exitPrice: null, size: 1 })) === null);

// COMMISSION: NULL IS NOT ZERO.
{
  const withCost = netPnl(trade({ pnl: 100, commission: 7 }));
  ok("a recorded commission is subtracted", withCost.value === 93 && withCost.net === true);
  const without = netPnl(trade({ pnl: 100, commission: null }));
  ok("an unrecorded one is NOT treated as zero — the figure is flagged gross",
    without.value === 100 && without.net === false);
}

ok("duration is seconds between entry and exit",
  durationSeconds(trade({ enteredAt: "2026-03-02T09:00:00Z", exitedAt: "2026-03-02T09:30:00Z" })) === 1800);
ok("an open position has no duration",
  durationSeconds(trade({ exitedAt: null })) === null);
ok("a negative duration is NULL rather than a negative number averaged into the mean",
  durationSeconds(trade({ enteredAt: "2026-03-02T10:00:00Z", exitedAt: "2026-03-02T09:00:00Z" })) === null);

// PLANNED risk-reward, not achieved.
ok("a long risking 10 to make 20 is 2.0",
  plannedRiskReward(trade({ entryPrice: 100, stopPrice: 90, targetPrice: 120 })) === 2);
ok("a short is measured the same way",
  plannedRiskReward(trade({ direction: "short", entryPrice: 100, stopPrice: 110, targetPrice: 80 })) === 2);
ok("A STOP ON THE WRONG SIDE IS A DATA ERROR, not a ratio",
  plannedRiskReward(trade({ entryPrice: 100, stopPrice: 110, targetPrice: 120 })) === null);
ok("...and so is a target on the wrong side",
  plannedRiskReward(trade({ entryPrice: 100, stopPrice: 90, targetPrice: 80 })) === null);
ok("a stop at the entry is not a zero-risk trade, it is unmeasurable",
  plannedRiskReward(trade({ entryPrice: 100, stopPrice: 100, targetPrice: 120 })) === null);
// THE ONE THAT MATTERS: the exit price is not consulted, so a trade that
// was stopped out still shows the ratio it was PLANNED with.
ok("the achieved exit does not change the PLANNED ratio",
  plannedRiskReward(trade({ entryPrice: 100, stopPrice: 90, targetPrice: 120, exitPrice: 90 })) === 2);

ok("outcomes come from the NET figure", outcomeOf(trade({ pnl: 5, commission: 10 })) === "loss");
ok("a flat trade is breakeven, not a loss", outcomeOf(trade({ pnl: 0 })) === "breakeven");
ok("an underived trade is unknown", outcomeOf(trade({ pnl: null, entryPrice: null })) === "unknown");

// ===========================================================================
console.log("\n== 3. the statistics, and the figures that are absent on purpose ==");
// ===========================================================================

{
  const empty = computeStats([]);
  ok("no trades produces no rates rather than zeroes",
    empty.winRatePercent === null && empty.avgWin === null && empty.profitFactor === null && empty.counted === 0);
}
{
  const few = computeStats([trade({ pnl: 10 }), trade({ pnl: -5 }), trade({ pnl: 10 })]);
  ok(`below ${MIN_SAMPLE_FOR_RATE} decisive trades the win rate is ABSENT, not 67%`,
    few.winRatePercent === null, `${few.winRatePercent}`);
  ok("...while the totals that ARE meaningful on three trades are present",
    few.counted === 3 && few.netPnl === 15);
}
{
  const sample = [10, -5, 20, -10, 15, -5].map((pnl, i) => trade({ id: `s${i}`, pnl, commission: 0 }));
  const s = computeStats(sample);
  ok("win rate over six decisive trades is 50%", s.winRatePercent === 50, `${s.winRatePercent}`);
  ok("average win is 15 and average loss -6.67",
    s.avgWin === 15 && Math.abs(s.avgLoss + 20 / 3) < 1e-9, `${s.avgWin} / ${s.avgLoss}`);
  ok("profit factor is 45/20 = 2.25", Math.abs(s.profitFactor - 2.25) < 1e-9, `${s.profitFactor}`);
  ok("net P&L is 25", s.netPnl === 25);
  ok("commission recorded on every trade makes the figures NET", s.netOfCommission === true);
  ok("best and worst are the extremes", s.bestTrade === 20 && s.worstTrade === -10);
}
{
  // BREAKEVEN IS EXCLUDED FROM THE DENOMINATOR, not counted as a loss.
  // SIX DECISIVE TRADES, so the sample floor is cleared and the thing
  // under test is the DENOMINATOR rather than the floor. The first draft
  // used four and went red for a reason that had nothing to do with
  // breakeven handling.
  const sample = [10, 10, 10, 10, 0, 0, -5, -5].map((pnl, i) => trade({ id: `b${i}`, pnl }));
  const s = computeStats(sample);
  ok("four wins, two losses and two scratches is a 67% win rate, not 50%",
    Math.round(s.winRatePercent) === 67, `${s.winRatePercent}`);
  ok("...and the scratches are still counted and reported",
    s.breakeven === 2 && s.counted === 8);
  ok("...and would be 50% if scratches were wrongly counted as losses",
    Math.round((4 / 8) * 100) === 50);
}
{
  const s = computeStats([trade({ pnl: 10 }), trade({ pnl: 20 }), trade({ pnl: 30 }), trade({ pnl: 5 }), trade({ pnl: 5 })]);
  ok("A PROFIT FACTOR WITH NO LOSSES IS ABSENT, not infinity",
    s.profitFactor === null, `${s.profitFactor}`);
}
{
  const unscoreable = computeStats([trade({ pnl: 10 }), trade({ pnl: null, entryPrice: null })]);
  ok("a trade that cannot be scored is counted separately and reported",
    unscoreable.counted === 1 && unscoreable.unscoreable === 1);
}

// DRAWDOWN, which depends on order.
{
  // +100, -60, +20, -80 -> equity 100, 40, 60, -20. Peak 100, trough -20.
  const sample = [100, -60, 20, -80].map((pnl, i) => trade({ id: `d${i}`, pnl }));
  const s = computeStats(sample, 1000);
  ok("max drawdown is peak-to-trough, 120", s.maxDrawdown === 120, `${s.maxDrawdown}`);
  ok("...and as a percentage of the starting balance, 12%", s.maxDrawdownPercent === 12);
  const noBalance = computeStats(sample);
  ok("WITHOUT A STARTING BALANCE THE PERCENTAGE IS ABSENT, not computed against a guess",
    noBalance.maxDrawdownPercent === null && noBalance.maxDrawdown === 120);
}
{
  const rising = [10, 20, 30].map((pnl, i) => trade({ id: `r${i}`, pnl }));
  ok("a curve that only rises has no drawdown", computeStats(rising).maxDrawdown === 0);
}

// THE EQUITY CURVE STARTS AT THE BALANCE, not at zero.
{
  const points = equityCurve([trade({ pnl: 10 }), trade({ pnl: -4 })], 1000);
  ok("the curve starts from the balance and follows the trades",
    points.length === 2 && points[0].equity === 1010 && points[1].equity === 1006,
    JSON.stringify(points.map((p) => p.equity)));
  ok("with no balance it is a P&L curve from zero",
    equityCurve([trade({ pnl: 10 })])[0].equity === 10);
  ok("unscoreable trades produce no point rather than a flat one",
    equityCurve([trade({ pnl: null, entryPrice: null })]).length === 0);
}

// BUCKETS.
{
  const sample = [
    trade({ id: "i1", instrument: "EURUSD", pnl: 10 }),
    trade({ id: "i2", instrument: "EURUSD", pnl: -5 }),
    trade({ id: "i3", instrument: "GBPUSD", pnl: 7 }),
    trade({ id: "i4", instrument: null, pnl: 3 }),
  ];
  const buckets = statsByInstrument(sample);
  ok("instruments bucket, most-traded first",
    buckets.length === 2 && buckets[0].key === "EURUSD" && buckets[0].stats.counted === 2, JSON.stringify(buckets.map((b) => b.key)));
  ok("a trade with no instrument is left out rather than bucketed as 'null'",
    !buckets.some((b) => b.key === "null" || b.key === ""));
}
{
  // GROUPED BY PRIMARY SESSION, so the London/New York overlap is counted
  // once. Grouping by every session would produce win rates that cannot
  // be compared with each other.
  const overlap = [
    trade({ id: "o1", session: null, enteredAt: "2026-03-02T13:00:00Z", pnl: 10 }),
    trade({ id: "o2", session: null, enteredAt: "2026-03-02T13:30:00Z", pnl: -5 }),
  ];
  const buckets = statsBySession(overlap);
  ok("two overlap trades land in ONE bucket, not two",
    buckets.length === 1 && buckets[0].stats.counted === 2, JSON.stringify(buckets));
  // THE KEY MATTERS AS MUCH AS THE COUNT. Bucketing everything as
  // "other" also produces one bucket, and produces a table nobody can
  // read.
  ok("...and the bucket is the PRIMARY session, not a catch-all",
    buckets[0].key === "london", buckets[0].key);
  ok("...and the bucket totals equal the input, so nothing is double counted",
    buckets.reduce((sum, b) => sum + b.stats.counted, 0) === overlap.length);
}

// THE AFTER-LOSS COMPARISON.
{
  // BOTH SIDES NEED FIVE DECISIVE TRADES. The first draft used a
  // 12-trade sequence whose baseline side had three, so the comparison
  // was correctly reported as null and the test failed for the wrong
  // reason. This one gives the baseline a long winning run and the
  // after-loss side a long losing one.
  const seq = [
    10, 10, 10, 10, 10, 10, 10, 10,   // baseline: eight wins in a row
    -10, -10, -10, -10, -10, -10,     // each after a loss, another loss
  ];
  const sample = seq.map((pnl, i) => trade({ id: `p${i}`, pnl }));
  const pattern = afterLossPattern(sample);
  ok("trades after a loss are counted separately from the rest",
    pattern.afterLoss > 0 && pattern.baseline > 0, JSON.stringify(pattern));
  ok("the comparison is a difference in percentage points, both sides present",
    pattern.differencePercentagePoints !== null &&
    pattern.afterLossWinRatePercent !== null && pattern.baselineWinRatePercent !== null,
    JSON.stringify(pattern));
  ok("...and here the after-loss rate really is worse",
    pattern.afterLossWinRatePercent < pattern.baselineWinRatePercent,
    `${pattern.afterLossWinRatePercent} vs ${pattern.baselineWinRatePercent}`);
  // THE DIFFERENCE IS THE SUBTRACTION, not one of the two numbers. A
  // "difference" that is really just the after-loss rate looks plausible
  // and says nothing.
  ok("the difference really is baseline minus after-loss",
    Math.abs(pattern.differencePercentagePoints -
      (pattern.baselineWinRatePercent - pattern.afterLossWinRatePercent)) < 1e-9,
    `${pattern.differencePercentagePoints}`);
  ok("...and is positive here, because after a loss went worse",
    pattern.differencePercentagePoints > 0);
}
{
  const tiny = afterLossPattern([trade({ pnl: -1 }), trade({ pnl: 1 })]);
  ok("BELOW THE SAMPLE FLOOR NEITHER RATE IS PRINTED",
    tiny.afterLossWinRatePercent === null && tiny.differencePercentagePoints === null);
}
{
  // A SCRATCH DOES NOT BREAK THE CHAIN. loss, breakeven, trade -> the
  // trade still counts as "after a loss".
  const seq = [-10, 0, 10, -10, 0, 10, -10, 0, 10, -10, 0, 10, -10, 0, 10];
  const pattern = afterLossPattern(seq.map((pnl, i) => trade({ id: `sc${i}`, pnl })));
  ok("a breakeven between a loss and the next trade does not reset the chain",
    pattern.afterLoss >= MIN_SAMPLE_FOR_RATE, JSON.stringify(pattern));
}

// ===========================================================================
console.log("\n== 4. the rules the user wrote ==");
// ===========================================================================

ok("eight checkable kinds", RULE_KINDS.length === 8 && new Set(RULE_KINDS).size === 8);
ok("every kind round-trips through the validator",
  RULE_KINDS.every((k) => isRuleKind(k)) && !isRuleKind("max_vibes"));

// THE BRIEF'S OWN SENTENCE, parsed with no model call.
{
  const parsed = parseRulesFromText("Max 2% risk. Only London. RR at least 1:2. Max 3 trades a day.");
  const kinds = parsed.map((p) => p.params.kind).sort();
  ok("the brief's four-rule sentence parses into exactly those four rules",
    JSON.stringify(kinds) === JSON.stringify(["allowed_sessions", "max_risk_percent", "max_trades_per_day", "min_risk_reward"]),
    kinds.join(","));
  const byKind = Object.fromEntries(parsed.map((p) => [p.params.kind, p.params]));
  ok("2% risk", byKind.max_risk_percent.percent === 2);
  ok("only London", byKind.allowed_sessions.sessions.join(",") === "london");
  ok("1:2 means reward TWICE the risk, not 0.5", byKind.min_risk_reward.ratio === 2);
  ok("3 trades a day", byKind.max_trades_per_day.count === 3);
  ok("each rule keeps the CLAUSE it came from, not the whole paragraph",
    parsed.every((p) => p.matchedText.length < 30), parsed.map((p) => p.matchedText).join(" | "));
}
// THE SAME SENTENCE IN GREEK.
{
  const parsed = parseRulesFromText("Max 2% ρίσκο. Μόνο London. RR τουλάχιστον 1:2. Max 3 συναλλαγές τη μέρα.");
  const kinds = parsed.map((p) => p.params.kind).sort();
  ok("the Greek version parses into the same four rules",
    JSON.stringify(kinds) === JSON.stringify(["allowed_sessions", "max_risk_percent", "max_trades_per_day", "min_risk_reward"]),
    kinds.join(","));
}
ok("a sentence with nothing checkable in it parses to NOTHING, rather than a guess",
  parseRulesFromText("Trade well and stay disciplined.").length === 0);
ok("an empty string parses to nothing", parseRulesFromText("").length === 0 && parseRulesFromText(null).length === 0);
ok("a decimal risk is kept", parseRulesFromText("Max 0,5% risk.")[0]?.params.percent === 0.5);

// A FULL STOP BETWEEN TWO DIGITS IS A DECIMAL POINT, NOT A SENTENCE END.
//
// The line above tested "0,5" — a COMMA. The comma was never the problem.
// The clause splitter used to be /[.;\n·]+/ and it split on the full stop
// INSIDE a number, which is a different defect with a much worse outcome:
// "max 2.5% risk" became the two clauses "max 2" and "5% risk", the second
// matched the percent branch on its own, and the stored rule was FIVE
// percent — twice what the trader wrote — with their own sentence saying
// 2.5 displayed beside it. A rule that silently doubles is worse than one
// that silently fails.
//
// So the wrong separator was under test and the mutation suite proved it:
// reverting the fix left every assertion in this file green. These are the
// three cases measured against the broken splitter, before it was fixed.
{
  const risk = parseRulesFromText("Max 2.5% risk.");
  ok("a full-stop decimal risk keeps its value, and does NOT double",
    risk.length === 1 && risk[0]?.params.kind === "max_risk_percent" && risk[0]?.params.percent === 2.5,
    JSON.stringify(risk.map((r) => r.params)));

  const loss = parseRulesFromText("Max daily loss 1500.50.");
  ok("a full-stop decimal loss keeps its cents",
    loss[0]?.params.kind === "max_daily_loss" && loss[0]?.params.amount === 1500.5,
    JSON.stringify(loss.map((r) => r.params)));

  const size = parseRulesFromText("Max size 0.5 lots.");
  ok("a rule whose only number is a full-stop decimal survives at all",
    size.length === 1 && size[0]?.params.kind === "max_position_size",
    JSON.stringify(size.map((r) => r.params)));

  // AND THE SENTENCE BREAK STILL BREAKS. `\.(?!\d)` must not turn two
  // rules into one: a stop followed by a space, and a trailing stop with
  // nothing after it, are both real ends.
  const two = parseRulesFromText("Max 2.5% risk. Only London.");
  ok("a real sentence break still separates two rules",
    two.length === 2 &&
      two.some((r) => r.params.kind === "max_risk_percent" && r.params.percent === 2.5) &&
      two.some((r) => r.params.kind === "allowed_sessions"),
    JSON.stringify(two.map((r) => r.params)));
}

// THE VALIDATOR REFUSES RATHER THAN REPAIRS.
ok("a 0% risk rule is refused — it would flag every trade",
  parseRuleParams("max_risk_percent", { percent: 0 }) === null);
ok("a 200% risk rule is refused — it would flag none",
  parseRuleParams("max_risk_percent", { percent: 200 }) === null);
ok("a fractional trades-per-day is refused", parseRuleParams("max_trades_per_day", { count: 2.5 }) === null);
ok("an EMPTY session list is refused — it would forbid every trade ever made",
  parseRuleParams("allowed_sessions", { sessions: [] }) === null);
ok("...and an invented session name is dropped rather than stored",
  parseRuleParams("allowed_sessions", { sessions: ["london", "atlantis"] })?.sessions.join(",") === "london");
ok("an empty instrument list is refused", parseRuleParams("allowed_instruments", { instruments: [] }) === null);
ok("instruments are normalised on the way in",
  parseRuleParams("allowed_instruments", { instruments: ["eur/usd", "EUR USD"] })?.instruments.join(",") === "EURUSD");
ok("missing params are refused for every kind",
  RULE_KINDS.every((k) => parseRuleParams(k, {}) === null));
ok("an unknown kind is refused", parseRuleParams("max_vibes", { x: 1 }) === null);
ok("NaN and Infinity are refused everywhere",
  parseRuleParams("max_risk_percent", { percent: NaN }) === null &&
  parseRuleParams("max_daily_loss", { amount: Infinity }) === null &&
  parseRuleParams("min_risk_reward", { ratio: -1 }) === null);
ok("the bounds are real numbers, not placeholders",
  RULE_BOUNDS.percent.max === 100 && RULE_BOUNDS.count.min === 1);

// ===========================================================================
console.log("\n== 5. THE GUARDIAN: the count has to be right ==");
// ===========================================================================

const rule = (kind, params, overrides = {}) => ({
  id: overrides.id ?? `r_${kind}`,
  accountId: overrides.accountId ?? null,
  originalText: overrides.text ?? `rule ${kind}`,
  params: { kind, ...params },
  isActive: overrides.isActive !== false,
  source: "manual",
});

// RISK, at the boundary.
{
  const rules = [rule("max_risk_percent", { percent: 2 })];
  const under = evaluate([trade({ id: "u", riskAmount: 199 })], rules, { startingBalance: 10_000 });
  const exact = evaluate([trade({ id: "e", riskAmount: 200 })], rules, { startingBalance: 10_000 });
  const over = evaluate([trade({ id: "o", riskAmount: 201 })], rules, { startingBalance: 10_000 });
  ok("1.99% does not break a 2% rule", under.violations.length === 0);
  ok("EXACTLY 2% DOES NOT BREAK IT — the rule says 'max 2%'", exact.violations.length === 0);
  ok("2.01% does", over.violations.length === 1);
  ok("...and the violation carries what was observed and what was allowed",
    over.violations[0].detail.observed === 2.01 && over.violations[0].detail.allowed === 2,
    JSON.stringify(over.violations[0].detail));
}
{
  // FLOATING POINT. A risk of exactly 2% must not be flagged because
  // 200/10000*100 came out as 2.0000000000000004.
  const rules = [rule("max_risk_percent", { percent: 2 })];
  let flagged = 0;
  for (let balance = 1000; balance <= 20000; balance += 137) {
    const risk = balance * 0.02;
    const result = evaluate([trade({ id: `f${balance}`, riskAmount: risk })], rules, { startingBalance: balance });
    flagged += result.violations.length;
  }
  ok("an exactly-2% risk is never flagged, at any balance", flagged === 0, `${flagged} false positives`);
}
{
  const rules = [rule("max_risk_percent", { percent: 2 })];
  const noBalance = evaluate([trade({ riskAmount: 500 })], rules, { startingBalance: null });
  ok("WITHOUT A BALANCE THE RULE IS UNCHECKABLE, not passed",
    noBalance.violations.length === 0 && noBalance.uncheckable.length === 1);
  ok("...and it says what was missing", noBalance.uncheckable[0].missing.includes("balance"));
  const noRisk = evaluate([trade({ riskAmount: null })], rules, { startingBalance: 10_000 });
  ok("a trade with no risk amount is uncheckable, not compliant",
    noRisk.violations.length === 0 && noRisk.uncheckable.length === 1);
}

// TRADES PER DAY: the position in the day, not the day's total.
{
  const rules = [rule("max_trades_per_day", { count: 3 })];
  const day = [1, 2, 3, 4, 5].map((n) =>
    trade({ id: `d${n}`, enteredAt: `2026-03-02T0${n}:00:00Z`, exitedAt: `2026-03-02T0${n}:30:00Z` })
  );
  const result = evaluate(day, rules, { startingBalance: null });
  ok("five trades against a limit of three is TWO violations, not five",
    result.violations.length === 2, `${result.violations.length}`);
  ok("...and they are the fourth and the fifth",
    result.violations.map((v) => v.tradeId).join(",") === "d4,d5");
  ok("the detail names the position and the limit",
    result.violations[0].detail.observed === 4 && result.violations[0].detail.allowed === 3);
}
{
  const rules = [rule("max_trades_per_day", { count: 3 })];
  const twoDays = [
    ...[1, 2, 3].map((n) => trade({ id: `a${n}`, enteredAt: `2026-03-02T0${n}:00:00Z` })),
    ...[1, 2, 3].map((n) => trade({ id: `b${n}`, enteredAt: `2026-03-03T0${n}:00:00Z` })),
  ];
  ok("three trades on each of two days breaks nothing",
    evaluate(twoDays, rules, { startingBalance: null }).violations.length === 0);
}

// SESSIONS: the overlap must not be punished.
{
  const rules = [rule("allowed_sessions", { sessions: ["london"] })];
  const inOverlap = evaluate(
    [trade({ id: "ov", session: null, enteredAt: "2026-03-02T13:00:00Z" })],
    rules,
    { startingBalance: null }
  );
  ok("A 13:00 TRADE DOES NOT BREAK 'ONLY LONDON' — it IS a London trade",
    inOverlap.violations.length === 0, JSON.stringify(inOverlap.violations));
  // THE DISCRIMINATING CASE. A rule of "only New York" against a 13:00
  // trade: the trade IS in New York, but the PRIMARY session is London.
  // Checking the primary would report a violation that did not happen —
  // and a check written only against "only London" passes either way.
  const nyRule = [rule("allowed_sessions", { sessions: ["new_york"] })];
  const inOverlapNy = evaluate(
    [trade({ id: "ovny", session: null, enteredAt: "2026-03-02T13:00:00Z" })],
    nyRule,
    { startingBalance: null }
  );
  ok("...and a 13:00 trade does not break 'only NEW YORK' either, though its PRIMARY session is London",
    inOverlapNy.violations.length === 0, JSON.stringify(inOverlapNy.violations));

  const inTokyo = evaluate(
    [trade({ id: "tk", session: null, enteredAt: "2026-03-02T02:00:00Z" })],
    rules,
    { startingBalance: null }
  );
  ok("a 02:00 trade does break it", inTokyo.violations.length === 1);
  ok("...and the violation names both sides",
    String(inTokyo.violations[0].detail.allowed) === "london" &&
    String(inTokyo.violations[0].detail.observed).length > 0,
    JSON.stringify(inTokyo.violations[0].detail));
}

// RISK-REWARD: measured on the plan, not the outcome.
{
  const rules = [rule("min_risk_reward", { ratio: 2 })];
  const stoppedOut = evaluate(
    [trade({ id: "so", entryPrice: 100, stopPrice: 90, targetPrice: 120, exitPrice: 90, pnl: -10 })],
    rules,
    { startingBalance: null }
  );
  ok("A TRADE THAT HIT ITS STOP DOES NOT BREAK A RISK-REWARD RULE — the plan was 2:1",
    stoppedOut.violations.length === 0, JSON.stringify(stoppedOut.violations));
  const badPlan = evaluate(
    [trade({ id: "bp", entryPrice: 100, stopPrice: 90, targetPrice: 110 })],
    rules,
    { startingBalance: null }
  );
  ok("a plan of 1:1 against a 2:1 rule does break it", badPlan.violations.length === 1);
}

// DAILY LOSS: the trade that crossed, not the whole day.
{
  const rules = [rule("max_daily_loss", { amount: 100 })];
  const day = [
    trade({ id: "w", pnl: 50, enteredAt: "2026-03-02T01:00:00Z", exitedAt: "2026-03-02T01:30:00Z" }),
    trade({ id: "l1", pnl: -80, enteredAt: "2026-03-02T02:00:00Z", exitedAt: "2026-03-02T02:30:00Z" }),
    trade({ id: "l2", pnl: -100, enteredAt: "2026-03-02T03:00:00Z", exitedAt: "2026-03-02T03:30:00Z" }),
    trade({ id: "l3", pnl: -10, enteredAt: "2026-03-02T04:00:00Z", exitedAt: "2026-03-02T04:30:00Z" }),
  ];
  const result = evaluate(day, rules, { startingBalance: null });
  // Running: +50, -30, -130, -140. Crosses at l2.
  ok("the WINNING trade before the loss is not flagged",
    !result.violations.some((v) => v.tradeId === "w"));
  ok("...nor the loss that kept the day inside the limit",
    !result.violations.some((v) => v.tradeId === "l1"));
  ok("the trade that took the day past the limit IS flagged, and so is the one after",
    result.violations.map((v) => v.tradeId).sort().join(",") === "l2,l3",
    result.violations.map((v) => v.tradeId).join(","));
}
// A DAY THAT RECOVERS. The running total is what the rule is about, so a
// trader who went 150 down and then made 100 back is no longer past a
// 100 limit — and the trade after the recovery must not be flagged. A
// "was it ever crossed today" check passes the fixture above and fails
// this one.
{
  const rules = [rule("max_daily_loss", { amount: 100 })];
  const day = [
    trade({ id: "r1", pnl: -150, enteredAt: "2026-03-04T01:00:00Z", exitedAt: "2026-03-04T01:30:00Z" }),
    trade({ id: "r2", pnl: 100, enteredAt: "2026-03-04T02:00:00Z", exitedAt: "2026-03-04T02:30:00Z" }),
    trade({ id: "r3", pnl: -10, enteredAt: "2026-03-04T03:00:00Z", exitedAt: "2026-03-04T03:30:00Z" }),
  ];
  const result = evaluate(day, rules, { startingBalance: null });
  // Running: -150 (past the limit), -50 (recovered), -60 (still inside).
  ok("only the trade that was actually past the limit is flagged, not the ones after the recovery",
    result.violations.map((v) => v.tradeId).join(",") === "r1",
    result.violations.map((v) => v.tradeId).join(","));
}

// PAUSE AFTER A LOSS.
{
  const rules = [rule("no_trade_after_loss", { withinMinutes: 30 })];
  const tooSoon = [
    trade({ id: "loss", pnl: -10, enteredAt: "2026-03-02T09:00:00Z", exitedAt: "2026-03-02T09:30:00Z" }),
    trade({ id: "soon", pnl: 5, enteredAt: "2026-03-02T09:40:00Z", exitedAt: "2026-03-02T10:00:00Z" }),
  ];
  ok("a trade 10 minutes after a loss breaks a 30-minute pause rule",
    evaluate(tooSoon, rules, { startingBalance: null }).violations.map((v) => v.tradeId).join(",") === "soon");
  const waited = [
    trade({ id: "loss", pnl: -10, enteredAt: "2026-03-02T09:00:00Z", exitedAt: "2026-03-02T09:30:00Z" }),
    trade({ id: "later", pnl: 5, enteredAt: "2026-03-02T10:05:00Z", exitedAt: "2026-03-02T10:30:00Z" }),
  ];
  ok("...and 35 minutes after does not", evaluate(waited, rules, { startingBalance: null }).violations.length === 0);
  const afterWin = [
    trade({ id: "win", pnl: 10, enteredAt: "2026-03-02T09:00:00Z", exitedAt: "2026-03-02T09:30:00Z" }),
    trade({ id: "next", pnl: 5, enteredAt: "2026-03-02T09:35:00Z", exitedAt: "2026-03-02T10:00:00Z" }),
  ];
  ok("a trade right after a WIN breaks nothing", evaluate(afterWin, rules, { startingBalance: null }).violations.length === 0);
}

// SCOPING AND DETERMINISM.
{
  const rules = [rule("max_position_size", { size: 1 }, { accountId: "acc-a" })];
  const mixed = [
    trade({ id: "a", accountId: "acc-a", size: 2 }),
    trade({ id: "b", accountId: "acc-b", size: 2 }),
  ];
  const result = evaluate(mixed, rules, { startingBalance: null });
  ok("a rule scoped to one account ignores trades in another",
    result.violations.map((v) => v.tradeId).join(",") === "a");
}
{
  const rules = [rule("max_position_size", { size: 1 }), rule("max_risk_percent", { percent: 1 })];
  const sample = [trade({ id: "x", size: 5, riskAmount: 500 })];
  const first = evaluate(sample, rules, { startingBalance: 10_000 });
  const second = evaluate(sample, rules, { startingBalance: 10_000 });
  ok("THE SAME INPUT ALWAYS PRODUCES THE SAME VIOLATIONS — the count is arithmetic",
    JSON.stringify(first) === JSON.stringify(second));
  ok("both rules fire on one trade", first.violations.length === 2);
}
{
  const inactive = evaluate([trade({ size: 5 })], [rule("max_position_size", { size: 1 }, { isActive: false })], { startingBalance: null });
  ok("an inactive rule checks nothing", inactive.violations.length === 0 && inactive.evaluated === 0);
}

// "EIGHT TIMES IN MARCH".
{
  const rules = [rule("max_position_size", { size: 1 }, { text: "Max 1 lot" })];
  const march = Array.from({ length: 8 }, (_, i) =>
    trade({ id: `m${i}`, size: 2, exitedAt: `2026-03-${String(i + 1).padStart(2, "0")}T10:00:00Z` })
  );
  const april = [trade({ id: "apr", size: 2, exitedAt: "2026-04-05T10:00:00Z" })];
  const result = evaluate([...march, ...april], rules, { startingBalance: null });
  const summary = summarise(result.violations, new Date("2026-03-01T00:00:00Z"), new Date("2026-04-01T00:00:00Z"));
  ok("the March window counts EXACTLY eight, excluding April",
    summary.length === 1 && summary[0].count === 8, JSON.stringify(summary));
  ok("...and the summary carries the user's own sentence, not a paraphrase",
    summary[0].ruleText === "Max 1 lot");
  ok("with no window, all nine are counted",
    summarise(result.violations)[0].count === 9);
}
{
  // TWO RULES OF THE SAME KIND ARE NOT MERGED.
  const rules = [
    rule("max_position_size", { size: 1 }, { id: "r1", text: "Max 1 lot on the funded account" }),
    rule("max_position_size", { size: 3 }, { id: "r2", text: "Max 3 lots on the personal account" }),
  ];
  const result = evaluate([trade({ id: "big", size: 5 })], rules, { startingBalance: null });
  const summary = summarise(result.violations);
  ok("two rules of the same kind stay two lines, with their own sentences",
    summary.length === 2, JSON.stringify(summary.map((s) => s.ruleText)));
}

// ===========================================================================
console.log("\n== 6. RULE 2: never a private key, never a seed phrase ==");
// ===========================================================================

const SECRETS = [
  ["a 12-word mnemonic", "legal winner thank year wave sausage worth useful legal winner thank yellow", "mnemonic"],
  ["a 24-word mnemonic", Array(24).fill("abandon").join(" "), "mnemonic"],
  ["a 15-word mnemonic", Array(15).fill("ripple").join(" "), "mnemonic"],
  ["a raw hex private key", "4c0883a69102937d6231471b5dbb6204fe5129617082792ae468d01a3f362318", "hex_private_key"],
  ["the same with 0x", "0x4c0883a69102937d6231471b5dbb6204fe5129617082792ae468d01a3f362318", "hex_private_key"],
  ["a WIF key", "5HueCGU8rMjxEXxiPuD5BDku4MkFqeZyd4dZ1jvhTVqvbTLvyTJ", "wif_private_key"],
  ["an xprv", "xprv9s21ZrQH143K3QTDL4LXw2F7HEK3wJUD2nW2nRk4stbPy6cq3jPPqjiChkVvvNKmPGJxWUtg6LnF5kejMRNNU3TGtRBeJgk33yuGBxrMPHi", "extended_private_key"],
  ["a PEM block", "-----BEGIN EC PRIVATE KEY-----\nMHQCAQEE\n-----END EC PRIVATE KEY-----", "pem_private_key"],
];
for (const [what, value, shape] of SECRETS) {
  const scan = scanForSecret(value);
  ok(`${what} is recognised as a secret`, scan.looksSecret === true && scan.shape === shape, JSON.stringify(scan));
  const assertion = assertNoSecret(value);
  ok(`...and is REFUSED`, assertion.ok === false && assertion.shape === shape);
  // THE VALUE IS NEVER ECHOED. A validation message containing the seed
  // phrase puts it in the DOM, in a log, and in a screenshot.
  ok(`...without the value appearing in the answer`,
    !JSON.stringify(assertion).includes(value.slice(0, 20)), JSON.stringify(assertion));
}

const NOT_SECRETS = [
  ["an Ethereum address", "0x742d35Cc6634C0532925a3b844Bc454e4438f44e"],
  ["a Bitcoin legacy address", "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa"],
  ["a bech32 address", "bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq"],
  ["a Solana address", "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM"],
  ["an xPUB, which is watch-only and legitimate", "xpub661MyMwAqRbcFtXgS5sYJABqqG9YLmC4Q1Rdap9gSE8NqtwybGhePY2gZ29ESFjqJoCu1Rupje8YtGqsefD265TMg7usUDFdp6W1EGMcet8"],
  ["a label", "my cold wallet"],
  ["an empty string", ""],
];
for (const [what, value] of NOT_SECRETS) {
  ok(`${what} is NOT flagged`, scanForSecret(value).looksSecret === false, JSON.stringify(scanForSecret(value)));
}

// THE ADDRESS CHECK RUNS THE SECRET SCAN FIRST.
{
  const key = "0x4c0883a69102937d6231471b5dbb6204fe5129617082792ae468d01a3f362318";
  const result = checkWalletAddress(key, "ethereum");
  ok("an Ethereum PRIVATE KEY pasted into the address field is refused as a secret",
    result.ok === false && result.reason === "looks_like_a_secret", JSON.stringify(result));
  ok("a real Ethereum address is accepted",
    checkWalletAddress("0x742d35Cc6634C0532925a3b844Bc454e4438f44e", "ethereum").ok === true);
  ok("a seed phrase is refused for every chain",
    WALLET_CHAINS.every((c) => checkWalletAddress(Array(12).fill("abandon").join(" "), c).ok === false));
  ok("an over-long value is refused before anything else",
    checkWalletAddress("x".repeat(MAX_ADDRESS_LENGTH + 1), "other").reason === "too_long");
}

// THE SCHEMA HAS NOWHERE TO PUT ONE.
{
  const wallets = stripSql(FINANCE_SQL).slice(stripSql(FINANCE_SQL).indexOf("create table if not exists public.crypto_wallets"));
  const block = wallets.slice(0, wallets.indexOf(");"));
  ok("crypto_wallets has no column that could hold a key or a phrase",
    !/private|secret|seed|mnemonic|passphrase|key_encrypted|xprv/i.test(block),
    (block.match(/private|secret|seed|mnemonic|passphrase|xprv/gi) ?? []).join(","));
  ok("...and the address column forbids whitespace, which a seed phrase is made of",
    /crypto_wallets_address_single_token check \(address !~ '\\s'\)/.test(block) || /address !~ .\\s./.test(block),
    block.split("\n").filter((l) => l.includes("single_token")).join(" "));
  ok("...and bounds the length below a mnemonic's",
    /length\(address\) <= 128/.test(block));
}

// ===========================================================================
console.log("\n== 7. RULES 3 AND 4: no advice, no prediction ==");
// ===========================================================================

const ADVICE = [
  ["a direct recommendation", "You should buy EURUSD here."],
  ["a hedged one", "I would recommend reducing your size."],
  ["a suggestion to enter", "Consider buying gold at this level."],
  ["a timing claim", "It's a good time to enter."],
  ["a labelled recommendation", "My recommendation: go long."],
  ["Greek, first person", "Θα σου πρότεινα να μειώσεις το μέγεθος."],
  ["Greek, imperative", "Πρέπει να αγοράσεις τώρα."],
  ["Greek, direct", "Σου προτείνω να πουλήσεις."],
];
for (const [what, text] of ADVICE) {
  ok(`${what} is caught as advice`, findConductBreaches(text).includes("recommendation"), text);
}

const PREDICTIONS = [
  ["a direction claim", "EURUSD will rise next week."],
  ["a likelihood claim", "Gold is likely to fall from here."],
  ["a named forecast", "My price target is 1.15."],
  ["Greek", "Θα ανέβει μέχρι το τέλος του μήνα."],
  ["Greek, explicit", "Η πρόβλεψή μου είναι πτώση."],
];
for (const [what, text] of PREDICTIONS) {
  ok(`${what} is caught as a prediction`, findConductBreaches(text).includes("prediction"), text);
}

const VALUATIONS = [
  ["oversold", "EURUSD looks oversold on the daily."],
  ["bullish", "The setup is bullish."],
  ["a good entry", "That was a good entry."],
  ["Greek", "Το ζεύγος είναι υπερπουλημένο."],
];
for (const [what, text] of VALUATIONS) {
  ok(`${what} is caught as a valuation`, findConductBreaches(text).includes("valuation"), text);
}

// THE FILTER MUST NOT EAT THE JOURNAL'S OWN VOCABULARY. A filter that
// blocks the product's real sentences gets switched off, which is worse
// than no filter.
const ALLOWED = [
  "You bought EURUSD twice in March.",
  "You broke your 2% risk rule eight times in March.",
  "Trades opened after a loss won 31% of the time, against 58% otherwise.",
  "Your largest loss was 240 EUR on 3 March.",
  "Three trades were outside the London session.",
  "Αγόρασες EURUSD δύο φορές τον Μάρτιο.",
  "Παραβίασες τον κανόνα του 2% οκτώ φορές τον Μάρτιο.",
  "Οι συναλλαγές μετά από ζημιά κέρδισαν στο 31% έναντι 58%.",
  "Η μεγαλύτερη ζημιά σου ήταν 240 EUR στις 3 Μαρτίου.",
];
for (const text of ALLOWED) {
  ok(`the journal's own sentence survives: "${text.slice(0, 45)}..."`,
    !containsAdvice(text), findConductBreaches(text).join(","));
}
// EVERY GREEK PATTERN LITERAL MUST BE IN FOLDED FORM.
//
// A pattern written with an accent or a capital can never match the
// folded text it is run against — it fails silently, in one language
// only, which is exactly how both of this filter's original bugs shipped.
// isFolded() is the codebase's own check for that.
{
  // THE PATTERNS ONLY — never the prompts. TRADING_CONDUCT_EL is Greek
  // PROSE a model reads, and folding it would strip the accents out of an
  // instruction written for a human-language reader. The first version of
  // this check scanned whole files and flagged all 120 words of it, which
  // is the check being wrong rather than the code.
  const unfolded = [];
  const regionOf = (file, from, to) => {
    const code = stripTs(src(file));
    const start = code.indexOf(from);
    const end = to ? code.indexOf(to, start) : code.length;
    return start < 0 ? "" : code.slice(start, end < 0 ? code.length : end);
  };
  const regions = [
    ["src/lib/trading/conduct.ts", regionOf("src/lib/trading/conduct.ts", "const RECOMMENDATION = [", "export function findConductBreaches")],
    ["src/lib/trading/rules.ts", regionOf("src/lib/trading/rules.ts", "export function parseRulesFromText")],
  ];
  for (const [file, region] of regions) {
    ok(`${file}: the pattern region was found and is not empty`, region.length > 100, `${region.length} chars`);
    for (const match of region.match(/[\u0370-\u03ff\u1f00-\u1fff]{2,}/g) ?? []) {
      if (!isFolded(match)) unfolded.push(`${file}: ${match}`);
    }
  }
  ok("every Greek literal in the parser and the advice filter is in folded form",
    unfolded.length === 0, unfolded.join(", "));
  ok("...and isFolded really does reject an accented one, so the check above is not vacuous",
    isFolded("μονο") === true && isFolded("μόνο") === false && isFolded("ΜΟΝΟ") === false);
}

// THE FOLD IS WHAT MAKES GREEK WORK AT ALL. Capitals and missing accents
// are how Greek is actually typed.
{
  const VARIANTS = [
    "Σου προτείνω να πουλήσεις.",
    "ΣΟΥ ΠΡΟΤΕΙΝΩ ΝΑ ΠΟΥΛΗΣΕΙΣ.",
    "σου προτεινω να πουλησεις.",
    "Σου Προτείνω Να Πουλήσεις.",
  ];
  for (const text of VARIANTS) {
    ok(`advice is caught however it is typed: "${text.slice(0, 28)}..."`,
      findConductBreaches(text).includes("recommendation"));
  }
  const RULE_VARIANTS = ["Μόνο London.", "ΜΟΝΟ LONDON.", "μονο london."];
  for (const text of RULE_VARIANTS) {
    ok(`the session rule parses however it is typed: "${text}"`,
      parseRulesFromText(text)[0]?.params.kind === "allowed_sessions",
      JSON.stringify(parseRulesFromText(text)));
  }
  ok("...and the final sigma is folded too, so ΚΑΦΕΣ-style endings match",
    foldForMatch("ΠΟΥΛΗΣΕΙΣ") === foldForMatch("πουλήσεις"));
}

ok("a paragraph that both predicts AND recommends records both",
  findConductBreaches("EURUSD will rise. You should buy it.").sort().join(",") === "prediction,recommendation");
ok("empty and non-string input is not a breach",
  findConductBreaches("").length === 0 && findConductBreaches(null).length === 0);

// THE PROMPTS EXIST, IN BOTH LANGUAGES.
for (const [name, text] of [["English", TRADING_CONDUCT_EN], ["Greek", TRADING_CONDUCT_EL]]) {
  ok(`the ${name} conduct prompt forbids recommending`, /recommend|προτείν/i.test(text));
  ok(`the ${name} conduct prompt forbids forecasting`, /will do|forecast|πρόβλεψ|θα κάνει/i.test(text));
  ok(`the ${name} conduct prompt says what IS allowed, so it is not only a wall of no`,
    /You MAY|ΜΠΟΡΕΙΣ να/.test(text));
}

// ===========================================================================
console.log("\n== 8. RULE 1: read-only, and RULE 6: never in a log ==");
// ===========================================================================

const WRITES = [
  ["a transfer", "POST", "https://api.example.com/v1/transfers"],
  ["a payment", "POST", "https://api.example.com/payments/initiate"],
  ["a payout", "POST", "https://api.example.com/v1/payouts"],
  ["a withdrawal", "POST", "https://api.example.com/account/withdraw"],
  ["a beneficiary", "POST", "https://api.example.com/beneficiaries"],
  ["a standing order", "POST", "https://api.example.com/standing-orders"],
  ["a signed transaction", "POST", "https://api.example.com/tx/sign"],
  ["a swap", "POST", "https://api.example.com/v1/swap"],
];
for (const [what, method, url] of WRITES) {
  const result = checkReadOnly(method, url);
  ok(`${what} is refused`, result.ok === false, JSON.stringify(result));
}
const READS = [
  ["accounts", "GET", "https://api.example.com/v1/accounts"],
  ["transactions", "POST", "https://api.example.com/v1/transactions/get"],
  ["balances", "GET", "https://api.example.com/v1/balances"],
  ["an address balance", "GET", "https://api.example.com/address/0xabc/balance"],
];
for (const [what, method, url] of READS) {
  ok(`reading ${what} is allowed`, checkReadOnly(method, url).ok === true, JSON.stringify(checkReadOnly(method, url)));
}
ok("DELETE, PUT and PATCH are refused whatever the path",
  ["DELETE", "PUT", "PATCH"].every((m) => checkReadOnly(m, "https://api.example.com/v1/accounts").ok === false));
ok("only GET and POST are ever allowed", READ_ONLY_METHODS.join(",") === "GET,POST");
ok("an unparseable URL is refused rather than allowed",
  checkReadOnly("GET", "not a url").ok === false);

// RULE 6: the refusal must not carry the URL or a token.
{
  const source = stripTs(src("src/lib/finance/read-only.ts"));
  ok("the WriteAttemptError message contains no URL and no body",
    !/\$\{url\}|\$\{init|token/i.test(source.slice(source.indexOf("class WriteAttemptError"), source.indexOf("class WriteAttemptError") + 500)));
  ok("read-only.ts logs nothing at all",
    !/console\.|logApiError/.test(source), (source.match(/console\.\w+|logApiError/g) ?? []).join(","));
}
{
  // The encryption module is REUSED, not reimplemented — one path for a
  // key to be mishandled rather than two.
  const financeFiles = readdirSync("src/lib/finance").map((f) => join("src/lib/finance", f));
  const reimplemented = financeFiles.filter((f) => /createCipheriv|aes-256/i.test(src(f)));
  ok("no second encryption implementation was written for finance",
    reimplemented.length === 0, reimplemented.join(","));
  ok("the existing AES-256-GCM module is the one the migration points at",
    FINANCE_SQL.includes("lib/integrations/crypto.ts"));
}
{
  // Nothing in the trading or finance libraries logs a value that could
  // be a credential.
  const files = [
    ...readdirSync("src/lib/trading").map((f) => join("src/lib/trading", f)),
    ...readdirSync("src/lib/finance").map((f) => join("src/lib/finance", f)),
  ];
  const logging = files.filter((f) => /console\.(log|info|warn)/.test(stripTs(src(f))));
  ok("no trading or finance module writes to the console",
    logging.length === 0, logging.join(","));
}

// ===========================================================================
console.log("\n== 9. RULE 5: the disclaimer, on every surface ==");
// ===========================================================================

{
  const pages = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir)) {
      const p = join(dir, entry);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.tsx?$/.test(p)) pages.push(p);
    }
  };
  walk("src/app/dashboard");

  // A surface that READS this data must MOUNT the notice.
  const readsFinancialData = pages.filter((p) => {
    const text = stripTs(src(p));
    return /lib\/trading\/(load|stats|guardian)|from "@\/lib\/trading\/load"|bank_transactions|crypto_wallets/.test(text);
  });
  ok(`at least one dashboard surface reads this data (${readsFinancialData.length})`, readsFinancialData.length > 0);
  // MOUNTED, not merely imported. An import line survives the component
  // being replaced by {null}, which is exactly the shape a careless edit
  // takes.
  const missing = readsFinancialData.filter((p) => !/<TradingDisclaimer\b/.test(src(p)));
  ok("EVERY surface reading trading, bank or crypto data mounts the disclaimer",
    missing.length === 0, missing.join(", "));
}
{
  const disclaimer = src("src/components/trading/trading-disclaimer.tsx");
  ok("the disclaimer is a SERVER component — it cannot be conditionally skipped by a client",
    !/"use client"/.test(disclaimer));
  // NOT A BARE /hidden/ — `aria-hidden="true"` on the warning icon
  // contains it, and matching that reported a dismiss control on a
  // component that has none. The check asks for the things that would
  // actually make it dismissible.
  ok("...and has no dismiss control",
    !/onClick|dismiss|onDismiss|\bclose\b|useState/i.test(stripTs(disclaimer)),
    (stripTs(disclaimer).match(/onClick|dismiss|\bclose\b|useState/gi) ?? []).join(","));
  ok("...and the icon that IS aria-hidden is still there, so the check above is not matching nothing",
    disclaimer.includes('aria-hidden="true"'));
}
{
  const LOCALES = ["en", "el", "es", "fr", "de", "it", "pt", "zh", "ja", "ar"];
  const messages = Object.fromEntries(LOCALES.map((l) => [l, JSON.parse(src(`messages/${l}.json`))]));
  let gaps = [];
  for (const locale of LOCALES) {
    const trading = messages[locale].dashboard?.trading;
    if (typeof trading?.disclaimer !== "string" || trading.disclaimer.length < 60) gaps.push(`${locale}:disclaimer`);
    if (typeof trading?.adviceRefused !== "string") gaps.push(`${locale}:adviceRefused`);
  }
  ok("the disclaimer and the advice refusal exist, in full, in all ten locales", gaps.length === 0, gaps.join(", "));

  // THE DISCLAIMER MUST SAY THE THREE THINGS. A translated string that
  // dropped one of them would still pass a "key exists" check.
  const MUST_SAY = {
    en: [/not investment advice/i, /forecast|prediction/i, /risk of loss/i],
    el: [/δεν είναι επενδυτική συμβουλή/i, /πρόβλεψη/i, /κίνδυνο ζημιάς/i],
    es: [/no es asesoramiento/i, /previsión/i, /riesgo de pérdida/i],
    fr: [/pas un conseil/i, /prévision/i, /risque de perte/i],
    de: [/keine anlageberatung/i, /prognose/i, /verlustrisiko/i],
    it: [/non è consulenza/i, /previsione/i, /rischio di perdita/i],
    pt: [/não é aconselhamento/i, /previsão/i, /risco de perda/i],
    zh: [/不是投资建议/, /预测/, /亏损风险/],
    ja: [/投資助言でも/, /予測/, /損失/],
    ar: [/ليست نصيحة استثمارية/, /توقّع/, /مخاطر خسارة/],
  };
  let incomplete = [];
  for (const [locale, patterns] of Object.entries(MUST_SAY)) {
    const text = messages[locale].dashboard.trading.disclaimer;
    for (const [i, pattern] of patterns.entries()) {
      if (!pattern.test(text)) incomplete.push(`${locale}[${i}]`);
    }
  }
  ok("every locale's disclaimer says all three things: not advice, not a forecast, risk of loss",
    incomplete.length === 0, incomplete.join(", "));

  for (const locale of LOCALES) {
    const trading = messages[locale].dashboard.trading;
    ok(`${locale}: every session and rule kind has a label`,
      TRADING_SESSIONS.every((s) => typeof trading.sessions?.[s] === "string") &&
      RULE_KINDS.every((k) => typeof trading.ruleKinds?.[k] === "string") &&
      RULE_KINDS.every((k) => typeof trading.ruleSummary?.[k] === "string"));
  }
}

// ===========================================================================
console.log("\n== 10. the schema says what the code says ==");
// ===========================================================================

ok("the journal migration adds no NOT NULL column to the existing trades table",
  !/alter table public\.trades add column if not exists [a-z_]+ [a-z()0-9, ]*not null/i.test(stripSql(JOURNAL_SQL)));
ok("the session CHECK lists exactly the sessions the code knows",
  TRADING_SESSIONS.every((s) => JOURNAL_SQL.includes(`'${s}'`)));
ok("the rule-kind CHECK lists exactly the kinds the code knows",
  RULE_KINDS.every((k) => JOURNAL_SQL.includes(`'${k}'`)));
{
  const inCheck = (JOURNAL_SQL.match(/kind text not null check \(kind in \(([\s\S]*?)\)\)/)?.[1] ?? "")
    .split(",").map((s) => s.trim().replace(/'/g, "")).filter(Boolean);
  ok(`...and nothing else (${inCheck.length})`,
    JSON.stringify([...inCheck].sort()) === JSON.stringify([...RULE_KINDS].sort()),
    inCheck.join(","));
}
ok("deleting an account does NOT delete the trades made in it",
  /account_id uuid\s*\n?\s*references public\.trading_accounts\(id\) on delete set null/.test(stripSql(JOURNAL_SQL)));
ok("a violation OUTLIVES the rule it refers to",
  /rule_id uuid references public\.trading_rules\(id\) on delete set null/.test(stripSql(JOURNAL_SQL)) &&
  /rule_text text not null/.test(stripSql(JOURNAL_SQL)));
ok("re-running the guardian cannot double a count",
  /create unique index if not exists rule_violations_trade_rule_idx/.test(JOURNAL_SQL));
ok("a user cannot EDIT a recorded violation",
  /revoke update on public\.rule_violations from authenticated/.test(JOURNAL_SQL));

ok("every new table has RLS enabled",
  ["trading_accounts", "trading_rules", "rule_violations"].every((t) =>
    JOURNAL_SQL.includes(`alter table public.${t} enable row level security`)) &&
  ["bank_connections", "bank_transactions", "crypto_wallets"].every((t) =>
    FINANCE_SQL.includes(`alter table public.${t} enable row level security`)));

// READ-ONLY, IN THE SCHEMA.
ok("bank scopes are constrained to READ scopes only",
  /scopes <@ array\['accounts:read', 'transactions:read', 'balances:read', 'identity:read'\]/.test(FINANCE_SQL));
ok("a bank connection can only ever be read_only",
  /access_mode text not null default 'read_only' check \(access_mode = 'read_only'\)/.test(FINANCE_SQL));
ok("a wallet can only ever be watch_only",
  /access_mode text not null default 'watch_only' check \(access_mode = 'watch_only'\)/.test(FINANCE_SQL));
ok("a user cannot write their own bank connection or transactions",
  /revoke insert, update on public\.bank_connections from authenticated/.test(FINANCE_SQL) &&
  /revoke insert, update, delete on public\.bank_transactions from authenticated/.test(FINANCE_SQL));
// NO \b AROUND "iban": an underscore is a word character, so
// \biban\b does not match `counterparty_iban` — the column somebody
// would actually add.
ok("the bank tables hold no account number or IBAN",
  !/iban|account_number|sort_code|routing_number/i.test(stripSql(FINANCE_SQL)),
  (stripSql(FINANCE_SQL).match(/iban|account_number|sort_code|routing_number/gi) ?? []).join(","));
ok("neither migration drops a table, truncates, or deletes unqualified",
  ![JOURNAL_SQL, FINANCE_SQL].map(stripSql).some((s) => /drop\s+table|truncate|delete\s+from/i.test(s)));
ok("...and both still promise it in their headers, which the strip above had to see past",
  [JOURNAL_SQL, FINANCE_SQL].every((s) => /No DROP TABLE, no TRUNCATE/.test(s)));

// ===========================================================================
console.log(`\n${pass} passed, ${failures.length} failed`);
if (failures.length) {
  console.log("FAILURES:\n  " + failures.join("\n  "));
  process.exit(1);
}
