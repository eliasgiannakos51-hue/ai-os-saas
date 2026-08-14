// "0 8 31 2 *" περνάει το validation αλλά nextRuns() → []. Ο agent
// δημιουργείται, χρεώνεται, δεν τρέχει ποτέ.
//
// The report is exact. The 31st of February is inside dayOfMonth's 1-31
// range and 2 is inside month's 1-12, so parseCronExpression was perfectly
// happy, validateAgentCron passed it, the agent was created, the user was
// charged, the interface showed "day 31 of every month" — and it never ran
// once, because that date does not exist.
//
// WHAT MADE IT PERMANENT rather than merely late. next_run_at is computed
// ONCE, by nextRunAt() at creation time (api/agents/route.ts). A null there
// is written to the column and nothing ever recomputes it, so the
// dispatcher — which selects on next_run_at — can never pick the agent up.
// There is no eventual consistency to wait for.
//
// THE TWO HALVES OF THE FIX, which are opposite errors:
//
//   REJECT what cannot happen. Six day/month pairs are arithmetically
//   impossible and are now refused with a message naming the pair.
//
//   DO NOT REJECT what is merely rare. "0 8 29 2 *" is a LEGAL schedule —
//   it runs in leap years. It was also returning [], for an unrelated
//   reason: MAX_DAYS_AHEAD was 400 days, which cannot reach the next 29th
//   of February from most starting points. Refusing it would have been a
//   false rejection covering up a second bug, so the horizon was extended
//   instead.
//
// THE INVARIANT THIS FILE ENFORCES, over the whole 31x12 cross-product
// rather than over a handful of examples: validateAgentCron says ok if and
// only if the schedule can actually fire. Sampling is what let this ship.
//
// Runs in the build gate; no API key, no network, no database.
//
// Run: node scripts/tests/agent-cron.test.mjs
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
function eq(name, actual, expected) {
  check(name, actual === expected, `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

const cron = await loadTs("src/lib/agents/cron-expression.ts");
const TZ = "Europe/Athens";

// ---------------------------------------------------------------------
console.log("== 1. the reported expression ==");
const reported = cron.validateAgentCron("0 8 31 2 *");
eq("0 8 31 2 * is rejected", reported.ok, false);
check(
  "and the message names the day and the month, not 'invalid cron'",
  !reported.ok && /Day 31 of month 2/.test(reported.error),
  !reported.ok ? reported.error : ""
);
check(
  "and tells the user what to do instead",
  !reported.ok && /28 is safe in every month/.test(reported.error)
);

// ---------------------------------------------------------------------
console.log("\n== 2. every day x every month — all 372 combinations ==");
//
// Not the six known-bad ones: ALL of them. A hand-written list of the
// combinations somebody thought of is exactly what shipped this bug, and it
// would miss the seventh if the day range ever changed.
const REFERENCE_YEARS = [2026, 2027, 2028, 2029]; // includes a leap year
function dateExistsSomewhere(day, month) {
  return REFERENCE_YEARS.some((year) => new Date(Date.UTC(year, month - 1, day)).getUTCDate() === day);
}

const from = new Date("2026-08-14T00:00:00Z");
const disagreements = [];
let impossibleCount = 0;
let possibleCount = 0;
for (let month = 1; month <= 12; month++) {
  for (let day = 1; day <= 31; day++) {
    const expr = `0 8 ${day} ${month} *`;
    const verdict = cron.validateAgentCron(expr);
    const runs = cron.nextRuns(expr, from, TZ, 1);
    const real = dateExistsSomewhere(day, month);
    if (real) possibleCount++;
    else impossibleCount++;

    // THE INVARIANT: accepted if and only if it can fire.
    if (verdict.ok !== runs.length > 0) {
      disagreements.push(
        `${expr}: validate=${verdict.ok ? "ok" : "rejected"} but nextRuns=${runs.length}`
      );
    }
    // ...and the verdict has to match the CALENDAR, not just itself.
    if (verdict.ok !== real) {
      disagreements.push(`${expr}: validate=${verdict.ok ? "ok" : "rejected"} but the date ${real ? "exists" : "does not exist"}`);
    }
  }
}
console.log(`        ${possibleCount} real dates, ${impossibleCount} impossible ones, 372 checked`);
eq("372 combinations were checked", possibleCount + impossibleCount, 372);
eq("exactly 6 day/month pairs are impossible", impossibleCount, 6);
check(
  "validation agrees with the calendar AND with nextRuns, for all 372",
  disagreements.length === 0,
  disagreements.slice(0, 8).join("\n        ")
);

// ---------------------------------------------------------------------
console.log("\n== 3. the six, named ==");
for (const [day, month, label] of [
  [30, 2, "30 February"],
  [31, 2, "31 February"],
  [31, 4, "31 April"],
  [31, 6, "31 June"],
  [31, 9, "31 September"],
  [31, 11, "31 November"],
]) {
  const v = cron.validateAgentCron(`0 8 ${day} ${month} *`);
  eq(`${label} is rejected`, v.ok, false);
}

console.log("\n== 4. rare is not the same as impossible ==");
// The false rejection this fix had to avoid. 29 February happens; it just
// does not happen often.
const leap = cron.validateAgentCron("0 8 29 2 *");
eq("0 8 29 2 * is accepted", leap.ok, true);
const leapRuns = cron.nextRuns("0 8 29 2 *", from, TZ, 2);
check(`and it actually resolves (${leapRuns.length} runs found)`, leapRuns.length === 2);
check(
  "...to a real 29 February",
  leapRuns.every((d) => d.getUTCMonth() === 1 && d.getUTCDate() === 29),
  leapRuns.map((d) => d.toISOString()).join(", ")
);
// The horizon has to clear the gap from ANY starting point, not just this
// one — a run started on 1 March of a leap year is the worst case.
const worstCase = cron.nextRuns("0 8 29 2 *", new Date("2028-03-01T00:00:00Z"), TZ, 1);
check(
  "even starting the day after one, the next is found",
  worstCase.length === 1,
  "MAX_DAYS_AHEAD must clear four years"
);

console.log("\n== 5. the day-of-week escape hatch ==");
// cron ORs dayOfMonth and dayOfWeek when both are restricted, so an
// unreachable day-of-month is harmless if the day-of-week can still fire.
// Rejecting these would be a second false rejection.
const ored = cron.validateAgentCron("0 8 31 2 1");
eq("0 8 31 2 1 (Mondays in February) is accepted", ored.ok, true);
check(
  "and it really does fire",
  cron.nextRuns("0 8 31 2 1", from, TZ, 1).length === 1
);
// A day that IS reachable in at least one of the listed months is fine.
eq("0 8 31 1,2 * is accepted, because January has a 31st", cron.validateAgentCron("0 8 31 1,2 *").ok, true);

console.log("\n== 6. nothing that used to work stopped working ==");
for (const expr of ["0 9 * * *", "0 9 * * 1", "0 0 1 * *", "30 14 15 * *", "0 8 28 2 *", "0 * * * *"]) {
  const v = cron.validateAgentCron(expr);
  check(`${expr} still accepted`, v.ok, v.ok ? "" : v.error);
  check(`${expr} still resolves`, cron.nextRuns(expr, from, TZ, 1).length === 1);
}
// And the rule that was already there is untouched.
eq("*/5 is still refused as too frequent", cron.validateAgentCron("*/5 * * * *").ok, false);

console.log("\n== 7. the impossibility check itself ==");
const parsed = (e) => cron.parseCronExpression(e).fields;
eq("31 February reports one impossible pair", cron.impossibleCronDates(parsed("0 8 31 2 *")).length, 1);
eq("...and names February", cron.impossibleCronDates(parsed("0 8 31 2 *"))[0].monthKey, "february");
eq("a bare * day-of-month has nothing to report", cron.impossibleCronDates(parsed("0 9 * * *")).length, 0);
eq("a reachable day has nothing to report", cron.impossibleCronDates(parsed("0 8 31 1 *")).length, 0);

// ---------------------------------------------------------------------
console.log("\n== 8. the refusal reaches the user in their own language ==");
//
// agent-build.ts:135 handed cronCheck.error straight through, so a Greek
// user asking for an agent on the 31st of February read "minute value out
// of range" — the cron parser's own English, three layers down and about a
// field they never typed.
import { readFileSync } from "node:fs";

const rejection = cron.validateAgentCron("0 8 31 2 *");
check("the rejection carries an i18n key", rejection.key === "impossibleDate", JSON.stringify(rejection));
check(
  "and the values the message needs",
  rejection.values?.day === 31 && rejection.values?.monthKey === "february",
  JSON.stringify(rejection.values)
);
// The month travels as a KEY, not the number 2 — so ten languages can name
// it as a word rather than printing a digit into a sentence.
check("the month is a key, not a digit", typeof rejection.values?.monthKey === "string");
eq("too-frequent has its own key", cron.validateAgentCron("*/5 * * * *").key, "tooFrequent");
eq("an unparseable expression has its own key", cron.validateAgentCron("99 * * * *").key, "parse");
// English is kept for the log, and must not be what the interface shows.
check("the English string is still there for the log", typeof rejection.error === "string" && rejection.error.length > 0);

const parse = readFileSync("src/lib/agents/agent-builder-parse.ts", "utf8");
const handler = readFileSync("src/lib/jobs/handlers/agent-build.ts", "utf8");
const workspace = readFileSync("src/components/agents/agents-workspace.tsx", "utf8");
check("the draft parser carries the key through", /detailKey: cronCheck\.key/.test(parse));
check("the build handler emits it", /errorKey: result\.reason === "invalid_schedule"/.test(handler));
check("the client prefers the key over the English string", /buildErrorMessage\(result, t\)/.test(workspace));
check(
  "...and resolves the month key to a real word",
  /monthName = t\(`monthNames\.\$\{values\.monthKey\}`\)/.test(workspace)
);

// BOTH doors, not just the one that was reported. An agent's schedule can
// also be changed after it exists, and that path leaked the same English.
const editRoute = readFileSync("src/app/api/agents/[id]/route.ts", "utf8");
check(
  "the edit route validates the schedule",
  /const check = validateAgentCron\(candidate\)/.test(editRoute)
);
check(
  "...and returns the key, not only the English string",
  /errorKey: check\.key, errorValues: check\.values/.test(editRoute)
);
check(
  "...and the client renders it",
  /buildErrorMessage\(data as BuildResponse, t, "saveError"\)/.test(workspace)
);
// The last line of defence: even a schedule that somehow passed validation
// must not produce an agent with a null next_run_at, because nothing ever
// recomputes that column.
const createRoute = readFileSync("src/app/api/agents/route.ts", "utf8");
check(
  "creation refuses a schedule that resolves to nothing",
  /const next = nextRunAt\(agent\.scheduleCron[\s\S]{0,200}if \(!next\)/.test(createRoute)
);
check(
  "and so does activation on edit",
  /const next = nextRunAt\(scheduleCron[\s\S]{0,200}if \(!next\)/.test(editRoute)
);

const LOCALES = ["en", "el", "es", "fr", "de", "it", "pt", "zh", "ja", "ar"];
const CRON_KEYS = ["impossibleDate", "tooFrequent", "parse", "malformed"];
const MONTH_KEYS = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
];
for (const locale of LOCALES) {
  const agents = JSON.parse(readFileSync(`messages/${locale}.json`, "utf8"))?.dashboard?.agents ?? {};
  const missingErrors = CRON_KEYS.filter((k) => typeof agents.cronError?.[k] !== "string");
  const missingMonths = MONTH_KEYS.filter((k) => typeof agents.monthNames?.[k] !== "string");
  check(`${locale}: all four refusal messages exist`, missingErrors.length === 0, missingErrors.join(", "));
  check(`${locale}: all twelve month names exist`, missingMonths.length === 0, missingMonths.join(", "));
}
// The message has to be actionable, not merely translated: it must say what
// to do instead. "28" is the answer that works in every month.
for (const locale of LOCALES) {
  const msg = JSON.parse(readFileSync(`messages/${locale}.json`, "utf8")).dashboard.agents.cronError.impossibleDate;
  check(`${locale}: the message says what to use instead`, msg.includes("28"), msg);
  check(`${locale}: and interpolates the month by name`, msg.includes("{monthName}"), msg);
}

console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${failures.length} failed`);
if (failures.length) {
  console.log("FAILED:\n" + failures.map((f) => "  - " + f).join("\n"));
}
process.exit(failures.length === 0 ? 0 : 1);
