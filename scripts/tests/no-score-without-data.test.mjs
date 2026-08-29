// THE THRESHOLD, DERIVED RATHER THAN DECLARED.
//
// V4.6 #5 asked for the score to be withheld until there are N entries,
// and for N to come with a reason. A number in a constant with a
// paragraph beside it is not a reason — the paragraph can stop being
// true the moment the formula changes. So the reason is COMPUTED here,
// from the real computeHealthScore, and the constant has to survive it.
//
// The claim being defended: below five entries the score is dominated by
// single events. Specifically, the FIRST entry moves it about thirty
// points out of a hundred, because `recency` jumps 0 -> 100 the moment
// anything exists. A number that swings a third of its range on one
// action reports the last thing you did, not how the business is going —
// and it flips the printed label from "just starting" to "building
// momentum" on that same one entry.
//
// The companion browser test is scripts/tests/no-score-without-data.prodtest.mjs,
// which proves the ring is actually absent on a real empty account. This
// one proves the number was picked for a reason that still holds.
//
// Run: node scripts/tests/no-score-without-data.test.mjs
import { readFileSync } from "node:fs";
import { loadTs } from "./load-ts.mjs";

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

const {
  computeHealthScore,
  hasEnoughDataForScore,
  HEALTH_SCORE_MIN_ENTRIES,
  CHART_MIN_ENTRIES,
  CONSISTENCY_WINDOW_DAYS,
} = await loadTs("src/lib/health-score.ts");

const TOTAL_MODULES = 19;

/**
 * The score for an account with `n` entries made just now, spread two per
 * day across distinct modules and with no missions — the shape a new
 * account actually has. Deliberately the SAME model the constant's own
 * comment describes, so the two cannot drift.
 */
function scoreFor(n) {
  return computeHealthScore({
    lastActivityMs: n === 0 ? null : Date.now(),
    modulesWithActivity: Math.min(TOTAL_MODULES, n),
    totalModules: TOTAL_MODULES,
    missionStepsCompletedRecent: 0,
    activeDaysThisWeek: Math.min(CONSISTENCY_WINDOW_DAYS, Math.ceil(n / 2)),
  }).score;
}

// ---------------------------------------------------------------------
console.log("== 1. an empty account scores zero, which is why it must not be shown ==");
const empty = computeHealthScore({
  lastActivityMs: null,
  modulesWithActivity: 0,
  totalModules: TOTAL_MODULES,
  missionStepsCompletedRecent: 0,
  activeDaysThisWeek: 0,
});
check(`an account with nothing scores ${empty.score}`, empty.score === 0, String(empty.score));
check(`...and is labelled "${empty.label}"`, empty.label === "justStarting", empty.label);
// The whole point: that pair is a verdict on no evidence. Nothing below
// asserts it should be shown — it asserts it is what WOULD be shown.

console.log("\n== 2. the first entry moves the score by about a third of the scale ==");
const jump = scoreFor(1) - scoreFor(0);
console.log(`        0 entries -> ${scoreFor(0)},  1 entry -> ${scoreFor(1)}   (move: ${jump})`);
check(
  `one entry moves it ${jump} points, which is why one entry is not a measurement`,
  jump >= 25,
  `${jump} — if a single entry no longer dominates, the reason for the threshold has changed and the constant should be revisited`
);

console.log("\n== 3. from the threshold on, no single entry dominates ==");
// The property that makes the number a measurement: past the threshold,
// one more entry is a nudge rather than a verdict.
const moves = [];
for (let n = HEALTH_SCORE_MIN_ENTRIES; n < HEALTH_SCORE_MIN_ENTRIES + 6; n++) {
  moves.push({ n, move: scoreFor(n + 1) - scoreFor(n) });
}
console.log(`        ${moves.map((m) => `${m.n}->${m.n + 1}: +${m.move}`).join("  ")}`);
const worst = Math.max(...moves.map((m) => m.move));
check(
  `the largest single-entry move at or above ${HEALTH_SCORE_MIN_ENTRIES} is ${worst} points`,
  worst <= 10,
  `${worst} — a single entry still swings the score more than a tenth of the scale`
);
// AND THE THRESHOLD IS NOT HIGHER THAN IT NEEDS TO BE. Withholding the
// score for longer than the instability lasts is its own fault: the user
// asked for a number with a reason, and "later is safer" is not one.
const beforeThreshold = scoreFor(HEALTH_SCORE_MIN_ENTRIES - 1) - scoreFor(HEALTH_SCORE_MIN_ENTRIES - 2);
console.log(
  `        the move just BELOW the threshold (${HEALTH_SCORE_MIN_ENTRIES - 2}->${HEALTH_SCORE_MIN_ENTRIES - 1}): +${beforeThreshold}`
);
check(
  `${HEALTH_SCORE_MIN_ENTRIES} is not further out than the instability it avoids`,
  HEALTH_SCORE_MIN_ENTRIES <= 8,
  `${HEALTH_SCORE_MIN_ENTRIES} entries is a long time to withhold a number`
);

