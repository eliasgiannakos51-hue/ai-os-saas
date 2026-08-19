// Long AI actions that survive the page being closed.
//
// Deep Research already worked this way (lib/research/run-research.ts) and
// the brief was to give the same treatment to the rest. What that treatment
// actually buys, stated as the failures it removes:
//
//   1. CLOSING THE TAB ABORTS THE WORK. The fetch dies with the page. The
//      work may finish server-side, but nothing tells the user and the
//      result is written nowhere they can find it.
//   2. A PLATFORM KILL RUNS NO CATCH BLOCK. No status, no settlement, and
//      the credit hold sits reserved against work never delivered. This is
//      not theoretical: api/agents/build declared maxDuration = 60 while
//      making two sequential model calls.
//   3. A SPINNER CANNOT BE TOLD FROM A HANG. Ninety seconds of nothing
//      looks identical to a dead worker.
//
// This checks the rules, the wiring, and the two invariants that are about
// money rather than about user experience: a finished job either settles or
// refunds, never neither; and one job can never be run twice.
//
// Run: node scripts/tests/background-jobs.test.mjs
import { readFileSync, readdirSync } from "node:fs";

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

const { loadTs } = await import("./load-ts.mjs");
const jt = await loadTs("src/lib/jobs/job-types.ts");

const runJobSrc = readFileSync("src/lib/jobs/run-job.ts", "utf8");
const startJobSrc = readFileSync("src/lib/jobs/start-job.ts", "utf8");
const pollSrc = readFileSync("src/app/api/jobs/[id]/route.ts", "utf8");
const continueSrc = readFileSync("src/app/api/jobs/[id]/continue/route.ts", "utf8");
const listSrc = readFileSync("src/app/api/jobs/route.ts", "utf8");
const hookSrc = readFileSync("src/lib/jobs/use-ai-job.ts", "utf8");
const migration = readFileSync("supabase/migrations/20260812_background_jobs.sql", "utf8");

// ---------------------------------------------------------------------
console.log("== 1. the kinds, and which are actually converted ==");
check("the five kinds from the brief are declared", jt.JOB_KINDS.length === 5);
for (const kind of ["agent_build", "agent_run", "mission_plan", "create", "file_ask"]) {
  check(`${kind} is a known kind`, jt.isJobKind(kind));
}
check("an unknown kind is refused", !jt.isJobKind("definitely_not_a_kind"));
check("a non-string is refused", !jt.isJobKind(null) && !jt.isJobKind(7));

// HONEST ACCOUNTING. A kind with no handler must fail its job with a clear
// message rather than sit queued forever, and this test names exactly how
// many are wired so the number cannot drift silently.
const handlersDir = readdirSync("src/lib/jobs/handlers").filter((f) => f.endsWith(".ts") && f !== "index.ts");
const registry = readFileSync("src/lib/jobs/handlers/index.ts", "utf8");
const wired = jt.JOB_KINDS.filter((k) => new RegExp(`^\\s*${k}:`, "m").test(registry));
console.log(`        wired: ${wired.join(", ") || "(none)"}`);
console.log(`        not yet wired: ${jt.JOB_KINDS.filter((k) => !wired.includes(k)).join(", ") || "(none)"}`);
check(`handler files match wired kinds (${handlersDir.length} files, ${wired.length} wired)`, handlersDir.length === wired.length);
check("agent_build — the one the brief called most urgent — is wired", wired.includes("agent_build"));
check(
  "an unwired kind fails its job instead of hanging",
  /no_handler/.test(runJobSrc) && /This kind of job is no longer supported/.test(runJobSrc)
);

console.log("\n== 2. retry is bounded ==");
eq("at most two attempts", jt.MAX_JOB_ATTEMPTS, 2);
check("a first attempt may retry", jt.canRetry(1));
check("a second may not", !jt.canRetry(2));
check("nor a third", !jt.canRetry(3));
check("the worker enforces it", /if \(canRetry\(attempts\)\)/.test(runJobSrc));
check(
  "and the attempt is counted BEFORE the work, so a kill still counts",
  runJobSrc.indexOf("attempts, step_total") < runJobSrc.indexOf("await handler(ctx)")
);

