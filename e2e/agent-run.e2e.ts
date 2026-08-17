import { test, expect } from "@playwright/test";
import {
  signIn,
  waitForJob,
  creditSnapshot,
  expectChargedOnce,
  safeJson,
  Litter,
  TIMEOUTS,
} from "./support/journey";

/**
 * JOURNEY TWO: describe an agent in a sentence, have it built, run it now,
 * get output back.
 *
 * TWO SEPARATE AI ACTIONS, two separate reservations, two separate
 * settlements — and the second one is the one that has historically gone
 * wrong. agent-runner records retries onto the SAME accumulator, so a run
 * that tried three times is charged for three attempts; that is
 * deliberate and documented, and it means "charged once" here has to mean
 * one TRANSACTION, not one attempt.
 *
 * skipClarification is set on the build because the clarifying-questions
 * flow is a separate journey with a human in the middle of it. Sending it
 * false would make this spec depend on whether the model felt like asking
 * a question today, which is not a property worth failing a merge over.
 */
test.describe("agents: build, run, deliver", () => {
  test("an agent is built, runs, and stores its output", async ({ request }) => {
    test.setTimeout(TIMEOUTS.agentBuild + TIMEOUTS.agentRun + 120_000);
    const litter = new Litter();
    await signIn(request);

    const beforeBuild = await creditSnapshot(request);
    let agentId = "";
    let buildJob: Awaited<ReturnType<typeof waitForJob>>;

    await test.step("the agent is built from a sentence", async () => {
      const res = await request.post("/api/agents/build", {
        data: {
          request:
            "Every Monday at 09:00, summarise the three most important things I logged last week and email it to me.",
          skipClarification: true,
          timezone: "Europe/Athens",
        },
      });
      const body = await safeJson(res);
      expect(
        res.status() === 202 && body?.ok === true && body?.jobId,
        `BROKE AT: build. POST /api/agents/build -> ${res.status()}\n` +
          `  ${JSON.stringify(body)?.slice(0, 300)}\n` +
          `  A 402 means no credits. A 403 with a plan message means this account's tier ` +
          `does not allow agents — E2E_EMAIL needs a plan with maxAiAgents > 0.`
      ).toBeTruthy();
      buildJob = await waitForJob(request, String(body!.jobId), "agent build", TIMEOUTS.agentBuild);

      const result = buildJob.result as Record<string, unknown>;
      agentId = String(result?.agentId ?? result?.id ?? "");
      expect(
        agentId,
        `BROKE AT: build. The job finished but returned no agent id.\n` +
          `  result: ${JSON.stringify(result)?.slice(0, 300)}`
      ).toBeTruthy();
      litter.add("built agent", `/api/agents/${agentId}`);
    });

    await test.step("it was saved with a real configuration", async () => {
      const res = await request.get(`/api/agents/${agentId}`);
      const body = await safeJson(res);
      expect(
        res.ok() && body?.ok !== false,
        `BROKE AT: persistence. The build reported success but GET /api/agents/${agentId} ` +
          `returned ${res.status()}. The agent was not saved.`
      ).toBeTruthy();
      const agent = (body?.agent ?? body) as Record<string, unknown>;
      // A built agent that carries no instructions is a row, not an agent.
      expect(
        String(agent?.name ?? "").length > 0,
        `BROKE AT: persistence. The saved agent has no name: ${JSON.stringify(agent)?.slice(0, 200)}`
      ).toBeTruthy();
      expect(
        String(agent?.instructions ?? agent?.prompt ?? "").length > 20,
        `BROKE AT: persistence. The saved agent has no instructions to run — the build ` +
          `produced a configuration the runner cannot use.`
      ).toBeTruthy();
    });

    await test.step("the build was charged once", async () => {
      const after = await creditSnapshot(request);
      expectChargedOnce(beforeBuild, after, "agent build", buildJob!.creditsCharged);
    });

    const beforeRun = await creditSnapshot(request);
    let runJob: Awaited<ReturnType<typeof waitForJob>>;

    await test.step("run now produces output", async () => {
      const res = await request.post(`/api/agents/${agentId}/run`, { data: {} });
      const body = await safeJson(res);
      expect(
        res.status() === 202 && body?.ok === true && body?.jobId,
        `BROKE AT: run. POST /api/agents/${agentId}/run -> ${res.status()}\n` +
          `  ${JSON.stringify(body)?.slice(0, 300)}\n` +
          `  A 429 here is the per-hour execution cap (AGENT_MAX_RUNS_PER_HOUR) — real, and ` +
          `it means a previous run of this spec is still counted.`
      ).toBeTruthy();
      runJob = await waitForJob(request, String(body!.jobId), "agent run", TIMEOUTS.agentRun);

      const result = runJob.result as Record<string, unknown>;
      const output = String(result?.output ?? result?.summary ?? result?.result ?? "");
      expect(
        output.length > 0,
        `BROKE AT: run. The job finished with no output.\n` +
          `  result keys: ${Object.keys(result ?? {}).join(", ")}\n` +
          `  A run that completes and produces nothing is the failure that looks most like ` +
          `success in the UI.`
      ).toBeTruthy();
    });

    await test.step("and the output was stored, not just returned", async () => {
      // The UI reads runs from the table, not from the job result. If the
      // write did not happen the user sees an empty history after a run
      // they watched succeed.
      const res = await request.get(`/api/agents/${agentId}`);
      const body = await safeJson(res);
      const runs = (body?.runs ?? []) as Record<string, unknown>[];
      expect(
        Array.isArray(runs) && runs.length > 0,
        `BROKE AT: delivery. The run succeeded but the agent has no run history.\n` +
          `  GET /api/agents/${agentId} returned keys: ${Object.keys(body ?? {}).join(", ")}`
      ).toBeTruthy();
      const latest = runs[0];
      expect(
        String(latest?.status ?? "") === "completed" || String(latest?.status ?? "") === "success",
        `BROKE AT: delivery. The stored run says status="${latest?.status}" after a job that ` +
          `reported done.`
      ).toBeTruthy();
    });

    await test.step("and the run was charged once, separately from the build", async () => {
      const after = await creditSnapshot(request);
      expectChargedOnce(beforeRun, after, "agent run", runJob!.creditsCharged);
    });

    await litter.sweep(request);
  });
});