console.log("\n== 4. the gate function agrees with the constant ==");
check(`${HEALTH_SCORE_MIN_ENTRIES - 1} entries is not enough`, hasEnoughDataForScore(HEALTH_SCORE_MIN_ENTRIES - 1) === false);
check(`${HEALTH_SCORE_MIN_ENTRIES} entries is`, hasEnoughDataForScore(HEALTH_SCORE_MIN_ENTRIES) === true);
check("nothing is not enough", hasEnoughDataForScore(0) === false);
// A negative count is not a real state, but a function that answers
// "true" to one is a function that would answer "true" to a bad read.
check("and neither is a negative count", hasEnoughDataForScore(-1) === false);

console.log("\n== 5. the chart fills before the score does ==");
// A line needs points, not a stable average, so it clears earlier. If the
// two were equal the placeholder would be pointless; if the chart's were
// higher the card would show a score above an empty slot.
check(
  `charts at ${CHART_MIN_ENTRIES}, score at ${HEALTH_SCORE_MIN_ENTRIES}`,
  CHART_MIN_ENTRIES < HEALTH_SCORE_MIN_ENTRIES && CHART_MIN_ENTRIES >= 2,
  `${CHART_MIN_ENTRIES} vs ${HEALTH_SCORE_MIN_ENTRIES}`
);

console.log("\n== 6. the page actually asks before it shows ==");
// The rule lives in lib/health-score.ts so it can be executed; this is
// the half that checks the page calls it rather than re-deciding.
const overview = readFileSync("src/app/dashboard/overview/page.tsx", "utf8");
check(
  "overview/page.tsx calls hasEnoughDataForScore",
  /hasEnoughDataForScore\(totalEntries\)/.test(overview),
  "the page decides for itself, so the constant above governs nothing"
);
// `<SetupProgressCard` WITHOUT A BOUNDARY MATCHES `<SetupProgressCardXX`.
// Its own mutation suite renamed the component and this check stayed
// green on a page that no longer rendered it — substring matching, in the
// gate written to catch a substring problem. A JSX tag ends in
// whitespace, `/` or `>`, and requiring one of those is the difference.
check(
  "...and shows setup progress when it says no",
  /hasEnoughDataForScore\(totalEntries\)\s*\?[\s\S]{0,400}?<SetupProgressCard[\s/>]/.test(overview),
  "the false branch does not render the card that stands in for the score"
);
check(
  "...and the score only in the true branch",
  /hasEnoughDataForScore\(totalEntries\)\s*\?\s*\(\s*<HealthScoreCard[\s/>]/.test(overview),
  "the score is not behind the check"
);
// A COMPARISON WRITTEN OUT LONGHAND WOULD BYPASS ALL OF THE ABOVE — but
// `totalEntries > 0` is not one. That is a PRESENCE test (the "log your
// first entry" step is done or it is not), and the first version of this
// check called it a second threshold and went red on correct code. A
// threshold is a comparison against a number the constant governs, so
// only 2 and up can be one.
const longhandThreshold = overview.match(/totalEntries\s*[<>]=?\s*([2-9]\d*)/);
check(
  "and nothing compares the entry total to a bare threshold instead",
  longhandThreshold === null,
  longhandThreshold ? `${longhandThreshold[0]} — a literal threshold in the page is a second source of truth` : ""
);

console.log("\n== 7. the sparklines say what fills them ==");
const statCard = readFileSync("src/components/overview/home-stat-card.tsx", "utf8");
check(
  "the stat card renders a placeholder when the series is all zeroes",
  /!hasTrend && placeholderLabel/.test(statCard),
  "an empty series renders nothing, so the card changes height and says why never"
);
check(
  "...and the real line only when there is something to draw",
  /\{hasTrend && \(/.test(statCard)
);
// READ THE PLACEHOLDER'S OWN BLOCK, not a window of characters after the
// word. The first version scanned 400 characters forward from
// `placeholderLabel` and swept up the REAL line's `stroke="#f97316"`,
// then reported the placeholder as accent-coloured. Prose and proximity
// are not the thing; the block is.
const placeholderBlock =
  statCard.match(/\{!hasTrend && placeholderLabel && chartData && \([\s\S]*?\n      \)\}/)?.[0] ?? "";
check(
  `the placeholder block was found (${placeholderBlock.length} chars)`,
  placeholderBlock.length > 100,
  "an empty slice makes every assertion about it pass on nothing"
);
check(
  "the placeholder is not the accent colour, so it cannot read as a value",
  !/#f97316|orange-[45]00/.test(placeholderBlock),
  placeholderBlock.slice(0, 160)
);

console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${failures.length} failed`);
process.exit(failures.length === 0 ? 0 : 1);
