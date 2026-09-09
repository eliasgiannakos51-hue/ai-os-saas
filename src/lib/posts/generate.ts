import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { buildCachedSystem } from "@/lib/ai/cached-system";
import { CostAccumulator } from "@/lib/billing/cost-accumulator";
import { parsePostsToolInput, type PostPlatform, type PostSet } from "@/lib/posts/platforms";
import { POSTS_MAX_TOKENS, POSTS_MODEL, WRITE_POSTS_TOOL, buildPostsSystemPrompt, buildPostsUserMessage } from "@/lib/posts/prompt";

/**
 * ONE FORCED-TOOL CALL THAT WRITES EVERY POST.
 *
 * The same shape as lib/presentations/generate.ts, and for the same
 * reasons: the tool's schema is the result, tool_choice forces it, the
 * parser clamps every field, nothing is streamed so the Stop button
 * releases the whole hold, and a reply cut at the output ceiling is
 * refused by its stop_reason rather than parsed as a shorter set.
 *
 * Usage is recorded BEFORE the parse, so an answer that was not a set of
 * posts still settles — the tokens were spent.
 */

/** The shape is checked here, once — see lib/presentations/generate.ts. */
const writePostsTool: Anthropic.Tool = WRITE_POSTS_TOOL;

export type GeneratePostsResult =
  | { ok: true; set: PostSet }
  | { ok: false; kind: "aborted" | "no_tool_use" | "unusable" | "provider"; detail: string };

export async function generatePosts(params: {
  apiKey: string;
  description: string;
  platforms: PostPlatform[];
  locale: string;
  costs: CostAccumulator;
  signal?: AbortSignal;
}): Promise<GeneratePostsResult> {
  const anthropic = new Anthropic({ apiKey: params.apiKey });
  let response: Anthropic.Message;
  try {
    response = await anthropic.messages.create(
      {
        model: POSTS_MODEL,
        max_tokens: POSTS_MAX_TOKENS,
        system: buildCachedSystem({ staticPrefix: buildPostsSystemPrompt(), model: POSTS_MODEL }),
        messages: [{ role: "user", content: buildPostsUserMessage(params.description, params.platforms, params.locale) }],
        tools: [writePostsTool],
        tool_choice: { type: "tool", name: "write_posts" },
      },
      { signal: params.signal }
    );
  } catch (err) {
    if (params.signal?.aborted) return { ok: false, kind: "aborted", detail: "stopped by the user" };
    return { ok: false, kind: "provider", detail: err instanceof Error ? err.message : String(err) };
  }

  params.costs.record("generation", response.usage, response.model || POSTS_MODEL);

  // A SEVERED SET IS NOT A SHORTER SET: a cut tool call would parse as
  // fewer platforms than were asked for and be shown as if the rest had
  // been declined.
  if (response.stop_reason === "max_tokens") {
    return { ok: false, kind: "unusable", detail: "truncated at the output ceiling" };
  }

  const toolUse = response.content.find((block): block is Anthropic.ToolUseBlock => block.type === "tool_use");
  if (!toolUse) return { ok: false, kind: "no_tool_use", detail: "the model returned no posts" };

  const verdict = parsePostsToolInput(toolUse.input, { platforms: params.platforms, locale: params.locale });
  if (!verdict.ok) return { ok: false, kind: "unusable", detail: verdict.reason };
  return { ok: true, set: verdict.set };
}
