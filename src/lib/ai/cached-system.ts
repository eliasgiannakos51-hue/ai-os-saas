// Prompt caching for the system prompt, in one place, with the size rule
// enforced instead of assumed.
//
// WHY THIS EXISTS. Before this module, exactly ONE of the app's AI call
// sites used Anthropic's prompt caching: lib/website-builder.ts, which
// marks its 32,611-character SYSTEM_PROMPT with cache_control. Every
// other call site — chat, missions, files, research, agents, create —
// re-sent its whole system prompt at full input price on every single
// call. Chat is the highest-volume of them and carries a 7,510-character
// static prefix (persona + web-search instruction + AI_CONDUCT_EL +
// AI_QUALITY_CHECKLIST_EL), so every message paid full price for ~1,900
// tokens that had not changed in months.
//
// THE SIZE RULE IS THE WHOLE POINT. Anthropic will not cache a prefix
// shorter than a per-model minimum, and it does NOT report an error when
// you ask it to — cache_creation_input_tokens simply comes back 0. So a
// `cache_control` marker on a short prompt looks exactly like a working
// optimisation and does nothing at all. That failure mode is why this
// module refuses to place the marker below the minimum rather than
// leaving each call site to remember the number:
//
//   claude-sonnet-4-6  -> 1,024 tokens   (every model this app calls today)
//   claude-haiku-4-5   -> 4,096 tokens
//   claude-opus-4-5/6  -> 4,096 tokens
//   claude-opus-5      ->   512 tokens
//
// Note how NOT monotonic that is. Routing a feature "down" to Haiku to
// save money RAISES its caching minimum four-fold, so a prompt that
// caches happily on Sonnet silently stops caching on Haiku — and the
// saving from the cheaper model is partly given back as full-price input
// tokens on a prefix that used to be nearly free. Anything that changes
// a model must therefore re-check this, which is what
// modelCacheMinimumTokens exists for.
//
// DELIBERATELY NO ANTHROPIC IMPORT. Same reason lib/chat/memory-policy.ts
// exists separately from lib/chat/memory.ts: scripts/tests/load-ts.mjs
// cannot load a module that pulls in the SDK, and a rule this easy to get
// silently wrong belongs inside the build gate, not outside it. The
// returned shape is structurally identical to Anthropic.TextBlockParam,
// so call sites pass it straight to `system:` with no cast.

/** Structurally Anthropic.TextBlockParam — see the note above on why the
 *  SDK type is not imported here. */
export type SystemTextBlock = {
  type: "text";
  text: string;
  cache_control?: { type: "ephemeral" };
};

/**
 * Anthropic's minimum cacheable prefix, in tokens, per model.
 *
 * Source: platform.claude.com/docs/en/build-with-claude/prompt-caching,
 * "Cache limitations". Keyed by the same normalised ids
 * lib/billing/model-pricing.ts uses.
 */
export const MODEL_CACHE_MINIMUM_TOKENS: Record<string, number> = {
  "claude-sonnet-4-5": 1024,
  "claude-sonnet-4-6": 1024,
  "claude-sonnet-5": 1024,
  "claude-opus-4-5": 4096,
  "claude-opus-4-6": 4096,
  "claude-opus-4-7": 2048,
  "claude-opus-4-8": 1024,
  "claude-opus-5": 512,
  "claude-haiku-4-5": 4096,
  "claude-fable-5": 512,
  "claude-mythos-5": 512,
};

// An unknown model gets the LARGEST known minimum, not the smallest.
//
// Same safe-direction rule as FALLBACK_MODEL_PRICING in
// lib/billing/model-pricing.ts, for the same reason: guessing low here
// would place a marker that never caches, and the resulting "we enabled
// caching" claim would be false in a way nothing surfaces. Guessing high
// only means a prompt that could have cached does not — visible in the
// usage numbers, and recoverable by adding the model to the table.
export const FALLBACK_CACHE_MINIMUM_TOKENS = Math.max(
  ...Object.values(MODEL_CACHE_MINIMUM_TOKENS)
);

