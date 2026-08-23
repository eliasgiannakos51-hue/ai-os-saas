import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { logApiError } from "@/lib/log-error";
import { nextRunAt } from "@/lib/agents/cron-expression";
import { normaliseAgentConfig, sanitiseAgentText, wrapUntrusted } from "@/lib/agents/agent-config";
import { AGENT_DEPTH_SPECS, parseAgentDepth } from "@/lib/agents/agent-depth";
import { runnerSystemPrompt } from "@/lib/agents/agent-runner";
import { estimateAgentRun } from "@/lib/agents/execute-agent";
import { deliverAgentResult } from "@/lib/agents/deliver";
import { CostAccumulator } from "@/lib/billing/cost-accumulator";
import { settleReservation } from "@/lib/billing/reservations";
import { hasEnoughCredits, resolveEffectivePlan, getPurchasedPackCreditPriceEur } from "@/lib/billing/credits";
import { effectiveCreditPriceEurForAccount } from "@/lib/billing/credit-formula";
import { resolvePricingConfig } from "@/lib/billing/pricing-config";
import { isAdminEmail } from "@/lib/admin";
import {
  batchDecision,
  batchHasExpired,
  shouldFallBackToSync,
  type BatchStatus,
} from "@/lib/ai/batch/batch-policy";
import { collectBatch, submitBatch, batchProgress, type BatchItem } from "@/lib/ai/batch/batch-client";
import type { UserAgent } from "@/lib/agents/agent-config";
import type { User } from "@supabase/supabase-js";

/**
 * SCHEDULED AGENT RUNS, SUBMITTED IN BULK AND COLLECTED LATER (V4 #13).
 *
 * Two halves that never run in the same request: submission happens in
 * the ordinary agent tick, collection in its own cron. Between them the
 * only state is an `agent_runs` row with status 'queued' and a batch id,
 * which is what makes a crash between the two survivable — nothing is
 * held in memory and nothing is charged until a result exists.
 *
 * WHAT THIS DOES NOT DO, and would be wrong to: it does not build a
 * second execution path. A batched run that fails for any reason is
 * handed straight back to lib/agents/execute-agent.ts by making the
 * agent due again — the holds, the retries, the auto-pause, the failure
 * streak and the delivery all belong there and are not reimplemented
 * here. The cheap path is allowed to be simple precisely because the
 * expensive path already handles everything.
 *
 * NOT ONE BATCH WAS EVER SUBMITTED FROM THIS CODE. There is no
 * ANTHROPIC_API_KEY in the environment it was written in. The SQL, the
 * policy and the shape mapping are tested; the round trip is not.
 */

/**
 * Minutes between this agent's runs, measured rather than parsed.
 *
 * Asking the cron expression "how often" directly would mean a second
 * interpreter beside lib/agents/cron-expression.ts. Taking two
 * consecutive next-run times and subtracting uses the one that already
 * exists — and it is correct for the irregular schedules a field-parser
 * would get wrong (last-day-of-month, weekday-only) because it asks about
 * the actual next two occurrences.
 */
export function agentIntervalMinutes(agent: Pick<UserAgent, "schedule_cron" | "timezone">, from: Date): number {
  const first = nextRunAt(agent.schedule_cron, from, agent.timezone);
  if (!first) return 0;
  // One second past the first, so the same slot is not returned twice.
  const second = nextRunAt(agent.schedule_cron, new Date(first.getTime() + 1000), agent.timezone);
  if (!second) return 0;
  return Math.round((second.getTime() - first.getTime()) / 60_000);
}

export type SubmitOutcome =
  | { queued: true; runId: string; batchId: string }
  | { queued: false; reason: string };

/**
 * Decides whether this due agent goes on the cheap path, and puts it
 * there if so.
 *
 * ONE AGENT PER BATCH, TODAY. Submitting each agent as its own batch
 * gives up the per-request efficiency of a large batch and keeps the
 * failure blast radius at exactly one agent — which is the right trade
 * for a first version of a path that spends money and has never been
 * run. Grouping is a later change to this function alone; nothing else
 * knows the difference, because collection is already per request.
 */
