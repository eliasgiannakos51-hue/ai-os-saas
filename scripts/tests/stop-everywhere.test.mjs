// A STOP BUTTON ON EVERY SURFACE THAT SPENDS, AND EACH ONE CHARGES ONLY
// FOR WHAT RAN.
//
// V4.6: "and in ALL of them: chat · research · agents · websites · code."
// Chat has its own gate (chat-stop.test.mjs). This is the other four,
// plus the two things they share: the column a worker reads, and the
// rule that a stop settles for the work already done and releases the
// rest.
//
// Two surfaces stop inside the request (code: the abort signal is passed
// to the provider call) and three stop through the database (websites,
// background jobs, research: cancel_requested_at, polled or read at each
// boundary). Each is read for the four things that make it true:
//
//   1. a way to ask (a route, or the request's signal);
//   2. a boundary where the worker looks;
//   3. what happens to the money at that boundary;
//   4. a button a person can press, in ten languages.
//
// Run: node scripts/tests/stop-everywhere.test.mjs
import { readFileSync, existsSync } from "node:fs";
import { stripComments } from "../check-mutation-markers.mjs";

let pass = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { failures.push(name); console.log(`  FAIL  ${name}${detail ? "\n        " + detail : ""}`); }
}
const read = (p) => stripComments(readFileSync(p, "utf8"));

const MIGRATION = "supabase/migrations/20260924000000_stop_requests.sql";
const LIB = "src/lib/stop-requests.ts";
const JOB_CANCEL = "src/app/api/jobs/[id]/cancel/route.ts";
const SITE_CANCEL = "src/app/api/websites/[id]/cancel/route.ts";
const RESEARCH_CANCEL = "src/app/api/research/[id]/cancel/route.ts";
const RUN_JOB = "src/lib/jobs/run-job.ts";
const BUILDER = "src/lib/website-builder.ts";
const PROCESS = "src/app/api/websites/generate/process/route.ts";
const RESEARCH = "src/lib/research/run-research.ts";
const RUNNER = "src/lib/agents/agent-runner.ts";
const EXECUTE = "src/lib/agents/execute-agent.ts";
const AGENT_HANDLER = "src/lib/jobs/handlers/agent-run.ts";
const COMPLETE = "src/lib/ai/providers/complete.ts";
const CODING_ROUTE = "src/app/api/coding/run/route.ts";
const PROGRESS = "src/components/ui/ai-job-progress.tsx";
const SITE_UI = "src/components/website-builder/website-builder-workspace.tsx";
const RESEARCH_UI = "src/components/research/research-workspace.tsx";
const CODING_UI = "src/components/coding/coding-workspace.tsx";

console.log("== 1. the column, and the two halves that read and write it ==");
{
  const sql = readFileSync(MIGRATION, "utf8");
  for (const table of ["ai_jobs", "user_websites", "research_reports"]) {
    check(`${table} gains cancel_requested_at, idempotently`,
      new RegExp(`alter table public\\.${table}\\s+add column if not exists cancel_requested_at timestamptz`).test(sql));
  }
  const lib = read(LIB);
  check("the reader answers 'no' on a failed read, never 'stop'",
    /if \(error\) \{\s*logApiError\("stop-requests:read", error, \{ table, id \}\);\s*return false;\s*\}/.test(lib));
  check("the writer sets the timestamp only where it is null (idempotent)", /\.is\("cancel_requested_at", null\)/.test(lib));
  check("one STOPPED_MESSAGE, shared — defined client-safe and re-exported by the server module",
    /export const STOPPED_MESSAGE = "Stopped by you/.test(read("src/lib/stop-message.ts")) &&
    /import \{ STOPPED_MESSAGE \} from "@\/lib\/stop-message";\s*export \{ STOPPED_MESSAGE \};/.test(lib) &&
    !/import "server-only"/.test(read("src/lib/stop-message.ts")));
  check("the browser recognises the sentence and shows its own locale's word instead",
    /isStoppedMessage\(report\.error\) \? tSteps\("stopped"\)/.test(read(RESEARCH_UI)) &&
    /kind === "stopped"/.test(read(SITE_UI)));
}

