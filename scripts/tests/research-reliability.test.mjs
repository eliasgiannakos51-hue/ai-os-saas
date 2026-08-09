// Deep Research — the run that took thirty minutes and returned nothing.
//
// WHAT THE USER REPORTED. A report ran for 30+ minutes with no result, and
// separately: "Deep Research was running, I changed something on the page,
// and the research STOPPED. Lost 30 minutes and credits."
//
// NEITHER OF THOSE IS WHAT HAPPENED, and the difference is the fix.
//
// 1. THE FUNCTION WAS BEING KILLED. api/research/[id]/run declared
//    maxDuration = 300 and then ran up to six sequential search-enabled
//    calls plus a synthesis. One search-enabled call takes 60-90s, so six
//    never fitted in five minutes. The platform killed the function around
//    question four. A kill is not an exception: no catch block runs, no
//    status is written, no settlement happens. The row sat at
//    'researching' forever.
//
// 2. THE RESEARCH NEVER STOPPED WHEN THE PAGE CHANGED — the only thing
//    WATCHING it stopped. The client polled `running`, a piece of React
//    state set by pressing Start. Navigating away or reloading cleared it,
//    so the page came back with a card frozen mid-status and nothing
//    polling. Indistinguishable, from outside, from the work dying.
//
// 3. AND A SPINNER CANNOT BE TOLD FROM A HANG. With no progress, a healthy
//    six-minute run and a dead one look the same.
//
// Run: node scripts/tests/research-reliability.test.mjs
import { readFileSync } from "node:fs";

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

const { loadTs } = await import("./load-ts.mjs");
const limits = await loadTs("src/lib/research/research-limits.ts");

const runSrc = readFileSync("src/app/api/research/[id]/run/route.ts", "utf8");
// The WORK moved out of the route into a chunked worker when the app had
// to survive a 60-second function ceiling. These assertions follow it —
// the guarantees are identical, the file they live in is not.
const workerSrc = readFileSync("src/lib/research/run-research.ts", "utf8");
const continueSrc = readFileSync("src/app/api/research/[id]/continue/route.ts", "utf8");
const fl = await loadTs("src/lib/function-limits.ts");
const getSrc = readFileSync("src/app/api/research/[id]/route.ts", "utf8");
const uiSrc = readFileSync("src/components/research/research-workspace.tsx", "utf8");
const researchSrc = readFileSync("src/lib/research/research.ts", "utf8");
const migration = readFileSync("supabase/migrations/20260809_research_progress.sql", "utf8");