export async function trySubmitAsBatch(params: {
  admin: SupabaseClient;
  apiKey: string;
  user: User;
  agent: UserAgent;
  env?: Record<string, string | undefined>;
}): Promise<SubmitOutcome> {
  const { admin, apiKey, user, agent } = params;
  const env = params.env ?? process.env;
  const now = new Date();

  // Is one already out? Checked here for the reason, and enforced by a
  // partial unique index in SQL for the race — a check in application
  // code cannot win against a second cron invocation.
  const { data: outstanding } = await admin
    .from("agent_runs")
    .select("id")
    .eq("agent_id", agent.id)
    .eq("status", "queued")
    .limit(1);

  const decision = batchDecision(
    {
      triggerSource: "schedule",
      intervalMinutes: agentIntervalMinutes(agent, now),
      batchOptOut: normaliseAgentConfig(agent.config).batchOptOut === true,
      needsWebSearch: normaliseAgentConfig(agent.config).needsWebSearch,
      hasOutstandingBatch: (outstanding?.length ?? 0) > 0,
    },
    env
  );
  if (!decision.batch) return { queued: false, reason: decision.reason };

  // AFFORDABILITY IS CHECKED, NOT HELD. A reservation lives 60 minutes
  // and the batch window is 24 hours, so a hold cannot span it. See
  // batch-policy.ts for what that trades away.
  const isAdmin = isAdminEmail(user.email);
  const plan = await resolveEffectivePlan(user);
  const config = normaliseAgentConfig(agent.config);
  const depth = parseAgentDepth(config.depth);
  const spec = AGENT_DEPTH_SPECS[depth];
  if (!isAdmin) {
    const creditPriceEur = effectiveCreditPriceEurForAccount(
      plan,
      await getPurchasedPackCreditPriceEur(agent.user_id),
      resolvePricingConfig()
    );
    const estimate = estimateAgentRun({
      promptChars: agent.prompt.length,
      needsWebSearch: config.needsWebSearch,
      accountCreditPriceEur: creditPriceEur,
      planSlug: plan?.slug ?? null,
      depth,
    });
    const affordable = await hasEnoughCredits(agent.user_id, estimate.estimatedCredits, plan);
    if (!affordable.ok) {
      // NOT an error and not a pause: the ordinary synchronous path owns
      // "out of credits" and will pause the agent with the right email.
      return { queued: false, reason: "not affordable — leave it to the synchronous path" };
    }
  }

  // The run row FIRST, so a submission that succeeds and then fails to be
  // recorded cannot leave a batch nobody is waiting for. The row's id is
  // the custom_id, which is what ties the result back.
  const { data: runRow, error: runError } = await admin
    .from("agent_runs")
    .insert({
      agent_id: agent.id,
      user_id: agent.user_id,
      status: "queued",
      queued_at: now.toISOString(),
      trigger_source: "schedule",
    })
    .select("id")
    .single();
  if (runError || !runRow) {
    // The unique index firing here means another invocation queued this
    // agent a moment ago. Not an error to log loudly — it is the guard
    // doing its job.
    return { queued: false, reason: "could not create the queued run row" };
  }
  const runId = String(runRow.id);

  const { text: safePrompt } = sanitiseAgentText(agent.prompt);
  const item: BatchItem = {
    customId: runId,
    model: spec.model,
    request: {
      purpose: "agent_run",
      model: spec.model,
      maxTokens: spec.outputTokens,
      system: [{ type: "text", text: runnerSystemPrompt(config) }],
      // NO RESEARCH PASS ON THE BATCH PATH. The web-search rounds are
      // separate synchronous calls with server tools, and a batch that
      // contained only half the work would produce an answer built
      // without the findings the agent's own configuration asked for —
      // worse, and indistinguishable from a good one. An agent with
      // needsWebSearch stays on the synchronous path.
      messages: [{ role: "user", content: `TASK (data):\n${wrapUntrusted(safePrompt)}` }],
    },
  };

  const submission = await submitBatch({ apiKey, items: [item] });
  if (!submission.ok) {
    // NOTHING WAS QUEUED VENDOR-SIDE, so the row must go: leaving it
    // 'queued' would block this agent from ever batching again (the
    // unique index) while nothing was ever going to arrive.
    await admin.from("agent_runs").delete().eq("id", runId);
    return { queued: false, reason: `submission failed: ${submission.reason}` };
  }

  await admin
    .from("agent_runs")
    .update({ batch_id: submission.batchId, batch_request_id: runId })
    .eq("id", runId);

  return { queued: true, runId, batchId: submission.batchId };
}

