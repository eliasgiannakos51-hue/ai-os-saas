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
const getSrc = readFileSync("src/app/api/research/[id]/route.ts", "utf8");
const uiSrc = readFileSync("src/components/research/research-workspace.tsx", "utf8");
const researchSrc = readFileSync("src/lib/research/research.ts", "utf8");
const migration = readFileSync("supabase/migrations/20260809_research_progress.sql", "utf8");

// ---------------------------------------------------------------------
console.log("== 1. the budget can actually hold the work it schedules ==");
const maxDuration = Number(runSrc.match(/export const maxDuration = (\d+)/)?.[1]);
check(`maxDuration is no longer 300 (${maxDuration})`, maxDuration > 300);
// Six questions at a realistic 90s each is 540s before synthesis. A budget
// that cannot hold its own worst case is the bug, not a tuning choice.
const worstCaseResearchMs = limits.RESEARCH_MAX_QUESTIONS * 90_000;
check(
  `the budget covers ${limits.RESEARCH_MAX_QUESTIONS} questions at 90s plus synthesis`,
  maxDuration * 1000 >= worstCaseResearchMs + limits.RESEARCH_SYNTHESIS_RESERVE_MS,
  `budget ${maxDuration * 1000}ms vs needed ${worstCaseResearchMs + limits.RESEARCH_SYNTHESIS_RESERVE_MS}ms`
);
check(
  "the route's own deadline fires before the platform's",
  limits.RESEARCH_DEADLINE_MS < maxDuration * 1000
);
check(
  "and leaves room to synthesise after it fires",
  limits.RESEARCH_DEADLINE_MS + limits.RESEARCH_SYNTHESIS_RESERVE_MS <= maxDuration * 1000
);

console.log("\n== 2. it stops itself instead of being killed mid-report ==");
check("the loop checks the wall clock before each question", /RESEARCH_DEADLINE_MS - RESEARCH_SYNTHESIS_RESERVE_MS/.test(runSrc));
check(
  "unanswered questions are still carried into the synthesis",
  /for \(const remaining of questions\.slice\(index\)\)/.test(runSrc)
);
check(
  "so they are reported rather than silently dropped",
  /could not be established/.test(researchSrc)
);
check("stopping early is recorded on the cost-log row", /stoppedEarly/.test(runSrc));

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
check("the staleness ceiling is above maxDuration", limits.RESEARCH_STALE_MS > maxDuration * 1000);
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
check("the worker writes progress after each question", /await writeProgress\(index \+ 1/.test(runSrc));
check("and before the first one", /await writeProgress\(0,/.test(runSrc));
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