export function modelCacheMinimumTokens(model: string | undefined): number {
  if (!model) return FALLBACK_CACHE_MINIMUM_TOKENS;
  const trimmed = model.trim().toLowerCase();
  const withoutVariant = trimmed.replace(/\[[^\]]*\]$/, "");
  const withoutDate = withoutVariant.replace(/-\d{8}$/, "");
  return (
    MODEL_CACHE_MINIMUM_TOKENS[trimmed] ??
    MODEL_CACHE_MINIMUM_TOKENS[withoutVariant] ??
    MODEL_CACHE_MINIMUM_TOKENS[withoutDate] ??
    FALLBACK_CACHE_MINIMUM_TOKENS
  );
}

// The same 4-chars-per-token figure lib/billing/estimate.ts prices every
// pre-action estimate with, reused here on purpose so one constant governs
// both. It is calibrated for English prose and it UNDER-counts Greek,
// which is most of this app's prompt text — Greek needs more tokens per
// character than English, not fewer. That bias is in the safe direction
// for this specific decision: a prompt this function judges to be over the
// minimum is, in Greek, further over it than the arithmetic says. It would
// be the wrong direction for a charge, which is why this is only ever used
// to answer "is this worth a cache breakpoint", never to price anything.
const CHARS_PER_TOKEN = 4;

export function approximateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

/**
 * True when `staticPrefix` is long enough that Anthropic will actually
 * cache it on `model`.
 *
 * Exported so a build-gate test can assert the decision directly rather
 * than inferring it from the blocks that come out of buildCachedSystem.
 */
export function isWorthCaching(staticPrefix: string, model: string | undefined): boolean {
  return approximateTokens(staticPrefix) >= modelCacheMinimumTokens(model);
}

/**
 * Builds the `system` array with the cache breakpoint at the END OF THE
 * STATIC PREFIX — never at the end of the whole prompt.
 *
 * That placement is the entire difference between caching that works and
 * caching that reads as working. Anthropic writes a cache entry only at
 * the breakpoint, and the lookback finds only entries earlier requests
 * actually wrote. Put the marker on the last block and the per-request
 * tail (the user's memories, the entities their message happened to
 * mention, their AI Life Context) is inside the hashed prefix: every
 * request writes a brand-new entry, no request ever reads one, and the
 * only measurable effect is paying the 1.25x write premium forever. The
 * docs call this out by name as the common mistake, and it is the shape
 * this function exists to make unrepresentable.
 *
 * `staticPrefix + dynamicSuffix` is returned EXACTLY as the caller
 * assembled it — this function never rewrites, reorders or re-spaces
 * either half. The only thing it changes about the request is where the
 * block boundary and the marker sit, which is why it cannot alter what
 * the model is asked to do.
 *
 * An empty `dynamicSuffix` yields ONE block, not two: Anthropic rejects
 * empty text blocks, and an account with no memories, no mentioned
 * entities and no AI Life Context genuinely produces an empty tail.
 */
export function buildCachedSystem(params: {
  staticPrefix: string;
  dynamicSuffix?: string;
  model: string | undefined;
}): SystemTextBlock[] {
  const { staticPrefix, dynamicSuffix = "", model } = params;

  // Below the minimum the marker is not merely useless, it is misleading:
  // it would show up in a grep for cache_control as evidence this call
  // site is cached when Anthropic is ignoring it. Emit the prompt as a
  // single plain block instead, so "no marker" honestly means "not
  // cached here".
  if (!isWorthCaching(staticPrefix, model)) {
    const whole = staticPrefix + dynamicSuffix;
    return whole ? [{ type: "text", text: whole }] : [];
  }

  const blocks: SystemTextBlock[] = [
    { type: "text", text: staticPrefix, cache_control: { type: "ephemeral" } },
  ];
  if (dynamicSuffix) blocks.push({ type: "text", text: dynamicSuffix });
  return blocks;
}