export type CollectionSummary = {
  batchesPolled: number;
  settled: number;
  fellBack: number;
  stillWaiting: number;
};

/**
 * Collects everything that has come back, and gives up on everything that
 * has not come back in time.
 *
 * PER REQUEST, NOT PER BATCH. One agent's request erroring must not cost
 * the others in the same batch their results.
 */
export async function collectAgentBatches(params: {
  admin: SupabaseClient;
  apiKey: string;
  limit?: number;
}): Promise<CollectionSummary> {
  const { admin, apiKey } = params;
  const summary: CollectionSummary = { batchesPolled: 0, settled: 0, fellBack: 0, stillWaiting: 0 };

  const { data: queued, error } = await admin
    .from("agent_runs")
    .select("id, agent_id, user_id, batch_id, queued_at, batch_fallbacks")
    .eq("status", "queued")
    .not("batch_id", "is", null)
    .order("queued_at", { ascending: true })
    .limit(params.limit ?? 200);
  if (error) {
    logApiError("agents:batch-collect", error, { stage: "load_queued" });
    return summary;
  }

  const rows = queued ?? [];
  const byBatch = new Map<string, typeof rows>();
  for (const row of rows) {
    const key = String(row.batch_id);
    byBatch.set(key, [...(byBatch.get(key) ?? []), row]);
  }

  const now = Date.now();
  for (const [batchId, batchRows] of byBatch) {
    summary.batchesPolled += 1;
    const progress = await batchProgress({ apiKey, batchId });

    // EXPIRY IS OURS TO ENFORCE, not the vendor's to announce. A batch
    // that stops being reported, or a poll that keeps failing, would
    // otherwise leave these rows queued forever — and the unique index
    // would block the agent from ever running again.
    const oldest = batchRows.reduce(
      (min, r) => Math.min(min, r.queued_at ? Date.parse(r.queued_at) : now),
      now
    );
    const expired = batchHasExpired(oldest, now);

    if (!progress.ok || !progress.ended) {
      if (expired) {
        for (const row of batchRows) await fallBack({ admin, row, reason: "expired" });
        summary.fellBack += batchRows.length;
      } else {
        summary.stillWaiting += batchRows.length;
      }
      continue;
    }

    const collected = await collectBatch({ apiKey, batchId });
    if (!collected.ok) {
      if (expired) {
        for (const row of batchRows) await fallBack({ admin, row, reason: "expired" });
        summary.fellBack += batchRows.length;
      } else {
        summary.stillWaiting += batchRows.length;
      }
      continue;
    }

    const byId = new Map(collected.items.map((item) => [item.customId, item]));
    for (const row of batchRows) {
      const item = byId.get(String(row.id));
      if (!item || shouldFallBackToSync(item.status)) {
        await fallBack({ admin, row, reason: item?.status ?? "missing" });
        summary.fellBack += 1;
        continue;
      }
      const ok = await settleBatchedRun({ admin, apiKey, row, item, batchId });
      if (ok) summary.settled += 1;
      else {
        await fallBack({ admin, row, reason: "settlement failed" });
        summary.fellBack += 1;
      }
    }
  }

  return summary;
}

