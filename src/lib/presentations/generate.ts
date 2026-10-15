import "server-only";
import { buildCachedSystem } from "@/lib/ai/cached-system";
import { runCompletion } from "@/lib/ai/providers/complete";
import { AI_TRUNCATED_STOP_REASON, type AiOutcome } from "@/lib/ai/providers/types";
import { CostAccumulator } from "@/lib/billing/cost-accumulator";
import { deckCharts, parseDeckToolInput, type Deck, type ImageSource, type SlideChart } from "@/lib/presentations/deck";
import {
  PRESENTATION_MAX_TOKENS,
  PRESENTATION_MODEL,
  WRITE_DECK_TOOL,
  buildDeckSystemPrompt,
  buildDeckUserMessage,
  buildDeckEditUserMessage,
} from "@/lib/presentations/prompt";

/**
 * ONE FORCED-TOOL CALL THAT WRITES A DECK.
 *
 * The same shape as Create Studio's detector and the agent builder: the
 * model is handed a tool whose schema IS the deck, toolChoice forces it,
 * and what comes back is parsed by lib/presentations/deck.ts, which
 * clamps every field. No streaming — a deck is produced whole or not at
 * all, which is what lets the route release the hold in full when the
 * person presses Stop.
 *
 * WHAT THE MODEL IS NOT ASKED TO DO. It does not pick photos — it writes
 * an `imageQuery` for a slide that would benefit from one, and the route
 * decides whether that becomes an Unsplash search, one of the person's
 * own uploads, or nothing (lib/presentations/images.ts). It does not
 * decide the language: that is resolved from the description's own
 * script (lib/text/resolve-language.ts) and told to it, so a Greek brief
 * yields a Greek deck whatever the interface is set to.
 *
 * The prompt, the tool schema and the user turn live in
 * lib/presentations/prompt.ts, which the build gate loads; this file is
 * the part that makes the call.
 *
 * THROUGH THE ROUTER, NOT THE SDK (step 1.4). No api key travels in:
 * which provider serves a deck is a configuration question
 * (lib/ai/providers/registry.ts), and a provider with no key is simply
 * not in the chain — with only ANTHROPIC_API_KEY set, as production has
 * today, both calls are served exactly as they were.
 */

export type GenerateDeckResult =
  | { ok: true; deck: Deck }
  | { ok: false; kind: "aborted" | "no_tool_use" | "unusable" | "provider"; detail: string };

/**
 * Makes the call and records its usage on the caller's accumulator.
 *
 * The accumulator is recorded BEFORE the parse, so a response that came
 * back malformed is still paid for — the tokens were spent — and the
 * route settles it rather than releasing. An abort (the Stop button) and
 * a provider failure record nothing, because nothing was delivered.
 */
export async function generateDeck(params: {
  description: string;
  slideCount: number;
  locale: string;
  imageSource: ImageSource;
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
  /** This account's own records, rendered by lib/ai/workspace-context.ts.
   *  Passed in rather than loaded here for the reason memoryBlock is:
   *  this module has no Supabase client and must not grow one.
   *
   *  IN THE USER TURN, NOT THE CACHED SYSTEM BLOCK — the records differ
   *  between two requests from the same person, so behind the cache
   *  breakpoint they would invalidate the cached prefix every call. */
  businessContext?: string;
  /** Charts computed from the person's file (lib/presentations/deck-charts.ts),
   *  or none. Shown to the model by number; the number it answers with is
   *  resolved to the chart itself by the parser. */
  charts?: readonly SlideChart[];
  costs: CostAccumulator;
  /** For the provider log only. Never sent to any provider. */
  userId?: string;
  signal?: AbortSignal;
}): Promise<GenerateDeckResult> {
  return runDeckCall({
    ...params,
    userMessage: buildDeckUserMessage(
      params.description,
      params.slideCount,
      params.locale,
      params.businessContext ?? "",
      params.charts ?? []
    ),
    fallbackTitle: params.description.slice(0, 60),
    charts: params.charts ?? [],
  });
}

