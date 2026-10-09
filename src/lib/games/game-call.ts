import "server-only";
import Anthropic from "@anthropic-ai/sdk";
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
 */
export type GameCallResult<T> = { ok: true; value: T } | { ok: false; kind: "aborted" | "provider" | "unusable"; detail: string };

type Tool = { name: string; description: string; input_schema: { type: "object"; properties: Record<string, unknown>; required: string[] } };

async function call(params: { apiKey: string; message: string; tool: Tool; maxTokens: number; costs: CostAccumulator; signal?: AbortSignal }): Promise<GameCallResult<unknown>> {
  const anthropic = new Anthropic({ apiKey: params.apiKey });
  let response: Anthropic.Message;
  try {
    response = await anthropic.messages.create(
      {
        model: GAME_MODEL,
        max_tokens: params.maxTokens,
        system: gameSystemPrompt(),
        messages: [{ role: "user", content: params.message }],
        tools: [params.tool as Anthropic.Tool],
        tool_choice: { type: "tool", name: params.tool.name },
      },
      { signal: params.signal }
    );
  } catch (err) {
    if (params.signal?.aborted) return { ok: false, kind: "aborted", detail: "stopped by the user" };
    return { ok: false, kind: "provider", detail: err instanceof Error ? err.message : String(err) };
  }
  params.costs.record("generation", response.usage, response.model || GAME_MODEL);
  // A GAME CUT AT THE OUTPUT CEILING DOES NOT RUN: its last script never closes.
  if (response.stop_reason === "max_tokens") return { ok: false, kind: "unusable", detail: "truncated at the output ceiling" };
  const toolUse = response.content.find((block): block is Anthropic.ToolUseBlock => block.type === "tool_use");
  if (!toolUse) return { ok: false, kind: "unusable", detail: "the model returned no tool call" };
  return { ok: true, value: toolUse.input };
}

const playable = (check: GameCheck): GameCallResult<string> =>
  check.ok ? { ok: true, value: check.html } : { ok: false, kind: "unusable", detail: `not a playable game: ${check.reason}${check.what ? ` (${check.what})` : ""}` };

export async function planGame(params: { apiKey: string; description: string; locale: string; costs: CostAccumulator; signal?: AbortSignal }): Promise<GameCallResult<GamePlan>> {
  const out = await call({ ...params, message: planMessage(params.description, params.locale), tool: PLAN_TOOL, maxTokens: PLAN_MAX_TOKENS });
  if (!out.ok) return out;
  const parsed = parsePlan(out.value, params.description.slice(0, 60));
  return parsed.ok ? { ok: true, value: parsed.plan } : { ok: false, kind: "unusable", detail: parsed.reason };
}

export async function rewriteGameBox(params: { apiKey: string; plan: GamePlan; kind: GameBoxKind; instruction: string; locale: string; costs: CostAccumulator; signal?: AbortSignal }): Promise<GameCallResult<string>> {
  const out = await call({ ...params, message: boxMessage(params.plan, params.kind, params.instruction, params.locale), tool: BOX_TOOL, maxTokens: PLAN_MAX_TOKENS });
  if (!out.ok) return out;
  const text = (out.value as { text?: unknown })?.text;
  return typeof text === "string" && text.trim() ? { ok: true, value: text } : { ok: false, kind: "unusable", detail: "the box came back empty" };
}

export async function writeGame(params: { apiKey: string; plan: GamePlan; locale: string; costs: CostAccumulator; signal?: AbortSignal }): Promise<GameCallResult<string>> {
  const out = await call({ ...params, message: buildMessage(params.plan, params.locale), tool: GAME_TOOL, maxTokens: GAME_MAX_TOKENS });
  if (!out.ok) return out;
  return playable(checkGameHtml((out.value as { html?: unknown })?.html));
}

export async function changeGame(params: { apiKey: string; html: string; instruction: string; locale: string; costs: CostAccumulator; signal?: AbortSignal }): Promise<GameCallResult<string>> {
  const out = await call({ ...params, message: changeMessage(params.html, params.instruction, params.locale), tool: GAME_TOOL, maxTokens: GAME_MAX_TOKENS });
  if (!out.ok) return out;
  return playable(checkGameHtml((out.value as { html?: unknown })?.html));
}
