import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { logApiError } from "@/lib/log-error";
import { runCompletion } from "@/lib/ai/providers/complete";
import { modelTextFrom } from "@/lib/verification/truncation";
import { recordAiCallForDailySpend } from "@/lib/ai-circuit-breaker";
import { CostAccumulator } from "@/lib/billing/cost-accumulator";
import { CHAT_MODEL } from "@/lib/ai-models";
import {
  MAX_DRAFT_TOKENS,
  WEB_SEARCH_MAX_USES,
  checkBrief,
  dailyLimitReached,
  draftAgent,
  systemPromptFor,
} from "@/lib/company-agents/drafting";

/**
 * ONE DRAFT: validate, check the day's limit, call the model, save, return.
 *
 * Called only from /api/company-agents/drafts, which has already checked
 * that the caller is the owner. This function does not check that itself,
 * so it must not be imported anywhere that is not behind that check.
 *
 * It saves a draft as `pending` and does nothing else with it.
 *
 * SPEND. Every draft is counted against the platform's daily AI call
 * counter (recordAiCallForDailySpend), so the circuit breaker sees it,
 * and its list price is saved on the draft row (cost_usd) from the same
 * CostAccumulator the rest of the app prices with. It is NOT written to
 * ai_cost_log, which is keyed by a customer user_id and a credit charge:
 * the draft desk's spend is therefore not visible to the cost agents. The
 * ceiling on it is DAILY_DRAFT_LIMIT drafts a day, not a measured euro
 * figure.
 */

export type GenerateResult =
  | { ok: true; id: string; truncated: boolean; sources: { url: string; title: string }[] | null }
  | { ok: false; status: number; error: string };

export async function generateDraft(input: { agentId: unknown; brief: unknown; userId: string }): Promise<GenerateResult> {
  const agent = typeof input.agentId === "string" ? draftAgent(input.agentId) : undefined;
  if (!agent) return { ok: false, status: 400, error: "Unknown writing agent." };
  const brief = checkBrief(input.brief);
  if (!brief.ok) return { ok: false, status: 400, error: brief.reason };

  const admin = createAdminClient();

  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);
  const counted = await admin
    .from("company_agent_drafts")
    .select("id", { count: "exact", head: true })
    .gte("created_at", startOfDay.toISOString());
  if (counted.error) {
    logApiError("/api/company-agents/drafts", counted.error, { stage: "count today" });
    return { ok: false, status: 503, error: "Could not read company_agent_drafts. Apply the migration 20261107000000_company_agent_drafts.sql." };
  }
  if (dailyLimitReached(counted.count ?? 0)) {
    return { ok: false, status: 429, error: "The daily draft limit is reached. It opens again at 00:00 UTC." };
  }

  const costs = new CostAccumulator();
  const outcome = await runCompletion(
    {
      purpose: "summarisation",
      model: CHAT_MODEL,
      maxTokens: MAX_DRAFT_TOKENS,
      system: [{ type: "text", text: systemPromptFor(agent) }],
      messages: [{ role: "user", content: brief.brief }],
      ...(agent.web ? { serverWebSearch: { maxUses: WEB_SEARCH_MAX_USES }, requires: ["server_web_search" as const] } : {}),
    },
    { userId: input.userId }
  );
  // 0 credits: the owner is not charged, but the call counts toward the daily cap.
  await recordAiCallForDailySpend(0);

  if (!outcome.ok) {
    logApiError("/api/company-agents/drafts", new Error(outcome.detail), { kind: outcome.kind, agent: agent.id });
    return { ok: false, status: 503, error: "The AI service could not write the draft. Nothing was saved." };
  }

  // A web role whose provider cannot report sources produced an answer whose
  // claims point nowhere. That is refused, not saved with a shrug.
  if (agent.web && outcome.citations === undefined) {
    return { ok: false, status: 503, error: "The search provider returned no source information, so a researched draft would have no sources. Nothing was saved." };
  }

  costs.record("generation", outcome.usage, outcome.reportedModel || outcome.model);
  const costUsd = costs.totalUsdCost;

  const text = modelTextFrom({ text: outcome.text, stopReason: outcome.stopReason });
  if (text.text.trim() === "") {
    return { ok: false, status: 503, error: "The AI returned an empty draft. Nothing was saved." };
  }
  const sources = agent.web ? (outcome.citations ?? []).map((c) => ({ url: c.url, title: c.title })) : null;

  const { data, error } = await admin
    .from("company_agent_drafts")
    .insert({
      agent_id: agent.id,
      brief: brief.brief,
      draft: text.text,
      model: outcome.model,
      truncated: text.truncated,
      cost_usd: Number.isFinite(costUsd) ? costUsd : null,
      sources,
    })
    .select("id")
    .single();
  if (error || !data) {
    logApiError("/api/company-agents/drafts", error ?? new Error("no row returned"), { stage: "save draft" });
    return { ok: false, status: 500, error: "The draft was written but could not be saved." };
  }
  return { ok: true, id: String((data as { id: unknown }).id), truncated: text.truncated, sources };
}
