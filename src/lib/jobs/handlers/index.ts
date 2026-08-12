import "server-only";
import type { JobHandler } from "@/lib/jobs/run-job";
import type { JobKind } from "@/lib/jobs/job-types";
import { agentBuildHandler } from "@/lib/jobs/handlers/agent-build";
import { agentRunHandler } from "@/lib/jobs/handlers/agent-run";
import { missionPlanHandler } from "@/lib/jobs/handlers/mission-plan";
import { fileAskHandler } from "@/lib/jobs/handlers/file-ask";

/**
 * Which worker runs which kind of job.
 *
 * A handler does the WORK and nothing else — it never touches the job row,
 * never settles credits and never decides a retry. All of that is in
 * lib/jobs/run-job.ts, once, so five features cannot end up with five
 * different answers to "what happens to the hold when this throws".
 *
 * A kind with no entry here fails its job with a clear message rather than
 * being left queued forever, which is what a missing branch in a switch
 * would have done.
 */
export const JOB_HANDLERS: Partial<Record<JobKind, JobHandler>> = {
  agent_build: agentBuildHandler,
  agent_run: agentRunHandler,
  mission_plan: missionPlanHandler,
  file_ask: fileAskHandler,
};