console.log("\n== 2. a way to ask, for each of the three workers ==");
for (const [label, file, table, finished] of [
  ["jobs", JOB_CANCEL, "ai_jobs", '"done" || job.status === "failed"'],
  ["websites", SITE_CANCEL, "user_websites", '"pending" && site.status !== "processing"'],
  ["research", RESEARCH_CANCEL, "research_reports", '"ready" || report.status === "failed"'],
]) {
  check(`${label}: the cancel route exists`, existsSync(file));
  const src = existsSync(file) ? read(file) : "";
  check(`${label}: ownership is decided by a USER-scoped read`, /createClient\(\)/.test(src) && new RegExp(`from\\("${table}"\\)[\\s\\S]*?\\.select\\(`).test(src));
  check(`${label}: ...and the write goes through markStopRequested as the service`, new RegExp(`markStopRequested\\(createAdminClient\\(\\), "${table}"`).test(src));
  check(`${label}: a finished row is left alone`, src.includes(finished));
  check(`${label}: a row RLS does not return is a 404, not a 403`, /status: 404/.test(src) && !/status: 403/.test(src));
}

console.log("\n== 3. the boundaries, and the money at each ==");
{
  const job = read(RUN_JOB);
  check("jobs: progress() reads the flag", /isStopRequested\(admin, "ai_jobs", jobId\)/.test(job));
  check("jobs: ...only below the last step, so a finished result is never thrown away", /step < stepCount\(kind\) && \(await isStopRequested/.test(job));
  check("jobs: a stop settles for the calls that ran", /instanceof StoppedByUserError[\s\S]*?feature: `\$\{kind\}_stopped`/.test(job));
  check("jobs: ...and releases the hold when nothing ran", /else if \(job\.reservation_id\) \{\s*await releaseReservation\(job\.user_id, job\.reservation_id\);/.test(job));
  check("jobs: the row says stopped, in the column the UI shows", /error: STOPPED_MESSAGE,/.test(job));
  check("jobs: a stop is not a retry", job.indexOf("instanceof StoppedByUserError") < job.indexOf("if (canRetry(attempts))"));
  check("jobs: handlers get shouldStop for their own loops", /shouldStop: \(\) => isStopRequested\(admin, "ai_jobs", jobId\)/.test(job));

  const builder = read(BUILDER);
  check("websites: the stream is aborted when shouldStop says so", /if \(!stoppedByOwner && shouldStop\(\)\) \{\s*stoppedByOwner = true;\s*stream\.abort\(\);/.test(builder));
  check("websites: the partial usage is recorded BEFORE the stop is thrown",
    builder.indexOf("partialUsage(snapshot, outputTokens), stream.currentMessage?.model || MODEL)") < builder.indexOf("throw new GenerationStoppedError("));
  check("websites: the output side is counted from the text that arrived", /countTokens\(\{[\s\S]*?content: arrived \|\| "\."/.test(builder));
  check("websites: ...with the script-aware estimate as the fallback", /estimateOutputTokensFromText\(arrived\)/.test(builder));
  check("websites: an abort that was not a stop (or the page cap) is still an error", /if \(!stoppedByOwner && !capReached\) throw err;/.test(builder));
  const proc = read(PROCESS);
  check("websites: the worker polls the flag every two seconds", /setInterval\(\(\) => \{[\s\S]*?isStopRequested\(supabase, "user_websites", websiteId\)[\s\S]*?\}, 2000\)/.test(proc));
  check("websites: ...and hands shouldStop to the generator", /variation,\s*shouldStop,\s*\(cap, started\) => notes\.push/.test(proc));
  check("websites: a stop SETTLES (not releases) for the tokens produced", /instanceof GenerationStoppedError\) \{[\s\S]*?await settleReservation\(\{[\s\S]*?stopped: true,/.test(proc));
  check("websites: ...before the generic failure path releases everything",
    proc.indexOf("instanceof GenerationStoppedError") < proc.indexOf('logApiError("/api/websites/generate/process", err, { stage: "anthropic_call" })'));
  check("websites: the row says what was charged", /Stopped by you\. \$\{settlement\.creditsCharged\} credits were charged/.test(proc));

  const research = read(RESEARCH);
  check("research: the flag is read before each question", /while \(answered < questions\.length\) \{\s*if \(await isStopRequested\(admin, "research_reports", reportId\)\)/.test(research));
  check("research: a stop settles for the questions answered", /outcome: "stopped", questionsDone: answered/.test(research));
  check("research: ...keeps the partial findings and says stopped", /error: STOPPED_MESSAGE,\s*partial_findings: findings,/.test(research));

  const runner = read(RUNNER);
  check("agents: the runner asks before each research pass", /for \(let round = 0; round < spec\.researchRounds; round \+= 1\) \{\s*if \(params\.shouldStop && \(await params\.shouldStop\(\)\)\)/.test(runner));
  check("agents: ...and before the write", /if \(params\.shouldStop && \(await params\.shouldStop\(\)\)\) \{[\s\S]*?\}\s*const budget = resolveAgentBudget\(\);/.test(runner));
  check("agents: a stop is its own failure kind", /\| \{ kind: "stopped"; message: string \}/.test(runner));
  const execute = read(EXECUTE);
  check("agents: the executor passes shouldStop into every attempt", (execute.match(/shouldStop: params\.shouldStop/g) ?? []).length === 2);
  check("agents: a stopped run is not retried", /outcome\.failure\.kind === "api_error" \|\| outcome\.failure\.kind === "no_output"/.test(execute) && !/failure\.kind === "stopped" \|\|/.test(execute));
  check("agents: ...and reports 'stopped', not 'run_failed'", /outcome\.failure\.kind === "stopped" \? "stopped" : "run_failed"/.test(execute));
  check("agents: the job handler wires ctx.shouldStop through", /shouldStop: ctx\.shouldStop,/.test(read(AGENT_HANDLER)));

  const complete = read(COMPLETE);
  check("code: the caller's signal aborts the attempt in flight", /options\.signal\?\.addEventListener\("abort", onCallerAbort\)/.test(complete));
  check("code: ...and is removed afterwards", /options\.signal\?\.removeEventListener\("abort", onCallerAbort\)/.test(complete));
  check("code: a stop is never failed over to the next provider",
    /catch \(err\) \{\s*if \(options\.signal\?\.aborted\) \{[\s\S]{0,900}?return \{ ok: false, kind: "aborted", detail: "stopped by the caller", attempts \};/.test(complete));
  const coding = read(CODING_ROUTE);
  check("code: the route passes the request's signal", /signal: request\.signal/.test(coding));
  check("code: a stop releases the hold — nothing delivered, nothing charged", /outcome\.kind === "aborted"\) \{[\s\S]*?releaseReservation\(user\.id, reservationId\)/.test(coding));
  check("code: ...and writes no 'failed' row for it", !/outcome\.kind === "aborted"\) \{[\s\S]*?code_sessions/.test(coding.slice(coding.indexOf('outcome.kind === "aborted"'), coding.indexOf("if (!outcome.ok) {"))));
}

console.log("\n== 4. a button, on each surface ==");
{
  check("jobs: the shared progress line carries Stop", /data-testid="ai-job-stop"/.test(read(PROGRESS)) && /\/api\/jobs\/\$\{id\}\/cancel/.test(read(PROGRESS)));
  check("jobs: ...rendered whenever the job is running, not behind another condition", /\{stoppable && \(\s*<button/.test(read(PROGRESS)));
  check("websites: the generating panel carries Stop", /data-testid="website-stop"/.test(read(SITE_UI)) && /\/api\/websites\/\$\{previewWebsite\.id\}\/cancel/.test(read(SITE_UI)));
  check("research: the running report carries Stop", /data-testid="research-stop"/.test(read(RESEARCH_UI)) && /\/api\/research\/\$\{report\.id\}\/cancel/.test(read(RESEARCH_UI)));
  const codingUi = read(CODING_UI);
  check("code: the run button gets a Stop beside it", /data-testid="coding-stop"/.test(codingUi));
  check("code: ...that aborts the fetch", /abortRef\.current\?\.abort\(\)/.test(codingUi) && /signal: controller\.signal/.test(codingUi));
  const LOCALES = ["en", "el", "es", "fr", "de", "it", "pt", "zh", "ja", "ar"];
  for (const l of LOCALES) {
    const steps = JSON.parse(readFileSync(`messages/${l}.json`, "utf8")).aiSteps ?? {};
    check(`${l}: aiSteps.stop / stopping / stopped exist`, ["stop", "stopping", "stopped"].every((k) => typeof steps[k] === "string" && steps[k].length > 0));
  }
}

console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${failures.length} failed`);
process.exit(failures.length === 0 ? 0 : 1);
