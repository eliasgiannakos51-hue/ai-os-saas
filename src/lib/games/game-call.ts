import "server-only";
import { runCompletion } from "@/lib/ai/providers/complete";
import { AI_TRUNCATED_STOP_REASON, type AiOutcome, type AiToolSpec } from "@/lib/ai/providers/types";
import { CostAccumulator } from "@/lib/billing/cost-accumulator";
import {
  BOX_TOOL,
  GAME_MAX_TOKENS,
  GAME_MODEL,
  GAME_TOOL,
  PLAN_MAX_TOKENS,
  PLAN_TOOL,
  boxMessage,
  buildMessage,
  changeMessage,
  parsePlan,
  planMessage,
  type GameBoxKind,
  type GamePlan,
} from "@/lib/games/game-plan";
import { checkGameHtml, type GameCheck } from "@/lib/games/game-html";
import { gameSystemPrompt } from "@/lib/games/game-system";

/**
 * THE GAME'S CALLS TO THE MODEL (package 26): plan it, change one box,
 * write it, change it. One forced tool each. Usage is recorded the moment
 * the model answers, before the answer is read, so an answer that is not a
 * plan or not a playable game is still paid for and the route settles it;
 * a stop or a provider failure records nothing.
 *
 * THROUGH THE ROUTER, NOT THE SDK (step 1.4). No api key travels in; a
 * provider with no key is simply not in the chain
 * (lib/ai/providers/registry.ts), so with only ANTHROPIC_API_KEY set —
 * production today — all four calls are served exactly as they were.
 */
export type GameCallResult<T> = { ok: true; value: T } | { ok: false; kind: "aborted" | "provider" | "unusable"; detail: string };

/** The router's tool shape with the schema pinned — a tool that lost
 *  its `required` list would still be a valid AiToolSpec, and the model
 *  would be free to answer with a plan that has no boxes. */
type Tool = AiToolSpec & { inputSchema: { type: "object"; properties: Record<string, unknown>; required: string[] } };

async function call(params: { message: string; tool: Tool; maxTokens: number; costs: CostAccumulator; userId?: string; signal?: AbortSignal }): Promise<GameCallResult<unknown>> {
  // This function does not throw, and that is a money property: the
  // route holds credits before it calls and releases them on
  // `ok: false`. See lib/posts/generate.ts for the whole reasoning.
  let outcome: AiOutcome;
  try {
    outcome = await runCompletion(
      {
        purpose: "create",
        model: GAME_MODEL,
        maxTokens: params.maxTokens,
        system: [{ type: "text", text: gameSystemPrompt() }],
        messages: [{ role: "user", content: params.message }],
        tools: [params.tool],
        // The tool's input IS the plan, the box or the game. Left to
        // decide, the model writes it in prose and nothing is saved.
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
  // A GAME CUT AT THE OUTPUT CEILING DOES NOT RUN: its last script never
  // closes. Every provider's word for that is translated into this one
  // by the adapters (ΛΘ-18), so the rule holds whoever served the call.
  if (outcome.stopReason === AI_TRUNCATED_STOP_REASON) return { ok: false, kind: "unusable", detail: "truncated at the output ceiling" };
  const toolUse = outcome.toolCalls.find((toolCall) => toolCall.name === params.tool.name);
  if (!toolUse) return { ok: false, kind: "unusable", detail: "the model returned no tool call" };
  return { ok: true, value: toolUse.input };
}

const playable = (check: GameCheck): GameCallResult<string> =>
  check.ok ? { ok: true, value: check.html } : { ok: false, kind: "unusable", detail: `not a playable game: ${check.reason}${check.what ? ` (${check.what})` : ""}` };

export async function planGame(params: { description: string; locale: string; costs: CostAccumulator; userId?: string; signal?: AbortSignal }): Promise<GameCallResult<GamePlan>> {
  const out = await call({ ...params, message: planMessage(params.description, params.locale), tool: PLAN_TOOL, maxTokens: PLAN_MAX_TOKENS });
  if (!out.ok) return out;
  const parsed = parsePlan(out.value, params.description.slice(0, 60));
  return parsed.ok ? { ok: true, value: parsed.plan } : { ok: false, kind: "unusable", detail: parsed.reason };
}

export async function rewriteGameBox(params: { plan: GamePlan; kind: GameBoxKind; instruction: string; locale: string; costs: CostAccumulator; userId?: string; signal?: AbortSignal }): Promise<GameCallResult<string>> {
  const out = await call({ ...params, message: boxMessage(params.plan, params.kind, params.instruction, params.locale), tool: BOX_TOOL, maxTokens: PLAN_MAX_TOKENS });
  if (!out.ok) return out;
  const text = (out.value as { text?: unknown })?.text;
  return typeof text === "string" && text.trim() ? { ok: true, value: text } : { ok: false, kind: "unusable", detail: "the box came back empty" };
}

export async function writeGame(params: { plan: GamePlan; locale: string; costs: CostAccumulator; userId?: string; signal?: AbortSignal }): Promise<GameCallResult<string>> {
  const out = await call({ ...params, message: buildMessage(params.plan, params.locale), tool: GAME_TOOL, maxTokens: GAME_MAX_TOKENS });
  if (!out.ok) return out;
  return playable(checkGameHtml((out.value as { html?: unknown })?.html));
}

export async function changeGame(params: { html: string; instruction: string; locale: string; costs: CostAccumulator; userId?: string; signal?: AbortSignal }): Promise<GameCallResult<string>> {
  const out = await call({ ...params, message: changeMessage(params.html, params.instruction, params.locale), tool: GAME_TOOL, maxTokens: GAME_MAX_TOKENS });
  if (!out.ok) return out;
  return playable(checkGameHtml((out.value as { html?: unknown })?.html));
}
