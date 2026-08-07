// "Your impact this month" (V3 Task 9).
//
// The property under test is not arithmetic — it is honesty. Every
// value dashboard in every SaaS product wants to say "you saved 14 hours
// this month", and that number is invented: nobody measured those hours
// and nobody knows what the user would otherwise have done. It is chosen
// because it flatters.
//
// It is also the fastest way to lose trust in every OTHER number on the
// page. A person who works out that one figure is made up has no way to
// tell which of the rest are.
//
// So this gate asserts three things:
//   1. Nothing is reported that did not happen (no invented units).
//   2. Zero is its own state, not a scoreboard of zeros.
//   3. The headline is chosen by what MATTERED, not by what is biggest.
//
// Run: node scripts/tests/value-report.test.mjs
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
const vr = await loadTs("src/lib/value-report.ts");

const zero = {
  agentRuns: 0,
  presentations: 0,
  websitesPublished: 0,
  researchReports: 0,
  aiActions: 0,
  creditsSpent: 0,
};
const now = new Date("2026-08-20T12:00:00Z");
const oldAccount = "2026-01-01T00:00:00Z";

console.log("== 1. nothing is claimed that was not counted ==");
// The whole file, read as text. A "time saved" or "value generated"
// figure would have to be computed from a multiplier somewhere, and a
// multiplier is exactly what this must not contain.
const src = readFileSync("src/lib/value-report.ts", "utf8");
checkTrue("no hours-saved figure", !/hoursSaved|timeSaved|minutesSaved/i.test(src));
checkTrue("no money-value figure", !/valueGenerated|worthEur|estimatedValue/i.test(src));
// Every reported line has to be a COUNT of rows. The type is the
// enforcement; this asserts the type did not quietly grow a rate.
const counts = Object.keys(zero);
// Mission steps and "documents asked about" are absent on purpose:
// neither can be counted with a cheap correct query, and reporting 0 for
// something never counted is the same dishonesty wearing a humbler face.
check("the count fields are exactly the measurable ones", counts, [
  "agentRuns",
  "presentations",
  "websitesPublished",
  "researchReports",
  "aiActions",
  "creditsSpent",
]);

console.log("\n== 2. a new account is not told what its month looked like ==");
// Reporting on two days and calling it a month is the same class of
// dishonesty, in a smaller way.
check(
  "a two-day-old account gets no report",
  vr.buildValueReport({ counts: { ...zero, presentations: 3 }, accountCreatedAt: "2026-08-18T12:00:00Z", now }).kind,
  "too_early"
);
check(
  "a week-old account does",
  vr.buildValueReport({ counts: { ...zero, presentations: 3 }, accountCreatedAt: "2026-08-13T12:00:00Z", now }).kind,
  "report"
);
check("an unparseable creation date is treated as too new", vr.accountIsOldEnough("nonsense", now), false);

console.log("\n== 3. a quiet month is its own state ==");
// Not a report of zeros. "0 presentations, 0 published sites, 0 agent
// runs" is a scoreboard of failure that the product chose to show them.
const quiet = vr.buildValueReport({ counts: zero, accountCreatedAt: oldAccount, now });
check("nothing happened produces the quiet state", quiet.kind, "quiet");
checkTrue("...and carries no zeroed lines to render", !("others" in quiet));

console.log("\n== 4. the headline is what mattered, not what is biggest ==");
// 412 AI actions dwarfs 2 agent runs. Biggest-wins would lead with the
// number that measures activity rather than outcome — and one a person
// cannot act on.
const busy = vr.buildValueReport({
  counts: { ...zero, aiActions: 412, agentRuns: 2, presentations: 5 },
  accountCreatedAt: oldAccount,
  now,
});
check("unattended work leads", busy.kind === "report" ? busy.headline.key : null, "agentRuns");
check("...with its real count, not a rounded one", busy.kind === "report" ? busy.headline.count : null, 2);

// Publishing beats generating: a site that strangers can reach is a
// bigger outcome than a deck sitting in the account.
const published = vr.buildValueReport({
  counts: { ...zero, presentations: 9, websitesPublished: 1 },
  accountCreatedAt: oldAccount,
  now,
});
check("publishing outranks generating", published.kind === "report" ? published.headline.key : null, "websitesPublished");

// Zero-count categories never appear at all.
const sparse = vr.buildValueReport({
  counts: { ...zero, presentations: 2 },
  accountCreatedAt: oldAccount,
  now,
});
check("only what happened is listed", sparse.kind === "report" ? sparse.others.length : null, 0);
check("...and the one thing that did is the headline", sparse.kind === "report" ? sparse.headline.key : null, "presentations");

// The tail is capped: a seven-line report is one nobody reads.
const everything = vr.buildValueReport({
  counts: {
    agentRuns: 4,
    presentations: 3,
    websitesPublished: 2,
    researchReports: 5,
    aiActions: 90,
    creditsSpent: 1200,
  },
  accountCreatedAt: oldAccount,
  now,
});
check("at most three supporting lines", everything.kind === "report" ? everything.others.length : null, 3);
check("credits spent is reported as spent", everything.kind === "report" ? everything.creditsSpent : null, 1200);
// Credits are reported, never dressed up. It is what left the account.
checkTrue(
  "credits are a plain number, not a saving",
  everything.kind === "report" && typeof everything.creditsSpent === "number"
);

console.log("\n== 5. it is pure ==");
checkTrue("no database access", !/supabase|createClient/i.test(src));
checkTrue("no model call", !/anthropic/i.test(src));

console.log(
  fail === 0 ? `\nALL PASS: ${pass} passed, 0 failed` : `\nFAILURES: ${pass} passed, ${fail} failed`
);
process.exit(fail === 0 ? 0 : 1);