// ---------------------------------------------------------------------
console.log("== 1. the work fits ANY budget, instead of needing a big one ==");
// The original assertion here was "maxDuration is big enough to hold six
// 90-second questions". That was the right demand of a design that ran the
// whole report in one invocation — and it is unsatisfiable on a platform
// whose ceiling is 60 seconds, which is the situation this now has to
// survive. The guarantee is therefore stronger, not weaker: the work is
// split so that it completes at ANY ceiling.
check("the route no longer declares a bare number", !/export const maxDuration = \d+;/.test(runSrc));
check("it declares through routeMaxDuration", /export const maxDuration = routeMaxDuration\(/.test(runSrc));
check("so a 60s platform declares 60", fl.routeMaxDuration(800) <= fl.MAX_FUNCTION_DURATION_SECONDS);

// The real question: at the SMALLEST supported ceiling, does a full report
// still complete? Computed, not asserted by hand.
const HOBBY_BUDGET_MS = 60 * 1000 - Math.max(8000, 60 * 1000 * 0.2);
const questionsPerChunk = Math.max(1, Math.floor(HOBBY_BUDGET_MS / limits.RESEARCH_QUESTION_BUDGET_MS));
const chunksNeeded = Math.ceil(limits.RESEARCH_MAX_QUESTIONS / questionsPerChunk) + 1; // +1 for synthesis
check(
  `a ${limits.RESEARCH_MAX_QUESTIONS}-question report needs ${chunksNeeded} chunks at 60s, within the ceiling of ${limits.MAX_RESEARCH_CHUNKS}`,
  chunksNeeded <= limits.MAX_RESEARCH_CHUNKS
);
check("at least one question fits in a 60s chunk", questionsPerChunk >= 1);
check(
  "and on a generous plan it is still one invocation",
  Math.floor(Math.min(limits.RESEARCH_DEADLINE_MS, 640_000) / limits.RESEARCH_QUESTION_BUDGET_MS) >=
    limits.RESEARCH_MAX_QUESTIONS
);

console.log("\n== 2. it stops itself instead of being killed mid-report ==");
check("the worker checks the budget before each question", /if \(!questionFits\(Date\.now\(\) - startedAt, budgetMs\)\)/.test(workerSrc));
check("the budget is the SMALLER of the two ceilings", /Math\.min\(functionBudgetMs\(\), RESEARCH_DEADLINE_MS\)/.test(workerSrc));
check("synthesis is only started if it fits", /hasBudgetFor\(Date\.now\(\) - startedAt, RESEARCH_SYNTHESIS_RESERVE_MS, budgetMs\)/.test(workerSrc));
check(
  "unanswered questions are still carried into the synthesis at the ceiling",
  /for \(const remaining of questions\.slice\(answered\)\)/.test(workerSrc)
);
check(
  "so they are reported rather than silently dropped",
  /could not be established/.test(researchSrc)
);
check("hitting the ceiling is recorded on the cost-log row", /hitChunkCeiling/.test(workerSrc));
check("as is how many chunks it took", /chunks: chunkNumber/.test(workerSrc));

console.log("\n== 2b. the chunk loop is BOUNDED ==");
// A chunk that hands off to a chunk that hands off is a loop that spends
// money each pass. Without a ceiling, a handoff that keeps failing would
// leave the user with nothing after paying for the questions that ran.
check("there is a maximum number of chunks", typeof limits.MAX_RESEARCH_CHUNKS === "number");
check("it is above what a real Hobby run needs", limits.MAX_RESEARCH_CHUNKS > limits.RESEARCH_MAX_QUESTIONS);
check("the worker enforces it", /atChunkCeiling/.test(workerSrc));
check(
  "and degrades to a partial report rather than to nothing",
  /chunk ceiling reached, synthesising what exists/.test(workerSrc)
);

console.log("\n== 3. one hung call cannot eat the whole run ==");
check("questions carry a request timeout", /RESEARCH_QUESTION_TIMEOUT_MS/.test(researchSrc));
check("synthesis carries one too", /RESEARCH_SYNTHESIS_TIMEOUT_MS/.test(researchSrc));
check(
  "and a question timeout is smaller than the whole deadline",
  limits.RESEARCH_QUESTION_TIMEOUT_MS < limits.RESEARCH_DEADLINE_MS
);

console.log("\n== 4. a dead worker is reaped, so the UI can never spin forever ==");
const now = new Date("2026-08-09T12:00:00Z");
const justStarted = new Date(now.getTime() - 60_000).toISOString();
const longAgo = new Date(now.getTime() - limits.RESEARCH_STALE_MS - 60_000).toISOString();
check(
  "a running job past the ceiling is stale",
  limits.isResearchJobStale("researching", longAgo, longAgo, now)
);
check(
  "a job that just started is not",
  !limits.isResearchJobStale("researching", justStarted, justStarted, now)
);
check(
  "synthesising counts as running",
  limits.isResearchJobStale("synthesising", longAgo, longAgo, now)
);
check(
  "planning counts as running",
  limits.isResearchJobStale("planning", longAgo, longAgo, now)
);
check(
  "a READY report is never reaped, however old",
  !limits.isResearchJobStale("ready", longAgo, longAgo, now)
);
check(
  "nor a failed one",
  !limits.isResearchJobStale("failed", longAgo, longAgo, now)
);
check(
  "nor a pending one that was never claimed",
  !limits.isResearchJobStale("pending", null, longAgo, now)
);
check(
  "a claimed row with no processing_started_at falls back to created_at",
  limits.isResearchJobStale("researching", null, longAgo, now)
);
check(
  "an unparseable timestamp is not treated as stale",
  !limits.isResearchJobStale("researching", "not-a-date", "not-a-date", now)
);
check(
  "the staleness ceiling is above one chunk's whole budget",
  limits.RESEARCH_STALE_MS > fl.MAX_FUNCTION_DURATION_SECONDS * 1000
);
check("the poll endpoint actually applies it", /isResearchJobStale/.test(getSrc));
check(
  "and the force-fail is conditioned on the status it read",
  /\.eq\("status", data\.status\)/.test(getSrc)
);
check("the reaped row says no credits were charged", /No credits were charged/.test(getSrc));

console.log("\n== 5. polling survives navigation — the 'it stopped' report ==");
check(
  "what is running is derived from the rows, not from a click",
  /const activeIds = reports\.filter\(isRunning\)/.test(uiSrc)
);
check("in-flight reports are picked up on mount", /if \(isRunning\(report\)\) void refresh\(report\.id\)/.test(uiSrc));
check(
  "the run request is fired with keepalive so closing the tab does not abort it",
  /keepalive: true/.test(uiSrc)
);
check(
  "and the user is told the work survives the page",
  /keepsRunning/.test(uiSrc)
);

console.log("\n== 6. progress is real, not a spinner ==");
check("the worker persists progress after each question", /findings\.push\(result\.finding\);[\s\S]{0,400}await persist\(\);/.test(workerSrc));
check("progress carries the current question", /current_question: questions\[answered\]\?\.question/.test(workerSrc));
check("the UI renders which question it is on", /progressStep/.test(uiSrc));
check("and the question text", /report\.current_question/.test(uiSrc));
check("with an accessible progress bar", /role="progressbar"/.test(uiSrc));

console.log("\n== 7. new columns cannot break an un-migrated deployment ==");
// The failure this guards: a column list in a PostgREST select fails the
// WHOLE query when one column does not exist. Every poll would 500.
check("the poll endpoint selects *", /\.from\("research_reports"\)\s*\n\s*\.select\("\*"\)/.test(getSrc));
check("no column list remains in the poll endpoint", !/select\(\s*\n?\s*"id, topic, language, status/.test(getSrc));
check("the migration is idempotent", (migration.match(/add column if not exists/g) ?? []).length >= 3);
check("questions_done is added", /add column if not exists questions_done/.test(migration));
check("questions_total is added", /add column if not exists questions_total/.test(migration));
check("current_question is added", /add column if not exists current_question/.test(migration));
check("the index is idempotent too", /create index if not exists research_reports_processing_idx/.test(migration));
check("the UI treats the progress fields as optional", /questions_done\?: number \| null/.test(uiSrc));

console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${failures.length} failed`);
process.exit(failures.length === 0 ? 0 : 1);
