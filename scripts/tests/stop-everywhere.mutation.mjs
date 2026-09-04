#!/usr/bin/env node
/*
 * CAN stop-everywhere.test.mjs SEE A STOP THAT KEEPS THE MONEY, OR ONE
 * THAT NOBODY CAN PRESS?
 *
 * Eight mutations across the four surfaces and the shared column:
 *
 *   1. the reader answers "stop" on a failed read          (lib)
 *   2. a job stops at the LAST step, throwing the result   (run-job)
 *   3. a stopped job is refunded in full — work for free   (run-job)
 *   4. the website stream records nothing before throwing  (builder)
 *   5. the website worker releases instead of settling     (process)
 *   6. research stops but keeps charging nothing           (research)
 *   7. a stopped code run is failed over to the next model (complete)
 *   8. the shared progress line loses its Stop button      (ui)
 *
 * Run: node scripts/tests/stop-everywhere.mutation.mjs
 */
import { readFileSync } from "node:fs";
import { writeFileSync } from "./lib/sidecar-write.mjs";
import { execFileSync } from "node:child_process";

const GATE = "scripts/tests/stop-everywhere.test.mjs";
const LIB = "src/lib/stop-requests.ts";
const RUN_JOB = "src/lib/jobs/run-job.ts";
const BUILDER = "src/lib/website-builder.ts";
const PROCESS = "src/app/api/websites/generate/process/route.ts";
const RESEARCH = "src/lib/research/run-research.ts";
const COMPLETE = "src/lib/ai/providers/complete.ts";
const PROGRESS = "src/components/ui/ai-job-progress.tsx";
const TARGETS = [GATE, LIB, RUN_JOB, BUILDER, PROCESS, RESEARCH, COMPLETE, PROGRESS];

const MUTANTS = [
  {
    name: "a failed read of the flag stops the job",
    file: LIB,
    from: "  if (error) {\n    logApiError(\"stop-requests:read\", error, { table, id });\n    return false;\n  }",
    to: "  if (error) {\n    logApiError(\"stop-requests:read\", error, { table, id });\n    return true;\n  }",
    expect: "the reader answers 'no' on a failed read",
  },
  {
    name: "a job can be stopped at its last step, throwing a finished result away",
    file: RUN_JOB,
    from: "if (step < stepCount(kind) && (await isStopRequested(admin, \"ai_jobs\", jobId))) {",
    to: "if (await isStopRequested(admin, \"ai_jobs\", jobId)) {",
    expect: "only below the last step",
  },
  {
    name: "a stopped job is refunded in full",
    file: RUN_JOB,
    from: "          feature: `${kind}_stopped`,",
    to: "          feature: `${kind}_refunded`,",
    expect: "a stop settles for the calls that ran",
  },
  {
    name: "the website stream throws before recording the partial usage",
    file: BUILDER,
    from: "      costs?.record(round === 0 ? stage : \"retry\", partialUsage(snapshot, outputTokens), stream.currentMessage?.model || MODEL);\n      if (stoppedByOwner) throw new GenerationStoppedError(combined + arrived);",
    to: "      if (stoppedByOwner) throw new GenerationStoppedError(combined + arrived);\n      costs?.record(round === 0 ? stage : \"retry\", partialUsage(snapshot, outputTokens), stream.currentMessage?.model || MODEL);",
    expect: "the partial usage is recorded BEFORE the stop is thrown",
  },
  {
    name: "the website worker releases the hold on a stop instead of settling",
    file: PROCESS,
    from: "      if (err instanceof GenerationStoppedError) {\n        // STOPPED BY THE OWNER.",
    to: "      if (err instanceof GenerationStoppedError && false) {\n        // STOPPED BY THE OWNER.",
    expect: "a stop SETTLES (not releases)",
  },
  {
    name: "research stops without settling for the answered questions",
    file: RESEARCH,
    from: "        metadata: { reportId, outcome: \"stopped\", questionsDone: answered, questionsTotal: questions.length, chunks: (report.chunk_count ?? 0) + 1 },",
    to: "        metadata: { reportId, outcome: \"no_findings\", chunks: (report.chunk_count ?? 0) + 1 },",
    expect: "a stop settles for the questions answered",
  },
  {
    name: "a stopped code run is failed over to the next provider",
    file: COMPLETE,
    from: "        void recordProviderAttempts({ userId: options.userId, purpose: request.purpose, attempts });\n        return { ok: false, kind: \"aborted\", detail: \"stopped by the caller\", attempts };",
    to: "        void recordProviderAttempts({ userId: options.userId, purpose: request.purpose, attempts });",
    expect: "a stop is never failed over",
  },
  {
    name: "the shared progress line loses its Stop button",
    file: PROGRESS,
    from: "      {stoppable && (",
    to: "      {stoppable && !job && (",
    expect: "rendered whenever the job is running",
  },
];

function runGate() {
  try {
    execFileSync(process.execPath, [GATE], { encoding: "utf8", stdio: "pipe" });
    return { green: true, failed: [] };
  } catch (e) {
    const out = String(e.stdout ?? "") + String(e.stderr ?? "");
    return { green: false, failed: [...out.matchAll(/^ {2}FAIL {2}(.+)$/gm)].map((m) => m[1].trim()) };
  }
}

console.log("stop-everywhere mutations\n");
const originals = new Map(TARGETS.map((f) => [f, readFileSync(f, "utf8")]));
const restoreAll = () => {
  for (const [file, text] of originals) writeFileSync(file, text);
};
let caught = 0;
const missed = [];
try {
  const base = runGate();
  console.log(`baseline: the gate is ${base.green ? "GREEN" : "RED"} on the unmutated tree`);
  if (!base.green) {
    console.log(`\nBASELINE IS RED — no mutation result below would mean anything.\n  ${base.failed.join("\n  ")}`);
    process.exit(1);
  }
  for (const m of MUTANTS) {
    if (!originals.get(m.file).includes(m.from)) {
      missed.push({ ...m, why: `the mutation target no longer exists in ${m.file}` });
      console.log(`  STALE   ${m.name}`);
      continue;
    }
    writeFileSync(m.file, originals.get(m.file).replace(m.from, m.to));
    let result;
    try {
      result = runGate();
    } finally {
      restoreAll();
    }
    if (result.green) {
      missed.push({ ...m, why: "the gate stayed green — nothing here is load-bearing" });
      console.log(`  MISSED  ${m.name}`);
      continue;
    }
    const onTarget = result.failed.filter((f) => f.includes(m.expect));
    if (onTarget.length === 0) {
      missed.push({ ...m, why: `the gate went red, but on "${result.failed.slice(0, 4).join('", "')}" — nothing matching "${m.expect}"` });
      console.log(`  WRONG   ${m.name}\n          -> red on: ${result.failed.slice(0, 4).join(" | ")}`);
      continue;
    }
    caught++;
    console.log(`  CAUGHT  ${m.name}\n          -> ${onTarget[0]}`);
  }
} finally {
  restoreAll();
}
const after = runGate();
console.log(after.green ? "\nbaseline: the gate is green again on the restored tree" : "\nBASELINE IS RED — a mutation was not restored. Check `git diff`.");
console.log(`\n${caught} of ${MUTANTS.length} mutations caught.`);
if (missed.length > 0 || !after.green) {
  if (missed.length > 0) {
    console.log("\nHOLES:");
    for (const m of missed) console.log(`  - ${m.name}\n    ${m.why}`);
  }
  process.exit(1);
}
console.log("Every clause in stop-everywhere.test.mjs is load-bearing.");