/**
 * "MAKE IT MORE FORMAL" — the same call, a different message.
 *
 * WHY THIS EXISTS AT ALL. Measured 2026-09-27: of the six rows the
 * sidebar draws under Make, exactly ONE could be changed by saying so
 * (the website builder's editText -> api/websites/edit). The other five
 * generated and stopped, so a deck that came back almost right was a
 * deck you regenerated from scratch and paid for twice.
 *
 * Everything that is not the message is shared with generateDeck by
 * construction rather than by copying: the same model, the same cached
 * system prompt, the same forced tool, the same truncation and parse
 * rules. A second copy of that call is a second thing to keep in step
 * with the tool schema.
 */
export async function editDeck(params: {
  deck: Deck;
  instruction: string;
  locale: string;
  imageSource: ImageSource;
  memoryBlock?: string;
  costs: CostAccumulator;
  /** For the provider log only. Never sent to any provider. */
  userId?: string;
  signal?: AbortSignal;
}): Promise<GenerateDeckResult> {
  return runDeckCall({
    ...params,
    userMessage: buildDeckEditUserMessage(params.deck, params.instruction, params.locale),
    // THE TITLE IT ALREADY HAS. parseDeckToolInput falls back to this
    // when the model returns a deck with no title; for an edit the
    // honest fallback is what the deck was called, not a slice of the
    // instruction — "make it more formal" is not a title.
    fallbackTitle: params.deck.title,
    // THE CHARTS IT ALREADY HAS, numbered as the message shows them.
    charts: deckCharts(params.deck),
  });
}

async function runDeckCall(params: {
  userMessage: string;
  fallbackTitle: string;
  charts: readonly SlideChart[];
  locale: string;
  imageSource: ImageSource;
  memoryBlock?: string;
  costs: CostAccumulator;
  userId?: string;
  signal?: AbortSignal;
}): Promise<GenerateDeckResult> {
  // THIS FUNCTION DOES NOT THROW, AND THAT IS A MONEY PROPERTY, not a
  // style — see lib/posts/generate.ts for the whole reasoning. The
  // route holds credits before it calls and releases them on
  // `ok: false`; its outer catch returns 500 without releasing.
  let outcome: AiOutcome;
  try {
    outcome = await runCompletion(
      {
        purpose: "create",
        model: PRESENTATION_MODEL,
        maxTokens: PRESENTATION_MAX_TOKENS,
        system: buildCachedSystem({
          staticPrefix: buildDeckSystemPrompt(),
          perUserBlock: params.memoryBlock ?? "",
          model: PRESENTATION_MODEL,
        }),
        messages: [{ role: "user", content: params.userMessage }],
        tools: [WRITE_DECK_TOOL],
        // The tool's schema IS the deck, so a model left to decide for
        // itself writes the slides in prose and the person pays for a
        // reply this function has nothing to read.
        toolChoice: { type: "tool", name: "write_deck" },
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

  // A SEVERED DECK IS NOT A SHORT DECK. When the output ceiling cuts the
  // tool call, whatever partial input survived would parse as a deck with
  // fewer slides than were asked for — and be shown as one. The ceiling
  // is sized well above the twenty-slide maximum (see prompt.ts), so this
  // is rare, and when it happens the honest answer is "unusable": the
  // tokens were spent and the route settles them, as it does for any
  // answer that is not a deck.
  //
  // Each provider has its own word for it and the adapters translate
  // all four into this one before it gets here (ΛΘ-18), so the rule
  // holds whoever served the call.
  if (outcome.stopReason === AI_TRUNCATED_STOP_REASON) {
    return { ok: false, kind: "unusable", detail: "truncated at the output ceiling" };
  }

  const toolUse = outcome.toolCalls.find((call) => call.name === "write_deck");
  if (!toolUse) return { ok: false, kind: "no_tool_use", detail: "the model returned no deck" };

  const verdict = parseDeckToolInput(toolUse.input, { locale: params.locale, imageSource: params.imageSource, fallbackTitle: params.fallbackTitle }, { charts: params.charts });
  if (!verdict.ok) return { ok: false, kind: "unusable", detail: verdict.reason };
  return { ok: true, deck: verdict.deck };
}