/**
 * Hands a failed batched run back to the ordinary synchronous path.
 *
 * The run row is closed as failed with a reason a person can read, and
 * the agent is made due NOW so the next agent-runs tick executes it
 * normally, at full price. That is the whole fallback: no second
 * executor, no retry loop of its own.
 */
async function fallBack(params: {
  admin: SupabaseClient;
  row: { id: string; agent_id: string; batch_fallbacks?: number | null };
  reason: string;
}): Promise<void> {
  const { admin, row } = params;
  await admin
    .from("agent_runs")
    .update({
      status: "failed",
      finished_at: new Date().toISOString(),
      // A SENTENCE THE OWNER CAN READ, not a vendor status. "expired"
      // means nothing to somebody looking at their agent's history.
      error: "This run was queued for cheaper processing and did not come back in time — it will run again shortly.",
      batch_fallbacks: (row.batch_fallbacks ?? 0) + 1,
    })
    .eq("id", row.id);
  await admin
    .from("user_agents")
    .update({ next_run_at: new Date().toISOString() })
    .eq("id", row.agent_id);
}

async function settleBatchedRun(params: {
  admin: SupabaseClient;
  apiKey: string;
  batchId: string;
  row: { id: string; agent_id: string; user_id: string };
  item: { text: string; usage: unknown; reportedModel: string | null; status: BatchStatus };
}): Promise<boolean> {
  const { admin, row, item, batchId } = params;
  try {
    const { data: authUser } = await admin.auth.admin.getUserById(row.user_id);
    const user = authUser?.user;
    if (!user) return false;

    const { data: agentRow } = await admin
      .from("user_agents")
      .select("*")
      .eq("id", row.agent_id)
      .single();
    const agent = agentRow as UserAgent | null;
    if (!agent) return false;

    const config = normaliseAgentConfig(agent.config);
    const output = item.text.trim();
    if (!output) return false;

    const costs = new CostAccumulator();
    // recordBatch, not record: this really was a batch, and the batch id
    // is required precisely so a synchronous path cannot reach the
    // discount.
    costs.recordBatch(
      "generation",
      item.usage as Parameters<CostAccumulator["record"]>[1],
      item.reportedModel || AGENT_DEPTH_SPECS[parseAgentDepth(config.depth)].model,
      batchId
    );

    const plan = await resolveEffectivePlan(user);
    // Hoisted rather than called inline in `bypassCharge` below, and not
    // for tidiness: scripts/tests/combined-ceiling.test.mjs inventories
    // every zero-charge expression in the tree and only recognises the
    // shape the rest of the codebase uses. An inline isAdminEmail(...)
    // reads to that gate as an unregistered free path — which is exactly
    // what it is designed to catch, and it caught this.
    const isAdmin = isAdminEmail(user.email);
    const settlement = await settleReservation({
      userId: row.user_id,
      // NO RESERVATION TO SETTLE AGAINST — nothing was held, because
      // nothing could be held for 24 hours. The charge is taken here from
      // measured usage.
      reservationId: "",
      feature: "agent_run_batch",
      costs,
      plan,
      bypassCharge: isAdmin || !plan,
      metadata: { batchId, agentId: agent.id },
    });

    const delivery = await deliverAgentResult({
      userId: row.user_id,
      email: user.email ?? "",
      method: agent.delivery_method,
      target: agent.delivery_target,
      agentName: agent.name,
      output,
      language: config.language,
    });

    await admin
      .from("agent_runs")
      .update({
        status: "success",
        finished_at: new Date().toISOString(),
        output,
        error: delivery.delivered ? null : delivery.reason ?? null,
        credits_charged: settlement.creditsCharged,
        would_have_charged_credits: settlement.wouldHaveChargedCredits,
      })
      .eq("id", row.id);

    return true;
  } catch (err) {
    logApiError("agents:batch-settle", err, { runId: row.id, batchId });
    return false;
  }
}
