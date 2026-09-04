import type { AnthropicUsageLike } from "@/lib/billing/model-pricing";

/**
 * WHAT A STOPPED REPLY COST — the pure half.
 *
 * V4.6: a ✕ while the model writes. "It stops immediately, keeps what was
 * written, the person types the next thing at once — and CHARGES ONLY the
 * tokens that were produced, not the whole call. That last one is the
 * critical one: a full price for an answer that was cut is a charge
 * without delivery."
 *
 * WHY THE FINAL USAGE IS NOT AVAILABLE. Anthropic sends `input_tokens`
 * (and the cache figures) in message_start, at the top of the stream, and
 * the final `output_tokens` in message_delta, at the END. A stream that is
 * aborted has the first and never gets the second. So the output side is
 * COUNTED from the text that actually arrived: the route asks the token
 * counter for the partial text (a free call), and if that fails the
 * estimator below stands in — a script-aware one, because "four
 * characters a token" is an English number and a Chinese reply is nearer
 * one and a half.
 *
 * Pure, so scripts/tests/chat-stop.test.mjs can run it on every shape.
 */

const finite = (v: unknown): number =>
  typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.round(v) : 0;

/**
 * The usage record for an aborted turn: the input side exactly as
 * message_start reported it, the output side as counted from the text.
 * Never negative, never NaN, and never MORE output than the counter said.
 */
export function partialUsage(
  snapshot: AnthropicUsageLike | null | undefined,
  outputTokens: number
): AnthropicUsageLike {
  return {
    input_tokens: finite(snapshot?.input_tokens),
    output_tokens: finite(outputTokens),
    cache_creation_input_tokens: finite(snapshot?.cache_creation_input_tokens),
    cache_creation: snapshot?.cache_creation
      ? {
          ephemeral_5m_input_tokens: finite(snapshot.cache_creation.ephemeral_5m_input_tokens),
          ephemeral_1h_input_tokens: finite(snapshot.cache_creation.ephemeral_1h_input_tokens),
        }
      : null,
    cache_read_input_tokens: finite(snapshot?.cache_read_input_tokens),
    // A stopped turn's web searches, if any, are in the snapshot too —
    // they were billed by Anthropic the moment they ran.
    server_tool_use: snapshot?.server_tool_use
      ? { web_search_requests: finite(snapshot.server_tool_use.web_search_requests) }
      : null,
  };
}

/**
 * Output tokens from text, when the counter cannot be asked.
 *
 * Characters per token, by script, from the tokenizer's behaviour on the
 * three families this app is measured in: Latin ~4, Greek/Cyrillic/Arabic
 * ~2.2, CJK ~1.4. Rounded UP per script so an estimate errs toward what
 * was really produced — an estimate that undercounts is a discount the
 * product never decided to give.
 */
export function estimateOutputTokensFromText(text: string): number {
  if (typeof text !== "string" || text.length === 0) return 0;
  let latin = 0;
  let mid = 0;
  let cjk = 0;
  for (const ch of text) {
    if (/[぀-ヿ㐀-鿿가-힯]/u.test(ch)) cjk++;
    else if (/[Ͱ-ϿЀ-ӿ֐-ۿ]/u.test(ch)) mid++;
    else latin++;
  }
  return Math.ceil(latin / 4) + Math.ceil(mid / 2.2) + Math.ceil(cjk / 1.4);
}
