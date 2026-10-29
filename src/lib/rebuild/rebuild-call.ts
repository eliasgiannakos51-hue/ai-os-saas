import "server-only";
import { runCompletion } from "@/lib/ai/providers/complete";
import { AI_TRUNCATED_STOP_REASON, type AiOutcome, type AiToolSpec } from "@/lib/ai/providers/types";
import { CostAccumulator } from "@/lib/billing/cost-accumulator";
import {
  APP_MAX_TOKENS,
  APP_TOOL,
  BOX_TOOL,
  PLAN_MAX_TOKENS,
  PLAN_TOOL,
  REBUILD_MODEL,
  boxMessage,
  buildMessage,
  changeMessage,
  parsePlan,
  planMessage,
  type RebuildBoxKind,
  type RebuildPlan,
} from "@/lib/rebuild/rebuild-plan";
import { checkAppHtml, type AppCheck } from "@/lib/rebuild/rebuild-html";
import { rebuildSystemPrompt } from "@/lib/rebuild/rebuild-system";
import { FEATURES_MAX_TOKENS, FEATURES_TOOL, featuresMessage, parseFeatures } from "@/lib/rebuild/rebuild-features";

/**
 * REBUILD'S CALLS TO THE MODEL: plan it, change one box, write it, change
 * it. One forced tool each, through the router (never the SDK), the same
 * shape as lib/games/game-call.ts. Usage is recorded the moment the model
 * answers, before the answer is read, so an answer that is not a plan or
 * not a safe app is still paid for and the route settles it; a stop or a
 * provider failure records nothing.
 *
 * THIS FUNCTION DOES NOT THROW, and that is a money property: the route
 * holds credits before it calls and releases them on `ok: false` with kind
 * "aborted" or "provider".
 */
export type RebuildCallResult<T> = { ok: true; value: T } | { ok: false; kind: "aborted" | "provider" | "unusable"; detail: string };

type Tool = AiToolSpec & { inputSchema: { type: "object"; properties: Record<string, unknown>; required: string[] } };

async function call(params: { message: string; tool: Tool; maxTokens: number; costs: CostAccumulator; userId?: string; signal?: AbortSignal }): Promise<RebuildCallResult<unknown>> {
  let outcome: AiOutcome;
  try {
    outcome = await runCompletion(
      {
        purpose: "create",
        model: REBUILD_MODEL,
        maxTokens: params.maxTokens,
        system: [{ type: "text", text: rebuildSystemPrompt() }],
        messages: [{ role: "user", content: params.message }],
        tools: [params.tool],
        toolChoice: { type: "tool", name: params.tool.name },
        requires: ["tool_calling"],
      },
      { userId: params.userId, signal: params.signal }
    );
  } catch (err) {
    if (params.signal?.aborted) return { ok: false, kind: "aborted", detail: "stopped by the user" };
    return { ok: false, kind: "provider", detail: err instanceof Error ? err.message : String(err) };
  }
  if (!outcome.ok) {
    return outcome.kind === "aborted" ? { ok: false, kind: "aborted", detail: "stopped by the user" } : { ok: false, kind: "provider", detail: outcome.detail };
  }
  params.costs.record("generation", outcome.usage, outcome.reportedModel || outcome.model);
  // An app cut at the output ceiling does not run: its last script never closes.
  if (outcome.stopReason === AI_TRUNCATED_STOP_REASON) return { ok: false, kind: "unusable", detail: "truncated at the output ceiling" };
  const toolUse = outcome.toolCalls.find((toolCall) => toolCall.name === params.tool.name);
  if (!toolUse) return { ok: false, kind: "unusable", detail: "the model returned no tool call" };
  return { ok: true, value: toolUse.input };
}

const safe = (check: AppCheck): RebuildCallResult<string> =>
  check.ok ? { ok: true, value: check.html } : { ok: false, kind: "unusable", detail: `not a safe app: ${check.reason}${check.what ? ` (${check.what})` : ""}` };

export async function planApp(params: { description: string; locale: string; reference?: string | null; features?: readonly string[]; costs: CostAccumulator; userId?: string; signal?: AbortSignal }): Promise<RebuildCallResult<RebuildPlan>> {
  const out = await call({ ...params, message: planMessage(params.description, params.locale, params.reference, params.features), tool: PLAN_TOOL, maxTokens: PLAN_MAX_TOKENS });
  if (!out.ok) return out;
  const parsed = parsePlan(out.value, params.description.slice(0, 60));
  return parsed.ok ? { ok: true, value: parsed.plan } : { ok: false, kind: "unusable", detail: parsed.reason };
}

/** The capabilities apps like this one typically have — Κομμάτι 2, shown before the plan, folded in as the person edits them. */
export async function deriveFeatures(params: { description: string; locale: string; reference?: string | null; costs: CostAccumulator; userId?: string; signal?: AbortSignal }): Promise<RebuildCallResult<string[]>> {
  const out = await call({ ...params, message: featuresMessage(params.description, params.locale, params.reference), tool: FEATURES_TOOL, maxTokens: FEATURES_MAX_TOKENS });
  if (!out.ok) return out;
  const parsed = parseFeatures(out.value);
  return parsed.ok ? { ok: true, value: parsed.features } : { ok: false, kind: "unusable", detail: parsed.reason };
}

export async function rewriteAppBox(params: { plan: RebuildPlan; kind: RebuildBoxKind; instruction: string; locale: string; costs: CostAccumulator; userId?: string; signal?: AbortSignal }): Promise<RebuildCallResult<string>> {
  const out = await call({ ...params, message: boxMessage(params.plan, params.kind, params.instruction, params.locale), tool: BOX_TOOL, maxTokens: PLAN_MAX_TOKENS });
  if (!out.ok) return out;
  const text = (out.value as { text?: unknown })?.text;
  return typeof text === "string" && text.trim() ? { ok: true, value: text } : { ok: false, kind: "unusable", detail: "the box came back empty" };
}

export async function writeApp(params: { plan: RebuildPlan; locale: string; reference?: string | null; costs: CostAccumulator; userId?: string; signal?: AbortSignal }): Promise<RebuildCallResult<string>> {
  const out = await call({ ...params, message: buildMessage(params.plan, params.locale, params.reference), tool: APP_TOOL, maxTokens: APP_MAX_TOKENS });
  if (!out.ok) return out;
  return safe(checkAppHtml((out.value as { html?: unknown })?.html));
}

export async function changeApp(params: { html: string; instruction: string; locale: string; costs: CostAccumulator; userId?: string; signal?: AbortSignal }): Promise<RebuildCallResult<string>> {
  const out = await call({ ...params, message: changeMessage(params.html, params.instruction, params.locale), tool: APP_TOOL, maxTokens: APP_MAX_TOKENS });
  if (!out.ok) return out;
  return safe(checkAppHtml((out.value as { html?: unknown })?.html));
}
