import "server-only";
import { runCompletion } from "@/lib/ai/providers/complete";
import { AI_TRUNCATED_STOP_REASON, type AiOutcome, type AiToolSpec } from "@/lib/ai/providers/types";
import { CostAccumulator } from "@/lib/billing/cost-accumulator";
import {
  APP_MODEL,
  BOX_TOOL,
  PLAN_MAX_TOKENS,
  PLAN_TOOL,
  boxMessage,
  parseDefinition,
  planMessage,
  spliceBox,
  type AppBoxKind,
  type AppDefinition,
} from "@/lib/apps/app-plan";
import { appSystemPrompt } from "@/lib/apps/app-system";

/**
 * THE APP PLANNER'S CALLS (κομμάτι 2): plan it, change one box. One
 * forced tool each. Usage is recorded the moment the model answers,
 * before the answer is read, so an answer that is not a plan is still
 * paid for and the route settles it; a stop or a provider failure
 * records nothing.
 *
 * Nothing here throws. The route holds credits before it calls and
 * releases them on `ok: false` — the same money property every paid
 * call in this repo keeps (lib/games/game-call.ts says it at length).
 */
export type AppCallResult<T> = { ok: true; value: T } | { ok: false; kind: "aborted" | "provider" | "unusable"; detail: string };

type Tool = AiToolSpec & { inputSchema: { type: "object"; properties: Record<string, unknown>; required: string[] } };

async function call(params: { message: string; tool: Tool; costs: CostAccumulator; userId?: string; signal?: AbortSignal }): Promise<AppCallResult<unknown>> {
  let outcome: AiOutcome;
  try {
    outcome = await runCompletion(
      {
        purpose: "create",
        model: APP_MODEL,
        maxTokens: PLAN_MAX_TOKENS,
        system: [{ type: "text", text: appSystemPrompt() }],
        messages: [{ role: "user", content: params.message }],
        tools: [params.tool],
        // The tool's input IS the plan. Left to decide, the model
        // describes the app in prose and nothing is saved.
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
    return outcome.kind === "aborted"
      ? { ok: false, kind: "aborted", detail: "stopped by the user" }
      : { ok: false, kind: "provider", detail: outcome.detail };
  }
  params.costs.record("generation", outcome.usage, outcome.reportedModel || outcome.model);
  // A plan cut at the output ceiling loses its last screens, and the
  // parser would accept the half that arrived as though it were the
  // whole app. Every provider's word for truncation is translated into
  // this one by the adapters, so the rule holds whoever served the call.
  if (outcome.stopReason === AI_TRUNCATED_STOP_REASON) return { ok: false, kind: "unusable", detail: "truncated at the output ceiling" };
  const toolUse = outcome.toolCalls.find((toolCall) => toolCall.name === params.tool.name);
  if (!toolUse) return { ok: false, kind: "unusable", detail: "the model returned no tool call" };
  return { ok: true, value: toolUse.input };
}

export async function planApp(params: {
  description: string;
  locale: string;
  costs: CostAccumulator;
  userId?: string;
  signal?: AbortSignal;
}): Promise<AppCallResult<AppDefinition>> {
  const out = await call({ ...params, message: planMessage(params.description, params.locale), tool: PLAN_TOOL });
  if (!out.ok) return out;
  const parsed = parseDefinition(out.value, params.description.slice(0, 60));
  return parsed.ok ? { ok: true, value: parsed.definition } : { ok: false, kind: "unusable", detail: parsed.reason };
}

/**
 * One box changed. The model is asked for that box's slice only, and
 * spliceBox carries every other box across untouched — so "the others
 * stay as they were" is a property of the code, not a hope about the
 * model's obedience.
 */
export async function rewriteAppBox(params: {
  definition: AppDefinition;
  kind: AppBoxKind;
  instruction: string;
  locale: string;
  costs: CostAccumulator;
  userId?: string;
  signal?: AbortSignal;
}): Promise<AppCallResult<{ definition: AppDefinition; dropped: string[] }>> {
  const out = await call({ ...params, message: boxMessage(params.definition, params.kind, params.instruction, params.locale), tool: BOX_TOOL });
  if (!out.ok) return out;
  const next = spliceBox(params.definition, params.kind, out.value);
  // spliceBox returns the definition it was given when the slice held
  // nothing usable. Saying so is better than storing an identical row
  // and telling the person their change was made.
  if (next.definition === params.definition) return { ok: false, kind: "unusable", detail: "the box came back with nothing that could be used" };
  return { ok: true, value: next };
}
