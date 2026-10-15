import "server-only";
import { buildCachedSystem } from "@/lib/ai/cached-system";
import { runCompletion } from "@/lib/ai/providers/complete";
import { AI_TRUNCATED_STOP_REASON, type AiOutcome } from "@/lib/ai/providers/types";
import { CostAccumulator } from "@/lib/billing/cost-accumulator";
import { parsePostsToolInput, type PostPlatform, type PostSet } from "@/lib/posts/platforms";
import { POSTS_MAX_TOKENS, POSTS_MODEL, WRITE_POSTS_TOOL, buildPostsSystemPrompt, buildPostsUserMessage } from "@/lib/posts/prompt";

/**
 * ONE FORCED-TOOL CALL THAT WRITES EVERY POST.
 *
 * The same shape as lib/presentations/generate.ts, and for the same
 * reasons: the tool's schema is the result, toolChoice forces it, the
 * parser clamps every field, nothing is streamed so the Stop button
 * releases the whole hold, and a reply cut at the output ceiling is
 * refused by its stop reason rather than parsed as a shorter set.
 *
 * Usage is recorded BEFORE the parse, so an answer that was not a set of
 * posts still settles — the tokens were spent.
 *
 * THROUGH THE ROUTER, NOT THE SDK (step 1.4). No api key travels in:
 * which provider serves this is a configuration question
 * (lib/ai/providers/registry.ts), and a provider with no key is simply
 * not in the chain, so with only ANTHROPIC_API_KEY set — which is what
 * production has today — this call is served exactly as it was.
 */

export type GeneratePostsResult =
  | { ok: true; set: PostSet; imageQuery: string | null }
  | { ok: false; kind: "aborted" | "no_tool_use" | "unusable" | "provider"; detail: string };

export async function generatePosts(params: {
  description: string;
  platforms: PostPlatform[];
  locale: string;
  /**
   * THE MEMORY BLOCK, ALREADY BUILT, or "" when there is nothing to say.
   *
   * Passed in rather than loaded here: this module has no Supabase client
   * and should not grow one — the route already has the user, the plan
   * limit and the per-feature switch. See lib/memory/store.ts.
   *
   * IT GOES IN perUserBlock AND NOWHERE ELSE. Measured 2026-09-24:
   * twenty facts are 547 tokens and the minimum cacheable prefix on
   * Sonnet is 1,024, so a memory block can never be a cache breakpoint
   * on its own — and Anthropic does not error on a short one, it
   * silently returns cache_creation_input_tokens: 0. Behind the feature's
   * own system prompt it is inside the cached region and costs a tenth.
   */
  memoryBlock?: string;
  /** What this account sells and is working on, rendered by
   *  lib/ai/workspace-context.ts. Passed in for the same reason
   *  memoryBlock is: the route has the client, this module must not grow
   *  one. Empty string when the account is new or the read failed —
   *  context improves a request, it is never a precondition for one.
   *
   *  IT GOES IN THE USER TURN, NOT THE SYSTEM BLOCK. The records change
   *  between two requests from the same person, so putting them behind
   *  the cache breakpoint would invalidate the cached prefix on every
   *  call and cost MORE than not caching at all. */
  businessContext?: string;
  /** A picture from Unsplash was asked for (package 15): the model also
   *  says what to search for. */
  wantsPhoto?: boolean;
  costs: CostAccumulator;
  /** For the provider log only (lib/ai/providers/provider-log.ts). Never
   *  sent to any provider. */
  userId?: string;
  signal?: AbortSignal;
}): Promise<GeneratePostsResult> {
  // THIS FUNCTION DOES NOT THROW, AND THAT IS A MONEY PROPERTY, not a
  // style. The route holds credits BEFORE it calls and releases them on
  // `ok: false`; its outer catch logs and returns 500 WITHOUT releasing.
  // So a throw from here leaves a person's credits held for a call that
  // produced nothing. runCompletion answers with a failure rather than
  // throwing on every path it knows about — this covers the ones it
  // does not, and it is the same catch the SDK call had before the
  // move.
  let outcome: AiOutcome;
  try {
    outcome = await runCompletion(
      {
        purpose: "create",
        model: POSTS_MODEL,
        maxTokens: POSTS_MAX_TOKENS,
        system: buildCachedSystem({
          staticPrefix: buildPostsSystemPrompt(),
          perUserBlock: params.memoryBlock ?? "",
          model: POSTS_MODEL,
        }),
        messages: [
          {
            role: "user",
            content: buildPostsUserMessage(params.description, params.platforms, params.locale, params.businessContext ?? "", params.wantsPhoto ?? false),
          },
        ],
        tools: [WRITE_POSTS_TOOL],
        // THE TOOL'S SCHEMA IS THE ANSWER. Left to decide, a model
        // writes the posts in prose, `toolCalls` is empty, and the
        // person is shown "the model returned no posts" after paying
        // for a reply that contained all of them.
        toolChoice: { type: "tool", name: "write_posts" },
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

  // A SEVERED SET IS NOT A SHORTER SET: a cut tool call would parse as
  // fewer platforms than were asked for and be shown as if the rest had
  // been declined. Every provider spells "I ran out of room" its own
  // way and the adapters translate all four into this one word, so this
  // holds whoever served the call (ΛΘ-18).
  if (outcome.stopReason === AI_TRUNCATED_STOP_REASON) {
    return { ok: false, kind: "unusable", detail: "truncated at the output ceiling" };
  }

  const toolUse = outcome.toolCalls.find((call) => call.name === "write_posts");
  if (!toolUse) return { ok: false, kind: "no_tool_use", detail: "the model returned no posts" };

  const verdict = parsePostsToolInput(toolUse.input, { platforms: params.platforms, locale: params.locale });
  if (!verdict.ok) return { ok: false, kind: "unusable", detail: verdict.reason };
  return { ok: true, set: verdict.set, imageQuery: verdict.imageQuery };
}