console.log("\n== 3. a dead worker is reaped, and refunded ==");
const now = new Date("2026-08-12T12:00:00Z");
const fresh = new Date(now.getTime() - 60_000).toISOString();
const ancient = new Date(now.getTime() - jt.JOB_STALE_MS - 60_000).toISOString();
check("a running job with no heartbeat is stale", jt.isJobStale("running", ancient, ancient, now));
check("a queued one too", jt.isJobStale("queued", ancient, ancient, now));
check("one that wrote a moment ago is not", !jt.isJobStale("running", fresh, fresh, now));
// Measured from updated_at, so a job stepping forward is alive however
// long it has been going.
check(
  "an OLD job that is still writing is alive",
  !jt.isJobStale("running", fresh, ancient, now),
  "created long ago, updated a minute ago"
);
check("a finished job is never reaped", !jt.isJobStale("done", ancient, ancient, now));
check("nor a failed one", !jt.isJobStale("failed", ancient, ancient, now));
check("no timestamp at all is not stale", !jt.isJobStale("running", null, null, now));
check("an unparseable timestamp is not stale", !jt.isJobStale("running", "not-a-date", "not-a-date", now));
// The staleness window must exceed one whole invocation, or a healthy slow
// job is reaped mid-flight, refunded, and then settled as well.
const fl = await loadTs("src/lib/function-limits.ts");
check(
  `the window (${jt.JOB_STALE_MS / 60000}min) is above one full invocation (${fl.MAX_FUNCTION_DURATION_SECONDS}s)`,
  jt.JOB_STALE_MS > fl.MAX_FUNCTION_DURATION_SECONDS * 1000
);
check("the poll applies the reaper", /isJobStale\(/.test(pollSrc) && /reapJob\(/.test(pollSrc));
check("the reap refunds before it writes", /releaseReservation/.test(runJobSrc));
const reapAt = runJobSrc.indexOf("export async function reapJob");
const reapBody = runJobSrc.slice(reapAt);
check(
  "and the refund comes BEFORE the status write",
  reapBody.indexOf("releaseReservation") < reapBody.indexOf('status: "failed"')
);
check(
  "the reap is conditioned on the status it read",
  /\.eq\("status", job\.status\)/.test(runJobSrc)
);
// This assertion used to match the English sentence the reaper wrote onto
// the row. That sentence is gone on purpose — the client was printing it
// verbatim, so a Greek user met an English apology at the worst possible
// moment. The row now carries the CODE and the UI carries the wording, so
// the guarantee is checked in both halves rather than in the prose.
check("the reaped row is charged zero", /credits_charged: 0,/.test(runJobSrc));
check("and carries a translatable code, not English prose", /error: "stalled"/.test(runJobSrc));
const agentsUi = readFileSync("src/components/agents/agents-workspace.tsx", "utf8");
check(
  "the client renders that code in the user\'s language",
  /job\.error === "stalled" \? t\("buildStalled"\)/.test(agentsUi)
);
const enMessages = JSON.parse(readFileSync("messages/en.json", "utf8"));
check(
  "and the message reassures about the credits",
  /No credits were charged/i.test(enMessages.dashboard.agents.buildStalled)
);

console.log("\n== 4. money: settle or refund, never neither ==");
eq("a done job settles", jt.creditActionForOutcome("done"), "settle");
eq("a failed job refunds", jt.creditActionForOutcome("failed"), "refund");
eq("a queued job does neither yet", jt.creditActionForOutcome("queued"), "none");
eq("nor a running one", jt.creditActionForOutcome("running"), "none");
check("the worker settles on success", /settleReservation\(\{/.test(runJobSrc));
check("and releases on terminal failure", /export async function failJob/.test(runJobSrc));
check(
  "failJob refunds before writing the row, so a failed write cannot strand the hold",
  (() => {
    const body = runJobSrc.slice(runJobSrc.indexOf("export async function failJob"), reapAt);
    return body.indexOf("releaseReservation") < body.indexOf('status: "failed"');
  })()
);
// The usage measured so far is persisted at every step. Without it a job
// spanning two invocations settles on a fraction of the work really done —
// an under-charge nothing could detect, because the stored margin would be
// computed from the same understated cost and read healthy.
check("usage is snapshotted on every progress write", /usage_entries: costs\.snapshot\(\)/.test(runJobSrc));
check(
  "and restored when a later invocation picks the job up",
  /CostAccumulator\.restore\(/.test(runJobSrc)
);
check("the migration carries usage_entries", /usage_entries jsonb/.test(migration));
check("and the reservation id", /reservation_id text/.test(migration));

console.log("\n== 4b. the reserve happens before the job exists ==");
// A user who cannot afford the job must be told by the ROUTE, with a 402
// they can act on — not handed a job id for work that dies in a worker
// they are not watching.
check("startJob reserves first", startJobSrc.indexOf("reserveCredits(") < startJobSrc.indexOf('.from("ai_jobs")'));
check("then inserts", startJobSrc.indexOf('.from("ai_jobs")') < startJobSrc.indexOf("kickJob("));
check("and kicks last", /const kicked = await kickJob\(jobId\)/.test(startJobSrc));
check(
  "a failed insert gives the hold straight back",
  /if \(reservation\.reservationId\) await releaseReservation/.test(startJobSrc)
);
check("insufficient credits is reported, not swallowed", /reason: "insufficient"/.test(startJobSrc));

console.log("\n== 5. one job cannot be run twice ==");
// Two kicks for the same job is normal — a retried fetch, a client nudge
// racing the real kick. Running both would spend two jobs' worth of credits.
check("the claim is a conditional update", /\.eq\("running", false\)/.test(runJobSrc));
check("it only claims unfinished work", /\.in\("status", \["queued", "running"\]\)/.test(runJobSrc));
check("and reports whether it won", /return \(data \?\? \[\]\)\.length === 1;/.test(runJobSrc));
check("the continue route claims before running", continueSrc.indexOf("claimJob(") < continueSrc.indexOf("runJob("));
check(
  "losing the claim is a 200, not an error — the caller was right to try",
  /ran: false, reason: "locked"/.test(continueSrc)
);
check("a finished job is not re-run", /isJobActive\(String\(job\.status\)\)/.test(continueSrc));
check("the migration defaults the lock to free", /running boolean not null default false/.test(migration));

console.log("\n== 6. it survives the page closing ==");
// The requirement, and the mechanism. The work is not attached to the
// browser's connection at all.
check("the kick is fire-and-forget", /void fetch\(`\$\{getSiteUrl\(\)\}\/api\/jobs\/\$\{jobId\}\/continue`/.test(runJobSrc));
check(
  "and is never awaited for the work",
  !/await fetch\(`\$\{getSiteUrl\(\)\}\/api\/jobs/.test(runJobSrc)
);
check("it authenticates as our own infrastructure", /INTERNAL_HANDOFF_HEADER/.test(runJobSrc));
check("the continue route accepts that token", /INTERNAL_HANDOFF_HEADER/.test(continueSrc));
check("and a missing CRON_SECRET is reported loudly", /CRON_SECRET is not set/.test(runJobSrc));
// The build route must not await the work any more.
const buildRoute = readFileSync("src/app/api/agents/build/route.ts", "utf8");
check("the build route starts a job", /startJob\(\{/.test(buildRoute));
check("and returns 202 immediately", /status: 202/.test(buildRoute));
check("it no longer awaits the builder", !/await buildAgentFromRequest/.test(buildRoute));
check("nor the clarification pre-check", !/await checkNeedsClarification/.test(buildRoute));
check("nor settles inline", !/await settleReservation/.test(buildRoute));

console.log("\n== 7. coming back sees the right state ==");
// localStorage would have been fewer lines and wrong in a second tab, in a
// different browser, and after a cleared cache — telling the user nothing
// is running while a worker spends their credits.
check("there is a server-side 'is anything running' query", /kind=/.test(listSrc) || /searchParams\.get\("kind"\)/.test(listSrc));
check("scoped to unfinished jobs by default", /\.in\("status", \["queued", "running"\]\)/.test(listSrc));
check("read through the user's own client, so RLS scopes it", /createClient\(\)/.test(listSrc) && !/createAdminClient/.test(listSrc));
const workspace = readFileSync("src/components/agents/agents-workspace.tsx", "utf8");
check("the agents page asks on mount", /fetch\("\/api\/jobs\?kind=agent_build"\)/.test(workspace));
check("and adopts the running job", /setJobId\(String\(data\.job\.id\)\)/.test(workspace));
check(
  "what is 'building' comes from the job, not from a click",
  // watchLost joined the destructure when the silent-poll-failure fix
  // landed; the property under test is unchanged — `building` is derived
  // from the job row, never set by a click.
  /const \{ job, isRunning: building(?:, watchLost: \w+)? \} = useAiJob\(jobId\)/.test(workspace)
);
check("the old boolean is gone", !/setBuilding\(/.test(workspace));
check("the result is read off the row", /job\.result/.test(workspace));

console.log("\n== 8. progress is real, not a timer ==");
for (const kind of jt.JOB_KINDS) {
  const steps = jt.JOB_STEPS[kind];
  check(`${kind} declares ${steps?.length ?? 0} steps`, Array.isArray(steps) && steps.length >= 3);
  eq(`${kind}: stepCount agrees`, jt.stepCount(kind), steps.length);
}
eq("nothing done is 0%", jt.jobPercent(0, 4, "running"), 0);
eq("half way is 50%", jt.jobPercent(2, 4, "running"), 50);
// A bar sitting full while the spinner turns is how "it is stuck" gets
// reported about work that is fine.
eq("a running job never shows 100%", jt.jobPercent(4, 4, "running"), 99);
eq("only a finished one does", jt.jobPercent(0, 4, "done"), 100);
eq("a nonsense total is 0, not NaN", jt.jobPercent(1, 0, "running"), 0);
eq("a negative step is clamped", jt.jobPercent(-5, 4, "running"), 0);
check("the worker writes each step as it passes it", /progress: async \(step, label\)/.test(runJobSrc));
check("the handler reports its own steps", /ctx\.progress\(/.test(readFileSync("src/lib/jobs/handlers/agent-build.ts", "utf8")));
check("the poll returns a percentage", /percent: jobPercent\(/.test(pollSrc));

console.log("\n== 9. nobody can read or forge someone else's job ==");
check("the poll reads through the user's client", /const supabase = createClient\(\);/.test(pollSrc));
check("a missing job is 404, not 403", /status: 404/.test(pollSrc) && !/status: 403/.test(pollSrc));
check("the continue route checks ownership when not internal", /user\.id !== job\.user_id/.test(continueSrc));
check("and 404s rather than confirming the job exists", /Job not found/.test(continueSrc));
check("RLS is enabled on the table", /alter table public\.ai_jobs enable row level security/.test(migration));
check("with a select-own policy", /for select using \(auth\.uid\(\) = user_id\)/.test(migration));
// A client that could insert could queue work it never paid for; one that
// could update could set credits_charged to zero.
check("and NO insert policy", !/for insert/.test(migration));
check("no update policy", !/for update/.test(migration));
check("no delete policy", !/for delete/.test(migration));

console.log("\n== 10. the migration is idempotent and un-migrated-safe ==");
check("the table is created if not exists", /create table if not exists public\.ai_jobs/.test(migration));
check("indexes too", (migration.match(/create index if not exists/g) ?? []).length >= 2);
check("the policy is dropped before being created", /drop policy if exists/.test(migration));
check("the trigger too", /drop trigger if exists/.test(migration));
// A column list fails the WHOLE query when one column is missing, so an
// un-migrated deployment would 500 on every poll rather than degrade.
check("the poll selects *", /\.from\("ai_jobs"\)\s*\.select\("\*"\)/.test(pollSrc));

console.log("\n== 11. the client watches rows, and stops when there is nothing to watch ==");
check("the hook polls by job id", /\/api\/jobs\/\$\{jobId\}/.test(hookSrc));
check("it clears its interval on unmount", /clearInterval\(timer\)/.test(hookSrc));
check("a finished job stops the polling logic", /if \(job\.status === "done" \|\| job\.status === "failed"\) return;/.test(hookSrc));
check(
  "a dropped poll does not clear the known state",
  /Leave the last known state/.test(hookSrc)
);
// The safety net for a kick that never landed.
check("a job stuck at queued is nudged", /NUDGE_AFTER_POLLS/.test(hookSrc));
check("exactly once", /nudged\.current = true/.test(hookSrc));
check("and the nudge is safe because the claim decides", /continue`, \{ method: "POST", keepalive: true \}/.test(hookSrc));

console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${failures.length} failed`);
process.exit(failures.length === 0 ? 0 : 1);
